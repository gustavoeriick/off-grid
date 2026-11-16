// Operar o sistema: o que está energizado, o que a manobra errada estraga e a ordem certa de ligar.
// Especificação: docs/especificacao/operar.md, seções 4 a 6. Tarefa 8.2 (núcleo).
//
// A análise de projeto (circuito, consultor, orçamento) olha a montagem inteira, como se tudo estivesse fechado.
// Aqui se olha o que está vivo agora. Tudo é puro e imutável: as funções devolvem consequências e projetos novos.

import type { Aparelho, Catalogo, Protecao } from '../catalogo/tipos';
import { correntesComInjecoes } from './cabos';
import { analisarCircuito, montarRedes, type Rede } from './circuito';
import { correntesDasFileiras, estadosDasFileiras, infoBanco, passoSimulacao, RENDIMENTO_MPPT } from './eletrica';
import type {
  AnaliseCircuito, Cabo, CodigoDano, Circuito, CondicaoPlaca, Dano, Dispositivo, EntradaPasso, EstadoProtecao, EstadoSim,
  Projeto, SaidaPasso,
} from './tipos';
import { emUso, usoDe } from './uso';

// ---------------------------------------------------------------- Chaves e peças vivas

/** Estado da proteção de índice `indice` do cabo. Ausente vale fechada. */
export function estadoDaProtecao(cabo: Cabo, indice: number): EstadoProtecao {
  return cabo.estados?.[indice] ?? 'fechada';
}

/**
 * Cabo que não conduz: alguma proteção aberta ou queimada, o próprio cabo queimado, ou uma ponta em peça queimada.
 * Com `catalogo`, o DPS é ignorado: ele não tem chave e nunca interrompe.
 */
export function caboInterrompido(cabo: Cabo, projeto: Projeto, catalogo?: Catalogo): boolean {
  if (cabo.queimado !== undefined) return true;
  for (let i = 0; i < cabo.protecoes.length; i++) {
    if (estadoDaProtecao(cabo, i) === 'fechada') continue;
    if (catalogo !== undefined && tipoDaProtecao(catalogo, cabo.protecoes[i]) === 'dps') continue;
    return true;
  }
  return [cabo.de.disp, cabo.para.disp].some((uid) => projeto.dispositivos.find((d) => d.uid === uid)?.queimado !== undefined);
}

/** O projeto sem os cabos interrompidos. */
export function projetoVivo(projeto: Projeto, catalogo?: Catalogo): Projeto {
  const cabos = projeto.cabos.filter((c) => !caboInterrompido(c, projeto, catalogo));
  return cabos.length === projeto.cabos.length ? projeto : { ...projeto, cabos };
}

/** Inversor que pode funcionar: ligado, sem falha e sem estar queimado. É o `inversorLigado` de `EntradaPasso`. */
export function inversorOperando(dispositivo: Dispositivo): boolean {
  return dispositivo.ligado && dispositivo.falha === undefined && dispositivo.queimado === undefined;
}

function tipoDaProtecao(catalogo: Catalogo, id: string): Protecao['tipo'] | undefined {
  const p = catalogo.get(id);
  return p?.categoria === 'protecao' ? p.tipo : undefined;
}

const dispositivoDe = (projeto: Projeto, uid: string): Dispositivo | undefined => projeto.dispositivos.find((d) => d.uid === uid);

function itemDe(projeto: Projeto, catalogo: Catalogo, uid: string) {
  const d = dispositivoDe(projeto, uid);
  return d ? catalogo.get(d.itemId) : undefined;
}

/** Fusível ou disjuntor de corrente contínua: as proteções que limitam a corrente de um circuito de corrente contínua. */
const protecaoDeCorrenteCc = (tipo: Protecao['tipo'] | undefined): boolean => tipo === 'fusivel' || tipo === 'disjuntorCC';

// ---------------------------------------------------------------- Circuito de cada cabo

const CIRCUITOS: Circuito[] = ['bateria', 'placas', 'saida', 'entrada'];
const CIRCUITOS_CC: Circuito[] = ['bateria', 'placas'];

/** Circuito a que o cabo pertence, pela mesma regra do consultor (redes do banco, das placas, da saída e da entrada CA). `undefined` fora dos circuitos. */
export function circuitoDoCabo(projeto: Projeto, analise: AnaliseCircuito, cabo: Cabo): Circuito | undefined {
  const sistema = analise.sistema;
  if (sistema === null) return undefined;
  const rede = montarRedes(projeto);
  const redes: Record<Circuito, Set<string>> = { bateria: new Set(), placas: new Set(), saida: new Set(), entrada: new Set() };
  if (sistema.banco.length > 0) {
    redes.bateria.add(rede(sistema.inversor, 'batPos')).add(rede(sistema.inversor, 'batNeg'));
    for (const uid of sistema.banco.flat()) redes.bateria.add(rede(uid, 'pos')).add(rede(uid, 'neg'));
  }
  if (sistema.entradaSolar !== null && sistema.fileiras.length > 0) {
    const dono = sistema.controlador ?? sistema.inversor;
    redes.placas.add(rede(dono, 'pvPos')).add(rede(dono, 'pvNeg'));
    for (const uid of sistema.fileiras.flat()) redes.placas.add(rede(uid, 'pos')).add(rede(uid, 'neg'));
  }
  redes.saida.add(rede(sistema.inversor, 'caSaida'));
  if (sistema.redeLigada) redes.entrada.add(rede(sistema.inversor, 'caEntrada'));
  const r = rede(cabo.de.disp, cabo.de.terminal);
  return CIRCUITOS.find((c) => redes[c].has(r));
}

// ---------------------------------------------------------------- Caminhos de peças e de cabos

const LIMITE_EM_SERIE = 40;
const LIMITE_DE_CADEIAS = 200;

/** Todas as cadeias de peças em série (placas ou baterias) da rede `inicio` à rede `fim`, do positivo para o negativo. */
function cadeias(
  projeto: Projeto, catalogo: Catalogo, categoria: 'placa' | 'bateria', rede: Rede, inicio: string, fim: string,
  /** Aceita `inicio` igual a `fim`: é o que acontece quando um curto une os dois barramentos. */
  mesmaRede = false,
): string[][] {
  const pecas = projeto.dispositivos.filter((d) => catalogo.get(d.itemId)?.categoria === categoria);
  const achadas: string[][] = [];
  const caminho: string[] = [];
  const usadas = new Set<string>();
  const buscar = (atual: string): void => {
    if (caminho.length >= LIMITE_EM_SERIE || achadas.length >= LIMITE_DE_CADEIAS) return;
    for (const p of pecas) {
      if (usadas.has(p.uid)) continue;
      const pos = rede(p.uid, 'pos');
      const neg = rede(p.uid, 'neg');
      if (pos !== atual || pos === neg) continue;
      caminho.push(p.uid);
      usadas.add(p.uid);
      if (neg === fim) achadas.push([...caminho]);
      else buscar(neg);
      caminho.pop();
      usadas.delete(p.uid);
    }
  };
  if (inicio !== fim || mesmaRede) buscar(inicio);
  return achadas;
}

