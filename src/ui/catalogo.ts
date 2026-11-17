// Painel Catálogo (coluna esquerda). Tarefa 2.2, parte de interface.
// O arraste em si é da cena: aqui o cartão só avisa na `window` que o botão foi apertado.

import { CATALOGO, grupoDoItem, gruposDoCatalogo, type GrupoDoCatalogo } from '../catalogo';
import type { Categoria, Item, Linha } from '../catalogo/tipos';
import { avisosDoItem, blocoDePreco, brl, el, h } from './formato';
import { casarGrupo, palavrasDaBusca } from './buscaCatalogo';

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

/** Texto da busca. Vazio: o catálogo mostra a aba escolhida. */
let consulta = '';
/** Modelo para o qual a busca aponta o cartão do tipo (só enquanto há busca; não é uma escolha do usuário). */
const apontadosPelaBusca = new Map<string, Item>();

/** Limpa o campo de busca. A aba de antes continua em `aba`, então o catálogo volta a ela. */
function limparBusca(): void {
  consulta = '';
  apontadosPelaBusca.clear();
  const campo = document.querySelector<HTMLInputElement>('#busca-catalogo');
  if (campo) campo.value = '';
  const x = document.querySelector<HTMLElement>('#busca-limpar');
  if (x) x.hidden = true;
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
      return item.id === ID_QUADRO || item.tipo === 'grampo' || item.tipo === 'filtro';
    default:
      return false;
  }
}

/** Texto de como o item entra no projeto. */
function comoEntra(item: Item): string {
  if (item.categoria === 'protecao') return 'Arraste para um cabo.';
  if (item.categoria === 'cabo') return 'Escolhido ao ligar o cabo.';
  if (item.categoria === 'acessorio' && item.tipo === 'grampo') return 'Arraste para uma parede, um piso ou um telhado, perto de um cabo: o cabo passa a correr preso ali.';
  if (arrastavelParaACena(item)) return item.id === ID_QUADRO ? 'Arraste para uma parede.' : 'Arraste para a casa.';
  return 'Entra no orçamento automaticamente.';
}

/** Modelo escolhido em cada tipo (o que será arrastado). Sem escolha, vale o de referência. */
const escolhidos = new Map<string, string>();
/** Tipos com o detalhe aberto. Fechado, o cartão mostra só o título. */
const abertos = new Set<string>();

function naLinha(item: Item): boolean {
  return filtro === 'todas' || item.linha === filtro;
}

/** Modelo que o cartão arrasta: o escolhido, se ainda vale no filtro; senão a referência, ou o mais barato da linha. */
function modeloDoCartao(g: GrupoDoCatalogo): Item {
  const id = escolhidos.get(g.chave);
  const escolhido = id ? g.itens.find((i) => i.id === id) : undefined;
  if (escolhido && naLinha(escolhido)) return escolhido;
  const apontado = apontadosPelaBusca.get(g.chave);
  if (apontado && naLinha(apontado)) return apontado;
  return modeloSemBusca(g);
}

/** Modelo do cartão sem olhar a busca. */
function modeloSemBusca(g: GrupoDoCatalogo): Item {
  const id = escolhidos.get(g.chave);
  const escolhido = id ? g.itens.find((i) => i.id === id) : undefined;
  if (escolhido && naLinha(escolhido)) return escolhido;
  if (naLinha(g.referencia)) return g.referencia;
  return g.itens.find(naLinha) ?? g.referencia;
}

function blocoDePrecoDoTipo(g: GrupoDoCatalogo): HTMLElement | null {
  const r = g.referencia;
  if (g.itens.length === 1) return blocoDePreco(r);
  if (r.preco === 0) return null;
  return h(
    'p',
    { class: 'preco' },
    h('strong', null, `a partir de ${brl(r.preco)}${r.categoria === 'cabo' ? ' por metro' : ''}`),
    r.tipico?.includes('preco') ? h('span', { class: 'marca-tipico', title: 'Preço estimado: não veio de um anúncio' }, 'valor típico') : null,
  );
}

function listaDeModelos(g: GrupoDoCatalogo, atual: Item, aoEscolher: (id: string) => void): HTMLElement {
  const lista = h('ul', { class: 'modelos' });
  for (const item of g.itens) {
    const radio = h('input', { type: 'radio', name: `modelo-${g.chave}`, value: item.id, ...(item.id === atual.id ? { checked: true } : {}) });
    radio.addEventListener('change', () => aoEscolher(item.id));
    lista.append(
      h(
        'li',
        { class: item.id === atual.id ? 'modelo escolhido' : 'modelo', 'data-modelo-id': item.id },
        h('label', { class: 'modelo-nome' }, radio, h('span', null, item.nome)),
        blocoDePreco(item),
        ...avisosDoItem(item),
      ),
    );
  }
  return h('div', { class: 'modelos-caixa' }, h('p', { class: 'rotulo-secao' }, `${g.itens.length} modelos no mercado. O marcado é o que você arrasta.`), lista);
}

