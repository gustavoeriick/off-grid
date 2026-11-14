// Topologia do circuito a partir dos cabos. Especificação: docs/especificacao/nucleo.md, seção 8. Tarefa 1.4.

import type { Catalogo } from '../catalogo/tipos';
import type { AnaliseCircuito, Projeto } from './tipos';

/** Descobre o inversor em uso, as fileiras de placas, o banco de baterias, as cargas e os erros de ligação. */
export function analisarCircuito(_projeto: Projeto, _catalogo: Catalogo): AnaliseCircuito {
  throw new Error('não implementado: analisarCircuito');
}