/** As cadeias que não repetem peça de uma cadeia já aceita, como `analisarCircuito` faz com os ramos e as fileiras. */
function semRepeticao(lista: string[][]): string[][] {
  const usadas = new Set<string>();
  const aceitas: string[][] = [];
  for (const cadeia of lista) {
    if (cadeia.some((uid) => usadas.has(uid))) continue;
    aceitas.push(cadeia);
    for (const uid of cadeia) usadas.add(uid);
  }
  return aceitas;
}

const chave = (disp: string, terminal: string): string => `${disp}:${terminal}`;

/**
 * Caminho com menos cabos entre dois terminais, andando só pelos cabos de `projeto` (passe o projeto vivo) e sem
 * atravessar peças: os cabos são as únicas ligações. Nulo se não há caminho.
 */
function caminhoMaisCurto(projeto: Projeto, de: string, para: string): Cabo[] | null {
  const vizinhos = new Map<string, { cabo: Cabo; outro: string }[]>();
  const ligar = (a: string, b: string, cabo: Cabo): void => {
    const lista = vizinhos.get(a);
    if (lista) lista.push({ cabo, outro: b });
    else vizinhos.set(a, [{ cabo, outro: b }]);
  };
  for (const c of projeto.cabos) {
    const a = chave(c.de.disp, c.de.terminal);
    const b = chave(c.para.disp, c.para.terminal);
    ligar(a, b, c);
    ligar(b, a, c);
  }
  const veioDe = new Map<string, { cabo: Cabo; de: string } | null>([[de, null]]);
  const fila = [de];
  for (let i = 0; i < fila.length; i++) {
    const no = fila[i];
    if (no === para) break;
    for (const { cabo, outro } of vizinhos.get(no) ?? []) {
      if (veioDe.has(outro)) continue;
      veioDe.set(outro, { cabo, de: no });
      fila.push(outro);
    }
  }
  if (!veioDe.has(para)) return null;
  const cabos: Cabo[] = [];
  for (let elo = veioDe.get(para); elo; elo = veioDe.get(elo.de)) cabos.unshift(elo.cabo);
  return cabos;
}

// ---------------------------------------------------------------- Bateria presente e polos trocados

/** Os dois terminais de bateria de um aparelho (inversor ou controlador). Nulo para as demais peças e para estação portátil. */
function terminaisDeBateria(projeto: Projeto, catalogo: Catalogo, uid: string): [string, string] | null {
  const item = itemDe(projeto, catalogo, uid);
  if (item?.categoria === 'controlador') return ['batPos', 'batNeg'];
  if (item?.categoria === 'inversor' && item.bateriaInternaWh === undefined) return ['batPos', 'batNeg'];
  return null;
}

/**
 * "Bateria presente" no aparelho `uid` (inversor ou controlador): os dois terminais de bateria dele alcançam um ramo
 * completo do banco por cabos não interrompidos. Estação portátil tem bateria interna: sempre presente. Outras peças: falso.
 */
export function bateriaPresente(projeto: Projeto, catalogo: Catalogo, uid: string): boolean {
  const item = itemDe(projeto, catalogo, uid);
  if (item?.categoria === 'inversor' && item.bateriaInternaWh !== undefined) return true;
  if (terminaisDeBateria(projeto, catalogo, uid) === null) return false;
  const vivo = projetoVivo(projeto, catalogo);
  const rede = montarRedes(vivo);
  const mais = rede(uid, 'batPos');
  const menos = rede(uid, 'batNeg');
  return cadeias(vivo, catalogo, 'bateria', rede, mais, menos).length > 0;
}

/** Ramo do banco ligado de ponta-cabeça nos terminais de bateria do aparelho: pos do aparelho no neg da bateria. */
interface Inversao {
  /** Cadeia de baterias, do positivo (na rede do BAT− do aparelho) para o negativo (na rede do BAT+). */
  ramo: string[];
}

function acharInversao(vivo: Projeto, catalogo: Catalogo, uid: string): Inversao | null {
  if (terminaisDeBateria(vivo, catalogo, uid) === null) return null;
  const rede = montarRedes(vivo);
  const mais = rede(uid, 'batPos');
  const menos = rede(uid, 'batNeg');
  if (mais === menos) return null;
  if (cadeias(vivo, catalogo, 'bateria', rede, mais, menos).length > 0) return null;
  const ao_contrario = cadeias(vivo, catalogo, 'bateria', rede, menos, mais);
  return ao_contrario.length > 0 ? { ramo: ao_contrario[0] } : null;
}

/** Os terminais de bateria do aparelho alcançam o banco com os polos trocados, por cabos não interrompidos. */
export function polosTrocados(projeto: Projeto, catalogo: Catalogo, uid: string): boolean {
  return acharInversao(projetoVivo(projeto, catalogo), catalogo, uid) !== null;
}

/**
 * O mesmo que `polosTrocados`, mas olhando a montagem inteira, como se tudo estivesse fechado: é o que o passo 1 de
 * "Ligar o sistema" e o consultor conferem antes de qualquer chave fechar. Devolve as baterias do ramo invertido, ou nulo.
 */
export function inversaoNaMontagem(projeto: Projeto, catalogo: Catalogo, uid: string): string[] | null {
  return acharInversao(projeto, catalogo, uid)?.ramo ?? null;
}

// ---------------------------------------------------------------- Controlador carregando sem o inversor

/**
 * Análise "só do controlador" (operar.md, seção 4): a análise viva não tem banco no inversor (a proteção da bateria dele
 * está aberta, ou ele queimou), mas um controlador externo tem bateria presente e fileira viva. O banco é o que a cadeia
 * de baterias do controlador alcança e a entrada solar é a dele; nenhum aparelho é atendido e a rede não entra. Nulo
 * quando não é esse o caso. Com mais de um controlador nessa situação, vale o primeiro.
 */
