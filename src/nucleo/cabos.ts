// Correntes de projeto e queda de tensão nos cabos. Especificação: docs/especificacao/nucleo.md, seção 9. Tarefa 1.6.

import type { Catalogo, TipoCabo } from '../catalogo/tipos';
import type { AnaliseCircuito, Projeto, QuedaDeTensao } from './tipos';

/** Resistência de um trecho de cabo, em ohms. */
export function resistencia(_cabo: TipoCabo, _comprimento: number): number {
  throw new Error('não implementado: resistencia');
}

/** Corrente que cada cabo precisa aguentar, em ampères, por `uid` do cabo. */
export function correntesDeProjeto(_projeto: Projeto, _catalogo: Catalogo, _analise: AnaliseCircuito): Map<string, number> {
  throw new Error('não implementado: correntesDeProjeto');
}

/** Queda de tensão de cada circuito: placas, bateria e cada aparelho. */
export function quedasDeTensao(_projeto: Projeto, _catalogo: Catalogo, _analise: AnaliseCircuito): QuedaDeTensao[] {
  throw new Error('não implementado: quedasDeTensao');
}
