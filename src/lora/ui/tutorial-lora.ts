// Tutorial "Meu primeiro enlace" na tela do ambiente de LoRa, e o cartão da primeira abertura. Tarefa L4.2 (parte de tela).
// O conteúdo vem de src/lora/conteudo/tutorial.ts; aqui se mostra o painel no canto do mapa, se acompanha o projeto para
// avançar sozinho quando o passo fica feito e se guarda o andamento na sessão.
// Comportamento de referência: src/ui/passoAPasso.ts do ambiente solar (sem importar de lá).

import { assinarCalculo, rotaEntre, situacaoDoEnlace } from '../calculo';
import { idsFeitos, passosFeitos, TUTORIAL_LORA, textoDoPasso, type ContextoDoPasso, type SituacaoDaRota } from '../conteudo';
import { acoesLora, assinarLora, estadoLora } from '../estado';
import { abrirRegrasLora, abrirTermoLora, fecharSobrepostosLora } from './aprender';
import { h, mostrarMensagem } from './dom';

/** Nome do projeto que o tutorial cria. */
export const NOME_DO_PROJETO_DO_TUTORIAL = 'Tutorial: meu primeiro enlace';

const CHAVE_DA_SESSAO = 'offgrid.lora.tutorial';
const CHAVE_DA_PRIMEIRA_ABERTURA = 'offgrid.lora.primeira-abertura';

/** Botão da barra do mapa que cada passo pede, para ficar realçado enquanto o passo é o da vez. */
const FERRAMENTA_DO_PASSO: Record<string, string> = {
  'primeiro-ponto': '#lora-novo-ponto',
  'segundo-ponto': '#lora-novo-ponto',
  ligar: '#lora-ligar',
  repetidor: '#lora-sugerir',
};

type Modo = 'fechado' | 'pergunta' | 'andamento';

let modo: Modo = 'fechado';
/** O projeto da lista em que o tutorial está acontecendo. */
let projetoDoTutorial: string | null = null;
const vistos = new Set<string>();
let listaAberta = false;
/** O painel pode ser recolhido para cobrir menos do mapa: fica só a linha do passo. */
let recolhido = false;
/** Durante a criação do projeto do tutorial, a troca de projeto não deve fechá-lo. */
let trocandoPorAqui = false;

let painel: HTMLElement | null = null;
let cartao: HTMLElement | null = null;
let chaveDesenhada = '';
let cartaoDispensado = false;

// ---------------------------------------------------------------- Armazenamento

function lerSessao(): { projeto: string; vistos: string[] } | null {
  try {
    const texto = sessionStorage.getItem(CHAVE_DA_SESSAO);
    if (!texto) return null;
    const d = JSON.parse(texto) as { projeto?: unknown; vistos?: unknown };
    if (typeof d.projeto !== 'string' || !Array.isArray(d.vistos)) return null;
    return { projeto: d.projeto, vistos: d.vistos.filter((x): x is string => typeof x === 'string') };
  } catch {
    return null;
  }
}

function guardarSessao(): void {
  try {
    if (modo === 'andamento' && projetoDoTutorial) sessionStorage.setItem(CHAVE_DA_SESSAO, JSON.stringify({ projeto: projetoDoTutorial, vistos: [...vistos] }));
    else sessionStorage.removeItem(CHAVE_DA_SESSAO);
  } catch {
    // Sem armazenamento da sessão: o tutorial funciona, só não continua depois de recarregar.
  }
}

const primeiraAberturaVista = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_DA_PRIMEIRA_ABERTURA) === 'sim';
  } catch {
    return false;
  }
};

function lembrarPrimeiraAbertura(): void {
  try {
    localStorage.setItem(CHAVE_DA_PRIMEIRA_ABERTURA, 'sim');
  } catch {
    // Sem armazenamento: o cartão volta na próxima visita.
  }
}

// ---------------------------------------------------------------- O que o roteiro precisa saber

function situacaoDaRota(de: string, para: string): SituacaoDaRota {
  const r = rotaEntre(de, para);
  if (r === null) return 'calculando';
  if (r.rota) return r.rota.veredito === 'folga' ? 'fecha' : r.rota.veredito === 'limite' ? 'limite' : 'nao-fecha';
  return r.motivo === 'limite' ? 'passa-do-limite' : 'sem-ligacao';
}

