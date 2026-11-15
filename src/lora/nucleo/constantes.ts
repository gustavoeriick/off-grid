// Constantes do núcleo de rádio. Fontes: docs/especificacao/lora.md, seção 2.
import type { DadosDaRegiao, Modo, Regiao } from './tipos';

/** Raio médio da Terra, em km. Fonte: IUGG. */
export const RAIO_MEDIO_DA_TERRA_KM = 6371.0088;

/** Fator de raio efetivo `k`. Fonte: atmosfera padrão (a ITU-R P.526 sugere 8.500 km de raio efetivo sem outro dado). */
export const FATOR_K = 4 / 3;

/** Raio efetivo da Terra, em km: `k × raio médio` (cerca de 8.494,7 km). */
export const RAIO_EFETIVO_KM = FATOR_K * RAIO_MEDIO_DA_TERRA_KM;

/** Velocidade da luz, em m/s. Fonte: definição do metro. */
export const VELOCIDADE_DA_LUZ_MS = 299_792_458;

/** Fração do raio da primeira zona de Fresnel que precisa estar livre. Fonte: regra clássica de enlace (a P.526 dá 57%). */
export const FRACAO_DE_FRESNEL = 0.6;

/** Potência padrão do rádio, em dBm. Fonte: suposição da tabela de orçamento do Meshtastic. */
export const POTENCIA_PADRAO_DBM = 22;

/** Ganho padrão da antena, em dBi. Fonte: suposição da mesma tabela. */
export const GANHO_PADRAO_DBI = 0;

/** Limite de saltos padrão. Fonte: documentação do Meshtastic, configuração LoRa. */
export const SALTOS_PADRAO = 3;

/** Limite de saltos máximo. Fonte: documentação do Meshtastic, configuração LoRa. */
export const SALTOS_MAXIMO = 7;

/**
 * Folga mínima para o veredito "fecha com folga", em dB. É a margem de desvanecimento escolhida
 * para o projeto: uma escolha, não um dado de norma (seção 4.7).
 */
export const FOLGA_COM_SOBRA_DB = 10;

/** Espaçamento do perfil do terreno, em km (seção 4.2). */
export const ESPACAMENTO_DO_PERFIL_KM = 0.1;
/** Menor número de pontos de um perfil (seção 4.2). */
export const PONTOS_MINIMOS_DO_PERFIL = 20;
/** Maior número de pontos de um perfil (seção 4.2). */
export const PONTOS_MAXIMOS_DO_PERFIL = 1500;

/** Regra da Anatel, Ato 14.448/2017, item 10.3.2: potência de pico máxima, em dBm (1 W). */
export const POTENCIA_MAXIMA_ANATEL_DBM = 30;
/** Regra da Anatel, item 10.5: ganho de antena até o qual a potência não precisa cair, em dBi. */
export const GANHO_SEM_REDUCAO_DBI = 6;
/** Regra da Anatel, item 10.3.3: densidade espectral de pico máxima, em dBm por faixa de 3 kHz. */
export const DENSIDADE_ESPECTRAL_DBM = 8;
/** Largura da faixa de medida da densidade espectral (item 10.3.3), em kHz. */
export const FAIXA_DA_DENSIDADE_KHZ = 3;

/** Regiões do Meshtastic (documentação, configuração LoRa). A frequência de cálculo é o meio da faixa. */
export const REGIOES: Record<Regiao, DadosDaRegiao> = {
  ANZ: {
    id: 'ANZ',
    nome: 'ANZ (padrão da comunidade brasileira)',
    faixaMHz: [915, 928],
    frequenciaMHz: 921.5,
    potenciaMaxDbm: 30,
  },
  BR_902: {
    id: 'BR_902',
    nome: 'BR_902',
    faixaMHz: [902, 907.5],
    frequenciaMHz: 904.75,
    potenciaMaxDbm: 30,
  },
};

/** Sensibilidade derivada: `22 dBm − orçamento` (seção 2). */
function modo(
  id: string,
  nome: string,
  bandaKHz: number,
  fatorDeEspalhamento: number,
  taxaKbps: number,
  orcamentoDb: number,
): Modo {
  return { id, nome, bandaKHz, fatorDeEspalhamento, taxaKbps, orcamentoDb, sensibilidadeDbm: 22 - orcamentoDb };
}

/** Modos do rádio, na ordem da tabela oficial do Meshtastic ("radio settings"). */
export const MODOS: Modo[] = [
  modo('short-turbo', 'Short Turbo', 500, 7, 21.88, 140),
  modo('short-fast', 'Short Fast', 250, 7, 10.94, 143),
  modo('short-slow', 'Short Slow', 250, 8, 6.25, 145.5),
  modo('medium-turbo', 'Medium Turbo', 500, 9, 7.03, 145),
  modo('medium-fast', 'Medium Fast', 250, 9, 3.52, 148),
  modo('medium-slow', 'Medium Slow', 250, 10, 1.95, 150.5),
  modo('long-turbo', 'Long Turbo', 500, 11, 1.34, 150),
  modo('long-fast', 'Long Fast', 250, 11, 1.07, 153),
  modo('long-moderate', 'Long Moderate', 125, 11, 0.34, 156),
];

/** Modo padrão do projeto novo. */
export const MODO_PADRAO = 'long-fast';