export function analiseSoDoControlador(projeto: Projeto, catalogo: Catalogo, analiseViva: AnaliseCircuito): AnaliseCircuito | null {
  const sistema = analiseViva.sistema;
  if (sistema === null || sistema.banco.length > 0) return null;
  // Estação portátil tem a bateria dentro: nunca fica sem banco.
  if (terminaisDeBateria(projeto, catalogo, sistema.inversor) === null) return null;
  const vivo = projetoVivo(projeto, catalogo);
  const rede = montarRedes(vivo);
  for (const d of vivo.dispositivos) {
    const item = catalogo.get(d.itemId);
    if (item?.categoria !== 'controlador' || d.queimado !== undefined) continue;
    const banco = semRepeticao(cadeias(vivo, catalogo, 'bateria', rede, rede(d.uid, 'batPos'), rede(d.uid, 'batNeg')));
    if (banco.length === 0) continue;
    const fileiras = semRepeticao(cadeias(vivo, catalogo, 'placa', rede, rede(d.uid, 'pvPos'), rede(d.uid, 'pvNeg')));
    if (fileiras.length === 0) continue;
    return {
      sistema: { inversor: sistema.inversor, controlador: d.uid, entradaSolar: item.solar, fileiras, banco, cargas: [], redeLigada: false },
      problemas: [],
      naRede: analiseViva.naRede,
    };
  }
  return null;
}

/**
 * A análise que a simulação do instante usa: a "só do controlador" quando é o caso, senão a própria análise viva. Os
 * visores leem dela qual controlador e qual banco estão em uso.
 */
export function analiseDeOperacao(projeto: Projeto, catalogo: Catalogo, analiseViva: AnaliseCircuito): AnaliseCircuito {
  return analiseSoDoControlador(projeto, catalogo, analiseViva) ?? analiseViva;
}

/**
 * O passo da simulação sobre o que está vivo. É `passoSimulacao` com a análise viva; quando o inversor está sem banco e
 * um controlador externo tem bateria e fileira viva, o passo é o da análise "só do controlador", com o inversor fora:
 * as placas carregam a bateria, nenhum aparelho é atendido e o inversor não consome. A saída mantém o aviso
 * `'sem-bateria'` e a carga pedida, que continuam valendo para o inversor.
 */
export function passoDeOperacao(
  projeto: Projeto, catalogo: Catalogo, analiseViva: AnaliseCircuito, estado: EstadoSim, entrada: EntradaPasso,
): SaidaPasso {
  const normal = passoSimulacao(projeto, catalogo, analiseViva, estado, entrada);
  const so = analiseSoDoControlador(projeto, catalogo, analiseViva);
  if (so === null) return normal;
  const carga = passoSimulacao(projeto, catalogo, so, estado, { ...entrada, inversorLigado: false });
  return { ...carga, cargaPedidaW: normal.cargaPedidaW, avisos: [...new Set([...normal.avisos, ...carga.avisos])] };
}

// ---------------------------------------------------------------- Correntes de operação

/** Aparelhos da saída que o inversor atende neste instante: ligados e, havendo hora, dentro do horário de uso. */
function aparelhosAtendidos(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito, saida: SaidaPasso, horaLocal: number | null): Map<string, Aparelho> {
  const atendidos = new Map<string, Aparelho>();
  if (analise.sistema === null || saida.cargaAtendidaW <= 0) return atendidos;
  for (const uid of analise.sistema.cargas) {
    const d = dispositivoDe(projeto, uid);
    const item = d ? catalogo.get(d.itemId) : undefined;
    if (!d || item?.categoria !== 'aparelho' || !d.ligado) continue;
    if (horaLocal !== null && !emUso(usoDe(d, item), horaLocal)) continue;
    atendidos.set(uid, item);
  }
  return atendidos;
}

/**
 * Corrente que passa em cada cabo neste instante, em ampères, por `uid` do cabo (operar.md, seção 4). É o método de
 * `correntesDeProjeto` com as injeções do instante. `analiseViva` é a análise do `projetoVivo`; cabo interrompido fica com 0.
 * `horaLocal` (opcional) limita os aparelhos aos que estão no horário de uso. Com `placas` (a luz em cada placa), a
 * corrente das placas é repartida entre as fileiras pelo que cada uma entrega; sem ela, em partes iguais.
 *
 * No barramento do banco as injeções têm sinal: a bateria descarregando injeta e carregando absorve; o controlador
 * injeta. A corrente de cada cabo é o valor absoluto da soma, de modo que o cabo entre a bateria e o inversor leva só o
 * que o inversor consome.
 */
export function correntesDeOperacao(
  projeto: Projeto,
  catalogo: Catalogo,
  analiseViva: AnaliseCircuito,
  saida: SaidaPasso,
  horaLocal: number | null = null,
  placas?: ReadonlyMap<string, CondicaoPlaca>,
): Map<string, number> {
  const vivo = projetoVivo(projeto, catalogo);
  const resultado = new Map<string, number>(projeto.cabos.map((c) => [c.uid, 0]));
  // Inversor sem banco e controlador carregando a bateria: as correntes são as da análise "só do controlador".
  const soDoControlador = analiseSoDoControlador(vivo, catalogo, analiseViva);
  const analise = soDoControlador ?? analiseViva;
  const sistema = analise.sistema;
  if (sistema === null) return resultado;
  const banco = infoBanco(sistema, vivo, catalogo);

  // Corrente das placas: a potência aproveitada, vista do lado das placas, repartida entre as fileiras.
  let total = 0;
  if (saida.pvW > 0 && sistema.entradaSolar !== null) {
    if (sistema.entradaSolar.tipo === 'pwm') total = banco ? saida.pvW / banco.tensaoCarga : 0;
    else total = saida.pvTensao > 0 ? saida.pvW / RENDIMENTO_MPPT / saida.pvTensao : 0;
  }
  const entregue = placas ? correntesDasFileiras(estadosDasFileiras(sistema, vivo, catalogo, placas)) : [];
  const somaEntregue = entregue.reduce((s, i) => s + i, 0);
  const nFileiras = Math.max(1, sistema.fileiras.length);
  const daFileira = (indice: number): number =>
    somaEntregue > 0 ? (total * (entregue[indice] ?? 0)) / somaEntregue : total / nFileiras;
  const atendidos = aparelhosAtendidos(vivo, catalogo, analise, saida, horaLocal);

  const correntes = correntesComInjecoes(vivo, catalogo, analise, {
    placa: (_uid, fileira) => daFileira(fileira),
    bateriaPorRamo: banco ? -saida.bateriaW / banco.tensaoRef / Math.max(1, sistema.banco.length) : 0,
    controlador: (uid) => (banco && uid === sistema.controlador ? saida.pvW / banco.tensaoCarga : 0),
    aparelho: (uid) => ((atendidos.get(uid)?.potenciaW ?? 0) / projeto.tensaoRede),
    entradaCa: saida.redeW / projeto.tensaoRede,
    ...(soDoControlador !== null && sistema.controlador !== null ? { sorvedouroDoBanco: sistema.controlador } : {}),
  });
  for (const [uid, amperes] of correntes) resultado.set(uid, amperes);
  return resultado;
}

