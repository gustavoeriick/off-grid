// Modo passo a passo (tarefa 4.1). O conteúdo dos roteiros vem de src/conteudo/roteiros.ts; aqui se mostra o painel
// no canto da cena, se avança quando o passo fica feito e se guarda o andamento na sessão.
// O painel só reage ao evento 'derivados': ele chega logo depois de cada mudança do projeto, já com a análise nova,
// e é nela que os passos olham.

import { CATALOGO } from '../catalogo';
import {
  ERROS_GUIADOS, EXPERIMENTE_ERRAR, PARTES, ROTEIRO_TUTORIAL, roteiroPorId, ROTEIROS,
  type ErroGuiado, type Momento, type Passo, type Roteiro,
} from '../conteudo/roteiros';
import { acoes, assinar, emTutorial, estado, horaLocalDe, recalcularAgora, type EventoDeOperacao } from '../estado';
import { localDoProjeto } from '../nucleo/irradiancia';
import { posicaoSol } from '../nucleo/sol';
import { emUso, usoDe } from '../nucleo/uso';
import type { Aparelho } from '../catalogo/tipos';
import { criarSobreposto } from './aprender';
import { destacarCategoriaNoCatalogo, destacarNoCatalogo } from './catalogo';
import { brl, el, h, num, substituir } from './formato';
import { duracaoTexto, horaTexto } from './mostradores';

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
/** A lista de todos os passos começa fechada, para o painel cobrir pouco da cena. */
let listaAberta = false;

// ---------------------------------------------------------------- Tutorial e teste de autonomia

const MS_HORA = 3_600_000;
/** O teste termina quando a bateria esvazia ou quando passam 24 horas simuladas. */
const LIMITE_DO_TESTE_MS = 24 * MS_HORA;
const HORA_DO_TESTE = 18;

interface ResultadoDoTeste {
  /** `esvaziou`: a bateria acabou antes das 24 h. `passou`: aguentou as 24 h. `nao-funcionou`: os aparelhos não chegaram a funcionar. */
  tipo: 'esvaziou' | 'passou' | 'nao-funcionou';
  texto: string;
  aparelhos: string[];
  somaW: number;
}

/** `rodando` enquanto o relógio corre; `resultado` quando termina e o tempo fica parado. */
let teste:
  | { fase: 'rodando'; inicioMsUtc: number; intervencoes: number }
  | { fase: 'resultado'; resultado: ResultadoDoTeste }
  | null = null;
/** Por que o último teste foi cancelado, para o painel dizer. Some quando outro teste começa. */
let avisoDoTeste: string | null = null;

/** Verdadeiro enquanto o teste de autonomia roda: a faixa "A bateria acabou às…" sobre a cena não aparece (o resultado vai para o painel). */
export function emTesteDeAutonomia(): boolean {
  return teste?.fase === 'rodando';
}

const noTutorial = (): boolean => roteiro?.id === ROTEIRO_TUTORIAL.id;

/** 18:00 locais do dia que está na tela. */
function dezoitoHorasDoDia(): number {
  const fuso = (localDoProjeto(estado.projeto)?.fuso ?? -3) * MS_HORA;
  const dia = 24 * MS_HORA;
  const inicioDoDia = Math.floor((estado.tempo.msUtc + fuso) / dia) * dia - fuso;
  return inicioDoDia + HORA_DO_TESTE * MS_HORA;
}

function iniciarTeste(): void {
  if (!noTutorial() || indiceAtual() >= 0) return;
  const inicio = dezoitoHorasDoDia();
  // Os aparelhos têm horário típico de uso e, fora dele, não consomem: no teste ficam ligados o tempo todo (o horário não volta depois).
  for (const uid of estado.derivados.analise.sistema?.cargas ?? []) {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    if (d?.ligado && CATALOGO.get(d.itemId)?.categoria === 'aparelho') acoes.definirUso(uid, { inicio: 0, fim: 24 });
  }
  // Se a contagem sem rede já estava ligada, desliga antes: a contagem do teste começa agora, do zero.
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  acoes.definirTempo(inicio);
  acoes.recarregarBateria();
  avisoDoTeste = null;
  // Daqui em diante, qualquer salto do relógio ou "Bateria cheia" cancela o teste.
  teste = { fase: 'rodando', inicioMsUtc: inicio, intervencoes: estado.simulacao.intervencoes };
  acoes.alternarQuedaDeLuz();
  acoes.definirVelocidade(60);
  desenhar();
}

/** Para o relógio e encerra a contagem sem rede. */
function encerrarContagem(): void {
  acoes.definirVelocidade(0);
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
}