function contexto(): ContextoDoPasso {
  return {
    selecao: estadoLora.selecao,
    vereditoDe(de, para) {
      const s = situacaoDoEnlace(de, para);
      if (!s) return null;
      if (s.estado === 'calculando') return 'calculando';
      if (s.estado === 'erro') return 'erro';
      return s.resultado.veredito;
    },
    rota: situacaoDaRota,
    vistos,
  };
}

/** Passo feito uma vez continua feito: depois de cada mudança, os passos cumpridos entram em `vistos`. */
function acrescentarOsFeitos(): void {
  if (modo !== 'andamento') return;
  const antes = vistos.size;
  for (const id of idsFeitos(estadoLora.projeto, contexto())) vistos.add(id);
  if (vistos.size !== antes) guardarSessao();
}

const idDoProjetoAberto = (): string | null => acoesLora.listarProjetos().find((p) => p.atual)?.id ?? null;

// ---------------------------------------------------------------- Realce do botão da barra do mapa

function realcar(seletor: string | null): void {
  for (const b of document.querySelectorAll('.lora-realce')) if (!seletor || !b.matches(seletor)) b.classList.remove('lora-realce');
  if (seletor) document.querySelector(seletor)?.classList.add('lora-realce');
}

// ---------------------------------------------------------------- Começar e sair

function sair(mensagem?: string): void {
  modo = 'fechado';
  recolhido = false;
  projetoDoTutorial = null;
  vistos.clear();
  listaAberta = false;
  guardarSessao();
  desenhar();
  if (mensagem) mostrarMensagem(mensagem);
}

function comecar(existente: string | null): void {
  fecharSobrepostosLora();
  trocandoPorAqui = true;
  try {
    if (existente) {
      if (!acoesLora.abrirProjeto(existente)) {
        mostrarMensagem('Não foi possível abrir o projeto do tutorial.', true);
        return;
      }
      projetoDoTutorial = existente;
    } else {
      projetoDoTutorial = acoesLora.criarProjeto(NOME_DO_PROJETO_DO_TUTORIAL, 'vazio');
    }
  } finally {
    trocandoPorAqui = false;
  }
  vistos.clear();
  listaAberta = false;
  recolhido = false;
  modo = 'andamento';
  cartaoDispensado = true;
  lembrarPrimeiraAbertura();
  acrescentarOsFeitos();
  guardarSessao();
  desenhar();
}

/** Botão "Tutorial" da barra do alto e "Fazer o tutorial" do cartão. */
export function iniciarTutorialLora(): void {
  const existente = acoesLora.listarProjetos().find((p) => p.nome === NOME_DO_PROJETO_DO_TUTORIAL);
  if (existente) {
    fecharSobrepostosLora();
    modo = 'pergunta';
    desenhar();
    return;
  }
  comecar(null);
}

// ---------------------------------------------------------------- Painel

function botao(rotulo: string, acao: string, aoClicar: () => void, principal = false): HTMLButtonElement {
  const b = h('button', { type: 'button', class: principal ? 'passo-botao passo-botao-principal' : 'passo-botao', 'data-acao': acao }, rotulo);
  b.addEventListener('click', aoClicar);
  return b;
}

function desenharPergunta(): void {
  if (!painel) return;
  const existente = acoesLora.listarProjetos().find((p) => p.nome === NOME_DO_PROJETO_DO_TUTORIAL);
  painel.replaceChildren(
    h('div', { class: 'passo-contagem' }, 'Tutorial'),
    h('h4', { class: 'passo-titulo' }, 'Você já tem um projeto do tutorial'),
    h('p', null, `Em "Meus projetos" já existe "${NOME_DO_PROJETO_DO_TUTORIAL}". Quer continuar nele ou começar outro, do zero? Os seus projetos não são mexidos.`),
    h(
      'div',
      { class: 'passo-botoes' },
      botao('Continuar nele', 'continuar-no-existente', () => comecar(existente?.id ?? null), true),
      botao('Começar outro', 'comecar-outro', () => comecar(null)),
      botao('Cancelar', 'cancelar', () => sair()),
    ),
  );
}

