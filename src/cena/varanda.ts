// Varandas: até uma por lado da casa. Especificação: docs/especificacao/fase-2.md, seção 1.1.
//
// Quadro de uma fachada: X ao longo dela, positivo para a direita de quem a olha de fora; Z para fora; Y para cima.
// A origem fica no meio da fachada, no chão.

import * as THREE from 'three';
import type { CasaConfig, LadoCasa } from '../nucleo/tipos';
import { Construtor, type Marca, marcarSolido } from './malha';
import { mat } from './materiais';
import { CAIBRO, criarAgua, FUNDO_RIPA, type Recorte } from './telhado';

/** Altura mínima da beira do telhado de uma varanda, no plano da crista das telhas. */
export const BEIRA_MINIMA = 2.0;
/** Um pilar a mais no meio de todo vão maior que isto. */
const VAO_MAXIMO = 5;
const PISO = 0.05;
const LADOS: readonly LadoCasa[] = ['frente', 'fundos', 'esquerda', 'direita'];

export const GIRO_DA_FACHADA: Record<LadoCasa, number> = {
  frente: 0,
  fundos: Math.PI,
  direita: Math.PI / 2,
  esquerda: -Math.PI / 2,
};

/** Retângulo da planta, em coordenadas da casa. */
export interface Planta {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Uma varanda já com as medidas que o desenho usa. */
export interface MedidaVaranda {
  lado: LadoCasa;
  /** Pontas ao longo da fachada, no quadro da fachada, já cortadas para caber nela. */
  x0: number;
  x1: number;
  profundidade: number;
  /** Inclinação usada no desenho, como fração. Menor que a pedida quando a beira ficaria abaixo de 2,0 m. */
  inclinacao: number;
  /** Altura em que o telhado encontra a parede. */
  yParede: number;
  planta: Planta;
}

/** Leva um ponto do quadro da fachada (x ao longo, z para fora) para as coordenadas da casa. */
function paraACasa(casa: CasaConfig, lado: LadoCasa, x: number, z: number): [x: number, z: number] {
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  if (lado === 'frente') return [x, D + z];
  if (lado === 'fundos') return [-x, -D - z];
  if (lado === 'direita') return [W + z, -x];
  return [-W - z, x];
}

/**
 * Medidas de desenho das varandas da casa: no máximo uma por lado (vale a primeira da lista),
 * largura e deslocamento cortados para caber na fachada e inclinação reduzida até a beira ficar em 2,0 m.
 */
export function medirVarandas(casa: CasaConfig): MedidaVaranda[] {
  const lista: MedidaVaranda[] = [];
  for (const lado of LADOS) {
    const v = casa.varandas.find((item) => item.lado === lado);
    if (!v || !(v.profundidade > 0.05)) continue;
    const comp = lado === 'frente' || lado === 'fundos' ? casa.largura : casa.profundidade;
    const largura = v.largura === null ? comp : THREE.MathUtils.clamp(v.largura, 0, comp);
    if (!(largura > 0.05)) continue;
    const folga = (comp - largura) / 2;
    const centro = v.largura === null ? 0 : THREE.MathUtils.clamp(v.deslocamento, -folga, folga);
    const yParede = casa.andares === 2 ? casa.peDireito + 0.25 : casa.peDireito - 0.1;
    const inclinacao = THREE.MathUtils.clamp(v.inclinacaoPct / 100, 0, Math.max(0, (yParede - BEIRA_MINIMA) / v.profundidade));
    const x0 = centro - largura / 2;
    const x1 = centro + largura / 2;
    const [xa, za] = paraACasa(casa, lado, x0, 0);
    const [xb, zb] = paraACasa(casa, lado, x1, v.profundidade);
    lista.push({
      lado,
      x0,
      x1,
      profundidade: v.profundidade,
      inclinacao,
      yParede,
      planta: { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) },
    });
  }
  return lista;
}

/** Posições dos pilares entre duas pontas: as pontas e, em todo vão maior que 5 m, mais um no meio. */
function pilaresEntre(a: number, b: number): number[] {
  if (b - a <= VAO_MAXIMO) return [a, b];
  const meio = (a + b) / 2;
  return [...pilaresEntre(a, meio), ...pilaresEntre(meio, b).slice(1)];
}

function solido(c: Construtor, material: THREE.Material | THREE.Material[], nome: string, superficie?: Marca): THREE.Mesh {
  const m = marcarSolido(c.malha(material), superficie);
  m.name = nome;
  return m;
}

