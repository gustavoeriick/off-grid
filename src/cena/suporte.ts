// Suporte inclinado da placa posta no terreno: dois cavaletes triangulares de perfil metálico, com pés sobre
// sapatas de concreto, e duas travessas em que a placa se apoia. Tarefa 5.3. Só desenho: não entra no cálculo de sombra.

import * as THREE from 'three';
import { ESPESSURA_PLACA } from './encaixe';
import { Molde } from './molde';
import { VAO_DO_SUPORTE } from './terreno';

const ACO = '#b4b9be';
const ACO_ESCURO = '#8d9399';
const CONCRETO = '#b7b2a8';
/** Lado do perfil quadrado. */
const PERFIL = 0.04;

/**
 * Suporte de uma placa de `largura` × `altura` inclinada de `inclinacaoGraus`. O grupo devolvido é filho do grupo
 * da placa: ele desfaz a inclinação, de modo que dentro dele Y é a vertical e +Z é para onde a face olha.
 */
export function criarSuporte(largura: number, altura: number, inclinacaoGraus: number): THREE.Group {
  const b = THREE.MathUtils.degToRad(inclinacaoGraus);
  const sen = Math.sin(b);
  const cos = Math.cos(b);
  // Chão, visto do centro da placa.
  const chao = -(VAO_DO_SUPORTE + (altura / 2) * sen + (ESPESSURA_PLACA / 2) * cos);
  const m = new Molde();

  /** Ponto a `s` metros do centro, subindo pela placa, e `fundo` metros atrás da face de trás. */
  const naPlaca = (s: number, fundo: number): [y: number, z: number] => {
    const recuo = ESPESSURA_PLACA / 2 + fundo;
    return [s * sen - recuo * cos, -s * cos - recuo * sen];
  };
  /** Perfil reto entre dois pontos do plano YZ, na posição x. */
  const perfil = (x: number, y0: number, z0: number, y1: number, z1: number, lado = PERFIL, cor = ACO): void => {
    const comp = Math.hypot(y1 - y0, z1 - z0);
    if (comp < 0.02) return;
    m.bloco('metal', cor, x, (y0 + y1) / 2, (z0 + z1) / 2, lado, lado, comp, 0, ['x', Math.atan2(y0 - y1, z1 - z0)]);
  };

  // Travessas: correm de lado a lado, encostadas no fundo da placa.
  for (const s of [-0.3 * altura, 0.3 * altura]) {
    const [y, z] = naPlaca(s, PERFIL / 2);
    m.bloco('metal', ACO, 0, y, z, largura * 0.98, PERFIL, PERFIL, 0, ['x', b]);
  }

  // Cavaletes: viga inclinada debaixo das travessas, perna da frente, perna de trás, base no chão e mão-francesa.
  const [yCima, zCima] = naPlaca(0.44 * altura, PERFIL * 1.5);
  const [yBaixo, zBaixo] = naPlaca(-0.44 * altura, PERFIL * 1.5);
  const base = chao + 0.06 + PERFIL / 2;
  const xs = largura > 0.7 ? [-0.32 * largura, 0.32 * largura] : [0];
  for (const x of xs) {
    perfil(x, yBaixo, zBaixo, yCima, zCima);
    perfil(x, chao + 0.06, zBaixo, yBaixo, zBaixo);
    perfil(x, chao + 0.06, zCima, yCima, zCima);
    perfil(x, base, zBaixo + PERFIL / 2, base, zCima - PERFIL / 2);
    // Mão-francesa: do pé da frente até o meio da perna de trás, quando a perna é alta o bastante.
    const alturaDeTras = yCima - base;
    if (alturaDeTras > 0.45) perfil(x, base, zBaixo - 0.12 * (zBaixo - zCima), base + alturaDeTras * 0.62, zCima, PERFIL * 0.75, ACO_ESCURO);
    // Sapatas de concreto.
    for (const z of [zBaixo, zCima]) m.bloco('plastico', CONCRETO, x, chao + 0.03, z, 0.24, 0.06, 0.24, 0.01);
  }
  // Contraventamento entre as pernas de trás.
  if (xs.length === 2 && yCima - base > 0.45) {
    const y0 = base + 0.08;
    const y1 = base + (yCima - base) * 0.8;
    const comp = Math.hypot(xs[1]! - xs[0]!, y1 - y0);
    for (const sinal of [1, -1]) {
      m.bloco('metal', ACO_ESCURO, 0, (y0 + y1) / 2, zCima - PERFIL * 0.6, comp, PERFIL * 0.5, PERFIL * 0.3, 0, ['z', sinal * Math.atan2(y1 - y0, xs[1]! - xs[0]!)]);
    }
  }

  const grupo = m.montar();
  grupo.name = 'suporte';
  grupo.rotation.x = Math.PI / 2 - b;
  grupo.traverse((o) => {
    o.raycast = () => {};
  });
  return grupo;
}
