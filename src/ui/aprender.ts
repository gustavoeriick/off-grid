// Aprender na tela: "Por quê?" do consultor e painel do glossário. Tarefa 4.2 (conteúdo em src/conteudo/).
// O conteúdo vem pronto de src/conteudo/; aqui só se mostra, sempre como texto (nada de innerHTML).

import { GLOSSARIO, type TermoGlossario } from '../conteudo/glossario';
import { PORQUE } from '../conteudo/porque';
import { el, h } from './formato';

/** Texto sem acento e em minúsculas, para a busca. */
function simples(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// ---------------------------------------------------------------- Painéis sobrepostos

const sobrepostos = new Set<HTMLElement>();

export function fecharSobrepostos(): void {
  for (const p of sobrepostos) p.hidden = true;
}

/**
 * Cria um painel sobreposto à cena (fechável com Esc e com o botão "Fechar").
 * `aoAbrir` roda cada vez que o painel abre. Devolve o painel, o corpo e a função que abre.
 */
export function criarSobreposto(
  id: string,
  titulo: string,
  aoAbrir?: () => void,
): { painel: HTMLElement; corpo: HTMLElement; cabecalho: HTMLElement; abrir: () => void; fechar: () => void } {
  const corpo = h('div', { class: 'sobreposto-corpo' });
  const cabecalho = h('div', { class: 'sobreposto-topo' });
  const botaoFechar = h('button', { type: 'button', class: 'fechar-sobreposto' }, 'Fechar');
  const painel = h(
    'section',
    { id, class: 'painel-sobreposto', role: 'dialog', 'aria-label': titulo, hidden: true },
    h('div', { class: 'sobreposto-titulo' }, h('h3', null, titulo), botaoFechar),
    cabecalho,
    corpo,
  );
  document.body.append(painel);
  sobrepostos.add(painel);

  const fechar = (): void => {
    painel.hidden = true;
  };
  const abrir = (): void => {
    fecharSobrepostos();
    painel.hidden = false;
    aoAbrir?.();
  };
  botaoFechar.addEventListener('click', fechar);
  // Esc fecha o painel e não chega aos outros atalhos (por exemplo, o de sair da edição da casa).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || painel.hidden) return;
      e.stopPropagation();
      e.preventDefault();
      fechar();
    },
    true,
  );
  return { painel, corpo, cabecalho, abrir, fechar };
}

// ---------------------------------------------------------------- Glossário

const porId = new Map<string, TermoGlossario>(GLOSSARIO.map((t) => [t.id, t]));

let abrirNoTermo: (id?: string) => void = () => undefined;

/** Abre o glossário, no termo dado quando houver. */
export function abrirGlossario(id?: string): void {
  abrirNoTermo(id);
}

/** Etiquetas clicáveis que abrem o glossário no termo. Ids sem entrada no glossário ficam de fora. */
export function etiquetasDeTermos(ids: readonly string[], classe: string): HTMLElement[] {
  return ids
    .map((id) => porId.get(id))
    .filter((t): t is TermoGlossario => t !== undefined)
    .map((t) => {
      const b = h('button', { type: 'button', class: classe, 'data-termo': t.id, title: t.curto }, t.termo);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirGlossario(t.id);
      });
      return b;
    });
}

export function montarGlossario(): void {
  const busca = h('input', { type: 'search', id: 'busca-glossario', placeholder: 'Buscar um termo (por exemplo, fusível)', 'aria-label': 'Buscar no glossário' });
  const nada = h('p', { class: 'vazio', hidden: true }, 'Nenhum termo encontrado.');
  const { corpo, cabecalho, abrir } = criarSobreposto('painel-glossario', 'Glossário', () => busca.focus());
  cabecalho.append(busca);

  const itens = new Map<string, { raiz: HTMLElement; botao: HTMLButtonElement; detalhe: HTMLElement; texto: string }>();
  const lista = h('div', { class: 'lista-glossario' });
  for (const t of GLOSSARIO) {
    const botao = h('button', { type: 'button', class: 'termo-titulo', 'aria-expanded': 'false' }, h('strong', null, t.termo), h('span', { class: 'termo-curto' }, t.curto));
    const detalhe = h('div', { class: 'termo-detalhe', hidden: true }, h('p', null, t.texto));
    const veja = etiquetasDeTermos(t.veja ?? [], 'etiqueta-termo');
    if (veja.length) detalhe.append(h('p', { class: 'veja-tambem' }, h('span', null, 'Veja também: '), ...veja));
    const raiz = h('article', { class: 'termo', id: `termo-${t.id}`, 'data-termo': t.id }, botao, detalhe);
    botao.addEventListener('click', () => alternar(t.id, botao.getAttribute('aria-expanded') !== 'true'));
    itens.set(t.id, { raiz, botao, detalhe, texto: simples(`${t.termo} ${t.curto} ${t.texto}`) });
    lista.append(raiz);
  }
  corpo.append(lista, nada);

  function alternar(id: string, aberto: boolean): void {
    const i = itens.get(id);
    if (!i) return;
    i.botao.setAttribute('aria-expanded', String(aberto));
    i.detalhe.hidden = !aberto;
    i.raiz.classList.toggle('aberto', aberto);
  }

  const filtrar = (): void => {
    const q = simples(busca.value.trim());
    let visiveis = 0;
    for (const i of itens.values()) {
      const ok = q === '' || i.texto.includes(q);
      i.raiz.hidden = !ok;
      if (ok) visiveis += 1;
    }
    nada.hidden = visiveis > 0;
  };
  busca.addEventListener('input', filtrar);

  abrirNoTermo = (id) => {
    abrir();
    if (!id) return;
    busca.value = '';
    filtrar();
    for (const k of itens.keys()) alternar(k, k === id);
    itens.get(id)?.raiz.scrollIntoView({ block: 'start' });
  };

  el('#botao-glossario').addEventListener('click', () => abrirNoTermo());
}

// ---------------------------------------------------------------- "Por quê?" do consultor

/** Regras com o "Por quê?" aberto: o consultor é redesenhado a cada cálculo e não pode fechar o que o usuário abriu. */
const abertas = new Set<string>();

/** Botão "Por quê?" e o texto que ele abre, para o cartão da regra. Nulo se a regra não tem entrada. */
export function blocoPorQue(regra: string): HTMLElement[] | null {
  const p = PORQUE[regra];
  if (!p) return null;
  const aberto = abertas.has(regra);
  const botao = h('button', { type: 'button', class: 'porque-botao', 'aria-expanded': String(aberto) }, 'Por quê?');
  const caixa = h('div', { class: 'porque-texto', hidden: !aberto }, h('p', null, p.texto));
  const termos = etiquetasDeTermos(p.termos, 'etiqueta-termo');
  if (termos.length) caixa.append(h('p', { class: 'veja-tambem' }, ...termos));
  caixa.addEventListener('click', (e) => e.stopPropagation());
  botao.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = !abertas.has(regra);
    if (abrir) abertas.add(regra);
    else abertas.delete(regra);
    botao.setAttribute('aria-expanded', String(abrir));
    caixa.hidden = !abrir;
  });
  return [botao, caixa];
}
