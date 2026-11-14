// Telhado de telha colonial (capa e canal) com madeiramento. Especificação: cena-e-interface.md, seção 3.
//
// Cada água é um grupo com o seguinte quadro local: X ao longo da largura, Z descendo a água,
// Y a normal. O plano y = 0 é a crista das telhas, que é o plano da água na especificação.
// Abaixo dele ficam, nesta ordem: as telhas (relevo só visual), as ripas e a laje só de sombra
// (0,085 a 0,11) e os caibros. As placas da fase 2 encaixam na malha plana de y = 0.

import * as THREE from 'three';
import { CAMADA_SO_SOMBRA, Construtor, type Marca, sorteio } from './malha';
import { COR, mat } from './materiais';

/** Do plano da crista até a face de baixo das ripas, medido na normal. */
export const FUNDO_RIPA = 0.11;
/** Altura do caibro do telhado principal e da varanda. */
export const CAIBRO = 0.08;

const TOPO_RIPA = 0.085;
const TRASPASSE = 0.06;
const ESPESSURA_TELHA = 0.012;

interface Perfil {
  /** Meia largura no alto e embaixo da peça. */
  meiaAlto: number;
  meiaBaixo: number;
  /** Flecha do arco no alto e embaixo. */
  arcoAlto: number;
  arcoBaixo: number;
  /** Capa: altura da crista. Canal: altura do fundo. No alto e embaixo da peça. */
  yAlto: number;
  yBaixo: number;
  comp: number;
  convexa: boolean;
  gomos: number;
  /** Desenha a espessura na ponta de baixo. */
  borda: boolean;
}

/**
 * Meia-cana que afunila: a capa tem a boca para baixo, o canal para cima.
 * Vai de z = 0 (ponta de cima) a z = comp (ponta de baixo), com a espessura à mostra na ponta de baixo.
 */
function geometriaTelha(p: Perfil): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const n = p.gomos;
  const ponto = (k: 0 | 1, i: number, recuo: number): [number, number] => {
    const a = k === 0 ? p.meiaAlto : p.meiaBaixo;
    const h = k === 0 ? p.arcoAlto : p.arcoBaixo;
    const y0 = k === 0 ? p.yAlto : p.yBaixo;
    const t = (Math.PI * i) / n;
    // Capa: o arco de dentro é menor, sobre a mesma base. Canal: a face de baixo é a de cima, rebaixada.
    if (p.convexa) return [(a - recuo) * Math.cos(t), y0 - h + (h - recuo) * Math.sin(t)];
    return [a * Math.cos(t), y0 + h * (1 - Math.sin(t)) - recuo];
  };
  // Face de cima.
  for (const k of [0, 1] as const) {
    const a = k === 0 ? p.meiaAlto : p.meiaBaixo;
    const h = k === 0 ? p.arcoAlto : p.arcoBaixo;
    for (let i = 0; i <= n; i++) {
      const t = (Math.PI * i) / n;
      const [x, y] = ponto(k, i, 0);
      pos.push(x, y, k * p.comp);
      const nx = (p.convexa ? h : -h) * Math.cos(t);
      const ny = a * Math.sin(t);
      const m = Math.hypot(nx, ny) || 1;
      nor.push(nx / m, ny / m, 0);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i;
    const b = i + 1;
    const c = n + 1 + i + 1;
    const d = n + 1 + i;
    idx.push(a, b, c, a, c, d);
  }
  // Espessura à mostra na ponta de baixo: uma tira voltada para +Z.
  if (!p.borda) return montar(pos, nor, idx);
  const base = pos.length / 3;
  for (const recuo of [0, ESPESSURA_TELHA]) {
    for (let i = 0; i <= n; i++) {
      const [x, y] = ponto(1, i, recuo);
      pos.push(x, y, p.comp);
      nor.push(0, 0, 1);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = base + i;
    const b = base + i + 1;
    const c = base + n + 1 + i + 1;
    const d = base + n + 1 + i;
    idx.push(a, b, c, a, c, d);
  }
  return montar(pos, nor, idx);
}

function montar(pos: number[], nor: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const corBase = new THREE.Color(COR.telha);

/** Cor de uma telha: a da especificação, com a variação de queima e de idade de um telhado de verdade. */
function corDeTelha(r: () => number, escurecer: number, alvo: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  corBase.getHSL(hsl, THREE.SRGBColorSpace);
  let l = hsl.l + (r() - 0.5) * 0.05;
  let s = hsl.s * 0.92 + (r() - 0.5) * 0.07;
  const h = hsl.h + (r() - 0.5) * 0.012;
  const sorte = r();
  if (sorte < 0.04) {
    // Telha mais velha, escurecida.
    l *= 0.86;
    s *= 0.85;
  } else if (sorte > 0.97) {
    l *= 1.05;
    s *= 0.85;
  }
  return alvo.setHSL(h, THREE.MathUtils.clamp(s, 0, 1), THREE.MathUtils.clamp(l * escurecer, 0, 1), THREE.SRGBColorSpace);
}

function instanciar(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  matrizes: THREE.Matrix4[],
  cores: THREE.Color[] | null,
): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, material, matrizes.length);
  matrizes.forEach((mz, i) => m.setMatrixAt(i, mz));
  if (cores) cores.forEach((c, i) => m.setColorAt(i, c));
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  // O relevo é só visual: a sombra na tela e no cálculo vem da laje só de sombra.
  m.castShadow = false;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

/** Retângulo no quadro da água: X ao longo da largura (zero no meio), Z descendo a partir da borda de cima. */
export interface Recorte {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface OpcoesAgua {
  largura: number;
  /** Medida ao longo da descida, no plano da água. */
  comprimento: number;
  superficie: Marca;
  /** Altura do caibro, em metros. */
  caibro: number;
  semente: number;
  /** Faixa de argamassa no alto, onde a água encosta em uma parede. */
  rufo?: boolean;
  /**
   * Pedaços da água que não existem (o beiral que some onde uma varanda encosta, em casa térrea).
   * Cada recorte é alargado até a junta de telhas mais próxima, para não sobrar telha cortada.
   */
  recortes?: readonly Recorte[];
  /** Posições em X e em Z onde tem de cair uma junta de telhas (a linha da parede, nos recortes). */
  marcosX?: readonly number[];
  marcosZ?: readonly number[];
}

/** Juntas de `a` até `b`, com passo perto de `passo` e uma junta em cada marco. */
function juntas(a: number, b: number, marcos: readonly number[], passo: number): number[] {
  const pontos = [a];
  for (const m of [...marcos].sort((p, q) => p - q)) {
    if (m > pontos[pontos.length - 1]! + 0.12 && m < b - 0.12) pontos.push(m);
  }
  pontos.push(b);
  const lista = [a];
  for (let i = 0; i + 1 < pontos.length; i++) {
    const p0 = pontos[i]!;
    const p1 = pontos[i + 1]!;
    const n = Math.max(1, Math.round((p1 - p0) / passo));
    for (let j = 1; j <= n; j++) lista.push(j === n ? p1 : p0 + ((p1 - p0) * j) / n);
  }
  return lista;
}

/** Trechos seguidos de `n` posições com a mesma categoria, fora a categoria zero. */
function trechos(n: number, categoria: (i: number) => number): [inicio: number, fim: number, categoria: number][] {
  const lista: [number, number, number][] = [];
  let inicio = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && categoria(i) === categoria(inicio)) continue;
    if (categoria(inicio) !== 0) lista.push([inicio, i, categoria(inicio)]);
    inicio = i;
  }
  return lista;
}

