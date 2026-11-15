// Modo passo a passo (tarefa 4.1). O conteúdo dos roteiros vem de src/conteudo/roteiros.ts; aqui se mostra o painel
// no canto da cena, se avança quando o passo fica feito e se guarda o andamento na sessão.
// O painel só reage ao evento 'derivados': ele chega logo depois de cada mudança do projeto, já com a análise nova,
// e é nela que os passos olham.

import { CATALOGO } from '../catalogo';
import { roteiroPorId, ROTEIROS, type Passo, type Roteiro } from '../conteudo/roteiros';
import { acoes, assinar, estado, recalcularAgora } from '../estado';
import { criarSobreposto } from './aprender';
import { destacarCategoriaNoCatalogo, destacarNoCatalogo } from './catalogo';
import { brl, el, h, num, substituir } from './formato';

const CHAVE = 'offgrid.passoapasso';
const MS_DO_FEITO = 1800;

let roteiro: Roteiro | null = null;
const pulados = new Set<string>();
/** Passos que estavam feitos na última conferência, para notar quando um passo acaba de ficar feito. */
let feitosAntes = new Set<string>();
let atualAntes: string | null = null;
let feitoRecente: string | null = null;
let esperaDoFeito: ReturnType<typeof setTimeout> | null = null;
let painel: HTMLElement | null = null;

// ---------------------------------------------------------------- Andamento

function gravar(): void {
  try {
    if (!roteiro) sessionStorage.removeItem(CHAVE);
    else sessionStorage.setItem(CHAVE, JSON.stringify({ roteiro: roteiro.id, passo: Math.max(0, indiceAtual()), pulados: [...pulados] }));
  } catch {
    /* sem sessionStorage: o andamento só vale enquanto a página está aberta */
  }
}

function ler(): { roteiro: Roteiro; pulados: string[] } | null {
  try {
    const dados: unknown = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null');
    if (!dados || typeof dados !== 'object') return null;
    const { roteiro: id, pulados: lista } = dados as { roteiro?: unknown; pulados?: unknown };
    const r = typeof id === 'string' ? roteiroPorId(id) : undefined;
    if (!r) return null;
    return { roteiro: r, pulados: Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}

function feitos(): boolean[] {
  return roteiro ? roteiro.passos.map((p) => p.feito(estado.projeto, estado.derivados, CATALOGO)) : [];
}

/** Primeiro passo que não está feito nem foi pulado. -1 quando não resta nenhum. */
function indiceAtual(f: boolean[] = feitos()): number {
  return roteiro ? roteiro.passos.findIndex((p, i) => !f[i] && !pulados.has(p.id)) : -1;
}

function sair(): void {
  roteiro = null;
  pulados.clear();
  feitosAntes = new Set();
  atualAntes = null;
  feitoRecente = null;
  gravar();
  desenhar();
}

/** Troca a montagem por uma casa vazia (a mesma casa, sem dispositivos nem cabos) e começa o roteiro. */
function comecar(r: Roteiro): void {
  const base = structuredClone(estado.projeto);
  // O roteiro de 24 V usa a tomada da rede da casa: ela fica. O de 12 V não usa.
  const precisaDaRede = r.passos.some((p) => p.itemId === 'rede-tomada');
  const novo = {
    ...base,
    dispositivos: precisaDaRede ? base.dispositivos.filter((d) => CATALOGO.get(d.itemId)?.categoria === 'rede') : [],
    cabos: [],
  };
  acoes.carregarProjeto(novo);
  recalcularAgora();
  roteiro = r;
  pulados.clear();
  feitoRecente = null;
  const f = feitos();
  feitosAntes = new Set(r.passos.filter((_, i) => f[i]).map((p) => p.id));
  atualAntes = r.passos[indiceAtual(f)]?.id ?? null;
  gravar();
  desenhar();
}

// ---------------------------------------------------------------- Painel

function mostrarNoCatalogo(p: Passo): void {
  if (p.itemId) destacarNoCatalogo(p.itemId);
  else if (p.categoria) destacarCategoriaNoCatalogo(p.categoria);
}

function marca(estadoDoPasso: 'feito' | 'atual' | 'pulado' | 'adiante'): string {
  return { feito: '✓', atual: '▶', pulado: '–', adiante: '○' }[estadoDoPasso];
}

const semNulos = (lista: (Node | null)[]): Node[] => lista.filter((n): n is Node => n !== null);

function resumo(r: Roteiro): Node[] {
  const e = estado.derivados.estimativas;
  const f = feitos();
  const puladosAgora = r.passos.filter((p, i) => pulados.has(p.id) && !f[i]).length;
  const autonomia =
    e.autonomiaHoras === null
      ? 'A autonomia ainda não pôde ser calculada: falta bateria ou aparelho ligado na saída.'
      : `A bateria sustenta os aparelhos por cerca de ${num(e.autonomiaHoras, 1)} h sem sol e sem rede (autonomia).`;
  const botaoQueda = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'queda' }, 'Simular queda de luz');
  botaoQueda.addEventListener('click', () => {
    if (!estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  });
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, 'Sair do passo a passo');
  botaoSair.addEventListener('click', sair);
  return semNulos([
    h('p', { class: 'passo-contagem' }, r.titulo),
    h('h4', { class: 'passo-titulo' }, 'Montagem concluída'),
    h('p', { class: 'passo-texto' }, autonomia),
    h('p', { class: 'passo-texto' }, `Orçamento total: ${brl(estado.derivados.orcamento.total)}. Os preços mudam: confira os anúncios antes de comprar.`),
    puladosAgora > 0 ? h('p', { class: 'passo-dica' }, `Você pulou ${puladosAgora} ${puladosAgora === 1 ? 'passo' : 'passos'}: eles não foram conferidos.`) : null,
    h('p', { class: 'passo-texto' }, 'Que tal simular uma queda de luz? Ela mostra se a bateria aguenta a casa sem a rede.'),
    h('p', { class: 'passo-dica' }, 'O simulador ajuda a aprender e a planejar. Antes de comprar e instalar de verdade, mostre o plano a um eletricista habilitado.'),
    h('div', { class: 'passo-botoes' }, botaoQueda, botaoSair),
  ]);
}

