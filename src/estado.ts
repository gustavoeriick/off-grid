// Estado do aplicativo e ações. Arquivo do coordenador.
// Especificação: docs/especificacao/cena-e-interface.md, seção 10, e docs/especificacao/fase-2.md.
// Projeto editável (dispositivos, cabos, casa, obstáculos), seleção, desfazer, derivados, gravação,
// simulação no tempo (bateria, queda de luz) e clima real.

import { CATALOGO, grupoDoItem } from './catalogo';
import type { Categoria, Item, Protecao, Uso } from './catalogo/tipos';
import { cenarioPlanoNoPapel, cenarioTutorial } from './nucleo/cenarios';
import { analisarCircuito } from './nucleo/circuito';
import { ajustarParedesInternas } from './nucleo/comodos';
import { analisarConsultor, modulosDaProtecao } from './nucleo/consultor';
import { estadoInicial, passoSimulacao } from './nucleo/eletrica';
import { estimar } from './nucleo/estimativas';
import { baixarClimaDoDia } from './dados/openMeteo';
import { registrarClimaReal, temClimaReal } from './nucleo/climaReal';
import { irradianciaNasPlacas, localDoProjeto, localPorId } from './nucleo/irradiancia';
import { converterProjeto } from './nucleo/migracao';
import { calcularOrcamento } from './nucleo/orcamento';
import { podeLigar, terminaisDe } from './nucleo/terminais';
import type {
  Acao, AmbientePlacas, AnaliseCircuito, Cabo, CasaConfig, Clima, Comodo, Destaque, EstadoSim, Estimativas, Orcamento,
  Local, Obstaculo, ParedeInterna, PontaCabo, Prioridade, Projeto, Quat, SaidaPasso, Sugestao, Varanda, Vec3,
} from './nucleo/tipos';

export type ModoVisao = 'completa' | 'sem-telhado' | 'terreo';

export type Selecao =
  | { tipo: 'dispositivo'; uid: string }
  | { tipo: 'cabo'; uid: string }
  | { tipo: 'parede'; uid: string }
  | { tipo: 'varanda'; lado: Varanda['lado'] }
  | { tipo: 'quartinho' }
  | { tipo: 'obstaculo'; uid: string }
  | null;

/** Resultados recalculados depois de cada mudança do projeto. */
export interface Derivados {
  analise: AnaliseCircuito;
  estimativas: Estimativas;
  sugestoes: Sugestao[];
  orcamento: Orcamento;
}

/** Um ponto do gráfico da simulação, a cada 10 minutos simulados. */
export interface PontoHistorico {
  msUtc: number;
  /** Carga da bateria, de 0 a 1. */
  soc: number;
  /** Geração aproveitada, em W. */
  pvW: number;
  /** Consumo atendido, em W. */
  cargaW: number;
  /** Verdadeiro durante a queda de luz. */
  semRede: boolean;
}

export interface Simulacao {
  quedaDeLuz: {
    ativa: boolean;
    /** Instante em que a queda começou. */
    inicioMsUtc: number | null;
    /** Instante em que a bateria esvaziou durante a queda, se esvaziou. */
    apagouMsUtc: number | null;
  };
  estadoSim: EstadoSim;
  /** Resultado do último passo, para os mostradores. */
  saida: SaidaPasso;
  /** Últimas 48 horas simuladas. */
  historico: PontoHistorico[];
  /** Cresce a cada salto do relógio e a cada "Bateria cheia": quem mede algo ao longo do tempo sabe que foi interrompido. */
  intervencoes: number;
}

/** Situação das medições do clima real para o dia simulado. */
export interface ClimaReal {
  situacao: 'nenhum' | 'baixando' | 'pronto' | 'erro';
  /** Data de onde vieram as medições, no formato AAAA-MM-DD. Em data futura, é o mesmo dia de um ano anterior. */
  dataDosDados: string | null;
  fonte: string | null;
  /** Mensagem de erro, quando a situação é 'erro'. */
  mensagem: string | null;
}

export interface EstadoApp {
  projeto: Projeto;
  tempo: {
    /** Instante simulado, em milissegundos UTC. */
    msUtc: number;
    /** Minutos simulados por segundo real. Zero é pausa. */
    velocidade: number;
  };
  visao: ModoVisao;
  selecao: Selecao;
  /** Modo "Editar casa": quartinho, varandas, paredes internas e cômodos respondem ao ponteiro; os equipamentos não. */
  edicaoCasa: { ativa: boolean; andar: 0 | 1 };
  derivados: Derivados;
  simulacao: Simulacao;
  climaReal: ClimaReal;
  /** O que a cena realça para guiar o passo da vez do tutorial. Não entra no projeto nem no histórico. */
  destaques: Destaque[];
}

/**
 * 'projeto' avisa qualquer mudança no projeto. Os demais são recortes dele, avisados antes:
 * 'casa' (medidas, orientação, varandas, paredes internas, cômodos, quartinho), 'dispositivos' e 'cabos'.
 * 'derivados' avisa quando análise, estimativas, sugestões e orçamento foram recalculados.
 */
export type Evento = 'projeto' | 'casa' | 'dispositivos' | 'cabos' | 'selecao' | 'edicao' | 'tempo' | 'visao' | 'derivados' | 'simulacao' | 'clima' | 'destaques';

const EVENTOS: Evento[] = ['projeto', 'casa', 'dispositivos', 'cabos', 'selecao', 'edicao', 'tempo', 'visao', 'derivados', 'simulacao', 'clima', 'destaques'];
const ouvintes = Object.fromEntries(EVENTOS.map((e) => [e, new Set<() => void>()])) as Record<Evento, Set<() => void>>;

/** 21/06/2026 ao meio-dia no Rio (UTC − 3). */
const INSTANTE_INICIAL = Date.UTC(2026, 5, 21, 15, 0, 0);

const CHAVE = 'offgrid.projeto.v2';
const CHAVE_V1 = 'offgrid.projeto.v1';
const CHAVE_INVALIDO = 'offgrid.projeto.invalido';
/** O projeto da casa, guardado enquanto o tutorial está aberto. */
const CHAVE_CASA = 'offgrid.projeto.casa';
const ESPERA_DERIVADOS_MS = 150;
const ESPERA_GRAVAR_MS = 500;
const LIMITE_HISTORICO = 50;

// ---------------------------------------------------------------- Ambiente das placas

