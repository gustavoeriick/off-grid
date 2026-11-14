// Paredes com espessura, vãos, janelas e portas. Especificação: cena-e-interface.md, seção 3.
//
// Quadro local de uma parede: X ao longo do comprimento, Y para cima, Z para fora.
// A face de fora fica em z = 0 e a de dentro em z = −espessura; o pé da parede em y = 0.

import * as THREE from 'three';
import { Construtor, type Marca, marcarSolido } from './malha';
import { cor, mat } from './materiais';

export interface Abertura {
  /** `vao` é uma passagem sem folha, das paredes internas. */
  tipo: 'janela' | 'porta' | 'vao';
  /** Centro, ao longo da parede. */
  x: number;
  largura: number;
  /** Altura do peitoril a partir do pé da parede (zero nas portas). */
  y: number;
  altura: number;
}

export interface OpcoesParede {
  comprimento: number;
  altura: number;
  espessura: number;
  aberturas: Abertura[];
  superficie: Marca;
  /** Parede interna: pintura de dentro e rodapé dos dois lados. */
  interna?: boolean;
  /** Altura do barrado na face de fora; zero para não ter. */
  barrado?: number;
  /** Altura do piso acabado acima do pé da parede: a folha da porta começa aí. */
  piso?: number;
}

const RODAPE = 0.08;

// Faixas de material da malha da parede.
const FORA = 0;
const BARRADO = 1;
const DENTRO = 2;
const PE_DENTRO = 3;

const CORES_DE_FORA = [cor.parede, cor.barrado, cor.dentro, cor.rodape];
const CORES_INTERNAS = [cor.dentro, cor.rodape, cor.dentro, cor.rodape];

// Faixas da malha de madeira das esquadrias.
const ESQUADRIA = 0;
const FOLHA = 1;
const ALMOFADA = 2;
const CORES_DE_MADEIRA = [cor.esquadria, cor.porta, cor.almofada];

// Faixas da malha de peças lisas.
const PEDRA = 0;
const METAL = 1;
const CORES_LISAS = [cor.pedra, cor.metal];

function janela(c: Construtor, liso: Construtor, vidro: Construtor, a: Abertura, esp: number): void {
  const x0 = a.x - a.largura / 2;
  const x1 = a.x + a.largura / 2;
  const y0 = a.y;
  const y1 = a.y + a.altura;
  const m = 0.045;
  const zc = -esp / 2 + 0.01;
  const z0 = zc - 0.03;
  const z1 = zc + 0.03;
  // Caixilho: marco em volta, montante no meio (duas folhas) e uma travessa.
  c.caixa(x0, y0, z0, x0 + m, y1, z1, ESQUADRIA);
  c.caixa(x1 - m, y0, z0, x1, y1, z1, ESQUADRIA);
  c.caixa(x0 + m, y1 - m, z0, x1 - m, y1, z1, ESQUADRIA);
  c.caixa(x0 + m, y0, z0, x1 - m, y0 + m, z1, ESQUADRIA);
  if (a.largura > 0.8) c.caixa(a.x - m / 2, y0 + m, z0, a.x + m / 2, y1 - m, z1, ESQUADRIA);
  if (a.altura > 0.8) {
    const yt = y0 + a.altura * 0.64;
    c.caixa(x0 + m, yt - 0.015, zc - 0.02, x1 - m, yt + 0.015, zc + 0.02, ESQUADRIA);
  }
  vidro.caixa(x0 + m, y0 + m, zc - 0.004, x1 - m, y1 - m, zc + 0.004, 0);
  // Peitoril de pedra, com pingadeira para fora.
  liso.caixa(x0 - 0.05, y0 - 0.035, -esp - 0.012, x1 + 0.05, y0 + 0.008, 0.045, PEDRA);
}

function porta(c: Construtor, liso: Construtor, a: Abertura, esp: number, piso: number): void {
  const x0 = a.x - a.largura / 2;
  const x1 = a.x + a.largura / 2;
  const y1 = a.altura;
  const m = 0.05;
  const zc = -esp / 2;
  // Marco.
  c.caixa(x0, piso, zc - 0.045, x0 + m, y1, zc + 0.045, ESQUADRIA);
  c.caixa(x1 - m, piso, zc - 0.045, x1, y1, zc + 0.045, ESQUADRIA);
  c.caixa(x0 + m, y1 - m, zc - 0.045, x1 - m, y1, zc + 0.045, ESQUADRIA);
  // Folha, com duas almofadas em relevo de cada lado, e maçaneta.
  const fx0 = x0 + m;
  const fx1 = x1 - m;
  const fy0 = piso + 0.008;
  const fy1 = y1 - m;
  c.caixa(fx0, fy0, zc - 0.018, fx1, fy1, zc + 0.018, FOLHA);
  const meio = fy0 + (fy1 - fy0) * 0.44;
  for (const [ya, yb] of [
    [fy0 + 0.14, meio - 0.06],
    [meio + 0.06, fy1 - 0.14],
  ] as const) {
    if (yb - ya < 0.1) continue;
    c.caixa(fx0 + 0.11, ya, zc - 0.026, fx1 - 0.11, yb, zc + 0.026, ALMOFADA);
  }
  const ym = fy0 + 1.0;
  if (ym + 0.06 < fy1) {
    liso.caixa(fx1 - 0.085, ym - 0.012, zc - 0.06, fx1 - 0.06, ym + 0.012, zc + 0.06, METAL);
    liso.caixa(fx1 - 0.19, ym - 0.012, zc + 0.045, fx1 - 0.06, ym + 0.012, zc + 0.06, METAL);
    liso.caixa(fx1 - 0.19, ym - 0.012, zc - 0.06, fx1 - 0.06, ym + 0.012, zc - 0.045, METAL);
  }
  // Soleira de pedra.
  liso.caixa(x0, 0, -esp - 0.01, x1, piso + 0.008, 0.035, PEDRA);
}