function cartao(g: GrupoDoCatalogo): HTMLElement {
  const atual = modeloDoCartao(g);
  const arrasta = arrastavelParaACena(g.referencia) || g.referencia.categoria === 'protecao';
  const aberto = abertos.has(g.chave);
  const varios = g.itens.length > 1;
  // O botão fica na linha do título: fechado, o cartão é só o nome do equipamento.
  const botaoDetalhe = h(
    'button',
    { type: 'button', class: 'ver-modelos', 'aria-expanded': String(aberto), title: aberto ? 'Esconder os dados, o preço e os modelos' : 'Mostrar os dados, o preço e os modelos' },
    aberto ? 'Esconder detalhe' : 'Mostrar detalhe',
  );
  const c = h(
    'article',
    {
      class: arrasta ? 'cartao arrastavel' : 'cartao',
      'data-grupo': g.chave,
      'data-item-id': atual.id,
      'data-linha': atual.linha,
      'data-modelos': String(g.itens.length),
      ...(arrasta ? { 'data-arrastavel': '' } : {}),
    },
    h(
      'div',
      { class: 'cartao-topo' },
      consulta ? h('div', { class: 'cartao-titulo' }, h('h4', null, g.nome), h('span', { class: 'etiqueta-aba' }, abaDe(g.categoria).rotulo)) : h('h4', null, g.nome),
      botaoDetalhe,
    ),
    consulta && varios && atual.id !== g.referencia.id ? h('p', { class: 'modelo-casou' }, `Modelo que casou: ${atual.nome}`) : null,
  );
  botaoDetalhe.addEventListener('click', () => {
    if (abertos.has(g.chave)) abertos.delete(g.chave);
    else abertos.add(g.chave);
    c.replaceWith(cartao(g));
  });
  if (aberto) {
    const partes: (Node | null)[] = [
      h('p', { class: 'detalhe' }, g.referencia.detalhe),
      blocoDePrecoDoTipo(g),
      ...avisosDoItem(g.referencia),
      varios ? h('p', { class: 'modelo-atual' }, atual.id === g.referencia.id ? 'Modelo de referência.' : `Modelo escolhido: ${atual.nome}.`) : null,
      h('p', { class: 'como-entra' }, comoEntra(g.referencia)),
      varios
        ? listaDeModelos(g, atual, (id) => {
            escolhidos.set(g.chave, id);
            c.replaceWith(cartao(g));
          })
        : null,
    ];
    c.append(...partes.filter((n): n is Node => n !== null));
  }
  if (arrasta) {
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('a, button, input, label, .modelos-caixa')) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('offgrid:arrastar-item', { detail: { itemId: c.dataset.itemId, clientX: e.clientX, clientY: e.clientY } }));
    });
  }
  return c;
}

/** Resultados da busca, de todas as abas, na ordem das abas. Guarda em `apontadosPelaBusca` o modelo que casou. */
function resultadosDaBusca(): GrupoDoCatalogo[] {
  const palavras = palavrasDaBusca(consulta);
  apontadosPelaBusca.clear();
  const achados: GrupoDoCatalogo[] = [];
  for (const a of ABAS) {
    const doAba = gruposDoCatalogo(CATALOGO)
      .filter((g) => a.categorias.includes(g.categoria))
      .sort((x, y) => a.categorias.indexOf(x.categoria) - a.categorias.indexOf(y.categoria));
    for (const g of doAba) {
      const achado = casarGrupo(g, palavras, a.rotulo, naLinha, modeloSemBusca(g));
      if (!achado) continue;
      if (achado.modelo) apontadosPelaBusca.set(g.chave, achado.modelo);
      achados.push(g);
    }
  }
  return achados;
}

/** Quantos tipos casam com a busca em todas as linhas (para avisar quando o filtro de linha esconde resultados). */
function quantosEmOutrasLinhas(): number {
  const palavras = palavrasDaBusca(consulta);
  return gruposDoCatalogo(CATALOGO).filter((g) => casarGrupo(g, palavras, abaDe(g.categoria).rotulo, () => true, g.referencia) !== null).length;
}

function mensagemSemResultado(): HTMLElement {
  const p = h('p', { class: 'vazio' }, 'Nenhum item com esse texto.');
  const outras = filtro === 'todas' ? 0 : quantosEmOutrasLinhas();
  if (outras > 0) {
    const ver = h('button', { type: 'button', class: 'ver-todas-linhas' }, 'Ver todas as linhas');
    ver.addEventListener('click', () => {
      filtro = 'todas';
      desenhar();
    });
    p.append(` Há ${outras} em outras linhas. `, ver);
  }
  return p;
}

