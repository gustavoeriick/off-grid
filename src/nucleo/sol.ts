// Posição do sol. Especificação: docs/especificacao/nucleo.md, seção 1. Tarefa 1.3.

import type { PosicaoSol, Vec3 } from './tipos';

/** Azimute e elevação do sol, em graus, pelo algoritmo da NOAA. Latitude negativa no sul, longitude negativa a oeste. */
export function posicaoSol(_msUtc: number, _lat: number, _lon: number): PosicaoSol {
  throw new Error('não implementado: posicaoSol');
}

/** Vetor unitário que aponta da cena para o sol (X leste, Y cima, Z sul). */
export function direcaoSol(_azimute: number, _elevacao: number): Vec3 {
  throw new Error('não implementado: direcaoSol');
}

/** Normal de um plano com a inclinação dada, em graus, voltado para o azimute dado. */
export function normalDoPlano(_inclinacao: number, _azimute: number): Vec3 {
  throw new Error('não implementado: normalDoPlano');
}
