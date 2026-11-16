// Modelos procedurais dos equipamentos. Especificação: docs/especificacao/fase-2.md, seção 2,
// e docs/especificacao/cena-e-interface.md, seção 5 (medidas e posição dos terminais).
//
// Cada item do catálogo tem um molde só, feito na primeira vez em que aparece: as peças iguais da cena
// são cópias que usam as mesmas geometrias e os mesmos materiais. Não há marca real: o logotipo é genérico
// e os textos das etiquetas vêm dos dados do catálogo.

import * as THREE from 'three';
import type { Acessorio, Bateria, Controlador, Dimensoes, Inversor, Item, Placa } from '../catalogo/tipos';
import { terminaisDe } from '../nucleo/terminais';
import type { DefTerminal } from '../nucleo/tipos';
import { construirAparelho } from './aparelhos';
import { borneDeBaixo, borneDeTopo, type Marcar, mc4, poloDeChumbo } from './conectores';
import { dimensoesDe } from './encaixe';
import { estampa, logotipo, retangulo, texto, tomadaBR, visorApagado } from './estampas';
import { Molde, type V3 } from './molde';

export interface TerminalDoModelo extends DefTerminal {
  /** Onde o cabo se liga, em coordenadas da peça. */
  pos: V3;
  /** Direção em que o cabo sai do terminal, em coordenadas da peça. */
  saida: V3;
  /** Raio do anel colorido. */
  raio: number;
}

export interface Modelo {
  /** Molde da peça. A cena usa cópias dele (`clone()`), que dividem geometrias e materiais. */
  grupo: THREE.Group;
  terminais: TerminalDoModelo[];
  dimensoes: Dimensoes;
  /** Caixa que envolve o desenho inteiro, com os móveis, em coordenadas da peça. */
  volume: THREE.Box3;
  triangulos: number;
  /** Onde fica o visor de cristal líquido na face da frente da peça. Nulo na peça que não tem visor. */
  visor: LugarDoVisor | null;
}

/** Retângulo do visor na peça, virado para +Z: centro, em coordenadas da peça, e medidas. */
export interface LugarDoVisor {
  centro: V3;
  largura: number;
  altura: number;
}

/** Registra o lugar do visor da peça. Os números ao vivo são desenhados ali pela camada de operação. */
type MarcarVisor = (centro: V3, largura: number, altura: number) => void;

/** Limite da especificação, por peça. */
export const MAX_TRIANGULOS = 3000;

const modelos = new Map<string, Modelo | null>();