/** Parede com os vãos recortados, mais caixilhos, vidros, peitoris e portas. */
export function criarParede(o: OpcoesParede): THREE.Group {
  const g = new THREE.Group();
  g.name = o.superficie.id;
  const meio = o.comprimento / 2;
  const H = o.altura;
  const e = o.espessura;
  const interna = o.interna ?? false;
  const faixaFora = interna ? RODAPE : (o.barrado ?? 0);
  const piso = o.piso ?? 0;

  const c = new Construtor();
  /** Retângulo cheio de parede, nas duas faces, com a faixa do pé separada. */
  const cheio = (x0: number, x1: number, y0: number, y1: number): void => {
    if (x1 - x0 <= 1e-6 || y1 - y0 <= 1e-6) return;
    const fora = (ya: number, yb: number, faixa: number): void => {
      if (yb - ya > 1e-6) c.quad([x0, ya, 0], [x1, ya, 0], [x1, yb, 0], [x0, yb, 0], faixa);
    };
    const dentro = (ya: number, yb: number, faixa: number): void => {
      if (yb - ya > 1e-6) c.quad([x1, ya, -e], [x0, ya, -e], [x0, yb, -e], [x1, yb, -e], faixa);
    };
    fora(y0, Math.min(y1, faixaFora), BARRADO);
    fora(Math.max(y0, faixaFora), y1, FORA);
    const pe = piso + RODAPE;
    dentro(y0, Math.min(y1, pe), PE_DENTRO);
    dentro(Math.max(y0, pe), y1, DENTRO);
  };

  const aberturas = o.aberturas
    .filter((a) => a.x - a.largura / 2 > -meio + 0.05 && a.x + a.largura / 2 < meio - 0.05 && a.y + a.altura < H - 0.05)
    .sort((a, b) => a.x - b.x);
  let cursor = -meio;
  for (const a of aberturas) {
    const x0 = a.x - a.largura / 2;
    const x1 = a.x + a.largura / 2;
    if (x0 < cursor) continue; // vãos sobrepostos: fica o primeiro
    const y0 = a.y;
    const y1 = a.y + a.altura;
    cheio(cursor, x0, 0, H);
    cheio(x0, x1, 0, y0);
    cheio(x0, x1, y1, H);
    // Requadro do vão.
    const requadro = interna ? DENTRO : FORA;
    c.quad([x0, y0, 0], [x0, y0, -e], [x0, y1, -e], [x0, y1, 0], requadro);
    c.quad([x1, y0, -e], [x1, y0, 0], [x1, y1, 0], [x1, y1, -e], requadro);
    c.quad([x0, y1, -e], [x1, y1, -e], [x1, y1, 0], [x0, y1, 0], requadro);
    if (y0 > 0) c.quad([x0, y0, 0], [x1, y0, 0], [x1, y0, -e], [x0, y0, -e], requadro);
    cursor = x1;
  }
  cheio(cursor, meio, 0, H);
  // Topo e pontas.
  c.quad([-meio, H, 0], [meio, H, 0], [meio, H, -e], [-meio, H, -e], interna ? DENTRO : FORA);
  for (const [ya, yb, faixa] of [
    [0, Math.min(H, faixaFora), BARRADO],
    [Math.min(H, faixaFora), H, FORA],
  ] as const) {
    if (yb - ya <= 1e-6) continue;
    c.quad([meio, ya, 0], [meio, ya, -e], [meio, yb, -e], [meio, yb, 0], faixa);
    c.quad([-meio, ya, -e], [-meio, ya, 0], [-meio, yb, 0], [-meio, yb, -e], faixa);
  }

  const parede = marcarSolido(c.malhaColorida(mat.reboco, interna ? CORES_INTERNAS : CORES_DE_FORA), o.superficie);
  parede.name = `malha-${o.superficie.id}`;
  g.add(parede);

  const esquadrias = new Construtor();
  const lisos = new Construtor();
  const vidros = new Construtor();
  for (const a of aberturas) {
    if (a.tipo === 'janela') janela(esquadrias, lisos, vidros, a, e);
    else if (a.tipo === 'porta') porta(esquadrias, lisos, a, e, piso);
  }
  if (!esquadrias.vazio) {
    const m = marcarSolido(esquadrias.malhaColorida(mat.madeiraCores, CORES_DE_MADEIRA));
    m.name = 'esquadrias';
    g.add(m);
  }
  if (!lisos.vazio) {
    const m = marcarSolido(lisos.malhaColorida(mat.lisoCores, CORES_LISAS));
    m.name = 'peitoris-e-ferragens';
    g.add(m);
  }
  if (!vidros.vazio) {
    // O vidro deixa o sol passar: não projeta sombra na tela nem tapa o sol no cálculo.
    const m = vidros.malha(mat.vidro);
    m.name = 'vidros';
    m.renderOrder = 2;
    g.add(m);
  }
  return g;
}