// ---------------------------------------------------------------- Consequências

export type CodigoDeConsequencia = CodigoDano | 'sobrecarga' | 'desarme' | 'fusivel-queimou';

/** Uma mudança no projeto. */
export type Mudanca =
  | { tipo: 'peca-queimada'; uid: string; dano: Dano }
  | { tipo: 'cabo-queimado'; uid: string; dano: Dano }
  | { tipo: 'protecao'; cabo: string; indice: number; estado: 'aberta' | 'queimada' }
  | { tipo: 'falha'; uid: string; falha: 'sobrecarga' };

/** O que a operação provoca. `codigo`, `uids` e `msUtc` são o evento de `estado.simulacao.eventos`; `mudancas` vão ao projeto. */
export interface Consequencia {
  codigo: CodigoDeConsequencia;
  /** Peças e cabos envolvidos. */
  uids: string[];
  msUtc: number;
  mudancas: Mudanca[];
}

/** A primeira proteção de corrente (fusível ou disjuntor CC) fechada ao longo de uma lista de cabos, e o que acontece com ela. */
function primeiraProtecaoDeCorrente(catalogo: Catalogo, cabos: Cabo[]): Mudanca | null {
  for (const cabo of cabos) {
    for (let i = 0; i < cabo.protecoes.length; i++) {
      const tipo = tipoDaProtecao(catalogo, cabo.protecoes[i]);
      if (!protecaoDeCorrenteCc(tipo) || estadoDaProtecao(cabo, i) !== 'fechada') continue;
      return { tipo: 'protecao', cabo: cabo.uid, indice: i, estado: tipo === 'fusivel' ? 'queimada' : 'aberta' };
    }
  }
  return null;
}

/** Fileiras completas entre o PV+ e o PV− do aparelho, em `vivo` (passe o projeto vivo). */
function fileirasDe(vivo: Projeto, catalogo: Catalogo, uid: string): string[][] {
  const rede = montarRedes(vivo);
  return cadeias(vivo, catalogo, 'placa', rede, rede(uid, 'pvPos'), rede(uid, 'pvNeg'));
}

/** Há fileira completa, entre o PV+ e o PV− do aparelho, com alguma placa recebendo luz. */
function fileiraComSol(vivo: Projeto, catalogo: Catalogo, uid: string, placas: ReadonlyMap<string, CondicaoPlaca>): boolean {
  return fileirasDe(vivo, catalogo, uid).some((f) => f.some((p) => (placas.get(p)?.g ?? 0) > 0));
}

/** Há fileira completa viva no aparelho, com ou sem sol: as placas alcançam o PV+ e o PV− por cabos não interrompidos. */
function temFileiraViva(projeto: Projeto, catalogo: Catalogo, uid: string): boolean {
  return fileirasDe(projetoVivo(projeto, catalogo), catalogo, uid).length > 0;
}

/**
 * As consequências da tabela de operar.md (seção 5) que valem agora, sobre o estado do momento. Peça já queimada não
 * gera nada novo. Depois de aplicar (`aplicarConsequencias`), o estado mudou: quem chama recalcula a análise viva e a
 * saída do passo e chama de novo, até a lista vir vazia.
 *
 * `analiseViva` é a análise de `projetoVivo(projeto)`; `saida` é a do passo no instante; `placas` traz a luz em cada
 * placa (`g > 0` é "com sol"); `horaLocal` limita os aparelhos aos que estão no horário de uso.
 */
