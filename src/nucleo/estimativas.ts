// Estimativas do dia: geração, consumo, autonomia e perda por sombra.
// Especificação: docs/especificacao/nucleo.md, seção 10. Tarefa 1.7.

import type { Catalogo } from '../catalogo/tipos';
import type { AmbientePlacas, AnaliseCircuito, Estimativas, Projeto } from './tipos';

/** Números do dia local de `msUtc` para o projeto. */
export function estimar(
  _projeto: Projeto,
  _catalogo: Catalogo,
  _analise: AnaliseCircuito,
  _ambiente: AmbientePlacas,
  _msUtc: number,
): Estimativas {
  throw new Error('não implementado: estimar');
}
