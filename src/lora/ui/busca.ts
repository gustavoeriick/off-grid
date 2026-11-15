// Estado de tela da fase L3: a busca de lugar para repetidor (andamento, sugestões, destaque) e a rota destacada no mapa.
// Não é parte do projeto: nada daqui é gravado nem entra no desfazer. O mapa e os painéis leem daqui e assinam as mudanças.
// Especificação: docs/especificacao/lora.md, seção 4.9.

import { rotaEntre, sugerirRepetidor } from '../calculo';
import { acoesLora, assinarLora, estadoLora } from '../estado';
import type { SugestaoDeRepetidor } from '../nucleo';
import { mostrarMensagem } from './dom';

export type Busca =
  | { estado: 'parada' }
  /** `fracao` vai de 0 a 1; em 0 o relevo da região ainda está sendo baixado. */
  | { estado: 'buscando'; de: string; para: string; fracao: number }
  | { estado: 'pronta'; de: string; para: string; sugestoes: SugestaoDeRepetidor[] }
  | { estado: 'erro'; de: string; para: string; mensagem: string };

let busca: Busca = { estado: 'parada' };
/** Cada busca tem um número; o resultado de uma busca que não é mais a atual é ignorado. */
let vez = 0;
/** O que não pode mudar enquanto as sugestões estão na tela: os dois pontos e a configuração do rádio. */
let assinatura = '';
let destaque: { indice: number; origem: 'mapa' | 'lista' } | null = null;
let rotaDestacada: { de: string; para: string } | null = null;

const ouvintes = new Set<() => void>();

