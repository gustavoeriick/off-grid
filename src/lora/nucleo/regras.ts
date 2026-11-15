// Regra da Anatel (Ato 14.448/2017, item 10). Especificação: seção 3.
// Falta conferir o texto vigente (tarefa L0.2): por isso os avisos não bloqueiam.
import {
  DENSIDADE_ESPECTRAL_DBM,
  FAIXA_DA_DENSIDADE_KHZ,
  GANHO_SEM_REDUCAO_DBI,
  POTENCIA_MAXIMA_ANATEL_DBM,
} from './constantes';
import type { Modo, Radio } from './tipos';

/** Frase que termina todo aviso de regra. */
export const FRASE_DA_ANATEL = 'Confira a regra vigente na Anatel. O rádio precisa ser homologado.';

/** Potência máxima, em dBm, para um ganho de antena: 30 dBm, menos o quanto o ganho passa de 6 dBi. */
export function limitePelaAntenaDbm(ganhoDbi: number): number {
  return POTENCIA_MAXIMA_ANATEL_DBM - Math.max(0, ganhoDbi - GANHO_SEM_REDUCAO_DBI);
}

/**
 * Limite estimado pela densidade espectral: `8 + 10·log(banda em kHz / 3)`, sem passar dos 30 dBm de pico.
 * Dá 24,20 dBm em 125 kHz, 27,21 em 250 kHz e 30,00 em 500 kHz (a conta pura dá 30,22 nos 500 kHz;
 * a especificação usa 30,00 porque o limite de pico vale também).
 */
export function limitePelaDensidadeDbm(bandaKHz: number): number {
  const estimado = DENSIDADE_ESPECTRAL_DBM + 10 * Math.log10(bandaKHz / FAIXA_DA_DENSIDADE_KHZ);
  return Math.min(POTENCIA_MAXIMA_ANATEL_DBM, estimado);
}

function numero(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

/** Avisos de regra para um rádio em um modo. Lista vazia quando está tudo dentro do que se conhece. */
export function avisosDaRegra(radio: Radio, modo: Modo): string[] {
  const avisos: string[] = [];

  const limiteAntena = limitePelaAntenaDbm(radio.ganhoDbi);
  if (radio.potenciaDbm > limiteAntena) {
    const motivo =
      radio.ganhoDbi > GANHO_SEM_REDUCAO_DBI
        ? `o limite é ${numero(POTENCIA_MAXIMA_ANATEL_DBM)} dBm e cai o tanto que o ganho da antena (${numero(radio.ganhoDbi)} dBi) passa de ${GANHO_SEM_REDUCAO_DBI} dBi`
        : `o limite é ${numero(POTENCIA_MAXIMA_ANATEL_DBM)} dBm`;
    avisos.push(
      `A potência de ${numero(radio.potenciaDbm)} dBm passa do limite de ${numero(limiteAntena)} dBm para esta antena: ${motivo}. ${FRASE_DA_ANATEL}`,
    );
  }

  const limiteDensidade = limitePelaDensidadeDbm(modo.bandaKHz);
  if (radio.potenciaDbm > limiteDensidade) {
    avisos.push(
      `A potência de ${numero(radio.potenciaDbm)} dBm passa de ${numero(limiteDensidade)} dBm, o limite estimado pela densidade espectral (8 dBm em cada faixa de 3 kHz) na banda de ${modo.bandaKHz} kHz. É uma estimativa que supõe espectro plano. ${FRASE_DA_ANATEL}`,
    );
  }

  return avisos;
}
