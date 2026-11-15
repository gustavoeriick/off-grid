// Estado do aplicativo e ações. Arquivo do coordenador.
// Especificação: docs/especificacao/cena-e-interface.md, seção 10, e docs/especificacao/fase-2.md.
// Fase 2: projeto editável (dispositivos, cabos, casa), seleção, desfazer, derivados e gravação.
// A simulação no tempo (bateria, queda de luz) entra na fase 3.

import { CATALOGO } from './catalogo';
import type { Categoria, Item, Protecao, Uso } from './catalogo/tipos';
import { cenarioPlanoNoPapel } from './nucleo/cenarios';
import { analisarCircuito } from './nucleo/circuito';
import { ajustarParedesInternas } from './nucleo/comodos';
import { analisarConsultor, modulosDaProtecao } from './nucleo/consultor';
import { estimar } from './nucleo/estimativas';
import { converterProjeto } from './nucleo/migracao';
import { calcularOrcamento } from './nucleo/orcamento';
import { podeLigar, terminaisDe } from './nucleo/terminais';
import type {
  Acao, AmbientePlacas, AnaliseCircuito, Cabo, CasaConfig, Clima, Comodo, Estimativas, Orcamento,
  ParedeInterna, PontaCabo, Prioridade, Projeto, Quat, Sugestao, Varanda, Vec3,
} from './nucleo/tipos';

export type ModoVisao = 'completa' | 'sem-telhado' | 'terreo';

export type Selecao =
  | { tipo: 'dispositivo'; uid: string }
  | { tipo: 'cabo'; uid: string }
  | { tipo: 'parede'; uid: string }
  | { tipo: 'varanda'; lado: Varanda['lado'] }
  | { tipo: 'quartinho' }
  | null;

/** Resultados recalculados depois de cada mudança do projeto. */
export interface Derivados {
  analise: AnaliseCircuito;
  estimativas: Estimativas;
  sugestoes: Sugestao[];
  orcamento: Orcamento;
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
}

/**
 * 'projeto' avisa qualquer mudança no projeto. Os demais são recortes dele, avisados antes:
 * 'casa' (medidas, orientação, varandas, paredes internas, cômodos, quartinho), 'dispositivos' e 'cabos'.
 * 'derivados' avisa quando análise, estimativas, sugestões e orçamento foram recalculados.
 */
export type Evento = 'projeto' | 'casa' | 'dispositivos' | 'cabos' | 'selecao' | 'edicao' | 'tempo' | 'visao' | 'derivados';

const EVENTOS: Evento[] = ['projeto', 'casa', 'dispositivos', 'cabos', 'selecao', 'edicao', 'tempo', 'visao', 'derivados'];
const ouvintes = Object.fromEntries(EVENTOS.map((e) => [e, new Set<() => void>()])) as Record<Evento, Set<() => void>>;

/** 21/06/2026 ao meio-dia no Rio (UTC − 3). */
const INSTANTE_INICIAL = Date.UTC(2026, 5, 21, 15, 0, 0);

const CHAVE = 'offgrid.projeto.v2';
const CHAVE_V1 = 'offgrid.projeto.v1';
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
      return converterProjeto(JSON.parse(texto));
    } catch (erro) {
      console.warn('O projeto gravado não pôde ser aberto; abrindo o cenário inicial.', erro);
    }
  }
  return cenarioPlanoNoPapel();
}

const projetoDeAbertura = projetoInicial();

export const estado: EstadoApp = {
  projeto: projetoDeAbertura,
  tempo: { msUtc: INSTANTE_INICIAL, velocidade: 0 },
  visao: 'completa',
  selecao: null,
  edicaoCasa: { ativa: false, andar: 0 },
  derivados: calcularDerivados(projetoDeAbertura, INSTANTE_INICIAL),
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

const passado: string[] = [];
const futuro: string[] = [];

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
    : true;
  if (!existe) {
    estado.selecao = null;
    avisar('selecao');
  }
}

// ---------------------------------------------------------------- Auxiliares

function novoUid(prefixo: string, usados: Iterable<string>): string {
  const conjunto = new Set(usados);
  let n = conjunto.size + 1;
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
  const cabe = (uid: string): boolean => {
    const item = itemDe(projeto, uid);
    const lugares = item?.categoria === 'acessorio' ? (item.modulos ?? 0) : 0;
    return modulosOcupados(projeto, uid) + modulos <= lugares;
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
      let comodos: Comodo[] = p.casa.comodos.filter((c) => c.uid !== uid);
      if (limpo) comodos = [...comodos, { uid: uid ?? novoUid('cm', p.casa.comodos.map((c) => c.uid)), andar, nome: limpo, ponto }];
      p.casa = { ...p.casa, comodos };
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
      if (novo === undefined || novo === c.comprimento) return c;
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

  definirClima(clima: Clima): void {
    mudar([], undefined, (p) => {
      p.clima = clima;
    });
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
    guardarNoHistorico();
    trocarProjeto(novo);
  },

  /** Volta ao cenário "plano no papel". */
  novoProjeto(): void {
    guardarNoHistorico();
    trocarProjeto(cenarioPlanoNoPapel());
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
    guardarNoHistorico();
  },

  /** Cancela um arraste: volta ao ponto marcado por `marcarHistorico`, sem deixar nada para refazer. */
  cancelarArraste(): void {
    const anterior = passado.pop();
    if (anterior) trocarProjeto(JSON.parse(anterior) as Projeto);
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

  definirTempo(msUtc: number): void {
    estado.tempo.msUtc = msUtc;
    avisar('tempo');
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