function desenharResumo(): void {
  if (!painel) return;
  painel.replaceChildren(
    h('div', { class: 'passo-contagem' }, 'Tutorial', h('span', { class: 'passo-roteiro' }, ` · ${TUTORIAL_LORA.titulo}`)),
    h('h4', { class: 'passo-titulo' }, 'Pronto: você leu o seu primeiro enlace'),
    h('p', { class: 'passo-feito' }, `${TUTORIAL_LORA.passos.length} passos feitos.`),
    h(
      'ul',
      { class: 'lora-proximos' },
      h('li', null, 'Para os lugares de verdade, crie outro projeto em "Projeto ▾", "Meus projetos". O do tutorial fica na lista; apague-o quando quiser.'),
      h('li', null, 'Leia o Glossário e as Regras da Anatel.'),
      h('li', null, 'Antes de comprar o resto, faça o teste de campo com dois rádios homologados.'),
    ),
    h(
      'div',
      { class: 'passo-botoes' },
      botao('Glossário', 'glossario', () => abrirTermoLora(), true),
      botao('Regras da Anatel', 'regras', () => abrirRegrasLora()),
      botao('Fechar', 'fechar', () => sair()),
    ),
  );
}

function desenhar(): void {
  if (!painel) return;
  atualizarCartao();
  if (modo === 'fechado') {
    painel.hidden = true;
    chaveDesenhada = '';
    realcar(null);
    return;
  }
  painel.hidden = false;
  if (modo === 'pergunta') {
    painel.classList.remove('recolhido');
    realcar(null);
    if (chaveDesenhada !== 'pergunta') {
      chaveDesenhada = 'pergunta';
      painel.dataset.modo = 'pergunta';
      delete painel.dataset.passo;
      desenharPergunta();
    }
    return;
  }

  const ctx = contexto();
  const projeto = estadoLora.projeto;
  const feitos = passosFeitos(projeto, ctx);
  const i = feitos.indexOf(false);
  const passos = TUTORIAL_LORA.passos;

  if (i === -1) {
    painel.classList.remove('recolhido');
    realcar(null);
    if (chaveDesenhada !== 'resumo') {
      chaveDesenhada = 'resumo';
      painel.dataset.modo = 'resumo';
      delete painel.dataset.passo;
      desenharResumo();
    }
    return;
  }

  const passo = passos[i]!;
  realcar(FERRAMENTA_DO_PASSO[passo.id] ?? null);
  const texto = textoDoPasso(passo, projeto, ctx);
  const chave = JSON.stringify([i, texto, listaAberta, recolhido, feitos]);
  if (chave === chaveDesenhada) return;
  chaveDesenhada = chave;
  painel.dataset.modo = 'passo';
  painel.dataset.passo = passo.id;
  painel.dataset.indice = String(i);

  const lista = listaAberta
    ? h(
        'ol',
        { class: 'passo-lista', id: 'lora-tutorial-lista' },
        ...passos.map((p, k) =>
          h(
            'li',
            { class: `passo-item${feitos[k] ? ' feito' : k === i ? ' atual' : ''}`, 'data-passo': p.id },
            h('span', { class: 'passo-marca', 'aria-hidden': 'true' }, feitos[k] ? '✓' : k === i ? '▸' : '○'),
            h('span', null, p.titulo),
          ),
        ),
      )
    : null;

  const botoes = h('div', { class: 'passo-botoes' });
  if (passo.acao === 'continuar') {
    botoes.append(
      botao(
        'Continuar',
        'continuar',
        () => {
          vistos.add(passo.id);
          guardarSessao();
          desenhar();
        },
        true,
      ),
    );
  }
  botoes.append(
    botao(listaAberta ? 'Esconder os passos' : 'Ver os passos', 'lista', () => {
      listaAberta = !listaAberta;
      desenhar();
    }),
    botao('Sair do tutorial', 'sair', () => sair()),
  );

  const recolher = h(
    'button',
    { type: 'button', class: 'lora-recolher', 'data-acao': 'recolher', 'aria-expanded': String(!recolhido), title: recolhido ? 'Mostra o texto do passo' : 'Esconde o texto do passo para ver mais do mapa' },
    recolhido ? 'Abrir ▴' : 'Recolher ▾',
  );
  recolher.addEventListener('click', () => {
    recolhido = !recolhido;
    desenhar();
  });
  painel.classList.toggle('recolhido', recolhido);
  const filhos: Node[] = [
    h('div', { class: 'passo-contagem lora-passo-cabeca' }, h('span', null, `Passo ${i + 1} de ${passos.length}`, h('span', { class: 'passo-roteiro' }, ` · ${TUTORIAL_LORA.titulo}`)), recolher),
    h('h4', { class: 'passo-titulo' }, passo.titulo),
  ];
  if (recolhido) {
    painel.replaceChildren(...filhos);
    return;
  }
  filhos.push(h('p', { class: 'lora-passo-texto' }, texto));
  if (passo.dica) filhos.push(h('p', { class: 'passo-dica' }, passo.dica));
  if (passo.acao !== 'continuar') filhos.push(h('p', { class: 'passo-dica lora-passo-faca' }, 'O tutorial avança sozinho quando você fizer isto no mapa.'));
  if (lista) filhos.push(lista);
  filhos.push(botoes);
  painel.replaceChildren(...filhos);
}

