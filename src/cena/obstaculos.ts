// Obstáculos que fazem sombra em volta da casa: muro, casa ou prédio vizinho e árvore. Tarefa 5.2.
//
// São filhos do grupo da casa (giram com ela, em coordenadas da casa) e vêm de `estado.projeto.obstaculos`.
// Toda malha sólida leva `userData.sombra = true`: o cálculo de sombra das placas (sombra.ts) recolhe os triângulos
// delas junto com os da casa. A copa da árvore tapa o sol como um sólido: é uma simplificação (uma copa de verdade
// deixa passar um pouco de luz). Janelas e porta do vizinho são só pintura.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { estado } from '../estado';
import type { Obstaculo } from '../nucleo/tipos';
import { Construtor, marcarSolido, sorteio } from './malha';
import { mat } from './materiais';
import { raioDoTronco } from './regrasDosObstaculos';

export interface CamadaDeObstaculos {
  /** Refaz o que mudou em `estado.projeto.obstaculos`. */
  atualizar(): void;
  destruir(): void;
}

/** Acima desta altura o vizinho é um prédio de laje; até ela, casa ou sobrado com telhado de duas águas. */
const ALTURA_DE_PREDIO = 9;

/** Tons neutros do vizinho, diferentes do branco da casa do projeto: parede, barrado. */
const TONS_DO_VIZINHO: [string, string][] = [
  ['#cdc6b8', '#a59c8c'],
  ['#c3c7c9', '#959b9f'],
  ['#d6c9b0', '#ab9a7c'],
  ['#bfc4b4', '#939a86'],
];

function numeroDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Textura das telhas do vizinho: fiadas ao longo da queda, em metros (0,4 m por repetição). */
function texturaDeTelhas(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // Canais (sombra) e capas (luz), no sentido da queda.
  for (let i = 0; i < 4; i++) {
    const x = i * 32;
    const grad = g.createLinearGradient(x, 0, x + 32, 0);
    grad.addColorStop(0, '#8f8f8f');
    grad.addColorStop(0.3, '#f4f4f4');
    grad.addColorStop(0.7, '#dcdcdc');
    grad.addColorStop(1, '#8f8f8f');
    g.fillStyle = grad;
    g.fillRect(x, 0, 32, 128);
  }
  // Encontro das fiadas.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let j = 0; j < 4; j++) g.fillRect(0, j * 32, 128, 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.8, 1 / 0.8);
  t.anisotropy = 4;
  return t;
}