export function avaliarOperacao(
  projeto: Projeto,
  catalogo: Catalogo,
  analiseViva: AnaliseCircuito,
  saida: SaidaPasso,
  placas: ReadonlyMap<string, CondicaoPlaca>,
  msUtc: number,
  horaLocal: number | null = null,
): Consequencia[] {
  const lista: Consequencia[] = [];
  const vivo = projetoVivo(projeto, catalogo);
  const dano = (codigo: CodigoDano): Dano => ({ codigo, msUtc });
  const naoQueimado = (d: Dispositivo): boolean => d.queimado === undefined;

  // ---- Controlador sem bateria e bateria invertida no controlador.
  // Sem sol, controlador sem bateria ou com bateria invertida só não liga: não gera nada.
  for (const d of vivo.dispositivos) {
    if (!naoQueimado(d) || itemDe(vivo, catalogo, d.uid)?.categoria !== 'controlador') continue;
    if (!fileiraComSol(vivo, catalogo, d.uid, placas)) continue;
    if (bateriaPresente(vivo, catalogo, d.uid)) continue;
    const codigo = polosTrocados(vivo, catalogo, d.uid) ? 'bateria-invertida' : 'controlador-sem-bateria';
    lista.push({ codigo, uids: [d.uid], msUtc, mudancas: [{ tipo: 'peca-queimada', uid: d.uid, dano: dano(codigo) }] });
  }

  // ---- Bateria invertida no inversor: queima na hora; a primeira proteção de corrente do caminho também abre.
  for (const d of vivo.dispositivos) {
    if (!naoQueimado(d) || itemDe(vivo, catalogo, d.uid)?.categoria !== 'inversor') continue;
    const inversao = acharInversao(vivo, catalogo, d.uid);
    if (!inversao) continue;
    const primeira = inversao.ramo[0];
    const ultima = inversao.ramo[inversao.ramo.length - 1];
    // Caminhos com menos cabos: do BAT+ do inversor ao neg da última bateria, e do BAT− ao pos da primeira.
    const doPositivo = caminhoMaisCurto(vivo, chave(d.uid, 'batPos'), chave(ultima, 'neg')) ?? [];
    const doNegativo = caminhoMaisCurto(vivo, chave(d.uid, 'batNeg'), chave(primeira, 'pos')) ?? [];
    const protecao = primeiraProtecaoDeCorrente(catalogo, [...doPositivo, ...doNegativo]);
    const mudancas: Mudanca[] = [{ tipo: 'peca-queimada', uid: d.uid, dano: dano('bateria-invertida') }];
    const uids = [d.uid];
    if (protecao && protecao.tipo === 'protecao') {
      mudancas.push(protecao);
      uids.push(protecao.cabo);
    }
    lista.push({ codigo: 'bateria-invertida', uids, msUtc, mudancas });
  }

  // ---- Curto na bateria: a análise viva acusa.
  // Cada laço tem uma ponta positiva, uma negativa e a peça que o nomeia (`uid`): a bateria, ou a primeira do ramo em série.
  const curtos = new Map<string, { uid: string; pos: string; neg: string }>();
  /** Conjuntos de baterias que já têm um laço de curto achado, para o laço de baterias não repetir o mesmo curto. */
  const jaNoCurto = new Set<string>();
  const conjunto = (baterias: readonly string[]): string => [...baterias].sort().join('|');
  const acharCurto = (uid: string, primeira: string, ultima: string, baterias: readonly string[] = [uid]): void => {
    const pos = chave(primeira, 'pos');
    const neg = chave(ultima, 'neg');
    curtos.set(`${pos}>${neg}`, { uid, pos, neg });
    jaNoCurto.add(conjunto(baterias));
  };
  for (const problema of analiseViva.problemas) {
    if (problema.codigo !== 'curto-bateria') continue;
    const rede = montarRedes(vivo);
    for (const uid of problema.dispositivos) {
      const item = itemDe(vivo, catalogo, uid);
      if (item?.categoria === 'bateria') {
        acharCurto(uid, uid, uid);
      } else if (item?.categoria === 'inversor') {
        // Curto entre BAT+ e BAT− do inversor: cada bateria ligada ao barramento fecha um laço com os cabos do curto.
        const barramento = rede(uid, 'batPos');
        for (const b of vivo.dispositivos) {
          if (itemDe(vivo, catalogo, b.uid)?.categoria !== 'bateria') continue;
          if (rede(b.uid, 'pos') === barramento && rede(b.uid, 'neg') === barramento) acharCurto(b.uid, b.uid, b.uid);
        }
        // Baterias em série: o curto une o barramento a ele mesmo (P = N), e a análise viva não devolve ramo. Os ramos
        // são achados como em `bateriaPresente`, da rede do BAT+ à do BAT−, e o laço vai do pos da primeira ao neg da última.
        for (const ramo of cadeias(vivo, catalogo, 'bateria', rede, barramento, rede(uid, 'batNeg'), true)) {
          acharCurto(ramo[0], ramo[0], ramo[ramo.length - 1], ramo);
        }
      }
    }
  }
  /** Com proteção de corrente fechada no laço, a de menor corrente abre; sem nenhuma, os cabos do laço queimam. */
  const curtoNoLaco = (laco: Cabo[], pecas: string[]): void => {
    let escolhida: { cabo: Cabo; indice: number; correnteA: number; tipo: Protecao['tipo'] } | null = null;
    for (const cabo of laco) {
      for (let indice = 0; indice < cabo.protecoes.length; indice++) {
        const p = catalogo.get(cabo.protecoes[indice]);
        if (p?.categoria !== 'protecao' || !protecaoDeCorrenteCc(p.tipo) || estadoDaProtecao(cabo, indice) !== 'fechada') continue;
        if (escolhida === null || p.correnteA < escolhida.correnteA) escolhida = { cabo, indice, correnteA: p.correnteA, tipo: p.tipo };
      }
    }
    if (escolhida !== null) {
      lista.push({
        codigo: 'curto-na-bateria',
        uids: [escolhida.cabo.uid, ...pecas],
        msUtc,
        mudancas: [{ tipo: 'protecao', cabo: escolhida.cabo.uid, indice: escolhida.indice, estado: escolhida.tipo === 'fusivel' ? 'queimada' : 'aberta' }],
      });
    } else {
      lista.push({
        codigo: 'curto-na-bateria',
        uids: [...laco.map((c) => c.uid), ...pecas],
        msUtc,
        mudancas: laco.map((c): Mudanca => ({ tipo: 'cabo-queimado', uid: c.uid, dano: dano('curto-na-bateria') })),
      });
    }
  };
  for (const { uid, pos, neg } of curtos.values()) {
    const laco = caminhoMaisCurto(vivo, pos, neg);
    if (laco && laco.length > 0) curtoNoLaco(laco, [uid]);
  }

  // ---- Laço de baterias: baterias em série fechadas sobre si mesmas. O caso comum é o paralelo com uma invertida
  // (o positivo de uma no negativo da outra, nos dois polos). Não depende do inversor nem de chave dele: as tensões se
  // somam em um laço sem carga nenhuma. O laço são os cabos entre uma bateria e a seguinte.
  {
    const rede = montarRedes(vivo);
    const baterias = vivo.dispositivos.filter((d) => itemDe(vivo, catalogo, d.uid)?.categoria === 'bateria');
    for (const b of baterias) {
      const inicio = rede(b.uid, 'pos');
      for (const volta of cadeias(vivo, catalogo, 'bateria', rede, inicio, inicio, true)) {
        if (volta.length < 2 || jaNoCurto.has(conjunto(volta))) continue;
        jaNoCurto.add(conjunto(volta));
        const laco = new Map<string, Cabo>();
        let fechado = true;
        volta.forEach((uid, i) => {
          const trecho = caminhoMaisCurto(vivo, chave(uid, 'neg'), chave(volta[(i + 1) % volta.length], 'pos'));
          if (trecho === null) fechado = false;
          else for (const c of trecho) laco.set(c.uid, c);
        });
        if (fechado && laco.size > 0) curtoNoLaco([...laco.values()], volta);
      }
    }
  }

  // ---- Sobrecarga: o inversor desliga a saída e fica em falha.
  const sistema = analiseViva.sistema;
  if (sistema !== null && saida.avisos.includes('sobrecarga')) {
    const inversor = dispositivoDe(projeto, sistema.inversor);
    if (inversor && inversor.queimado === undefined && inversor.falha === undefined) {
      lista.push({ codigo: 'sobrecarga', uids: [inversor.uid], msUtc, mudancas: [{ tipo: 'falha', uid: inversor.uid, falha: 'sobrecarga' }] });
    }
  }

  // ---- Desarme e fusível queimado: corrente de operação acima da nominal da proteção fechada.
  const correntes = correntesDeOperacao(projeto, catalogo, analiseViva, saida, horaLocal, placas);
  for (const cabo of vivo.cabos) {
    const amperes = correntes.get(cabo.uid) ?? 0;
    cabo.protecoes.forEach((id, indice) => {
      const p = catalogo.get(id);
      if (p?.categoria !== 'protecao' || p.tipo === 'dps' || estadoDaProtecao(cabo, indice) !== 'fechada') return;
      if (amperes <= p.correnteA) return;
      const fusivel = p.tipo === 'fusivel';
      lista.push({
        codigo: fusivel ? 'fusivel-queimou' : 'desarme',
        uids: [cabo.uid],
        msUtc,
        mudancas: [{ tipo: 'protecao', cabo: cabo.uid, indice, estado: fusivel ? 'queimada' : 'aberta' }],
      });
    });
  }

  return lista;
}

