// Modelos das proteções: disjuntor de corrente alternada (1 módulo), disjuntor de corrente contínua (2),
// DPS (2, com janela de estado verde) e porta-fusível ANL ou Mega. Especificação: docs/especificacao/fase-2.md, seção 1.3.
//
// Quadro local: X ao longo do trilho, Y para cima (o cabo entra por cima e sai por baixo), Z para a frente.
// As peças de trilho têm o fundo em z = −PROFUNDIDADE / 2, que é a face do trilho. O porta-fusível é comprido em Y.
//
// Fase 8 (docs/especificacao/operar.md, seções 2 e 7): cada proteção é uma chave. As partes que mudam com o estado são
// filhos com nome: no disjuntor, `alavanca`, `janela-fechada`, `janela-aberta` e `fuligem`; no porta-fusível, `fusivel`,
// `fusivel-queimado`, `tampa` e `tampa-queimada`. `aplicarEstadoDaProtecao` põe cada cópia no estado dela.

import * as THREE from 'three';
import type { Protecao } from '../catalogo/tipos';
import type { EstadoProtecao } from '../nucleo/tipos';
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

/** Giro da alavanca em torno do eixo dela: para cima é fechado (ligado), para baixo é aberto, no meio é o disjuntor que queimou. */
const GIRO_DA_ALAVANCA: Record<EstadoProtecao, number> = { fechada: -0.65, aberta: 0.65, queimada: 0 };

