// Operar o sistema na tela: faixa sobre a cena e cartões no painel da direita quando algo queima, desarma ou entra em falha,
// mais os blocos "queimado" que o painel do item selecionado reaproveita. Tarefa 8.4.
// Especificação: docs/especificacao/operar.md, seções 5 e 8. Os textos vêm de textosDeOperacao.ts.

import { CATALOGO } from '../catalogo';
import { acoes, assinar, estado, type EventoDeOperacao } from '../estado';
import { analisarCircuito } from '../nucleo/circuito';
import { bateriaPresente, type AlvoDeConserto, type CodigoDeConsequencia, circuitoDoCabo, consertar as consertarNoProjeto, estadoDaProtecao } from '../nucleo/operacao';
import type { Cabo, Dispositivo } from '../nucleo/tipos';
import { etiquetasDeTermos } from './aprender';
import { el, h, mostrarMensagem, substituir } from './formato';
import {
  type ChaveDeTexto, CONSERTO_DE_GRACA, chaveDoTexto, SE_LIGAR_DE_NOVO, type TextoDeOperacao, TEXTOS_DE_OPERACAO,
} from './textosDeOperacao';

const dispositivoDe = (uid: string): Dispositivo | undefined => estado.projeto.dispositivos.find((d) => d.uid === uid);
const caboDe = (uid: string): Cabo | undefined => estado.projeto.cabos.find((c) => c.uid === uid);

function categoriaDe(uid: string): string | undefined {
  const d = dispositivoDe(uid);
  return d ? CATALOGO.get(d.itemId)?.categoria : undefined;
}

function tipoDaProtecao(caboUid: string, indice: number): string | undefined {
  const id = caboDe(caboUid)?.protecoes[indice];
  const p = id === undefined ? undefined : CATALOGO.get(id);
  return p?.categoria === 'protecao' ? p.tipo : undefined;
}

// ---------------------------------------------------------------- O que está queimado

/** O alvo ainda está queimado? */
export function alvoPendente(alvo: AlvoDeConserto): boolean {
  if (alvo.tipo === 'dispositivo') return dispositivoDe(alvo.uid)?.queimado !== undefined;
  const c = caboDe(alvo.tipo === 'cabo' ? alvo.uid : alvo.cabo);
  if (!c) return false;
  return alvo.tipo === 'cabo' ? c.queimado !== undefined : estadoDaProtecao(c, alvo.indice) === 'queimada';
}

/** As peças, os cabos e as proteções queimados entre os `uids` de um evento. */
function alvosQueimados(uids: readonly string[]): AlvoDeConserto[] {
  const alvos: AlvoDeConserto[] = [];
  for (const uid of uids) {
    if (dispositivoDe(uid)?.queimado !== undefined) alvos.push({ tipo: 'dispositivo', uid });
    const c = caboDe(uid);
    if (!c) continue;
    if (c.queimado !== undefined) alvos.push({ tipo: 'cabo', uid });
    c.protecoes.forEach((_, indice) => {
      if (estadoDaProtecao(c, indice) === 'queimada') alvos.push({ tipo: 'protecao', cabo: uid, indice });
    });
  }
  return alvos;
}

/** "Trocar o fusível" quando tudo o que se conserta é fusível; "Consertar" nos demais casos. */
export function rotuloDoConserto(alvos: readonly AlvoDeConserto[]): string {
  const soFusiveis = alvos.length > 0 && alvos.every((a) => a.tipo === 'protecao' && tipoDaProtecao(a.cabo, a.indice) === 'fusivel');
  return soFusiveis ? 'Trocar o fusível' : 'Consertar';
}

export function consertarTudo(alvos: readonly AlvoDeConserto[]): void {
  const pendentes = alvos.filter(alvoPendente);
  for (const a of pendentes) acoes.consertar(a);
  if (pendentes.length > 0) mostrarMensagem('Consertado. No simulador é de graça; de verdade seria uma peça nova.');
}

/**
 * A causa continua lá? Conserta, em uma cópia, os alvos e confere a montagem inteira (como se tudo estivesse fechado):
 * se o erro de ligação que queimou a peça ainda existe, ligar de novo queima de novo. Falso quando a causa foi uma manobra
 * (soltar o conector com corrente) e não uma ligação: nesse caso o texto do evento já diz a regra geral.
 */