/** Projeto novo com as mudanças das consequências. Peça ou proteção já queimada não é refeita nem "melhorada" para aberta. */
export function aplicarConsequencias(projeto: Projeto, consequencias: readonly Consequencia[]): Projeto {
  const mudancas = consequencias.flatMap((c) => c.mudancas);
  if (mudancas.length === 0) return projeto;
  let dispositivos = projeto.dispositivos;
  let cabos = projeto.cabos;
  const trocarDispositivo = (uid: string, f: (d: Dispositivo) => Dispositivo): void => {
    dispositivos = dispositivos.map((d) => (d.uid === uid ? f(d) : d));
  };
  const trocarCabo = (uid: string, f: (c: Cabo) => Cabo): void => {
    cabos = cabos.map((c) => (c.uid === uid ? f(c) : c));
  };
  for (const m of mudancas) {
    switch (m.tipo) {
      case 'peca-queimada':
        trocarDispositivo(m.uid, (d) => (d.queimado ? d : { ...d, queimado: m.dano }));
        break;
      case 'cabo-queimado':
        trocarCabo(m.uid, (c) => (c.queimado ? c : { ...c, queimado: m.dano }));
        break;
      case 'falha':
        trocarDispositivo(m.uid, (d) => ({ ...d, falha: m.falha }));
        break;
      case 'protecao':
        trocarCabo(m.cabo, (c) => {
          const estados: EstadoProtecao[] = c.protecoes.map((_, i) => estadoDaProtecao(c, i));
          if (estados[m.indice] === 'queimada') return c;
          estados[m.indice] = m.estado;
          return { ...c, estados };
        });
        break;
    }
  }
  return { ...projeto, dispositivos, cabos };
}

// ---------------------------------------------------------------- Consequências que dependem da ação

/** Ação do usuário que as funções de arco avaliam, sobre o projeto de antes dela. */
export type AcaoDeOperacao =
  | { tipo: 'apagar-cabo'; cabo: string }
  | { tipo: 'apagar-dispositivo'; uid: string }
  | { tipo: 'abrir-protecao'; cabo: string; indice: number };

/**
 * `arco-no-conector`: apagar um cabo das placas, ou a placa, com corrente passando. `correntes` são as correntes de
 * operação de antes da ação. Ao apagar um cabo, queima a placa da ponta dele (as duas, em uma emenda entre placas). Ao
 * apagar uma placa, queima a peça da outra ponta de cada cabo com corrente dela, quando for uma placa; se não for, fica
 * só o evento, sem mudança. Nulo se não há arco.
 */
export function arcoNoConector(
  projetoAntes: Projeto,
  catalogo: Catalogo,
  acao: AcaoDeOperacao,
  correntes: ReadonlyMap<string, number>,
  msUtc: number,
): Consequencia | null {
  const dano: Dano = { codigo: 'arco-no-conector', msUtc };
  const ePlaca = (uid: string): boolean => itemDe(projetoAntes, catalogo, uid)?.categoria === 'placa';
  const inteira = (uid: string): boolean => dispositivoDe(projetoAntes, uid)?.queimado === undefined;
  let placas: string[] = [];
  if (acao.tipo === 'apagar-cabo') {
    const cabo = projetoAntes.cabos.find((c) => c.uid === acao.cabo);
    if (!cabo || (correntes.get(cabo.uid) ?? 0) <= 0) return null;
    placas = [...new Set([cabo.de.disp, cabo.para.disp])].filter(ePlaca).filter(inteira);
    if (placas.length === 0) return null;
    return {
      codigo: 'arco-no-conector', uids: [acao.cabo, ...placas], msUtc,
      mudancas: placas.map((uid): Mudanca => ({ tipo: 'peca-queimada', uid, dano })),
    };
  }
  if (acao.tipo !== 'apagar-dispositivo' || !ePlaca(acao.uid)) return null;
  // A placa apagada some: queima a peça da outra ponta de cada cabo com corrente, se for uma placa (o outro conector da emenda).
  const comCorrente = projetoAntes.cabos.filter((c) => (c.de.disp === acao.uid || c.para.disp === acao.uid) && (correntes.get(c.uid) ?? 0) > 0);
  if (comCorrente.length === 0) return null;
  placas = [...new Set(comCorrente.map((c) => (c.de.disp === acao.uid ? c.para.disp : c.de.disp)))]
    .filter((uid) => uid !== acao.uid && ePlaca(uid))
    .filter(inteira);
  return {
    codigo: 'arco-no-conector', uids: [acao.uid, ...placas], msUtc,
    mudancas: placas.map((uid): Mudanca => ({ tipo: 'peca-queimada', uid, dano })),
  };
}

/**
 * `arco-no-disjuntor-ca`: abrir um disjuntor CA instalado em cabo de corrente contínua (circuito da bateria ou das
 * placas) com corrente passando. O arco não apaga e o disjuntor queima. Nulo nos demais casos.
 */
export function arcoNoDisjuntorCa(
  projetoAntes: Projeto,
  catalogo: Catalogo,
  acao: AcaoDeOperacao,
  correntes: ReadonlyMap<string, number>,
  msUtc: number,
): Consequencia | null {
  if (acao.tipo !== 'abrir-protecao') return null;
  const cabo = projetoAntes.cabos.find((c) => c.uid === acao.cabo);
  if (!cabo || (correntes.get(cabo.uid) ?? 0) <= 0) return null;
  if (tipoDaProtecao(catalogo, cabo.protecoes[acao.indice] ?? '') !== 'disjuntorCA') return null;
  if (estadoDaProtecao(cabo, acao.indice) !== 'fechada') return null;
  const circuito = circuitoDoCabo(projetoAntes, analisarCircuito(projetoAntes, catalogo), cabo);
  if (circuito === undefined || !CIRCUITOS_CC.includes(circuito)) return null;
  return {
    codigo: 'arco-no-disjuntor-ca',
    uids: [cabo.uid],
    msUtc,
    mudancas: [{ tipo: 'protecao', cabo: cabo.uid, indice: acao.indice, estado: 'queimada' }],
  };
}

// ---------------------------------------------------------------- Ordem certa de ligar e desligar

/** Uma manobra: mudar a chave de uma proteção ou o botão do inversor. */
export type Manobra =
  | { tipo: 'protecao'; cabo: string; indice: number; estado: 'fechada' | 'aberta' }
  | { tipo: 'inversor'; uid: string; ligado: boolean };

/** Projeto novo com as manobras aplicadas, na ordem dada. Apertar o botão do inversor limpa a falha. Proteção queimada não muda. */
export function aplicarManobras(projeto: Projeto, manobras: readonly Manobra[]): Projeto {
  let { dispositivos, cabos } = projeto;
  for (const m of manobras) {
    if (m.tipo === 'inversor') {
      dispositivos = dispositivos.map((d) => {
        if (d.uid !== m.uid) return d;
        const { falha: _falha, ...resto } = d;
        return { ...resto, ligado: m.ligado };
      });
    } else {
      cabos = cabos.map((c) => {
        if (c.uid !== m.cabo || estadoDaProtecao(c, m.indice) === 'queimada') return c;
        const estados: EstadoProtecao[] = c.protecoes.map((_, i) => estadoDaProtecao(c, i));
        estados[m.indice] = m.estado;
        return { ...c, estados };
      });
    }
  }
  return manobras.length === 0 ? projeto : { ...projeto, dispositivos, cabos };
}