/** Número escrito como no Brasil: 1.024. */
function numero(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** Número pequeno e estável tirado do `id`, para variar cor entre itens sem sorteio. */
function variante(id: string, opcoes: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % opcoes;
}

// ---------------------------------------------------------------- Placa

function estampaDeCelulas(item: Placa, l: number, a: number): THREE.Material {
  const poli = /poli/i.test(item.nome);
  const grande = item.largura > 1;
  return estampa(`celulas-${item.id}`, 512, Math.min(1024, Math.round((512 * a) / l)), (g, w, h) => {
    g.fillStyle = '#e6e8ea';
    g.fillRect(0, 0, w, h);
    const margem = w * 0.022;
    const colunas = grande ? 6 : 4;
    const lc = (w - 2 * margem) / colunas;
    // Meia-célula: cada célula é a metade de um quadrado, em dois blocos separados por uma faixa no meio.
    const blocos = grande ? 2 : 1;
    const faixa = grande ? h * 0.012 : 0;
    const hBloco = (h - 2 * margem - faixa * (blocos - 1)) / blocos;
    const linhas = Math.max(1, Math.round(hBloco / (grande ? lc / 2 : lc)));
    const hc = hBloco / linhas;
    const barras = grande ? 9 : 4;
    for (let b = 0; b < blocos; b++) {
      const y0 = margem + b * (hBloco + faixa);
      for (let i = 0; i < colunas; i++) {
        for (let j = 0; j < linhas; j++) {
          const x = margem + i * lc;
          const y = y0 + j * hc;
          const grad = g.createLinearGradient(x, y, x + lc, y + hc);
          if (poli) {
            grad.addColorStop(0, '#22428a');
            grad.addColorStop(1, '#1a3270');
          } else {
            grad.addColorStop(0, '#16285a');
            grad.addColorStop(1, '#0c1838');
          }
          g.fillStyle = grad;
          g.fillRect(x + 1.2, y + 1.2, lc - 2.4, hc - 2.4);
          if (poli) {
            // Cristais do silício policristalino.
            for (let k = 0; k < 14; k++) {
              g.fillStyle = `rgba(120,160,255,${0.05 + ((i * 7 + j * 13 + k * 5) % 10) / 90})`;
              g.fillRect(x + ((k * 37 + j * 11) % 100) / 100 * (lc - 14) + 2, y + ((k * 53 + i * 17) % 100) / 100 * (hc - 12) + 2, 10, 8);
            }
          }
          g.fillStyle = 'rgba(200,208,220,0.6)';
          for (let k = 0; k < barras; k++) g.fillRect(x + ((k + 0.5) * lc) / barras - 0.4, y + 1.2, 0.8, hc - 2.4);
        }
      }
    }
    if (grande) {
      // Barramento do meio, entre os dois blocos.
      g.fillStyle = '#d5d9de';
      g.fillRect(margem, margem + hBloco, w - 2 * margem, faixa);
    }
  }, { rugosidade: 0.42, reflexo: 0.2 });
}

function placa(item: Placa, m: Molde, T: Marcar): void {
  const W = item.largura;
  const H = item.altura;
  const e = 0.035;
  const f = 0.02;
  const z0 = -e / 2;
  const z1 = e / 2;
  const alu = '#c3c7cb';
  // Moldura de alumínio anodizado, de 35 mm.
  m.caixa('metal', alu, -W / 2, H / 2 - f, z0, W / 2, H / 2, z1);
  m.caixa('metal', alu, -W / 2, -H / 2, z0, W / 2, -H / 2 + f, z1);
  m.caixa('metal', alu, -W / 2, -H / 2 + f, z0, -W / 2 + f, H / 2 - f, z1);
  m.caixa('metal', alu, W / 2 - f, -H / 2 + f, z0, W / 2, H / 2 - f, z1);
  // Laminado: vidro com as células na frente, um pouco abaixo da borda da moldura, e o fundo branco atrás.
  // O fundo fica 2 cm atrás do vidro: a 0,2 mm, de longe, as duas faces disputavam o mesmo ponto da tela
  // e a placa aparecia branca ou riscada em diagonal.
  m.caixa('plastico', '#e4e6e8', -W / 2 + f, -H / 2 + f, z0 + 0.004, W / 2 - f, H / 2 - f, z0 + 0.01);
  m.estampa(estampaDeCelulas(item, W - 2 * f, H - 2 * f), 0, 0, z1 - 0.004, W - 2 * f, H - 2 * f, 'pz');

  // Atrás: caixa de junção e os dois cabos curtos, que dão a volta na borda de cima e terminam em conectores MC4.
  const yCaixa = H / 2 - 0.22;
  m.bloco('plastico', '#1b1c1e', 0, yCaixa, z0 - 0.002, 0.12, 0.08, 0.02, 0.004);
  const yT = H / 2 - 0.1;
  for (const [sinal, id, tipo] of [[-1, 'pos', 'cc+'], [1, 'neg', 'cc-']] as const) {
    const x = sinal * 0.15;
    m.tubo('plastico', '#17181a', [
      [sinal * 0.04, yCaixa, z0 - 0.006],
      [sinal * 0.13, H / 2 - 0.09, z0 - 0.008],
      [x, H / 2 - 0.005, z0 - 0.007],
      [x, H / 2 + 0.008, 0],
      [x, H / 2 - 0.012, z1 + 0.009],
      [x, yT - 0.045, 0.03],
    ], 0.0035, 5, 18);
    mc4(m, x, yT - 0.012, 0.03, tipo);
    T(id, [x, yT, 0.03], [0, 0.55, 0.83], 0.024);
  }
}

// ---------------------------------------------------------------- Inversor híbrido de parede

function inversorDeParede(item: Inversor, m: Molde, T: Marcar, V: MarcarVisor): void {
  const [W, H, D] = item.dimensoes;
  const branco = variante(item.id, 2) === 0 ? '#eff0ee' : '#e3e5e6';
  const escuro = '#39424c';
  m.bloco('plastico', branco, 0, 0, 0, W, H, D, 0.012);
  // Frente em dois tons: faixa escura embaixo, com a tampa da régua de bornes.
  const hTampa = H * 0.27;
  m.bloco('plastico', escuro, 0, -H / 2 + hTampa / 2 + 0.006, D / 2 - 0.001, W - 0.014, hTampa, 0.008, 0.003);
  for (const sx of [-1, 1]) m.cilindro('metal', '#c9cdd1', sx * (W / 2 - 0.03), -H / 2 + 0.03, D / 2 + 0.003, 0.0045, 0.003, 'z', 8);
  m.estampa(
    estampa(`tampa-inversor-${item.saidaV}`, 256, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // Aviso de choque e as tensões de trabalho.
      g.fillStyle = '#f5c518';
      g.beginPath();
      g.moveTo(34, 20);
      g.lineTo(58, 64);
      g.lineTo(10, 64);
      g.closePath();
      g.fill();
      texto(g, '!', 34, 48, 30, '#1b1b1b');
      texto(g, `SAÍDA ${item.saidaV} V~`, 160, 34, 22, '#e9edf0');
      texto(g, 'BORNES SOB A TAMPA', 160, 64, 15, '#aeb7bf', 'center', '600');
    }, { transparente: true }),
    0, -H / 2 + hTampa / 2 + 0.012, D / 2 + 0.0036, W * 0.62, W * 0.62 * (96 / 256), 'pz',
  );
  // Painel: logotipo genérico, visor aceso, três luzes de estado e quatro botões.
  const lp = W * 0.7;
  const hp = lp * 0.86;
  const yp = H * 0.16;
  m.bloco('plastico', '#101214', 0, yp - hp * 0.08, D / 2 + 0.0005, lp, hp * 0.62, 0.003, 0.002);
  const kw = item.potenciaW >= 1000 ? `${numero(item.potenciaW / 1000)} kW` : `${item.potenciaW} W`;
  m.estampa(
    estampa(`painel-inversor-${item.id}`, 512, 440, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      logotipo(g, 70, 62, 34, '#e08a1c');
      texto(g, 'INVERSOR SOLAR', 110, 40, 30, '#2f3740', 'left');
      texto(g, `HÍBRIDO  ${kw}  ${item.tensaoBateria} V`, 110, 76, 24, '#5d6770', 'left', '600');
      retangulo(g, 16, 120, w - 32, 290, 16, '#101214');
      visorApagado(g, 44, 146, 270, 150);
      for (const [i, rotulo] of ['ESC', '▲', '▼', 'ENTER'].entries()) {
        retangulo(g, 44 + i * 70, 330, 58, 46, 10, '#2a2f35');
        texto(g, rotulo, 73 + i * 70, 354, rotulo.length > 1 ? 15 : 22, '#cfd5da');
      }
      for (const [i, rotulo] of ['REDE', 'CARGA', 'FALHA'].entries()) texto(g, rotulo, 410, 170 + i * 56, 18, '#aeb7bf', 'left', '600');
    }, { transparente: true, acesa: 0.35 }),
    0, yp, D / 2 + 0.0024, lp, hp, 'pz',
  );
  V([lp * ((44 + 135) / 512 - 0.5), yp + hp * (0.5 - (146 + 75) / 440), D / 2 + 0.0034], (lp * 276) / 512, (hp * 156) / 440);
  const luzes = ['#39d353', '#ffb300', '#5a2a2a'];
  for (let i = 0; i < 3; i++) {
    m.esfera(i < 2 ? 'luz' : 'plastico', luzes[i]!, lp * (370 / 512 - 0.5), yp + hp * (0.5 - (170 + i * 56) / 440), D / 2 + 0.003, 0.005, [1, 1, 0.5], 8);
  }
  // Aletas de ventilação nas laterais.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) m.bloco('plastico', '#585e66', sx * (W / 2 + 0.0002), H * 0.3 - i * 0.022, -D * 0.05, 0.002, 0.009, D * 0.62);
  }
  // Régua de bornes embaixo: um prensa-cabo por terminal, da esquerda para a direita.
  const terminais = terminaisDe(item);
  const n = terminais.length;
  const raio = Math.min(0.016, (W / n) * 0.3);
  terminais.forEach((t, i) => {
    const x = -W / 2 + ((i + 0.5) * W) / n;
    borneDeBaixo(m, x, -H / 2, 0, raio);
    T(t.id, [x, -H / 2 - raio * 1.4, 0], [0, -1, 0], Math.min(0.026, (W / n) * 0.44));
  });
}

