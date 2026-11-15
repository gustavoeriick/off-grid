// Trajeto de um cabo pelas superfícies, para "Arrumar os cabos". Especificação: docs/especificacao/cena-e-interface.md, seção 8.
//
// Conta pura, sem Three.js: recebe o mundo já medido (faces retas de parede e piso, caixas das peças, triângulos do que
// é inclinado) e devolve por onde o cabo passa e onde ficam os grampos. Quem mede a cena é `arrumar.ts`.
//
// O mundo é cortado em uma grade irregular: as linhas passam rente a cada face de apoio, pelas bordas delas, em volta
// das peças, pelos terminais e ao lado dos cabos já arrumados. O cabo anda de nó em nó dessa grade, sempre encostado
// em uma face de apoio, e o caminho mais barato (Dijkstra) é o trajeto. O preço de cada passo é o comprimento, com
// acréscimo por dobra, por andar no piso ou no teto, por correr dentro de uma quina e por passar por cima de outro cabo.

export type P3 = [number, number, number];

/** Retângulo alinhado aos eixos: `min` e `max` são iguais no eixo da normal. */
export interface FaceDoMundo {
  /** Eixo da normal (0 = X, 1 = Y, 2 = Z) e o lado para onde ela aponta. */
  eixo: 0 | 1 | 2;
  sinal: 1 | -1;
  min: P3;
  max: P3;
  /** O cabo pode correr sobre a face. Falso: ela só impede a passagem. */
  apoio: boolean;
  /** `id` da superfície de encaixe a que a face pertence, para os grampos. */
  superficie?: string;
}

export interface CaixaDoMundo {
  min: P3;
  max: P3;
}

export type TrianguloDoMundo = [P3, P3, P3];

export interface Mundo {
  faces: readonly FaceDoMundo[];
  /** Peças: o cabo não passa por dentro nem encostado. */
  caixas: readonly CaixaDoMundo[];
  /** O que não é reto (telhados, folhas de porta abertas): só impede a passagem. */
  triangulos: readonly TrianguloDoMundo[];
  /**
   * Planos das águas de telhado (também estão em `triangulos`). Debaixo de cada um há ripas e caibros:
   * o cabo não fica a menos de `ESPESSURA_DO_TELHADO` abaixo do plano.
   */
  telhados?: readonly TrianguloDoMundo[];
}

export interface GrampoDoTrajeto {
  /** Ponto da superfície em que o grampo encosta. */
  pos: P3;
  normal: P3;
  superficie: string | null;
}

/** Caminho já pronto de uma ponta fora da grade (placa no telhado): os grampos a partir do terminal e o ponto de onde o vão parte. */
export interface OpcaoLivre {
  grampos: GrampoDoTrajeto[];
  partida: P3;
  custo: number;
  /** Comprimento máximo do vão que parte daqui. O padrão é 3,5 m. */
  alcance?: number;
  /** O vão só vale a céu aberto (o cabo não entra pela porta para atravessar o cômodo no ar). */
  aCeuAberto?: boolean;
}

export type PontaDoTrajeto =
  | { tipo: 'terminal'; pos: P3; saida: P3 }
  | { tipo: 'livre'; opcoes: OpcaoLivre[] };

/** Trecho reto de um cabo já arrumado, com a largura que ele ocupa na superfície. */
export interface TrechoOcupado {
  a: P3;
  b: P3;
  largura: number;
  /** O trecho é do outro cabo do mesmo par (positivo e negativo): correr na faixa vizinha dele sai mais barato. */
  par?: boolean;
}

export interface OpcoesDoTrajeto {
  /** Largura que este cabo ocupa na superfície (a do grampo dele). */
  largura: number;
  ocupados: readonly TrechoOcupado[];
  /** Altura mínima, no eixo Y, de um vão entre duas construções. */
  alturaMinimaDoVao?: number;
}

export interface Trajeto {
  /** Grampos na ordem de `de` para `para`. */
  grampos: GrampoDoTrajeto[];
  /** Vértices da linha do centro do cabo, do primeiro grampo da grade ao último. */
  pontos: P3[];
  /** Trechos retos sobre as superfícies, para os próximos cabos correrem ao lado. */
  trechos: { a: P3; b: P3 }[];
  custo: number;
}

/** Distância do centro do cabo à superfície, no traçado. O desenho encosta o cabo de verdade. */
export const FOLGA_DO_TRAJETO = 0.01;
/** Distância máxima entre dois grampos de um trecho reto. */
export const VAO_ENTRE_GRAMPOS = 1.5;
/** Espaço livre entre dois cabos vizinhos, além da largura dos grampos. */
export const ESPACO_ENTRE_CABOS = 0.005;

const D = FOLGA_DO_TRAJETO;
/** Linha de passagem perto de cada borda das faces de apoio, para o cabo correr rente à quina sem ficar dentro dela. */
const MARGEM_DA_BORDA = 0.04;
/** Nas faces pequenas (a soleira de uma porta), outra linha mais para dentro, livre do marco. */
const MARGEM_LARGA = 0.08;
const FACE_PEQUENA = 1;
/** Folga em volta das peças. */
const MARGEM_DA_PECA = 0.015;
/** Meia espessura de uma face que impede a passagem. */
const MEIA_FACE = 0.001;
/** Altura do madeiramento debaixo do plano de uma água de telhado, medida na vertical, com folga. */
export const ESPESSURA_DO_TELHADO = 0.14;
/** Recuo do grampo em relação à quina entre duas faces. */
const RECUO_DA_QUINA = 0.04;
/** Passo sem apoio que se aceita entre duas faces quase no mesmo plano (o piso que acaba a milímetros da parede). */
const SALTO = 0.012;
/** O primeiro grampo fica perto deste ponto: o terminal mais esta distância na direção de saída. */
const SAIDA_DO_TERMINAL = 0.1;
const RAIO_DO_TERMINAL = 0.45;
const RAIO_LIVRE = 3.5;
const MAXIMO_DO_VAO = 9;

// Preços, em metros de cabo.
const PESO_DA_CLASSE = [0, 1, 2, 2];
const PESO_DO_SALTO = 2;
const PESO_NA_QUINA = 4;
const PRECO_DA_DOBRA = 0.15;
const PRECO_DE_CRUZAR = 0.2;
const PESO_SOBRE_OUTRO = 30;
const PRECO_DO_VAO = 1.2;
const PESO_DO_VAO = 2.5;
const PESO_DA_PONTA = 2.5;
/** Desconto de quem corre na faixa vizinha do outro cabo do par. */
const PESO_JUNTO_DO_PAR = 0.8;

