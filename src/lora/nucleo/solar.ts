// Dimensionamento da placa e da bateria de um repetidor solar. Especificação: docs/especificacao/lora.md, seção 4.10.
// É o único ponto em que o ambiente de LoRa usa o cálculo do ambiente solar: as perdas da placa, o rendimento
// e a descarga máxima da bateria de lítio e a irradiação do Rio vêm de src/nucleo, para os dois ambientes não divergirem.

import { PARAMETROS_QUIMICA, PERDAS_PLACA } from '../../nucleo/eletrica';
import { LOCAIS } from '../../nucleo/irradiancia';

/**
 * Consumo médio estimado de um rádio de baixo consumo (RAK4631) como repetidor, em mA: de 5 (pouco tráfego) a 40 (tráfego moderado).
 * Fonte: guia de montagem de nó solar do d-central (https://d-central.tech/solar-meshtastic-node-build/), que marca os números
 * como estimativa e manda medir. Não há medição publicada: por isso o resultado sai como faixa.
 */
export const CONSUMO_ESTIMADO_MA: [min: number, max: number] = [5, 40];

/** Tensão nominal da bateria de lítio do rádio, em V. É a que o guia usa para converter mA em Wh. */
export const TENSAO_DO_RADIO_V = 3.7;

/** Dias seguidos sem sol que a bateria deve aguentar. Escolha do projeto para o valor inicial; a pessoa ajusta. */
export const DIAS_SEM_SOL_PADRAO = 3;

const local = LOCAIS[0]!;
const piorMes = local.ghiMensal.indexOf(Math.min(...local.ghiMensal));
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Sol do pior mês no local do simulador solar: energia que chega por dia em uma placa deitada, em kWh/m²/dia. */
export const SOL_DO_PIOR_MES = { kwhM2Dia: Math.min(...local.ghiMensal), mes: MESES[piorMes]!, local: local.nome };

export interface AjustesDoRepetidorSolar {
  consumoMinMa: number;
  consumoMaxMa: number;
  diasSemSol: number;
  /** Sol do pior mês, em kWh/m²/dia (o mesmo que "horas de sol pleno" por dia). */
  solKwhM2Dia: number;
}

export const AJUSTES_PADRAO_DO_REPETIDOR_SOLAR: AjustesDoRepetidorSolar = {
  consumoMinMa: CONSUMO_ESTIMADO_MA[0],
  consumoMaxMa: CONSUMO_ESTIMADO_MA[1],
  diasSemSol: DIAS_SEM_SOL_PADRAO,
  solKwhM2Dia: SOL_DO_PIOR_MES.kwhM2Dia,
};

export interface NecessidadeSolar {
  /** Energia que o rádio gasta por dia, em Wh. */
  whPorDia: number;
  /** Potência mínima da placa, em W, para repor um dia de consumo em um dia do pior mês. */
  placaW: number;
  /** Capacidade mínima da bateria, em Wh, para os dias sem sol. */
  bateriaWh: number;
  /** A mesma capacidade em mAh, na tensão nominal do rádio. */
  bateriaMah: number;
}

/** Placa e bateria para um consumo médio, em mA. Sem sol (zero), a placa não tem tamanho que resolva: devolve infinito. */
export function necessidadeSolar(consumoMa: number, diasSemSol: number, solKwhM2Dia: number): NecessidadeSolar {
  const litio = PARAMETROS_QUIMICA.lifepo4;
  const whPorDia = (Math.max(0, consumoMa) / 1000) * TENSAO_DO_RADIO_V * 24;
  // O que a placa entrega por dia, por watt de placa: horas de sol pleno, menos as perdas da placa e a da carga da bateria.
  const whPorWattDePlaca = solKwhM2Dia * (1 - PERDAS_PLACA) * litio.rend;
  const placaW = whPorWattDePlaca > 0 ? whPorDia / whPorWattDePlaca : Infinity;
  const bateriaWh = (whPorDia * Math.max(0, diasSemSol)) / (1 - litio.socMin);
  return { whPorDia, placaW, bateriaWh, bateriaMah: (bateriaWh / TENSAO_DO_RADIO_V) * 1000 };
}

/** A faixa de placa e de bateria, do consumo mínimo ao máximo. */
export function dimensionarRepetidorSolar(ajustes: AjustesDoRepetidorSolar): { min: NecessidadeSolar; max: NecessidadeSolar } {
  const a = Math.min(ajustes.consumoMinMa, ajustes.consumoMaxMa);
  const b = Math.max(ajustes.consumoMinMa, ajustes.consumoMaxMa);
  return { min: necessidadeSolar(a, ajustes.diasSemSol, ajustes.solKwhM2Dia), max: necessidadeSolar(b, ajustes.diasSemSol, ajustes.solKwhM2Dia) };
}