function desenhar(): void {
  const lista = el<HTMLElement>('#lista-catalogo');
  document.querySelectorAll<HTMLButtonElement>('#abas-catalogo button').forEach((b) => b.setAttribute('aria-selected', String(!consulta && b.dataset.cat === aba.id)));
  document.querySelectorAll<HTMLButtonElement>('#filtro-linha button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.linha === filtro)));
  if (consulta) {
    const achados = resultadosDaBusca();
    lista.replaceChildren(...(achados.length ? achados.map(cartao) : [mensagemSemResultado()]));
    return;
  }
  const grupos = gruposDoCatalogo(CATALOGO)
    .filter((g) => aba.categorias.includes(g.categoria) && g.itens.some(naLinha))
    .sort((a, b) => aba.categorias.indexOf(a.categoria) - aba.categorias.indexOf(b.categoria));
  lista.replaceChildren(...(grupos.length ? grupos.map(cartao) : [h('p', { class: 'vazio' }, 'Nenhum item nesta linha.')]));
}

/** Abre a aba que contém a categoria, mostrando todas as linhas. */
export function abrirCatalogo(categoria: Categoria): void {
  limparBusca();
  aba = abaDe(categoria);
  filtro = 'todas';
  desenhar();
}

/** Centro do cartão do tipo do item, em pixels da janela. Abre a aba certa, escolhe aquele modelo e rola até o cartão. */
function telaDoCartao(itemId: string): [number, number] | null {
  const item = CATALOGO.get(itemId);
  const g = grupoDoItem(CATALOGO, itemId);
  if (!item || !g) return null;
  limparBusca();
  if (!naLinha(item)) filtro = 'todas';
  aba = abaDe(item.categoria);
  escolhidos.set(g.chave, itemId);
  desenhar();
  const c = [...document.querySelectorAll<HTMLElement>('#lista-catalogo .cartao')].find((x) => x.dataset.grupo === g.chave);
  if (!c) return null;
  c.scrollIntoView({ block: 'nearest' });
  // Ponto do cartão que não cai em link: o meio da linha do nome, na altura do cartão.
  const r = c.getBoundingClientRect();
  const nome = c.querySelector('h4')?.getBoundingClientRect();
  return [r.left + r.width / 2, nome ? nome.top + nome.height / 2 : r.top + r.height / 2];
}

let esperaDoDestaque: ReturnType<typeof setTimeout> | null = null;

function marcarDestaque(alvo: HTMLElement): void {
  document.querySelectorAll('.destaque-passo').forEach((e) => e.classList.remove('destaque-passo'));
  alvo.classList.add('destaque-passo');
  if (esperaDoDestaque) clearTimeout(esperaDoDestaque);
  esperaDoDestaque = setTimeout(() => alvo.classList.remove('destaque-passo'), 4000);
}

/** Passo a passo: abre a aba do item, rola até o cartão e o destaca por alguns segundos. Devolve falso se não há cartão. */
export function destacarNoCatalogo(itemId: string): boolean {
  if (!telaDoCartao(itemId)) return false;
  const g = grupoDoItem(CATALOGO, itemId);
  const c = [...document.querySelectorAll<HTMLElement>('#lista-catalogo .cartao')].find((x) => x.dataset.grupo === g?.chave);
  if (!c) return false;
  marcarDestaque(c);
  return true;
}

/** Consultor, "Ver instalação": abre a aba, rola até o quadro de energia (a peça que se arrasta para a parede) e o destaca. */
export function destacarQuadroNoCatalogo(): void {
  if (!destacarNoCatalogo(ID_QUADRO)) abrirCatalogo('acessorio');
}

/** Passo a passo, sem um item só: abre a aba da categoria e destaca a lista. */
export function destacarCategoriaNoCatalogo(categoria: Categoria): void {
  abrirCatalogo(categoria);
  marcarDestaque(el<HTMLElement>('#lista-catalogo'));
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
      limparBusca();
      aba = a;
      desenhar();
    });
    abas.append(b);
  });
  const campo = el<HTMLInputElement>('#busca-catalogo');
  const limpar = el<HTMLElement>('#busca-limpar');
  campo.addEventListener('input', () => {
    consulta = palavrasDaBusca(campo.value).length ? campo.value : '';
    limpar.hidden = campo.value === '';
    if (!consulta) apontadosPelaBusca.clear();
    desenhar();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    limparBusca();
    desenhar();
  });
  limpar.addEventListener('click', () => {
    limparBusca();
    desenhar();
    campo.focus();
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