const CLASSE_PAREDE = 1;
const CLASSE_PISO = 2;
const CLASSE_TETO = 3;

// ---------------------------------------------------------------- Contas pequenas

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Valores em ordem, sem repetição: os que ficam a menos de 1,5 mm do anterior saem. */
function ordenar(valores: number[]): Float64Array {
  valores.sort((a, b) => a - b);
  const lista: number[] = [];
  for (const v of valores) if (lista.length === 0 || v - lista[lista.length - 1]! > 0.0015) lista.push(v);
  return Float64Array.from(lista);
}

/** Primeiro índice com valor maior ou igual a `v`. */
function primeiroDesde(c: Float64Array, v: number): number {
  let a = 0;
  let b = c.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (c[m]! < v) a = m + 1;
    else b = m;
  }
  return a;
}

/** Índice do valor mais próximo de `v`. */
function maisPerto(c: Float64Array, v: number): number {
  const i = primeiroDesde(c, v);
  if (i <= 0) return 0;
  if (i >= c.length) return c.length - 1;
  return v - c[i - 1]! <= c[i]! - v ? i - 1 : i;
}

/** O segmento de `a` a `b` toca a caixa. */
function segmentoNaCaixa(a: readonly number[], b: readonly number[], min: readonly number[], max: readonly number[]): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let e = 0; e < 3; e++) {
    const d = b[e]! - a[e]!;
    if (Math.abs(d) < 1e-12) {
      if (a[e]! < min[e]! || a[e]! > max[e]!) return false;
      continue;
    }
    let u0 = (min[e]! - a[e]!) / d;
    let u1 = (max[e]! - a[e]!) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    if (u0 > t0) t0 = u0;
    if (u1 < t1) t1 = u1;
    if (t0 > t1) return false;
  }
  return true;
}