// ---------------------------------------------------------------- Controlador de carga

function controlador(item: Controlador, m: Molde, T: Marcar, V: MarcarVisor): void {
  const [W, H, D] = item.dimensoes;
  const mppt = item.solar.tipo === 'mppt';
  const zFundo = -D / 2;
  // Dissipador aletado atrás.
  const dd = D * 0.4;
  m.caixa('metal', '#7d858d', -W / 2, -H / 2, zFundo, W / 2, H / 2, zFundo + dd * 0.5);
  const nAletas = Math.max(5, Math.round(W / 0.014));
  for (let i = 0; i < nAletas; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / nAletas;
    m.caixa('metal', '#8b939b', x - W / nAletas / 4, -H / 2, zFundo + dd * 0.5, x + W / nAletas / 4, H / 2, zFundo + dd);
  }
  // Corpo na frente, menor que o dissipador.
  const hc = H * (mppt ? 0.74 : 0.8);
  const yc = mppt ? -H * 0.04 : 0;
  const corpo = mppt ? '#242a31' : '#1f2a44';
  m.bloco('plastico', corpo, 0, yc, zFundo + dd + (D - dd) / 2, W * 0.94, hc, D - dd, Math.min(0.008, D * 0.12));
  const zf = D / 2;
  const amp = `${item.solar.correnteCargaA} A`;
  if (mppt) {
    m.estampa(
      estampa(`painel-ctl-${item.id}`, 512, 300, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        logotipo(g, 52, 50, 28, '#e08a1c');
        texto(g, `MPPT  ${amp}`, 96, 36, 30, '#e9edf0', 'left');
        texto(g, `${item.tensoesBateria.join(' / ')} V`, 96, 70, 20, '#aeb7bf', 'left', '600');
        visorApagado(g, 150, 110, 212, 120);
        for (const x of [70, 440]) {
          g.fillStyle = '#39424c';
          g.beginPath();
          g.arc(x, 170, 26, 0, Math.PI * 2);
          g.fill();
        }
        texto(g, 'SELECT', 70, 216, 14, '#aeb7bf', 'center', '600');
        texto(g, 'ENTER', 440, 216, 14, '#aeb7bf', 'center', '600');
      }, { transparente: true, acesa: 0.35 }),
      0, yc + hc * 0.1, zf + 0.0006, W * 0.8, W * 0.8 * (300 / 512), 'pz',
    );
    const he = W * 0.8 * (300 / 512);
    V([0, yc + hc * 0.1 + he * (0.5 - 170 / 300), zf + 0.0016], (W * 0.8 * 218) / 512, (he * 126) / 300);
  } else {
    m.estampa(
      estampa(`painel-ctl-${item.id}`, 384, 160, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        logotipo(g, 40, 44, 24, '#f2c94c');
        texto(g, `PWM  ${amp}`, 78, 32, 28, '#ffffff', 'left');
        texto(g, `${item.tensoesBateria.join(' / ')} V`, 78, 62, 18, '#c5cedd', 'left', '600');
        for (const [i, rotulo] of ['PLACA', 'BATERIA', 'CARGA'].entries()) texto(g, rotulo, 86 + i * 106, 138, 17, '#c5cedd', 'center', '600');
      }, { transparente: true }),
      0, yc + hc * 0.08, zf + 0.0006, W * 0.86, W * 0.86 * (160 / 384), 'pz',
    );
    // Três luzes: placa, bateria e carga.
    const lw = W * 0.86;
    const cores = ['#39d353', '#39d353', '#ff5252'];
    for (let i = 0; i < 3; i++) m.esfera('luz', cores[i]!, lw * ((86 + i * 106) / 384 - 0.5), yc + hc * 0.08 - lw * (160 / 384) * (100 / 160 - 0.5), zf + 0.001, Math.min(0.004, H * 0.05), [1, 1, 0.5], 8);
  }
  // Bornes embaixo, em uma régua.
  const terminais = terminaisDe(item);
  const n = terminais.length;
  const raio = Math.min(0.013, (W / n) * 0.27);
  m.bloco('plastico', mppt ? '#111315' : '#1e6b3c', 0, -H / 2 + raio * 0.6, zFundo + dd + (D - dd) / 2, W * 0.9, raio * 1.6, (D - dd) * 0.9, 0.002);
  terminais.forEach((t, i) => {
    const x = -W / 2 + ((i + 0.5) * W) / n;
    borneDeBaixo(m, x, -H / 2, zFundo + dd + (D - dd) / 2, raio, mppt ? '#17181a' : '#17512e');
    m.cilindro('metal', '#c9cdd1', x, -H / 2 + raio * 0.7, zf + 0.0005, raio * 0.42, 0.002, 'z', 8);
    T(t.id, [x, -H / 2 - raio * 1.4, zFundo + dd + (D - dd) / 2], [0, -1, 0], Math.min(0.024, (W / n) * 0.42));
  });
}

