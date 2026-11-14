// Tipos do catálogo de produtos. Especificação: docs/especificacao/catalogo.md

/** Linha a que o item pertence: 12 V simples, o plano de 24 V do Gustavo, ou 48 V. */
export type Linha = 'simples' | 'plano' | 'avancada';

export type TensaoBateria = 12 | 24 | 48;
export type TensaoRede = 127 | 220;

/** Largura, altura e profundidade, em metros. */
export type Dimensoes = [largura: number, altura: number, profundidade: number];

interface ItemBase {
  id: string;
  /** Nome curto, para a lista do catálogo. */
  nome: string;
  /** Linha com as características principais. */
  detalhe: string;
  linha: Linha;
  /** Preço de referência em reais. Em cabos, por metro. Zero nos aparelhos da casa. */
  preco: number;
  /** Maior preço visto para o mesmo produto na coleta. */
  precoMax?: number;
  /** Endereço do anúncio no Mercado Livre. */
  url?: string;
  /** Data da coleta do preço, no formato AAAA-MM-DD. */
  coletadoEm?: string;
  /** Ressalva sobre o anúncio ou o produto, mostrada ao usuário. */
  obs?: string;
  /** Campos preenchidos com valor típico, por não constarem do anúncio. 'preco' indica preço estimado. */
  tipico?: string[];
  /** Presente quando o consultor desaconselha o item; o texto diz por quê. */
  naoRecomendado?: string;
}

export interface Placa extends ItemBase {
  categoria: 'placa';
  /** Potência nominal, em W. */
  wp: number;
  /** Tensão de circuito aberto, em V. */
  voc: number;
  /** Tensão de máxima potência, em V. */
  vmp: number;
  /** Corrente de curto-circuito, em A. */
  isc: number;
  /** Corrente de máxima potência, em A. */
  imp: number;
  largura: number;
  altura: number;
}

export type Quimica = 'lifepo4' | 'chumbo' | 'automotiva';

export interface Bateria extends ItemBase {
  categoria: 'bateria';
  quimica: Quimica;
  tensao: TensaoBateria;
  ah: number;
  /** Corrente máxima de descarga contínua, em A. */
  descargaMaxA: number;
  /** Corrente máxima de carga, em A. */
  cargaMaxA: number;
  ciclos: number;
  dimensoes: Dimensoes;
}

/** Entrada das placas de um inversor híbrido, de uma estação ou de um controlador. */
export interface EntradaSolar {
  tipo: 'mppt' | 'pwm';
  /** Corrente máxima de carga da bateria pelas placas, em A. */
  correnteCargaA: number;
  /** Faixa de tensão de trabalho, em V. */
  vMin: number;
  vMax: number;
  /** Tensão máxima de circuito aberto das placas, em V. Acima disso a entrada queima. */
  vocMax: number;
  /** Potência máxima de placas, em W. */
  potenciaMaxW: number;
  /** Corrente máxima de entrada das placas, em A. */
  correnteEntradaMaxA?: number;
}

export interface Inversor extends ItemBase {
  categoria: 'inversor';
  onda: 'pura' | 'modificada';
  /** Potência contínua, em W. */
  potenciaW: number;
  /** Potência de pico, em W. */
  picoW: number;
  tensaoBateria: TensaoBateria;
  /** Tensão de saída. Anúncios de 110 ou 120 V entram como 127. */
  saidaV: TensaoRede;
  /** Rendimento entre 0 e 1. */
  rendimento: number;
  /** Consumo do próprio inversor ligado, em W. */
  consumoVazioW: number;
  /** Presente nos inversores híbridos e nas estações portáteis. */
  solar?: EntradaSolar;
  /** Corrente máxima do carregador pela rede, em A. */
  carregadorRedeA?: number;
  /** Presente nas estações portáteis: capacidade da bateria interna, em Wh. */
  bateriaInternaWh?: number;
  montagem: 'parede' | 'piso';
  dimensoes: Dimensoes;
}

export interface Controlador extends ItemBase {
  categoria: 'controlador';
  solar: EntradaSolar;
  tensoesBateria: TensaoBateria[];
  dimensoes: Dimensoes;
}

export type TipoProtecao = 'fusivel' | 'disjuntorCC' | 'dps' | 'disjuntorCA';

export interface Protecao extends ItemBase {
  categoria: 'protecao';
  tipo: TipoProtecao;
  /** Corrente nominal, em A. Zero no DPS. */
  correnteA: number;
  tensaoMaxV: number;
}

export type UsoCabo = 'solar' | 'bateria' | 'ca';

export interface TipoCabo extends ItemBase {
  categoria: 'cabo';
  uso: UsoCabo;
  /** Seção do condutor, em mm². */
  secao: number;
  /** Corrente que o cabo aguenta, em A. */
  ampacidade: number;
  /** Falso para alucobre. */
  cobre: boolean;
}

/** Horário de uso em um dia, em horas locais de 0 a 24. Se `fim` é menor que `inicio`, o uso atravessa a meia-noite. De 0 a 24 é o dia inteiro. */
export interface Uso {
  inicio: number;
  fim: number;
}

export type FormaAparelho =
  | 'geladeira' | 'ventilador' | 'tv' | 'pc' | 'notebook'
  | 'roteador' | 'microondas' | 'lampada' | 'chuveiro' | 'caixa';

export interface Aparelho extends ItemBase {
  categoria: 'aparelho';
  /** Potência com o aparelho funcionando, em W. */
  potenciaW: number;
  /** Potência média ao longo do tempo ligado, em W. */
  mediaW: number;
  /** Pico de partida, em W. */
  picoW: number;
  /** Horário de uso típico. O usuário pode trocar em cada aparelho da casa. */
  usoPadrao: Uso;
  tensao: TensaoRede | 'bivolt';
  motor: boolean;
  eletronico: boolean;
  forma: FormaAparelho;
  dimensoes: Dimensoes;
}

/** Tomada da rede elétrica da casa. */
export interface Rede extends ItemBase {
  categoria: 'rede';
}

export type TipoAcessorio = 'estrutura' | 'conector' | 'aterramento' | 'medicao' | 'kit';

export interface Acessorio extends ItemBase {
  categoria: 'acessorio';
  tipo: TipoAcessorio;
}

export type Item = Placa | Bateria | Inversor | Controlador | Protecao | TipoCabo | Aparelho | Rede | Acessorio;
export type Categoria = Item['categoria'];
export type Catalogo = ReadonlyMap<string, Item>;