/** O segmento de `a` a `b` atravessa o triângulo. */
function segmentoNoTriangulo(a: readonly number[], b: readonly number[], t: TrianguloDoMundo): boolean {
  const [p0, p1, p2] = t;
  const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
  const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const tx = a[0]! - p0[0], ty = a[1]! - p0[1], tz = a[2]! - p0[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return s >= 0 && s <= 1;
}

/** Largura que o grampo de um cabo ocupa, a partir do raio do desenho dele. */
export function larguraDoGrampo(raioDoCabo: number, larguraDaPeca = 0.03, raioQueCabe = 0.0075): number {
  return larguraDaPeca * Math.max(1, raioDoCabo / raioQueCabe);
}

// ---------------------------------------------------------------- Fila de prioridade

class Fila {
  private custos = new Float64Array(1024);
  private itens = new Int32Array(1024);
  tamanho = 0;

  por(custo: number, item: number): void {
    if (this.tamanho === this.custos.length) {
      const c = new Float64Array(this.tamanho * 2);
      c.set(this.custos);
      this.custos = c;
      const i = new Int32Array(this.tamanho * 2);
      i.set(this.itens);
      this.itens = i;
    }
    let n = this.tamanho++;
    while (n > 0) {
      const pai = (n - 1) >> 1;
      if (this.custos[pai]! <= custo) break;
      this.custos[n] = this.custos[pai]!;
      this.itens[n] = this.itens[pai]!;
      n = pai;
    }
    this.custos[n] = custo;
    this.itens[n] = item;
  }

  /** Tira o item mais barato. Devolve o custo; o item fica em `ultimo`. */
  ultimo = 0;
  tirar(): number {
    const custo = this.custos[0]!;
    this.ultimo = this.itens[0]!;
    const n = --this.tamanho;
    if (n > 0) {
      const c = this.custos[n]!;
      const item = this.itens[n]!;
      let i = 0;
      for (;;) {
        let f = 2 * i + 1;
        if (f >= n) break;
        if (f + 1 < n && this.custos[f + 1]! < this.custos[f]!) f++;
        if (this.custos[f]! >= c) break;
        this.custos[i] = this.custos[f]!;
        this.itens[i] = this.itens[f]!;
        i = f;
      }
      this.custos[i] = c;
      this.itens[i] = item;
    }
    return custo;
  }
}

// ---------------------------------------------------------------- Grade

interface Bloqueio {
  min: P3;
  max: P3;
}

interface Grade {
  c: [Float64Array, Float64Array, Float64Array];
  n: [number, number, number];
  passo: [number, number, number];
  /** Por célula: de que lados há face de apoio (um bit por orientação: eixo × 2, mais 1 se a normal é negativa). */
  apoio: Uint8Array;
  /** Por célula e eixo: classe do apoio do passo até a célula seguinte nesse eixo (0 = sem apoio). */
  aresta: [Uint8Array, Uint8Array, Uint8Array];
  /**
   * Por célula e eixo, para a conta de `aresta`: de que lados o passo tem face de apoio. São quatro faces possíveis
   * (dois eixos de normal, dois sinais), e de cada uma os dois lados do passo: ele só corre na face se ela o cobre
   * dos dois lados. Um passo na borda de uma face (o topo de uma parede) não tem apoio.
   */
  lados: [Uint8Array, Uint8Array, Uint8Array];
  /** Bit 0: a célula está dentro de algo. Bits 1 a 3: o passo até a célula seguinte, em X, Y ou Z, bate em algo. */
  fechado: Uint8Array;
  /** 1: em cima de um cabo já arrumado. 2: na faixa vizinha do outro cabo do par. */
  ocupado: Uint8Array;
  /** Número do nó de cada célula em que o cabo pode ficar; −1 nas outras. */
  no: Int32Array;
  celulas: Int32Array;
}

function celula(g: Grade, i: number, j: number, k: number): number {
  return (i * g.n[1] + j) * g.n[2] + k;
}

function indices(g: Grade, cel: number): P3 {
  const k = cel % g.n[2];
  const r = (cel - k) / g.n[2];
  const j = r % g.n[1];
  return [(r - j) / g.n[1], j, k];
}

function posicao(g: Grade, cel: number): P3 {
  const [i, j, k] = indices(g, cel);
  return [g.c[0][i]!, g.c[1][j]!, g.c[2][k]!];
}

/** Índices dos valores estritamente dentro de (`min`, `max`). Vazio quando `a > b`. */
function dentro(c: Float64Array, min: number, max: number): [number, number] {
  return [primeiroDesde(c, min + 1e-7), primeiroDesde(c, max - 1e-7) - 1];
}

/** Índices `e` dos passos de `c[e]` a `c[e + 1]` que tocam o interior de (`min`, `max`). */
function passosEm(c: Float64Array, min: number, max: number): [number, number] {
  return [Math.max(0, primeiroDesde(c, min + 1e-7) - 1), Math.min(c.length - 2, primeiroDesde(c, max - 1e-7) - 1)];
}

function classeDa(f: FaceDoMundo): number {
  return f.eixo !== 1 ? CLASSE_PAREDE : f.sinal > 0 ? CLASSE_PISO : CLASSE_TETO;
}

function bitDa(eixo: number, sinal: number): number {
  return 1 << (eixo * 2 + (sinal > 0 ? 0 : 1));
}

function bloqueiosDe(mundo: Mundo): Bloqueio[] {
  const lista: Bloqueio[] = [];
  for (const f of mundo.faces) {
    // A borda da face também impede: duas faces vizinhas no mesmo plano não deixam fresta na emenda.
    lista.push({ min: [f.min[0] - MEIA_FACE, f.min[1] - MEIA_FACE, f.min[2] - MEIA_FACE], max: [f.max[0] + MEIA_FACE, f.max[1] + MEIA_FACE, f.max[2] + MEIA_FACE] });
  }
  for (const x of mundo.caixas) {
    lista.push({ min: [x.min[0] - MARGEM_DA_PECA, x.min[1] - MARGEM_DA_PECA, x.min[2] - MARGEM_DA_PECA], max: [x.max[0] + MARGEM_DA_PECA, x.max[1] + MARGEM_DA_PECA, x.max[2] + MARGEM_DA_PECA] });
  }
  return lista;
}

function montarGrade(mundo: Mundo, bloqueios: readonly Bloqueio[], pontos: readonly P3[], opcoes: OpcoesDoTrajeto): Grade {
  const valores: [number[], number[], number[]] = [[], [], []];
  for (const f of mundo.faces) {
    if (!f.apoio) continue;
    valores[f.eixo].push(f.min[f.eixo] + f.sinal * D);
    for (let e = 0; e < 3; e++) {
      if (e === f.eixo) continue;
      valores[e]!.push(f.min[e]!, f.max[e]!);
      const medida = f.max[e]! - f.min[e]!;
      if (medida > 3 * MARGEM_DA_BORDA) valores[e]!.push(f.min[e]! + MARGEM_DA_BORDA, f.max[e]! - MARGEM_DA_BORDA);
      if (medida > 3 * MARGEM_LARGA && medida <= FACE_PEQUENA) valores[e]!.push(f.min[e]! + MARGEM_LARGA, f.max[e]! - MARGEM_LARGA);
    }
  }
  for (const x of mundo.caixas) {
    for (let e = 0; e < 3; e++) valores[e]!.push(x.min[e]! - MARGEM_DA_PECA - 0.005, x.max[e]! + MARGEM_DA_PECA + 0.005);
  }
  for (const p of pontos) for (let e = 0; e < 3; e++) valores[e]!.push(p[e]!);
  // Ao lado de cada cabo já arrumado, uma linha de cada lado para este correr junto.
  for (const t of opcoes.ocupados) {
    const lado = (t.largura + opcoes.largura) / 2 + ESPACO_ENTRE_CABOS;
    for (let e = 0; e < 3; e++) {
      if (Math.abs(t.a[e]! - t.b[e]!) > 1e-6) valores[e]!.push(t.a[e]!, t.b[e]!);
      else valores[e]!.push(t.a[e]! - lado, t.a[e]!, t.a[e]! + lado);
    }
  }
  const c: Grade['c'] = [ordenar(valores[0]), ordenar(valores[1]), ordenar(valores[2])];
  const n: P3 = [c[0].length, c[1].length, c[2].length];
  const total = n[0] * n[1] * n[2];
  const g: Grade = {
    c, n, passo: [n[1] * n[2], n[2], 1],
    apoio: new Uint8Array(total),
    aresta: [new Uint8Array(total), new Uint8Array(total), new Uint8Array(total)],
    lados: [new Uint8Array(total), new Uint8Array(total), new Uint8Array(total)],
    fechado: new Uint8Array(total),
    ocupado: new Uint8Array(total),
    no: new Int32Array(total).fill(-1),
    celulas: new Int32Array(0),
  };
  if (total === 0) return g;

  // Faces de apoio: os nós rentes a cada uma (com a folga em volta, para dobrar as quinas de fora) e, de cada passo,
  // de que lados a face o cobre. As bordas das faces são linhas da grade: cada face cobre retângulos inteiros dela.
  const classeDoPasso: [Uint8Array, Uint8Array, Uint8Array] = [new Uint8Array(total), new Uint8Array(total), new Uint8Array(total)];
  for (const f of mundo.faces) {
    if (!f.apoio) continue;
    const e = f.eixo;
    const plano = f.min[e] + f.sinal * D;
    const ie = maisPerto(c[e], plano);
    if (Math.abs(c[e][ie]! - plano) > 0.002) continue;
    const e1 = e === 0 ? 1 : 0;
    const e2 = e === 2 ? 1 : 2;
    const bit = bitDa(e, f.sinal);
    const idx: P3 = [0, 0, 0];
    idx[e] = ie;
    // Nós, com a folga.
    const a0 = primeiroDesde(c[e1], f.min[e1]! - D - 1e-6);
    const a1 = primeiroDesde(c[e1], f.max[e1]! + D + 1e-6) - 1;
    const b0 = primeiroDesde(c[e2], f.min[e2]! - D - 1e-6);
    const b1 = primeiroDesde(c[e2], f.max[e2]! + D + 1e-6) - 1;
    for (let a = a0; a <= a1; a++) {
      idx[e1] = a;
      for (let b = b0; b <= b1; b++) {
        idx[e2] = b;
        g.apoio[celula(g, idx[0], idx[1], idx[2])]! |= bit;
      }
    }
    // Passos, sem a folga: de `p0` a `p1` em cada eixo da face.
    const p0 = [maisPerto(c[e1], f.min[e1]!), maisPerto(c[e2], f.min[e2]!)];
    const p1 = [maisPerto(c[e1], f.max[e1]!), maisPerto(c[e2], f.max[e2]!)];
    const classe = classeDa(f);
    // Posição dos dois bits desta face no passo ao longo de `t`: a face é uma das quatro de normal fora de `t`.
    const casa = (t: number): number => ((e < t ? e : e - 1) * 2 + (f.sinal > 0 ? 0 : 1)) * 2;
    for (let a = p0[0]!; a <= p1[0]!; a++) {
      idx[e1] = a;
      for (let b = p0[1]!; b <= p1[1]!; b++) {
        idx[e2] = b;
        const cel = celula(g, idx[0], idx[1], idx[2]);
        if (a < p1[0]!) {
          // Passo ao longo de e1: os lados são as fileiras de e2 antes e depois.
          const m = ((b < p1[1]! ? 1 : 0) | (b > p0[1]! ? 2 : 0)) << casa(e1);
          const v = (g.lados[e1]![cel]! |= m);
          if (((v >> casa(e1)) & 3) === 3 && (classeDoPasso[e1]![cel] === 0 || classe < classeDoPasso[e1]![cel]!)) classeDoPasso[e1]![cel] = classe;
        }
        if (b < p1[1]!) {
          const m = ((a < p1[0]! ? 1 : 0) | (a > p0[0]! ? 2 : 0)) << casa(e2);
          const v = (g.lados[e2]![cel]! |= m);
          if (((v >> casa(e2)) & 3) === 3 && (classeDoPasso[e2]![cel] === 0 || classe < classeDoPasso[e2]![cel]!)) classeDoPasso[e2]![cel] = classe;
        }
      }
    }
  }
  g.aresta = classeDoPasso;

  // O que impede a passagem: células dentro de algo e passos que batem em algo.
  for (const q of bloqueios) {
    const d = [dentro(c[0], q.min[0], q.max[0]), dentro(c[1], q.min[1], q.max[1]), dentro(c[2], q.min[2], q.max[2])] as const;
    const p = [passosEm(c[0], q.min[0], q.max[0]), passosEm(c[1], q.min[1], q.max[1]), passosEm(c[2], q.min[2], q.max[2])] as const;
    for (let i = d[0][0]; i <= d[0][1]; i++) for (let j = d[1][0]; j <= d[1][1]; j++) for (let k = d[2][0]; k <= d[2][1]; k++) g.fechado[celula(g, i, j, k)]! |= 1;
    for (let i = p[0][0]; i <= p[0][1]; i++) for (let j = d[1][0]; j <= d[1][1]; j++) for (let k = d[2][0]; k <= d[2][1]; k++) g.fechado[celula(g, i, j, k)]! |= 2;
    for (let i = d[0][0]; i <= d[0][1]; i++) for (let j = p[1][0]; j <= p[1][1]; j++) for (let k = d[2][0]; k <= d[2][1]; k++) g.fechado[celula(g, i, j, k)]! |= 4;
    for (let i = d[0][0]; i <= d[0][1]; i++) for (let j = d[1][0]; j <= d[1][1]; j++) for (let k = p[2][0]; k <= p[2][1]; k++) g.fechado[celula(g, i, j, k)]! |= 8;
  }

  // Triângulos: só os passos apoiados precisam da conta (os vãos conferem na hora).
  for (const t of mundo.triangulos) {
    const faixa: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const min = Math.min(t[0][e]!, t[1][e]!, t[2][e]!);
      const max = Math.max(t[0][e]!, t[1][e]!, t[2][e]!);
      faixa.push([Math.max(0, primeiroDesde(c[e]!, min - 1e-6) - 1), Math.min(n[e]! - 1, primeiroDesde(c[e]!, max + 1e-6))]);
    }
    const a: P3 = [0, 0, 0];
    const b: P3 = [0, 0, 0];
    for (let i = faixa[0]![0]; i <= faixa[0]![1]; i++) {
      for (let j = faixa[1]![0]; j <= faixa[1]![1]; j++) {
        for (let k = faixa[2]![0]; k <= faixa[2]![1]; k++) {
          const cel = celula(g, i, j, k);
          if (g.apoio[cel] === 0) continue;
          a[0] = c[0][i]!;
          a[1] = c[1][j]!;
          a[2] = c[2][k]!;
          const ijk = [i, j, k];
          for (let e = 0; e < 3; e++) {
            if (ijk[e]! + 1 >= n[e]! || g.apoio[cel + g.passo[e]!] === 0 || (g.fechado[cel]! & (2 << e)) !== 0) continue;
            b[0] = a[0];
            b[1] = a[1];
            b[2] = a[2];
            b[e] = c[e]![ijk[e]! + 1]!;
            if (segmentoNoTriangulo(a, b, t)) g.fechado[cel]! |= 2 << e;
          }
        }
      }
    }
  }

  // Madeiramento dos telhados: as células logo abaixo do plano de uma água ficam fechadas.
  for (const t of mundo.telhados ?? []) {
    const [p0, p1, p2] = t;
    const nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
    const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    const nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    if (Math.abs(ny) < 1e-9) continue;
    const faixa = [0, 1, 2].map((e) => {
      const min = Math.min(p0[e]!, p1[e]!, p2[e]!) - (e === 1 ? ESPESSURA_DO_TELHADO : 0);
      const max = Math.max(p0[e]!, p1[e]!, p2[e]!);
      return [primeiroDesde(c[e]!, min - 1e-6), primeiroDesde(c[e]!, max + 1e-6) - 1] as const;
    });
    const lado = (ax: number, az: number, bx: number, bz: number, x: number, z: number): number => (bx - ax) * (z - az) - (bz - az) * (x - ax);
    for (let i = faixa[0]![0]; i <= faixa[0]![1]; i++) {
      const x = c[0][i]!;
      for (let k = faixa[2]![0]; k <= faixa[2]![1]; k++) {
        const z = c[2][k]!;
        // O ponto (x, z) está debaixo do triângulo, visto de cima.
        const s0 = lado(p0[0], p0[2], p1[0], p1[2], x, z);
        const s1 = lado(p1[0], p1[2], p2[0], p2[2], x, z);
        const s2 = lado(p2[0], p2[2], p0[0], p0[2], x, z);
        if (!((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0))) continue;
        const yDoPlano = p0[1] - (nx * (x - p0[0]) + nz * (z - p0[2])) / ny;
        for (let j = faixa[1]![0]; j <= faixa[1]![1]; j++) {
          const falta = yDoPlano - c[1][j]!;
          if (falta > 0 && falta < ESPESSURA_DO_TELHADO) g.fechado[celula(g, i, j, k)]! |= 1;
        }
      }
    }
  }

  // Cabos já arrumados: os nós a menos de um lado deles ficam ocupados.
  for (const t of opcoes.ocupados) {
    const lado = (t.largura + opcoes.largura) / 2 + ESPACO_ENTRE_CABOS - 0.001;
    const f: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const min = Math.min(t.a[e]!, t.b[e]!);
      const max = Math.max(t.a[e]!, t.b[e]!);
      // Ao longo do cabo vale o trecho mesmo; de través, a largura dos dois.
      const m = max - min > 1e-6 ? 0.001 : lado;
      f.push([primeiroDesde(c[e]!, min - m), primeiroDesde(c[e]!, max + m) - 1]);
    }
    for (let i = f[0]![0]; i <= f[0]![1]; i++) for (let j = f[1]![0]; j <= f[1]![1]; j++) for (let k = f[2]![0]; k <= f[2]![1]; k++) g.ocupado[celula(g, i, j, k)] = 1;
  }
  // Faixa vizinha do outro cabo do par: os nós livres a um lado dele.
  for (const t of opcoes.ocupados) {
    if (!t.par) continue;
    const lado = (t.largura + opcoes.largura) / 2 + ESPACO_ENTRE_CABOS + 0.002;
    const f: [number, number][] = [];
    for (let e = 0; e < 3; e++) f.push([primeiroDesde(c[e]!, Math.min(t.a[e]!, t.b[e]!) - lado), primeiroDesde(c[e]!, Math.max(t.a[e]!, t.b[e]!) + lado) - 1]);
    for (let i = f[0]![0]; i <= f[0]![1]; i++) for (let j = f[1]![0]; j <= f[1]![1]; j++) for (let k = f[2]![0]; k <= f[2]![1]; k++) {
      const cel = celula(g, i, j, k);
      if (g.ocupado[cel] === 0) g.ocupado[cel] = 2;
    }
  }

  // Nós: células com apoio e fora de tudo.
  const celulas: number[] = [];
  for (let cel = 0; cel < total; cel++) {
    if (g.apoio[cel] !== 0 && (g.fechado[cel]! & 1) === 0) {
      g.no[cel] = celulas.length;
      celulas.push(cel);
    }
  }
  g.celulas = Int32Array.from(celulas);
  return g;
}