/** Avisa quando a busca, o destaque de uma sugestão ou a rota destacada mudam. */
export function assinarBusca(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(): void {
  for (const fn of [...ouvintes]) fn();
}

export const buscaAtual = (): Busca => busca;

/** A sugestão em destaque (ponteiro em cima do item da lista ou do marcador do mapa) e de onde veio o destaque. */
export const sugestaoEmDestaque = (): { indice: number; origem: 'mapa' | 'lista' } | null => destaque;

function assinaturaDe(de: string, para: string): string | null {
  const p = estadoLora.projeto;
  const a = p.pontos.find((x) => x.id === de);
  const b = p.pontos.find((x) => x.id === para);
  if (!a || !b) return null;
  // O nome e o tipo do ponto não mudam a conta; a posição e o rádio mudam.
  const radio = (x: typeof a): number[] => [x.lat, x.lon, x.alturaDaAntenaM, x.potenciaDbm, x.ganhoDbi, x.perdaNoCaboDb];
  return JSON.stringify([p.regiao, p.modo, p.margemDoAmbienteDb, radio(a), radio(b)]);
}

class BuscaCancelada extends Error {}

/** Procura lugares para um repetidor entre dois pontos do projeto. Uma busca nova toma o lugar da anterior. */
export function procurarRepetidor(de: string, para: string): void {
  const esta = (vez += 1);
  const nova = assinaturaDe(de, para);
  if (nova === null || de === para) {
    mostrarMensagem('Escolha dois pontos diferentes do mapa para procurar um lugar de repetidor.', true);
    return;
  }
  assinatura = nova;
  destaque = null;
  busca = { estado: 'buscando', de, para, fracao: 0 };
  avisar();
  sugerirRepetidor(de, para, (fracao) => {
    // Busca cancelada ou vencida: o erro interrompe a conta, que não tem mais para quem entregar.
    if (esta !== vez) throw new BuscaCancelada();
    if (busca.estado === 'buscando' && fracao !== busca.fracao) {
      busca = { ...busca, fracao };
      avisar();
    }
  }).then(
    (sugestoes) => {
      if (esta !== vez) return;
      busca = { estado: 'pronta', de, para, sugestoes };
      avisar();
    },
    (erro: unknown) => {
      if (esta !== vez || erro instanceof BuscaCancelada) return;
      busca = { estado: 'erro', de, para, mensagem: erro instanceof Error ? erro.message : 'Não foi possível procurar lugares para o repetidor.' };
      avisar();
    },
  );
}

/** Cancela a busca em andamento e apaga as sugestões da tela. */
export function fecharBusca(): void {
  vez += 1;
  if (busca.estado === 'parada' && destaque === null) return;
  busca = { estado: 'parada' };
  destaque = null;
  avisar();
}

export function destacarSugestao(indice: number | null, origem: 'mapa' | 'lista' = 'lista'): void {
  if ((destaque?.indice ?? null) === indice) return;
  destaque = indice === null ? null : { indice, origem };
  avisar();
}

/**
 * Cria um repetidor no lugar da sugestão, liga às duas pontas e apaga as sugestões. Se as duas pontas já estavam ligadas
 * entre si, esse enlace fica. Devolve o `id` do repetidor, ou nulo se a sugestão não existe mais.
 *
 * Desfazer: hoje são três passos (o ponto e cada enlace), porque o estado não tem uma ação que faça os três de uma vez.
 * Quando o coordenador criar essa ação em `estado.ts`, é só trocar as três chamadas abaixo por ela.
 */
export function porRepetidorNaSugestao(indice: number): string | null {
  if (busca.estado !== 'pronta') return null;
  const s = busca.sugestoes[indice];
  const { de, para } = busca;
  if (!s) return null;
  const nome = (id: string): string => estadoLora.projeto.pontos.find((p) => p.id === id)?.nome ?? '?';
  // Um passo só de desfazer. Cada enlace sai da ponta para o repetidor, no mesmo sentido em que a busca fez a conta:
  // os números ficam iguais aos da sugestão.
  const id = acoesLora.porRepetidor(s.lat, s.lon, de, para);
  if (id === null) return null;
  fecharBusca();
  acoesLora.selecionar(null);
  mostrarMensagem(`"${nome(id)}" foi posto no mapa e ligado a ${nome(de)} e a ${nome(para)}. Ctrl+Z desfaz.`);
  return id;
}

// ---------------------------------------------------------------- Rota destacada

export const rotaEmDestaque = (): { de: string; para: string } | null => rotaDestacada;

/** Destaca no mapa os trechos da rota entre duas casas. Nulo tira o destaque. */
export function destacarRota(par: { de: string; para: string } | null): void {
  if (par === null && rotaDestacada === null) return;
  rotaDestacada = par;
  avisar();
}

/** Os trechos (enlaces) e os pontos da rota destacada, como estão agora no cálculo. Vazio se não há rota. */
export function trechosDaRotaEmDestaque(): { trechos: { de: string; para: string }[]; pontos: string[] } {
  if (!rotaDestacada) return { trechos: [], pontos: [] };
  const r = rotaEntre(rotaDestacada.de, rotaDestacada.para);
  if (!r?.rota) return { trechos: [], pontos: [] };
  return { trechos: r.rota.trechos.map((t) => ({ de: t.de, para: t.para })), pontos: r.rota.pontos };
}

// ---------------------------------------------------------------- O que apaga as sugestões e o destaque

const projetoAberto = (): string | null => acoesLora.listarProjetos().find((p) => p.atual)?.id ?? null;
let idDoProjeto = projetoAberto();

assinarLora('projeto', () => {
  // As sugestões valem para os dois pontos como estavam: se um deles mudou de lugar, de rádio ou sumiu, deixam de valer.
  if (busca.estado !== 'parada' && assinaturaDe(busca.de, busca.para) !== assinatura) fecharBusca();
  if (rotaDestacada) {
    const pontos = estadoLora.projeto.pontos;
    if (!pontos.some((p) => p.id === rotaDestacada!.de) || !pontos.some((p) => p.id === rotaDestacada!.para)) destacarRota(null);
  }
});

assinarLora('projetos', () => {
  const id = projetoAberto();
  if (id === idDoProjeto) return;
  idDoProjeto = id;
  fecharBusca();
  destacarRota(null);
});

// Selecionar um ponto ou um enlace troca o painel do resumo, onde fica a lista de rotas: o destaque sai junto.
assinarLora('selecao', () => {
  if (estadoLora.selecao !== null) destacarRota(null);
});