// ---------------------------------------------------------------- Baterias

function bateriaDeLitio(item: Bateria, m: Molde, T: Marcar, V: MarcarVisor): void {
  const [W, H, D] = item.dimensoes;
  const rack = item.tensao === 48;
  const corpo = rack ? '#2c3035' : variante(item.id, 2) === 0 ? '#4d6883' : '#222528';
  const clara = corpo === '#4d6883';
  m.bloco('plastico', corpo, 0, 0, 0, W, H, D, 0.012);
  // Tampa rebaixada no topo.
  m.bloco('plastico', clara ? '#3e566e' : '#16181a', 0, H / 2 - 0.001, 0, W - 0.03, 0.004, D - 0.03, 0.002);
  // Alças laterais.
  for (const sx of [-1, 1]) {
    const x = sx * W / 2;
    const za = Math.min(0.09, D * 0.3);
    m.tubo('plastico', '#141516', [[x, H * 0.2, -za], [x + sx * 0.022, H * 0.27, -za * 0.5], [x + sx * 0.022, H * 0.27, za * 0.5], [x, H * 0.2, za]], 0.006, 5, 10);
    for (const sz of [-1, 1]) m.bloco('plastico', '#141516', x, H * 0.2, sz * za, 0.012, 0.03, 0.03, 0.003);
  }
  // Etiqueta com os dados do catálogo e visor de carga.
  const le = Math.min(W * 0.84, 0.44);
  const he = Math.min(H * 0.66, le * 0.42);
  m.estampa(
    estampa(`etiqueta-${item.id}`, 512, Math.round((512 * he) / le), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      retangulo(g, 4, 4, w - 8, h - 8, 14, clara ? '#f0f2f4' : '#e8eaec');
      logotipo(g, 54, h * 0.26, 30, '#2a7de1');
      texto(g, 'LiFePO4', 100, h * 0.2, h * 0.17, '#1c2630', 'left');
      texto(g, 'BATERIA DE LÍTIO', 100, h * 0.38, h * 0.085, '#5d6770', 'left', '600');
      texto(g, `${item.tensao} V   ${item.ah} Ah`, 30, h * 0.68, h * 0.2, '#1c2630', 'left');
      texto(g, `${numero(item.ciclos)} ciclos`, 30, h * 0.88, h * 0.08, '#5d6770', 'left', '600');
      // Visor pequeno de carga: a porcentagem ao vivo é desenhada por cima.
      visorApagado(g, w * 0.66 + 3, h * 0.5 + 3, w * 0.29 - 6, h * 0.38 - 6);
    }, { transparente: true, acesa: 0.3 }),
    0, -H * 0.02, D / 2 + 0.0006, le, he, 'pz',
  );
  V([le * (0.66 + 0.145 - 0.5), -H * 0.02 + he * (0.5 - 0.69), D / 2 + 0.0016], le * 0.29, he * 0.38);
  const x = W / 2 - 0.07;
  borneDeTopo(m, -x, H / 2, 0, 'cc+');
  borneDeTopo(m, x, H / 2, 0, 'cc-');
  T('pos', [-x, H / 2 + 0.022, 0], [0, 1, 0], 0.032);
  T('neg', [x, H / 2 + 0.022, 0], [0, 1, 0], 0.032);
}

function bateriaDeChumbo(item: Bateria, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const carro = item.quimica === 'automotiva';
  const selada = /selada/i.test(item.nome);
  const tampa = carro ? '#b3262b' : ['#2d5fa6', '#d7d9da', '#c8811e'][variante(item.id, 3)]!;
  const hTampa = H * 0.2;
  m.bloco('plastico', '#1b1c1f', 0, -hTampa / 2, 0, W - 0.006, H - hTampa, D - 0.006, 0.008);
  m.bloco('plastico', tampa, 0, H / 2 - hTampa / 2, 0, W, hTampa, D, 0.006);
  // Nervuras da caixa.
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / 5;
    m.bloco('plastico', '#232427', x, -H / 2 + (H - hTampa) * 0.12, 0, 0.008, (H - hTampa) * 0.22, D - 0.002);
  }
  // Respiros: seis tampas, ou uma régua lisa na bateria selada.
  const zr = -D * 0.16;
  if (selada) m.bloco('plastico', '#2a2b2e', 0, H / 2 + 0.002, zr, W * 0.6, 0.004, 0.03, 0.002);
  else for (let i = 0; i < 6; i++) m.cilindro('plastico', carro ? '#e6c229' : '#1d1e21', (i - 2.5) * Math.min(0.045, W * 0.105), H / 2 + 0.003, zr, 0.011, 0.006, 'y', 10);
  // Etiqueta.
  const le = W * 0.72;
  const he = Math.min((H - hTampa) * 0.62, le * 0.42);
  m.estampa(
    estampa(`etiqueta-${item.id}`, 512, Math.round((512 * he) / le), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      retangulo(g, 4, 4, w - 8, h - 8, 10, '#f3f0e6');
      retangulo(g, 4, 4, w - 8, h * 0.3, 10, tampa);
      const tinta = tampa === '#d7d9da' ? '#1c2630' : '#ffffff';
      logotipo(g, 46, h * 0.19, 24, tinta);
      texto(g, carro ? 'BATERIA AUTOMOTIVA' : selada ? 'BATERIA SELADA' : 'BATERIA ESTACIONÁRIA', 84, h * 0.17, h * 0.115, tinta, 'left', 'bold', w - 100);
      texto(g, `${item.tensao} V   ${item.ah} Ah`, 28, h * 0.56, h * 0.24, '#1c1c1c', 'left');
      texto(g, 'CHUMBO-ÁCIDO', 28, h * 0.83, h * 0.1, '#5a5a5a', 'left', '600');
      // Pictogramas de aviso.
      for (let i = 0; i < 3; i++) {
        retangulo(g, w - 150 + i * 46, h * 0.7, 38, 38, 4, i === 0 ? '#f5c518' : '#d33');
        texto(g, i === 0 ? '!' : i === 1 ? '⚡' : '✕', w - 131 + i * 46, h * 0.7 + 20, 24, '#111');
      }
    }, { transparente: true }),
    0, -hTampa / 2 - (H - hTampa) * 0.04, D / 2 - 0.003 + 0.0008, le, he, 'pz',
  );
  const x = W / 2 - 0.07;
  const z = D * 0.2;
  poloDeChumbo(m, -x, H / 2, z, 'cc+');
  poloDeChumbo(m, x, H / 2, z, 'cc-');
  T('pos', [-x, H / 2 + 0.022, z], [0, 1, 0], 0.028);
  T('neg', [x, H / 2 + 0.022, z], [0, 1, 0], 0.028);
}

