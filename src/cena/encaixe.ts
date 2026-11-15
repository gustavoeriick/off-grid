// Encaixe de uma peça em uma superfície. Especificação: docs/especificacao/cena-e-interface.md, seção 5.
// Funções puras: recebem o item, a superfície, o ponto tocado e a normal, tudo em coordenadas da casa.

import * as THREE from 'three';
import type { Dimensoes, Item } from '../catalogo/tipos';
import type { Encaixe } from '../estado';
import type { Vec3 } from '../nucleo/tipos';
import type { Marca, TipoSuperficie } from './malha';

/** Espessura da placa no desenho, em metros. */
export const ESPESSURA_PLACA = 0.035;
/** Medidas da tomada da rede: espelho 4 × 2 sobre a parede. */
const DIMENSOES_TOMADA: Dimensoes = [0.12, 0.12, 0.03];

/** Largura, altura e profundidade da peça no desenho. Nulo para o que não vai à cena (cabos, proteções, acessórios sem medida). */
export function dimensoesDe(item: Item): Dimensoes | null {
  switch (item.categoria) {
    case 'placa':
      return [item.largura, item.altura, ESPESSURA_PLACA];
    case 'rede':
      return DIMENSOES_TOMADA;
    case 'bateria':
    case 'inversor':
    case 'controlador':
    case 'aparelho':
      return item.dimensoes;
    case 'acessorio':
      return item.dimensoes ?? null;
    case 'protecao':
    case 'cabo':
      return null;
  }
}

/** O item é um grampo de parede, que prende um cabo. Encaixa em qualquer superfície (cena-e-interface.md, seção 8). */
export function ehGrampo(item: Item | undefined): boolean {
  return item?.categoria === 'acessorio' && item.tipo === 'grampo';
}

/**
 * Tipo de superfície em que a peça encaixa. Nulo para o que não é arrastado para a cena.
 * O grampo de parede encaixa em qualquer uma (`ehGrampo`); aqui ele responde `parede`, que é onde mais se usa.
 */
export function superficieAceita(item: Item): TipoSuperficie | null {
  switch (item.categoria) {
    case 'placa':
      return 'telhado';
    case 'controlador':
    case 'rede':
      return 'parede';
    case 'inversor':
      return item.montagem === 'parede' ? 'parede' : 'piso';
    case 'bateria':
      return 'piso';
    case 'aparelho':
      return item.forma === 'lampada' || item.forma === 'chuveiro' ? 'parede' : 'piso';
    case 'acessorio':
      return (item.tipo === 'quadro' || item.tipo === 'grampo') && item.dimensoes ? 'parede' : null;
    case 'protecao':
    case 'cabo':
      return null;
  }
}

/** Alturas dos móveis que acompanham alguns aparelhos. O aparelho fica em cima do móvel. */
export const ALTURA_MESA = 0.74;
export const ALTURA_RACK = 0.45;
export const ALTURA_MESINHA = 0.55;
export const ALTURA_BALCAO = 0.85;

/**
 * Altura, acima do piso, da base da caixa de `dimensoes`: a do móvel que acompanha o aparelho
 * (mesa do computador e do notebook, rack da TV, mesinha do modem, balcão do micro-ondas). Zero nas demais peças.
 */
export function alturaDeApoio(item: Item): number {
  if (item.categoria !== 'aparelho') return 0;
  switch (item.forma) {
    case 'pc':
    case 'notebook':
      return ALTURA_MESA;
    case 'tv':
      return ALTURA_RACK;
    case 'roteador':
      return ALTURA_MESINHA;
    case 'microondas':
      return ALTURA_BALCAO;
    default:
      return 0;
  }
}

type Vetor = THREE.Vector3 | Vec3 | readonly [number, number, number];

function vetor(p: Vetor): THREE.Vector3 {
  return p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]);
}

/** Giro levado a 0, 90, 180 ou 270. */
export function normalizarGiro(giro: number): number {
  return (((Math.round(giro / 90) % 4) + 4) % 4) * 90;
}

