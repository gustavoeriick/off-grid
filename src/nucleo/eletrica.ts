// Placas, entrada solar, banco de baterias e passo de simulação.
// Especificação: docs/especificacao/nucleo.md, seções 3 a 7. Tarefa 1.5.

import type { Catalogo, EntradaSolar, Placa } from '../catalogo/tipos';
import type { AnaliseCircuito, EntradaPasso, EstadoPlaca, EstadoSim, InfoBanco, Projeto, SaidaArranjo, SaidaPasso, Sistema } from './tipos';

/** Potência, tensão e corrente de uma placa para a irradiância e a temperatura ambiente dadas. */
export function estadoPlaca(_placa: Placa, _g: number, _tAmb: number): EstadoPlaca {
  throw new Error('não implementado: estadoPlaca');
}

/** Tensão de circuito aberto de `n` placas em série com a célula a 10 °C. */
export function vocFrio(_placa: Placa, _n = 1): number {
  throw new Error('não implementado: vocFrio');
}

/** Tensão de trabalho de `n` placas em série com a célula a 70 °C. */
export function vmpQuente(_placa: Placa, _n = 1): number {
  throw new Error('não implementado: vmpQuente');
}

/** Potência que o arranjo entrega ao barramento da bateria pela entrada solar dada. */
export function saidaArranjo(_fileiras: EstadoPlaca[][], _solar: EntradaSolar, _tensaoCarga: number): SaidaArranjo {
  throw new Error('não implementado: saidaArranjo');
}

/** Dados do banco de baterias do sistema. Nulo se não houver banco. */
export function infoBanco(_sistema: Sistema, _projeto: Projeto, _catalogo: Catalogo): InfoBanco | null {
  throw new Error('não implementado: infoBanco');
}

/** Bateria cheia, inversor ligado. */
export function estadoInicial(): EstadoSim {
  return { soc: 1, cortado: false, emRede: false };
}

/** Avança a simulação em `entrada.dtHoras`. */
export function passoSimulacao(
  _projeto: Projeto,
  _catalogo: Catalogo,
  _analise: AnaliseCircuito,
  _estado: EstadoSim,
  _entrada: EntradaPasso,
): SaidaPasso {
  throw new Error('não implementado: passoSimulacao');
}