/** Uma água de telhado. A origem fica no meio da borda de cima. */
export function criarAgua(o: OpcoesAgua): THREE.Group {
  const g = new THREE.Group();
  g.name = o.superficie.id;
  const L = o.largura;
  const C = o.comprimento;
  const r = sorteio(o.semente);

  // Grade das telhas: colunas de canal ao longo de X, fiadas ao longo de Z.
  const xs = juntas(-L / 2, L / 2, o.marcosX ?? [], 0.235);
  const zs = juntas(0, C, o.marcosZ ?? [], 0.42);
  const colunas = xs.length - 1;
  const fiadas = zs.length - 1;
  const passoX = L / colunas;
  const passoZ = C / fiadas;

  // Recortes alargados até as juntas, e a grade do que sobra.
  const antes = (lista: number[], v: number): number => lista.filter((p) => p <= v + 0.02).pop() ?? lista[0]!;
  const depois = (lista: number[], v: number): number => lista.find((p) => p >= v - 0.02) ?? lista[lista.length - 1]!;
  const recortes = (o.recortes ?? []).map((c) => ({ x0: antes(xs, c.x0), x1: depois(xs, c.x1), z0: antes(zs, c.z0), z1: depois(zs, c.z1) }));
  const vivas: boolean[] = [];
  for (let i = 0; i < colunas; i++) {
    const x = (xs[i]! + xs[i + 1]!) / 2;
    for (let j = 0; j < fiadas; j++) {
      const z = (zs[j]! + zs[j + 1]!) / 2;
      vivas.push(!recortes.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1));
    }
  }
  const viva = (i: number, j: number): boolean => i >= 0 && i < colunas && j >= 0 && j < fiadas && vivas[i * fiadas + j]!;

  // O que sobra, em retângulos: colunas vizinhas com as mesmas fiadas viram um retângulo só.
  const partes: Recorte[] = [];
  let abertas = new Map<string, Recorte>();
  for (let i = 0; i < colunas; i++) {
    const novas = new Map<string, Recorte>();
    for (const [j0, j1] of trechos(fiadas, (j) => (viva(i, j) ? 1 : 0))) {
      const chave = `${j0}-${j1}`;
      let parte = abertas.get(chave);
      if (parte) parte.x1 = xs[i + 1]!;
      else {
        parte = { x0: xs[i]!, x1: xs[i + 1]!, z0: zs[j0]!, z1: zs[j1]! };
        partes.push(parte);
      }
      novas.set(chave, parte);
    }
    abertas = novas;
  }

  // Malha de encaixe (plana, na crista, invisível ao desenho) e laje só de sombra
  // (o sólido que tapa o sol, na tela e no cálculo).
  const plano = new Construtor();
  const sombra = new Construtor();
  for (const p of partes) {
    plano.quad([p.x0, 0, p.z1], [p.x1, 0, p.z1], [p.x1, 0, p.z0], [p.x0, 0, p.z0]);
    sombra.caixa(p.x0, -FUNDO_RIPA, p.z0, p.x1, -TOPO_RIPA, p.z1);
  }
  const encaixe = plano.malha(mat.encaixe);
  encaixe.name = `encaixe-${o.superficie.id}`;
  encaixe.userData.superficie = o.superficie;
  encaixe.userData.soEncaixe = true;
  g.add(encaixe);

  const laje = sombra.malha(mat.soSombra);
  laje.name = `sombra-${o.superficie.id}`;
  laje.castShadow = true;
  laje.userData.sombra = true;
  laje.userData.soSombra = true;
  laje.layers.set(CAMADA_SO_SOMBRA);
  g.add(laje);

  // Telhas: fiadas de canal lado a lado e capas sobre as juntas.
  const comp = passoZ + TRASPASSE;

  const geoCapa = geometriaTelha({
    meiaAlto: passoX * 0.29,
    meiaBaixo: passoX * 0.37,
    arcoAlto: 0.05,
    arcoBaixo: 0.062,
    yAlto: -0.02,
    yBaixo: 0,
    comp,
    convexa: true,
    gomos: 4,
    borda: true,
  });
  const geoCanal = geometriaTelha({
    meiaAlto: passoX / 2 - 0.003,
    meiaBaixo: passoX / 2 - 0.02,
    arcoAlto: 0.058,
    arcoBaixo: 0.048,
    yAlto: -TOPO_RIPA,
    yBaixo: -0.07,
    comp,
    convexa: false,
    gomos: 2,
    // No canal a borda fica debaixo da fiada de baixo e quase não aparece.
    borda: false,
  });

  const mCapas: THREE.Matrix4[] = [];
  const cCapas: THREE.Color[] = [];
  const mCanais: THREE.Matrix4[] = [];
  const cCanais: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  const eixoY = new THREE.Vector3(0, 1, 0);
  /** `ex` e `ez` esticam a peça onde um marco deixou a coluna ou a fiada fora do passo comum. */
  const matriz = (x: number, z: number, ex: number, ez: number): THREE.Matrix4 => {
    // Assentamento à mão: um nada torta, um nada fora do lugar.
    q.setFromAxisAngle(eixoY, (r() - 0.5) * 0.022);
    return new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 0.006, 0, z + (r() - 0.5) * 0.008), q, new THREE.Vector3(ex, 1, ez));
  };
  const larguraDaColuna = (i: number): number => xs[i + 1]! - xs[i]!;
  for (let j = 0; j < fiadas; j++) {
    const z = zs[j]! - TRASPASSE;
    const ez = (zs[j + 1]! - zs[j]! + TRASPASSE) / comp;
    for (let i = 0; i <= colunas; i++) {
      if (!viva(i - 1, j) && !viva(i, j)) continue;
      const vizinhas = i === 0 ? larguraDaColuna(0) : i === colunas ? larguraDaColuna(i - 1) : (larguraDaColuna(i - 1) + larguraDaColuna(i)) / 2;
      mCapas.push(matriz(xs[i]!, z, vizinhas / passoX, ez));
      cCapas.push(corDeTelha(r, 1, new THREE.Color()));
    }
    for (let i = 0; i < colunas; i++) {
      if (!viva(i, j)) continue;
      mCanais.push(matriz((xs[i]! + xs[i + 1]!) / 2, z, larguraDaColuna(i) / passoX, ez));
      cCanais.push(corDeTelha(r, 0.8, new THREE.Color()));
    }
  }
  const capas = instanciar(geoCapa, mat.telha, mCapas, cCapas);
  capas.name = 'capas';
  const canais = instanciar(geoCanal, mat.telha, mCanais, cCanais);
  canais.name = 'canais';
  g.add(capas, canais);

  // Madeiramento: ripas ao longo da largura, uma por fiada, e caibros descendo a água.
  const mMadeira: THREE.Matrix4[] = [];
  const cMadeira: THREE.Color[] = [];
  const semGiro = new THREE.Quaternion();
  const peca = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void => {
    mMadeira.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), semGiro, new THREE.Vector3(sx, sy, sz)));
    cMadeira.push(new THREE.Color().setScalar(0.85 + r() * 0.3));
  };
  const hRipa = FUNDO_RIPA - TOPO_RIPA;
  const MEIO = 1;
  const BEIRA_DE_BAIXO = 2;
  const BEIRA_DE_CIMA = 3;
  for (let j = 0; j <= fiadas; j++) {
    const categoria = (i: number): number => {
      const acima = viva(i, j - 1);
      const abaixo = viva(i, j);
      return acima && abaixo ? MEIO : acima ? BEIRA_DE_BAIXO : abaixo ? BEIRA_DE_CIMA : 0;
    };
    for (const [i0, i1, tipo] of trechos(colunas, categoria)) {
      const xa = xs[i0]!;
      const xb = xs[i1]!;
      const z = zs[j]! + (tipo === BEIRA_DE_BAIXO ? -0.025 : tipo === BEIRA_DE_CIMA ? 0.025 : 0);
      peca((xa + xb) / 2, -(FUNDO_RIPA + TOPO_RIPA) / 2, z, xb - xa, hRipa, 0.05);
      // Ripa dobrada no beiral, que levanta a primeira fiada e serve de testeira.
      if (tipo === BEIRA_DE_BAIXO) peca((xa + xb) / 2, -FUNDO_RIPA - 0.02, zs[j]! - 0.0125, xb - xa, 0.04, 0.025);
    }
  }
  const nCaibros = Math.max(2, Math.round(L / 0.5) + 1);
  for (let n = 0; n < nCaibros; n++) {
    const x = -L / 2 + 0.045 + (n * (L - 0.09)) / (nCaibros - 1);
    const depoisDeX = xs.findIndex((p) => p > x);
    const i = THREE.MathUtils.clamp(depoisDeX - 1, 0, colunas - 1);
    for (const [j0, j1] of trechos(fiadas, (j) => (viva(i, j) ? 1 : 0))) {
      const z0 = zs[j0]!;
      const z1 = zs[j1]!;
      peca(x, -FUNDO_RIPA - o.caibro / 2, (z0 + z1) / 2 - 0.01, 0.05, o.caibro, z1 - z0 - 0.02);
    }
  }
  const madeira = instanciar(new THREE.BoxGeometry(1, 1, 1), mat.madeiramento, mMadeira, cMadeira);
  madeira.name = 'madeiramento';
  g.add(madeira);

  if (o.rufo) {
    const geo = new THREE.BoxGeometry(L, 0.07, 0.09);
    geo.translate(0, -0.005, 0.045);
    const rufo = new THREE.Mesh(geo, mat.argamassa);
    rufo.name = 'rufo';
    rufo.receiveShadow = true;
    g.add(rufo);
  }
  return g;
}

