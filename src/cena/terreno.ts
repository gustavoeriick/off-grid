// Terreno em volta da casa como superfície de encaixe: placas sobre suporte inclinado e estação portátil. Tarefa 5.3.
//
// A superfície tem id `terreno` e tipo `piso` (um tipo novo quebraria as regras que já existem); o que ela aceita
// é decidido pelo id. A placa no terreno guarda em `giro` o ângulo em torno da vertical, em graus, no quadro da casa
// (livre, não só 0, 90, 180 e 270) e em `inclinacaoGraus` a inclinação a partir da horizontal. O `quat` reflete os dois:
// o eixo Z da peça é a normal da face, e é dele que o cálculo tira a orientação.

import * as THREE from 'three';
import type { Item, Placa } from '../catalogo/tipos';
import type { Encaixe } from '../estado';
import { localDoProjeto } from '../nucleo/irradiancia';
import type { Projeto } from '../nucleo/tipos';
import { ESPESSURA_PLACA } from './encaixe';
import type { Marca } from './malha';
import type { Pegada } from './regrasDosObstaculos';

export const ID_TERRENO = 'terreno';
export const MARCA_DO_TERRENO: Marca = { id: ID_TERRENO, tipo: 'piso' };
/** Meio lado do quadrado de terreno que aceita peças, em metros. */
export const MEIO_TERRENO = 31;
/** Altura da borda de baixo da placa sobre o chão. */
export const VAO_DO_SUPORTE = 0.3;
export const LIMITES_PLACA_NO_CHAO = { inclinacaoMin: 0, inclinacaoMax: 60, passoDaDirecao: 15 } as const;

const RAD = Math.PI / 180;
const voltas = (graus: number): number => ((graus % 360) + 360) % 360;
const centesimos = (v: number): number => Math.round(v * 100) / 100;

/** Só placas (sobre suporte) e estações portáteis ficam no terreno. */
export function aceitaNoTerreno(item: Item): boolean {
  return item.categoria === 'placa' || (item.categoria === 'inversor' && item.bateriaInternaWh !== undefined);
}

/** A peça é uma placa posta no terreno, sobre suporte. */
export function placaNoChao(d: { superficie: string | null }, item: Item | undefined): item is Placa {
  return d.superficie === ID_TERRENO && item?.categoria === 'placa';
}

/** Inclinação inicial do suporte: a latitude do local, arredondada (23° no Rio). */
export function inclinacaoPadrao(projeto: Projeto): number {
  const lat = localDoProjeto(projeto)?.lat ?? -23;
  const L = LIMITES_PLACA_NO_CHAO;
  return Math.min(L.inclinacaoMax, Math.max(L.inclinacaoMin, Math.round(Math.abs(lat))));
}

/** Azimute inicial da face: o norte no hemisfério sul, o sul no hemisfério norte. */
export function azimutePadrao(projeto: Projeto): number {
  return (localDoProjeto(projeto)?.lat ?? -23) <= 0 ? 0 : 180;
}

/** Giro, no quadro da casa, que deixa a face da placa voltada para o azimute dado (0 norte, 90 leste). */
export function giroParaOAzimute(orientacaoGraus: number, azimute: number): number {
  return centesimos(voltas(orientacaoGraus - azimute));
}

/** Azimute para onde a face da placa aponta, de 0 a 360, a partir do giro no quadro da casa. */
export function azimuteDoGiro(orientacaoGraus: number, giro: number): number {
  return centesimos(voltas(orientacaoGraus - giro));
}

export function limitarInclinacao(graus: number): number {
  const L = LIMITES_PLACA_NO_CHAO;
  return Math.min(L.inclinacaoMax, Math.max(L.inclinacaoMin, Math.round(graus)));
}

/**
 * Encaixe de uma placa no terreno, sobre suporte. `ponto` é o lugar do chão debaixo do centro da placa.
 * Com giro 0 a face olha para +Z da casa; a borda de baixo fica do lado para onde a face olha, a 0,30 m do chão.
 */
export function encaixarNoTerreno(item: Placa, ponto: THREE.Vector3 | readonly [number, number, number], giro: number, inclinacaoGraus: number): Encaixe {
  const [x, y, z] = ponto instanceof THREE.Vector3 ? [ponto.x, ponto.y, ponto.z] : ponto;
  const inclinacao = limitarInclinacao(inclinacaoGraus);
  const b = inclinacao * RAD;
  const g = centesimos(voltas(giro));
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), g * RAD)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), b - Math.PI / 2));
  const altura = VAO_DO_SUPORTE + (item.altura / 2) * Math.sin(b) + (ESPESSURA_PLACA / 2) * Math.cos(b);
  return { pos: [x, y + altura, z], quat: [q.x, q.y, q.z, q.w], superficie: ID_TERRENO, giro: g, inclinacaoGraus: inclinacao };
}

/** Chão ocupado por uma placa sobre suporte. */
export function pegadaDaPlacaNoChao(item: Placa, e: Pick<Encaixe, 'pos' | 'giro' | 'inclinacaoGraus'>): Pegada {
  const b = (e.inclinacaoGraus ?? 0) * RAD;
  return { x: e.pos[0], z: e.pos[2], largura: item.largura, profundidade: item.altura * Math.cos(b) + ESPESSURA_PLACA * Math.sin(b), giro: e.giro };
}