/** Nada no caminho, em linha reta, de `a` a `b`. As caixas que contêm `a` não contam (a peça do próprio terminal). */
export function caminhoLivre(mundo: Mundo, a: P3, b: P3): boolean {
  for (const f of mundo.faces) {
    const e = f.eixo;
    const da = a[e] - f.min[e];
    const db = b[e] - f.min[e];
    if ((da > MEIA_FACE && db > MEIA_FACE) || (da < -MEIA_FACE && db < -MEIA_FACE)) continue;
    const min: P3 = [f.min[0] - MEIA_FACE, f.min[1] - MEIA_FACE, f.min[2] - MEIA_FACE];
    const max: P3 = [f.max[0] + MEIA_FACE, f.max[1] + MEIA_FACE, f.max[2] + MEIA_FACE];
    if (segmentoNaCaixa(a, b, min, max)) return false;
  }
  for (const x of mundo.caixas) {
    if (a[0] >= x.min[0] && a[0] <= x.max[0] && a[1] >= x.min[1] && a[1] <= x.max[1] && a[2] >= x.min[2] && a[2] <= x.max[2]) continue;
    if (segmentoNaCaixa(a, b, x.min, x.max)) return false;
  }
  for (const t of mundo.triangulos) if (segmentoNoTriangulo(a, b, t)) return false;
  return true;
}

