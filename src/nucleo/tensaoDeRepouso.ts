// Tensão de repouso aproximada de uma bateria, a partir da carga. Especificação: docs/especificacao/operar.md, seção 7.1.
// Pedido do Gustavo em 16/11/2026: o visor da bateria mostra a carga em % e também os volts.
// Os números vêm de tabelas de fabricante, que NÃO são as marcas do catálogo (Moura e Freedom só publicam gráfico):
// - chumbo (estacionária, selada e automotiva): Trojan Battery, "User's Guide" (2018), Table 7, bateria ventilada de 12 V,
//   tensão de circuito aberto depois de pelo menos 6 horas parada;
// - lítio (LiFePO4): LiTime, manual da bateria de 12 V 50 Ah, seção 4.6, tensão de circuito aberto depois de 3 horas ou
//   mais parada. A tabela vem em faixas; aqui vale o meio de cada faixa.
// Entre dois pontos da tabela a conta é uma reta (escolha do simulador). Abaixo do último ponto útil não há extrapolação.

import type { Quimica } from '../catalogo/tipos';

/** [carga de 0 a 1, volts de uma bateria de 12 V], da maior carga para a menor. */
type Tabela = readonly (readonly [number, number])[];

/** Trojan, Table 7, coluna de 12 V. A tabela não tem a linha de 0 %. */
const CHUMBO_12V: Tabela = [
  [1.0, 12.73],
  [0.9, 12.62],
  [0.8, 12.5],
  [0.7, 12.37],
  [0.6, 12.24],
  [0.5, 12.1],
  [0.4, 11.96],
  [0.3, 11.81],
  [0.2, 11.66],
  [0.1, 11.51],
];

/**
 * LiTime, seção 4.6: 13,33 V ≈ 100 %; 13,2 a 13,3 V ≈ 75 %; 13,1 a 13,2 V ≈ 50 %; 13,0 a 13,1 V ≈ 25 %.
 * A linha de 0 % da tabela é uma faixa de 10 a 12 V: larga demais para virar um número, fica de fora.
 */
const LITIO_12V: Tabela = [
  [1.0, 13.33],
  [0.75, 13.25],
  [0.5, 13.15],
  [0.25, 13.05],
];

const TABELAS: Record<Quimica, Tabela> = { chumbo: CHUMBO_12V, automotiva: CHUMBO_12V, lifepo4: LITIO_12V };

export interface TensaoDeRepouso {
  /** Volts aproximados da bateria parada. */
  volts: number;
  /** Verdadeiro quando a carga está abaixo do último ponto da tabela: a tensão real é menor que `volts`. */
  abaixoDaTabela: boolean;
}

/**
 * Tensão de repouso aproximada para a carga `soc` (0 a 1) de uma bateria de tensão nominal `tensaoNominal` (12, 24 ou 48 V).
 * A tabela é de 12 V; as outras tensões são a mesma tabela multiplicada (24 V = 2 de 12 V em série).
 */
export function tensaoDeRepouso(quimica: Quimica, soc: number, tensaoNominal: number): TensaoDeRepouso {
  const tabela = TABELAS[quimica];
  const fator = tensaoNominal / 12;
  const s = Math.min(1, Math.max(0, soc));
  const ultimo = tabela[tabela.length - 1]!;
  if (s < ultimo[0]) return { volts: ultimo[1] * fator, abaixoDaTabela: true };
  for (let i = 0; i < tabela.length - 1; i++) {
    const [s1, v1] = tabela[i]!;
    const [s0, v0] = tabela[i + 1]!;
    if (s <= s1 && s >= s0) return { volts: (v0 + ((v1 - v0) * (s - s0)) / (s1 - s0)) * fator, abaixoDaTabela: false };
  }
  return { volts: tabela[0]![1] * fator, abaixoDaTabela: false };
}
