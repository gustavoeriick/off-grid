// Montagem dos modelos dos equipamentos: formas simples juntadas em poucas malhas, com a cor nos vértices.
// Especificação: docs/especificacao/fase-2.md, seção 2 (no máximo 3.000 triângulos por peça, geometria compartilhada).
//
// Cada modelo usa até quatro "tintas" (materiais compartilhados por todas as peças) e, à parte, estampas:
// retângulos com textura desenhada em canvas (células da placa, visor, etiqueta).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** `plastico`: fosco com leve brilho. `metal`: brilho de metal. `luz`: aceso, não recebe sombra. `vidro`: transparente. */
export type Tinta = 'plastico' | 'metal' | 'luz' | 'vidro';
export type V3 = readonly [number, number, number];
export type Eixo = 'x' | 'y' | 'z';
export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

const tintas = new Map<Tinta, THREE.Material>();

/** Material compartilhado de uma tinta. A cor de cada parte vai nos vértices. */
export function tinta(t: Tinta): THREE.Material {
  let m = tintas.get(t);
  if (!m) {
    if (t === 'plastico') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
    else if (t === 'metal') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.35 });
    else if (t === 'luz') m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    else {
      m = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
      });
    }
    tintas.set(t, m);
  }
  return m;
}

export function liberarTintas(): void {
  for (const m of tintas.values()) m.dispose();
  tintas.clear();
}

const cores = new Map<string, THREE.Color>();
function corDe(hex: string): THREE.Color {
  let c = cores.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    cores.set(hex, c);
  }
  return c;
}

interface Parte {
  pos: number[];
  nor: number[];
  cor: number[];
}

const matriz = new THREE.Matrix4();
const normalM = new THREE.Matrix3();
const v = new THREE.Vector3();

const GIRO_DA_FACE: Record<Face, [eixo: Eixo, angulo: number]> = {
  pz: ['y', 0],
  nz: ['y', Math.PI],
  px: ['y', Math.PI / 2],
  nx: ['y', -Math.PI / 2],
  py: ['x', -Math.PI / 2],
  ny: ['x', Math.PI / 2],
};

/** Junta formas em um grupo com uma malha por tinta. Coordenadas da peça: X à direita, Y para cima, Z para a frente. */
export class Molde {
  private readonly partes = new Map<Tinta, Parte>();
  private readonly objetos: THREE.Object3D[] = [];
  private readonly filhos: { nome: string; molde: Molde; pos: V3; giroX: number }[] = [];
  /** Triângulos deste molde e dos filhos. */
  triangulos = 0;