/** Problemas da análise de projeto que impedem ligar: polaridade e curto. */
type ProblemaQueImpede = 'bateria-invertida' | 'placa-invertida' | 'curto-bateria' | 'curto-placas';

/** Por que "Ligar o sistema" recusa. */
export interface RecusaDeEnergizar {
  /**
   * O primeiro impedimento encontrado: um problema de polaridade ou de curto na montagem (passo 1), ou
   * `'controlador-sem-bateria'`, quando a bateria não chega ao controlador mesmo com as chaves dela fechadas (proteção
   * ou cabo queimado no caminho) e fechar a chave das placas queimaria o controlador.
   */
  codigo: ProblemaQueImpede | 'controlador-sem-bateria';
  /** Peças e cabos do problema. */
  uids: string[];
  texto: string;
}

export interface PlanoDeEnergizar {
  /** Vazio quando há recusa. */
  manobras: Manobra[];
  recusa: RecusaDeEnergizar | null;
}

const TEXTO_DA_RECUSA: Record<ProblemaQueImpede, string> = {
  'bateria-invertida': 'A bateria está ligada com os polos trocados. Antes de fechar qualquer chave, confira positivo com positivo e negativo com negativo.',
  'placa-invertida': 'Uma placa está ligada com os polos trocados. Antes de fechar qualquer chave, confira positivo com positivo e negativo com negativo.',
  'curto-bateria': 'Há um curto-circuito na bateria. Antes de fechar qualquer chave, desfaça a ligação que une o positivo ao negativo.',
  'curto-placas': 'Há um curto-circuito nas placas. Antes de fechar qualquer chave, desfaça a ligação que une o positivo ao negativo.',
};

/** Proteções com chave (todas menos o DPS) de um circuito, na ordem dos cabos. As queimadas ficam de fora: só voltam com o conserto. */
function chavesDoCircuito(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito, circuito: Circuito, alvo: EstadoProtecao): Manobra[] {
  const manobras: Manobra[] = [];
  for (const cabo of projeto.cabos) {
    if (circuitoDoCabo(projeto, analise, cabo) !== circuito) continue;
    cabo.protecoes.forEach((id, indice) => {
      const tipo = tipoDaProtecao(catalogo, id);
      const atual = estadoDaProtecao(cabo, indice);
      if (tipo === undefined || tipo === 'dps' || atual === 'queimada' || atual === alvo) return;
      manobras.push({ tipo: 'protecao', cabo: cabo.uid, indice, estado: alvo === 'fechada' ? 'fechada' : 'aberta' });
    });
  }
  return manobras;
}

function manobraDoInversor(projeto: Projeto, analise: AnaliseCircuito, ligar: boolean): Manobra[] {
  const uid = analise.sistema?.inversor;
  const d = uid ? dispositivoDe(projeto, uid) : undefined;
  if (!d || d.queimado !== undefined) return [];
  if (ligar ? d.ligado && d.falha === undefined : !d.ligado && d.falha === undefined) return [];
  return [{ tipo: 'inversor', uid: d.uid, ligado: ligar }];
}

const PORQUE_SEM_BATERIA = 'com as placas ligadas e sem bateria, o controlador queima.';

/**
 * A recusa de fechar a chave das placas de um controlador que não recebe a bateria: diz o que trocar ou consertar
 * primeiro. Procura a proteção queimada (ou o cabo queimado) no caminho com menos cabos entre os terminais de bateria do
 * controlador e as pontas de um ramo do banco, na montagem inteira.
 */
function recusaPorControladorSemBateria(projeto: Projeto, catalogo: Catalogo, controlador: string): RecusaDeEnergizar {
  const rede = montarRedes(projeto);
  const ramo = cadeias(projeto, catalogo, 'bateria', rede, rede(controlador, 'batPos'), rede(controlador, 'batNeg'))[0];
  const caminho = ramo === undefined ? [] : [
    ...(caminhoMaisCurto(projeto, chave(controlador, 'batPos'), chave(ramo[0], 'pos')) ?? []),
    ...(caminhoMaisCurto(projeto, chave(controlador, 'batNeg'), chave(ramo[ramo.length - 1], 'neg')) ?? []),
  ];
  for (const cabo of caminho) {
    const indice = cabo.protecoes.findIndex((_, i) => estadoDaProtecao(cabo, i) === 'queimada');
    if (indice < 0) continue;
    const item = catalogo.get(cabo.protecoes[indice]);
    const nome = item?.nome ?? 'proteção';
    const texto = item?.categoria === 'protecao' && item.tipo === 'fusivel'
      ? `O fusível da bateria do controlador de carga está queimado (${nome}). Troque o fusível antes de ligar o sistema: ${PORQUE_SEM_BATERIA}`
      : `A proteção da bateria do controlador de carga está queimada (${nome}). Conserte-a antes de ligar o sistema: ${PORQUE_SEM_BATERIA}`;
    return { codigo: 'controlador-sem-bateria', uids: [controlador, cabo.uid], texto };
  }
  const queimado = caminho.find((c) => c.queimado !== undefined);
  if (queimado) {
    return {
      codigo: 'controlador-sem-bateria',
      uids: [controlador, queimado.uid],
      texto: `O cabo entre a bateria e o controlador de carga está queimado. Conserte o cabo antes de ligar o sistema: ${PORQUE_SEM_BATERIA}`,
    };
  }
  return {
    codigo: 'controlador-sem-bateria',
    uids: [controlador],
    texto: `A bateria não chega ao controlador de carga. Conserte o que interrompe a ligação entre os dois antes de ligar o sistema: ${PORQUE_SEM_BATERIA}`,
  };
}

/**
 * Passos 2 a 5 de operar.md, seção 6, em ordem: proteções da bateria, proteções das placas, inversor, proteções da
 * saída. Só entram as manobras que mudam algo. Os aparelhos ficam de fora. As proteções da entrada CA (rede) não fazem
 * parte do atalho. Recusa, sem manobra nenhuma:
 * - se o passo 1 falha: erro de polaridade ou de curto na análise de projeto, ou os polos da bateria trocados nos
 *   terminais de um controlador ou do inversor, olhando a montagem inteira (como se tudo estivesse fechado);
 * - se, depois da etapa da bateria, o controlador das placas continua sem bateria presente (proteção da bateria dele
 *   queimada, que fica de fora das manobras): fechar a chave das placas queimaria o controlador.
 */