// ---------------------------------------------------------------- Inversor de piso

function inversorDePiso(item: Inversor, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const cor = ['#3e6eb3', '#b4b9bf', '#b93a30', '#3a3e44'][variante(item.id, 4)]!;
  const ha = 0.007;
  const tampa = 0.006;
  // Corpo de alumínio extrudado, com aletas em cima e nos lados.
  m.caixa('metal', cor, -W / 2 + 0.004, -H / 2 + 0.004, -D / 2 + tampa, W / 2 - 0.004, H / 2 - ha, D / 2 - tampa);
  const n = Math.max(6, Math.round(W / 0.013));
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.004 + ((i + 0.5) * (W - 0.008)) / n;
    m.caixa('metal', cor, x - 0.002, H / 2 - ha, -D / 2 + tampa, x + 0.002, H / 2, D / 2 - tampa);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) m.caixa('metal', cor, sx * (W / 2 - 0.004), -H * 0.22 + i * H * 0.2, -D / 2 + tampa, sx * W / 2, -H * 0.22 + i * H * 0.2 + 0.004, D / 2 - tampa);
    // Abas de fixação.
    m.caixa('metal', '#9aa0a6', sx * (W / 2 - 0.004), -H / 2, -D * 0.3, sx * W / 2, -H / 2 + 0.004, D * 0.3);
  }
  // Tampas da frente e de trás.
  m.caixa('plastico', '#1c1e21', -W / 2, -H / 2, D / 2 - tampa, W / 2, H / 2, D / 2);
  m.caixa('plastico', '#1c1e21', -W / 2, -H / 2, -D / 2, W / 2, H / 2, -D / 2 + tampa);
  const duas = W >= 0.26;
  const rt = H * 0.27;
  const xTomada = -W / 2 + rt * 1.25 + 0.012;
  m.estampa(
    estampa(`frente-${item.id}`, 512, Math.round((512 * H) / W), (g, w, h) => {
      g.fillStyle = '#1c1e21';
      g.fillRect(0, 0, w, h);
      const r = (rt / H) * h;
      const cx = (0.5 + xTomada / W) * w;
      tomadaBR(g, cx, h * 0.5, r);
      if (duas) tomadaBR(g, cx + r * 2.9, h * 0.5, r);
      const xt = cx + (duas ? r * 2.9 : 0) + r * 1.25 + 14;
      texto(g, `INVERSOR ${numero(item.potenciaW)} W`, xt, h * 0.22, h * 0.14, '#e9edf0', 'left', 'bold', w - xt - 70);
      texto(g, `${item.tensaoBateria} V  →  ${item.saidaV} V~`, xt, h * 0.45, h * 0.12, '#aeb7bf', 'left', '600', w - xt - 70);
      texto(g, item.onda === 'pura' ? 'ONDA SENOIDAL PURA' : 'ONDA MODIFICADA', xt, h * 0.66, h * 0.095, item.onda === 'pura' ? '#7fd08a' : '#f0b24a', 'left', '600', w - xt - 70);
      logotipo(g, xt + 16, h * 0.86, h * 0.09, '#e08a1c');
    }),
    0, 0, D / 2 + 0.0005, W, H, 'pz',
  );
  // Chave liga-desliga e luz de funcionamento.
  m.bloco('plastico', '#d32f2f', W / 2 - 0.022, 0.004, D / 2 + 0.003, 0.014, 0.024, 0.006, 0.002, ['x', 0.18]);
  m.esfera('luz', '#39d353', W / 2 - 0.022, -H * 0.32, D / 2 + 0.001, 0.0035, [1, 1, 0.5], 8);
  // Atrás: ventoinha e os dois bornes da bateria.
  const rv = H * 0.36;
  const xv = -W * 0.22;
  m.cilindro('plastico', '#0c0d0e', xv, 0, -D / 2 - 0.0006, rv, 0.0012, 'z', 20);
  m.toro('metal', '#b9bdc1', xv, 0, -D / 2 - 0.002, rv, 0.0025, 'z', 20, 4);
  m.toro('metal', '#b9bdc1', xv, 0, -D / 2 - 0.002, rv * 0.55, 0.002, 'z', 16, 4);
  m.cilindro('metal', '#b9bdc1', xv, 0, -D / 2 - 0.002, rv * 0.2, 0.003, 'z', 10);
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 4) * (2 * i + 1);
    m.tubo('metal', '#b9bdc1', [[xv + Math.cos(a) * rv * 0.2, Math.sin(a) * rv * 0.2, -D / 2 - 0.002], [xv + Math.cos(a) * rv, Math.sin(a) * rv, -D / 2 - 0.002]], 0.0015, 3, 1);
  }
  const rb = Math.min(0.012, H * 0.16);
  for (const [id, tipo, fx] of [['batPos', 'cc+', 0.12], ['batNeg', 'cc-', 0.34]] as const) {
    const x = W * fx;
    m.cilindro('plastico', tipo === 'cc+' ? '#c62828' : '#17181a', x, 0, -D / 2 - 0.004, rb, 0.008, 'z', 12);
    m.cilindro('metal', '#d1b45a', x, 0, -D / 2 - 0.012, rb * 0.45, 0.014, 'z', 8);
    m.cilindro('metal', '#c9cdd1', x, 0, -D / 2 - 0.01, rb * 0.8, 0.004, 'z', 6);
    T(id, [x, 0, -D / 2 - 0.018], [0, 0, -1], Math.min(0.024, H * 0.3));
  }
  T('caSaida', [xTomada, 0, D / 2 + 0.004], [0, 0, 1], Math.min(0.03, H * 0.38));
}