/** Normal da face de uma peça (o eixo Z dela), em coordenadas do mundo. */
export function normalNoMundo(quat: Quat, orientacaoGraus: number): Vec3 {
  const [x, y, z, w] = quat;
  const nx = 2 * (x * z + w * y);
  const ny = 2 * (y * z - w * x);
  const nz = 1 - 2 * (x * x + y * y);
  const t = Math.PI - (orientacaoGraus * Math.PI) / 180;
  return [nx * Math.cos(t) + nz * Math.sin(t), ny, -nx * Math.sin(t) + nz * Math.cos(t)];
}

/** Projeto que o ambiente padrão consulta: o do cálculo em andamento. */
let projetoDoAmbiente: Projeto;

/** Até a cena registrar o cálculo de sombra (fase 3), vale a orientação de cada placa, sem sombra. */
const ambientePadrao: AmbientePlacas = {
  normal(uid) {
    const d = projetoDoAmbiente.dispositivos.find((x) => x.uid === uid);
    return d ? normalNoMundo(d.quat, projetoDoAmbiente.casa.orientacaoGraus) : [0, 1, 0];
  },
  sombra: () => 0,
  ceuTapado: () => 0,
};
let ambiente: AmbientePlacas = ambientePadrao;

/** A cena entrega aqui o cálculo de sombra das placas. */
export function registrarAmbiente(novo: AmbientePlacas | null): void {
  ambiente = novo ?? ambientePadrao;
  agendarDerivados();
}

// ---------------------------------------------------------------- Estado

function calcularDerivados(projeto: Projeto, msUtc: number): Derivados {
  projetoDoAmbiente = projeto;
  const analise = analisarCircuito(projeto, CATALOGO);
  const estimativas = estimar(projeto, CATALOGO, analise, ambiente, msUtc);
  return {
    analise,
    estimativas,
    sugestoes: analisarConsultor(projeto, CATALOGO, analise, estimativas),
    orcamento: calcularOrcamento(projeto, CATALOGO),
  };
}

/** Confere o mínimo da forma de um projeto antes de aceitá-lo. Lança erro com mensagem para o usuário. */
function conferirEstrutura(projeto: Projeto): void {
  const casa = projeto.casa as Partial<CasaConfig> | undefined;
  const listas: unknown[] = [projeto.dispositivos, projeto.cabos, casa?.varandas, casa?.paredesInternas, casa?.comodos];
  if (!casa || listas.some((l) => !Array.isArray(l)) || !casa.quartinho) {
    throw new Error('Este arquivo não é um projeto do simulador, ou está incompleto.');
  }
}

/** Tira do projeto o que ficou apontando para peça que não existe mais: cabos sem ponta e cabos em quadro removido. */
function sanear(projeto: Projeto): void {
  const pecas = new Map(projeto.dispositivos.map((d) => [d.uid, d]));
  const ehQuadro = (uid: string): boolean => {
    const item = CATALOGO.get(pecas.get(uid)?.itemId ?? '');
    return item?.categoria === 'acessorio' && item.tipo === 'quadro';
  };
  const ehGrampo = (uid: string): boolean => {
    const item = CATALOGO.get(pecas.get(uid)?.itemId ?? '');
    return item?.categoria === 'acessorio' && item.tipo === 'grampo';
  };
  let mudou = false;
  const cabos: Cabo[] = [];
  /** Grampos já tomados por um cabo: cada grampo prende um cabo só. */
  const presos = new Set<string>();
  for (let c of projeto.cabos) {
    if (!pecas.has(c.de.disp) || !pecas.has(c.para.disp)) {
      mudou = true;
      continue;
    }
    if (c.grampos !== undefined) {
      const validos = c.grampos.filter((g) => ehGrampo(g) && !presos.has(g));
      validos.forEach((g) => presos.add(g));
      if (validos.length !== c.grampos.length) {
        mudou = true;
        c = { ...c, grampos: validos };
      }
    }
    if (c.quadro !== null && c.quadro !== undefined && !ehQuadro(c.quadro)) {
      mudou = true;
      cabos.push({ ...c, quadro: null });
    } else {
      cabos.push(c);
    }
  }
  if (mudou) projeto.cabos = cabos;
  // Grampo que não prende cabo nenhum (o cabo foi apagado) sai junto.
  if (projeto.dispositivos.some((d) => ehGrampo(d.uid) && !presos.has(d.uid))) {
    projeto.dispositivos = projeto.dispositivos.filter((d) => !ehGrampo(d.uid) || presos.has(d.uid));
  }
}