export function causaContinua(chave: ChaveDeTexto, alvos: readonly AlvoDeConserto[], uidDaPeca?: string): boolean {
  const apos = alvos.reduce((p, a) => consertarNoProjeto(p, a), estado.projeto);
  switch (chave) {
    case 'controlador-sem-bateria':
      return uidDaPeca !== undefined && !bateriaPresente(apos, CATALOGO, uidDaPeca);
    case 'bateria-invertida-inversor':
    case 'bateria-invertida-controlador':
      return analisarCircuito(apos, CATALOGO).problemas.some((p) => p.codigo === 'bateria-invertida');
    case 'curto-na-bateria-com-protecao':
    case 'curto-na-bateria-sem-protecao':
      return analisarCircuito(apos, CATALOGO).problemas.some((p) => p.codigo === 'curto-bateria');
    case 'arco-no-disjuntor-ca': {
      const analise = analisarCircuito(apos, CATALOGO);
      return alvos.some((a) => {
        if (a.tipo !== 'protecao' || tipoDaProtecao(a.cabo, a.indice) !== 'disjuntorCA') return false;
        const c = apos.cabos.find((x) => x.uid === a.cabo);
        const circuito = c ? circuitoDoCabo(apos, analise, c) : undefined;
        return circuito === 'bateria' || circuito === 'placas';
      });
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------- Corpo do texto (cartão e painel do item)

interface OpcoesDoCorpo {
  chave: ChaveDeTexto;
  alvos: readonly AlvoDeConserto[];
  /** Peça do erro, para conferir a bateria do controlador. */
  uidDaPeca?: string;
  /** Sem o botão: quando o comando já está em outro lugar do painel. */
  semBotao?: boolean;
  rotuloDoBotao?: string;
  /** O "Por quê?" já aberto (painel do item); nos cartões ele começa fechado. */
  porQueAberto?: boolean;
}

/** Termos do glossário que cada texto usa: etiquetas que abrem a explicação. */
const TERMOS: Partial<Record<ChaveDeTexto, string[]>> = {
  'controlador-sem-bateria': ['controlador-de-carga'],
  'bateria-invertida-inversor': ['polaridade', 'inversor'],
  'bateria-invertida-controlador': ['polaridade', 'controlador-de-carga'],
  'curto-na-bateria-com-protecao': ['curto-circuito', 'fusivel', 'disjuntor'],
  'curto-na-bateria-sem-protecao': ['curto-circuito', 'fusivel', 'disjuntor-cc'],
  'arco-no-conector': ['arco-eletrico', 'mc4', 'disjuntor-cc'],
  'arco-no-disjuntor-ca': ['arco-eletrico', 'disjuntor-ca', 'disjuntor-cc'],
  sobrecarga: ['inversor'],
  desarme: ['disjuntor'],
  'fusivel-queimou': ['fusivel'],
};

const porQuesAbertos = new Set<ChaveDeTexto>();

export function corpoDoTexto(texto: TextoDeOperacao, o: OpcoesDoCorpo): Node[] {
  const pendentes = o.alvos.filter(alvoPendente);
  const nos: Node[] = [
    h('p', { class: 'op-houve' }, texto.oQueHouve),
    h('p', { class: 'op-fazer' }, h('strong', null, 'O que fazer: '), texto.oQueFazer),
  ];
  if (pendentes.length > 0 && texto.antesDeConsertar && causaContinua(o.chave, pendentes, o.uidDaPeca)) {
    nos.push(h('p', { class: 'op-aviso-causa', 'data-aviso': 'queima-de-novo' }, h('strong', null, SE_LIGAR_DE_NOVO), ' ', texto.antesDeConsertar));
  }
  if (texto.estraga) nos.push(h('p', { class: 'op-de-graca' }, CONSERTO_DE_GRACA));
  if (pendentes.length > 0 && !o.semBotao) {
    const b = h('button', { type: 'button', class: 'op-consertar', 'data-acao': 'consertar' }, o.rotuloDoBotao ?? rotuloDoConserto(pendentes));
    b.addEventListener('click', () => consertarTudo(pendentes));
    nos.push(b);
  }
  // O "por quê", com a fonte em palavras: fica um clique abaixo, para o cartão não tomar o painel inteiro.
  // O cartão é redesenhado a cada mudança do projeto: o que o usuário abriu fica guardado, como no "Por quê?" do consultor.
  const porQue = h('details', { class: 'op-porque', open: o.porQueAberto === true || porQuesAbertos.has(o.chave) }, h('summary', null, 'Por quê?'), h('p', null, texto.porQue));
  if (o.porQueAberto !== true) {
    porQue.addEventListener('toggle', () => {
      if (porQue.open) porQuesAbertos.add(o.chave);
      else porQuesAbertos.delete(o.chave);
    });
  }
  if (texto.simplificacao) porQue.append(h('p', { class: 'op-simplificacao' }, texto.simplificacao));
  const termos = etiquetasDeTermos(TERMOS[o.chave] ?? [], 'etiqueta-termo');
  if (termos.length) porQue.append(h('p', { class: 'veja-tambem' }, h('span', null, 'Termos: '), ...termos));
  nos.push(porQue);
  return nos;
}

// ---------------------------------------------------------------- Texto de uma peça, de um cabo ou de uma proteção queimados

/** Texto de uma peça queimada, pelo dano gravado nela. */
export function chaveDaPecaQueimada(d: Dispositivo): ChaveDeTexto | null {
  if (d.queimado === undefined) return null;
  return chaveDoTexto(d.queimado.codigo, { inversor: categoriaDe(d.uid) === 'inversor', comProtecao: false });
}

/** Texto de um cabo queimado (curto sem proteção). */
export function chaveDoCaboQueimado(c: Cabo): ChaveDeTexto | null {
  return c.queimado === undefined ? null : chaveDoTexto(c.queimado.codigo, { comProtecao: false });
}

/** Texto de uma proteção queimada: o do último evento que a envolveu; sem ele, a regra geral do fusível. */
export function chaveDaProtecaoQueimada(caboUid: string): ChaveDeTexto | null {
  const eventos = estado.simulacao.eventos;
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i];
    if (!e.uids.includes(caboUid)) continue;
    if (e.codigo === 'fusivel-queimou' || e.codigo === 'arco-no-disjuntor-ca') return chaveDoTexto(e.codigo);
    if (e.codigo === 'curto-na-bateria') return chaveDoTexto(e.codigo, { comProtecao: true });
    if (e.codigo === 'bateria-invertida') return chaveDoTexto(e.codigo, { inversor: true });
  }
  return null;
}

// ---------------------------------------------------------------- Cartões e faixa

interface Cartao {
  evento: EventoDeOperacao;
  chave: ChaveDeTexto;
  alvos: AlvoDeConserto[];
  /** Algum dia houve algo a resolver: depois de resolvido, o cartão sai sozinho. */
  viu: boolean;
}

const LIMITE_DE_CARTOES = 4;
const MS_DA_FAIXA = 9000;

/** Há ainda algo a resolver neste cartão? */
function pendente(c: Cartao): boolean {
  if (c.alvos.length > 0) return c.alvos.some(alvoPendente);
  const uid = c.evento.uids[0];
  if (c.evento.codigo === 'sobrecarga') return uid !== undefined && dispositivoDe(uid)?.falha !== undefined;
  // Disjuntor que desarmou: pendente enquanto ele estiver aberto.
  if (c.evento.codigo === 'desarme' || c.evento.codigo === 'curto-na-bateria') {
    const cabo = uid === undefined ? undefined : caboDe(uid);
    return cabo !== undefined && cabo.protecoes.some((_, i) => estadoDaProtecao(cabo, i) === 'aberta' && tipoDaProtecao(cabo.uid, i)?.startsWith('disjuntor'));
  }
  return false;
}

function criarCartao(evento: EventoDeOperacao): Cartao {
  const alvos = alvosQueimados(evento.uids);
  const primeira = evento.uids[0];
  const chave = chaveDoTexto(evento.codigo, {
    inversor: primeira !== undefined && categoriaDe(primeira) === 'inversor',
    comProtecao: !evento.uids.some((u) => caboDe(u)?.queimado !== undefined),
  });
  const cartao: Cartao = { evento, chave, alvos, viu: false };
  cartao.viu = pendente(cartao);
  return cartao;
}

function desenharCartao(c: Cartao): HTMLElement {
  const texto = TEXTOS_DE_OPERACAO[c.chave];
  const raiz = h(
    'article',
    { class: `cartao-operacao${c.alvos.length > 0 ? ' estragou' : ''}`, 'data-evento': c.evento.codigo, 'data-chave': c.chave },
    h('p', { class: 'nivel' }, 'Operação'),
    h('h4', null, texto.titulo),
  );
  const extras: Node[] = [];
  const uid = c.evento.uids[0];
  if (c.evento.codigo === 'sobrecarga' && uid !== undefined && dispositivoDe(uid)?.falha !== undefined) {
    const religar = h('button', { type: 'button', class: 'op-consertar', 'data-acao': 'religar-inversor' }, 'Religar o inversor');
    religar.addEventListener('click', () => acoes.definirLigado(uid, true));
    extras.push(religar);
  }
  raiz.append(...corpoDoTexto(texto, { chave: c.chave, alvos: c.alvos, uidDaPeca: uid }), ...extras);

  const linha = h('div', { class: 'acoes-item' });
  const ver = h('button', { type: 'button', 'data-acao': 'ver-evento' }, 'Ver na cena');
  ver.addEventListener('click', () => {
    const alvo = c.evento.uids.find((u) => dispositivoDe(u) ?? caboDe(u));
    if (alvo === undefined) return;
    acoes.selecionar(dispositivoDe(alvo) ? { tipo: 'dispositivo', uid: alvo } : { tipo: 'cabo', uid: alvo });
  });
  const entendi = h('button', { type: 'button', 'data-acao': 'fechar-evento' }, 'Entendi');
  entendi.addEventListener('click', () => {
    cartoes = cartoes.filter((x) => x !== c);
    redesenhar();
  });
  linha.append(ver, entendi);
  raiz.append(linha);
  return raiz;
}

let cartoes: Cartao[] = [];
let redesenhar: () => void = () => undefined;

export function montarEventosDeOperacao(): void {
  const secao = h('section', { id: 'cartoes-operacao', 'aria-label': 'O que aconteceu na operação' });
  secao.hidden = true;
  // Logo abaixo do painel do item selecionado e acima das abas: o item escolhido continua sendo a primeira coisa que se vê.
  el<HTMLElement>('#direita').insertBefore(secao, el('#direita .abas'));

  const faixa = h('p', { id: 'faixa-operacao', class: 'faixa-operacao', role: 'status', hidden: true });
  el('#centro').append(faixa);
  let espera: ReturnType<typeof setTimeout> | null = null;

  redesenhar = (): void => {
    // O que já foi resolvido (consertado, religado, desfeito) sai do painel.
    cartoes = cartoes.filter((c) => {
      const aindaPendente = pendente(c);
      if (aindaPendente) c.viu = true;
      return aindaPendente || !c.viu;
    });
    secao.hidden = cartoes.length === 0;
    if (cartoes.length === 0) {
      faixa.hidden = true;
      delete secao.dataset.assinatura;
      secao.replaceChildren();
      return;
    }
    substituir(secao, cartoes.map(desenharCartao));
  };

  const visto = new WeakSet<EventoDeOperacao>(estado.simulacao.eventos);
  assinar('operacao', () => {
    const novos = estado.simulacao.eventos.filter((e) => !visto.has(e));
    for (const e of novos) visto.add(e);
    if (novos.length === 0) return;
    // O mais novo em cima. Cada dano gera um cartão.
    cartoes = [...novos.map(criarCartao).reverse(), ...cartoes].slice(0, LIMITE_DE_CARTOES);
    redesenhar();

    const principal = TEXTOS_DE_OPERACAO[cartoes[0]!.chave];
    faixa.textContent = novos.length > 1 ? `${principal.titulo}. E mais ${novos.length - 1} aviso${novos.length > 2 ? 's' : ''}: veja o painel da direita.` : `${principal.titulo}. Veja o painel da direita.`;
    faixa.hidden = false;
    if (espera) clearTimeout(espera);
    espera = setTimeout(() => (faixa.hidden = true), MS_DA_FAIXA);
  });
  // Desfazer, conserto e manobras mudam o que está pendente.
  for (const nome of ['dispositivos', 'cabos', 'projeto'] as const) assinar(nome, () => { if (cartoes.length > 0) redesenhar(); });
}

/** Só para a verificação e os testes de tela: o que está nos cartões. */
export function codigosDosCartoes(): CodigoDeConsequencia[] {
  return cartoes.map((c) => c.evento.codigo);
}
