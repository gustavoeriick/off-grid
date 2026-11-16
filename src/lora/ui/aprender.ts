// Aprender na tela do ambiente de LoRa: glossário, "Por quê?", regras da Anatel e os painéis sobrepostos que os mostram.
// Tarefas L4.1 e L4.2. O conteúdo vem pronto de src/lora/conteudo/; aqui só se mostra, sempre como texto (nada de innerHTML).
// Segue o comportamento de src/ui/aprender.ts do ambiente solar, sem importar de lá.

import { GLOSSARIO_LORA, PORQUE_LORA, REGRAS_DA_ANATEL, termoLora, type LinkDoTermo, type SituacaoLora, type Termo } from '../conteudo';
import { el, h } from './dom';

/** Texto sem acento e em minúsculas, para a busca. */
export function simples(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// ---------------------------------------------------------------- Painéis sobrepostos

const sobrepostos = new Set<HTMLElement>();

/** Fecha o glossário, as regras e o "Por quê?": só um deles fica aberto por vez. */
export function fecharSobrepostosLora(): void {
  for (const p of sobrepostos) p.hidden = true;
}

/** Cria um painel sobreposto ao mapa (fecha com Esc e com o botão "Fechar"). Devolve o painel, o corpo, o topo e quem abre e fecha. */
function criarSobreposto(
  id: string,
  titulo: string,
  classe = '',
  aoAbrir?: () => void,
): { painel: HTMLElement; corpo: HTMLElement; topo: HTMLElement; titulo: HTMLElement; abrir: () => void; fechar: () => void } {
  const corpo = h('div', { class: 'sobreposto-corpo' });
  const topo = h('div', { class: 'sobreposto-topo' });
  const tituloEl = h('h3', null, titulo);
  const botaoFechar = h('button', { type: 'button', class: 'fechar-sobreposto' }, 'Fechar');
  const painel = h(
    'section',
    { id, class: `painel-sobreposto ${classe}`.trim(), role: 'dialog', 'aria-label': titulo, hidden: true },
    h('div', { class: 'sobreposto-titulo' }, tituloEl, botaoFechar),
    topo,
    corpo,
  );
  document.body.append(painel);
  sobrepostos.add(painel);
  const fechar = (): void => {
    painel.hidden = true;
  };
  const abrir = (): void => {
    fecharSobrepostosLora();
    painel.hidden = false;
    aoAbrir?.();
  };
  botaoFechar.addEventListener('click', fechar);
  // Esc fecha o painel e não chega aos outros atalhos (por exemplo, o que cancela a ferramenta do mapa).
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
  return { painel, corpo, topo, titulo: tituloEl, abrir, fechar };
}

// ---------------------------------------------------------------- Glossário

let abrirNoTermo: (id?: string) => void = () => undefined;

/** Abre o glossário, já no termo dado quando ele existe. */
export function abrirTermoLora(id?: string): void {
  abrirNoTermo(id);
}

/** Verdadeiro se o glossário tem o termo. */
export const temTermoLora = (id: string): boolean => termoLora(id) !== undefined;

/** Etiquetas clicáveis que abrem o glossário no termo. Ids sem entrada no glossário ficam de fora. */
export function etiquetasDeTermos(ids: readonly string[], classe: string): HTMLElement[] {
  return ids
    .map((id) => termoLora(id))
    .filter((t): t is Termo => t !== undefined)
    .map((t) => {
      const b = h('button', { type: 'button', class: classe, 'data-termo': t.id, title: t.curto }, t.termo);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirTermoLora(t.id);
      });
      return b;
    });
}

/** Parágrafo com o link para fora (outra aba, sem passar o endereço desta página) e a frase que vai junto. */
export function linkParaFora(link: LinkDoTermo, id?: string): HTMLElement {
  return h(
    'p',
    { class: 'lora-link-externo' },
    link.nota ? `${link.nota} ` : null,
    h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', id }, link.rotulo),
  );
}