// ---------------------------------------------------------------- Cartão da primeira abertura

function atualizarCartao(): void {
  if (!cartao) return;
  const mostrar = modo === 'fechado' && !cartaoDispensado && estadoLora.projeto.pontos.length === 0 && !primeiraAberturaVista();
  cartao.hidden = !mostrar;
}

function montarCartao(raiz: HTMLElement): void {
  const entendi = h('button', { type: 'button', id: 'lora-primeira-entendi' }, 'Entendi');
  const fazer = h('button', { type: 'button', id: 'lora-primeira-tutorial', class: 'lora-principal' }, 'Fazer o tutorial');
  cartao = h(
    'section',
    { class: 'lora-primeira', id: 'lora-primeira', 'aria-label': 'Primeira vez neste ambiente', hidden: true },
    h('h4', null, 'Primeira vez por aqui?'),
    h(
      'p',
      null,
      'Este ambiente simula rádios LoRa, de longo alcance e baixo consumo: você marca pontos no mapa e o simulador diz se o sinal de um chega ao outro, levando em conta o relevo. O tutorial ensina a ler esse resultado do zero, com lugares quaisquer do mapa.',
    ),
    h('div', { class: 'lora-primeira-botoes' }, fazer, entendi),
  );
  fazer.addEventListener('click', () => iniciarTutorialLora());
  entendi.addEventListener('click', () => {
    cartaoDispensado = true;
    lembrarPrimeiraAbertura();
    atualizarCartao();
  });
  raiz.append(cartao);
}

// ---------------------------------------------------------------- Montagem

/** Monta o painel do tutorial e o cartão da primeira abertura dentro da área do mapa, e liga o botão "Tutorial" da barra do alto. */
export function montarTutorialLora(areaDoMapa: HTMLElement): void {
  painel = h('section', { class: 'passo-a-passo lora-tutorial', id: 'lora-tutorial', 'aria-label': 'Tutorial: meu primeiro enlace', hidden: true });
  areaDoMapa.append(painel);
  montarCartao(areaDoMapa);

  const botaoDoAlto = document.querySelector('#lora-aprender-tutorial');
  botaoDoAlto?.addEventListener('click', () => iniciarTutorialLora());

  // Recarregar a página continua de onde parou, se o projeto do tutorial ainda é o aberto.
  const guardado = lerSessao();
  if (guardado && guardado.projeto === idDoProjetoAberto()) {
    modo = 'andamento';
    projetoDoTutorial = guardado.projeto;
    for (const id of guardado.vistos) vistos.add(id);
  } else if (guardado) {
    guardarSessao();
  }

  const aoMudar = (): void => {
    acrescentarOsFeitos();
    // Passar a ter um ponto no projeto vazio já mostra que a pessoa sabe o que fazer: o cartão não volta.
    if (modo === 'fechado' && estadoLora.projeto.pontos.length > 0 && !primeiraAberturaVista()) lembrarPrimeiraAbertura();
    desenhar();
  };
  assinarLora('projeto', aoMudar);
  assinarLora('selecao', aoMudar);
  assinarCalculo(aoMudar);
  assinarLora('projetos', () => {
    if (modo === 'andamento' && !trocandoPorAqui && idDoProjetoAberto() !== projetoDoTutorial) {
      sair('O tutorial foi fechado porque você trocou de projeto. O projeto dele continua em "Meus projetos".');
      return;
    }
    desenhar();
  });
  acrescentarOsFeitos();
  desenhar();
}