function disjuntor(item: Protecao, m: Molde): [number, number] {
  const cc = item.tipo === 'disjuntorCC';
  const largura = (cc ? 2 : 1) * MODULO;
  const P = PROFUNDIDADE_DA_PROTECAO;
  corpoDeTrilho(m, largura, ALTURA, '#f3f3ef');
  const corAlavanca = cc ? '#c62828' : '#1b1c1e';
  const polos = cc ? 2 : 1;
  // A alavanca gira em torno de um eixo na face do nariz. No de dois polos, uma barra une as duas.
  const alavanca = m.filho('alavanca', [0, 0.004, P / 2 + 0.001]);
  for (let i = 0; i < polos; i++) {
    const x = -largura / 2 + (i + 0.5) * MODULO;
    m.bloco('plastico', '#dcdcd7', x, 0.004, P / 2 + 0.0005, 0.0105, 0.024, 0.003, 0.001);
    alavanca.cilindro('plastico', corAlavanca, x, 0, 0, 0.0042, 0.0076, 'x', 10);
    alavanca.bloco('plastico', corAlavanca, x, 0, 0.0075, 0.0076, 0.0084, 0.015, 0.0016);
  }
  if (cc) alavanca.bloco('plastico', corAlavanca, 0, 0, 0.0135, MODULO + 0.0076, 0.0046, 0.0046, 0.001);
  m.estampa(etiqueta(`${item.tipo}-${item.correnteA}`, [cc ? 'CC' : 'CA', `${item.correnteA} A`]), 0, -0.014, P / 2 + 0.0012, Math.min(largura, 0.02) * 0.86, 0.0125, 'pz');
  // Janela de estado, como nos disjuntores de verdade: vermelha com o contato fechado (há tensão do outro lado), verde com ele aberto.
  const xj = largura / 2 - 0.005;
  m.bloco('plastico', '#1b1c1e', xj, 0.0215, P / 2 + 0.001, 0.0058, 0.0042, 0.0006);
  m.filho('janela-fechada').bloco('luz', '#ff3b30', xj, 0.0215, P / 2 + 0.0014, 0.0046, 0.003, 0.0006);
  m.filho('janela-aberta').bloco('luz', '#39d353', xj, 0.0215, P / 2 + 0.0014, 0.0046, 0.003, 0.0006);
  // Disjuntor queimado pelo arco: fuligem em volta da alavanca e subindo pelo corpo.
  const fuligem = m.filho('fuligem');
  const fundo = P * 0.64;
  fuligem.esfera('plastico', '#15110e', 0, 0.006, P / 2 + 0.0008, largura * 0.52, [1, 1.5, 0.1], 10);
  fuligem.esfera('plastico', '#1d1713', largura * 0.1, 0.03, -P / 2 + fundo + 0.0004, largura * 0.42, [1, 1.3, 0.08], 8);
  fuligem.esfera('plastico', '#241c17', -largura * 0.18, -0.012, P / 2 + 0.0016, largura * 0.3, [1, 1, 0.08], 8);
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

/** Medidas do porta-fusível que o estado usa: onde o fusível tirado fica e por onde a tampa abre. */
const LARGURA_DO_PORTA_FUSIVEL = 0.046;
/** Altura, acima do meio da base, da lâmina do fusível colocado. */
const Z_DA_LAMINA = 0.0075;

function portaFusivel(item: Protecao, m: Molde): [number, number] {
  const mega = /mega/i.test(item.id);
  const largura = LARGURA_DO_PORTA_FUSIVEL;
  const altura = mega ? 0.1 : 0.13;
  // Base preta e dois prisioneiros com porca, cada um sobre a sapata de latão em que o cabo e o fusível são presos.
  m.bloco('plastico', '#17181a', 0, 0, -0.009, largura, altura, 0.03, 0.004);
  const yp = altura / 2 - 0.02;
  const zl = Z_DA_LAMINA;
  for (const s of [-1, 1]) {
    m.cilindro('metal', '#d1b45a', 0, s * yp, zl + 0.006, 0.0055, 0.022, 'z', 8);
    m.cilindro('metal', '#c9cdd1', 0, s * yp, zl + 0.008, 0.0105, 0.006, 'z', 6);
    m.bloco('metal', '#b08a4e', 0, s * (yp - 0.002), zl - 0.0012, 0.024, 0.024, 0.0018);
  }
  const corpo = mega ? '#c8811e' : '#e7c84a';
  const vao = yp * 2 - 0.03;
  // O fusível é uma peça só: duas pontas furadas, a lâmina que funde entre elas e o corpo com a corrente escrita.
  const pontas = (f: Molde, cor: string): void => {
    for (const s of [-1, 1]) f.bloco('metal', cor, 0, s * (yp - 0.004), zl + 0.0008, 0.021, 0.025, 0.002);
  };
  const fusivel = m.filho('fusivel');
  pontas(fusivel, '#d6c08a');
  fusivel.bloco('metal', '#d6c08a', 0, 0, zl + 0.0008, 0.012, vao, 0.002);
  fusivel.bloco('plastico', corpo, 0, 0, zl + 0.003, 0.024, altura * 0.3, 0.005, 0.0015);
  fusivel.estampa(etiqueta(`fusivel-${item.correnteA}`, [`${item.correnteA} A`], '#1b1b1b'), 0, 0, zl + 0.0058, altura * 0.26, 0.02, 'pz', Math.PI / 2);
  // Queimado: a lâmina rompida no meio, com as pontas derretidas, o corpo partido e escurecido e fuligem na base.
  const queimado = m.filho('fusivel-queimado');
  pontas(queimado, '#8a7a5c');
  const resto = vao / 2 - 0.007;
  for (const s of [-1, 1]) {
    queimado.bloco('metal', '#5c4f3e', 0, s * (0.007 + resto / 2), zl + 0.0008, 0.012, resto, 0.002);
    queimado.esfera('metal', '#2b2420', s * 0.002, s * 0.008, zl + 0.0016, 0.005, [1.2, 0.8, 0.6], 8);
    queimado.bloco('plastico', mega ? '#5e3c12' : '#6b5b22', 0, s * (altura * 0.09 + 0.006), zl + 0.003, 0.024, altura * 0.11, 0.005, 0.0015, ['z', s * 0.09]);
  }
  queimado.esfera('plastico', '#0f0c0a', 0, 0, zl - 0.0008, 0.021, [1, 1.6, 0.1], 10);
  queimado.esfera('plastico', '#19130f', 0.008, 0.02, 0.0062, 0.016, [1, 1.3, 0.08], 8);
  // Tampa transparente, presa pela borda esquerda: abre para tirar e pôr o fusível. A do fusível queimado fica enfumaçada.
  for (const [nome, cor] of [['tampa', '#cfe3ee'], ['tampa-queimada', '#9a8672']] as const) {
    m.filho(nome, [-(largura - 0.004) / 2, 0, zl + 0.0005]).bloco('vidro', cor, (largura - 0.004) / 2, 0, 0.0075, largura - 0.004, altura - 0.006, 0.016, 0.004);
  }
  return [largura, altura];
}

/**
 * Põe uma cópia do molde no estado da proteção: a alavanca do disjuntor para cima (fechado), para baixo (aberto) ou no
 * meio, com fuligem (queimado); o fusível colocado, fora do porta-fusível ao lado dele, ou rompido e escurecido.
 * O DPS não tem chave: fica como é.
 */
export function aplicarEstadoDaProtecao(peca: THREE.Object3D, item: Protecao, estado: EstadoProtecao): void {
  if (item.tipo === 'dps' || peca.userData.estadoDaProtecao === estado) return;
  peca.userData.estadoDaProtecao = estado;
  const parte = (nome: string): THREE.Object3D | undefined => peca.children.find((o) => o.name === nome);
  const mostrar = (nome: string, visivel: boolean): void => {
    const o = parte(nome);
    if (o) o.visible = visivel;
  };
  if (item.tipo === 'fusivel') {
    const fusivel = parte('fusivel');
    const tampa = parte('tampa');
    mostrar('fusivel', estado !== 'queimada');
    mostrar('fusivel-queimado', estado === 'queimada');
    mostrar('tampa', estado !== 'queimada');
    mostrar('tampa-queimada', estado === 'queimada');
    if (fusivel) {
      // Aberto: o fusível fica deitado ao lado da base, à vista, e a tampa fica levantada.
      if (estado === 'aberta') {
        fusivel.position.set(LARGURA_DO_PORTA_FUSIVEL * 1.08, 0, -(Z_DA_LAMINA + 0.022));
        fusivel.rotation.set(0, 0, 0.32);
      } else {
        fusivel.position.set(0, 0, 0);
        fusivel.rotation.set(0, 0, 0);
      }
    }
    if (tampa) tampa.rotation.y = estado === 'aberta' ? -1.75 : 0;
    return;
  }
  const alavanca = parte('alavanca');
  if (alavanca) alavanca.rotation.x = GIRO_DA_ALAVANCA[estado];
  mostrar('janela-fechada', estado === 'fechada');
  mostrar('janela-aberta', estado === 'aberta');
  mostrar('fuligem', estado === 'queimada');
}

/**
 * Caixa, em coordenadas da proteção, que responde ao clique: a peça inteira e, com o fusível tirado, também o lugar
 * ao lado da base em que ele fica.
 */
export function caixaDaChave(item: Protecao, estado: EstadoProtecao, alvo = new THREE.Box3()): THREE.Box3 {
  const { largura, altura } = modeloDaProtecao(item);
  if (item.tipo === 'fusivel') {
    alvo.min.set(-largura / 2, -altura / 2, -0.024);
    alvo.max.set(largura / 2 + (estado === 'aberta' ? largura * 1.2 : 0), altura / 2, 0.026);
  } else {
    alvo.min.set(-largura / 2, -altura / 2, -PROFUNDIDADE_DA_PROTECAO / 2);
    alvo.max.set(largura / 2, altura / 2, PROFUNDIDADE_DA_PROTECAO / 2 + 0.018);
  }
  return alvo;
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
    // O molde nasce fechado; cada cópia recebe depois o estado da proteção dela.
    aplicarEstadoDaProtecao(grupo, item, 'fechada');
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
