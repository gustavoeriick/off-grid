// Liga o projeto ao cálculo: para cada enlace, baixa o relevo do caminho, monta o corte do terreno e calcula o resultado.
// Este arquivo é do coordenador. O mapa e os painéis só leem daqui: `situacaoDoEnlace`, `altitudeDoPonto` e `assinarCalculo`.
// Privacidade: o relevo só pede blocos de mapa pelo endereço; nenhuma coordenada de ponto sai do navegador.

import { criarRelevo, type Relevo } from './dados/relevo';
import { assinarLora, estadoLora } from './estado';
import { PONTO_PADRAO } from './estado';
import {
  avaliarCandidato, avisosDaRegra, calcularEnlace, candidatosARepetidor, distanciaKm, escolherSugestoes, MARGEM_DA_GRADE_FRACAO,
  MARGEM_MINIMA_DA_GRADE_KM, melhorias, melhorRota, MODOS, montarPerfil, pontoNoCaminho, REGIOES,
  type Aresta, type ResultadoDaRota, type SugestaoDeRepetidor,
} from './nucleo';
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
const altitudes = new Map<string, { assinatura: string; altM: number | null; erro: boolean }>();
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
  let erro = false;
  try {
    await relevo.carregar([ponto]);
    altM = relevo.altitudeEm(ponto);
  } catch {
    erro = true;
  }
  if (altitudes.get(id)?.assinatura !== assinatura) return;
  altitudes.set(id, { assinatura, altM, erro });
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
    altitudes.set(p.id, { assinatura, altM: null, erro: false });
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

/** Como está a altitude do ponto: ainda baixando o relevo, pronta, ou o relevo não pôde ser baixado. */
export function situacaoDaAltitude(id: string): 'baixando' | 'pronta' | 'erro' {
  const a = altitudes.get(id);
  if (!a || (a.altM === null && !a.erro)) return 'baixando';
  return a.erro ? 'erro' : 'pronta';
}

/** Refaz o que deu erro: enlaces sem resultado e altitudes que não puderam ser baixadas. Para o botão "Tentar de novo". */
export function tentarDeNovo(): void {
  for (const [chave, s] of [...situacoes]) if (s.situacao.estado === 'erro') situacoes.delete(chave);
  for (const [id, a] of [...altitudes]) if (a.erro) altitudes.delete(id);
  recalcular();
}

// ---------------------------------------------------------------- Rotas e sugestão de repetidor (fase L3)

export interface RotaEntreCasas {
  de: string;
  para: string;
  /** Nulo enquanto algum enlace do projeto ainda está sendo calculado. */
  resultado: ResultadoDaRota | null;
}

/** Enlaces com resultado pronto, como arestas para a busca de rota. */
function arestasProntas(): { arestas: Aresta[]; calculando: boolean } {
  const arestas: Aresta[] = [];
  let calculando = false;
  for (const e of estadoLora.projeto.enlaces) {
    const s = situacaoDoEnlace(e.de, e.para);
    if (s?.estado === 'pronto') arestas.push({ de: e.de, para: e.para, folgaDb: s.resultado.conta.folgaDb, veredito: s.resultado.veredito });
    else if (s?.estado === 'calculando') calculando = true;
  }
  return { arestas, calculando };
}

/** Melhor rota entre dois pontos, pelos enlaces do projeto. Nulo enquanto há enlace sendo calculado. */
export function rotaEntre(de: string, para: string): ResultadoDaRota | null {
  const { arestas, calculando } = arestasProntas();
  if (calculando) return null;
  const p = estadoLora.projeto;
  return melhorRota(p.pontos.map((x) => x.id), arestas, de, para, p.limiteDeSaltos);
}

/** A rota de cada par de pontos do tipo casa, na ordem em que aparecem no projeto. */
export function rotasEntreCasas(): RotaEntreCasas[] {
  const casas = estadoLora.projeto.pontos.filter((p) => p.tipo === 'casa');
  const lista: RotaEntreCasas[] = [];
  for (let i = 0; i < casas.length; i += 1) {
    for (let j = i + 1; j < casas.length; j += 1) lista.push({ de: casas[i]!.id, para: casas[j]!.id, resultado: rotaEntre(casas[i]!.id, casas[j]!.id) });
  }
  return lista;
}

/** Pontos espalhados pelo quadrado em volta do caminho, para saber quais blocos de relevo a busca vai precisar. */
function pontosDaRegiao(a: Coordenada, b: Coordenada): Coordenada[] {
  const d = distanciaKm(a, b);
  const margem = Math.max(MARGEM_MINIMA_DA_GRADE_KM, MARGEM_DA_GRADE_FRACAO * d);
  const meio = pontoNoCaminho(a, b, 0.5);
  // Um quadrado que contém o retângulo da busca em qualquer direção, com 2 km de sobra.
  const ladoKm = d / 2 + margem + 2;
  const dLat = ladoKm / 111;
  const dLon = ladoKm / (111 * Math.max(0.2, Math.cos((meio.lat * Math.PI) / 180)));
  const n = Math.max(2, Math.ceil((2 * ladoKm) / 5));
  const pontos: Coordenada[] = [];
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) pontos.push({ lat: meio.lat - dLat + (2 * dLat * i) / n, lon: meio.lon - dLon + (2 * dLon * j) / n });
  }
  return pontos;
}

/**
 * Procura até cinco lugares para um repetidor entre dois pontos do projeto (especificação, seção 4.9).
 * Baixa o relevo da região, avalia os candidatos em pedaços para não travar a tela e avisa o andamento, de 0 a 1.
 * Lança erro com mensagem clara se os pontos não existem ou se o relevo não pôde ser baixado.
 */
export async function sugerirRepetidor(de: string, para: string, andamento?: (fracao: number) => void): Promise<SugestaoDeRepetidor[]> {
  const projeto = estadoLora.projeto;
  const a = projeto.pontos.find((p) => p.id === de);
  const b = projeto.pontos.find((p) => p.id === para);
  if (!a || !b) throw new Error('Escolha dois pontos do mapa para procurar um lugar de repetidor.');
  andamento?.(0);
  await relevo.carregar(pontosDaRegiao(a, b));
  const ambiente = ambienteDoProjeto(projeto);
  const candidatos = candidatosARepetidor(a, b, relevo.altitudeEm);
  const avaliados: SugestaoDeRepetidor[] = [];
  for (let i = 0; i < candidatos.length; i += 1) {
    avaliados.push(avaliarCandidato(a, b, candidatos[i]!, PONTO_PADRAO, relevo.altitudeEm, ambiente));
    if (i % 20 === 19) {
      andamento?.((i + 1) / candidatos.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  andamento?.(1);
  return escolherSugestoes(avaliados);
}

assinarLora('projeto', recalcular);
recalcular();
