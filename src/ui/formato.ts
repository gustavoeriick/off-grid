// Auxiliares de texto e de DOM dos painéis. Números com vírgula decimal; nada de innerHTML com texto de dados.

import type { Item } from '../catalogo/tipos';

/** Número no padrão brasileiro, com `casas` casas decimais. */
export function num(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Dinheiro: "R$ 8.668,19". */
export function brl(n: number): string {
  return `R$ ${num(n, 2)}`;
}

/** "2026-05-03" vira "03/05/2026". */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

type Atributos = Record<string, string | boolean | undefined> | null;
export type Filho = Node | string | null | false | undefined;

/** Cria um elemento. Textos entram como nós de texto, nunca como HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, atributos: Atributos, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === undefined || v === false) continue;
    e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos) if (f !== null && f !== false && f !== undefined) e.append(f);
  return e;
}

export function el<T extends HTMLElement>(seletor: string): T {
  const e = document.querySelector<T>(seletor);
  if (!e) throw new Error(`Elemento não encontrado: ${seletor}`);
  return e;
}

/**
 * Troca o conteúdo de um painel só se o HTML novo for diferente do que já está lá.
 * Assim um clique ou uma lista aberta não se perdem quando o estado avisa sem ter mudado nada que se veja.
 */
export function substituir(raiz: HTMLElement, filhos: Node[]): void {
  const molde = document.createElement('div');
  molde.append(...filhos);
  const assinatura = molde.innerHTML;
  if (raiz.dataset.assinatura === assinatura) return;
  raiz.dataset.assinatura = assinatura;
  raiz.replaceChildren(...molde.childNodes);
}

/** Preço do item com a faixa, a marca "valor típico", a data e o link do anúncio. Nulo quando o preço é zero (aparelhos da casa). */
export function blocoDePreco(item: Item): HTMLElement | null {
  if (item.preco === 0) return null;
  const sufixo = item.categoria === 'cabo' ? ' por metro' : '';
  const faixa = item.precoMax !== undefined && item.precoMax > item.preco ? `${brl(item.preco)} a ${brl(item.precoMax)}` : brl(item.preco);
  return h(
    'p',
    { class: 'preco' },
    h('strong', null, faixa + sufixo),
    item.tipico?.includes('preco') ? h('span', { class: 'marca-tipico', title: 'Preço estimado: não veio de um anúncio' }, 'valor típico') : null,
    item.coletadoEm ? h('span', { class: 'data-preco' }, `em ${dataBr(item.coletadoEm)}`) : null,
    item.url ? h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, 'ver anúncio') : null,
  );
}

/** Avisos do item: ressalva do anúncio e desaconselhamento do consultor. */
export function avisosDoItem(item: Item): HTMLElement[] {
  const lista: HTMLElement[] = [];
  if (item.naoRecomendado) lista.push(h('p', { class: 'aviso-item nao-recomendado' }, `Não recomendado: ${item.naoRecomendado}`));
  if (item.obs) lista.push(h('p', { class: 'aviso-item' }, item.obs));
  return lista;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Mensagem curta no pé da tela. Erros ficam mais tempo. */
export function mostrarMensagem(texto: string, erro = false): void {
  let caixa = document.querySelector<HTMLElement>('#mensagem');
  if (!caixa) {
    caixa = h('div', { id: 'mensagem', role: 'status' });
    document.body.append(caixa);
  }
  caixa.textContent = texto;
  caixa.className = erro ? 'erro' : '';
  caixa.hidden = false;
  if (temporizador) clearTimeout(temporizador);
  const ocultar = caixa;
  temporizador = setTimeout(() => (ocultar.hidden = true), erro ? 8000 : 3500);
}
