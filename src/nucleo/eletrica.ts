// Placas, entrada solar, banco de baterias e passo de simulação.
// Especificação: docs/especificacao/nucleo.md, seções 3 a 7. Tarefa 1.5.

import type { Aparelho, Bateria, Catalogo, EntradaSolar, Inversor, Placa, Quimica } from '../catalogo/tipos';
import type {
  AnaliseCircuito, AvisoPasso, CondicaoPlaca, EntradaPasso, EstadoPlaca, EstadoSim, InfoBanco, OrigemEnergia,
  Projeto, SaidaArranjo, SaidaPasso, Sistema,
} from './tipos';
import { emUso, usoDe } from './uso';

// ---------------------------------------------------------------- Placa

/** Temperatura da célula a 800 W/m² e 20 °C, em °C. */
const NOCT = 47;
/** Queda de potência com a temperatura, por °C. */
const COEF_PMAX = -0.0035;
/** Queda da tensão de trabalho, por °C. */
const COEF_VMP = -0.003;
/** Queda da tensão de circuito aberto, por °C. */
const COEF_VOC = -0.0027;
/** Sujeira, envelhecimento e diferença entre placas. */
const PERDAS_PLACA = 0.07;
/** Célula mais fria considerada no Rio, em °C. */
const T_FRIO = 10;
/** Célula mais quente considerada, em °C. */
const T_QUENTE = 70;

/** Potência, tensão e corrente de uma placa para a irradiância e a temperatura ambiente dadas. */
export function estadoPlaca(placa: Placa, g: number, tAmb: number): EstadoPlaca {
  if (g < 20) return { p: 0, v: 0, i: 0, tCel: tAmb };
  const tCel = tAmb + ((NOCT - 20) * g) / 800;
  const p = placa.wp * (g / 1000) * (1 + COEF_PMAX * (tCel - 25)) * (1 - PERDAS_PLACA);
  const v = placa.vmp * (1 + COEF_VMP * (tCel - 25));
  return { p, v, i: p / v, tCel };
}

/** Tensão de circuito aberto de `n` placas em série com a célula a 10 °C. */
export function vocFrio(placa: Placa, n = 1): number {
  return n * placa.voc * (1 + COEF_VOC * (T_FRIO - 25));
}

/** Tensão de trabalho de `n` placas em série com a célula a 70 °C. */
export function vmpQuente(placa: Placa, n = 1): number {
  return n * placa.vmp * (1 + COEF_VMP * (T_QUENTE - 25));
}

// ---------------------------------------------------------------- Fileiras e arranjo

/** Fileira com diodo de desvio: a placa mais fraca limita as outras, a não ser que seja desviada. */
function estadoFileira(placas: EstadoPlaca[]): { p: number; i: number; v: number } {
  let melhor = { p: 0, i: 0, v: 0 };
  let primeiro = true;
  for (const j of placas) {
    let v = 0;
    for (const k of placas) if (k.i >= j.i) v += k.v;
    const p = j.i * v;
    if (primeiro || p > melhor.p) {
      melhor = { p, i: j.i, v };
      primeiro = false;
    }
  }
  return melhor;
}

// ---------------------------------------------------------------- Entrada solar

const RENDIMENTO_MPPT = 0.97;

