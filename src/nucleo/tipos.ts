// Tipos do projeto e dos resultados do núcleo. Especificação: docs/especificacao.md
// Este arquivo é contrato: mudanças passam pelo coordenador.

import type { Categoria, EntradaSolar, Quimica, TensaoRede } from '../catalogo/tipos';

/** Eixos da cena: X = leste, Y = cima, Z = sul. */
export type Vec3 = [x: number, y: number, z: number];
export type Quat = [x: number, y: number, z: number, w: number];

// ---------------------------------------------------------------- Projeto

export type LadoCasa = 'frente' | 'fundos' | 'esquerda' | 'direita';

export interface CasaConfig {
  /** Medida da frente, em metros. */
  largura: number;
  profundidade: number;
  andares: 1 | 2;
  peDireito: number;
  /** Inclinação do telhado principal, em porcento. */
  inclinacaoTelhadoPct: number;
  beiral: number;
  varanda: { lado: LadoCasa; profundidade: number; inclinacaoPct: number } | null;
  /** Posição do centro do quartinho, em coordenadas da casa, e as medidas dele. */
  quartinho: { x: number; z: number; largura: number; profundidade: number; altura: number; giro: number };
  /** Azimute para onde a frente da casa aponta: 0 norte, 90 leste. */
  orientacaoGraus: number;
}

export interface Dispositivo {
  uid: string;
  /** `id` do item no catálogo. */
  itemId: string;
  /** Centro da peça, em coordenadas da casa. */
  pos: Vec3;
  quat: Quat;
  /** `id` da superfície em que a peça está encaixada. */
  superficie: string | null;
  /** Giro em torno da normal da superfície: 0, 90, 180 ou 270. */
  giro: number;
  /** Aparelhos: ligado ou desligado. Nas demais peças, sempre verdadeiro. */
  ligado: boolean;
}

export interface PontaCabo {
  disp: string;
  terminal: string;
}

export interface Cabo {
  uid: string;
  de: PontaCabo;
  para: PontaCabo;
  /** `id` do tipo de cabo no catálogo. */
  caboId: string;
  /** Comprimento em metros, calculado pela cena. */
  comprimento: number;
  /** `id` das proteções instaladas neste cabo. */
  protecoes: string[];
}

export type Clima = 'tipico' | 'limpo' | 'nublado' | 'chuvoso';

/** `rede`: os aparelhos usam a rede e a bateria fica de reserva. `solar`: usam placas e bateria, e a rede entra quando a bateria baixa. */
export type Prioridade = 'rede' | 'solar';

export interface Projeto {
  versao: 1;
  nome: string;
  casa: CasaConfig;
  /** `id` de um item de `LOCAIS`. */
  localId: string;
  clima: Clima;
  tensaoRede: TensaoRede;
  prioridade: Prioridade;
  dispositivos: Dispositivo[];
  cabos: Cabo[];
}

// ---------------------------------------------------------------- Terminais

export type TipoTerminal = 'cc+' | 'cc-' | 'ca';

export interface DefTerminal {
  id: string;
  tipo: TipoTerminal;
  /** Texto curto mostrado na cena: PV+, BAT−, Tomada. */
  rotulo: string;
}

// ---------------------------------------------------------------- Sol e irradiação

export interface PosicaoSol {
  /** Graus a partir do norte, no sentido horário. */
  azimute: number;
  /** Graus acima do horizonte; negativo à noite. */
  elevacao: number;
}

export interface Local {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  /** Horas em relação a UTC: −3 no Rio. */
  fuso: number;
  /** Irradiação global horizontal média de cada mês, em kWh/m²/dia. */
  ghiMensal: number[];
  /** Temperatura média de cada mês, em °C. */
  tempMensal: number[];
}

export interface Irradiancia {
  /** Global horizontal, em W/m². */
  ghi: number;
  /** Direta normal, em W/m². */
  dni: number;
  /** Difusa horizontal, em W/m². */
  dhi: number;
  tAmb: number;
  azimute: number;
  elevacao: number;
}

/** O que a cena informa ao núcleo sobre cada placa. */
export interface AmbientePlacas {
  /** Normal da face da placa, em coordenadas do mundo. */
  normal(uid: string): Vec3;
  /** Fração da placa, de 0 a 1, sem sol direto para esta direção do sol. */
  sombra(uid: string, direcaoSol: Vec3): number;
  /** Fração do céu difuso, de 0 a 1, tapada por obstáculos. */
  ceuTapado(uid: string): number;
}

/** Irradiância no plano de uma placa e temperatura ambiente, em um instante. */
export interface CondicaoPlaca {
  g: number;
  tAmb: number;
}

// ---------------------------------------------------------------- Elétrica

export interface EstadoPlaca {
  /** Potência, em W. */
  p: number;
  v: number;
  i: number;
  /** Temperatura da célula, em °C. */
  tCel: number;
}

export type AvisoPasso =
  | 'sem-bateria'
  | 'placas-tensao-baixa'
  | 'placas-tensao-alta'
  | 'placas-limitadas'
  | 'sobrecarga'
  | 'bms'
  | 'bateria-vazia';

export interface SaidaArranjo {
  /** Potência entregue ao barramento da bateria, em W. */
  p: number;
  /** Tensão de trabalho do arranjo, em V. */
  v: number;
  /** Corrente do arranjo, em A. */
  i: number;
  avisos: AvisoPasso[];
}