export function criarCamadaDeObstaculos(casa: THREE.Group): CamadaDeObstaculos {
  const camada = new THREE.Group();
  camada.name = 'obstaculos';
  casa.add(camada);

  const texTelhas = texturaDeTelhas();
  const matTelhado = new THREE.MeshLambertMaterial({ color: '#8f4f3c', map: texTelhas });
  const matPintura = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matVidro = new THREE.MeshStandardMaterial({ color: '#50697c', roughness: 0.18, metalness: 0.1 });
  const matCasca = new THREE.MeshLambertMaterial({ color: '#6a4a33' });
  const matFolhas = new THREE.MeshLambertMaterial({ vertexColors: true });

  interface Feito {
    grupo: THREE.Group;
    forma: string;
  }
  const feitos = new Map<string, Feito>();

  function solido(malha: THREE.Mesh, uid: string, nome: string): THREE.Mesh {
    malha.name = nome;
    malha.userData.obstaculo = uid;
    return marcarSolido(malha);
  }

  // ---------------------------------------------------------------- Muro

  /** Alvenaria rebocada com pilaretes a cada 3 m, mais ou menos, e chapim de concreto por cima. */
  function construirMuro(o: Obstaculo): THREE.Object3D[] {
    const L = o.largura / 2;
    const P = o.profundidade / 2;
    const chapim = Math.min(0.07, o.altura * 0.1);
    const topo = o.altura - chapim;
    const c = new Construtor();
    const barrado = Math.min(0.45, topo * 0.3);
    c.caixa(-L, 0, -P, L, barrado, P, 1, { ny: null, py: null });
    c.caixa(-L, barrado, -P, L, topo, P, 0, { ny: null, py: null });
    // Pilaretes, 3 cm para fora de cada face.
    if (o.largura >= 1.2) {
      const vaos = Math.max(1, Math.round(o.largura / 3));
      const meio = Math.min(0.12, o.largura / 8);
      for (let i = 0; i <= vaos; i++) {
        const x = THREE.MathUtils.clamp(-L + (o.largura * i) / vaos, -L + meio, L - meio);
        c.caixa(x - meio, 0, -P - 0.03, x + meio, topo, P + 0.03, 3, { ny: null, py: null });
      }
    }
    c.caixa(-L - 0.03, topo, -P - 0.05, L + 0.03, o.altura, P + 0.05, 2);
    const cores = [new THREE.Color('#d9d4c8'), new THREE.Color('#b5ac9a'), new THREE.Color('#aaa69c'), new THREE.Color('#d2ccbf')];
    return [solido(c.malhaColorida(mat.reboco, cores), o.uid, 'muro')];
  }

  // ---------------------------------------------------------------- Vizinho

  /** Janelas e porta pintadas em uma fachada: moldura clara e vidro escuro, 2 cm para fora da parede. */
  function pintarFachada(
    moldura: Construtor, vidro: Construtor, comprimento: number, andares: number, peDireito: number, comPorta: boolean,
    ponto: (ao: number, y: number, fora: number) => [number, number, number],
  ): void {
    if (comprimento < 1.6 || peDireito < 1.9) return;
    const vaos = Math.max(1, Math.floor(comprimento / 2.8));
    const lj = Math.min(1.3, (comprimento / vaos) * 0.5);
    const hj = Math.min(1.15, peDireito * 0.42);
    const retangulo = (c: Construtor, a0: number, a1: number, y0: number, y1: number, fora: number, faixa: number): void => {
      c.quad(ponto(a0, y0, fora), ponto(a1, y0, fora), ponto(a1, y1, fora), ponto(a0, y1, fora), faixa);
    };
    for (let andar = 0; andar < andares; andar++) {
      const y = andar * peDireito;
      for (let i = 0; i < vaos; i++) {
        const meio = -comprimento / 2 + (comprimento * (i + 0.5)) / vaos;
        const porta = comPorta && andar === 0 && i === Math.floor(vaos / 2);
        if (porta) {
          const lp = Math.min(0.9, comprimento * 0.3);
          const hp = Math.min(2.1, peDireito * 0.8);
          retangulo(moldura, meio - lp / 2 - 0.06, meio + lp / 2 + 0.06, 0, hp + 0.06, 0.012, 0);
          retangulo(moldura, meio - lp / 2, meio + lp / 2, 0, hp, 0.02, 1);
          continue;
        }
        const y0 = y + Math.min(1.0, peDireito * 0.36);
        retangulo(moldura, meio - lj / 2 - 0.07, meio + lj / 2 + 0.07, y0 - 0.07, y0 + hj + 0.07, 0.012, 0);
        // Duas folhas de vidro, com o montante da moldura no meio.
        retangulo(vidro, meio - lj / 2, meio - 0.02, y0, y0 + hj, 0.02, 0);
        retangulo(vidro, meio + 0.02, meio + lj / 2, y0, y0 + hj, 0.02, 0);
        // Peitoril.
        retangulo(moldura, meio - lj / 2 - 0.1, meio + lj / 2 + 0.1, y0 - 0.12, y0 - 0.07, 0.03, 2);
      }
    }
  }

  /** Casa, sobrado ou prédio simples: paredes em tom neutro, janelas pintadas e telhado de duas águas ou laje. */
  function construirVizinho(o: Obstaculo): THREE.Object3D[] {
    const L = o.largura / 2;
    const P = o.profundidade / 2;
    const predio = o.altura > ALTURA_DE_PREDIO;
    const [tomParede, tomBarrado] = TONS_DO_VIZINHO[numeroDe(o.uid) % TONS_DO_VIZINHO.length]!;
    const paredes = new Construtor();
    const telhado = new Construtor();
    let hParede: number;

    if (predio) {
      // Laje com platibanda: a mureta sobe até a altura total.
      const platibanda = 0.9;
      hParede = o.altura - platibanda;
      const e = Math.min(0.15, L / 2, P / 2);
      paredes.caixa(-L, hParede, -P, L, o.altura, -P + e, 0, { ny: null });
      paredes.caixa(-L, hParede, P - e, L, o.altura, P, 0, { ny: null });
      paredes.caixa(-L, hParede, -P + e, -L + e, o.altura, P - e, 0, { ny: null });
      paredes.caixa(L - e, hParede, -P + e, L, o.altura, P - e, 0, { ny: null });
      paredes.caixa(-L + e, hParede - 0.02, -P + e, L - e, hParede + 0.02, P - e, 2, { ny: null });
    } else {
      // Duas águas, com a cumeeira ao longo da largura, na altura total.
      const subida = Math.min(P * 0.45, o.altura * 0.3);
      hParede = o.altura - subida;
      const s = subida / P;
      const beiral = Math.min(0.45, L * 0.2, P * 0.2);
      const esp = Math.min(0.12, o.altura * 0.05);
      const xb = L + beiral;
      const zb = P + beiral;
      const yb = o.altura - zb * s;
      for (const lado of [1, -1]) {
        const z = lado * zb;
        const cume: [number, number, number][] = [[-xb, o.altura, 0], [xb, o.altura, 0]];
        const beira: [number, number, number][] = [[-xb, yb, z], [xb, yb, z]];
        const baixo = (p: [number, number, number]): [number, number, number] => [p[0], p[1] - esp, p[2]];
        if (lado === 1) {
          telhado.quad(beira[0]!, beira[1]!, cume[1]!, cume[0]!, 0);
          telhado.quad(baixo(beira[1]!), baixo(beira[0]!), baixo(cume[0]!), baixo(cume[1]!), 1);
          telhado.quad(baixo(beira[0]!), baixo(beira[1]!), beira[1]!, beira[0]!, 1);
        } else {
          telhado.quad(beira[1]!, beira[0]!, cume[0]!, cume[1]!, 0);
          telhado.quad(baixo(beira[0]!), baixo(beira[1]!), baixo(cume[1]!), baixo(cume[0]!), 1);
          telhado.quad(baixo(beira[1]!), baixo(beira[0]!), beira[0]!, beira[1]!, 1);
        }
        // Topos das águas nas duas laterais.
        for (const sx of [1, -1]) {
          const a: [number, number, number] = [sx * xb, o.altura, 0];
          const b: [number, number, number] = [sx * xb, yb, z];
          if (sx * lado === 1) telhado.quad(baixo(a), a, b, baixo(b), 1);
          else telhado.quad(baixo(b), b, a, baixo(a), 1);
        }
      }
      // Oitões: fecham as laterais entre o topo da parede e as águas.
      for (const sx of [1, -1]) {
        const x = sx * L;
        const a: [number, number, number] = [x, hParede, P];
        const b: [number, number, number] = [x, hParede, -P];
        const c: [number, number, number] = [x, o.altura - 0.01, 0];
        if (sx === 1) paredes.tri(a, b, c, 0);
        else paredes.tri(b, a, c, 0);
      }
    }
    const barrado = Math.min(0.6, hParede * 0.25);
    paredes.caixa(-L, 0, -P, L, barrado, P, 1, { ny: null, py: null });
    paredes.caixa(-L, barrado, -P, L, hParede, P, 0, { ny: null, py: predio ? null : 0 });

    const partes: THREE.Object3D[] = [
      solido(paredes.malhaColorida(mat.reboco, [new THREE.Color(tomParede), new THREE.Color(tomBarrado), new THREE.Color('#9d9b95')]), o.uid, 'vizinho-paredes'),
    ];
    if (!telhado.vazio) {
      partes.push(solido(telhado.malha([matTelhado, mat.madeiramento]), o.uid, 'vizinho-telhado'));
    }

    // Pintura: janelas em todos os andares das quatro fachadas e a porta na da frente (+Z).
    const andares = Math.max(1, Math.round(hParede / 2.9));
    const pd = hParede / andares;
    const moldura = new Construtor();
    const vidro = new Construtor();
    pintarFachada(moldura, vidro, o.largura, andares, pd, true, (ao, y, fora) => [ao, y, P + fora]);
    pintarFachada(moldura, vidro, o.largura, andares, pd, false, (ao, y, fora) => [-ao, y, -P - fora]);
    pintarFachada(moldura, vidro, o.profundidade, andares, pd, false, (ao, y, fora) => [L + fora, y, -ao]);
    pintarFachada(moldura, vidro, o.profundidade, andares, pd, false, (ao, y, fora) => [-L - fora, y, ao]);
    if (!moldura.vazio) {
      const m = moldura.malhaColorida(matPintura, [new THREE.Color('#f1efe8'), new THREE.Color('#6e4c33'), new THREE.Color('#a8a49a')]);
      m.name = 'vizinho-molduras';
      m.receiveShadow = true;
      partes.push(m);
    }
    if (!vidro.vazio) {
      const m = vidro.malha(matVidro);
      m.name = 'vizinho-vidros';
      m.receiveShadow = true;
      partes.push(m);
    }
    return partes;
  }

  // ---------------------------------------------------------------- Árvore

  /** Tronco que afina para cima e copa feita de vários tufos arredondados, com o diâmetro e a altura pedidos. */
  function construirArvore(o: Obstaculo): THREE.Object3D[] {
    const sortear = sorteio(numeroDe(o.uid) ^ 0x51f3);
    const R = o.largura / 2;
    const hCopa = THREE.MathUtils.clamp(o.largura * 0.85, o.altura * 0.35, o.altura * 0.78);
    const base = o.altura - hCopa;
    const r = Math.min(raioDoTronco(o.altura), R * 0.6);

    // Tronco: entra um terço na copa.
    const hTronco = base + hCopa * 0.35;
    const tronco = new THREE.CylinderGeometry(r * 0.55, r, hTronco, 9, 1);
    tronco.translate(0, hTronco / 2, 0);
    const galhos: THREE.BufferGeometry[] = [tronco];
    // Raízes: um alargamento curto no pé.
    const pe = new THREE.CylinderGeometry(r, r * 1.45, Math.min(0.35, hTronco * 0.2), 9, 1);
    pe.translate(0, Math.min(0.35, hTronco * 0.2) / 2, 0);
    galhos.push(pe);

    // Copa: um tufo no meio, um no alto e uma coroa de tufos em volta, cada um amassado por um ruído suave.
    const tufos: THREE.BufferGeometry[] = [];
    const cor = new THREE.Color();
    const verdes = ['#3d7a36', '#4b8b3f', '#356d33', '#57953f'];
    const tufo = (cx: number, cy: number, cz: number, rx: number, ry: number, tom: string): void => {
      const g = new THREE.IcosahedronGeometry(1, 3);
      const pos = g.getAttribute('position');
      const fase = sortear() * 20;
      const cores = new Float32Array(pos.count * 3);
      // A normal é a do elipsoide liso: a luz corre macia pelo tufo, sem facetas.
      const normais = new Float32Array(pos.count * 3);
      const n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const ruido = 1 + 0.16 * Math.sin(x * 4.1 + fase) * Math.cos(z * 3.7 - fase) + 0.1 * Math.sin(y * 5.3 + fase * 1.7);
        pos.setXYZ(i, cx + x * rx * ruido, cy + y * ry * ruido, cz + z * rx * ruido);
        n.set(x / rx, y / ry, z / rx).normalize();
        normais[i * 3] = n.x;
        normais[i * 3 + 1] = n.y;
        normais[i * 3 + 2] = n.z;
        // Mais escuro por baixo, mais claro no alto, onde bate o sol.
        cor.set(tom).multiplyScalar(0.72 + 0.36 * (y * 0.5 + 0.5));
        cores[i * 3] = cor.r;
        cores[i * 3 + 1] = cor.g;
        cores[i * 3 + 2] = cor.b;
      }
      g.deleteAttribute('uv');
      g.setAttribute('normal', new THREE.BufferAttribute(normais, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
      tufos.push(g);
    };
    tufo(0, 0, 0, 0.62, 0.42, verdes[0]!);
    tufo(0.08, 0.3, -0.05, 0.42, 0.3, verdes[3]!);
    tufo(-0.2, 0.24, 0.16, 0.3, 0.22, verdes[1]!);
    const emVolta = 7;
    for (let i = 0; i < emVolta; i++) {
      const a = (i / emVolta) * Math.PI * 2 + sortear() * 0.5;
      const d = 0.46 + sortear() * 0.1;
      tufo(Math.cos(a) * d, -0.12 + sortear() * 0.26, Math.sin(a) * d, 0.4 + sortear() * 0.1, 0.27 + sortear() * 0.08, verdes[1 + (i % 3)]!);
    }
    const copa = mergeGeometries(tufos);
    tufos.forEach((g) => g.dispose());
    // A copa ocupa exatamente o diâmetro pedido e vai da base dela até a altura total.
    copa.computeBoundingBox();
    const caixa = copa.boundingBox!;
    const meiaX = Math.max(Math.abs(caixa.min.x), Math.abs(caixa.max.x), Math.abs(caixa.min.z), Math.abs(caixa.max.z));
    const pos = copa.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (pos.getX(i) / meiaX) * R, base + ((pos.getY(i) - caixa.min.y) / (caixa.max.y - caixa.min.y)) * hCopa, (pos.getZ(i) / meiaX) * R);
    }

    const troncoJunto = mergeGeometries(galhos);
    galhos.forEach((g) => g.dispose());
    return [solido(new THREE.Mesh(troncoJunto, matCasca), o.uid, 'arvore-tronco'), solido(new THREE.Mesh(copa, matFolhas), o.uid, 'arvore-copa')];
  }

  // ---------------------------------------------------------------- Camada

  function liberarGrupo(g: THREE.Group): void {
    g.traverse((x) => {
      if (x instanceof THREE.Mesh) x.geometry.dispose();
    });
  }

  function atualizar(): void {
    const lista = estado.projeto.obstaculos ?? [];
    const vivos = new Set(lista.map((o) => o.uid));
    for (const [uid, f] of [...feitos]) {
      if (vivos.has(uid)) continue;
      camada.remove(f.grupo);
      liberarGrupo(f.grupo);
      feitos.delete(uid);
    }
    for (const o of lista) {
      const forma = `${o.tipo}|${o.largura}|${o.profundidade}|${o.altura}`;
      let f = feitos.get(o.uid);
      if (!f || f.forma !== forma) {
        if (f) {
          camada.remove(f.grupo);
          liberarGrupo(f.grupo);
        }
        const grupo = new THREE.Group();
        grupo.name = `obstaculo-${o.uid}`;
        grupo.userData.obstaculo = o.uid;
        grupo.add(...(o.tipo === 'muro' ? construirMuro(o) : o.tipo === 'vizinho' ? construirVizinho(o) : construirArvore(o)));
        camada.add(grupo);
        f = { grupo, forma };
        feitos.set(o.uid, f);
      }
      f.grupo.position.set(o.x, 0, o.z);
      f.grupo.rotation.y = THREE.MathUtils.degToRad(o.tipo === 'arvore' ? 0 : o.giro);
    }
  }

  return {
    atualizar,
    destruir() {
      for (const f of feitos.values()) liberarGrupo(f.grupo);
      feitos.clear();
      casa.remove(camada);
      texTelhas.dispose();
      for (const m of [matTelhado, matPintura, matVidro, matCasca, matFolhas]) m.dispose();
    },
  };
}
