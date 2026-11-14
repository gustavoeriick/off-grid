// Modelos das proteções: disjuntor de corrente alternada (1 módulo), disjuntor de corrente contínua (2),
// DPS (2, com janela de estado verde) e porta-fusível ANL ou Mega. Especificação: docs/especificacao/fase-2.md, seção 1.3.
//
// Quadro local: X ao longo do trilho, Y para cima (o cabo entra por cima e sai por baixo), Z para a frente.
// As peças de trilho têm o fundo em z = −PROFUNDIDADE / 2, que é a face do trilho. O porta-fusível é comprido em Y.

import * as THREE from 'three';
import type { Protecao } from '../catalogo/tipos';
import { estampa, texto } from './estampas';
import { Molde } from './molde';

const MODULO = 0.018;
const ALTURA = 0.085;
export const PROFUNDIDADE_DA_PROTECAO = 0.066;

export interface ModeloDeProtecao {
  grupo: THREE.Group;
  /** Largura em X e altura em Y. */
  largura: number;
  altura: number;
}

const modelos = new Map<string, ModeloDeProtecao>();

function etiqueta(chave: string, linhas: string[], cor = '#1c2630'): THREE.Material {
  return estampa(`prot-${chave}`, 96, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    linhas.forEach((l, i) => texto(g, l, w / 2, (h * (i + 0.5)) / linhas.length, linhas.length > 1 ? 24 : 34, cor, 'center', 'bold', w - 6));
  }, { transparente: true });
}

/** Corpo de disjuntor de trilho: fundo alto junto ao trilho e nariz na frente, com os parafusos dos bornes. */
function corpoDeTrilho(m: Molde, largura: number, altura: number, cor: string): void {
  const P = PROFUNDIDADE_DA_PROTECAO;
  const fundo = P * 0.64;
  m.bloco('plastico', cor, 0, 0, -P / 2 + fundo / 2, largura - 0.0006, altura, fundo, 0.0015);
  m.bloco('plastico', cor, 0, 0, P / 2 - (P - fundo) / 2 - 0.001, largura - 0.0006, 0.045, P - fundo + 0.002, 0.0015);
  const polos = Math.round(largura / MODULO);
  for (let i = 0; i < polos; i++) {
    const x = -largura / 2 + (i + 0.5) * MODULO;
    for (const s of [-1, 1]) {
      m.cilindro('metal', '#b9bdc1', x, s * (altura / 2 - 0.011), -P / 2 + fundo + 0.0004, 0.0038, 0.0012, 'z', 8);
      m.bloco('plastico', '#2a2c2f', x, s * (altura / 2 - 0.0005), -P / 2 + fundo * 0.62, 0.009, 0.0012, 0.01);
    }
  }
}

function disjuntor(item: Protecao, m: Molde): [number, number] {
  const cc = item.tipo === 'disjuntorCC';
  const largura = (cc ? 2 : 1) * MODULO;
  const P = PROFUNDIDADE_DA_PROTECAO;
  corpoDeTrilho(m, largura, ALTURA, '#f3f3ef');
  // Alavanca para cima (ligado). No de dois polos, uma barra une as duas.
  const corAlavanca = cc ? '#c62828' : '#1b1c1e';
  const polos = cc ? 2 : 1;
  for (let i = 0; i < polos; i++) {
    const x = -largura / 2 + (i + 0.5) * MODULO;
    m.bloco('plastico', '#dcdcd7', x, 0.004, P / 2 + 0.0005, 0.009, 0.02, 0.003, 0.001);
    m.bloco('plastico', corAlavanca, x, 0.011, P / 2 + 0.006, 0.0062, 0.008, 0.012, 0.0015, ['x', -0.5]);
  }
  if (cc) m.bloco('plastico', corAlavanca, 0, 0.0135, P / 2 + 0.0105, MODULO + 0.006, 0.0042, 0.0042, 0.001);
  m.estampa(etiqueta(`${item.tipo}-${item.correnteA}`, [cc ? 'CC' : 'CA', `${item.correnteA} A`]), 0, -0.012, P / 2 + 0.0012, Math.min(largura, 0.02) * 0.86, 0.0125, 'pz');
  // Janela de estado.
  m.bloco('luz', '#39d353', largura / 2 - 0.005, 0.019, P / 2 + 0.0012, 0.0045, 0.003, 0.0006);
  return [largura, ALTURA];
}

