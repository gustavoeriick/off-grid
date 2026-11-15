// Sombra para o cálculo: o que a cena informa ao núcleo sobre cada placa (`AmbientePlacas`). Tarefa 3.1.
// Especificação: docs/especificacao/cena-e-interface.md, seções 3 (marcações), 9 e 15.
//
// Os obstáculos são as malhas com `userData.sombra` debaixo do grupo da casa: paredes, lajes, pilares, quartinho
// e as lajes só de sombra dos telhados. A busca percorre a árvore inteira, então alcança também o que o modo de
// visão escondeu (camada 1), como faria um `Raycaster` com `layers.enableAll()`. Telhas, madeiramento, vidros,
// malhas de encaixe, equipamentos e cabos não têm a marca e ficam de fora.
//
// Tudo é calculado em coordenadas da casa: os triângulos dos obstáculos, os pontos da placa e a direção do sol,
// que é trazida do mundo desfazendo o giro da casa. Assim, girar a casa não obriga a refazer os triângulos.
// Os triângulos ficam em uma árvore de caixas envolventes, refeita quando as medidas da casa mudam.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import { estado, normalNoMundo } from '../estado';
import type { AmbientePlacas, Dispositivo, Vec3 } from '../nucleo/tipos';
import { ESPESSURA_PLACA } from './encaixe';

/** Grade de pontos sobre a placa: 5 ao longo da altura, 3 ao longo da largura. */
const PONTOS_NA_ALTURA = 5;
const PONTOS_NA_LARGURA = 3;
/** A grade cobre esta fração de cada lado da placa, centrada. */
const FRACAO_DA_PLACA = 0.9;
/** Distância dos pontos à face da placa, em metros. */
const AFASTAMENTO = 0.02;
/** Céu tapado: pontos na linha central da placa e direções por lado da grade (40 × 40). */
const PONTOS_DO_CEU = 3;
const DIRECOES_POR_LADO = 40;
/** A direção do sol é arredondada a 1/4 de grau (azimute e elevação) para o cache de `sombra`. */
const PASSOS_POR_GRAU = 4;
/** Direções guardadas por placa antes de o cache dela ser esvaziado. */
const LIMITE_DO_CACHE = 20000;
/** Triângulos por folha da árvore. */
const FOLHA = 4;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------- Árvore de caixas envolventes

interface Arvore {
  /** Nove números por triângulo, na ordem das folhas. */
  tri: Float64Array;
  /** Seis números por nó: mínimo e máximo. */
  caixa: Float64Array;
  /** Por nó: primeiro filho (o segundo vem logo depois), ou −1 em folha. */
  filho: Int32Array;
  /** Por nó folha: primeiro triângulo e quantidade. */
  inicio: Int32Array;
  quantos: Int32Array;
  triangulos: number;
  malhas: number;
}

/** Triângulos, em coordenadas de `raiz`, de todas as malhas com `userData.sombra` debaixo dela. */
function colherTriangulos(raiz: THREE.Object3D): { tri: number[]; malhas: number } {
  raiz.updateWorldMatrix(true, true);
  const paraARaiz = new THREE.Matrix4().copy(raiz.matrixWorld).invert();
  const matriz = new THREE.Matrix4();
  const daInstancia = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const tri: number[] = [];
  let malhas = 0;

  const visivel = (o: THREE.Object3D): boolean => {
    for (let x: THREE.Object3D | null = o; x && x !== raiz; x = x.parent) if (!x.visible) return false;
    return true;
  };

  const juntar = (geo: THREE.BufferGeometry, m: THREE.Matrix4): void => {
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const indice = geo.getIndex();
    const n = indice ? indice.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        const j = indice ? indice.getX(i + k) : i + k;
        v.set(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(m);
        tri.push(v.x, v.y, v.z);
      }
    }
  };

  raiz.traverse((o) => {
    if (o.userData.sombra !== true || !(o instanceof THREE.Mesh) || !visivel(o)) return;
    malhas++;
    matriz.multiplyMatrices(paraARaiz, o.matrixWorld);
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, daInstancia);
        juntar(o.geometry, daInstancia.premultiply(matriz));
      }
    } else juntar(o.geometry, matriz);
  });
  return { tri, malhas };
}