function cancelarTeste(motivo?: string): void {
  if (!teste) return;
  const rodando = teste.fase === 'rodando';
  teste = null;
  avisoDoTeste = motivo ?? null;
  if (rodando) encerrarContagem();
  desenhar();
}

/** Aparelhos ligados na saída do inversor e a soma do que eles pedem. */
function aparelhosLigados(): { nomes: string[]; somaW: number } {
  const nomes: string[] = [];
  let somaW = 0;
  for (const uid of estado.derivados.analise.sistema?.cargas ?? []) {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    if (!d || !d.ligado || item?.categoria !== 'aparelho') continue;
    nomes.push(item.nome);
    // A média é o que a simulação gasta (na geladeira, o motor liga e desliga).
    somaW += (item as Aparelho).mediaW;
  }
  return { nomes, somaW };
}

/** Confere se o teste acabou. Chamado a cada mudança da simulação. */
function acompanharTeste(): void {
  if (teste?.fase !== 'rodando') return;
  const sim = estado.simulacao;
  const inicio = teste.inicioMsUtc;
  // O usuário mexeu na contagem, no relógio ou na bateria: o teste deixou de valer.
  if (!sim.quedaDeLuz.ativa || estado.tempo.msUtc < inicio || sim.intervencoes !== teste.intervencoes) {
    return cancelarTeste('O teste foi cancelado porque o relógio, a data ou a bateria foram mexidos no meio dele. Teste de novo.');
  }
  // Um passo deixou de estar feito (a análise já está atualizada): o teste não vale mais.
  if (indiceAtual() >= 0) return cancelarTeste();
  const { nomes, somaW } = aparelhosLigados();
  let resultado: ResultadoDoTeste | null = null;
  const s = sim.saida;
  if (sim.quedaDeLuz.apagouMsUtc !== null) {
    // Os minutos são cortados nos dois horários, para a duração bater com o que a tela mostra.
    const minuto = (ms: number): number => Math.floor(ms / 60_000) * 60_000;
    const apagou = sim.quedaDeLuz.apagouMsUtc;
    resultado = {
      tipo: 'esvaziou',
      // Os 50 % (no chumbo) são a conta do simulador, não uma proteção garantida do inversor.
      texto:
        `A bateria segurou ${duracaoTexto(minuto(apagou) - minuto(inicio))}: das ${horaTexto(inicio)} às ${horaTexto(apagou)}. ` +
        `O simulador para a conta em ${Math.round(sim.estadoSim.soc * 100)} %, o limite saudável desta bateria. ` +
        'Na vida real, confira no manual em que tensão o seu inversor desliga.',
      aparelhos: nomes,
      somaW,
    };
  } else if (s.cargaPedidaW > 0 && s.cargaAtendidaW <= 0 && !sim.estadoSim.cortado) {
    // Os aparelhos pedem energia e não recebem, sem a bateria ter esvaziado: proteção da bateria ou sobrecarga do inversor.
    const motivo = s.avisos.includes('bms')
      ? 'a proteção da bateria cortou, porque os aparelhos pedem mais corrente do que ela pode dar'
      : s.avisos.includes('sobrecarga')
        ? 'os aparelhos pedem mais potência do que o inversor aguenta'
        : 'o sistema não conseguiu alimentar os aparelhos';
    resultado = {
      tipo: 'nao-funcionou',
      texto: `Os aparelhos não funcionaram: ${motivo}. Veja o aviso nos mostradores e as sugestões do consultor, troque o aparelho ou a peça e teste de novo.`,
      aparelhos: nomes,
      somaW,
    };
  } else if (estado.tempo.msUtc - inicio >= LIMITE_DO_TESTE_MS) {
    const pontos = sim.historico.filter((p) => p.msUtc >= inicio);
    const baixo = pontos.reduce<(typeof pontos)[number] | null>((m, p) => (m === null || p.soc < m.soc ? p : m), null);
    const pct = Math.round((baixo?.soc ?? sim.estadoSim.soc) * 100);
    const fim = Math.round(sim.estadoSim.soc * 100);
    // Só diz que a placa repôs tudo quando a bateria termina as 24 horas cheia de novo.
    const conclusao =
      fim >= 99
        ? 'De dia a placa repôs tudo o que foi gasto à noite.'
        : `Ao fim das 24 horas ela estava em ${num(fim)} %: a placa não repôs tudo. Mais placa ou menos consumo fecham a conta.`;
    resultado = {
      tipo: 'passou',
      texto: `A bateria passou de 24 horas. O ponto mais baixo foi ${num(pct)} %, às ${baixo ? horaTexto(baixo.msUtc) : horaTexto(estado.tempo.msUtc)}. ${conclusao}`,
      aparelhos: nomes,
      somaW,
    };
  }
  if (!resultado) {
    desenhar();
    return;
  }
  teste = { fase: 'resultado', resultado };
  jaTestou = true;
  encerrarContagem();
  desenhar();
}