export interface InfoBanco {
  /** Tensão nominal: 12, 24 ou 48. */
  tensao: number;
  /** Tensão usada nas contas de energia e corrente. */
  tensaoRef: number;
  tensaoCarga: number;
  ah: number;
  wh: number;
  whUtil: number;
  /** Carga mínima, de 0 a 1, abaixo da qual o inversor corta. */
  socMin: number;
  descargaMaxA: number;
  cargaMaxA: number;
  rendCarga: number;
  rendDescarga: number;
  quimica: Quimica;
  /** Número de ramos em paralelo. */
  ramos: number;
}

export interface EstadoSim {
  /** Carga da bateria, de 0 a 1 da capacidade nominal. */
  soc: number;
  /** Inversor desligado por bateria vazia. */
  cortado: boolean;
  /** No modo "solar primeiro": inversor usando a rede até a bateria recuperar. */
  emRede: boolean;
}

export interface EntradaPasso {
  dtHoras: number;
  /** Falso durante a queda de luz. */
  redeDisponivel: boolean;
  placas: ReadonlyMap<string, CondicaoPlaca>;
}

export type OrigemEnergia = 'rede' | 'bateria' | 'solar' | 'nenhuma';

export interface SaidaPasso {
  /** Potência das placas aproveitada, em W. */
  pvW: number;
  pvTensao: number;
  /** Soma da potência média das cargas ligadas, em W. */
  cargaPedidaW: number;
  cargaAtendidaW: number;
  /** Positivo quando carrega, negativo quando descarrega. */
  bateriaW: number;
  redeW: number;
  origem: OrigemEnergia;
  estado: EstadoSim;
  avisos: AvisoPasso[];
}

// ---------------------------------------------------------------- Circuito

export type CodigoProblema =
  | 'sem-inversor' | 'varios-inversores'
  | 'sem-bateria' | 'curto-bateria' | 'bateria-invertida' | 'bateria-solta' | 'ramos-desiguais' | 'baterias-misturadas'
  | 'curto-placas' | 'placa-invertida' | 'placa-solta' | 'fileiras-desiguais' | 'placas-misturadas'
  | 'saida-na-rede';

export interface ProblemaCircuito {
  codigo: CodigoProblema;
  dispositivos: string[];
  cabos: string[];
}

export interface Sistema {
  /** `uid` do inversor em uso. */
  inversor: string;
  /** `uid` do controlador externo em uso, se a entrada solar é a dele. */
  controlador: string | null;
  entradaSolar: EntradaSolar | null;
  /** Placas em série, do positivo para o negativo. Cada fileira é um ramo em paralelo. */
  fileiras: string[][];
  /** Baterias em série, do positivo para o negativo. Cada lista é um ramo em paralelo. Vazio em estação portátil. */
  banco: string[][];
  /** Aparelhos ligados na saída do inversor. */
  cargas: string[];
  /** Entrada CA do inversor ligada em uma tomada da rede. */
  redeLigada: boolean;
}

export interface AnaliseCircuito {
  sistema: Sistema | null;
  problemas: ProblemaCircuito[];
  /** Aparelhos ligados direto em uma tomada da rede. */
  naRede: string[];
}

// ---------------------------------------------------------------- Cabos

export type Circuito = 'bateria' | 'placas' | 'saida' | 'entrada';

export interface QuedaDeTensao {
  circuito: Circuito;
  /** Em `saida`, o `uid` do aparelho; nos demais, nulo. */
  alvo: string | null;
  volts: number;
  /** De 0 a 1. */
  fracao: number;
  /** Limite recomendado, de 0 a 1. */
  limite: number;
  cabos: string[];
}

// ---------------------------------------------------------------- Estimativas, consultor e orçamento

export interface Estimativas {
  /** O que as placas conseguem entregar no dia, em kWh. */
  geracaoDiaKwh: number;
  /** O que bateria e placas precisam entregar em um dia de uso normal, em kWh. */
  consumoDiaKwh: number;
  /** Nulo sem banco ou sem carga ligada. */
  autonomiaHoras: number | null;
  /** Fração da geração do dia perdida para a sombra, por placa. */
  perdaSombra: ReadonlyMap<string, number>;
}

export type Nivel = 'erro' | 'alerta' | 'dica';

export type Acao =
  | { tipo: 'proteger-cabos'; rotulo: string; cabos: string[]; protecaoId: string }
  | { tipo: 'trocar-cabos'; rotulo: string; cabos: string[]; caboId: string }
  | { tipo: 'mais-placa'; rotulo: string }
  | { tipo: 'mais-bateria'; rotulo: string }
  | { tipo: 'desligar'; rotulo: string; dispositivo: string }
  | { tipo: 'ver-catalogo'; rotulo: string; categoria: Categoria };

export interface Sugestao {
  /** Identificador da regra, como em docs/especificacao/consultor.md. */
  regra: string;
  nivel: Nivel;
  titulo: string;
  texto: string;
  /** `uid` dos dispositivos e cabos envolvidos. */
  alvos: string[];
  acao?: Acao;
}

export interface PlanoMaisPlaca {
  modo: 'serie' | 'paralelo';
}

export type GrupoOrcamento = 'equipamentos' | 'cabos' | 'protecoes' | 'instalacao';

export interface LinhaOrcamento {
  grupo: GrupoOrcamento;
  itemId: string;
  descricao: string;
  quantidade: number;
  unidade: 'un' | 'm';
  unitario: number;
  total: number;
  url?: string;
  /** Verdadeiro quando o preço é valor típico, não de anúncio. */
  tipico: boolean;
}

export interface Orcamento {
  linhas: LinhaOrcamento[];
  total: number;
  /** Parte do total que vem de valores típicos. */
  totalTipico: number;
}
