// Busca no catálogo solar (tarefa 9.1). Parte pura: sem DOM, roda em Node.
// O painel (catalogo.ts) só chama estas funções e desenha o resultado.

import type { GrupoDoCatalogo } from '../catalogo';
import type { Item } from '../catalogo/tipos';

/** Minúsculas, sem acento, vírgula decimal e espaços repetidos viram um só. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tira o espaço entre número e unidade ("550 w" vira "550w"), para número colado ou separado casarem igual. */
function colarUnidade(normalizado: string): string {
  return normalizado.replace(/(\d)\s+(?=[a-z])/g, '$1');
}

/** Palavras da consulta, já normalizadas. Vazio quando a consulta não tem nada para procurar. */
export function palavrasDaBusca(consulta: string): string[] {
  const n = colarUnidade(normalizar(consulta));
  return n === '' ? [] : n.split(' ');
}

/** A palavra aparece no texto? Palavra que começa em dígito não casa no meio de outro número ("24v" não casa "124v"). */
function contem(texto: string, palavra: string): boolean {
  const comecaEmNumero = /^\d/.test(palavra);
  let i = texto.indexOf(palavra);
  while (i !== -1) {
    if (!comecaEmNumero || i === 0 || !/[\d,]/.test(texto[i - 1])) return true;
    i = texto.indexOf(palavra, i + 1);
  }
  return false;
}

/** O texto (qualquer formato) contém todas as palavras, em qualquer ordem? Sem palavras, nada casa. */
export function casaTexto(texto: string, palavras: readonly string[]): boolean {
  if (palavras.length === 0) return false;
  const n = normalizar(texto);
  const colado = colarUnidade(n);
  return palavras.every((p) => contem(colado, p) || contem(n, p));
}

function numero(valor: number, unidade: string): string {
  return `${String(valor).replace('.', ',')} ${unidade}`;
}

/** Campos numéricos com unidade inequívoca pelo nome do campo, como texto ("550 W", "100 Ah"). */
export function numerosDoItem(item: Item): string[] {
  switch (item.categoria) {
    case 'placa':
      return [numero(item.wp, 'W')];
    case 'bateria':
      return [numero(item.ah, 'Ah'), numero(item.tensao, 'V')];
    case 'inversor':
      return [numero(item.potenciaW, 'W'), numero(item.tensaoBateria, 'V'), numero(item.saidaV, 'V')];
    case 'protecao':
      return [...(item.correnteA > 0 ? [numero(item.correnteA, 'A')] : []), numero(item.tensaoMaxV, 'V')];
    case 'cabo':
      return [numero(item.secao, 'mm2')];
    case 'aparelho':
      return [numero(item.potenciaW, 'W')];
    default:
      return [];
  }
}

/** Texto onde se procura um modelo: tipo, nome do modelo, detalhe, números e aba. */
export function textoDoModelo(g: GrupoDoCatalogo, item: Item, rotuloDaAba: string): string {
  return [g.nome, item.nome, item.detalhe, ...numerosDoItem(item), rotuloDaAba].join(' ');
}

/** Texto do tipo em si (sem um modelo específico): nome, detalhe da referência e aba. */
export function textoDoGrupo(g: GrupoDoCatalogo, rotuloDaAba: string): string {
  return [g.nome, g.referencia.detalhe, ...numerosDoItem(g.referencia), rotuloDaAba].join(' ');
}

export interface Achado {
  grupo: GrupoDoCatalogo;
  /** Primeiro modelo que casou, quando o cartão deve apontar para ele em vez do modelo de sempre. Nulo: o cartão fica como está. */
  modelo: Item | null;
}

/**
 * Casa um tipo com a consulta. Devolve nulo se nem o tipo nem algum modelo (da linha em vista) casa.
 * `modeloAtual` é o que o cartão arrastaria sem a busca: se ele mesmo casa, o cartão não muda.
 */
export function casarGrupo(
  g: GrupoDoCatalogo,
  palavras: readonly string[],
  rotuloDaAba: string,
  naLinha: (item: Item) => boolean,
  modeloAtual: Item,
): Achado | null {
  const naVista = g.itens.filter(naLinha);
  if (naVista.length === 0) return null;
  if (casaTexto(textoDoGrupo(g, rotuloDaAba), palavras)) return { grupo: g, modelo: null };
  const casaram = naVista.filter((i) => casaTexto(textoDoModelo(g, i, rotuloDaAba), palavras));
  if (casaram.length === 0) return null;
  if (casaram.length === naVista.length || casaram.some((i) => i.id === modeloAtual.id)) return { grupo: g, modelo: null };
  return { grupo: g, modelo: casaram[0] };
}