// ---------------------------------------------------------------- Momento do relógio

/** O sol está acima do horizonte no relógio do simulador. */
function solNoCeu(): boolean {
  const local = localDoProjeto(estado.projeto);
  return local ? posicaoSol(estado.tempo.msUtc, local.lat, local.lon).elevacao > 0 : true;
}

function momento(): Momento {
  return {
    solNoCeu: solNoCeu(),
    horaLocal: horaLocalDe(estado.projeto, estado.tempo.msUtc),
    bateriaCheia: estado.simulacao.estadoSim.soc >= 0.995,
  };
}

/** Meio-dia local do dia que está na tela. */
function meioDiaDoDia(): number {
  return dezoitoHorasDoDia() - 6 * MS_HORA;
}

/** Há luz nas placas agora: o sol está no céu e elas poderiam entregar alguma potência. */
function comSolNasPlacas(): boolean {
  return solNoCeu() && estado.simulacao.saida.pvDisponivelW > 0;
}

/** Chave do que as frases de "agora" olham: muda quando o sol nasce ou se põe, ou quando a hora cheia muda. */
let chaveDoMomento = '';

function chaveDoMomentoAgora(): string {
  const m = momento();
  return `${m.solNoCeu}|${Math.floor(m.horaLocal)}|${m.bateriaCheia}|${comSolNasPlacas()}`;
}

// ---------------------------------------------------------------- Experimente errar (operar.md, seção 9)

/**
 * Os três erros guiados, depois do teste de autonomia. `erro` nulo é a lista. Os passos de um erro andam em ordem
 * (`passo` só cresce): quando o erro acontece, os passos do tutorial deixam de estar feitos, e o painel não pode
 * voltar a eles. `vistos` são os eventos que já existiam quando o erro começou.
 */
let errar:
  | { erro: null }
  | { erro: ErroGuiado; fase: 'antes' }
  | { erro: ErroGuiado; fase: 'porque' }
  | { erro: ErroGuiado; fase: 'passos'; passo: number; vistos: WeakSet<EventoDeOperacao> }
  | { erro: ErroGuiado; fase: 'feito' }
  | null = null;
const errosFeitos = new Set<string>();
/** Um teste de autonomia já terminou: o "Experimente errar" aparece no resumo. */
let jaTestou = false;

function eventosDesde(vistos: WeakSet<EventoDeOperacao>): EventoDeOperacao[] {
  return estado.simulacao.eventos.filter((e) => !vistos.has(e));
}

/** Todos os passos do tutorial estão feitos: o sistema está ligado e funcionando. */
const tutorialEmDia = (): boolean => indiceAtual() < 0;

function abrirErrar(): void {
  if (teste?.fase === 'rodando') return;
  teste = null;
  errar = { erro: null };
  desenhar();
}

function fecharErrar(): void {
  errar = null;
  desenhar();
}

function comecarErro(id: string): void {
  const erro = ERROS_GUIADOS.find((e) => e.id === id);
  if (!erro) return;
  errar = { erro, fase: 'antes' };
  desenhar();
}

function mostrarPorQue(): void {
  if (errar === null || errar.erro === null) return;
  errar = { erro: errar.erro, fase: 'porque' };
  desenhar();
}

function comecarPassosDoErro(): void {
  if (errar?.erro === null || errar === null) return;
  if (!tutorialEmDia()) return desenhar();
  errar = { erro: errar.erro, fase: 'passos', passo: 0, vistos: new WeakSet(estado.simulacao.eventos) };
  avancarErro();
}

/** Anda os passos do erro que já estão cumpridos. */
function avancarErro(): void {
  if (errar === null || errar.erro === null || errar.fase !== 'passos') return desenhar();
  const contexto = { eventos: eventosDesde(errar.vistos), tutorialEmDia: tutorialEmDia() };
  let i = errar.passo;
  while (i < errar.erro.passos.length && errar.erro.passos[i]!.feito(estado.projeto, CATALOGO, contexto)) i += 1;
  if (i >= errar.erro.passos.length) {
    errosFeitos.add(errar.erro.id);
    errar = { erro: errar.erro, fase: 'feito' };
  } else {
    errar.passo = i;
  }
  desenhar();
}

function botaoErrar(acao: string, rotulo: string, fn: () => void, extra: Record<string, string> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'passo-botao', 'data-acao': acao, ...extra }, rotulo);
  b.addEventListener('click', fn);
  return b;
}