function montarArvore(raiz: THREE.Object3D): Arvore {
  const { tri: solto, malhas } = colherTriangulos(raiz);
  const n = solto.length / 9;
  const centro = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 3; e++) centro[t * 3 + e] = (solto[t * 9 + e]! + solto[t * 9 + 3 + e]! + solto[t * 9 + 6 + e]!) / 3;
  }
  const ordem = new Int32Array(n);
  for (let t = 0; t < n; t++) ordem[t] = t;

  const maxNos = Math.max(1, 2 * n);
  const caixa = new Float64Array(maxNos * 6);
  const filho = new Int32Array(maxNos).fill(-1);
  const inicio = new Int32Array(maxNos);
  const quantos = new Int32Array(maxNos);
  let nos = 1;

  const medir = (no: number, de: number, ate: number): void => {
    const c = no * 6;
    caixa[c] = caixa[c + 1] = caixa[c + 2] = Infinity;
    caixa[c + 3] = caixa[c + 4] = caixa[c + 5] = -Infinity;
    for (let i = de; i < ate; i++) {
      const t = ordem[i]! * 9;
      for (let k = 0; k < 9; k++) {
        const e = k % 3;
        const x = solto[t + k]!;
        if (x < caixa[c + e]!) caixa[c + e] = x;
        if (x > caixa[c + 3 + e]!) caixa[c + 3 + e] = x;
      }
    }
  };

  // Divisão pela mediana do centro dos triângulos, no eixo mais comprido da caixa.
  const pilha: [no: number, de: number, ate: number][] = [[0, 0, n]];
  while (pilha.length > 0) {
    const [no, de, ate] = pilha.pop()!;
    medir(no, de, ate);
    inicio[no] = de;
    quantos[no] = ate - de;
    if (ate - de <= FOLHA) continue;
    const c = no * 6;
    let eixo = 0;
    let maior = -1;
    for (let e = 0; e < 3; e++) {
      const lado = caixa[c + 3 + e]! - caixa[c + e]!;
      if (lado > maior) {
        maior = lado;
        eixo = e;
      }
    }
    const trecho = Array.from(ordem.subarray(de, ate)).sort((a, b) => centro[a * 3 + eixo]! - centro[b * 3 + eixo]!);
    ordem.set(trecho, de);
    const meio = (de + ate) >> 1;
    filho[no] = nos;
    pilha.push([nos, de, meio], [nos + 1, meio, ate]);
    nos += 2;
  }

  const tri = new Float64Array(n * 9);
  for (let i = 0; i < n; i++) {
    const t = ordem[i]! * 9;
    for (let k = 0; k < 9; k++) tri[i * 9 + k] = solto[t + k]!;
  }
  return { tri, caixa, filho, inicio, quantos, triangulos: n, malhas };
}

const pilhaDeNos = new Int32Array(128);