/** Fiada de telhas de cumeeira ao longo de X, com a argamassa que as assenta. A origem fica no meio da linha da cumeeira. */
export function criarCumeeira(largura: number, semente: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cumeeira';
  const r = sorteio(semente);
  const n = Math.max(1, Math.round(largura / 0.36));
  const passo = largura / n;
  const geo = geometriaTelha({
    meiaAlto: 0.118,
    meiaBaixo: 0.135,
    arcoAlto: 0.082,
    arcoBaixo: 0.095,
    yAlto: 0.03,
    yBaixo: 0.052,
    comp: passo + TRASPASSE,
    convexa: true,
    gomos: 8,
    borda: true,
  });
  // O comprimento da peça passa de Z para X.
  geo.rotateY(Math.PI / 2);
  const matrizes: THREE.Matrix4[] = [];
  const cores: THREE.Color[] = [];
  for (let i = 0; i < n; i++) {
    matrizes.push(new THREE.Matrix4().makeTranslation(-largura / 2 + i * passo - TRASPASSE / 2, 0, (r() - 0.5) * 0.008));
    cores.push(corDeTelha(r, 0.97, new THREE.Color()));
  }
  const telhas = instanciar(geo, mat.telha, matrizes, cores);
  telhas.name = 'telhas-cumeeira';
  g.add(telhas);

  const geoMassa = new THREE.BoxGeometry(largura - 0.02, 0.085, 0.21);
  geoMassa.translate(0, -0.032, 0);
  const massa = new THREE.Mesh(geoMassa, mat.argamassa);
  massa.name = 'argamassa-cumeeira';
  massa.receiveShadow = true;
  g.add(massa);
  return g;
}