// ---------------------------------------------------------------- Trajeto

interface Entrada {
  no: number;
  custo: number;
  /** Índice da opção livre de onde este nó parte; −1 no terminal comum. */
  opcao: number;
}

/** Bits de `apoio` das faces de pé (normal em X ou em Z). */
const BITS_DE_PAREDE = 0b110011;

export function tracarTrajeto(mundo: Mundo, de: PontaDoTrajeto, para: PontaDoTrajeto, opcoes: OpcoesDoTrajeto): Trajeto | null {
  const bloqueios = bloqueiosDe(mundo);
  const lado = opcoes.largura + ESPACO_ENTRE_CABOS;
  const pontos: P3[] = [];
  for (const ponta of [de, para]) {
    if (ponta.tipo === 'terminal') {
      const q = alvoDo(ponta);
      pontos.push(ponta.pos);
      for (const k of [-2, -1, 0, 1, 2]) pontos.push([q[0] + k * lado, q[1] + k * lado, q[2] + k * lado]);
    } else {
      for (const o of ponta.opcoes) pontos.push(o.partida);
    }
  }
  const g = montarGrade(mundo, bloqueios, pontos, opcoes);
  const nos = g.celulas.length;
  if (nos === 0) return null;

  const livre = (a: P3, b: P3): boolean => caminhoLivre(mundo, a, b);

  /** Há teto ou telhado acima do ponto. */
  const coberto = (p: P3): boolean => {
    for (const f of mundo.faces) {
      if (f.eixo === 1 && f.min[1] > p[1] && p[0] > f.min[0] && p[0] < f.max[0] && p[2] > f.min[2] && p[2] < f.max[2]) return true;
    }
    const alto: P3 = [p[0], p[1] + 100, p[2]];
    for (const t of mundo.triangulos) if (segmentoNoTriangulo(p, alto, t)) return true;
    return false;
  };

  /** Nós da grade a até `raio` de `centro`, do mais perto para o mais longe. */
  const nosPerto = (centro: P3, raio: number, soParede: boolean): { no: number; d: number; p: P3 }[] => {
    const f: [number, number][] = [];
    for (let e = 0; e < 3; e++) f.push([primeiroDesde(g.c[e]!, centro[e]! - raio), primeiroDesde(g.c[e]!, centro[e]! + raio) - 1]);
    const lista: { no: number; d: number; p: P3 }[] = [];
    for (let i = f[0]![0]; i <= f[0]![1]; i++) {
      for (let j = f[1]![0]; j <= f[1]![1]; j++) {
        for (let k = f[2]![0]; k <= f[2]![1]; k++) {
          const cel = celula(g, i, j, k);
          const no = g.no[cel]!;
          if (no < 0 || (soParede && (g.apoio[cel]! & BITS_DE_PAREDE) === 0)) continue;
          const p: P3 = [g.c[0][i]!, g.c[1][j]!, g.c[2][k]!];
          const d = dist(p, centro);
          if (d <= raio) lista.push({ no, d, p });
        }
      }
    }
    return lista.sort((x, y) => x.d - y.d);
  };

  const entradasDe = (ponta: PontaDoTrajeto): Entrada[] => {
    const lista: Entrada[] = [];
    if (ponta.tipo === 'terminal') {
      const q = alvoDo(ponta);
      const inicio: P3 = [ponta.pos[0] + ponta.saida[0] * 0.03, ponta.pos[1] + ponta.saida[1] * 0.03, ponta.pos[2] + ponta.saida[2] * 0.03];
      // Primeiro os nós à vista do terminal, do raio menor para o maior (o plugue de um ventilador de coluna fica a
      // mais de um metro do piso). Sem nenhum à vista (terminal dentro do volume da peça), valem os mais próximos.
      for (const raio of [RAIO_DO_TERMINAL, 2 * RAIO_DO_TERMINAL, 4 * RAIO_DO_TERMINAL]) {
        for (const { no, d, p } of nosPerto(q, raio, false)) {
          if (!livre(inicio, p)) continue;
          lista.push({ no, custo: PESO_DA_PONTA * d + (g.ocupado[g.celulas[no]!] === 1 ? 4 * PRECO_DE_CRUZAR : 0), opcao: -1 });
        }
        if (lista.length > 0) break;
      }
      if (lista.length === 0) for (const { no, d } of nosPerto(q, 4 * RAIO_DO_TERMINAL, false).slice(0, 12)) lista.push({ no, custo: PESO_DA_PONTA * d + 1, opcao: -1 });
    } else {
      ponta.opcoes.forEach((o, opcao) => {
        let achados = 0;
        for (const { no, d, p } of nosPerto(o.partida, o.alcance ?? RAIO_LIVRE, true)) {
          if (!livre(o.partida, p)) continue;
          if (o.aCeuAberto && coberto([(o.partida[0] + p[0]) / 2, (o.partida[1] + p[1]) / 2, (o.partida[2] + p[2]) / 2])) continue;
          lista.push({ no, custo: o.custo + PRECO_DO_VAO + PESO_DO_VAO * d + (g.ocupado[g.celulas[no]!] === 1 ? 4 * PRECO_DE_CRUZAR : 0), opcao });
          if (++achados >= 60) break;
        }
      });
    }
    return lista;
  };

  const partidas = entradasDe(de);
  const chegadas = entradasDe(para);
  if (partidas.length === 0 || chegadas.length === 0) return null;
  const chegada = new Map<number, Entrada>();
  for (const e of chegadas) {
    const atual = chegada.get(e.no);
    if (!atual || e.custo < atual.custo) chegada.set(e.no, e);
  }

  // Dijkstra sobre (nó, direção de chegada). A direção 6 é a de quem acabou de sair do terminal.
  const estados = nos * 7;
  const custo = new Float64Array(estados).fill(Infinity);
  const anterior = new Int32Array(estados).fill(-1);
  const porVao = new Uint8Array(estados);
  const origem = new Map<number, Entrada>();
  const fila = new Fila();
  // A*: o que falta, no mínimo, é a distância em degraus até a caixa que contém as chegadas (nenhum passo custa menos
  // que o comprimento dele). Por eixo, a distância de cada linha da grade a essa caixa.
  const falta = [0, 1, 2].map((e) => {
    let min = Infinity;
    let max = -Infinity;
    for (const x of chegadas) {
      const v = g.c[e]![indices(g, g.celulas[x.no]!)[e]!]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return Float64Array.from(g.c[e]!, (v) => (v < min ? min - v : v > max ? v - max : 0) * PESO_JUNTO_DO_PAR);
  });
  const menorChegada = Math.min(...chegadas.map((e) => e.custo));
  const faltaDa = (cel: number): number => {
    const [i, j, k] = indices(g, cel);
    return falta[0]![i]! + falta[1]![j]! + falta[2]![k]! + menorChegada;
  };
  for (const e of partidas) {
    const s = e.no * 7 + 6;
    if (e.custo < custo[s]!) {
      custo[s] = e.custo;
      origem.set(e.no, e);
      fila.por(e.custo + faltaDa(g.celulas[e.no]!), s);
    }
  }
  /** Por nó e sentido (+X, −X, +Z, −Z): a célula onde chega o vão que parte dali; −1 sem vão; −2 ainda sem conta. */
  const vaos = new Int32Array(nos * 4).fill(-2);
  const yMinimo = opcoes.alturaMinimaDoVao ?? -Infinity;
  let melhor = Infinity;
  let fim = -1;
  const relaxar = (de_: number, para_: number, c: number, vao: boolean, restante: number): void => {
    if (c < custo[para_]!) {
      custo[para_] = c;
      anterior[para_] = de_;
      porVao[para_] = vao ? 1 : 0;
      fila.por(c + restante, para_);
    }
  };
  while (fila.tamanho > 0) {
    const previsto = fila.tirar();
    const s = fila.ultimo;
    if (previsto >= melhor) break;
    const no = (s / 7) | 0;
    const dir = s - no * 7;
    const cAtual = custo[s]!;
    if (previsto > cAtual + faltaDa(g.celulas[no]!) + 1e-9) continue;
    const alvo = chegada.get(no);
    if (alvo && cAtual + alvo.custo < melhor) {
      melhor = cAtual + alvo.custo;
      fim = s;
    }
    const cel = g.celulas[no]!;
    const ijk = indices(g, cel);
    const bits = g.apoio[cel]!;
    for (let d = 0; d < 6; d++) {
      if (dir < 6 && d === (dir ^ 1)) continue;
      const e = d >> 1;
      const sobe = (d & 1) === 0;
      const i = ijk[e]!;
      if (sobe ? i + 1 >= g.n[e]! : i === 0) continue;
      const viz = cel + (sobe ? g.passo[e]! : -g.passo[e]!);
      const base = sobe ? cel : viz;
      if ((g.fechado[base]! & (2 << e)) !== 0) continue;
      const noViz = g.no[viz]!;
      if (noViz < 0) continue;
      const comprimento = Math.abs(g.c[e]![sobe ? i + 1 : i - 1]! - g.c[e]![i]!);
      const classe = g.aresta[e]![base]!;
      let peso: number;
      if (classe === 0) {
        if (comprimento > SALTO) continue;
        // Passo curto sem face dos dois lados: a volta de uma quina de fora (os dois nós rentes a uma face, e um deles
        // rente também à face do outro lado da quina) ou o salto entre duas faces quase no mesmo plano.
        peso = PESO_DO_SALTO;
      } else {
        peso = PESO_DA_CLASSE[classe]!;
        // Correr dentro de uma quina (duas faces de apoio ao mesmo tempo) não deixa lugar para o grampo.
        const comuns = bits & g.apoio[viz]! & ~(3 << (e * 2));
        if ((comuns & (comuns - 1)) !== 0) peso *= PESO_NA_QUINA;
      }
      const oViz = g.ocupado[viz]!;
      const oCel = g.ocupado[cel]!;
      if (oViz === 2 && oCel === 2) peso *= PESO_JUNTO_DO_PAR;
      let c = cAtual + comprimento * peso;
      if (dir < 6 && d !== dir) c += PRECO_DA_DOBRA;
      if (oViz === 1) c += oCel === 1 ? comprimento * PESO_SOBRE_OUTRO : PRECO_DE_CRUZAR;
      const ijkViz = sobe ? i + 1 : i - 1;
      relaxar(s, noViz * 7 + d, c, false, falta[e]![ijkViz]! + falta[(e + 1) % 3]![ijk[(e + 1) % 3]!]! + falta[(e + 2) % 3]![ijk[(e + 2) % 3]!]! + menorChegada);
    }
    // Vão: de uma parede, em linha reta pela normal dela, até a parede de frente de outra construção, a céu aberto.
    if ((bits & BITS_DE_PAREDE) !== 0 && g.c[1][ijk[1]]! >= yMinimo) {
      for (let q = 0; q < 4; q++) {
        const d = q < 2 ? q : q + 2;
        const e = d >> 1;
        const sobe = (d & 1) === 0;
        if ((bits & bitDa(e, sobe ? 1 : -1)) === 0) continue;
        let destino = vaos[no * 4 + q]!;
        if (destino === -2) {
          destino = -1;
          const defronte = bitDa(e, sobe ? -1 : 1);
          let c2 = cel;
          let i = ijk[e]!;
          for (;;) {
            if (sobe ? i + 1 >= g.n[e]! : i === 0) break;
            const viz = c2 + (sobe ? g.passo[e]! : -g.passo[e]!);
            if ((g.fechado[sobe ? c2 : viz]! & (2 << e)) !== 0 || (g.fechado[viz]! & 1) !== 0) break;
            c2 = viz;
            i += sobe ? 1 : -1;
            const comprimento = Math.abs(g.c[e]![i]! - g.c[e]![ijk[e]!]!);
            if (comprimento > MAXIMO_DO_VAO) break;
            if ((g.apoio[c2]! & defronte) === 0 || g.no[c2]! < 0 || comprimento < 0.25) continue;
            const a = posicao(g, cel);
            const b = posicao(g, c2);
            const meio: P3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            if (!coberto(meio) && mundo.triangulos.every((t) => !segmentoNoTriangulo(a, b, t))) destino = c2;
            break;
          }
          vaos[no * 4 + q] = destino;
        }
        if (destino < 0) continue;
        const comprimento = Math.abs(g.c[e]![indices(g, destino)[e]!]! - g.c[e]![ijk[e]!]!);
        let c = cAtual + PRECO_DO_VAO + PESO_DO_VAO * comprimento;
        if (dir < 6 && d !== dir) c += PRECO_DA_DOBRA;
        if (g.ocupado[destino] === 1) c += PRECO_DE_CRUZAR;
        relaxar(s, g.no[destino]! * 7 + d, c, true, faltaDa(destino));
      }
    }
  }
  if (fim < 0) return null;

  // Caminho, do fim para o começo.
  const passos: { cel: number; vao: boolean }[] = [];
  for (let s = fim; s >= 0; s = anterior[s]!) passos.push({ cel: g.celulas[(s / 7) | 0]!, vao: porVao[s] === 1 });
  passos.reverse();
  const primeira = origem.get(g.no[passos[0]!.cel]!)!;
  const ultima = chegada.get(g.no[passos[passos.length - 1]!.cel]!)!;

  const corridas = corridasDe(g, mundo, passos);
  const meio = gramposDas(mundo, corridas);
  const grampos: GrampoDoTrajeto[] = [];
  if (de.tipo === 'livre') grampos.push(...de.opcoes[primeira.opcao]!.grampos);
  grampos.push(...meio);
  if (para.tipo === 'livre') grampos.push(...[...para.opcoes[ultima.opcao]!.grampos].reverse());
  const vertices: P3[] = [corridas[0]?.a ?? posicao(g, passos[0]!.cel)];
  for (const r of corridas) vertices.push(r.b);
  return {
    grampos,
    pontos: vertices,
    trechos: corridas.filter((r) => !r.salto).map((r) => ({ a: r.a, b: r.b })),
    custo: melhor,
  };
}

function alvoDo(ponta: { pos: P3; saida: P3 }): P3 {
  return [ponta.pos[0] + ponta.saida[0] * SAIDA_DO_TERMINAL, ponta.pos[1] + ponta.saida[1] * SAIDA_DO_TERMINAL, ponta.pos[2] + ponta.saida[2] * SAIDA_DO_TERMINAL];
}

/** Trecho reto do caminho, em uma face só. */
interface Corrida {
  a: P3;
  b: P3;
  /** Face em que corre: eixo da normal, sinal e coordenada do plano. Nula no vão e no salto. */
  eixo: number;
  sinal: number;
  plano: number;
  vao: boolean;
  salto: boolean;
}

/** Faces de apoio em que um passo da grade corre (as duas pontas rentes à face). */
function facesDoPasso(mundo: Mundo, a: P3, b: P3): FaceDoMundo[] {
  const lista: FaceDoMundo[] = [];
  for (const f of mundo.faces) {
    if (!f.apoio) continue;
    const e = f.eixo;
    const plano = f.min[e] + f.sinal * D;
    if (Math.abs(a[e] - plano) > 0.003 || Math.abs(b[e] - plano) > 0.003) continue;
    let ok = true;
    for (let t = 0; t < 3 && ok; t++) {
      if (t === e) continue;
      const lo = f.min[t]! - D - 1e-4;
      const hi = f.max[t]! + D + 1e-4;
      if (a[t]! < lo || a[t]! > hi || b[t]! < lo || b[t]! > hi) ok = false;
    }
    if (ok) lista.push(f);
  }
  return lista;
}

function mesmoPlano(r: { eixo: number; sinal: number; plano: number }, f: { eixo: number; sinal: number; plano: number }): boolean {
  return r.eixo === f.eixo && r.sinal === f.sinal && Math.abs(r.plano - f.plano) <= SALTO + 0.003;
}

function corridasDe(g: Grade, mundo: Mundo, passos: readonly { cel: number; vao: boolean }[]): Corrida[] {
  const pos = passos.map((p) => posicao(g, p.cel));
  /** Por passo: os planos possíveis. */
  const planos = pos.slice(1).map((b, i) => (passos[i + 1]!.vao ? [] : facesDoPasso(mundo, pos[i]!, b).map((f) => ({ eixo: f.eixo as number, sinal: f.sinal as number, plano: f.min[f.eixo] }))));
  const corridas: Corrida[] = [];
  let atual: { eixo: number; sinal: number; plano: number } | null = null;
  for (let i = 0; i + 1 < pos.length; i++) {
    const a = pos[i]!;
    const b = pos[i + 1]!;
    const vao = passos[i + 1]!.vao;
    const opcoes = planos[i]!;
    const salto = !vao && opcoes.length === 0;
    let plano: { eixo: number; sinal: number; plano: number } | null = null;
    if (!vao && !salto) {
      plano = (atual && opcoes.find((o) => mesmoPlano(atual!, o))) ?? null;
      if (!plano) {
        // Troca de face: vale a que também serve ao passo seguinte; senão, parede antes de piso, piso antes de teto.
        const seguinte = planos[i + 1] ?? [];
        const ordem = (o: { eixo: number; sinal: number }): number => (o.eixo !== 1 ? 0 : o.sinal > 0 ? 1 : 2);
        plano = opcoes.find((o) => seguinte.some((x) => mesmoPlano(x, o))) ?? [...opcoes].sort((x, y) => ordem(x) - ordem(y))[0]!;
      }
      atual = plano;
    }
    const eixoDoPasso = [0, 1, 2].find((e) => Math.abs(a[e]! - b[e]!) > 1e-9) ?? 0;
    const ultima = corridas[corridas.length - 1];
    const eixoDaUltima = ultima ? [0, 1, 2].find((e) => Math.abs(ultima.a[e]! - ultima.b[e]!) > 1e-9) : undefined;
    const mesmoSentido = ultima && eixoDaUltima === eixoDoPasso && Math.sign(ultima.b[eixoDoPasso]! - ultima.a[eixoDoPasso]!) === Math.sign(b[eixoDoPasso]! - a[eixoDoPasso]!);
    if (ultima && mesmoSentido && !vao && !ultima.vao && !salto && !ultima.salto && plano && mesmoPlano(ultima, plano)) {
      ultima.b = b;
      continue;
    }
    corridas.push({ a, b, eixo: plano?.eixo ?? -1, sinal: plano?.sinal ?? 0, plano: plano?.plano ?? 0, vao, salto });
  }
  return corridas;
}

/** Grampos ao longo das corridas: nas dobras, antes e depois de cada quina, nas pontas dos vãos e a cada 1,5 m. */
function gramposDas(mundo: Mundo, todas: readonly Corrida[]): GrampoDoTrajeto[] {
  // Os saltos de milímetros não contam: as corridas vizinhas se emendam.
  const corridas = todas.filter((r) => !r.salto);
  const grampos: GrampoDoTrajeto[] = [];
  const por = (r: Corrida, t: number): void => {
    const p: P3 = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t, r.a[2] + (r.b[2] - r.a[2]) * t];
    const normal: P3 = [0, 0, 0];
    normal[r.eixo] = r.sinal;
    const pos: P3 = [p[0], p[1], p[2]];
    pos[r.eixo] = r.plano;
    const ultimo = grampos[grampos.length - 1];
    if (ultimo && dist(ultimo.pos, pos) < 0.02) return;
    grampos.push({ pos, normal, superficie: superficieEm(mundo, r, pos) });
  };
  corridas.forEach((r, i) => {
    if (r.vao) return;
    const antes = corridas[i - 1];
    const depois = corridas[i + 1];
    const comprimento = dist(r.a, r.b);
    if (comprimento < 1e-6) return;
    const recuo = Math.min(RECUO_DA_QUINA, comprimento / 2);
    // Começo: no vértice quando é a ponta, a chegada de um vão ou uma dobra na mesma face; recuado depois de uma quina.
    const inicio = !antes || antes.vao || mesmoPlano(antes, r) ? 0 : recuo;
    // Fim: a dobra na mesma face fica com a corrida seguinte.
    const fim = !depois || depois.vao ? comprimento : mesmoPlano(depois, r) ? null : comprimento - recuo;
    const ultimoPonto = fim ?? comprimento;
    por(r, inicio / comprimento);
    const vao = ultimoPonto - inicio;
    const partes = Math.ceil(vao / VAO_ENTRE_GRAMPOS - 1e-9);
    for (let k = 1; k < partes; k++) por(r, (inicio + (vao * k) / partes) / comprimento);
    if (fim !== null && fim - inicio > 1e-6) por(r, fim / comprimento);
  });
  return grampos;
}

