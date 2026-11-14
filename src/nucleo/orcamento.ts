// Orçamento do que está montado. Especificação: docs/especificacao/nucleo.md, seção 11. Tarefa 1.8.

import type { Catalogo } from '../catalogo/tipos';
import type { Orcamento, Projeto } from './tipos';

/** Linhas de equipamentos, cabos, proteções e instalação, com o total. */
export function calcularOrcamento(_projeto: Projeto, _catalogo: Catalogo): Orcamento {
  throw new Error('não implementado: calcularOrcamento');
}
