// Contrato do simulador de rádio LoRa. Especificação: docs/especificacao/lora.md.
// Mudança neste arquivo passa pelo coordenador.
// Unidades: distâncias em km, alturas e altitudes em m, frequência em MHz, potência em dBm, ganhos e perdas em dB.

export interface Coordenada {
  /** Graus, positivo ao norte. */
  lat: number;
  /** Graus, positivo a leste. */
  lon: number;
}

export type Regiao = 'ANZ' | 'BR_902';

export interface DadosDaRegiao {
  id: Regiao;
  nome: string;
  faixaMHz: [min: number, max: number];
  /** Meio da faixa: a frequência usada nas contas. */
  frequenciaMHz: number;
  /** Potência máxima que o firmware aceita na região. */
  potenciaMaxDbm: number;
}

/** Modo do rádio (preset do Meshtastic). */
export interface Modo {
  id: string;
  nome: string;
  bandaKHz: number;
  fatorDeEspalhamento: number;
  taxaKbps: number;
  /** Orçamento de enlace da tabela do Meshtastic, com 22 dBm e 0 dBi. */
  orcamentoDb: number;
  /** `22 − orcamentoDb`. */
  sensibilidadeDbm: number;
}

/** Ponto do corte do terreno. O primeiro e o último são o terreno embaixo das antenas. */
export interface PontoDoPerfil {
  /** Distância desde o começo do enlace. */
  dKm: number;
  /** Altitude do terreno acima do nível do mar. */
  altM: number;
}

export type Perfil = PontoDoPerfil[];

/** Um rádio em uma ponta do enlace. */
export interface Radio {
  alturaDaAntenaM: number;
  potenciaDbm: number;
  ganhoDbi: number;
  perdaNoCaboDb: number;
}

export interface PontoLora extends Coordenada, Radio {
  id: string;
  nome: string;
  tipo: 'casa' | 'repetidor';
}

export interface ProjetoLora {
  versao: 1;
  nome: string;
  regiao: Regiao;
  /** `id` de um modo de `MODOS`. */
  modo: string;
  /** De 0 a 40: o que o relevo não mostra (prédios, árvores, paredes). */
  margemDoAmbienteDb: number;
  /** De 1 a 7. */
  limiteDeSaltos: number;
  pontos: PontoLora[];
  /** Pares de pontos ligados. */
  enlaces: { de: string; para: string }[];
  /** Ajustes da conta de placa e bateria do repetidor solar. Sem o campo, valem os padrões de `solar.ts`. */
  repetidorSolar?: { consumoMinMa: number; consumoMaxMa: number; diasSemSol: number; solKwhM2Dia: number };
}

/** Geometria de um ponto do corte: o que o gráfico desenha. */
export interface PontoDaGeometria extends PontoDoPerfil {
  /** Quanto a curva da Terra "levanta" o terreno neste ponto. */
  curvaM: number;
  /** Altitude da linha reta entre as antenas neste ponto. */
  linhaM: number;
  /** `linhaM − (altM + curvaM)`; negativo quando o terreno corta a linha. */
  folgaM: number;
  /** Raio da primeira zona de Fresnel neste ponto. */
  raioDeFresnelM: number;
}

export interface Geometria {
  pontos: PontoDaGeometria[];
  distanciaKm: number;
  /** Altitude das duas antenas: terreno mais a altura da antena. */
  antenaInicioM: number;
  antenaFimM: number;
  /** Verdadeiro quando a folga é de pelo menos 60% do raio de Fresnel em todos os pontos do meio. */
  zonaLivre: boolean;
  /** Ponto do meio de menor `folgaM − 0,6·raioDeFresnelM`; nulo em perfil sem pontos do meio. */
  piorPonto: PontoDaGeometria | null;
}

export interface Difracao {
  /** Verdadeiro quando há linha reta livre entre as antenas (caso 1 de Bullington). */
  visada: boolean;
  /** Perda do obstáculo equivalente. */
  lucDb: number;
  /** Perda por difração do caminho, pelo método completo (especificação, seção 4.5.1). */
  perdaDb: number;
  /** Parcela de `perdaDb` que vem do caminho liso (mar, baía, planície): `máx(Lsph − Lbs; 0)`. Zero na parte de Bullington sozinha. */
  terraLisaDb: number;
}

export type Veredito = 'folga' | 'limite' | 'nao-fecha';

export interface ContaDoEnlace {
  frequenciaMHz: number;
  distanciaKm: number;
  /** Do transmissor. */
  potenciaDbm: number;
  ganhoTxDbi: number;
  caboTxDb: number;
  arLivreDb: number;
  difracaoDb: number;
  margemDoAmbienteDb: number;
  ganhoRxDbi: number;
  caboRxDb: number;
  /** O que chega ao receptor. */
  recebidoDbm: number;
  sensibilidadeDbm: number;
  /** `recebidoDbm − sensibilidadeDbm`. */
  folgaDb: number;
}

export interface ResultadoDoEnlace {
  geometria: Geometria;
  difracao: Difracao;
  /** A conta no sentido de menor folga. */
  conta: ContaDoEnlace;
  veredito: Veredito;
  /** Uma ou duas frases com o motivo, prontas para a tela. */
  texto: string;
}

/** Uma mudança que poderia fechar o enlace, e o que ela dá. */
export interface Melhoria {
  /** Texto pronto: "Subir a antena de Minha casa para 10 m". */
  rotulo: string;
  folgaDb: number;
  veredito: Veredito;
  /** Aviso de regra da Anatel que a mudança dispara, se dispara. */
  aviso?: string;
}

/** O que o cálculo de um enlace precisa saber além dos dois rádios e do perfil. */
export interface Ambiente {
  frequenciaMHz: number;
  modo: Modo;
  margemDoAmbienteDb: number;
}

/** Quem dá a altitude do terreno. A camada de dados implementa; os testes usam uma função feita à mão. */
export type AltitudeEm = (ponto: Coordenada) => number;