// ---------------------------------------------------------------- Estação portátil

function estacaoPortatil(item: Inversor, m: Molde, T: Marcar, V: MarcarVisor): void {
  const [W, H, D] = item.dimensoes;
  const hb = H * 0.8;
  const yb = -H / 2 + hb / 2;
  const corpo = variante(item.id, 2) === 0 ? '#2a2e33' : '#3b4856';
  m.bloco('plastico', corpo, 0, yb, 0, W, hb, D, 0.02);
  // Alça em cima.
  for (const sx of [-1, 1]) m.bloco('plastico', '#1b1d20', sx * W * 0.37, H / 2 - (H - hb) / 2 - 0.004, 0, 0.034, H - hb + 0.008, 0.046, 0.006);
  m.bloco('plastico', '#1b1d20', 0, H / 2 - 0.012, 0, W * 0.8, 0.024, 0.05, 0.01);
  // Laterais com grelha de ventilação.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) m.bloco('plastico', '#111315', sx * (W / 2 + 0.0002), yb + hb * 0.22 - i * hb * 0.085, 0, 0.002, hb * 0.035, D * 0.5);
  }
  // Painel da frente: visor, portas USB, entrada da rede e tomadas de saída.
  const lp = W * 0.9;
  const hp = hb * 0.84;
  const tomadas = W >= 0.3 ? 2 : 1;
  /** Frações do painel onde ficam a entrada da rede e a primeira tomada de saída. */
  const uEntrada = 0.14;
  const vBaixo = 0.72;
  const uSaida = tomadas === 2 ? 0.56 : 0.7;
  m.estampa(
    estampa(`painel-${item.id}`, 512, Math.round((512 * hp) / lp), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      retangulo(g, 2, 2, w - 4, h - 4, 22, '#14161a');
      logotipo(g, 44, h * 0.14, 20, '#e08a1c');
      texto(g, 'ESTAÇÃO PORTÁTIL', 76, h * 0.1, h * 0.07, '#cfd5da', 'left', 'bold', w * 0.44);
      texto(g, `${numero(item.bateriaInternaWh ?? 0)} Wh`, 76, h * 0.185, h * 0.06, '#8f99a3', 'left', '600', w * 0.44);
      visorApagado(g, w * 0.62, h * 0.07, w * 0.33, h * 0.3);
      // USB.
      for (let i = 0; i < 4; i++) retangulo(g, 30 + i * 62, h * 0.27, 48, h * 0.075, 5, i < 2 ? '#3d7fd9' : '#30353b');
      texto(g, 'USB', 30, h * 0.42, h * 0.055, '#8f99a3', 'left', '600');
      // Botão de ligar.
      g.fillStyle = '#2a2f35';
      g.beginPath();
      g.arc(w * 0.5, h * 0.3, h * 0.06, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#39d353';
      g.lineWidth = 3;
      g.stroke();
      // Entrada da rede (para recarregar) e tomadas de saída.
      const r = h * 0.17;
      retangulo(g, w * uEntrada - r * 1.1, h * vBaixo - r * 0.9, r * 2.2, r * 1.8, 8, '#0b0c0e');
      for (const dx of [-0.5, 0, 0.5]) retangulo(g, w * uEntrada + dx * r - 4, h * vBaixo - r * 0.3, 8, r * 0.6, 2, '#c9cdd1');
      texto(g, 'ENTRADA CA', w * uEntrada, h * 0.95, h * 0.05, '#8f99a3', 'center', '600');
      for (let i = 0; i < tomadas; i++) tomadaBR(g, w * uSaida + i * r * 2.9, h * vBaixo, r, '#22262b', '#0f1113');
      texto(g, `SAÍDA ${item.saidaV} V~  ${numero(item.potenciaW)} W`, w * (uSaida + (tomadas - 1) * 0.14), h * 0.95, h * 0.05, '#8f99a3', 'center', '600');
    }, { transparente: true, acesa: 0.3 }),
    0, yb, D / 2 + 0.0008, lp, hp, 'pz',
  );
  V([lp * (0.62 + 0.165 - 0.5), yb + hp * (0.5 - 0.22), D / 2 + 0.0018], lp * 0.33 + (lp * 6) / 512, hp * 0.3 + (lp * 6) / 512);
  const xEntrada = lp * (uEntrada - 0.5);
  const xSaida = lp * (uSaida - 0.5);
  const yTomadas = yb + hp * (0.5 - vBaixo);
  // Atrás: entrada das placas, com os dois pinos.
  m.bloco('plastico', '#e2b100', 0, yb - hb * 0.1, -D / 2 - 0.002, 0.11, 0.034, 0.006, 0.003);
  for (const [id, tipo, sx] of [['pvPos', 'cc+', -1], ['pvNeg', 'cc-', 1]] as const) {
    const x = sx * 0.032;
    m.cilindro('plastico', tipo === 'cc+' ? '#c62828' : '#17181a', x, yb - hb * 0.1, -D / 2 - 0.007, 0.01, 0.008, 'z', 10);
    m.cilindro('metal', '#d1b45a', x, yb - hb * 0.1, -D / 2 - 0.013, 0.004, 0.008, 'z', 8);
    T(id, [x, yb - hb * 0.1, -D / 2 - 0.017], [0, 0, -1], 0.02);
  }
  const raio = Math.min(0.028, hp * 0.2);
  T('caEntrada', [xEntrada, yTomadas, D / 2 + 0.004], [0, 0, 1], raio);
  T('caSaida', [xSaida, yTomadas, D / 2 + 0.004], [0, 0, 1], raio);
}

