// Liga o projeto ao cálculo: para cada enlace, baixa o relevo do caminho, monta o corte do terreno e calcula o resultado.
// Este arquivo é do coordenador. O mapa e os painéis só leem daqui: `situacaoDoEnlace`, `altitudeDoPonto` e `assinarCalculo`.
// Privacidade: o relevo só pede blocos de mapa pelo endereço; nenhuma coordenada de ponto sai do navegador.

import { criarRelevo, type Relevo } from './dados/relevo';
import { assinarLora, estadoLora } from './estado';
import { avisosDaRegra, calcularEnlace, distanciaKm, melhorias, MODOS, montarPerfil, pontoNoCaminho, REGIOES } from './nucleo';
import type { Ambiente, Coordenada, Melhoria, Modo, Perfil, PontoLora, ProjetoLora, ResultadoDoEnlace } from './nucleo/tipos';

export type SituacaoDoEnlace =
  | { estado: 'calculando' }
  | { estado: 'erro'; mensagem: string }
  | {
      estado: 'pronto';
      /** O ponto de onde o corte do terreno começa (`de`) e onde termina (`para`). */
      de: PontoLora;
      para: PontoLora;
      perfil: Perfil;
      resultado: ResultadoDoEnlace;
      melhorias: Melhoria[];
      /** Avisos de regra da Anatel dos dois rádios, sem repetição. */
      avisos: string[];
    };

let relevo: Relevo = criarRelevo();
const situacoes = new Map<string, { assinatura: string; situacao: SituacaoDoEnlace }>();
const altitudes = new Map<string, { assinatura: string; altM: number | null }>();
const ouvintes = new Set<() => void>();

/** Troca a fonte do relevo. Para os testes e para a verificação, que usam um relevo feito à mão. */
export function definirRelevo(novo: Relevo): void {
  relevo = novo;
  situacoes.clear();
  altitudes.clear();
  recalcular();
}

export function atribuicaoDoRelevo(): string {
  return relevo.atribuicao;
}

/** Avisa quando o resultado de algum enlace ou a altitude de algum ponto muda. */
export function assinarCalculo(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(): void {
  for (const fn of [...ouvintes]) fn();
}

const chaveDoEnlace = (de: string, para: string): string => (de < para ? `${de}|${para}` : `${para}|${de}`);

export function modoDoProjeto(projeto: ProjetoLora): Modo {
  return MODOS.find((m) => m.id === projeto.modo) ?? MODOS.find((m) => m.id === 'long-fast') ?? MODOS[0]!;
}

export function ambienteDoProjeto(projeto: ProjetoLora): Ambiente {
  return { frequenciaMHz: REGIOES[projeto.regiao].frequenciaMHz, modo: modoDoProjeto(projeto), margemDoAmbienteDb: projeto.margemDoAmbienteDb };
}

/** Pontos do caminho, um a cada 1 km no máximo: bastam para saber quais blocos de relevo pedir. */
function pontosParaOsBlocos(a: Coordenada, b: Coordenada): Coordenada[] {
  const n = Math.max(1, Math.ceil(distanciaKm(a, b)));
  return Array.from({ length: n + 1 }, (_, i) => pontoNoCaminho(a, b, i / n));
}

const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : 'Não foi possível calcular este enlace.');

async function calcular(chave: string, assinatura: string, de: PontoLora, para: PontoLora, projeto: ProjetoLora): Promise<void> {
  let situacao: SituacaoDoEnlace;
  try {
    await relevo.carregar(pontosParaOsBlocos(de, para));
    const perfil = montarPerfil(de, para, relevo.altitudeEm);
    const ambiente = ambienteDoProjeto(projeto);
    situacao = {
      estado: 'pronto',
      de,
      para,
      perfil,
      resultado: calcularEnlace(de, para, perfil, ambiente),
      melhorias: melhorias(de, para, [de.nome, para.nome], perfil, ambiente),
      avisos: [...new Set([...avisosDaRegra(de, ambiente.modo), ...avisosDaRegra(para, ambiente.modo)])],
    };
  } catch (erro) {
    situacao = { estado: 'erro', mensagem: mensagemDe(erro) };
  }
  // O projeto pode ter mudado enquanto o relevo baixava: só vale o resultado da assinatura atual.
  if (situacoes.get(chave)?.assinatura !== assinatura) return;
  situacoes.set(chave, { assinatura, situacao });
  avisar();
}

async function medirAltitude(id: string, assinatura: string, ponto: Coordenada): Promise<void> {
  let altM: number | null = null;
  try {
    await relevo.carregar([ponto]);
    altM = relevo.altitudeEm(ponto);
  } catch {
    altM = null;
  }
  if (altitudes.get(id)?.assinatura !== assinatura) return;
  altitudes.set(id, { assinatura, altM });
  avisar();
}

/** Refaz o que mudou: enlaces cujos pontos, rádios ou configuração mudaram, e a altitude dos pontos que se moveram. */
function recalcular(): void {
  const projeto = estadoLora.projeto;
  const pontos = new Map(projeto.pontos.map((p) => [p.id, p]));
  const config = `${projeto.regiao}|${projeto.modo}|${projeto.margemDoAmbienteDb}`;
  const vivos = new Set<string>();
  let mudou = false;
  for (const e of projeto.enlaces) {
    const de = pontos.get(e.de);
    const para = pontos.get(e.para);
    if (!de || !para) continue;
    const chave = chaveDoEnlace(e.de, e.para);
    vivos.add(chave);
    const assinatura = `${config}|${JSON.stringify([de, para])}`;
    if (situacoes.get(chave)?.assinatura === assinatura) continue;
    situacoes.set(chave, { assinatura, situacao: { estado: 'calculando' } });
    mudou = true;
    void calcular(chave, assinatura, { ...de }, { ...para }, projeto);
  }
  for (const chave of [...situacoes.keys()]) {
    if (!vivos.has(chave)) {
      situacoes.delete(chave);
      mudou = true;
    }
  }
  for (const p of projeto.pontos) {
    const assinatura = `${p.lat}|${p.lon}`;
    if (altitudes.get(p.id)?.assinatura === assinatura) continue;
    altitudes.set(p.id, { assinatura, altM: null });
    void medirAltitude(p.id, assinatura, { lat: p.lat, lon: p.lon });
  }
  for (const id of [...altitudes.keys()]) if (!pontos.has(id)) altitudes.delete(id);
  if (mudou) avisar();
}

/** Resultado do enlace entre dois pontos, na ordem em que o projeto o guarda. Nulo se os pontos não estão ligados. */
export function situacaoDoEnlace(de: string, para: string): SituacaoDoEnlace | null {
  return situacoes.get(chaveDoEnlace(de, para))?.situacao ?? null;
}

/** Altitude do terreno no ponto, em metros. Nulo enquanto o relevo não chegou ou se não deu para baixar. */
export function altitudeDoPonto(id: string): number | null {
  return altitudes.get(id)?.altM ?? null;
}

assinarLora('projeto', recalcular);
recalcular();