function superficieEm(mundo: Mundo, r: Corrida, pos: P3): string | null {
  let reserva: string | null = null;
  for (const f of mundo.faces) {
    if (!f.apoio || f.superficie === undefined || f.eixo !== r.eixo || f.sinal !== r.sinal || Math.abs(f.min[f.eixo] - r.plano) > SALTO + 0.003) continue;
    let ok = true;
    let perto = true;
    for (let t = 0; t < 3; t++) {
      if (t === f.eixo) continue;
      if (pos[t]! < f.min[t]! - 1e-4 || pos[t]! > f.max[t]! + 1e-4) ok = false;
      if (pos[t]! < f.min[t]! - 0.06 || pos[t]! > f.max[t]! + 0.06) perto = false;
    }
    if (ok) return f.superficie;
    if (perto) reserva = f.superficie;
  }
  return reserva;
}

/**
 * Para o cabo sem caminho pelas superfícies: ponto de apoio mais próximo da saída de um terminal, onde vai um grampo.
 * Nulo se não há face de apoio a menos de 1 m.
 */
export function apoioMaisPerto(mundo: Mundo, pos: P3, saida: P3): GrampoDoTrajeto | null {
  const q = alvoDo({ pos, saida });
  let melhor: GrampoDoTrajeto | null = null;
  let menor = 1;
  for (const f of mundo.faces) {
    if (!f.apoio) continue;
    const p: P3 = [0, 0, 0];
    for (let e = 0; e < 3; e++) p[e] = e === f.eixo ? f.min[e]! : Math.min(f.max[e]!, Math.max(f.min[e]!, q[e]!));
    // Só vale a face vista de frente: o grampo fica do lado em que o terminal está.
    if ((q[f.eixo] - f.min[f.eixo]) * f.sinal < 0) continue;
    const d = dist(p, q);
    if (d < menor) {
      menor = d;
      const normal: P3 = [0, 0, 0];
      normal[f.eixo] = f.sinal;
      melhor = { pos: p, normal, superficie: f.superficie ?? null };
    }
  }
  return melhor;
}