// ---------------------------------------------------------------- Tomada da rede

function tomadaDaRede(dim: Dimensoes, m: Molde, T: Marcar): void {
  const D = dim[2];
  const zb = -D / 2;
  // Espelho 4 × 2 com um módulo de tomada.
  m.bloco('plastico', '#f5f5f1', 0, 0, zb + 0.006, 0.078, 0.118, 0.012, 0.005);
  m.bloco('plastico', '#fbfbf8', 0, 0, zb + 0.0125, 0.05, 0.05, 0.003, 0.0012);
  m.estampa(
    estampa('tomada-da-rede', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      tomadaBR(g, w / 2, h / 2, w * 0.36, '#fbfbf8', '#e3e3dd');
    }, { transparente: true }),
    0, 0, zb + 0.0143, 0.048, 0.048, 'pz',
  );
  T('tomada', [0, 0, zb + 0.016], [0, 0, 1], 0.03);
}

// ---------------------------------------------------------------- Quadro de energia

/** Medidas do trilho dentro do quadro, que a camada de dispositivos usa para pôr as proteções. */
export const TRILHO = {
  /** Altura do centro do trilho, em coordenadas do quadro. */
  y: 0.022,
  /** Distância da face do trilho ao fundo da caixa. */
  frente: 0.0115,
  /** Largura de um módulo. */
  modulo: 0.018,
};

function quadroDeEnergia(item: Acessorio, dim: Dimensoes, m: Molde): void {
  const [W, H, D] = dim;
  const branco = '#f2f2ee';
  const e = 0.004;
  const zb = -D / 2;
  const zf = D / 2 - 0.01;
  // Caixa de sobrepor: fundo e quatro paredes.
  m.caixa('plastico', branco, -W / 2, -H / 2, zb, W / 2, H / 2, zb + e);
  m.caixa('plastico', branco, -W / 2, H / 2 - e, zb + e, W / 2, H / 2, zf);
  m.caixa('plastico', branco, -W / 2, -H / 2, zb + e, W / 2, -H / 2 + e, zf);
  m.caixa('plastico', branco, -W / 2, -H / 2 + e, zb + e, -W / 2 + e, H / 2 - e, zf);
  m.caixa('plastico', branco, W / 2 - e, -H / 2 + e, zb + e, W / 2, H / 2 - e, zf);
  // Aro da frente.
  m.caixa('plastico', '#e6e6e1', -W / 2 - 0.003, H / 2 - 0.002, zf - 0.006, W / 2 + 0.003, H / 2 + 0.003, zf);
  m.caixa('plastico', '#e6e6e1', -W / 2 - 0.003, -H / 2 - 0.003, zf - 0.006, W / 2 + 0.003, -H / 2 + 0.002, zf);
  // Trilho DIN, em perfil de chapéu.
  const lt = (item.modulos ?? 8) * TRILHO.modulo + 0.012;
  const zt = zb + e;
  m.caixa('metal', '#b7bbbf', -lt / 2, TRILHO.y - 0.0175, zt, lt / 2, TRILHO.y + 0.0175, zt + 0.002);
  m.caixa('metal', '#c6cacd', -lt / 2, TRILHO.y - 0.012, zt + 0.002, lt / 2, TRILHO.y + 0.012, zb + TRILHO.frente);
  for (let i = 0; i < 5; i++) m.caixa('plastico', '#55595d', -lt / 2 + 0.02 + (i * (lt - 0.05)) / 4, TRILHO.y - 0.003, zb + TRILHO.frente, -lt / 2 + 0.03 + (i * (lt - 0.05)) / 4, TRILHO.y + 0.003, zb + TRILHO.frente + 0.0003);
  // Barramentos de neutro (azul) e de terra (verde), com os parafusos.
  const yb = -H / 2 + 0.03;
  for (const [sx, base] of [[-1, '#1e66c9'], [1, '#2e9e4f']] as const) {
    const x = sx * W * 0.23;
    const lb = W * 0.36;
    m.bloco('plastico', base, x, yb, zt + 0.006, lb, 0.014, 0.012, 0.002);
    m.bloco('metal', '#d1b45a', x, yb, zt + 0.014, lb - 0.008, 0.008, 0.005);
    for (let i = 0; i < 5; i++) m.cilindro('metal', '#8d9296', x - lb / 2 + 0.012 + (i * (lb - 0.024)) / 4, yb, zt + 0.0172, 0.0026, 0.0016, 'z', 6);
  }
  // Tampa transparente fumê, aberta para cima, presa por uma dobradiça no alto.
  m.cilindro('plastico', '#e6e6e1', 0, H / 2 + 0.001, zf + 0.003, 0.004, W - 0.01, 'x', 8);
  const abertura = THREE.MathUtils.degToRad(82);
  const ht = H - 0.006;
  m.bloco('vidro', '#3a4047', 0, H / 2 + 0.001 + (Math.cos(abertura) * ht) / 2, zf + 0.004 + (Math.sin(abertura) * ht) / 2, W - 0.004, ht, 0.003, 0, ['x', abertura]);
}

// ---------------------------------------------------------------- Grampo de parede

/**
 * Medidas do grampo, em coordenadas da peça (Z é a normal da superfície; a base fica em z = −profundidade / 2).
 * O cabo passa por baixo do arco, ao longo de X, encostado na superfície. O arco serve a cabo de até `raioDoCabo`
 * de raio no desenho; para cabo mais grosso, a camada de cabos amplia o grampo.
 */