function armazenamento(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Projeto gravado no navegador, convertido se for da versão 1. Sem gravação, o cenário "plano no papel". */
function projetoInicial(): Projeto {
  const guarda = armazenamento();
  const texto = guarda?.getItem(CHAVE) ?? guarda?.getItem(CHAVE_V1);
  if (texto) {
    try {
      const projeto = converterProjeto(JSON.parse(texto));
      conferirEstrutura(projeto);
      calcularDerivados(projeto, INSTANTE_INICIAL);
      return projeto;
    } catch (erro) {
      console.warn('O projeto gravado não pôde ser aberto; abrindo o cenário inicial.', erro);
      // O texto que não abriu fica guardado em outra chave, para não se perder.
      try {
        guarda?.setItem(CHAVE_INVALIDO, texto);
        guarda?.removeItem(CHAVE);
      } catch {
        // Sem espaço ou sem permissão: segue com o cenário inicial.
      }
    }
  }
  return cenarioPlanoNoPapel();
}

// ---------------------------------------------------------------- Simulação no tempo (seção 11 da especificação da cena)

const PASSO_MAXIMO_MIN = 5;
const INTERVALO_HISTORICO_MS = 10 * 60_000;
const JANELA_HISTORICO_MS = 48 * 3_600_000;

/** Hora local decimal, de 0 a 24, no fuso do local do projeto. */
export function horaLocalDe(projeto: Projeto, msUtc: number): number {
  const fuso = localDoProjeto(projeto)?.fuso ?? 0;
  const ms = (((msUtc + fuso * 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000;
  return ms / 3_600_000;
}

/** Número do dia local, no fuso do local do projeto. */
function diaLocalDe(projeto: Projeto, msUtc: number): number {
  const fuso = localDoProjeto(projeto)?.fuso ?? 0;
  return Math.floor((msUtc + fuso * 3_600_000) / 86_400_000);
}

/** Um passo do núcleo, de `dtHoras`, com as condições do instante `msUtc`. */
function passo(projeto: Projeto, analise: AnaliseCircuito, sim: EstadoSim, msUtc: number, dtHoras: number, semRede: boolean): SaidaPasso {
  projetoDoAmbiente = projeto;
  const local = localDoProjeto(projeto);
  const placas = local ? irradianciaNasPlacas(projeto, CATALOGO, local, msUtc, ambiente) : new Map();
  return passoSimulacao(projeto, CATALOGO, analise, sim, {
    dtHoras,
    redeDisponivel: !semRede,
    horaLocal: horaLocalDe(projeto, msUtc),
    placas,
  });
}

const projetoDeAbertura = projetoInicial();

export const estado: EstadoApp = {
  projeto: projetoDeAbertura,
  tempo: { msUtc: INSTANTE_INICIAL, velocidade: 0 },
  visao: 'completa',
  selecao: null,
  edicaoCasa: { ativa: false, andar: 0 },
  derivados: calcularDerivados(projetoDeAbertura, INSTANTE_INICIAL),
  simulacao: undefined as unknown as Simulacao,
  climaReal: { situacao: 'nenhum', dataDosDados: null, fonte: null, mensagem: null },
  destaques: [],
};

/** Verdadeiro com o projeto do tutorial aberto: só o quartinho existe. */
export function emTutorial(): boolean {
  return estado.projeto.casa.soQuartinho === true;
}

estado.simulacao = {
  quedaDeLuz: { ativa: false, inicioMsUtc: null, apagouMsUtc: null },
  estadoSim: estadoInicial(),
  saida: passo(estado.projeto, estado.derivados.analise, estadoInicial(), INSTANTE_INICIAL, 0, false),
  historico: [],
  intervencoes: 0,
};

/** Registra uma função chamada a cada mudança do tipo dado. Devolve a função que cancela o registro. */
export function assinar(evento: Evento, fn: () => void): () => void {
  ouvintes[evento].add(fn);
  return () => ouvintes[evento].delete(fn);
}

function avisar(evento: Evento): void {
  for (const fn of [...ouvintes[evento]]) fn();
}

let esperaDerivados: ReturnType<typeof setTimeout> | null = null;
let esperaGravar: ReturnType<typeof setTimeout> | null = null;

function agendarDerivados(): void {
  if (esperaDerivados) clearTimeout(esperaDerivados);
  esperaDerivados = setTimeout(recalcularAgora, ESPERA_DERIVADOS_MS);
}

/** Recalcula os derivados na hora. Os testes e o roteiro de verificação usam para não esperar os 150 ms. */
export function recalcularAgora(): void {
  if (esperaDerivados) clearTimeout(esperaDerivados);
  esperaDerivados = null;
  estado.derivados = calcularDerivados(estado.projeto, estado.tempo.msUtc);
  avisar('derivados');
  atualizarMostradores();
}

// ---------------------------------------------------------------- Clima real

const MS_DIA = 86_400_000;
/** Dias (cidade e dia local) com download em andamento ou que falharam, para não repetir o pedido. */
const pedidos = new Map<string, 'baixando' | 'erro'>();
/** De onde vieram as medições de cada dia já baixado. */
const origens = new Map<string, { dataDosDados: string; fonte: string }>();

function chaveDoDia(local: Local, msUtc: number): string {
  return `${local.id}:${Math.floor((msUtc + local.fuso * 3_600_000) / MS_DIA)}`;
}

function definirClimaReal(novo: ClimaReal): void {
  const a = estado.climaReal;
  if (a.situacao === novo.situacao && a.dataDosDados === novo.dataDosDados && a.fonte === novo.fonte && a.mensagem === novo.mensagem) return;
  estado.climaReal = novo;
  avisar('clima');
}

/**
 * Com o clima 'real' escolhido, baixa as medições do dia simulado quando ainda não estão na memória.
 * Enquanto não chegam, ou se a rede falha, o cálculo usa o clima típico e a tela avisa.
 * A situação mostrada é sempre a do dia, da cidade e do projeto atuais.
 */
function conferirClimaReal(): void {
  const projeto = estado.projeto;
  const local = localDoProjeto(projeto);
  if (projeto.clima !== 'real' || !local) {
    definirClimaReal({ situacao: 'nenhum', dataDosDados: null, fonte: null, mensagem: null });
    return;
  }
  const msUtc = estado.tempo.msUtc;
  const chave = chaveDoDia(local, msUtc);
  if (temClimaReal(local.id, msUtc)) {
    const origem = origens.get(chave);
    definirClimaReal({ situacao: 'pronto', dataDosDados: origem?.dataDosDados ?? null, fonte: origem?.fonte ?? null, mensagem: null });
    return;
  }
  const pedido = pedidos.get(chave);
  if (pedido === 'baixando') {
    definirClimaReal({ situacao: 'baixando', dataDosDados: null, fonte: null, mensagem: null });
    return;
  }
  if (pedido === 'erro') return;
  pedidos.set(chave, 'baixando');
  definirClimaReal({ situacao: 'baixando', dataDosDados: null, fonte: null, mensagem: null });
  const ehODiaAtual = (): boolean => {
    const atual = localDoProjeto(estado.projeto);
    return estado.projeto.clima === 'real' && !!atual && chaveDoDia(atual, estado.tempo.msUtc) === chave;
  };
  baixarClimaDoDia(local, msUtc).then(
    (baixado) => {
      registrarClimaReal(local.id, baixado.dados);
      pedidos.delete(chave);
      origens.set(chave, { dataDosDados: baixado.dataDosDados, fonte: baixado.fonte });
      if (!ehODiaAtual()) return;
      conferirClimaReal();
      recalcularAgora();
    },
    (erro: unknown) => {
      pedidos.set(chave, 'erro');
      if (!ehODiaAtual()) return;
      definirClimaReal({
        situacao: 'erro',
        dataDosDados: null,
        fonte: null,
        mensagem: erro instanceof Error ? erro.message : 'Não consegui baixar o clima deste dia.',
      });
    },
  );
}

/** Zera a simulação: bateria cheia, sem queda de luz, histórico vazio. Usado ao abrir ou começar um projeto. */
function zerarSimulacao(): void {
  estado.simulacao.quedaDeLuz = { ativa: false, inicioMsUtc: null, apagouMsUtc: null };
  estado.simulacao.estadoSim = estadoInicial();
  estado.simulacao.historico = [];
}

/** Passo de duração zero: atualiza os mostradores sem gastar bateria. */
function atualizarMostradores(): void {
  const sim = estado.simulacao;
  sim.saida = passo(estado.projeto, estado.derivados.analise, sim.estadoSim, estado.tempo.msUtc, 0, sim.quedaDeLuz.ativa);
  avisar('simulacao');
}

function registrarNoHistorico(msUtc: number, saida: SaidaPasso): void {
  const sim = estado.simulacao;
  const ultimo = sim.historico[sim.historico.length - 1];
  if (ultimo && msUtc < ultimo.msUtc) sim.historico = [];
  else if (ultimo && msUtc - ultimo.msUtc < INTERVALO_HISTORICO_MS) return;
  sim.historico.push({ msUtc, soc: saida.estado.soc, pvW: saida.pvW, cargaW: saida.cargaAtendidaW, semRede: sim.quedaDeLuz.ativa });
  const limite = msUtc - JANELA_HISTORICO_MS;
  while (sim.historico.length > 0 && sim.historico[0]!.msUtc < limite) sim.historico.shift();
}

function agendarGravacao(): void {
  if (esperaGravar) clearTimeout(esperaGravar);
  esperaGravar = setTimeout(() => {
    esperaGravar = null;
    try {
      armazenamento()?.setItem(CHAVE, JSON.stringify(estado.projeto));
    } catch (erro) {
      console.warn('Não foi possível gravar o projeto no navegador.', erro);
    }
  }, ESPERA_GRAVAR_MS);
}

// ---------------------------------------------------------------- Histórico (desfazer e refazer)

/** Cópia em memória do projeto da casa enquanto o tutorial está aberto, para quando o navegador não deixa gravar. */
let casaGuardada: string | null = null;

/** Guarda o projeto atual (a casa) à parte, antes de o projeto do tutorial tomar o lugar dele. */
function guardarCasa(): void {
  const texto = JSON.stringify(estado.projeto);
  try {
    armazenamento()?.setItem(CHAVE_CASA, texto);
  } catch (erro) {
    console.warn('Não foi possível guardar o projeto da casa antes do tutorial.', erro);
  }
  casaGuardada = texto;
}

const passado: string[] = [];
const futuro: string[] = [];
/** O que havia para refazer antes do arraste em andamento, para devolver se ele for cancelado. */
let futuroAntesDoArraste: string[] = [];

type Recorte = 'casa' | 'dispositivos' | 'cabos';

interface OpcoesMudanca {
  /** Falso durante um arraste: o ponto de retorno é marcado uma vez, no começo, com `marcarHistorico`. */
  historico?: boolean;
}

function guardarNoHistorico(): void {
  passado.push(JSON.stringify(estado.projeto));
  if (passado.length > LIMITE_HISTORICO) passado.shift();
  futuro.length = 0;
}

function depoisDeMudar(recortes: Recorte[]): void {
  sanear(estado.projeto);
  limparSelecaoOrfa();
  for (const r of recortes) avisar(r);
  avisar('projeto');
  agendarDerivados();
  agendarGravacao();
}

function mudar(recortes: Recorte[], opcoes: OpcoesMudanca | undefined, fn: (p: Projeto) => void): void {
  if (opcoes?.historico !== false) guardarNoHistorico();
  fn(estado.projeto);
  depoisDeMudar(recortes);
}

function trocarProjeto(novo: Projeto): void {
  estado.projeto = novo;
  depoisDeMudar(['casa', 'dispositivos', 'cabos']);
  conferirClimaReal();
}

function limparSelecaoOrfa(): void {
  const s = estado.selecao;
  if (!s) return;
  const p = estado.projeto;
  const existe =
    s.tipo === 'dispositivo' ? p.dispositivos.some((d) => d.uid === s.uid)
    : s.tipo === 'cabo' ? p.cabos.some((c) => c.uid === s.uid)
    : s.tipo === 'parede' ? p.casa.paredesInternas.some((w) => w.uid === s.uid)
    : s.tipo === 'varanda' ? p.casa.varandas.some((v) => v.lado === s.lado)
    : s.tipo === 'obstaculo' ? (p.obstaculos ?? []).some((o) => o.uid === s.uid)
    : true;
  if (!existe) {
    estado.selecao = null;
    avisar('selecao');
  }
}

// ---------------------------------------------------------------- Auxiliares

function novoUid(prefixo: string, usados: Iterable<string>): string {
  const conjunto = new Set(usados);
  let maior = 0;
  for (const uid of conjunto) {
    if (!uid.startsWith(prefixo)) continue;
    const numero = Number(uid.slice(prefixo.length));
    if (Number.isInteger(numero) && numero > maior) maior = numero;
  }
  let n = Math.max(maior, conjunto.size) + 1;
  while (conjunto.has(`${prefixo}${n}`)) n += 1;
  return `${prefixo}${n}`;
}

function itemDe(projeto: Projeto, uidDispositivo: string): Item | undefined {
  const d = projeto.dispositivos.find((x) => x.uid === uidDispositivo);
  return d ? CATALOGO.get(d.itemId) : undefined;
}

function tipoDoTerminal(projeto: Projeto, ponta: PontaCabo) {
  const item = itemDe(projeto, ponta.disp);
  return item ? terminaisDe(item).find((t) => t.id === ponta.terminal)?.tipo : undefined;
}

/** Tipo inicial do cabo, pela seção 8 da especificação da cena. */
function caboInicial(projeto: Projeto, de: PontaCabo, para: PontaCabo): string {
  const solar = [de, para].some(
    (p) => itemDe(projeto, p.disp)?.categoria === 'placa' || p.terminal === 'pvPos' || p.terminal === 'pvNeg',
  );
  if (solar) return 'cabo-solar-6';
  return tipoDoTerminal(projeto, de) === 'ca' ? 'cabo-ca-2p5' : 'cabo-bat-35';
}

/** Motivo de um cabo não poder ser criado entre as duas pontas, ou nulo se pode. */
export function motivoParaNaoLigar(de: PontaCabo, para: PontaCabo): string | null {
  const p = estado.projeto;
  if (de.disp === para.disp && de.terminal === para.terminal) return 'É o mesmo terminal.';
  const a = tipoDoTerminal(p, de);
  const b = tipoDoTerminal(p, para);
  if (!a || !b) return 'Terminal desconhecido.';
  if (!podeLigar(a, b)) return 'Corrente contínua não se liga em corrente alternada.';
  const igual = (x: PontaCabo, y: PontaCabo): boolean => x.disp === y.disp && x.terminal === y.terminal;
  const repetido = p.cabos.some((c) => (igual(c.de, de) && igual(c.para, para)) || (igual(c.de, para) && igual(c.para, de)));
  return repetido ? 'Já existe um cabo entre estes dois terminais.' : null;
}

function modulosOcupados(projeto: Projeto, quadro: string): number {
  let soma = 0;
  for (const c of projeto.cabos) {
    if (c.quadro !== quadro) continue;
    for (const id of c.protecoes) {
      const item = CATALOGO.get(id);
      if (item?.categoria === 'protecao') soma += modulosDaProtecao(item) ?? 0;
    }
  }
  return soma;
}

function pontoMedio(projeto: Projeto, cabo: Cabo): Vec3 {
  const a = projeto.dispositivos.find((d) => d.uid === cabo.de.disp)?.pos ?? [0, 0, 0];
  const b = projeto.dispositivos.find((d) => d.uid === cabo.para.disp)?.pos ?? [0, 0, 0];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/** Quadro em que uma proteção de trilho deste cabo deve ficar, pela seção 1.3 da especificação da fase 2. Nulo sem quadro com lugar. */
function quadroPara(projeto: Projeto, cabo: Cabo, protecao: Protecao): string | null {
  const modulos = modulosDaProtecao(protecao);
  if (modulos === null) return cabo.quadro;
  let doCabo = 0;
  for (const id of cabo.protecoes) {
    const item = CATALOGO.get(id);
    if (item?.categoria === 'protecao') doCabo += modulosDaProtecao(item) ?? 0;
  }
  const cabe = (uid: string): boolean => {
    const item = itemDe(projeto, uid);
    const lugares = item?.categoria === 'acessorio' ? (item.modulos ?? 0) : 0;
    // No quadro em que o cabo já está, as proteções dele já estão contadas; em outro, vão todas junto.
    const levaJunto = uid === cabo.quadro ? 0 : doCabo;
    return modulosOcupados(projeto, uid) + levaJunto + modulos <= lugares;
  };
  if (cabo.quadro && cabe(cabo.quadro)) return cabo.quadro;
  const meio = pontoMedio(projeto, cabo);
  let melhor: string | null = null;
  let menor = Infinity;
  for (const d of projeto.dispositivos) {
    const item = CATALOGO.get(d.itemId);
    if (item?.categoria !== 'acessorio' || item.tipo !== 'quadro' || d.superficie === null || !cabe(d.uid)) continue;
    const dist = Math.hypot(d.pos[0] - meio[0], d.pos[1] - meio[1], d.pos[2] - meio[2]);
    if (dist < menor) {
      menor = dist;
      melhor = d.uid;
    }
  }
  return melhor;
}

function instalar(projeto: Projeto, uidCabo: string, protecaoId: string): void {
  const cabo = projeto.cabos.find((c) => c.uid === uidCabo);
  const item = CATALOGO.get(protecaoId);
  if (!cabo || item?.categoria !== 'protecao') return;
  const quadro = quadroPara(projeto, cabo, item);
  cabo.protecoes = [...cabo.protecoes, protecaoId];
  if (quadro) cabo.quadro = quadro;
}

export interface Encaixe {
  pos: Vec3;
  quat: Quat;
  superficie: string;
  giro: number;
  /** Só para placa no chão, sobre suporte. */
  inclinacaoGraus?: number;
}

// ---------------------------------------------------------------- Ações

export const acoes = {
  // ---- Casa

  /** Troca campos da casa: medidas, varandas, quartinho, orientação. Ao mudar largura ou profundidade, corta as paredes internas. */
  alterarCasa(mudanca: Partial<CasaConfig>, opcoes?: OpcoesMudanca): void {
    mudar(['casa'], opcoes, (p) => {
      const casa = { ...p.casa, ...mudanca };
      if (mudanca.largura !== undefined || mudanca.profundidade !== undefined) {
        casa.paredesInternas = ajustarParedesInternas(casa.paredesInternas, casa.largura, casa.profundidade);
      }
      p.casa = casa;
    });
  },

  /** Cria ou troca a varanda de um lado. */
  definirVaranda(varanda: Varanda, opcoes?: OpcoesMudanca): void {
    mudar(['casa'], opcoes, (p) => {
      p.casa = { ...p.casa, varandas: [...p.casa.varandas.filter((v) => v.lado !== varanda.lado), varanda] };
    });
  },

  /** Remove a varanda de um lado, com as peças encaixadas nela e os cabos dessas peças. */
  removerVaranda(lado: Varanda['lado']): void {
    mudar(['casa', 'dispositivos', 'cabos'], undefined, (p) => {
      const fora = new Set(
        p.dispositivos.filter((d) => d.superficie === `telhado-varanda-${lado}` || d.superficie === `piso-varanda-${lado}`).map((d) => d.uid),
      );
      p.dispositivos = p.dispositivos.filter((d) => !fora.has(d.uid));
      p.cabos = p.cabos.filter((c) => !fora.has(c.de.disp) && !fora.has(c.para.disp));
      p.casa = { ...p.casa, varandas: p.casa.varandas.filter((v) => v.lado !== lado) };
    });
  },

  /** Cria uma parede interna e devolve o `uid` dela. */
  adicionarParede(parede: Omit<ParedeInterna, 'uid'>): string {
    const uid = novoUid('p', estado.projeto.casa.paredesInternas.map((w) => w.uid));
    mudar(['casa'], undefined, (p) => {
      p.casa = { ...p.casa, paredesInternas: [...p.casa.paredesInternas, { ...parede, uid }] };
    });
    return uid;
  },

  alterarParede(uid: string, mudanca: Partial<Omit<ParedeInterna, 'uid'>>, opcoes?: OpcoesMudanca): void {
    mudar(['casa'], opcoes, (p) => {
      p.casa = { ...p.casa, paredesInternas: p.casa.paredesInternas.map((w) => (w.uid === uid ? { ...w, ...mudanca } : w)) };
    });
  },

  /** Remove a parede interna, com as peças encaixadas nela e os cabos dessas peças. */
  removerParede(uid: string): void {
    mudar(['casa', 'dispositivos', 'cabos'], undefined, (p) => {
      const fora = new Set(p.dispositivos.filter((d) => d.superficie === `parede-interna-${uid}`).map((d) => d.uid));
      p.dispositivos = p.dispositivos.filter((d) => !fora.has(d.uid));
      p.cabos = p.cabos.filter((c) => !fora.has(c.de.disp) && !fora.has(c.para.disp));
      p.casa = { ...p.casa, paredesInternas: p.casa.paredesInternas.filter((w) => w.uid !== uid) };
    });
  },

  /** Dá nome à área que contém o ponto. Nome vazio remove o cômodo. `uid` nulo cria um cômodo novo. */
  nomearComodo(uid: string | null, andar: 0 | 1, ponto: [number, number], nome: string): void {
    mudar(['casa'], undefined, (p) => {
      const limpo = nome.trim();
      // Renomear mantém o lugar na lista: quando duas áreas se juntam, vale o cômodo que vem primeiro.
      const existe = uid !== null && p.casa.comodos.some((c) => c.uid === uid);
      let comodos: Comodo[];
      if (!limpo) comodos = p.casa.comodos.filter((c) => c.uid !== uid);
      else if (existe) comodos = p.casa.comodos.map((c) => (c.uid === uid ? { ...c, andar, nome: limpo, ponto } : c));
      else comodos = [...p.casa.comodos, { uid: uid ?? novoUid('cm', p.casa.comodos.map((c) => c.uid)), andar, nome: limpo, ponto }];
      p.casa = { ...p.casa, comodos };
    });
  },

  // ---- Obstáculos (muro, vizinho, árvore): avisam 'casa', porque mudam a sombra

  /** Cria um obstáculo e devolve o `uid` dele. */
  adicionarObstaculo(obstaculo: Omit<Obstaculo, 'uid'>): string {
    const uid = novoUid('o', (estado.projeto.obstaculos ?? []).map((o) => o.uid));
    mudar(['casa'], undefined, (p) => {
      p.obstaculos = [...(p.obstaculos ?? []), { ...obstaculo, uid }];
    });
    return uid;
  },

  alterarObstaculo(uid: string, mudanca: Partial<Omit<Obstaculo, 'uid'>>, opcoes?: OpcoesMudanca): void {
    mudar(['casa'], opcoes, (p) => {
      p.obstaculos = (p.obstaculos ?? []).map((o) => (o.uid === uid ? { ...o, ...mudanca } : o));
    });
  },

  removerObstaculo(uid: string): void {
    mudar(['casa'], undefined, (p) => {
      p.obstaculos = (p.obstaculos ?? []).filter((o) => o.uid !== uid);
    });
  },

  // ---- Dispositivos

  /** Cria um dispositivo encaixado em uma superfície e devolve o `uid` dele. */
  adicionarDispositivo(itemId: string, encaixe: Encaixe): string {
    const item = CATALOGO.get(itemId);
    if (!item) throw new Error(`Item desconhecido no catálogo: "${itemId}"`);
    const uid = novoUid('d', estado.projeto.dispositivos.map((d) => d.uid));
    mudar(['dispositivos'], undefined, (p) => {
      p.dispositivos = [...p.dispositivos, { uid, itemId, ...encaixe, ligado: true, uso: null }];
    });
    return uid;
  },

  /**
   * Põe um grampo de parede no lugar dado e passa o cabo por ele, na posição `indice` da lista de grampos do cabo
   * (0 é o mais perto da ponta `de`). Devolve o `uid` do grampo, ou nulo se o cabo não existe.
   */
  adicionarGrampo(caboUid: string, indice: number, encaixe: Encaixe, itemId = 'acc-grampo'): string | null {
    const item = CATALOGO.get(itemId);
    if (item?.categoria !== 'acessorio' || item.tipo !== 'grampo') throw new Error(`Não é um grampo: "${itemId}"`);
    if (!estado.projeto.cabos.some((c) => c.uid === caboUid)) return null;
    const uid = novoUid('d', estado.projeto.dispositivos.map((d) => d.uid));
    mudar(['dispositivos', 'cabos'], undefined, (p) => {
      p.dispositivos = [...p.dispositivos, { uid, itemId, ...encaixe, ligado: true, uso: null }];
      p.cabos = p.cabos.map((c) => {
        if (c.uid !== caboUid) return c;
        const grampos = [...(c.grampos ?? [])];
        grampos.splice(Math.max(0, Math.min(grampos.length, Math.round(indice))), 0, uid);
        return { ...c, grampos };
      });
    });
    return uid;
  },

  moverDispositivo(uid: string, encaixe: Encaixe, opcoes?: OpcoesMudanca): void {
    mudar(['dispositivos'], opcoes, (p) => {
      p.dispositivos = p.dispositivos.map((d) => (d.uid === uid ? { ...d, ...encaixe } : d));
    });
  },

  /** Move várias peças de uma vez, sem ponto de retorno próprio: quando o quartinho ou uma parede carrega as peças junto. */
  moverDispositivos(encaixes: ReadonlyMap<string, Encaixe>, opcoes?: OpcoesMudanca): void {
    mudar(['dispositivos'], opcoes, (p) => {
      p.dispositivos = p.dispositivos.map((d) => {
        const e = encaixes.get(d.uid);
        return e ? { ...d, ...e } : d;
      });
    });
  },

  /** Remove o dispositivo e os cabos ligados a ele. Um quadro removido solta os cabos que passavam por ele. */
  removerDispositivo(uid: string): void {
    mudar(['dispositivos', 'cabos'], undefined, (p) => {
      p.dispositivos = p.dispositivos.filter((d) => d.uid !== uid);
      p.cabos = p.cabos
        .filter((c) => c.de.disp !== uid && c.para.disp !== uid)
        .map((c) => (c.quadro === uid ? { ...c, quadro: null } : c));
    });
  },

  /** Troca o modelo de uma peça por outro item da mesma categoria, mantendo o lugar e os cabos. Devolve falso se a troca não é possível. */
  trocarModelo(uid: string, itemId: string): boolean {
    const atual = itemDe(estado.projeto, uid);
    const novo = CATALOGO.get(itemId);
    if (!atual || !novo || atual.categoria !== novo.categoria) return false;
    if (grupoDoItem(CATALOGO, atual.id)?.chave !== grupoDoItem(CATALOGO, novo.id)?.chave) return false;
    const ids = (item: Item): string => terminaisDe(item).map((t) => t.id).sort().join(",");
    if (ids(atual) !== ids(novo)) return false;
    mudar(["dispositivos", "cabos"], undefined, (p) => {
      p.dispositivos = p.dispositivos.map((d) => (d.uid === uid ? { ...d, itemId, uso: null } : d));
    });
    return true;
  },

  definirLigado(uid: string, ligado: boolean): void {
    mudar(['dispositivos'], undefined, (p) => {
      p.dispositivos = p.dispositivos.map((d) => (d.uid === uid ? { ...d, ligado } : d));
    });
  },

  /** Horário de uso de um aparelho. Nulo volta ao típico do catálogo. */
  definirUso(uid: string, uso: Uso | null): void {
    mudar(['dispositivos'], undefined, (p) => {
      p.dispositivos = p.dispositivos.map((d) => (d.uid === uid ? { ...d, uso } : d));
    });
  },

  // ---- Cabos

  /** Cria um cabo entre dois terminais, com o tipo inicial da especificação. Devolve o `uid`, ou nulo se a ligação não é permitida. */
  adicionarCabo(de: PontaCabo, para: PontaCabo, comprimento: number): string | null {
    if (motivoParaNaoLigar(de, para)) return null;
    const uid = novoUid('c', estado.projeto.cabos.map((c) => c.uid));
    mudar(['cabos'], undefined, (p) => {
      p.cabos = [...p.cabos, { uid, de, para, caboId: caboInicial(p, de, para), comprimento, protecoes: [], quadro: null }];
    });
    return uid;
  },

  removerCabo(uid: string): void {
    mudar(['cabos'], undefined, (p) => {
      p.cabos = p.cabos.filter((c) => c.uid !== uid);
    });
  },

  trocarTipoDeCabo(uid: string, caboId: string): void {
    mudar(['cabos'], undefined, (p) => {
      p.cabos = p.cabos.map((c) => (c.uid === uid ? { ...c, caboId } : c));
    });
  },

  /** A cena informa os comprimentos recalculados depois de mover peças. Não cria ponto de retorno. */
  definirComprimentos(comprimentos: ReadonlyMap<string, number>): void {
    let mudou = false;
    const cabos = estado.projeto.cabos.map((c) => {
      const novo = comprimentos.get(c.uid);
      if (novo === undefined || !Number.isFinite(novo) || novo === c.comprimento) return c;
      mudou = true;
      return { ...c, comprimento: novo };
    });
    if (!mudou) return;
    estado.projeto.cabos = cabos;
    depoisDeMudar(['cabos']);
  },

  /** Instala a proteção no cabo. Proteção de trilho vai para um quadro com lugar, se houver. */
  instalarProtecao(uidCabo: string, protecaoId: string): void {
    mudar(['cabos'], undefined, (p) => instalar(p, uidCabo, protecaoId));
  },

  /** Remove a proteção de índice dado. Sem proteção de trilho, o cabo deixa de passar pelo quadro. */
  removerProtecao(uidCabo: string, indice: number): void {
    mudar(['cabos'], undefined, (p) => {
      p.cabos = p.cabos.map((c) => {
        if (c.uid !== uidCabo) return c;
        const protecoes = c.protecoes.filter((_, i) => i !== indice);
        const noTrilho = protecoes.some((id) => {
          const item = CATALOGO.get(id);
          return item?.categoria === 'protecao' && modulosDaProtecao(item) !== null;
        });
        return { ...c, protecoes, quadro: noTrilho ? c.quadro : null };
      });
    });
  },

  // ---- Projeto

  /** Clima do cálculo. 'real' baixa as medições do dia simulado; até chegarem, vale o típico. */
  definirClima(clima: Clima): void {
    mudar([], undefined, (p) => {
      p.clima = clima;
    });
    conferirClimaReal();
  },

  /** Troca a cidade do projeto. Local fora da lista fixa fica guardado no próprio projeto. */
  definirLocal(local: Local): void {
    mudar([], undefined, (p) => {
      p.localId = local.id;
      if (localPorId(local.id)) delete p.localPersonalizado;
      else p.localPersonalizado = local;
    });
    conferirClimaReal();
    avisar('tempo');
  },

  /** Tenta de novo o download do clima real, depois de um erro. */
  tentarClimaRealDeNovo(): void {
    for (const [chave, situacao] of pedidos) if (situacao === 'erro') pedidos.delete(chave);
    conferirClimaReal();
  },

  definirPrioridade(prioridade: Prioridade): void {
    mudar([], undefined, (p) => {
      p.prioridade = prioridade;
    });
  },

  definirTensaoDaRede(tensao: Projeto['tensaoRede']): void {
    mudar([], undefined, (p) => {
      p.tensaoRede = tensao;
    });
  },

  /** Abre um projeto lido de arquivo ou de outro lugar. Lança erro se a versão for desconhecida. */
  carregarProjeto(dados: unknown): void {
    const novo = converterProjeto(dados);
    conferirEstrutura(novo);
    sanear(novo);
    // Se o cálculo não roda com este projeto, o erro aparece aqui, antes de trocar o que está na tela.
    calcularDerivados(novo, estado.tempo.msUtc);
    // Arquivo exportado de dentro do tutorial, aberto na casa: a casa fica guardada, como em `entrarNoTutorial`.
    if (novo.casa.soQuartinho === true && !emTutorial()) guardarCasa();
    guardarNoHistorico();
    zerarSimulacao();
    trocarProjeto(novo);
  },

  /** Volta ao cenário "plano no papel". Dentro do tutorial, recomeça o tutorial. */
  novoProjeto(): void {
    guardarNoHistorico();
    zerarSimulacao();
    trocarProjeto(emTutorial() ? cenarioTutorial() : cenarioPlanoNoPapel());
  },

  /**
   * Abre o tutorial: só o quartinho, vazio. O projeto da casa fica guardado à parte e volta em `sairDoTutorial`.
   * Dentro do tutorial, recomeça o tutorial sem mexer na casa guardada.
   */
  entrarNoTutorial(): void {
    if (!emTutorial()) guardarCasa();
    passado.length = 0;
    futuro.length = 0;
    // O relógio para: sol e bateria não andam enquanto a pessoa monta.
    estado.tempo.velocidade = 0;
    avisar('tempo');
    zerarSimulacao();
    acoes.definirDestaques([]);
    trocarProjeto(cenarioTutorial());
  },

  /** Fecha o tutorial e devolve o projeto da casa como estava. Sem projeto guardado, abre o "plano no papel". */
  sairDoTutorial(): void {
    if (!emTutorial()) return;
    let casa: Projeto = cenarioPlanoNoPapel();
    const texto = casaGuardada ?? armazenamento()?.getItem(CHAVE_CASA) ?? null;
    if (texto) {
      try {
        const lido = converterProjeto(JSON.parse(texto));
        conferirEstrutura(lido);
        sanear(lido);
        calcularDerivados(lido, estado.tempo.msUtc);
        casa = lido;
      } catch (erro) {
        console.warn('O projeto da casa guardado não pôde ser aberto; abrindo o cenário inicial.', erro);
      }
    }
    casaGuardada = null;
    try {
      // Grava a casa na chave normal antes de apagar a guarda: fechar a página logo depois não perde a casa.
      armazenamento()?.setItem(CHAVE, JSON.stringify(casa));
      armazenamento()?.removeItem(CHAVE_CASA);
    } catch {
      // Sem permissão: a chave fica, e a próxima entrada no tutorial a troca.
    }
    passado.length = 0;
    futuro.length = 0;
    zerarSimulacao();
    acoes.definirDestaques([]);
    trocarProjeto(casa);
  },

  /** O que a cena deve realçar. Lista igual à atual não avisa ninguém. */
  definirDestaques(lista: Destaque[]): void {
    if (JSON.stringify(lista) === JSON.stringify(estado.destaques)) return;
    estado.destaques = lista;
    avisar('destaques');
  },

  /** Texto JSON do projeto, para exportar. */
  exportarProjeto(): string {
    return JSON.stringify(estado.projeto, null, 2);
  },

  /**
   * Executa a ação de uma sugestão do consultor. Devolve verdadeiro se o estado resolveu sozinho.
   * 'mais-placa', 'mais-bateria' e 'ver-catalogo' dependem da cena e dos painéis e devolvem falso.
   */
  aplicarAcao(acao: Acao): boolean {
    if (acao.tipo === 'proteger-cabos') {
      mudar(['cabos'], undefined, (p) => {
        for (const { cabo, protecaoId } of acao.itens) instalar(p, cabo, protecaoId);
      });
      return true;
    }
    if (acao.tipo === 'trocar-cabos') {
      const alvo = new Set(acao.cabos);
      mudar(['cabos'], undefined, (p) => {
        p.cabos = p.cabos.map((c) => (alvo.has(c.uid) ? { ...c, caboId: acao.caboId } : c));
      });
      return true;
    }
    if (acao.tipo === 'desligar') {
      acoes.definirLigado(acao.dispositivo, false);
      return true;
    }
    return false;
  },

  // ---- Histórico

  /** Marca o ponto de retorno antes de um arraste feito com `historico: false`. */
  marcarHistorico(): void {
    futuroAntesDoArraste = [...futuro];
    guardarNoHistorico();
  },

  /** Cancela um arraste: volta ao ponto marcado por `marcarHistorico`, sem deixar nada para refazer. */
  cancelarArraste(): void {
    const anterior = passado.pop();
    if (!anterior) return;
    futuro.length = 0;
    futuro.push(...futuroAntesDoArraste);
    futuroAntesDoArraste = [];
    trocarProjeto(JSON.parse(anterior) as Projeto);
  },

  desfazer(): void {
    const anterior = passado.pop();
    if (!anterior) return;
    futuro.push(JSON.stringify(estado.projeto));
    trocarProjeto(JSON.parse(anterior) as Projeto);
  },

  refazer(): void {
    const seguinte = futuro.pop();
    if (!seguinte) return;
    passado.push(JSON.stringify(estado.projeto));
    trocarProjeto(JSON.parse(seguinte) as Projeto);
  },

  // ---- Seleção, edição da casa, tempo e visão

  selecionar(selecao: Selecao): void {
    estado.selecao = selecao;
    avisar('selecao');
  },

  /** Liga ou desliga o modo "Editar casa" e escolhe o andar em edição. */
  definirEdicaoDaCasa(ativa: boolean, andar: 0 | 1 = estado.edicaoCasa.andar): void {
    estado.edicaoCasa = { ativa, andar };
    estado.selecao = null;
    avisar('selecao');
    avisar('edicao');
  },

  /** Salta para um instante, sem simular o intervalo: a bateria fica como estava. */
  definirTempo(msUtc: number): void {
    const diaAntes = diaLocalDe(estado.projeto, estado.tempo.msUtc);
    estado.tempo.msUtc = msUtc;
    estado.simulacao.intervencoes += 1;
    avisar('tempo');
    conferirClimaReal();
    atualizarMostradores();
    // As estimativas do dia e as regras de geração são do dia simulado.
    if (diaLocalDe(estado.projeto, msUtc) !== diaAntes) agendarDerivados();
  },

  /**
   * Avança o tempo simulando geração, consumo e bateria, em passos de até 5 minutos avaliados no meio do passo.
   * É o que o relógio chama a cada quadro, com a velocidade escolhida.
   */
  avancarTempo(minutos: number): void {
    if (!(minutos > 0)) return;
    const sim = estado.simulacao;
    const analise = estado.derivados.analise;
    let resta = minutos;
    let agora = estado.tempo.msUtc;
    while (resta > 1e-9) {
      const dtMin = Math.min(PASSO_MAXIMO_MIN, resta);
      const meio = agora + (dtMin * 60_000) / 2;
      const saida = passo(estado.projeto, analise, sim.estadoSim, meio, dtMin / 60, sim.quedaDeLuz.ativa);
      agora += dtMin * 60_000;
      resta -= dtMin;
      sim.estadoSim = saida.estado;
      sim.saida = saida;
      if (sim.quedaDeLuz.ativa && sim.quedaDeLuz.apagouMsUtc === null && saida.avisos.includes('bateria-vazia')) {
        sim.quedaDeLuz.apagouMsUtc = agora;
      }
      registrarNoHistorico(agora, saida);
    }
    const diaAntes = diaLocalDe(estado.projeto, estado.tempo.msUtc);
    estado.tempo.msUtc = agora;
    conferirClimaReal();
    avisar('tempo');
    avisar('simulacao');
    if (diaLocalDe(estado.projeto, agora) !== diaAntes) agendarDerivados();
  },

  /** Liga ou desliga a queda de luz. Ao ligar, guarda o instante de início. */
  alternarQuedaDeLuz(): void {
    const q = estado.simulacao.quedaDeLuz;
    estado.simulacao.quedaDeLuz = q.ativa
      ? { ativa: false, inicioMsUtc: null, apagouMsUtc: null }
      : { ativa: true, inicioMsUtc: estado.tempo.msUtc, apagouMsUtc: null };
    atualizarMostradores();
  },

  /** Volta a bateria para 100% e religa o inversor. */
  recarregarBateria(): void {
    estado.simulacao.intervencoes += 1;
    estado.simulacao.estadoSim = estadoInicial();
    estado.simulacao.quedaDeLuz.apagouMsUtc = null;
    atualizarMostradores();
  },

  /** Minutos simulados por segundo real: 0, 1, 10 ou 60. */
  definirVelocidade(velocidade: number): void {
    estado.tempo.velocidade = velocidade;
    avisar('tempo');
  },

  definirVisao(visao: ModoVisao): void {
    estado.visao = visao;
    avisar('visao');
  },
};

/** Categoria do catálogo que uma ação 'ver-catalogo' pede para abrir. */
export type CategoriaDoCatalogo = Categoria;

// Projeto aberto já com o clima real escolhido: pede as medições do dia logo.
conferirClimaReal();