function montarGlossario(): void {
  const busca = h('input', { type: 'search', id: 'lora-busca-glossario', placeholder: 'Buscar um termo (por exemplo, fresnel)', 'aria-label': 'Buscar no glossário' });
  const nada = h('p', { class: 'vazio', id: 'lora-glossario-vazio', hidden: true }, 'Nenhum termo encontrado.');
  const { corpo, topo, abrir } = criarSobreposto('lora-painel-glossario', 'Glossário', 'lora-sobreposto', () => busca.focus());
  topo.append(busca);

  const itens = new Map<string, { raiz: HTMLElement; botao: HTMLButtonElement; detalhe: HTMLElement; texto: string }>();
  const lista = h('div', { class: 'lista-glossario' });
  for (const t of GLOSSARIO_LORA) {
    const botao = h('button', { type: 'button', class: 'termo-titulo', 'aria-expanded': 'false' }, h('strong', null, t.termo), h('span', { class: 'termo-curto' }, t.curto));
    const detalhe = h('div', { class: 'termo-detalhe', hidden: true }, h('p', null, t.texto));
    if (t.link) detalhe.append(linkParaFora(t.link, `lora-link-meshbrasil-${t.id}`));
    const veja = etiquetasDeTermos(t.veja ?? [], 'etiqueta-termo');
    if (veja.length) detalhe.append(h('p', { class: 'veja-tambem' }, h('span', null, 'Veja também: '), ...veja));
    const raiz = h('article', { class: 'termo', id: `lora-termo-${t.id}`, 'data-termo': t.id }, botao, detalhe);
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
    if (!id || !itens.has(id)) return;
    busca.value = '';
    filtrar();
    for (const k of itens.keys()) alternar(k, k === id);
    itens.get(id)?.raiz.scrollIntoView({ block: 'start' });
  };
}

// ---------------------------------------------------------------- Regras da Anatel

let abrirAsRegras: () => void = () => undefined;

/** Abre o painel "Regras da Anatel". */
export function abrirRegrasLora(): void {
  abrirAsRegras();
}

function montarRegras(): void {
  const { corpo, abrir } = criarSobreposto('lora-painel-regras', 'Regras da Anatel para o LoRa', 'lora-sobreposto');
  for (const b of REGRAS_DA_ANATEL) corpo.append(h('section', { class: 'lora-regra' }, h('h4', null, b.titulo), h('p', null, b.texto)));
  abrirAsRegras = abrir;
}

/** Link "ver as regras", para ficar ao lado de um aviso de regra. */
export function linkVerAsRegras(): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'lora-link-regras', title: 'Abre a página com o que o simulador leu da regra da Anatel' }, 'ver as regras');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirRegrasLora();
  });
  return b;
}

// ---------------------------------------------------------------- "Por quê?"

let abrirOPorQue: (situacao: SituacaoLora) => void = () => undefined;

export function abrirPorQueLora(situacao: SituacaoLora): void {
  abrirOPorQue(situacao);
}

/** Botão "Por quê?" que abre o painel pequeno com a explicação da situação. */
export function botaoPorQue(situacao: SituacaoLora): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'lora-porque-botao', 'data-porque': situacao, title: 'Por que o simulador diz isto, e o que está por trás' }, 'Por quê?');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirPorQueLora(situacao);
  });
  return b;
}

/** Qual "Por quê?" de regra da Anatel vale para um texto de aviso do núcleo. */
export function situacaoDoAvisoDeRegra(aviso: string): SituacaoLora {
  return aviso.includes('densidade espectral') && !aviso.includes('para esta antena') ? 'aviso-anatel-densidade' : 'aviso-anatel-antena';
}

/** Parágrafo de aviso de regra da Anatel, com "Por quê?" e "ver as regras". */
export function avisoDeRegra(texto: string): HTMLElement {
  return h('p', { class: 'lora-aviso', role: 'note' }, texto, ' ', botaoPorQue(situacaoDoAvisoDeRegra(texto)), ' ', linkVerAsRegras());
}

function montarPorQue(): void {
  const { corpo, titulo, abrir } = criarSobreposto('lora-painel-porque', 'Por quê?', 'lora-sobreposto lora-porque-painel');
  abrirOPorQue = (situacao) => {
    const p = PORQUE_LORA[situacao];
    if (!p) return;
    abrir();
    titulo.textContent = 'Por quê?';
    const etiquetas = etiquetasDeTermos(p.termos, 'etiqueta-termo');
    corpo.replaceChildren(h('p', { class: 'lora-porque-texto', 'data-situacao': situacao }, p.texto));
    if (etiquetas.length) corpo.append(h('p', { class: 'veja-tambem' }, h('span', null, 'Termos: '), ...etiquetas));
  };
}

// ---------------------------------------------------------------- Montagem

/** Monta o glossário, as regras e o "Por quê?" e liga os botões "Glossário" e "Regras da Anatel" da barra do alto. */
export function montarAprenderLora(): void {
  montarGlossario();
  montarRegras();
  montarPorQue();
  el('#lora-aprender-glossario').addEventListener('click', () => abrirTermoLora());
  el('#lora-aprender-regras').addEventListener('click', () => abrirRegrasLora());
}