function botaoSairDoTutorial(): HTMLButtonElement {
  return botaoErrar('sair', 'Sair do tutorial', sair);
}

/** De noite, o erro que precisa de sol oferece pôr o relógio ao meio-dia. */
function ofertaDeSol(erro: ErroGuiado): Node[] {
  if (!erro.precisaDeSol || comSolNasPlacas()) return [];
  return [
    h('p', { class: 'passo-dica', 'data-erro-nota': 'noite' }, 'Agora não há sol na placa no relógio do simulador: sem sol, o controlador só apaga e nada queima. Para ver o erro, ponha o relógio ao meio-dia.'),
    h('div', { class: 'passo-botoes' }, botaoErrar('meio-dia', 'Pôr o relógio ao meio-dia', () => acoes.definirTempo(meioDiaDoDia()))),
  ];
}

/** O aparelho grande fora do horário de uso não pede energia: oferece usá-lo o dia inteiro. */
function ofertaDeUso(erro: ErroGuiado): Node[] {
  if (!erro.aparelhoId) return [];
  const d = estado.projeto.dispositivos.find((x) => x.itemId === erro.aparelhoId);
  const item = d ? CATALOGO.get(d.itemId) : undefined;
  if (!d || item?.categoria !== 'aparelho') return [];
  const uso = usoDe(d, item);
  if (emUso(uso, horaLocalDe(estado.projeto, estado.tempo.msUtc))) return [];
  const uid = d.uid;
  return [
    h(
      'p',
      { class: 'passo-dica', 'data-erro-nota': 'horario' },
      `No simulador, o ${item.nome.toLowerCase()} só é usado das ${uso.inicio} às ${uso.fim} h, e o relógio está fora desse horário: ligado, ele não pediria energia. Use o botão abaixo para ele valer o dia inteiro.`,
    ),
    h('div', { class: 'passo-botoes' }, botaoErrar('dia-inteiro-erro', `Usar o ${item.nome.toLowerCase()} o dia inteiro`, () => acoes.definirUso(uid, { inicio: 0, fim: 24 }))),
  ];
}

