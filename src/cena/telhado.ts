// Telhado de telha colonial (capa e canal) com madeiramento. Especificação: cena-e-interface.md, seção 3.
//
// Cada água é um grupo com o seguinte quadro local: X ao longo da largura, Z descendo a água,
// Y a normal. O plano y = 0 é a crista das telhas, que é o plano da água na especificação.
// Abaixo dele ficam, nesta ordem: as telhas (relevo só visual), as ripas e a laje só de sombra
// (0,085 a 0,11) e os caibros. As placas da fase 2 encaixam na malha plana de y = 0.

import * as THREE from 'three';
import { CAMADA_SO_SOMBRA, type Marca, sorteio } from './malha';
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
}

/** Uma água de telhado. A origem fica no meio da borda de cima. */
export function criarAgua(o: OpcoesAgua): THREE.Group {
  const g = new THREE.Group();
  g.name = o.superficie.id;
  const L = o.largura;
  const C = o.comprimento;
  const r = sorteio(o.semente);

  // Malha de encaixe: plana, na crista, invisível ao desenho.
  const geoEncaixe = new THREE.PlaneGeometry(L, C);
  geoEncaixe.rotateX(-Math.PI / 2);
  geoEncaixe.translate(0, 0, C / 2);
  const encaixe = new THREE.Mesh(geoEncaixe, mat.encaixe);
  encaixe.name = `encaixe-${o.superficie.id}`;
  encaixe.userData.superficie = o.superficie;
  encaixe.userData.soEncaixe = true;
  g.add(encaixe);

  // Laje só de sombra: o sólido que tapa o sol, na tela e no cálculo.
  const geoLaje = new THREE.BoxGeometry(L, FUNDO_RIPA - TOPO_RIPA, C);
  geoLaje.translate(0, -(FUNDO_RIPA + TOPO_RIPA) / 2, C / 2);
  const laje = new THREE.Mesh(geoLaje, mat.soSombra);
  laje.name = `sombra-${o.superficie.id}`;
  laje.castShadow = true;
  laje.userData.sombra = true;
  laje.userData.soSombra = true;
  laje.layers.set(CAMADA_SO_SOMBRA);
  g.add(laje);

  // Telhas: fiadas de canal lado a lado e capas sobre as juntas.
  const fiadas = Math.max(1, Math.round(C / 0.42));
  const passoZ = C / fiadas;
  const colunas = Math.max(1, Math.round(L / 0.235));
  const passoX = L / colunas;
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
  const um = new THREE.Vector3(1, 1, 1);
  const matriz = (x: number, z: number): THREE.Matrix4 => {
    // Assentamento à mão: um nada torta, um nada fora do lugar.
    q.setFromAxisAngle(eixoY, (r() - 0.5) * 0.022);
    return new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 0.006, 0, z + (r() - 0.5) * 0.008), q, um);
  };
  for (let j = 0; j < fiadas; j++) {
    const z = j * passoZ - TRASPASSE;
    for (let i = 0; i <= colunas; i++) {
      mCapas.push(matriz(-L / 2 + i * passoX, z));
      cCapas.push(corDeTelha(r, 1, new THREE.Color()));
    }
    for (let i = 0; i < colunas; i++) {
      mCanais.push(matriz(-L / 2 + (i + 0.5) * passoX, z));
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
  for (let j = 0; j <= fiadas; j++) {
    const z = THREE.MathUtils.clamp(j * passoZ, 0.025, C - 0.025);
    peca(0, -(FUNDO_RIPA + TOPO_RIPA) / 2, z, L, hRipa, 0.05);
  }
  // Ripa dobrada no beiral, que levanta a primeira fiada e serve de testeira.
  peca(0, -FUNDO_RIPA - 0.02, C - 0.0125, L, 0.04, 0.025);
  const nCaibros = Math.max(2, Math.round(L / 0.5) + 1);
  for (let i = 0; i < nCaibros; i++) {
    const x = -L / 2 + 0.045 + (i * (L - 0.09)) / (nCaibros - 1);
    peca(x, -FUNDO_RIPA - o.caibro / 2, C / 2 - 0.01, 0.05, o.caibro, C - 0.02);
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
