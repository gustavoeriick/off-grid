// Irradiação solar. Especificação: docs/especificacao/nucleo.md, seção 2. Tarefa 1.3.

import type { Catalogo } from '../catalogo/tipos';
import type { AmbientePlacas, Clima, CondicaoPlaca, Irradiancia, Local, Projeto, Vec3 } from './tipos';

/** Locais disponíveis. Começa só com o Rio de Janeiro. */
export const LOCAIS: Local[] = [];

export function localPorId(_id: string): Local | undefined {
  throw new Error('não implementado: localPorId');
}

/** Irradiâncias horizontal, direta e difusa, temperatura ambiente e posição do sol em um instante. */
export function irradiancia(_local: Local, _msUtc: number, _clima: Clima): Irradiancia {
  throw new Error('não implementado: irradiancia');
}

/** Irradiância no plano de uma placa, em W/m², descontando sombra e céu tapado. */
export function irradianciaNoPlano(_irr: Irradiancia, _sol: Vec3, _normal: Vec3, _fSombra = 0, _fCeuTapado = 0): number {
  throw new Error('não implementado: irradianciaNoPlano');
}

/** Condição de cada placa do projeto em um instante. */
export function irradianciaNasPlacas(
  _projeto: Projeto,
  _catalogo: Catalogo,
  _local: Local,
  _msUtc: number,
  _ambiente: AmbientePlacas,
): Map<string, CondicaoPlaca> {
  throw new Error('não implementado: irradianciaNasPlacas');
}

/** Ambiente em que todas as placas têm a mesma normal, sem sombra e sem céu tapado. */
export function ambienteSemSombra(_normal: Vec3): AmbientePlacas {
  throw new Error('não implementado: ambienteSemSombra');
}