const CIMA = new THREE.Vector3(0, 1, 0);

/**
 * Posição e orientação de uma peça encaixada, em coordenadas da casa.
 *
 * - Telhado: o eixo Z da peça é a normal; o Y é a subida do telhado; o X é Y × Z.
 * - Parede: Z é a normal, Y é a vertical.
 * - Piso: Y é a vertical e a frente fica em +Z da casa.
 * - Grampo de parede: em qualquer superfície, Z é a normal (a base dele encosta nela), como no telhado.
 * - `giro` (0, 90, 180 ou 270) gira a peça em torno da normal.
 * - A posição é o centro da caixa de `dimensoes`: o ponto tocado mais a normal vezes metade da espessura;
 *   no piso, mais metade da altura e a altura do móvel de apoio, quando há um.
 *
 * `superficie` é a marca da malha (`userData.superficie`) ou a própria malha de encaixe.
 */
export function encaixar(item: Item, superficie: Marca | THREE.Object3D, ponto: Vetor, normal: Vetor, giro = 0): Encaixe {
  const marca = superficie instanceof THREE.Object3D ? (superficie.userData.superficie as Marca | undefined) : superficie;
  if (!marca) throw new Error('A malha dada a `encaixar` não é uma superfície de encaixe.');
  const dim = dimensoesDe(item);
  if (!dim) throw new Error(`O item "${item.id}" não é uma peça que se encaixa na cena.`);
  const [, altura, profundidade] = dim;
  const p = vetor(ponto);
  const n = vetor(normal);
  const g = normalizarGiro(giro);
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  let eixoDoGiro: THREE.Vector3;

  if (marca.tipo === 'piso' && !ehGrampo(item)) {
    x.set(1, 0, 0);
    y.set(0, 1, 0);
    z.set(0, 0, 1);
    p.y += alturaDeApoio(item) + altura / 2;
    eixoDoGiro = y;
  } else if (marca.tipo === 'parede') {
    z.set(n.x, 0, n.z);
    if (z.lengthSq() < 1e-8) z.set(0, 0, 1);
    z.normalize();
    y.set(0, 1, 0);
    x.crossVectors(y, z);
    p.addScaledVector(z, profundidade / 2);
    eixoDoGiro = z;
  } else {
    z.copy(n);
    if (z.lengthSq() < 1e-8) z.set(0, 1, 0);
    z.normalize();
    y.copy(CIMA).addScaledVector(z, -CIMA.dot(z));
    // Telhado plano: a "subida" passa a ser os fundos da casa.
    if (y.lengthSq() < 1e-8) y.set(0, 0, -1).addScaledVector(z, z.z);
    y.normalize();
    x.crossVectors(y, z);
    p.addScaledVector(z, profundidade / 2);
    eixoDoGiro = z;
  }

  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (g !== 0) q.premultiply(new THREE.Quaternion().setFromAxisAngle(eixoDoGiro, THREE.MathUtils.degToRad(g)));
  return { pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w], superficie: marca.id, giro: g };
}

/**
 * Encaixe a partir do toque de um raio em uma malha de encaixe: leva o ponto e a normal para as coordenadas
 * de `casa` (o grupo que gira) e chama `encaixar`. Nulo se a malha tocada não é superfície ou não tem face.
 */
export function encaixarNoToque(item: Item, toque: THREE.Intersection, casa: THREE.Object3D, giro = 0): Encaixe | null {
  const marca = toque.object.userData.superficie as Marca | undefined;
  if (!marca || !toque.face) return null;
  casa.updateWorldMatrix(true, false);
  const inversa = new THREE.Matrix4().copy(casa.matrixWorld).invert();
  const ponto = toque.point.clone().applyMatrix4(inversa);
  const normal = toque.face.normal.clone().transformDirection(toque.object.matrixWorld).transformDirection(inversa);
  return encaixar(item, marca, ponto, normal, giro);
}