function painelDeErrar(): Node[] {
  if (errar === null) return [];
  const cabeca = h('p', { class: 'passo-contagem' }, EXPERIMENTE_ERRAR.titulo, h('span', { class: 'passo-roteiro' }, ' · Tutorial'));
  const lista = botaoErrar('lista-de-erros', 'Voltar à lista', abrirErrar);

  if (errar.erro === null) {
    const emDia = tutorialEmDia();
    const f = feitos();
    const falta = roteiro?.passos[indiceAtual(f)];
    return semNulos([
      cabeca,
      h('p', { class: 'passo-texto' }, EXPERIMENTE_ERRAR.texto),
      h('p', { class: 'passo-dica' }, EXPERIMENTE_ERRAR.deVerdade),
      emDia || !falta
        ? null
        : h('p', { class: 'passo-dica', role: 'status', 'data-erro-nota': 'falta' }, `Para começar um erro, o sistema precisa estar ligado e funcionando. Falta: ${falta.titulo.toLowerCase()}. Volte ao tutorial para ver como.`),
      h(
        'div',
        { class: 'passo-botoes lista-de-erros' },
        ...ERROS_GUIADOS.map((erro, i) => {
          const feito = errosFeitos.has(erro.id);
          return botaoErrar('escolher-erro', `${i + 1}. ${erro.curto}${feito ? ' ✓' : ''}`, () => comecarErro(erro.id), { 'data-erro': erro.id, class: feito ? 'passo-botao erro-feito' : 'passo-botao', title: erro.titulo });
        }),
      ),
      h('div', { class: 'passo-botoes' }, botaoErrar('voltar-ao-teste', 'Voltar ao teste', fecharErrar), botaoSairDoTutorial()),
    ]);
  }

  const erro = errar.erro;
  const ordem = ERROS_GUIADOS.indexOf(erro) + 1;
  // Antes de começar, duas telas curtas (o painel não pode cobrir o quartinho): o que vai acontecer, e por quê.
  // "Começar" só aparece na segunda: ninguém começa sem ter lido as duas.
  const contagem = h('p', { class: 'passo-contagem' }, `${EXPERIMENTE_ERRAR.titulo} · ${ordem} de ${ERROS_GUIADOS.length}`);
  if (errar.fase === 'antes') {
    return [
      contagem,
      h('h4', { class: 'passo-titulo' }, erro.titulo),
      h('p', { class: 'passo-texto', 'data-erro-texto': 'o-que-vai-acontecer' }, h('strong', null, 'O que vai acontecer: '), erro.oQueVaiAcontecer),
      h('p', { class: 'passo-dica', 'data-erro-texto': 'de-verdade' }, erro.deVerdade),
      h('div', { class: 'passo-botoes' }, botaoErrar('por-que-erro', 'Por quê?', mostrarPorQue), lista, botaoSairDoTutorial()),
    ];
  }
  if (errar.fase === 'porque') {
    const emDia = tutorialEmDia();
    const falta = roteiro?.passos[indiceAtual()];
    const comecar = botaoErrar('comecar-erro', 'Começar', comecarPassosDoErro);
    if (!emDia) comecar.disabled = true;
    return semNulos([
      contagem,
      h('h4', { class: 'passo-titulo' }, erro.titulo),
      h('p', { class: 'passo-texto', 'data-erro-texto': 'por-que' }, h('strong', null, 'Por quê: '), erro.porQue),
      emDia || !falta ? null : h('p', { class: 'passo-dica', role: 'status', 'data-erro-nota': 'falta' }, `Antes, o sistema precisa estar ligado e funcionando. Falta: ${falta.titulo.toLowerCase()}.`),
      h('div', { class: 'passo-botoes' }, comecar, lista, botaoSairDoTutorial()),
    ]);
  }

  if (errar.fase === 'feito') {
    return [
      h('p', { class: 'passo-contagem' }, `${EXPERIMENTE_ERRAR.titulo} · ${ordem} de ${ERROS_GUIADOS.length}`),
      h('h4', { class: 'passo-titulo' }, `Pronto: ${erro.titulo.toLowerCase()}`),
      h('p', { class: 'passo-texto', 'data-erro-texto': 'licao' }, erro.licao),
      h('div', { class: 'passo-botoes' }, botaoErrar('lista-de-erros', 'Outro erro', abrirErrar), botaoErrar('voltar-ao-teste', 'Voltar ao teste', fecharErrar), botaoSairDoTutorial()),
    ];
  }

  const passo = erro.passos[errar.passo]!;
  const botoes = h('div', { class: 'passo-botoes' });
  if (passo.itemId || passo.categoria) {
    botoes.append(
      botaoErrar('catalogo', 'Mostrar no catálogo', () => {
        if (passo.itemId) destacarNoCatalogo(passo.itemId);
        else if (passo.categoria) destacarCategoriaNoCatalogo(passo.categoria);
      }),
    );
  }
  botoes.append(lista, botaoSairDoTutorial());
  return semNulos([
    h('p', { class: 'passo-contagem' }, `${erro.titulo} · passo ${errar.passo + 1} de ${erro.passos.length}`),
    h('h4', { class: 'passo-titulo' }, passo.titulo),
    h('p', { class: 'passo-texto' }, passo.texto),
    passo.dica ? h('p', { class: 'passo-dica' }, `Dica: ${passo.dica}`) : null,
    ...(errar.passo === 0 ? ofertaDeSol(erro) : []),
    ...(passo.id === 'ligar' ? ofertaDeUso(erro) : []),
    botoes,
  ]);
}

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
  if (noTutorial() && emTutorial()) {
    // Sair do tutorial devolve a casa guardada (o estado zera a simulação e os destaques) e fecha o painel.
    cancelarTeste();
    acoes.sairDoTutorial();
  }
  roteiro = null;
  teste = null;
  errar = null;
  pulados.clear();
  feitosAntes = new Set();
  atualAntes = null;
  feitoRecente = null;
  gravar();
  desenhar();
}