export function sequenciaDeEnergizar(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): PlanoDeEnergizar {
  const impeditivo = analise.problemas.find((p): p is typeof p & { codigo: ProblemaQueImpede } =>
    p.codigo === 'bateria-invertida' || p.codigo === 'placa-invertida' || p.codigo === 'curto-bateria' || p.codigo === 'curto-placas',
  );
  if (impeditivo) {
    const recusa: RecusaDeEnergizar = {
      codigo: impeditivo.codigo,
      uids: [...impeditivo.dispositivos, ...impeditivo.cabos],
      texto: TEXTO_DA_RECUSA[impeditivo.codigo],
    };
    return { manobras: [], recusa };
  }
  // Polos trocados nos terminais de bateria de um controlador (a análise de projeto só olha os do inversor) ou do inversor.
  for (const d of projeto.dispositivos) {
    const ramo = inversaoNaMontagem(projeto, catalogo, d.uid);
    if (ramo === null) continue;
    return { manobras: [], recusa: { codigo: 'bateria-invertida', uids: [d.uid, ...ramo], texto: TEXTO_DA_RECUSA['bateria-invertida'] } };
  }

  const daBateria = chavesDoCircuito(projeto, catalogo, analise, 'bateria', 'fechada');
  const dasPlacas = chavesDoCircuito(projeto, catalogo, analise, 'placas', 'fechada');
  // Só fecha a chave das placas do controlador se, com a etapa da bateria feita, ele tem bateria presente.
  const controlador = analise.sistema?.controlador ?? null;
  if (controlador !== null && dasPlacas.length > 0 && dispositivoDe(projeto, controlador)?.queimado === undefined) {
    if (!bateriaPresente(aplicarManobras(projeto, daBateria), catalogo, controlador)) {
      return { manobras: [], recusa: recusaPorControladorSemBateria(projeto, catalogo, controlador) };
    }
  }
  return {
    manobras: [
      ...daBateria,
      ...dasPlacas,
      ...manobraDoInversor(projeto, analise, true),
      ...chavesDoCircuito(projeto, catalogo, analise, 'saida', 'fechada'),
    ],
    recusa: null,
  };
}

/** Por que "Desligar o sistema" não desligou tudo. */
export interface AvisoDeDesenergizar {
  codigo: 'placas-sem-chave';
  /** Os controladores que ficaram ligados à bateria e os cabos das proteções que ficaram fechadas. */
  uids: string[];
  texto: string;
}

export interface PlanoDeDesenergizar {
  manobras: Manobra[];
  aviso: AvisoDeDesenergizar | null;
}

const TEXTO_PLACAS_SEM_CHAVE =
  'O controlador ficou ligado à bateria: as placas dele não têm disjuntor. Para desligar tudo, solte ou cubra as placas antes.';

/**
 * A ordem inversa: saída, inversor, placas e por último a bateria. Controlador que continua com fileira viva depois da
 * etapa das placas (as placas dele não têm chave nenhuma para abrir) não pode ficar sem bateria: a manobra da bateria
 * que o deixaria sem ela não entra, e o plano devolve o aviso `placas-sem-chave`. Vale de dia e de noite, porque o sol
 * nasce depois. As demais proteções da bateria (a do inversor, quando o controlador não depende dela) abrem.
 */
export function planoDeDesenergizar(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): PlanoDeDesenergizar {
  const manobras: Manobra[] = [
    ...chavesDoCircuito(projeto, catalogo, analise, 'saida', 'aberta'),
    ...manobraDoInversor(projeto, analise, false),
    ...chavesDoCircuito(projeto, catalogo, analise, 'placas', 'aberta'),
  ];
  let atual = aplicarManobras(projeto, manobras);
  const presos = atual.dispositivos
    .filter((d) => catalogo.get(d.itemId)?.categoria === 'controlador' && d.queimado === undefined)
    .map((d) => d.uid)
    .filter((uid) => temFileiraViva(atual, catalogo, uid) && bateriaPresente(atual, catalogo, uid));
  const ficaram = new Set<string>();
  const cabos = new Set<string>();
  for (const m of chavesDoCircuito(projeto, catalogo, analise, 'bateria', 'aberta')) {
    const tentativa = aplicarManobras(atual, [m]);
    const semBateria = presos.filter((uid) => !bateriaPresente(tentativa, catalogo, uid));
    if (semBateria.length > 0) {
      for (const uid of semBateria) ficaram.add(uid);
      if (m.tipo === 'protecao') cabos.add(m.cabo);
      continue;
    }
    atual = tentativa;
    manobras.push(m);
  }
  const aviso: AvisoDeDesenergizar | null =
    ficaram.size > 0 ? { codigo: 'placas-sem-chave', uids: [...ficaram, ...cabos], texto: TEXTO_PLACAS_SEM_CHAVE } : null;
  return { manobras, aviso };
}

/** As manobras de `planoDeDesenergizar`. */
export function sequenciaDeDesenergizar(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): Manobra[] {
  return planoDeDesenergizar(projeto, catalogo, analise).manobras;
}

// ---------------------------------------------------------------- Consertar

export type AlvoDeConserto =
  | { tipo: 'dispositivo'; uid: string }
  | { tipo: 'cabo'; uid: string }
  | { tipo: 'protecao'; cabo: string; indice: number };

/**
 * Tira o `queimado` de uma peça ou de um cabo, ou troca a proteção queimada (vira `aberta`). Em peça, limpa também a
 * `falha`. Não corrige a causa: se a ligação continua errada, a peça queima de novo quando for energizada.
 */
export function consertar(projeto: Projeto, alvo: AlvoDeConserto): Projeto {
  switch (alvo.tipo) {
    case 'dispositivo':
      return {
        ...projeto,
        dispositivos: projeto.dispositivos.map((d) => {
          if (d.uid !== alvo.uid) return d;
          const { queimado: _queimado, falha: _falha, ...resto } = d;
          return resto;
        }),
      };
    case 'cabo':
      return {
        ...projeto,
        cabos: projeto.cabos.map((c) => {
          if (c.uid !== alvo.uid) return c;
          const { queimado: _queimado, ...resto } = c;
          return resto;
        }),
      };
    case 'protecao':
      return {
        ...projeto,
        cabos: projeto.cabos.map((c) => {
          if (c.uid !== alvo.cabo || estadoDaProtecao(c, alvo.indice) !== 'queimada') return c;
          const estados: EstadoProtecao[] = c.protecoes.map((_, i) => estadoDaProtecao(c, i));
          estados[alvo.indice] = 'aberta';
          return { ...c, estados };
        }),
      };
  }
}
