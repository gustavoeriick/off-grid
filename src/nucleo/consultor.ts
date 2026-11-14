// Sugestões sobre a montagem. Especificação: docs/especificacao/consultor.md. Tarefa 1.7.

import type { Catalogo } from '../catalogo/tipos';
import type { AnaliseCircuito, Estimativas, PlanoMaisPlaca, Projeto, Sugestao } from './tipos';

/** Lista de sugestões: erros, depois alertas, depois dicas. */
export function analisarConsultor(
  _projeto: Projeto,
  _catalogo: Catalogo,
  _analise: AnaliseCircuito,
  _estimativas: Estimativas,
): Sugestao[] {
  throw new Error('não implementado: analisarConsultor');
}

/** Como uma placa a mais entra no arranjo: em série, em paralelo, ou nulo se a entrada não aceita. */
export function planejarMaisPlaca(_projeto: Projeto, _catalogo: Catalogo, _analise: AnaliseCircuito): PlanoMaisPlaca | null {
  throw new Error('não implementado: planejarMaisPlaca');
}