/** Troca a montagem por uma casa vazia (a mesma casa, sem dispositivos nem cabos) e começa o roteiro. */
function comecar(r: Roteiro): void {
  // Dentro do tutorial, outro roteiro pede a casa de volta: o tutorial fecha e a casa guardada é a base.
  if (emTutorial()) {
    cancelarTeste();
    acoes.sairDoTutorial();
  }
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

/** Abre o tutorial (só o quartinho, vazio; a casa fica guardada) e começa o roteiro. Não pede confirmação. */
export function iniciarTutorial(): void {
  acoes.entrarNoTutorial();
  recalcularAgora();
  teste = null;
  errar = null;
  errosFeitos.clear();
  jaTestou = false;
  comecarRoteiroDoTutorial();
}

function comecarRoteiroDoTutorial(): void {
  roteiro = ROTEIRO_TUTORIAL;
  pulados.clear();
  feitoRecente = null;
  const f = feitos();
  feitosAntes = new Set(ROTEIRO_TUTORIAL.passos.filter((_, i) => f[i]).map((p) => p.id));
  atualAntes = ROTEIRO_TUTORIAL.passos[indiceAtual(f)]?.id ?? null;
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

function resumoDoTutorial(r: Roteiro): Node[] {
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, 'Sair do tutorial');
  botaoSair.addEventListener('click', sair);
  const cabeca = h('p', { class: 'passo-contagem' }, r.titulo);

  if (teste?.fase === 'rodando') {
    const soc = Math.round(estado.simulacao.estadoSim.soc * 100);
    const cancelar = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'cancelar-teste' }, 'Cancelar o teste');
    cancelar.addEventListener('click', () => cancelarTeste());
    return [
      cabeca,
      h('h4', { class: 'passo-titulo' }, 'Testando a bateria…'),
      h('p', { class: 'passo-texto', 'data-teste': 'andamento' }, `Sem rede, a partir das ${horaTexto(teste.inicioMsUtc)}. Agora são ${horaTexto(estado.tempo.msUtc)} e a bateria está com ${num(soc)} %.`),
      h('p', { class: 'passo-dica' }, 'No teste, os aparelhos ligados ficam funcionando o tempo todo.'),
      h(
        'p',
        { class: 'passo-dica' },
        estado.tempo.velocidade > 0
          ? 'O relógio corre e para quando a bateria esvazia ou passam 24 horas simuladas. Mexer na data, na hora ou em "Bateria cheia" cancela o teste.'
          : 'O relógio está em pausa. Escolha uma velocidade na barra de baixo para o teste continuar.',
      ),
      h('div', { class: 'passo-botoes' }, cancelar, botaoSair),
    ];
  }

  if (teste?.fase === 'resultado') {
    const { resultado } = teste;
    const deNovo = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'testar-de-novo' }, 'Testar de novo');
    deNovo.addEventListener('click', iniciarTeste);
    const ligados =
      resultado.aparelhos.length > 0
        ? `Aparelhos ligados: ${resultado.aparelhos.join(', ')}, somando ${num(resultado.somaW)} W de consumo médio.`
        : 'Nenhum aparelho estava ligado na saída do inversor.';
    return [
      cabeca,
      h('h4', { class: 'passo-titulo' }, 'Resultado do teste'),
      h('p', { class: 'passo-texto', 'data-teste': resultado.tipo }, resultado.texto),
      h('p', { class: 'passo-texto', 'data-teste': 'aparelhos' }, ligados),
      h(
        'p',
        { class: 'passo-texto' },
        'Troque o aparelho e teste de novo. Micro-ondas e chuveiro passam dos 500 W do inversor.',
      ),
      h('div', { class: 'passo-botoes' }, deNovo, botaoErrar('experimente-errar', EXPERIMENTE_ERRAR.titulo, abrirErrar), botaoSair),
    ];
  }

  const e = estado.derivados.estimativas;
  const autonomia =
    e.autonomiaHoras === null
      ? 'A autonomia ainda não pôde ser calculada: falta bateria ou aparelho ligado na saída.'
      : `A bateria sustenta os aparelhos por cerca de ${num(e.autonomiaHoras, 1)} h sem sol e sem rede (autonomia).`;
  const testar = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'testar-bateria' }, 'Testar a bateria');
  testar.addEventListener('click', iniciarTeste);
  return semNulos([
    cabeca,
    h('h4', { class: 'passo-titulo' }, 'Montagem concluída'),
    avisoDoTeste ? h('p', { class: 'passo-dica', role: 'status', 'data-teste': 'cancelado' }, avisoDoTeste) : null,
    h('p', { class: 'passo-texto' }, autonomia),
    h('p', { class: 'passo-texto' }, `Orçamento total: ${brl(estado.derivados.orcamento.total)}. Os preços mudam: confira os anúncios antes de comprar.`),
    h('p', { class: 'passo-texto' }, `O teste põe o relógio às ${horaTexto(dezoitoHorasDoDia())} deste dia, enche a bateria, tira a rede e acelera o tempo até a bateria esvaziar ou passarem 24 horas.`),
    h('p', { class: 'passo-texto' }, 'No teste, os aparelhos ligados ficam funcionando o tempo todo.'),
    h('p', { class: 'passo-dica' }, 'O simulador ajuda a aprender e a planejar. Antes de comprar e instalar de verdade, mostre o plano a um eletricista habilitado.'),
    h('div', { class: 'passo-botoes' }, testar, jaTestou ? botaoErrar('experimente-errar', EXPERIMENTE_ERRAR.titulo, abrirErrar) : null, botaoSair),
  ]);
}