export function construirVaranda(casa: CasaConfig, v: MedidaVaranda): THREE.Group {
  const lado = v.lado;
  const ehLateral = lado === 'esquerda' || lado === 'direita';
  const g = new THREE.Group();
  g.name = `varanda-${lado}`;
  g.rotation.y = GIRO_DA_FACHADA[lado];
  const [x, z] = paraACasa(casa, lado, 0, 0);
  g.position.set(x, 0, z);

  const { x0, x1, profundidade: prof, inclinacao: s, yParede } = v;
  const k = Math.hypot(1, s);

  const piso = new Construtor();
  piso.caixa(x0, 0, 0.002, x1, PISO, prof, 1, { py: 0 });
  g.add(solido(piso, [mat.pisoVaranda, mat.cimento], `piso-varanda-${lado}`, { id: `piso-varanda-${lado}`, tipo: 'piso' }));

  // Em casa térrea, na frente e nos fundos, a água principal termina logo acima: o encontro leva um arremate próprio.
  const sobAAgua = casa.andares === 1 && !ehLateral;
  const agua = criarAgua({
    largura: x1 - x0,
    comprimento: prof * k,
    superficie: { id: `telhado-varanda-${lado}`, tipo: 'telhado' },
    caibro: CAIBRO,
    semente: 303 + LADOS.indexOf(lado),
    rufo: !sobAAgua,
  });
  agua.position.set((x0 + x1) / 2, yParede, 0);
  agua.rotation.x = Math.atan(s);
  g.add(agua);

  if (sobAAgua) {
    // Rufo de argamassa que fecha o degrau entre as duas águas: embute a ponta das telhas de cima
    // e entra nas telhas da varanda, de modo que a parede não aparece entre elas.
    const yAgua = casa.andares * casa.peDireito;
    const arremate = new Construtor();
    arremate.caixa(x0, yParede - 0.06, -0.005, x1, yAgua - 0.02, 0.075, 0, { nz: null, ny: null });
    const m = arremate.malha(mat.argamassa);
    m.name = 'arremate-varanda';
    m.receiveShadow = true;
    g.add(m);
  }

  // Madeiramento de apoio: uma viga sobre os pilares, na borda de fora, e uma peça presa à parede.
  const pilha = (FUNDO_RIPA + CAIBRO) * k;
  const zPilar = prof - 0.06;
  const yViga = yParede - zPilar * s - pilha - 0.004;
  const alturaViga = 0.14;
  const apoio = new Construtor();
  if (yParede - pilha - 0.1 > PISO) apoio.caixa(x0, yParede - pilha - 0.1, 0, x1, yParede - pilha, 0.045, 1);
  // Nada abaixo do chão: sem altura para o pilar, a varanda fica sem viga e sem pilar.
  if (yViga - alturaViga - PISO > 0.3) {
    apoio.caixa(x0, yViga - alturaViga, zPilar - 0.04, x1, yViga, zPilar + 0.04, 1);
    const pontas = x1 - x0 > 0.3 ? pilaresEntre(x0 + 0.06, x1 - 0.06) : [(x0 + x1) / 2];
    for (const xp of pontas) {
      apoio.caixa(xp - 0.06, PISO, zPilar - 0.06, xp + 0.06, yViga - alturaViga, zPilar + 0.06, 0);
      // Sapata e capitel discretos.
      apoio.caixa(xp - 0.09, PISO, zPilar - 0.09, xp + 0.09, PISO + 0.1, zPilar + 0.09, 0);
      apoio.caixa(xp - 0.08, yViga - alturaViga - 0.05, zPilar - 0.08, xp + 0.08, yViga - alturaViga, zPilar + 0.08, 0);
    }
  }
  if (!apoio.vazio) g.add(solido(apoio, [mat.pilar, mat.madeira], 'apoio-varanda'));
  return g;
}

/** O que muda em uma água do telhado principal de casa térrea por causa das varandas. */
export interface CorteDaAgua {
  recortes: Recorte[];
  marcosX: number[];
  marcosZ: number[];
}

/** Varanda que chega a esta distância da ponta da fachada leva o beiral do canto junto. */
const FOLGA_DO_CANTO = 0.3;

/**
 * Em casa térrea, o telhado da varanda nasce logo abaixo da borda do telhado principal, e o beiral
 * não cabe ali: ele some só no trecho da varanda. Devolve os recortes de uma água, no quadro dela.
 * `sinal` é +1 para a água da frente e −1 para a dos fundos.
 */
export function cortarAgua(casa: CasaConfig, varandas: readonly MedidaVaranda[], sinal: 1 | -1): CorteDaAgua {
  const corte: CorteDaAgua = { recortes: [], marcosX: [], marcosZ: [] };
  if (casa.andares !== 1) return corte;
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  const b = casa.beiral;
  if (b <= 0.01) return corte;
  const k = Math.hypot(1, casa.inclinacaoTelhadoPct / 100);
  const zParede = D * k;
  const zBeira = (D + b) * k;
  for (const v of varandas) {
    const p = v.planta;
    if (v.lado === (sinal === 1 ? 'frente' : 'fundos')) {
      let xa = Math.min(sinal * p.x0, sinal * p.x1);
      let xb = Math.max(sinal * p.x0, sinal * p.x1);
      if (xa <= -W + FOLGA_DO_CANTO) xa = -W - b;
      if (xb >= W - FOLGA_DO_CANTO) xb = W + b;
      corte.recortes.push({ x0: xa, x1: xb, z0: zParede, z1: zBeira });
      corte.marcosZ.push(zParede);
    } else if (v.lado === 'direita' || v.lado === 'esquerda') {
      // Trecho da varanda que fica debaixo desta água, medido da cumeeira para a beira.
      const za = Math.max(0, Math.min(sinal * p.z0, sinal * p.z1));
      let zb = Math.min(D, Math.max(sinal * p.z0, sinal * p.z1));
      if (zb - za < 0.02) continue;
      zb = zb >= D - FOLGA_DO_CANTO ? zBeira : zb * k;
      const direitaDaAgua = (v.lado === 'direita' ? 1 : -1) * sinal === 1;
      corte.recortes.push({ x0: direitaDaAgua ? W : -W - b, x1: direitaDaAgua ? W + b : -W, z0: za * k, z1: zb });
      corte.marcosX.push(direitaDaAgua ? W : -W);
    }
  }
  return corte;
}

/** Em casa térrea, a varanda lateral que passa pela linha da cumeeira tira dela a ponta do beiral desse lado. */
export function cumeeiraSemPonta(casa: CasaConfig, varandas: readonly MedidaVaranda[], lado: 'esquerda' | 'direita'): boolean {
  if (casa.andares !== 1) return false;
  return varandas.some((v) => v.lado === lado && v.planta.z0 < -0.02 && v.planta.z1 > 0.02);
}
