// Ajuda para ligar um item do catálogo ao anúncio da pesquisa.

import { ANUNCIOS, COLETA } from './anuncios';

/**
 * Preço, endereço e data do anúncio com o código dado. Em itens vendidos em rolo ou em circuito,
 * `divisor` é a metragem do anúncio e `fator` o número de condutores (o cabo CA vale por três).
 * A conta é feita em centavos e arredondada para centavos.
 */
export function ref(codigo: string, divisor = 1, fator = 1): { preco: number; url: string; coletadoEm: string } {
  const anuncio = ANUNCIOS[codigo];
  if (!anuncio) throw new Error(`Anúncio ${codigo} fora de anuncios.ts`);
  const centavos = Math.round((Math.round(anuncio.preco * 100) * fator) / divisor);
  return { preco: centavos / 100, url: anuncio.url, coletadoEm: COLETA };
}