function resumo(r: Roteiro): Node[] {
  if (r.fim === 'teste-de-autonomia') return resumoDoTutorial(r);
  const e = estado.derivados.estimativas;
  const f = feitos();
  const puladosAgora = r.passos.filter((p, i) => pulados.has(p.id) && !f[i]).length;
  // Passo de ligar pulado: o sistema pode estar desligado, e o resumo não diz "concluída".
  const ligarPulados = r.passos.filter((p, i) => pulados.has(p.id) && !f[i] && p.parte === PARTES.ligar).length;
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
    h('h4', { class: 'passo-titulo' }, puladosAgora === 0 ? 'Montagem concluída' : 'Fim do roteiro'),
    h('p', { class: 'passo-texto' }, autonomia),
    h('p', { class: 'passo-texto' }, `Orçamento total: ${brl(estado.derivados.orcamento.total)}. Os preços mudam: confira os anúncios antes de comprar.`),
    puladosAgora > 0 ? h('p', { class: 'passo-dica' }, `Você pulou ${puladosAgora} ${puladosAgora === 1 ? 'passo' : 'passos'}: eles não foram conferidos.`) : null,
    ligarPulados > 0
      ? h('p', { class: 'passo-dica', 'data-resumo': 'ligar-pulado' }, 'Passos de ligar foram pulados: o sistema pode estar desligado. "Ligar o sistema", no menu Projeto, fecha as proteções e liga o inversor; os aparelhos se ligam com a mão.')
      : null,
    h('p', { class: 'passo-texto' }, 'Que tal simular uma queda de luz? Ela mostra se a bateria aguenta a casa sem a rede.'),
    h('p', { class: 'passo-dica' }, 'O simulador ajuda a aprender e a planejar. Antes de comprar e instalar de verdade, mostre o plano a um eletricista habilitado.'),
    h('div', { class: 'passo-botoes' }, botaoQueda, botaoSair),
  ]);
}

/** A frase de "agora" do passo (noite, aparelho fora do horário, peça queimada), em qualquer roteiro. */
function notaDoMomento(passo: Passo): HTMLElement | null {
  const texto = passo.agora?.(estado.projeto, CATALOGO, momento()) ?? null;
  return texto === null ? null : h('p', { class: 'passo-dica passo-agora', role: 'status', 'data-agora': passo.id }, texto);
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
  const tutorial = r.id === ROTEIRO_TUTORIAL.id;
  const pular = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'pular' }, 'Pular');
  pular.addEventListener('click', () => {
    const atualAgora = roteiro?.passos[indiceAtual()];
    if (!atualAgora) return;
    pulados.add(atualAgora.id);
    gravar();
    avaliar();
  });
  const verLista = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'lista', 'aria-expanded': String(listaAberta) }, listaAberta ? 'Esconder os passos' : 'Ver os passos');
  verLista.addEventListener('click', () => {
    listaAberta = !listaAberta;
    desenhar();
  });
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, tutorial ? 'Sair do tutorial' : 'Sair do passo a passo');
  botaoSair.addEventListener('click', sair);
  // No tutorial não se pula: o teste de autonomia no fim precisa do sistema inteiro montado.
  if (tutorial) botoes.append(verLista, botaoSair);
  else botoes.append(pular, verLista, botaoSair);

  const lista = h(
    'ol',
    { class: 'passo-lista', hidden: !listaAberta },
    ...r.passos.map((p, i) => {
      const situacao = f[i] ? 'feito' : pulados.has(p.id) ? 'pulado' : i === atual ? 'atual' : 'adiante';
      return h('li', { class: `passo-item ${situacao}`, 'data-passo-id': p.id }, h('span', { class: 'passo-marca', 'aria-hidden': 'true' }, marca(situacao)), h('span', null, p.titulo));
    }),
  );

  return semNulos([
    h('p', { class: 'passo-contagem' }, `Passo ${atual + 1} de ${r.passos.length}`, h('span', { class: 'passo-roteiro' }, ` · ${passo.parte ?? r.titulo}`)),
    feitoRecente ? h('p', { class: 'passo-feito', role: 'status' }, `Feito! ${feitoRecente}`) : null,
    h('h4', { class: 'passo-titulo' }, passo.titulo),
    h('p', { class: 'passo-texto' }, passo.texto),
    passo.dica ? h('p', { class: 'passo-dica' }, `Dica: ${passo.dica}`) : null,
    notaDoMomento(passo),
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
    delete painel.dataset.teste;
    painel.replaceChildren();
    acoes.definirDestaques([]);
    return;
  }
  chaveDoMomento = chaveDoMomentoAgora();
  if (errar !== null && noTutorial()) {
    // "Experimente errar": o painel segue os passos do erro, e não os do tutorial (o erro desfaz passos de propósito).
    const passoDoErro = errar.erro !== null && errar.fase === 'passos' ? errar.erro.passos[errar.passo] : undefined;
    acoes.definirDestaques(passoDoErro?.onde ? passoDoErro.onde(estado.projeto, CATALOGO) : []);
    painel.hidden = false;
    painel.dataset.roteiro = roteiro.id;
    delete painel.dataset.teste;
    painel.dataset.situacao = 'errar';
    painel.dataset.passo = 'errar';
    if (errar.erro === null) {
      delete painel.dataset.erro;
      painel.dataset.passoErro = 'lista';
    } else {
      painel.dataset.erro = errar.erro.id;
      painel.dataset.passoErro = errar.fase === 'passos' ? errar.erro.passos[errar.passo]!.id : errar.fase;
    }
    substituir(painel, painelDeErrar());
    return;
  }
  delete painel.dataset.erro;
  delete painel.dataset.passoErro;
  const f = feitos();
  const atual = indiceAtual(f);
  // O realce na cena: no tutorial e nos roteiros da casa (pedido do Gustavo em 17/11/2026), e só enquanto há um passo
  // da vez (no resumo e durante o teste, nada). Passo sem `onde` fica sem realce.
  const passoDaVez = atual >= 0 ? roteiro.passos[atual] : undefined;
  acoes.definirDestaques(passoDaVez?.onde ? passoDaVez.onde(estado.projeto, CATALOGO) : []);
  painel.hidden = false;
  painel.dataset.roteiro = roteiro.id;
  if (teste) painel.dataset.teste = teste.fase;
  else delete painel.dataset.teste;
  painel.dataset.situacao = atual < 0 ? 'resumo' : 'andamento';
  painel.dataset.passo = String(atual < 0 ? roteiro.passos.length : atual + 1);
  substituir(painel, atual < 0 ? resumo(roteiro) : emAndamento(roteiro, f, atual));
}