function dps(item: Protecao, m: Molde): [number, number] {
  const largura = 2 * MODULO;
  const altura = 0.09;
  const P = PROFUNDIDADE_DA_PROTECAO;
  corpoDeTrilho(m, largura, altura, '#e9e9e4');
  // Dois cartuchos de encaixe, cada um com a janela de estado verde.
  for (let i = 0; i < 2; i++) {
    const x = -largura / 2 + (i + 0.5) * MODULO;
    m.bloco('plastico', '#fafaf7', x, 0, P / 2 + 0.0015, MODULO - 0.0024, 0.047, 0.006, 0.0015);
    m.bloco('plastico', '#1565c0', x, -0.019, P / 2 + 0.0048, MODULO - 0.0024, 0.006, 0.0008);
    m.bloco('plastico', '#1b1c1e', x, 0.014, P / 2 + 0.0047, 0.0086, 0.0086, 0.0008);
    m.bloco('luz', '#2fe05a', x, 0.014, P / 2 + 0.0052, 0.0064, 0.0064, 0.0006);
  }
  m.estampa(etiqueta(`dps-${item.tensaoMaxV}`, ['DPS', `${item.tensaoMaxV} V`]), 0, -0.003, P / 2 + 0.0048, largura * 0.8, 0.014, 'pz');
  return [largura, altura];
}

function portaFusivel(item: Protecao, m: Molde): [number, number] {
  const mega = /mega/i.test(item.id);
  const largura = 0.046;
  const altura = mega ? 0.1 : 0.13;
  // Base preta, dois prisioneiros com porca e a lâmina do fusível entre eles, sob uma capa transparente.
  m.bloco('plastico', '#17181a', 0, 0, -0.009, largura, altura, 0.03, 0.004);
  const yp = altura / 2 - 0.02;
  const zl = 0.0075;
  for (const s of [-1, 1]) {
    m.cilindro('metal', '#d1b45a', 0, s * yp, zl + 0.006, 0.0055, 0.022, 'z', 8);
    m.cilindro('metal', '#c9cdd1', 0, s * yp, zl + 0.006, 0.0105, 0.006, 'z', 6);
    m.bloco('metal', '#c9a063', 0, s * (yp - 0.004), zl, 0.022, 0.026, 0.002);
  }
  m.bloco('metal', '#c9a063', 0, 0, zl, 0.012, yp * 2 - 0.03, 0.002);
  // Corpo do fusível, com a corrente escrita.
  m.bloco('plastico', mega ? '#c8811e' : '#e7c84a', 0, 0, zl + 0.003, 0.024, altura * 0.3, 0.005, 0.0015);
  m.estampa(etiqueta(`fusivel-${item.correnteA}`, [`${item.correnteA} A`], '#1b1b1b'), 0, 0, zl + 0.0058, altura * 0.26, 0.02, 'pz', Math.PI / 2);
  m.bloco('vidro', '#cfe3ee', 0, 0, zl + 0.008, largura - 0.004, altura - 0.006, 0.016, 0.004);
  return [largura, altura];
}

/** Molde de uma proteção do catálogo. As peças da cena são cópias dele. */
export function modeloDaProtecao(item: Protecao): ModeloDeProtecao {
  let modelo = modelos.get(item.id);
  if (!modelo) {
    const m = new Molde();
    const [largura, altura] = item.tipo === 'fusivel' ? portaFusivel(item, m) : item.tipo === 'dps' ? dps(item, m) : disjuntor(item, m);
    const grupo = m.montar();
    grupo.name = `protecao-${item.id}`;
    modelo = { grupo, largura, altura };
    modelos.set(item.id, modelo);
  }
  return modelo;
}

export function liberarProtecoes(): void {
  for (const modelo of modelos.values()) {
    modelo.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  modelos.clear();
}