  /** Acrescenta uma geometria qualquer, já posicionada por `m`. A geometria é consumida. */
  geo(t: Tinta, cor: string, g: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const solta = g.index ? g.toNonIndexed() : g;
    const p = solta.getAttribute('position');
    const n = solta.getAttribute('normal');
    let parte = this.partes.get(t);
    if (!parte) {
      parte = { pos: [], nor: [], cor: [] };
      this.partes.set(t, parte);
    }
    if (m) normalM.getNormalMatrix(m);
    const c = corDe(cor);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (m) v.applyMatrix4(m);
      parte.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i);
      if (m) v.applyMatrix3(normalM).normalize();
      parte.nor.push(v.x, v.y, v.z);
      parte.cor.push(c.r, c.g, c.b);
    }
    this.triangulos += p.count / 3;
    if (solta !== g) solta.dispose();
    g.dispose();
    return this;
  }

  /** Caixa entre dois cantos. */
  caixa(t: Tinta, cor: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    return this.bloco(t, cor, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  }

  /** Caixa pelo centro e pelas medidas. Com `raio`, as quinas são arredondadas. `giro` gira em torno de um eixo, pelo centro. */
  bloco(t: Tinta, cor: string, cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, raio = 0, giro?: [Eixo, number]): this {
    const r = Math.min(raio, lx / 2, ly / 2, lz / 2);
    const g = r > 0.0005 ? new RoundedBoxGeometry(lx, ly, lz, 1, r) : new THREE.BoxGeometry(lx, ly, lz);
    matriz.identity();
    if (giro) girar(matriz, giro[0], giro[1]);
    matriz.setPosition(cx, cy, cz);
    return this.geo(t, cor, g, matriz);
  }

  /** Cilindro ao longo de `eixo`, centrado. `raio` vale na ponta negativa do eixo e `raio2` na positiva. */
  cilindro(t: Tinta, cor: string, cx: number, cy: number, cz: number, raio: number, comp: number, eixo: Eixo = 'y', seg = 12, raio2 = raio): this {
    const g = new THREE.CylinderGeometry(raio2, raio, comp, seg);
    matriz.identity();
    if (eixo === 'x') matriz.makeRotationZ(-Math.PI / 2);
    else if (eixo === 'z') matriz.makeRotationX(Math.PI / 2);
    matriz.setPosition(cx, cy, cz);
    return this.geo(t, cor, g, matriz);
  }

  /** Esfera, que pode ser achatada por `escala`. */
  esfera(t: Tinta, cor: string, cx: number, cy: number, cz: number, raio: number, escala: V3 = [1, 1, 1], seg = 10): this {
    const g = new THREE.SphereGeometry(raio, seg, Math.max(4, Math.round(seg * 0.7)));
    matriz.makeScale(escala[0], escala[1], escala[2]).setPosition(cx, cy, cz);
    return this.geo(t, cor, g, matriz);
  }

  /** Anel em volta de `eixo`. */
  toro(t: Tinta, cor: string, cx: number, cy: number, cz: number, raio: number, tubo: number, eixo: Eixo = 'z', seg = 20, segTubo = 5): this {
    const g = new THREE.TorusGeometry(raio, tubo, segTubo, seg);
    matriz.identity();
    if (eixo === 'x') matriz.makeRotationY(Math.PI / 2);
    else if (eixo === 'y') matriz.makeRotationX(Math.PI / 2);
    matriz.setPosition(cx, cy, cz);
    return this.geo(t, cor, g, matriz);
  }

  /** Tubo por uma curva suave que passa pelos pontos (fio, alça, cano). */
  tubo(t: Tinta, cor: string, pontos: readonly V3[], raio: number, seg = 5, trechos = pontos.length * 3): this {
    const curva = new THREE.CatmullRomCurve3(pontos.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    return this.geo(t, cor, new THREE.TubeGeometry(curva, trechos, raio, seg, false));
  }

  /** Retângulo com textura, virado para `face`, com o centro no ponto dado. */
  estampa(material: THREE.Material, cx: number, cy: number, cz: number, largura: number, altura: number, face: Face = 'pz', giroNoPlano = 0): this {
    const g = new THREE.PlaneGeometry(largura, altura);
    if (giroNoPlano) g.rotateZ(giroNoPlano);
    const [eixo, angulo] = GIRO_DA_FACE[face];
    if (eixo === 'y') g.rotateY(angulo);
    else g.rotateX(angulo);
    g.translate(cx, cy, cz);
    const malha = new THREE.Mesh(g, material);
    malha.receiveShadow = true;
    this.objetos.push(malha);
    this.triangulos += 2;
    return this;
  }

  /** Parte separada, com nome, que a camada de dispositivos acha depois: hélice, o que acende, o que apaga. Pode nascer girada em torno de X. */
  filho(nome: string, pos: V3 = [0, 0, 0], giroX = 0): Molde {
    const molde = new Molde();
    this.filhos.push({ nome, molde, pos, giroX });
    return molde;
  }

  montar(): THREE.Group {
    const grupo = new THREE.Group();
    for (const [t, parte] of this.partes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(parte.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(parte.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(parte.cor, 3));
      const malha = new THREE.Mesh(g, tinta(t));
      malha.name = t;
      malha.castShadow = t === 'plastico' || t === 'metal';
      malha.receiveShadow = t !== 'luz';
      if (t === 'vidro') malha.renderOrder = 2;
      grupo.add(malha);
    }
    for (const o of this.objetos) grupo.add(o);
    for (const f of this.filhos) {
      const g = f.molde.montar();
      g.name = f.nome;
      g.position.set(f.pos[0], f.pos[1], f.pos[2]);
      g.rotation.x = f.giroX;
      grupo.add(g);
      this.triangulos += f.molde.triangulos;
    }
    return grupo;
  }
}

function girar(m: THREE.Matrix4, eixo: Eixo, angulo: number): void {
  if (eixo === 'x') m.makeRotationX(angulo);
  else if (eixo === 'y') m.makeRotationY(angulo);
  else m.makeRotationZ(angulo);
}