/** Potência que o arranjo entrega ao barramento da bateria pela entrada solar dada. */
export function saidaArranjo(fileiras: EstadoPlaca[][], solar: EntradaSolar, tensaoCarga: number): SaidaArranjo {
  const resultados = fileiras.filter((f) => f.length > 0).map(estadoFileira);
  const pBruta = resultados.reduce((s, f) => s + f.p, 0);
  const i = resultados.reduce((s, f) => s + f.i, 0);
  const v = resultados.reduce((m, f) => Math.max(m, f.v), 0);
  const avisos: AvisoPasso[] = [];

  if (resultados.length === 0 || pBruta === 0) return { p: 0, v, i, avisos };

  let p = 0;
  if (solar.tipo === 'mppt') {
    const vMinEfetivo = Math.max(solar.vMin, tensaoCarga + 2);
    if (v < vMinEfetivo) {
      avisos.push('placas-tensao-baixa');
    } else if (v > solar.vMax) {
      avisos.push('placas-tensao-alta');
    } else {
      p = pBruta * RENDIMENTO_MPPT;
      if (solar.correnteEntradaMaxA !== undefined && i > solar.correnteEntradaMaxA) {
        p = (p * solar.correnteEntradaMaxA) / i;
        avisos.push('placas-limitadas');
      }
      if (p > solar.potenciaMaxW) {
        p = solar.potenciaMaxW;
        if (!avisos.includes('placas-limitadas')) avisos.push('placas-limitadas');
      }
    }
  } else if (v < tensaoCarga + 1) {
    avisos.push('placas-tensao-baixa');
  } else {
    const iUtil = Math.min(i, solar.correnteCargaA);
    if (i > solar.correnteCargaA) avisos.push('placas-limitadas');
    p = iUtil * tensaoCarga;
  }
  return { p, v, i, avisos };
}

// ---------------------------------------------------------------- Banco de baterias

const PARAMETROS_QUIMICA: Record<Quimica, { socMin: number; rend: number; fatorRef: number }> = {
  lifepo4: { socMin: 0.1, rend: 0.975, fatorRef: 1.0667 },
  chumbo: { socMin: 0.5, rend: 0.894, fatorRef: 1 },
  automotiva: { socMin: 0.7, rend: 0.866, fatorRef: 1 },
};

/** Tensão de carga sobre a nominal do banco. */
export const FATOR_TENSAO_CARGA = 1.17;
/** Maior corrente de carregador de rede que o simulador considera, em A. */
export const LIMITE_CARREGADOR_REDE_A = 20;

function dispositivoPorUid(projeto: Projeto, uid: string) {
  return projeto.dispositivos.find((d) => d.uid === uid);
}

function bateriaDe(projeto: Projeto, catalogo: Catalogo, uid: string): Bateria | null {
  const d = dispositivoPorUid(projeto, uid);
  const item = d ? catalogo.get(d.itemId) : undefined;
  return item && item.categoria === 'bateria' ? item : null;
}

function inversorDe(projeto: Projeto, catalogo: Catalogo, uid: string): Inversor | null {
  const d = dispositivoPorUid(projeto, uid);
  const item = d ? catalogo.get(d.itemId) : undefined;
  return item && item.categoria === 'inversor' ? item : null;
}

/** Dados do banco de baterias do sistema. Nulo se não houver banco. */
export function infoBanco(sistema: Sistema, projeto: Projeto, catalogo: Catalogo): InfoBanco | null {
  const inversor = inversorDe(projeto, catalogo, sistema.inversor);
  if (!inversor) return null;

  // Estação portátil: a bateria é interna.
  if (inversor.bateriaInternaWh !== undefined) {
    const par = PARAMETROS_QUIMICA.lifepo4;
    const tensao = inversor.tensaoBateria;
    const tensaoRef = tensao * par.fatorRef;
    const wh = inversor.bateriaInternaWh;
    return {
      tensao,
      tensaoRef,
      tensaoCarga: tensao * FATOR_TENSAO_CARGA,
      ah: wh / tensaoRef,
      wh,
      whUtil: wh * (1 - par.socMin),
      socMin: par.socMin,
      descargaMaxA: Infinity,
      cargaMaxA: Infinity,
      rendCarga: par.rend,
      rendDescarga: par.rend,
      quimica: 'lifepo4',
      ramos: 1,
    };
  }

  const ramos: Bateria[][] = [];
  for (const ramo of sistema.banco) {
    const baterias: Bateria[] = [];
    for (const uid of ramo) {
      const b = bateriaDe(projeto, catalogo, uid);
      if (b) baterias.push(b);
    }
    if (baterias.length > 0) ramos.push(baterias);
  }
  if (ramos.length === 0) return null;

  const tensao = ramos[0].reduce((s, b) => s + b.tensao, 0);
  const quimica = ramos[0][0].quimica;
  const par = PARAMETROS_QUIMICA[quimica];
  const menor = (ramo: Bateria[], campo: 'ah' | 'descargaMaxA' | 'cargaMaxA') => Math.min(...ramo.map((b) => b[campo]));
  const soma = (campo: 'ah' | 'descargaMaxA' | 'cargaMaxA') => ramos.reduce((s, r) => s + menor(r, campo), 0);

  const tensaoRef = tensao * par.fatorRef;
  const ah = soma('ah');
  const wh = ah * tensaoRef;
  return {
    tensao,
    tensaoRef,
    tensaoCarga: tensao * FATOR_TENSAO_CARGA,
    ah,
    wh,
    whUtil: wh * (1 - par.socMin),
    socMin: par.socMin,
    descargaMaxA: soma('descargaMaxA'),
    cargaMaxA: soma('cargaMaxA'),
    rendCarga: par.rend,
    rendDescarga: par.rend,
    quimica,
    ramos: ramos.length,
  };
}