function emAndamento(r: Roteiro, f: boolean[], atual: number): Node[] {
  const passo = r.passos[atual]!;
  const botoes = h('div', { class: 'passo-botoes' });
  if (passo.itemId || passo.categoria) {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'catalogo' }, 'Mostrar no catálogo');
    b.addEventListener('click', () => {
      const atualAgora = roteiro?.passos[indiceAtual()];
      if (atualAgora) mostrarNoCatalogo(atualAgora);
    });
    botoes.append(b);
  }
  const pular = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'pular' }, 'Pular');
  pular.addEventListener('click', () => {
    const atualAgora = roteiro?.passos[indiceAtual()];
    if (!atualAgora) return;
    pulados.add(atualAgora.id);
    gravar();
    avaliar();
  });
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, 'Sair do passo a passo');
  botaoSair.addEventListener('click', sair);
  botoes.append(pular, botaoSair);

  const lista = h(
    'ol',
    { class: 'passo-lista' },
    ...r.passos.map((p, i) => {
      const situacao = f[i] ? 'feito' : pulados.has(p.id) ? 'pulado' : i === atual ? 'atual' : 'adiante';
      return h('li', { class: `passo-item ${situacao}`, 'data-passo-id': p.id }, h('span', { class: 'passo-marca', 'aria-hidden': 'true' }, marca(situacao)), h('span', null, p.titulo));
    }),
  );

  return semNulos([
    h('p', { class: 'passo-contagem' }, `Passo ${atual + 1} de ${r.passos.length}`, h('span', { class: 'passo-roteiro' }, ` · ${r.titulo}`)),
    feitoRecente ? h('p', { class: 'passo-feito', role: 'status' }, `Feito! ${feitoRecente}`) : null,
    h('h4', { class: 'passo-titulo' }, passo.titulo),
    h('p', { class: 'passo-texto' }, passo.texto),
    passo.dica ? h('p', { class: 'passo-dica' }, `Dica: ${passo.dica}`) : null,
    lista,
    botoes,
  ]);
}

function desenhar(): void {
  if (!painel) return;
  if (!roteiro) {
    painel.hidden = true;
    painel.removeAttribute('data-roteiro');
    painel.removeAttribute('data-situacao');
    delete painel.dataset.assinatura;
    painel.replaceChildren();
    return;
  }
  const f = feitos();
  const atual = indiceAtual(f);
  painel.hidden = false;
  painel.dataset.roteiro = roteiro.id;
  painel.dataset.situacao = atual < 0 ? 'resumo' : 'andamento';
  painel.dataset.passo = String(atual < 0 ? roteiro.passos.length : atual + 1);
  substituir(painel, atual < 0 ? resumo(roteiro) : emAndamento(roteiro, f, atual));
}

/** Confere os passos, mostra o "Feito!" quando o passo da vez acabou de ficar feito e redesenha. */
function avaliar(): void {
  if (!roteiro) return;
  const f = feitos();
  const agoraFeitos = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
  const passoDaVez = atualAntes === null ? undefined : roteiro.passos.find((p) => p.id === atualAntes);
  if (passoDaVez && agoraFeitos.has(passoDaVez.id) && !feitosAntes.has(passoDaVez.id)) {
    feitoRecente = passoDaVez.titulo;
    if (esperaDoFeito) clearTimeout(esperaDoFeito);
    esperaDoFeito = setTimeout(() => {
      feitoRecente = null;
      desenhar();
    }, MS_DO_FEITO);
  }
  feitosAntes = agoraFeitos;
  atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  gravar();
  desenhar();
}

// ---------------------------------------------------------------- Escolha do roteiro

function montarEscolha(): () => void {
  const { corpo, abrir, fechar } = criarSobreposto('painel-escolha-roteiro', 'Passo a passo');
  corpo.append(h('p', { class: 'detalhe' }, 'Escolha um roteiro. Ele guia a montagem, um passo de cada vez, e avisa quando você cumpre cada um.'));
  for (const r of ROTEIROS) {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-roteiro': r.id }, 'Começar');
    b.addEventListener('click', () => {
      if (!window.confirm('Isto troca a montagem atual por uma casa vazia. Você pode desfazer.')) return;
      fechar();
      comecar(r);
    });
    corpo.append(
      h('article', { class: 'roteiro-opcao' }, h('h4', null, r.titulo), h('p', null, r.paraQuem), h('p', { class: 'detalhe' }, `${r.passos.length} passos`), b),
    );
  }
  return abrir;
}

export function montarPassoAPasso(): void {
  painel = h('aside', { id: 'passo-a-passo', class: 'passo-a-passo', 'aria-label': 'Passo a passo', hidden: true });
  el('#centro').append(painel);

  const abrirEscolha = montarEscolha();
  el('#botao-passo-a-passo').addEventListener('click', abrirEscolha);

  assinar('derivados', avaliar);

  // Uma sessão em andamento (a página foi recarregada) continua de onde parou.
  const guardado = ler();
  if (guardado) {
    roteiro = guardado.roteiro;
    guardado.pulados.forEach((id) => pulados.add(id));
    const f = feitos();
    feitosAntes = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
    atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  }
  desenhar();
}