/** Confere os passos, mostra o "Feito!" quando o passo da vez acabou de ficar feito e redesenha. */
function avaliar(): void {
  // O projeto do tutorial está aberto (entrou por outro caminho): o tutorial começa.
  if (emTutorial() && !noTutorial()) return comecarRoteiroDoTutorial();
  // O projeto deixou de ser o do tutorial por outro caminho (abrir um arquivo, desfazer): o painel fecha.
  if (noTutorial() && !emTutorial()) {
    if (teste?.fase === 'rodando') encerrarContagem();
    teste = null;
    avisoDoTeste = null;
    errar = null;
    roteiro = null;
    pulados.clear();
    gravar();
    return desenhar();
  }
  if (!roteiro) return;
  if (errar !== null) return avancarErro();
  const f = feitos();
  // Um passo deixou de estar feito durante o teste: o teste não vale mais.
  if (teste && indiceAtual(f) >= 0) cancelarTeste();
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
  const botaoTutorial = h('button', { type: 'button', class: 'passo-botao passo-botao-principal', 'data-roteiro': ROTEIRO_TUTORIAL.id }, 'Fazer o tutorial');
  botaoTutorial.addEventListener('click', () => {
    fechar();
    iniciarTutorial();
  });
  corpo.append(
    h(
      'article',
      { class: 'roteiro-opcao roteiro-tutorial' },
      h('h4', null, ROTEIRO_TUTORIAL.titulo),
      h('p', null, ROTEIRO_TUTORIAL.paraQuem),
      h('p', { class: 'detalhe' }, `${ROTEIRO_TUTORIAL.passos.length} passos`),
      botaoTutorial,
    ),
  );
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
  assinar('simulacao', acompanharTeste);
  // O relógio andou: as frases que dependem da hora (noite, horário de uso) e a oferta de sol podem mudar.
  assinar('simulacao', () => {
    if (roteiro && teste?.fase !== 'rodando' && chaveDoMomentoAgora() !== chaveDoMomento) desenhar();
  });
  // Um dano do "Experimente errar" pode chegar com o relógio, antes da análise nova.
  assinar('operacao', () => {
    if (errar !== null) avancarErro();
  });

  // Uma sessão em andamento (a página foi recarregada) continua de onde parou.
  const guardado = ler();
  if (emTutorial()) {
    // O projeto do tutorial está aberto: continua o tutorial, mesmo sem nada guardado na sessão.
    roteiro = ROTEIRO_TUTORIAL;
    const f = feitos();
    feitosAntes = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
    atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  } else if (guardado && guardado.roteiro.id !== ROTEIRO_TUTORIAL.id) {
    roteiro = guardado.roteiro;
    guardado.pulados.forEach((id) => pulados.add(id));
    const f = feitos();
    feitosAntes = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
    atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  }
  desenhar();
}
