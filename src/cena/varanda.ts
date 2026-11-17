// Varandas: até uma por lado da casa. Especificação: docs/especificacao/fase-2.md, seção 1.1.
//
// Quadro de uma fachada: X ao longo dela, positivo para a direita de quem a olha de fora; Z para fora; Y para cima.
// A origem fica no meio da fachada, no chão.

import * as THREE from 'three';
import type { CasaConfig, LadoCasa } from '../nucleo/tipos';
import { Construtor, type Marca, marcarSolido } from './malha';
import { mat } from './materiais';
import type { CantoDeVarandas } from './regrasDaCasa';
import { CAIBRO, criarAgua, criarAguaDeCanto, criarEspigao, FUNDO_RIPA, type Recorte } from './telhado';

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
export function paraACasa(casa: Pick<CasaConfig, 'largura' | 'profundidade'>, lado: LadoCasa, x: number, z: number): [x: number, z: number] {
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  if (lado === 'frente') return [x, D + z];
  if (lado === 'fundos') return [-x, -D - z];
  if (lado === 'direita') return [W + z, -x];
  return [-W - z, x];
}

/** O inverso de `paraACasa`: um ponto da casa visto do quadro da fachada (x ao longo dela, z para fora). */
export function naFachada(casa: Pick<CasaConfig, 'largura' | 'profundidade'>, lado: LadoCasa, x: number, z: number): [x: number, z: number] {
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  if (lado === 'frente') return [x, z - D];
  if (lado === 'fundos') return [-x, -z - D];
  if (lado === 'direita') return [-z, x - W];
  return [z, -x - W];
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

/** Junção de uma ponta da varanda com a varanda do lado vizinho (o canto entre as duas). */
export interface JuncaoDaPonta {
  /** Profundidade da vizinha: é quanto o canto passa da ponta desta varanda. */
  alcance: number;
  /** As duas são iguais e o telhado fecha em espigão: esta varanda leva o triângulo de água do lado dela. */
  espigao: boolean;
  /** A viga desta varanda vai até a quina de fora; a da vizinha para na face dela. */
  vigaInteira: boolean;
}

/** Junções das duas pontas: `menos` é a ponta x0 e `mais` é a ponta x1, no quadro da fachada. */
export interface JuncoesDaVaranda {
  menos?: JuncaoDaPonta;
  mais?: JuncaoDaPonta;
}

const ALTURA_DA_VIGA = 0.14;

/** Altura do topo da viga da borda de fora. Nulo quando não sobra altura para viga e pilar. */
function topoDaViga(v: MedidaVaranda): number | null {
  const pilha = (FUNDO_RIPA + CAIBRO) * Math.hypot(1, v.inclinacao);
  const yViga = v.yParede - (v.profundidade - 0.06) * v.inclinacao - pilha - 0.004;
  // Nada abaixo do chão: sem altura para o pilar, a varanda fica sem viga e sem pilar.
  return yViga - ALTURA_DA_VIGA - PISO > 0.3 ? yViga : null;
}

/** Um pilar de 0,12 × 0,12 do piso até `topo`, com sapata e capitel discretos. */
function pilar(c: Construtor, x: number, z: number, topo: number): void {
  c.caixa(x - 0.06, PISO, z - 0.06, x + 0.06, topo, z + 0.06, 0);
  c.caixa(x - 0.09, PISO, z - 0.09, x + 0.09, PISO + 0.1, z + 0.09, 0);
  c.caixa(x - 0.08, topo - 0.05, z - 0.08, x + 0.08, topo, z + 0.08, 0);
}

export function construirVaranda(casa: CasaConfig, v: MedidaVaranda, juncoes: JuncoesDaVaranda = {}): THREE.Group {
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

  // Canto com a varanda vizinha, quando as duas são iguais: o triângulo de água deste lado do espigão.
  for (const [juncao, ponta] of [[juncoes.menos, -1], [juncoes.mais, 1]] as const) {
    if (!juncao?.espigao) continue;
    const canto = criarAguaDeCanto({
      nome: `telhado-canto-${lado}-${ponta === 1 ? 'mais' : 'menos'}`,
      largura: juncao.alcance,
      comprimento: prof * k,
      inclinacao: s,
      lado: ponta,
      caibro: CAIBRO,
      semente: 707 + 2 * LADOS.indexOf(lado) + (ponta === 1 ? 1 : 0),
    });
    canto.position.set(ponta === 1 ? x1 : x0, yParede, 0);
    canto.rotation.x = Math.atan(s);
    g.add(canto);
  }

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
  const yViga = topoDaViga(v);
  const apoio = new Construtor();
  if (yParede - pilha - 0.1 > PISO) apoio.caixa(x0, yParede - pilha - 0.1, 0, x1, yParede - pilha, 0.045, 1);
  if (yViga !== null) {
    // Na ponta que se junta à vizinha, a viga segue até o pilar da quina de fora, que é do canto, e esta ponta fica sem pilar.
    const ate = (j: JuncaoDaPonta | undefined): number => (j ? j.alcance - (j.vigaInteira ? 0.02 : 0.1) : 0);
    apoio.caixa(x0 - ate(juncoes.menos), yViga - ALTURA_DA_VIGA, zPilar - 0.04, x1 + ate(juncoes.mais), yViga, zPilar + 0.04, 1);
    const xa = x0 - (juncoes.menos?.alcance ?? 0);
    const xb = x1 + (juncoes.mais?.alcance ?? 0);
    let pontas = xb - xa > 0.3 ? pilaresEntre(xa + 0.06, xb - 0.06) : [(xa + xb) / 2];
    if (juncoes.menos) pontas = pontas.slice(1);
    if (juncoes.mais) pontas = pontas.slice(0, -1);
    for (const xp of pontas) pilar(apoio, xp, zPilar, yViga - ALTURA_DA_VIGA);
  }
  if (!apoio.vazio) g.add(solido(apoio, [mat.pilar, mat.madeira], 'apoio-varanda'));
  return g;
}

/**
 * Canto entre duas varandas vizinhas, em coordenadas da casa: piso no nível e no material das duas, um pilar na quina
 * de fora e, com as duas iguais, as telhas do espigão e a peça de madeira debaixo dele. `a` e `b` são as duas varandas
 * do canto. Os triângulos de água são de cada varanda (`construirVaranda`). Nada aqui é superfície de encaixe.
 */
export function construirCantoDaVaranda(canto: CantoDeVarandas, a: MedidaVaranda, b: MedidaVaranda): THREE.Group {
  const g = new THREE.Group();
  g.name = `canto-varanda-${canto.lados[0]}-${canto.lados[1]}`;
  const p = canto.planta;
  const sx = p.x0 + p.x1 > 0 ? 1 : -1;
  const sz = p.z0 + p.z1 > 0 ? 1 : -1;

  // As faces coladas nos pisos das duas varandas não aparecem.
  const piso = new Construtor();
  piso.caixa(p.x0, 0, p.z0, p.x1, PISO, p.z1, 1, { py: 0, [sx === 1 ? 'nx' : 'px']: null, [sz === 1 ? 'nz' : 'pz']: null });
  g.add(solido(piso, [mat.pisoVaranda, mat.cimento], 'piso-canto-varanda'));

  const xFora = sx === 1 ? p.x1 : p.x0;
  const zFora = sz === 1 ? p.z1 : p.z0;
  const vigas = [topoDaViga(a), topoDaViga(b)].filter((y): y is number => y !== null);
  if (vigas.length > 0) {
    // O pilar sobe até a viga mais alta; a mais baixa morre na lateral dele.
    const apoio = new Construtor();
    pilar(apoio, xFora - sx * 0.06, zFora - sz * 0.06, Math.max(...vigas) - ALTURA_DA_VIGA);
    g.add(solido(apoio, [mat.pilar, mat.madeira], 'pilar-canto-varanda'));
  }

  if (canto.fechamento === 'espigao') {
    const alto = new THREE.Vector3(sx === 1 ? p.x0 : p.x1, a.yParede, sz === 1 ? p.z0 : p.z1);
    const baixo = new THREE.Vector3(xFora, a.yParede - a.profundidade * a.inclinacao, zFora);
    const espigao = criarEspigao(alto, baixo, 909 + LADOS.indexOf(canto.lados[0]));
    g.add(espigao);

    // Peça de madeira debaixo do espigão, da quina da casa ao pilar: é nela que os caibros do canto se apoiam.
    const k = Math.hypot(1, a.inclinacao);
    const comprimento = alto.distanceTo(baixo) * (1 - 0.06 / a.profundidade);
    const geo = new THREE.BoxGeometry(comprimento, 0.1, 0.06);
    geo.translate(comprimento / 2, -0.05, 0);
    const peca = marcarSolido(new THREE.Mesh(geo, mat.madeira));
    peca.name = 'madeira-do-espigao';
    peca.quaternion.copy(espigao.quaternion);
    peca.position.copy(alto);
    peca.position.y -= FUNDO_RIPA * k + 0.005;
    g.add(peca);
  }
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
