// Formas dos terminais (borne com parafuso, plugue, conector MC4) e pequenos móveis que os modelos repetem.
// Especificação: docs/especificacao/fase-2.md, seção 2.

import type { TipoTerminal } from '../nucleo/tipos';
import type { Molde, V3 } from './molde';

/** Registra onde fica um terminal no modelo: posição, direção de saída do cabo e raio do anel colorido. */
export type Marcar = (id: string, pos: V3, saida: V3, raio?: number) => void;

export const COR_TERMINAL: Record<TipoTerminal, string> = {
  'cc+': '#e53935',
  'cc-': '#263238',
  ca: '#1e88e5',
};

const LATAO = '#d1b45a';
const ACO = '#c9cdd1';
const PRETO = '#17181a';

/** Borne com parafuso na face de baixo de um inversor ou controlador: prensa-cabo com a boca para baixo. */
export function borneDeBaixo(m: Molde, x: number, y: number, z: number, raio: number, cor: string = PRETO): void {
  m.cilindro('plastico', cor, x, y - raio * 0.5, z, raio, raio, 'y', 10);
  m.cilindro('plastico', '#3a3d41', x, y - raio * 1.2, z, raio * 0.8, raio * 0.5, 'y', 6);
  m.cilindro('metal', LATAO, x, y - raio * 1.5, z, raio * 0.42, raio * 0.3, 'y', 8);
}

/** Borne de bateria no topo: base isolante colorida, prisioneiro de latão e porca. */
export function borneDeTopo(m: Molde, x: number, y: number, z: number, tipo: TipoTerminal): void {
  m.cilindro('plastico', tipo === 'cc+' ? '#c62828' : '#1d1f21', x, y + 0.005, z, 0.024, 0.01, 'y', 16, 0.021);
  m.cilindro('metal', ACO, x, y + 0.0135, z, 0.0125, 0.007, 'y', 6);
  m.cilindro('metal', LATAO, x, y + 0.019, z, 0.0065, 0.018, 'y', 8);
}

/** Polo de chumbo de bateria estacionária ou de carro, com a arruela colorida. */
export function poloDeChumbo(m: Molde, x: number, y: number, z: number, tipo: TipoTerminal): void {
  m.cilindro('plastico', tipo === 'cc+' ? '#c62828' : '#1d1f21', x, y + 0.0015, z, 0.018, 0.003, 'y', 14);
  m.cilindro('metal', '#a9acaf', x, y + 0.012, z, 0.0105, 0.02, 'y', 10, 0.0088);
}

/**
 * Plugue de tomada do padrão brasileiro, em pé, com os dois pinos para cima e o fio saindo por baixo
 * até `origemDoFio`, de onde o aparelho o alimenta.
 */
export function plugue(m: Molde, x: number, y: number, z: number, origemDoFio?: V3, cor = '#2b2d30'): void {
  m.bloco('plastico', cor, x, y + 0.022, z, 0.04, 0.034, 0.02, 0.006);
  m.cilindro('plastico', cor, x, y + 0.004, z, 0.008, 0.012, 'y', 8, 0.012);
  for (const dx of [-0.0095, 0.0095]) m.cilindro('metal', LATAO, x + dx, y + 0.048, z, 0.0024, 0.02, 'y', 6);
  if (origemDoFio) {
    const meio: V3 = [(x + origemDoFio[0]) / 2, Math.min(y, origemDoFio[1]) + 0.004, (z + origemDoFio[2]) / 2];
    m.tubo('plastico', cor, [[x, y + 0.004, z], meio, origemDoFio], 0.0035, 4, 8);
  }
}

/** Altura acima da base em que o cabo se liga ao plugue em pé. */
export const TOPO_DO_PLUGUE = 0.05;

/** Conector de fios para lâmpada e chuveiro: bloco de emenda na parede. */
export function emenda(m: Molde, x: number, y: number, z: number): void {
  m.bloco('plastico', '#f1f1ee', x, y, z, 0.034, 0.02, 0.022, 0.004);
  for (const dx of [-0.008, 0.008]) m.cilindro('metal', LATAO, x + dx, y + 0.0105, z, 0.003, 0.003, 'y', 6);
}

/** Conector MC4 deitado ao longo de Y, com a boca para cima (+Y), e a cinta que diz se é positivo ou negativo. */
export function mc4(m: Molde, x: number, y: number, z: number, tipo: TipoTerminal): void {
  m.cilindro('plastico', PRETO, x, y - 0.012, z, 0.0105, 0.05, 'y', 10);
  m.cilindro('plastico', '#2c2e31', x, y - 0.04, z, 0.013, 0.012, 'y', 6);
  m.cilindro('plastico', tipo === 'cc+' ? '#d32f2f' : '#3d4a52', x, y + 0.004, z, 0.0118, 0.008, 'y', 10);
  m.cilindro('metal', LATAO, x, y + 0.014, z, 0.004, 0.006, 'y', 6);
}

/** Mesa simples: tampo e duas laterais, com travessa atrás. O tampo termina em `yTopo`. */
export function mesa(m: Molde, cx: number, yTopo: number, cz: number, largura: number, prof: number, altura: number, tampo = '#b48d62', pes = '#e9e9e6'): void {
  m.bloco('plastico', tampo, cx, yTopo - 0.015, cz, largura, 0.03, prof, 0.004);
  const hp = altura - 0.03;
  for (const s of [-1, 1]) m.bloco('plastico', pes, cx + s * (largura / 2 - 0.03), yTopo - 0.03 - hp / 2, cz, 0.03, hp, prof - 0.06);
  m.bloco('plastico', pes, cx, yTopo - 0.03 - 0.16, cz - prof / 2 + 0.06, largura - 0.09, 0.3, 0.018);
}

/** Quatro pés cilíndricos sob uma caixa. */
export function pes(m: Molde, cx: number, yBase: number, cz: number, largura: number, prof: number, altura: number, raio = 0.018, cor = '#1f2023'): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.cilindro('plastico', cor, cx + sx * (largura / 2 - raio * 1.6), yBase + altura / 2, cz + sz * (prof / 2 - raio * 1.6), raio, altura, 'y', 8);
    }
  }
}