/** Verdadeiro se o raio que sai de `o` na direção `d` toca algum triângulo, de qualquer lado. */
function tapado(a: Arvore, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  if (a.triangulos === 0) return false;
  const { tri, caixa, filho, inicio, quantos } = a;
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;
  let topo = 0;
  pilhaDeNos[topo++] = 0;
  while (topo > 0) {
    const no = pilhaDeNos[--topo]!;
    const c = no * 6;
    // Raio contra a caixa, eixo por eixo. Raio paralelo a um eixo só passa se nasce entre as duas faces.
    let t0 = 0;
    let t1 = Infinity;
    if (dx !== 0) {
      const p = (caixa[c]! - ox) * ix;
      const q = (caixa[c + 3]! - ox) * ix;
      t0 = Math.max(t0, Math.min(p, q));
      t1 = Math.min(t1, Math.max(p, q));
    } else if (ox < caixa[c]! || ox > caixa[c + 3]!) continue;
    if (dy !== 0) {
      const p = (caixa[c + 1]! - oy) * iy;
      const q = (caixa[c + 4]! - oy) * iy;
      t0 = Math.max(t0, Math.min(p, q));
      t1 = Math.min(t1, Math.max(p, q));
    } else if (oy < caixa[c + 1]! || oy > caixa[c + 4]!) continue;
    if (dz !== 0) {
      const p = (caixa[c + 2]! - oz) * iz;
      const q = (caixa[c + 5]! - oz) * iz;
      t0 = Math.max(t0, Math.min(p, q));
      t1 = Math.min(t1, Math.max(p, q));
    } else if (oz < caixa[c + 2]! || oz > caixa[c + 5]!) continue;
    if (t0 > t1) continue;

    const f = filho[no]!;
    if (f >= 0) {
      pilhaDeNos[topo++] = f;
      pilhaDeNos[topo++] = f + 1;
      continue;
    }
    const fim = (inicio[no]! + quantos[no]!) * 9;
    for (let t = inicio[no]! * 9; t < fim; t += 9) {
      // Möller–Trumbore, sem descartar a face de trás.
      const ax = tri[t]!;
      const ay = tri[t + 1]!;
      const az = tri[t + 2]!;
      const e1x = tri[t + 3]! - ax;
      const e1y = tri[t + 4]! - ay;
      const e1z = tri[t + 5]! - az;
      const e2x = tri[t + 6]! - ax;
      const e2y = tri[t + 7]! - ay;
      const e2z = tri[t + 8]! - az;
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - ax;
      const sy = oy - ay;
      const sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const w = (dx * qx + dy * qy + dz * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) * inv > 1e-6) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- Placas

interface Guardado {
  /** Dados da placa quando o cache foi feito: se mudam, ele é refeito. */
  itemId: string;
  pos: Vec3;
  quat: readonly number[];
  versao: number;
  /** Pontos da grade, em coordenadas da casa: três números por ponto. */
  pontos: Float64Array;
  /** Fração tapada por direção do sol arredondada. */
  sombras: Map<number, number>;
  ceu: number | null;
}

export interface SombraDasPlacas {
  ambiente: AmbientePlacas;
  /**
   * Avisa que a casa ou os dispositivos mudaram. Os triângulos e os caches só são descartados se as medidas da casa
   * mudaram (girar a casa não muda nada em coordenadas da casa); o cache de cada placa se refaz sozinho quando ela se move.
   */
  invalidar(): void;
  /** Para conferência: quantas malhas e triângulos tapam o sol. */
  resumo(): { malhas: number; triangulos: number };
}

/** `casa` é o grupo que gira com a orientação, pai das malhas da casa e dos equipamentos. */
export function criarSombra(casa: THREE.Object3D): SombraDasPlacas {
  let arvore: Arvore | null = null;
  let versao = 0;
  let medidas = '';
  /** Algo mudou desde a última consulta: as medidas da casa são comparadas de novo. */
  let conferir = true;
  const guardados = new Map<string, Guardado>();

  const q = new THREE.Quaternion();
  const eixoX = new THREE.Vector3();
  const eixoY = new THREE.Vector3();
  const eixoZ = new THREE.Vector3();

  const medidasDaCasa = (): string => JSON.stringify({ ...estado.projeto.casa, orientacaoGraus: 0 });

  function obstaculos(): Arvore {
    if (arvore && !conferir) return arvore;
    conferir = false;
    const agora = medidasDaCasa();
    if (!arvore || agora !== medidas) {
      medidas = agora;
      arvore = montarArvore(casa);
      versao++;
    }
    return arvore;
  }

  function eixosDe(d: Dispositivo): void {
    q.set(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
    eixoX.set(1, 0, 0).applyQuaternion(q);
    eixoY.set(0, 1, 0).applyQuaternion(q);
    eixoZ.set(0, 0, 1).applyQuaternion(q);
  }

  /** Placa encaixada na cena e o cache dela, em dia com a posição dela e com a casa. Nulo se não é placa ou não está encaixada. */
  function placa(uid: string): { d: Dispositivo; g: Guardado; altura: number } | null {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    if (!d || d.superficie === null) return null;
    const item = CATALOGO.get(d.itemId);
    if (!item || item.categoria !== 'placa') return null;
    obstaculos();
    let g = guardados.get(uid);
    const igual =
      g !== undefined && g.versao === versao && g.itemId === d.itemId &&
      g.pos[0] === d.pos[0] && g.pos[1] === d.pos[1] && g.pos[2] === d.pos[2] &&
      g.quat[0] === d.quat[0] && g.quat[1] === d.quat[1] && g.quat[2] === d.quat[2] && g.quat[3] === d.quat[3];
    if (!g || !igual) {
      eixosDe(d);
      const pontos = new Float64Array(PONTOS_NA_ALTURA * PONTOS_NA_LARGURA * 3);
      const z = ESPESSURA_PLACA / 2 + AFASTAMENTO;
      let k = 0;
      for (let i = 0; i < PONTOS_NA_ALTURA; i++) {
        const y = (i / (PONTOS_NA_ALTURA - 1) - 0.5) * FRACAO_DA_PLACA * item.altura;
        for (let j = 0; j < PONTOS_NA_LARGURA; j++) {
          const x = (j / (PONTOS_NA_LARGURA - 1) - 0.5) * FRACAO_DA_PLACA * item.largura;
          pontos[k++] = d.pos[0] + eixoX.x * x + eixoY.x * y + eixoZ.x * z;
          pontos[k++] = d.pos[1] + eixoX.y * x + eixoY.y * y + eixoZ.y * z;
          pontos[k++] = d.pos[2] + eixoX.z * x + eixoY.z * y + eixoZ.z * z;
        }
      }
      g = { itemId: d.itemId, pos: [d.pos[0], d.pos[1], d.pos[2]], quat: [...d.quat], versao, pontos, sombras: new Map(), ceu: null };
      guardados.set(uid, g);
    }
    return { d, g, altura: item.altura };
  }

  function sombra(uid: string, direcaoSol: Vec3): number {
    const p = placa(uid);
    if (!p) return 0;
    // Direção do sol em coordenadas da casa: desfaz o giro do grupo, que é π − orientação em torno de Y.
    const giro = Math.PI - estado.projeto.casa.orientacaoGraus * RAD;
    const lx = direcaoSol[0] * Math.cos(giro) - direcaoSol[2] * Math.sin(giro);
    const lz = direcaoSol[0] * Math.sin(giro) + direcaoSol[2] * Math.cos(giro);
    const el = Math.round((Math.asin(Math.max(-1, Math.min(1, direcaoSol[1]))) / RAD) * PASSOS_POR_GRAU);
    const az = Math.round((Math.atan2(lx, -lz) / RAD) * PASSOS_POR_GRAU);
    const chave = (az + 180 * PASSOS_POR_GRAU) * 4096 + (el + 90 * PASSOS_POR_GRAU);
    const pronto = p.g.sombras.get(chave);
    if (pronto !== undefined) return pronto;

    // O raio usa a direção arredondada, para o resultado não depender de quem perguntou primeiro.
    const e = (el / PASSOS_POR_GRAU) * RAD;
    const a = (az / PASSOS_POR_GRAU) * RAD;
    const dx = Math.sin(a) * Math.cos(e);
    const dy = Math.sin(e);
    const dz = -Math.cos(a) * Math.cos(e);
    const arv = obstaculos();
    const pontos = p.g.pontos;
    let tapados = 0;
    for (let k = 0; k < pontos.length; k += 3) {
      if (tapado(arv, pontos[k]!, pontos[k + 1]!, pontos[k + 2]!, dx, dy, dz)) tapados++;
    }
    const fracao = tapados / (pontos.length / 3);
    if (p.g.sombras.size >= LIMITE_DO_CACHE) p.g.sombras.clear();
    p.g.sombras.set(chave, fracao);
    return fracao;
  }

  function ceuTapado(uid: string): number {
    const p = placa(uid);
    if (!p) return 0;
    if (p.g.ceu !== null) return p.g.ceu;
    const arv = obstaculos();
    eixosDe(p.d);
    const z = ESPESSURA_PLACA / 2 + AFASTAMENTO;
    let ceu = 0;
    let tapados = 0;
    for (let m = 0; m < PONTOS_DO_CEU; m++) {
      const y = (m / (PONTOS_DO_CEU - 1) - 0.5) * FRACAO_DA_PLACA * p.altura;
      const ox = p.d.pos[0] + eixoY.x * y + eixoZ.x * z;
      const oy = p.d.pos[1] + eixoY.y * y + eixoZ.y * z;
      const oz = p.d.pos[2] + eixoY.z * y + eixoZ.z * z;
      for (let i = 0; i < DIRECOES_POR_LADO; i++) {
        // Peso de cosseno em torno da normal: raio √u no disco, altura √(1 − u).
        const u = (i + 0.5) / DIRECOES_POR_LADO;
        const r = Math.sqrt(u);
        const h = Math.sqrt(1 - u);
        for (let j = 0; j < DIRECOES_POR_LADO; j++) {
          const fi = (2 * Math.PI * (j + 0.5)) / DIRECOES_POR_LADO;
          const cx = r * Math.cos(fi);
          const cy = r * Math.sin(fi);
          const dy = cx * eixoX.y + cy * eixoY.y + h * eixoZ.y;
          if (dy <= 0) continue; // esta direção enxerga o chão, não o céu
          ceu++;
          const dx = cx * eixoX.x + cy * eixoY.x + h * eixoZ.x;
          const dz = cx * eixoX.z + cy * eixoY.z + h * eixoZ.z;
          if (tapado(arv, ox, oy, oz, dx, dy, dz)) tapados++;
        }
      }
    }
    p.g.ceu = ceu > 0 ? tapados / ceu : 0;
    return p.g.ceu;
  }

  return {
    ambiente: {
      normal(uid) {
        const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
        return d ? normalNoMundo(d.quat, estado.projeto.casa.orientacaoGraus) : [0, 1, 0];
      },
      sombra,
      ceuTapado,
    },
    invalidar() {
      // As medidas são comparadas na próxima consulta (`obstaculos`), depois de a casa ter sido refeita.
      // Aqui só saem os caches das placas que não existem mais.
      conferir = true;
      if (guardados.size === 0) return;
      const vivos = new Set(estado.projeto.dispositivos.map((d) => d.uid));
      for (const uid of [...guardados.keys()]) if (!vivos.has(uid)) guardados.delete(uid);
    },
    resumo() {
      const a = obstaculos();
      return { malhas: a.malhas, triangulos: a.triangulos };
    },
  };
}
