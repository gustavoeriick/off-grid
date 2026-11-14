// Montagem de malhas à mão e marcações que o arraste e o cálculo de sombra leem.
// Especificação: docs/especificacao/cena-e-interface.md, seção 3 (marcações e modos de visão).

import * as THREE from 'three';

export type P3 = readonly [number, number, number];

export type TipoSuperficie = 'telhado' | 'parede' | 'piso';

export interface Marca {
  id: string;
  tipo: TipoSuperficie;
}

/**
 * Camada das malhas que não são desenhadas mas continuam no mapa de sombra.
 * A câmera da tela só enxerga a camada 0; a câmera de sombra do sol enxerga todas.
 * Um `Raycaster` comum também só enxerga a camada 0, então o que está aqui não recebe clique.
 * O cálculo de sombra (fase 3) precisa de `raycaster.layers.enableAll()` para alcançar estas malhas.
 */
export const CAMADA_SO_SOMBRA = 1;

/** Malha sólida: projeta e recebe sombra na tela e tapa o sol no cálculo. */
export function marcarSolido<T extends THREE.Mesh>(m: T, superficie?: Marca): T {
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.sombra = true;
  if (superficie) m.userData.superficie = superficie;
  return m;
}

/**
 * Esconde ou mostra tudo o que está debaixo de `raiz`, sem tirar a sombra:
 * o que é escondido passa para a camada só de sombra e ganha `userData.escondido = true`.
 */
export function esconder(raiz: THREE.Object3D, escondido: boolean): void {
  raiz.traverse((o) => {
    o.userData.escondido = escondido;
    if (o.userData.soSombra) return; // já vive na camada só de sombra
    o.layers.set(escondido ? CAMADA_SO_SOMBRA : 0);
  });
}

/** Gerador determinístico de números entre 0 e 1 (mulberry32), para a casa não mudar a cada reconstrução. */
export function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FaceCaixa = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/**
 * Junta quadriláteros em uma geometria só, separados em faixas de material.
 * As coordenadas de textura saem em metros (projeção plana pelo eixo dominante da normal),
 * de modo que a textura tem o mesmo tamanho em qualquer peça.
 */
export class Construtor {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly faixaDoVertice: number[] = [];
  private readonly indices: number[][] = [];

  private vertice(p: P3, n: THREE.Vector3, faixa: number): number {
    const i = this.pos.length / 3;
    this.faixaDoVertice.push(faixa);
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n.x, n.y, n.z);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ay >= ax && ay >= az) this.uv.push(p[0], p[2]);
    else if (ax >= az) this.uv.push(p[2], p[1]);
    else this.uv.push(p[0], p[1]);
    return i;
  }

  private faixa(i: number): number[] {
    while (this.indices.length <= i) this.indices.push([]);
    return this.indices[i]!;
  }

  /** Quadrilátero a, b, c, d em sentido anti-horário para quem o vê de frente. */
  quad(a: P3, b: P3, c: P3, d: P3, faixa = 0): void {
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      .cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]))
      .normalize();
    const i0 = this.vertice(a, n, faixa);
    const i1 = this.vertice(b, n, faixa);
    const i2 = this.vertice(c, n, faixa);
    const i3 = this.vertice(d, n, faixa);
    this.faixa(faixa).push(i0, i1, i2, i0, i2, i3);
  }

  /** Triângulo a, b, c em sentido anti-horário para quem o vê de frente. */
  tri(a: P3, b: P3, c: P3, faixa = 0): void {
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      .cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]))
      .normalize();
    this.faixa(faixa).push(this.vertice(a, n, faixa), this.vertice(b, n, faixa), this.vertice(c, n, faixa));
  }

  /** Caixa entre dois cantos. `faces` troca a faixa de uma face, ou a omite com `null`. */
  caixa(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    faixa = 0,
    faces: Partial<Record<FaceCaixa, number | null>> = {},
  ): void {
    if (x1 - x0 <= 1e-6 || y1 - y0 <= 1e-6 || z1 - z0 <= 1e-6) return;
    const f = (nome: FaceCaixa): number | null => (nome in faces ? faces[nome]! : faixa);
    let s = f('px');
    if (s !== null) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], s);
    s = f('nx');
    if (s !== null) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], s);
    s = f('py');
    if (s !== null) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], s);
    s = f('ny');
    if (s !== null) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], s);
    s = f('pz');
    if (s !== null) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s);
    s = f('nz');
    if (s !== null) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], s);
  }

  get vazio(): boolean {
    return this.pos.length === 0;
  }

  geometria(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const todos: number[] = [];
    this.indices.forEach((lista, faixa) => {
      if (lista.length === 0) return;
      g.addGroup(todos.length, lista.length, faixa);
      for (const i of lista) todos.push(i);
    });
    g.setIndex(todos);
    return g;
  }

  /** Malha pronta. Com uma lista de materiais, cada faixa usa o material de mesmo índice. */
  malha(material: THREE.Material | THREE.Material[]): THREE.Mesh {
    return new THREE.Mesh(this.geometria(), material);
  }

  /**
   * Malha de um material só (com `vertexColors`), em que cada faixa recebe uma cor.
   * É desenhada de uma vez, em vez de uma vez por faixa.
   */
  malhaColorida(material: THREE.Material, cores: readonly THREE.Color[]): THREE.Mesh {
    const g = this.geometria();
    g.clearGroups();
    const cor = new Float32Array(this.faixaDoVertice.length * 3);
    this.faixaDoVertice.forEach((faixa, i) => {
      const c = cores[faixa] ?? cores[0]!;
      cor[i * 3] = c.r;
      cor[i * 3 + 1] = c.g;
      cor[i * 3 + 2] = c.b;
    });
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    return new THREE.Mesh(g, material);
  }
}
