// Painel Catálogo (coluna esquerda). Tarefa 2.2, parte de interface.
// O arraste em si é da cena: aqui o cartão só avisa na `window` que o botão foi apertado.

import { CATALOGO } from '../catalogo';
import type { Categoria, Item, Linha } from '../catalogo/tipos';
import { avisosDoItem, blocoDePreco, el, h } from './formato';

interface Aba {
  id: string;
  rotulo: string;
  categorias: Categoria[];
}

const ABAS: Aba[] = [
  { id: 'placas', rotulo: 'Placas', categorias: ['placa'] },
  { id: 'baterias', rotulo: 'Baterias', categorias: ['bateria'] },
  { id: 'inversores', rotulo: 'Inversores', categorias: ['inversor'] },
  { id: 'controladores', rotulo: 'Controladores', categorias: ['controlador'] },
  { id: 'protecoes', rotulo: 'Proteções', categorias: ['protecao'] },
  { id: 'aparelhos', rotulo: 'Aparelhos', categorias: ['aparelho', 'rede'] },
  { id: 'instalacao', rotulo: 'Instalação', categorias: ['cabo', 'acessorio'] },
];

const FILTROS: { id: Linha | 'todas'; rotulo: string; dica: string }[] = [
  { id: 'todas', rotulo: 'Todas', dica: 'Todas as linhas' },
  { id: 'simples', rotulo: 'Simples', dica: 'Linha simples, de 12 V' },
  { id: 'plano', rotulo: 'Plano', dica: 'Linha do plano de 24 V' },
  { id: 'avancada', rotulo: 'Avançada', dica: 'Linha avançada, de 48 V' },
];

const ID_QUADRO = 'acc-quadro-8';

let aba: Aba = ABAS[0];
let filtro: Linha | 'todas' = 'todas';

function abaDe(categoria: Categoria): Aba {
  return ABAS.find((a) => a.categorias.includes(categoria)) ?? ABAS[0];
}

/** Itens que o usuário arrasta do catálogo para a cena. */
function arrastavelParaACena(item: Item): boolean {
  switch (item.categoria) {
    case 'placa':
    case 'bateria':
    case 'inversor':
    case 'controlador':
    case 'aparelho':
    case 'rede':
      return true;
    case 'acessorio':
      return item.id === ID_QUADRO;
    default:
      return false;
  }
}

/** Texto de como o item entra no projeto. */
function comoEntra(item: Item): string {
  if (item.categoria === 'protecao') return 'Arraste para um cabo.';
  if (item.categoria === 'cabo') return 'Escolhido ao ligar o cabo.';
  if (arrastavelParaACena(item)) return item.id === ID_QUADRO ? 'Arraste para uma parede.' : 'Arraste para a casa.';
  return 'Entra no orçamento automaticamente.';
}

function cartao(item: Item): HTMLElement {
  const arrasta = arrastavelParaACena(item) || item.categoria === 'protecao';
  const c = h(
    'article',
    { class: arrasta ? 'cartao arrastavel' : 'cartao', 'data-item-id': item.id, 'data-linha': item.linha, ...(arrasta ? { 'data-arrastavel': '' } : {}) },
    h('h4', null, item.nome),
    h('p', { class: 'detalhe' }, item.detalhe),
    blocoDePreco(item),
    ...avisosDoItem(item),
    h('p', { class: 'como-entra' }, comoEntra(item)),
  );
  if (arrasta) {
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('a')) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('offgrid:arrastar-item', { detail: { itemId: item.id, clientX: e.clientX, clientY: e.clientY } }));
    });
  }
  return c;
}

function desenhar(): void {
  const lista = el<HTMLElement>('#lista-catalogo');
  document.querySelectorAll<HTMLButtonElement>('#abas-catalogo button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === aba.id)));
  document.querySelectorAll<HTMLButtonElement>('#filtro-linha button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.linha === filtro)));
  const itens = [...CATALOGO.values()].filter((i) => aba.categorias.includes(i.categoria) && (filtro === 'todas' || i.linha === filtro));
  lista.replaceChildren(...(itens.length ? itens.map(cartao) : [h('p', { class: 'vazio' }, 'Nenhum item nesta linha.')]));
}

/** Abre a aba que contém a categoria, mostrando todas as linhas. */
export function abrirCatalogo(categoria: Categoria): void {
  aba = abaDe(categoria);
  filtro = 'todas';
  desenhar();
}

/** Centro do cartão do item, em pixels da janela. Abre a aba certa e rola até ele. */
function telaDoCartao(itemId: string): [number, number] | null {
  const item = CATALOGO.get(itemId);
  if (!item) return null;
  const alvo = abaDe(item.categoria);
  if (aba !== alvo || (filtro !== 'todas' && item.linha !== filtro)) {
    aba = alvo;
    if (filtro !== 'todas' && item.linha !== filtro) filtro = 'todas';
    desenhar();
  }
  const c = [...document.querySelectorAll<HTMLElement>('#lista-catalogo .cartao')].find((x) => x.dataset.itemId === itemId);
  if (!c) return null;
  c.scrollIntoView({ block: 'nearest' });
  // Ponto do cartão que não cai em link: o meio da linha do nome, na altura do cartão.
  const r = c.getBoundingClientRect();
  const nome = c.querySelector('h4')?.getBoundingClientRect();
  return [r.left + r.width / 2, nome ? nome.top + nome.height / 2 : r.top + r.height / 2];
}

/** Acrescenta ao `window.__offgrid`, que a cena cria, sem substituí-lo. */
function exporNoGlobal(): void {
  const w = window as unknown as { __offgrid?: Record<string, unknown> };
  if (w.__offgrid) {
    w.__offgrid.telaDoCartao = telaDoCartao;
    return;
  }
  requestAnimationFrame(exporNoGlobal);
}

export function montarCatalogo(): void {
  const abas = el<HTMLElement>('#abas-catalogo');
  ABAS.forEach((a) => {
    const b = h('button', { type: 'button', role: 'tab', 'data-cat': a.id }, a.rotulo);
    b.addEventListener('click', () => {
      aba = a;
      desenhar();
    });
    abas.append(b);
  });
  const filtros = el<HTMLElement>('#filtro-linha');
  FILTROS.forEach((f) => {
    const b = h('button', { type: 'button', 'data-linha': f.id, title: f.dica }, f.rotulo);
    b.addEventListener('click', () => {
      filtro = f.id;
      desenhar();
    });
    filtros.append(b);
  });
  desenhar();
  exporNoGlobal();
}