/** Quanto a bateria aceita de carga, em W, em um passo de `dt` horas. */
function cargaAceita(b: InfoBanco, soc: number, dt: number): number {
  let aceita = Math.min(b.cargaMaxA * b.tensaoCarga, ((1 - soc) * b.wh) / (b.rendCarga * dt));
  if (b.quimica !== 'lifepo4' && soc > 0.8) aceita *= Math.max(0.1, (1 - soc) / 0.2);
  return Math.max(0, aceita);
}

// ---------------------------------------------------------------- Passo de simulação

/** Bateria cheia, inversor ligado. */
export function estadoInicial(): EstadoSim {
  return { soc: 1, cortado: false, emRede: false };
}

function saidaVazia(estado: EstadoSim, avisos: AvisoPasso[] = [], cargaPedidaW = 0): SaidaPasso {
  return {
    pvW: 0, pvTensao: 0, cargaPedidaW, cargaAtendidaW: 0, bateriaW: 0, redeW: 0,
    origem: 'nenhuma', estado: { ...estado }, avisos,
  };
}

const limitar = (x: number) => Math.min(1, Math.max(0, x));

/** Avança a simulação em `entrada.dtHoras`. */
export function passoSimulacao(
  projeto: Projeto,
  catalogo: Catalogo,
  analise: AnaliseCircuito,
  estado: EstadoSim,
  entrada: EntradaPasso,
): SaidaPasso {
  // 1. Sem sistema.
  const sistema = analise.sistema;
  if (!sistema) return saidaVazia(estado);
  const inversor = inversorDe(projeto, catalogo, sistema.inversor);
  if (!inversor) return saidaVazia(estado);

  const dt = entrada.dtHoras;
  const avisos: AvisoPasso[] = [];
  const avisar = (a: AvisoPasso) => {
    if (!avisos.includes(a)) avisos.push(a);
  };

  // 4 (calculado antes porque a saída sem banco também informa a carga pedida). Cargas ligadas.
  let pedidaW = 0;
  let nominalW = 0;
  for (const uid of sistema.cargas) {
    const d = dispositivoPorUid(projeto, uid);
    const item = d ? catalogo.get(d.itemId) : undefined;
    if (!d || !item || item.categoria !== 'aparelho' || d.ligado !== true) continue;
    const ap: Aparelho = item;
    if (entrada.horaLocal !== null && !emUso(usoDe(d, ap), entrada.horaLocal)) continue;
    pedidaW += ap.mediaW;
    nominalW += ap.potenciaW;
  }

  // 2. Banco.
  const b = infoBanco(sistema, projeto, catalogo);
  if (!b) return saidaVazia(estado, ['sem-bateria'], pedidaW);

  // 3. Placas.
  const semCondicao: CondicaoPlaca = { g: 0, tAmb: 25 };
  const fileiras: EstadoPlaca[][] = [];
  for (const fileira of sistema.fileiras) {
    const placas: EstadoPlaca[] = [];
    for (const uid of fileira) {
      const d = dispositivoPorUid(projeto, uid);
      const item = d ? catalogo.get(d.itemId) : undefined;
      if (!item || item.categoria !== 'placa') continue;
      const cond = entrada.placas.get(uid) ?? semCondicao;
      placas.push(estadoPlaca(item, cond.g, cond.tAmb));
    }
    fileiras.push(placas);
  }
  const solar = sistema.entradaSolar;
  const arranjo = solar ? saidaArranjo(fileiras, solar, b.tensaoCarga) : { p: 0, v: 0, i: 0, avisos: [] as AvisoPasso[] };
  for (const a of arranjo.avisos) avisar(a);
  const pvDisp = arranjo.p;
  const limiteSolarW = solar ? solar.correnteCargaA * b.tensaoCarga : 0;

  const sobrecarga = nominalW > inversor.potenciaW;
  if (sobrecarga) avisar('sobrecarga');
  const consumoVazioW = inversor.consumoVazioW;

  // 5. Modo "solar primeiro".
  let { soc, cortado, emRede } = estado;
  const redeOk = entrada.redeDisponivel && sistema.redeLigada;
  if (projeto.prioridade === 'solar') {
    if (redeOk) {
      if (!emRede && soc <= b.socMin + 0.1) emRede = true;
      else if (emRede && soc >= 0.9) emRede = false;
    }
  } else {
    emRede = false;
  }

  // 6. Uso da rede.
  const usaRede = redeOk && (projeto.prioridade === 'rede' || emRede);

  let pvW = 0;
  let cargaAtendidaW = 0;
  let bateriaW = 0;
  let redeW = 0;
  let origem: OrigemEnergia = 'nenhuma';

  if (usaRede) {
    // 7.
    cortado = false;
    cargaAtendidaW = sobrecarga ? 0 : pedidaW;
    const aceita = cargaAceita(b, soc, dt);
    const cargaPlacas = Math.max(0, Math.min(pvDisp, aceita, limiteSolarW));
    const limiteRedeW = Math.min(inversor.carregadorRedeA ?? 0, LIMITE_CARREGADOR_REDE_A) * b.tensaoCarga;
    const cargaRede = Math.max(0, Math.min(aceita - cargaPlacas, limiteRedeW));
    const carga = cargaPlacas + cargaRede;
    soc += (carga * b.rendCarga * dt) / b.wh;
    pvW = cargaPlacas;
    bateriaW = carga;
    redeW = cargaAtendidaW + consumoVazioW + cargaRede;
    origem = 'rede';
  } else {
    // 8.
    if (cortado && soc >= b.socMin + 0.05) cortado = false;
    const pCc = cortado ? 0 : sobrecarga || pedidaW === 0 ? consumoVazioW : pedidaW / inversor.rendimento + consumoVazioW;
    const liquido = pvDisp - pCc;
    const atendivel = cortado || sobrecarga ? 0 : pedidaW;

    if (liquido >= 0) {
      const aceita = cargaAceita(b, soc, dt);
      const carga = Math.max(0, Math.min(liquido, aceita, limiteSolarW));
      soc += (carga * b.rendCarga * dt) / b.wh;
      pvW = pCc + carga;
      bateriaW = carga;
      cargaAtendidaW = atendivel;
      if (cargaAtendidaW > 0) origem = 'solar';
    } else {
      const falta = -liquido;
      if (falta / b.tensaoRef > b.descargaMaxA) {
        avisar('bms');
      } else {
        pvW = pvDisp;
        origem = 'bateria';
        const disponivelWh = Math.max(0, soc - b.socMin) * b.wh * b.rendDescarga;
        const necessarioWh = falta * dt;
        if (disponivelWh >= necessarioWh) {
          soc -= necessarioWh / (b.wh * b.rendDescarga);
          bateriaW = -falta;
          cargaAtendidaW = atendivel;
        } else {
          const fracao = necessarioWh > 0 ? disponivelWh / necessarioWh : 0;
          soc = Math.min(soc, b.socMin);
          cortado = true;
          avisar('bateria-vazia');
          bateriaW = -falta * fracao;
          cargaAtendidaW = atendivel * fracao;
        }
      }
    }
  }

  return {
    pvW,
    pvTensao: arranjo.v,
    cargaPedidaW: pedidaW,
    cargaAtendidaW,
    bateriaW,
    redeW,
    origem,
    estado: { soc: limitar(soc), cortado, emRede },
    avisos,
  };
}