export const GRAMPO = {
  /** Raio de dentro do arco. */
  raioDoArco: 0.008,
  /** Maior raio de cabo que passa pelo arco sem ampliar. */
  raioDoCabo: 0.0075,
  /** Espessura da fita de plástico. */
  espessura: 0.002,
  /** Largura da fita, ao longo do cabo. */
  largura: 0.012,
};

/** Abraçadeira de plástico claro em U, com uma aba e um parafuso de cada lado. */
function grampoDeParede(dim: Dimensoes, m: Molde): void {
  const [, H, D] = dim;
  const { raioDoArco: r, espessura: e, largura: w } = GRAMPO;
  const z0 = -D / 2;
  const claro = '#e9ecee';
  // Perfil em U, de pé sobre a superfície: duas pernas da altura do raio e um meio arco por cima.
  const perfil = new THREE.Shape();
  perfil.moveTo(-(r + e), 0);
  perfil.lineTo(-(r + e), r);
  perfil.absarc(0, r, r + e, Math.PI, 0, true);
  perfil.lineTo(r + e, 0);
  perfil.lineTo(r, 0);
  perfil.lineTo(r, r);
  perfil.absarc(0, r, r, 0, Math.PI, false);
  perfil.lineTo(-r, 0);
  perfil.closePath();
  // O perfil é desenhado no plano YZ da peça e ganha a largura da fita ao longo de X.
  const paraAPeca = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)).setPosition(-w / 2, 0, z0);
  m.geo('plastico', claro, new THREE.ExtrudeGeometry(perfil, { depth: w, bevelEnabled: false, curveSegments: 8 }), paraAPeca);
  // Abas rentes à superfície, uma de cada lado, cada uma com o seu parafuso.
  const aba = Math.max(0.003, H / 2 - (r + e));
  for (const lado of [-1, 1]) {
    const y = lado * (r + e + aba / 2 - 0.0005);
    m.bloco('plastico', claro, 0, y, z0 + e / 2, w, aba + 0.001, e);
    m.cilindro('metal', '#8d9296', 0, y, z0 + e + 0.0006, 0.0021, 0.0012, 'z', 8);
    m.caixa('plastico', '#4a5158', -0.0014, y - 0.0003, z0 + e + 0.0012, 0.0014, y + 0.0003, z0 + e + 0.0014);
  }
}

// ---------------------------------------------------------------- Catálogo de modelos

function construir(item: Item, dim: Dimensoes, m: Molde, T: Marcar, V: MarcarVisor): void {
  switch (item.categoria) {
    case 'placa':
      return placa(item, m, T);
    case 'inversor':
      if (item.bateriaInternaWh !== undefined) return estacaoPortatil(item, m, T, V);
      return item.montagem === 'parede' ? inversorDeParede(item, m, T, V) : inversorDePiso(item, m, T);
    case 'controlador':
      return controlador(item, m, T, V);
    case 'bateria':
      return item.quimica === 'lifepo4' ? bateriaDeLitio(item, m, T, V) : bateriaDeChumbo(item, m, T);
    case 'rede':
      return tomadaDaRede(dim, m, T);
    case 'aparelho':
      return construirAparelho(item, m, T);
    case 'acessorio':
      return item.tipo === 'grampo' ? grampoDeParede(dim, m) : quadroDeEnergia(item, dim, m);
    case 'protecao':
    case 'cabo':
      return;
  }
}

/** Modelo de um item do catálogo. Nulo para o que não vai à cena como peça (cabos, proteções, acessórios sem medida). */
export function modeloDe(item: Item): Modelo | null {
  const pronto = modelos.get(item.id);
  if (pronto !== undefined) return pronto;
  const dim = dimensoesDe(item);
  if (!dim) {
    modelos.set(item.id, null);
    return null;
  }
  const defs = terminaisDe(item);
  const terminais: TerminalDoModelo[] = [];
  const molde = new Molde();
  let visor: LugarDoVisor | null = null;
  construir(item, dim, molde, (id, pos, saida, raio = 0.028) => {
    const def = defs.find((d) => d.id === id);
    if (!def) throw new Error(`O modelo de "${item.id}" marcou o terminal "${id}", que o item não tem.`);
    const s = new THREE.Vector3(saida[0], saida[1], saida[2]).normalize();
    terminais.push({ ...def, pos, saida: [s.x, s.y, s.z], raio });
  }, (centro, largura, altura) => {
    visor = { centro, largura, altura };
  });
  const faltam = defs.filter((d) => !terminais.some((t) => t.id === d.id));
  if (faltam.length) throw new Error(`O modelo de "${item.id}" não posicionou os terminais: ${faltam.map((d) => d.id).join(', ')}`);
  // Na ordem de `terminaisDe`.
  terminais.sort((a, b) => defs.findIndex((d) => d.id === a.id) - defs.findIndex((d) => d.id === b.id));
  const grupo = molde.montar();
  grupo.name = `modelo-${item.id}`;
  const volume = new THREE.Box3().setFromObject(grupo);
  volume.union(new THREE.Box3(new THREE.Vector3(-dim[0] / 2, -dim[1] / 2, -dim[2] / 2), new THREE.Vector3(dim[0] / 2, dim[1] / 2, dim[2] / 2)));
  if (molde.triangulos > MAX_TRIANGULOS) console.warn(`O modelo de "${item.id}" tem ${molde.triangulos} triângulos; o limite é ${MAX_TRIANGULOS}.`);
  const modelo: Modelo = { grupo, terminais, dimensoes: dim, volume, triangulos: molde.triangulos, visor };
  modelos.set(item.id, modelo);
  return modelo;
}

/** Esquece os moldes e libera as geometrias deles. Uma cena nova os refaz. */
export function liberarModelos(): void {
  for (const modelo of modelos.values()) {
    modelo?.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  modelos.clear();
}

