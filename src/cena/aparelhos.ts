// Modelos dos aparelhos da casa, um por `forma`. Especificação: docs/especificacao/fase-2.md, seção 2.
//
// A caixa de `dimensoes` do catálogo é o aparelho; computador, notebook, TV, modem e micro-ondas vêm com o
// móvel em que ficam (mesa, rack, mesinha, balcão), desenhado abaixo dessa caixa. Partes com nome:
// `aceso` (o que aparece com o aparelho ligado), `apagado` (o contrário) e `helice` (gira no ventilador).

import * as THREE from 'three';
import type { Aparelho } from '../catalogo/tipos';
import { emenda, type Marcar, mesa, pes, plugue, TOPO_DO_PLUGUE } from './conectores';
import { ALTURA_BALCAO, ALTURA_MESA, ALTURA_MESINHA, ALTURA_RACK } from './encaixe';
import { estampa, logotipo, retangulo, texto } from './estampas';
import type { Molde, V3 } from './molde';

const PARA_CIMA: V3 = [0, 1, 0];

/** Plugue em pé sobre um móvel ou sobre o aparelho, com o terminal `plug` na ponta dos pinos. */
function plugueComTerminal(m: Molde, T: Marcar, x: number, y: number, z: number, origemDoFio?: V3): void {
  plugue(m, x, y, z, origemDoFio);
  T('plug', [x, y + TOPO_DO_PLUGUE, z], PARA_CIMA, 0.03);
}

function telaApagada(): THREE.Material {
  return estampa('tela-apagada', 64, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#15181d');
    grad.addColorStop(0.5, '#07080a');
    grad.addColorStop(1, '#101317');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, { rugosidade: 0.12 });
}

/** Imagem de TV ligada: uma paisagem genérica. */
function telaDeTV(): THREE.Material {
  return estampa('tela-tv', 512, 288, (g, w, h) => {
    const ceu = g.createLinearGradient(0, 0, 0, h);
    ceu.addColorStop(0, '#2d7fd6');
    ceu.addColorStop(0.62, '#bfe4ff');
    g.fillStyle = ceu;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3b0';
    g.beginPath();
    g.arc(w * 0.76, h * 0.26, h * 0.1, 0, Math.PI * 2);
    g.fill();
    for (const [cor, base, amp, fase] of [['#5f9e6a', 0.62, 0.1, 0.4], ['#3f8451', 0.72, 0.08, 2.1], ['#2c6a3e', 0.84, 0.06, 4]] as const) {
      g.fillStyle = cor;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (base - amp * Math.sin((x / w) * 5 + fase)));
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    }
    retangulo(g, 16, h - 44, 150, 30, 6, 'rgba(0,0,0,0.55)');
    texto(g, 'AO VIVO', 91, h - 28, 18, '#ffffff');
  }, { acesa: 0.9, rugosidade: 0.2 });
}

/** Tela de computador ligada: área de trabalho com janelas, ou um jogo no computador gamer. */
function telaDePC(gamer: boolean): THREE.Material {
  return estampa(gamer ? 'tela-jogo' : 'tela-trabalho', 512, 288, (g, w, h) => {
    if (gamer) {
      const fundo = g.createLinearGradient(0, 0, w, h);
      fundo.addColorStop(0, '#2a0845');
      fundo.addColorStop(1, '#0f4c81');
      g.fillStyle = fundo;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,255,220,0.5)';
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(w / 2, h * 0.45);
        g.lineTo((i / 8) * w, h);
        g.stroke();
      }
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.moveTo(0, h * (0.55 + j * 0.13));
        g.lineTo(w, h * (0.55 + j * 0.13));
        g.stroke();
      }
      g.fillStyle = '#ff3d7f';
      g.beginPath();
      g.arc(w / 2, h * 0.36, h * 0.14, 0, Math.PI * 2);
      g.fill();
      retangulo(g, 16, 14, 150, 16, 4, '#39d353');
      texto(g, '144 FPS', w - 60, 24, 18, '#ffffff');
    } else {
      g.fillStyle = '#2f6fb7';
      g.fillRect(0, 0, w, h);
      retangulo(g, 40, 30, 270, 180, 6, '#f5f6f7');
      retangulo(g, 40, 30, 270, 22, 6, '#d5d9de');
      for (let i = 0; i < 6; i++) retangulo(g, 56, 66 + i * 22, 150 + ((i * 53) % 80), 9, 3, '#9aa3ad');
      retangulo(g, 250, 110, 220, 130, 6, '#ffffff');
      retangulo(g, 250, 110, 220, 22, 6, '#d5d9de');
      for (let i = 0; i < 5; i++) retangulo(g, 270 + i * 38, 220 - (20 + ((i * 37) % 60)), 24, 20 + ((i * 37) % 60), 2, '#3d8bd9');
      g.fillStyle = '#1c2a3a';
      g.fillRect(0, h - 24, w, 24);
      for (let i = 0; i < 5; i++) retangulo(g, 12 + i * 30, h - 19, 20, 14, 3, '#5d7a99');
    }
  }, { acesa: 0.9, rugosidade: 0.25 });
}

function teclado(gamer: boolean): THREE.Material {
  return estampa(gamer ? 'teclado-gamer' : 'teclado', 256, 80, (g, w, h) => {
    g.fillStyle = gamer ? '#0e0f11' : '#24272b';
    g.fillRect(0, 0, w, h);
    const colunas = 15;
    const linhas = 5;
    for (let j = 0; j < linhas; j++) {
      for (let i = 0; i < colunas; i++) {
        if (j === 4 && i > 3 && i < 10) continue;
        g.fillStyle = gamer ? `hsl(${(i / colunas) * 300 + j * 12}, 90%, 60%)` : '#3a3e44';
        g.fillRect(4 + i * ((w - 8) / colunas) + 1, 4 + j * ((h - 8) / linhas) + 1, (w - 8) / colunas - 2, (h - 8) / linhas - 2);
      }
    }
    g.fillStyle = gamer ? 'hsl(160, 90%, 60%)' : '#3a3e44';
    g.fillRect(4 + 4 * ((w - 8) / colunas) + 1, 4 + 4 * ((h - 8) / linhas) + 1, 6 * ((w - 8) / colunas) - 2, (h - 8) / linhas - 2);
  }, gamer ? { acesa: 0.6 } : {});
}

// ---------------------------------------------------------------- Geladeira

function geladeira(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const frigobar = H < 1;
  const duasPortas = H >= 1.65;
  const inox = W >= 0.72;
  const cor = inox ? '#c5cacf' : '#f1f3f3';
  const puxador = inox ? '#8d949b' : '#b9bfc5';
  const pe = 0.03;
  const dPorta = Math.min(0.07, D * 0.11);
  const dCorpo = D - dPorta - 0.006;
  const yBase = -H / 2;
  m.bloco('plastico', cor, 0, pe / 2, -D / 2 + dCorpo / 2, W, H - pe, dCorpo, 0.012);
  pes(m, 0, yBase, -D / 2 + dCorpo / 2, W, dCorpo, pe + 0.004, 0.02);
  m.bloco('plastico', '#3b3e42', 0, yBase + pe * 0.55, D / 2 - dPorta - 0.02, W * 0.86, pe * 0.8, 0.012);
  const zp = D / 2 - dPorta / 2;
  const y0 = yBase + pe + 0.006;
  const y1 = H / 2 - 0.003;
  const yDiv = duasPortas ? y1 - (y1 - y0) * 0.3 : y1;
  const porta = (ya: number, yb: number, puxadorEmCima: boolean): void => {
    m.bloco('plastico', cor, 0, (ya + yb) / 2, zp, W - 0.006, yb - ya, dPorta, 0.012);
    if (frigobar) {
      // Puxador embutido no alto da porta.
      m.bloco('plastico', '#33373c', -W * 0.18, yb - 0.035, D / 2 + 0.001, W * 0.34, 0.022, 0.004, 0.002);
      return;
    }
    const hp = Math.min(0.34, (yb - ya) * 0.6);
    const yp = puxadorEmCima ? yb - 0.1 - hp / 2 : ya + 0.08 + hp / 2;
    const x = -W / 2 + 0.055;
    m.bloco('metal', puxador, x, yp, D / 2 + 0.024, 0.02, hp, 0.016, 0.006);
    for (const s of [-1, 1]) m.bloco('metal', puxador, x, yp + s * (hp / 2 - 0.02), D / 2 + 0.01, 0.016, 0.016, 0.022);
  };
  porta(y0, yDiv - 0.004, true);
  if (duasPortas) porta(yDiv + 0.004, y1, false);
  // Plaqueta genérica na porta de cima e dobradiça no topo.
  m.bloco('metal', '#dfe3e6', W * 0.22, y1 - 0.09, D / 2 + 0.0012, 0.07, 0.016, 0.002);
  m.bloco('plastico', inox ? '#9aa0a6' : '#dfe2e3', W / 2 - 0.05, H / 2 + 0.003, D / 2 - dPorta - 0.01, 0.07, 0.008, 0.05, 0.003);
  // Plugue no topo, junto à borda de trás; o fio desce por trás da geladeira.
  const zt = -D / 2 + 0.06;
  plugueComTerminal(m, T, 0, H / 2, zt, [0, H / 2 - 0.02, -D / 2 - 0.004]);
}

// ---------------------------------------------------------------- Ventilador

function ventilador(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H] = item.dimensoes;
  const y0 = -H / 2;
  const R = W / 2 - 0.012;
  const yc = H / 2 - R - 0.012;
  const escuro = '#2a2d32';
  const aro = '#d5d9dd';
  // Base, haste e caixa de controle.
  m.cilindro('plastico', escuro, 0, y0 + 0.015, -0.02, W * 0.42, 0.03, 'y', 24, W * 0.4);
  m.cilindro('plastico', escuro, 0, y0 + 0.055, -0.02, 0.06, 0.05, 'y', 14, 0.03);
  const yHaste = yc - 0.1;
  m.cilindro('metal', '#c8ccd0', 0, (y0 + 0.08 + yHaste) / 2, -0.02, 0.014, yHaste - y0 - 0.08, 'y', 10);
  m.bloco('plastico', escuro, 0, yHaste - 0.16, -0.02, 0.055, 0.1, 0.05, 0.008);
  for (let i = 0; i < 3; i++) m.bloco('plastico', i === 0 ? '#d7dade' : '#8f969d', 0, yHaste - 0.13 - i * 0.026, 0.006, 0.026, 0.014, 0.006, 0.002);
  // Articulação e motor.
  m.bloco('plastico', escuro, 0, yc - 0.075, -0.045, 0.045, 0.09, 0.05, 0.008);
  m.cilindro('plastico', escuro, 0, yc, -0.07, 0.05, 0.13, 'z', 16, 0.06);
  // Grade: aro, anéis da frente e de trás e os arames.
  const zf = 0.07;
  const zt = -0.035;
  m.toro('metal', aro, 0, yc, 0.018, R, 0.006, 'z', 28, 4);
  m.toro('metal', aro, 0, yc, zf - 0.016, R * 0.66, 0.003, 'z', 24, 3);
  m.toro('metal', aro, 0, yc, zf - 0.004, R * 0.34, 0.003, 'z', 16, 3);
  m.toro('metal', aro, 0, yc, zt + 0.014, R * 0.6, 0.003, 'z', 24, 3);
  m.cilindro('plastico', '#2a6fb5', 0, yc, zf, R * 0.2, 0.008, 'z', 16);
  m.cilindro('metal', '#e3e6e8', 0, yc, zf + 0.0045, R * 0.11, 0.002, 'z', 12);
  for (let i = 0; i < 28; i++) {
    const a = (Math.PI * 2 * i) / 28;
    const c = Math.cos(a);
    const s = Math.sin(a);
    m.tubo('metal', aro, [[c * R * 0.2, yc + s * R * 0.2, zf], [c * R * 0.66, yc + s * R * 0.66, zf - 0.016], [c * R, yc + s * R, 0.018]], 0.0016, 3, 2);
    if (i % 2 === 0) m.tubo('metal', aro, [[c * 0.06, yc + s * 0.06, zt], [c * R * 0.6, yc + s * R * 0.6, zt + 0.014], [c * R, yc + s * R, 0.018]], 0.0016, 3, 2);
  }
  // Hélice, em uma parte separada, que gira em torno de Z.
  const helice = m.filho('helice', [0, yc, 0.022]);
  helice.cilindro('plastico', '#3a5f8a', 0, 0, 0, 0.032, 0.035, 'z', 12);
  const pa = new THREE.Matrix4();
  const passo = new THREE.Matrix4();
  for (let i = 0; i < 3; i++) {
    pa.makeRotationZ((Math.PI * 2 * i) / 3)
      .multiply(passo.makeTranslation(0, R * 0.52, 0))
      .multiply(passo.makeRotationY(0.42))
      .multiply(passo.makeScale(0.52, 1, 0.07));
    helice.geo('plastico', '#7fb0e0', new THREE.SphereGeometry(R * 0.42, 10, 6), pa);
  }
  // Plugue atrás do motor, na altura dele.
  const zp = -0.17;
  m.tubo('plastico', '#2b2d30', [[0, yc - 0.02, -0.13], [0, yc - 0.06, -0.16], [0, yc - 0.02, zp]], 0.0035, 4, 6);
  plugue(m, 0, yc - 0.02, zp);
  T('plug', [0, yc - 0.02 + TOPO_DO_PLUGUE, zp], PARA_CIMA, 0.03);
}

// ---------------------------------------------------------------- TV

function tv(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H] = item.dimensoes;
  const yRack = -H / 2;
  const chao = yRack - ALTURA_RACK;
  // Rack baixo de madeira, com duas portas e um nicho no meio.
  const lr = W + 0.4;
  const pr = 0.4;
  const pe = 0.07;
  const madeira = '#8a6845';
  m.bloco('plastico', madeira, 0, (chao + pe + yRack - 0.025) / 2, 0, lr - 0.03, yRack - 0.025 - chao - pe, pr - 0.02);
  m.bloco('plastico', '#9c7850', 0, yRack - 0.0125, 0, lr, 0.025, pr, 0.004);
  pes(m, 0, chao, 0, lr - 0.06, pr - 0.04, pe, 0.018, '#2b2520');
  const hf = yRack - 0.025 - chao - pe - 0.03;
  const yf = chao + pe + 0.015 + hf / 2;
  const lPorta = (lr - 0.03) * 0.3;
  for (const sx of [-1, 1]) {
    m.bloco('plastico', '#9c7850', sx * ((lr - 0.03) / 2 - lPorta / 2 - 0.01), yf, pr / 2 - 0.008, lPorta, hf, 0.006, 0.002);
    m.cilindro('metal', '#c9cdd1', sx * ((lr - 0.03) / 2 - lPorta - 0.0), yf, pr / 2 - 0.002, 0.008, 0.012, 'z', 8);
  }
  m.bloco('plastico', '#3a2c1f', 0, yf, pr / 2 - 0.0105, (lr - 0.03) * 0.36, hf, 0.002);
  m.bloco('plastico', '#17181a', 0, yf - hf / 2 + 0.03, pr / 2 - 0.03, 0.3, 0.045, 0.04, 0.004);
  // TV: tela fina com dois pés.
  const hPe = 0.06;
  const ht = H - hPe;
  const yt = -H / 2 + hPe + ht / 2;
  m.bloco('plastico', '#0d0e10', 0, yt, 0, W, ht, 0.028, 0.006);
  m.bloco('plastico', '#17181a', 0, yt - ht * 0.1, -0.03, W * 0.55, ht * 0.5, 0.04, 0.012);
  for (const sx of [-1, 1]) {
    m.bloco('plastico', '#1b1c1f', sx * W * 0.36, -H / 2 + hPe / 2 + 0.004, 0, 0.022, hPe + 0.008, 0.03);
    m.bloco('plastico', '#1b1c1f', sx * W * 0.36, -H / 2 + 0.005, 0, 0.05, 0.01, 0.22, 0.003);
  }
  const lt = W - 0.02;
  const at = ht - 0.03;
  m.filho('aceso').estampa(telaDeTV(), 0, yt + 0.005, 0.0146, lt, at, 'pz');
  m.filho('apagado').estampa(telaApagada(), 0, yt + 0.005, 0.0146, lt, at, 'pz');
  m.esfera('luz', '#ff3b30', 0, yt - ht / 2 + 0.007, 0.0146, 0.003, [1, 1, 0.4], 6);
  // Plugue sobre o rack, atrás da TV, do lado direito.
  plugueComTerminal(m, T, W / 2 + 0.1, yRack, -0.1, [W * 0.2, yRack + 0.2, -0.05]);
}

// ---------------------------------------------------------------- Computador

function pc(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const gamer = /gamer/i.test(item.id);
  const yMesa = -H / 2;
  mesa(m, 0, yMesa, 0, 1.3, 0.62, ALTURA_MESA);
  // Gabinete sobre a mesa, à direita.
  const xg = 0.46;
  const zg = -0.02;
  const corG = gamer ? '#141518' : '#2b2e33';
  m.bloco('plastico', corG, xg, 0, zg, W, H, D, 0.008);
  pes(m, xg, yMesa - 0.001, zg, W, D, 0.006, 0.012, '#0c0d0e');
  const zf = zg + D / 2;
  const aceso = m.filho('aceso');
  const apagado = m.filho('apagado');
  if (gamer) {
    // Frente com três ventoinhas iluminadas e lateral de vidro com a luz de dentro.
    for (let i = 0; i < 3; i++) {
      const y = H * 0.3 - i * H * 0.3;
      m.cilindro('plastico', '#08090a', xg, y, zf + 0.0006, W * 0.36, 0.0012, 'z', 18);
      aceso.toro('luz', ['#ff2bd6', '#28e0ff', '#7c4dff'][i]!, xg, y, zf + 0.002, W * 0.33, 0.004, 'z', 16, 3);
      apagado.toro('plastico', '#3a3d42', xg, y, zf + 0.002, W * 0.33, 0.004, 'z', 16, 3);
    }
    const xl = xg - W / 2;
    m.bloco('plastico', '#1d1f23', xl - 0.001, 0, zg, 0.002, H * 0.9, D * 0.9);
    // O que se vê pelo vidro: placa de vídeo, cooler e ventoinha de trás.
    m.bloco('plastico', '#2c2f35', xl - 0.006, -H * 0.12, zg + D * 0.02, 0.01, H * 0.1, D * 0.62, 0.003);
    aceso.bloco('luz', '#28e0ff', xl - 0.0115, -H * 0.085, zg + D * 0.02, 0.002, 0.006, D * 0.58);
    aceso.toro('luz', '#ff2bd6', xl - 0.006, H * 0.2, zg - D * 0.05, H * 0.11, 0.005, 'x', 16, 3);
    aceso.toro('luz', '#7c4dff', xl - 0.006, H * 0.2, zg - D * 0.33, H * 0.09, 0.004, 'x', 14, 3);
    aceso.bloco('luz', '#ff2bd6', xl - 0.004, -H * 0.42, zg, 0.002, 0.005, D * 0.84);
    apagado.toro('plastico', '#3a3d42', xl - 0.006, H * 0.2, zg - D * 0.05, H * 0.11, 0.005, 'x', 16, 3);
    apagado.toro('plastico', '#3a3d42', xl - 0.006, H * 0.2, zg - D * 0.33, H * 0.09, 0.004, 'x', 14, 3);
    m.bloco('vidro', '#56606b', xl - 0.014, 0, zg, 0.003, H * 0.92, D * 0.92);
  } else {
    // Frente de escritório: baia de disco, botão e duas portas USB.
    m.bloco('plastico', '#3a3e44', xg, H * 0.3, zf + 0.0008, W * 0.8, H * 0.08, 0.002, 0.001);
    m.bloco('plastico', '#1c1e21', xg, H * 0.3, zf + 0.002, W * 0.6, 0.006, 0.001);
    for (let i = 0; i < 6; i++) m.bloco('plastico', '#1c1e21', xg, -H * 0.1 - i * 0.018, zf + 0.0006, W * 0.7, 0.006, 0.0012);
    m.cilindro('plastico', '#4a4f56', xg, H * 0.16, zf + 0.002, 0.009, 0.004, 'z', 12);
    aceso.esfera('luz', '#6fd3ff', xg, H * 0.16, zf + 0.0042, 0.004, [1, 1, 0.4], 8);
    for (const dx of [-0.02, 0.02]) m.bloco('plastico', '#0c0d0e', xg + dx, H * 0.07, zf + 0.0008, 0.014, 0.006, 0.002);
  }
  // Monitor.
  const lm = gamer ? 0.7 : 0.54;
  const hm = gamer ? 0.33 : 0.32;
  const xm = -0.14;
  const zm = -0.14;
  const ym = yMesa + 0.11 + hm / 2;
  m.bloco('plastico', '#17181a', xm, yMesa + 0.006, zm, 0.22, 0.012, 0.17, 0.004);
  m.bloco('plastico', '#17181a', xm, yMesa + 0.09, zm - 0.02, 0.045, 0.17, 0.025, 0.004);
  m.bloco('plastico', '#101113', xm, ym, zm, lm, hm, 0.022, 0.005);
  aceso.estampa(telaDePC(gamer), xm, ym + 0.004, zm + 0.0116, lm - 0.016, hm - 0.026, 'pz');
  apagado.estampa(telaApagada(), xm, ym + 0.004, zm + 0.0116, lm - 0.016, hm - 0.026, 'pz');
  // Teclado e mouse.
  const zt = 0.14;
  m.bloco('plastico', gamer ? '#0e0f11' : '#24272b', xm, yMesa + 0.009, zt, 0.43, 0.018, 0.135, 0.004);
  m.estampa(teclado(gamer), xm, yMesa + 0.0183, zt, 0.42, 0.125, 'py');
  if (gamer) m.bloco('plastico', '#17181a', 0.2, yMesa + 0.0015, zt, 0.24, 0.003, 0.2, 0.001);
  m.esfera('plastico', gamer ? '#0e0f11' : '#3a3e44', 0.2, yMesa + 0.012, zt, 0.05, [0.62, 0.36, 1], 10);
  if (gamer) aceso.bloco('luz', '#28e0ff', 0.2, yMesa + 0.027, zt + 0.02, 0.006, 0.002, 0.03);
  // Plugue sobre a mesa, entre o monitor e o gabinete.
  plugueComTerminal(m, T, xg - W / 2 - 0.07, yMesa, -0.25, [xg, yMesa + 0.03, zg - D / 2]);
}

// ---------------------------------------------------------------- Notebook

function notebook(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const gamer = /gamer/i.test(item.id);
  const yMesa = -H / 2;
  mesa(m, 0, yMesa, 0, 1.0, 0.55, ALTURA_MESA);
  const cor = gamer ? '#1b1c20' : '#b7bcc2';
  const eb = 0.016;
  const db = D * 0.94;
  m.bloco('plastico', cor, 0, yMesa + eb / 2, D / 2 - db / 2, W, eb, db, 0.004);
  m.estampa(teclado(gamer), 0, yMesa + eb + 0.0004, D / 2 - db * 0.58, W * 0.86, db * 0.48, 'py');
  m.bloco('plastico', gamer ? '#2a2c31' : '#a3a9af', 0, yMesa + eb + 0.0004, D / 2 - db * 0.17, W * 0.3, 0.0008, db * 0.24);
  // Tampa aberta, inclinada para trás, com a tela.
  const inclinacao = 0.3;
  const zDobra = D / 2 - db + 0.004;
  const lt = Math.min((H - eb) / Math.cos(inclinacao), db);
  const tampa = m.filho('tampa', [0, yMesa + eb, zDobra], -inclinacao);
  tampa.bloco('plastico', cor, 0, lt / 2, -0.004, W, lt, 0.007, 0.003);
  m.filho('aceso', [0, yMesa + eb, zDobra], -inclinacao).estampa(telaDePC(gamer), 0, lt / 2 + 0.003, 0.0002, W - 0.02, lt - 0.024, 'pz');
  m.filho('apagado', [0, yMesa + eb, zDobra], -inclinacao).estampa(telaApagada(), 0, lt / 2 + 0.003, 0.0002, W - 0.02, lt - 0.024, 'pz');
  // Mouse e a fonte, com o plugue em pé atrás do notebook.
  m.esfera('plastico', '#3a3e44', W / 2 + 0.1, yMesa + 0.012, 0.06, 0.05, [0.62, 0.36, 1], 10);
  const xf = -W / 2 - 0.12;
  m.bloco('plastico', '#17181a', xf, yMesa + 0.014, -0.08, 0.11, 0.028, 0.048, 0.006);
  m.tubo('plastico', '#17181a', [[xf + 0.055, yMesa + 0.012, -0.08], [-W / 2 - 0.03, yMesa + 0.006, -0.02], [-W / 2, yMesa + 0.008, 0.02]], 0.0025, 4, 8);
  plugueComTerminal(m, T, xf, yMesa, -0.19, [xf, yMesa + 0.014, -0.104]);
}

// ---------------------------------------------------------------- Modem, roteador e mini PC

function roteador(item: Aparelho, m: Molde, T: Marcar): void {
  const [, H] = item.dimensoes;
  const yMesa = -H / 2;
  const chao = yMesa - ALTURA_MESINHA;
  // Mesinha com prateleira.
  const lm = 0.56;
  const pm = 0.36;
  const madeira = '#a98258';
  m.bloco('plastico', madeira, 0, yMesa - 0.0125, 0, lm, 0.025, pm, 0.004);
  m.bloco('plastico', madeira, 0, chao + 0.2, 0, lm - 0.06, 0.02, pm - 0.06);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.bloco('plastico', '#8a6845', sx * (lm / 2 - 0.03), (chao + yMesa - 0.025) / 2, sz * (pm / 2 - 0.03), 0.034, yMesa - 0.025 - chao, 0.034);
  const aceso = m.filho('aceso');
  // Roteador, com três antenas.
  const xr = -0.07;
  m.bloco('plastico', '#17181a', xr, yMesa + 0.017, 0, 0.2, 0.03, 0.13, 0.008);
  for (let i = -1; i <= 1; i++) {
    m.cilindro('plastico', '#17181a', xr + i * 0.075, yMesa + 0.04, -0.06, 0.006, 0.02, 'y', 8);
    m.cilindro('plastico', '#17181a', xr + i * 0.075, yMesa + 0.115, -0.06, 0.0042, 0.15, 'y', 8, 0.0035);
  }
  for (let i = 0; i < 6; i++) aceso.bloco('luz', i === 0 ? '#39d353' : i === 5 ? '#ffb300' : '#6fd3ff', xr - 0.07 + i * 0.022, yMesa + 0.02, 0.0655, 0.008, 0.003, 0.001);
  // Modem em pé e mini PC.
  m.bloco('plastico', '#f1f2f0', 0.105, yMesa + 0.075, -0.06, 0.036, 0.15, 0.075, 0.008);
  for (let i = 0; i < 4; i++) aceso.bloco('luz', '#39d353', 0.105, yMesa + 0.125 - i * 0.02, -0.022, 0.006, 0.006, 0.001);
  m.bloco('plastico', '#3a3f46', 0.11, yMesa + 0.022, 0.04, 0.115, 0.042, 0.115, 0.008);
  m.cilindro('plastico', '#22252a', 0.14, yMesa + 0.028, 0.098, 0.006, 0.002, 'z', 10);
  aceso.esfera('luz', '#6fd3ff', 0.14, yMesa + 0.028, 0.0995, 0.003, [1, 1, 0.4], 6);
  // Plugue sobre a mesinha, atrás, à esquerda.
  plugueComTerminal(m, T, -0.225, yMesa, -0.13, [xr - 0.09, yMesa + 0.02, -0.065]);
}

// ---------------------------------------------------------------- Micro-ondas

function microondas(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const yTampo = -H / 2;
  const chao = yTampo - ALTURA_BALCAO;
  // Balcão de cozinha com tampo de pedra e duas portas.
  const lb = W + 0.36;
  const pb = D + 0.14;
  const rodape = 0.09;
  m.bloco('plastico', '#ecedeb', 0, (chao + rodape + yTampo - 0.035) / 2, -0.01, lb - 0.04, yTampo - 0.035 - chao - rodape, pb - 0.05);
  m.bloco('plastico', '#3a3d41', 0, chao + rodape / 2, -0.03, lb - 0.08, rodape, pb - 0.1);
  m.bloco('plastico', '#6d7277', 0, yTampo - 0.0175, 0, lb, 0.035, pb, 0.004);
  const hp = yTampo - 0.035 - chao - rodape - 0.02;
  for (const sx of [-1, 1]) {
    m.bloco('plastico', '#f6f7f5', sx * (lb - 0.04) / 4, chao + rodape + 0.01 + hp / 2, pb / 2 - 0.035 + 0.004, (lb - 0.04) / 2 - 0.008, hp, 0.016, 0.003);
    m.bloco('metal', '#b9bfc5', sx * 0.045, chao + rodape + hp - 0.08, pb / 2 - 0.035 + 0.02, 0.012, 0.12, 0.012, 0.004);
  }
  // Micro-ondas: porta com janela à esquerda, painel à direita.
  const hc = H - 0.014;
  const yc = -H / 2 + 0.014 + hc / 2;
  const dc = D - 0.03;
  m.bloco('plastico', '#e7e9ea', 0, yc, -D / 2 + dc / 2, W, hc, dc, 0.008);
  pes(m, 0, yTampo, -D / 2 + dc / 2, W, dc, 0.014, 0.012);
  const lPainel = W * 0.26;
  const lPorta = W - lPainel;
  const zf = -D / 2 + dc;
  m.bloco('plastico', '#17181a', -W / 2 + lPorta / 2, yc, zf + 0.012, lPorta - 0.004, hc - 0.006, 0.024, 0.006);
  m.filho('apagado').estampa(
    estampa('janela-microondas', 128, 96, (g, w, h) => {
      g.fillStyle = '#0b0c0e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,130,140,0.35)';
      for (let j = 0; j < 16; j++) for (let i = 0; i < 22; i++) g.fillRect(3 + i * 5.6 + (j % 2) * 2.8, 3 + j * 5.8, 1.6, 1.6);
    }, { rugosidade: 0.15 }),
    -W / 2 + lPorta / 2, yc, zf + 0.0243, lPorta * 0.72, hc * 0.62, 'pz',
  );
  m.filho('aceso').estampa(
    estampa('janela-microondas-acesa', 128, 96, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h * 0.45, 4, w / 2, h / 2, w * 0.6);
      grad.addColorStop(0, '#ffd98a');
      grad.addColorStop(1, '#5a3a12');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3efe6';
      g.beginPath();
      g.ellipse(w / 2, h * 0.78, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(20,20,20,0.5)';
      for (let j = 0; j < 16; j++) for (let i = 0; i < 22; i++) g.fillRect(3 + i * 5.6 + (j % 2) * 2.8, 3 + j * 5.8, 1.6, 1.6);
    }, { acesa: 0.8 }),
    -W / 2 + lPorta / 2, yc, zf + 0.0243, lPorta * 0.72, hc * 0.62, 'pz',
  );
  m.bloco('metal', '#c3c8cd', -W / 2 + lPorta - 0.03, yc, zf + 0.036, 0.016, hc * 0.7, 0.014, 0.005);
  m.bloco('plastico', '#22252a', W / 2 - lPainel / 2, yc, zf + 0.002, lPainel - 0.006, hc - 0.012, 0.004, 0.002);
  m.estampa(
    estampa('painel-microondas', 128, 256, (g, w, h) => {
      g.fillStyle = '#22252a';
      g.fillRect(0, 0, w, h);
      retangulo(g, 14, 16, w - 28, 44, 6, '#061008');
      texto(g, '12:00', w / 2, 39, 30, '#39e36a');
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) retangulo(g, 16 + i * 34, 80 + j * 30, 28, 22, 5, '#3c4148');
      retangulo(g, 16, 206, 44, 30, 8, '#c62828');
      retangulo(g, 68, 206, 44, 30, 8, '#2e9e4f');
    }, { acesa: 0.3 }),
    W / 2 - lPainel / 2, yc, zf + 0.0042, lPainel - 0.014, hc - 0.022, 'pz',
  );
  // Plugue sobre o balcão, ao lado do micro-ondas.
  plugueComTerminal(m, T, W / 2 + 0.09, yTampo, -D / 2 + 0.03, [W / 2 - 0.02, yTampo + 0.05, -D / 2 - 0.004]);
}

// ---------------------------------------------------------------- Lâmpada (na parede)

function lampada(item: Aparelho, m: Molde, T: Marcar): void {
  const [, H, D] = item.dimensoes;
  const zp = -D / 2;
  // Bocal de parede e lâmpada LED de bulbo.
  m.cilindro('plastico', '#f4f4f1', 0, 0, zp + 0.006, 0.045, 0.012, 'z', 18);
  m.cilindro('plastico', '#e9e9e5', 0, 0, zp + 0.03, 0.02, 0.038, 'z', 14);
  m.cilindro('metal', '#c9cdd1', 0, 0, zp + 0.054, 0.014, 0.012, 'z', 12);
  m.cilindro('plastico', '#f1f1ee', 0, 0, zp + 0.073, 0.015, 0.028, 'z', 14, 0.027);
  m.filho('aceso').esfera('luz', '#fff1c4', 0, 0, zp + 0.09, 0.03, [1, 1, 0.95], 14);
  m.filho('apagado').esfera('plastico', '#f6f6f1', 0, 0, zp + 0.09, 0.03, [1, 1, 0.95], 14);
  // Emenda dos fios no alto, junto à parede.
  const ye = H / 2 - 0.012;
  m.tubo('plastico', '#f1f1ee', [[0, 0.04, zp + 0.006], [0, ye - 0.01, zp + 0.012]], 0.003, 4, 2);
  emenda(m, 0, ye, zp + 0.013);
  T('plug', [0, ye + 0.012, zp + 0.013], PARA_CIMA, 0.028);
}

// ---------------------------------------------------------------- Chuveiro (na parede)

function chuveiro(item: Aparelho, m: Molde, T: Marcar): void {
  const [, H, D] = item.dimensoes;
  const zp = -D / 2;
  const yCano = 0.03;
  const zc = zp + 0.155;
  // Cano que sai da parede e o corpo do chuveiro.
  m.cilindro('metal', '#c9cdd1', 0, yCano, zp + 0.004, 0.028, 0.008, 'z', 14);
  m.cilindro('metal', '#c9cdd1', 0, yCano, zp + 0.075, 0.011, 0.14, 'z', 10);
  m.esfera('plastico', '#f4f4f1', 0, yCano, zc, 0.05, [1, 0.8, 1], 14);
  m.cilindro('plastico', '#f4f4f1', 0, yCano - 0.045, zc, 0.088, 0.06, 'y', 22, 0.05);
  m.cilindro('plastico', '#d9dcdf', 0, yCano - 0.08, zc, 0.088, 0.012, 'y', 22);
  m.cilindro('metal', '#aeb3b8', 0, yCano - 0.088, zc, 0.074, 0.004, 'y', 22);
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    m.cilindro('plastico', '#3a3d41', Math.cos(a) * 0.045, yCano - 0.0905, zc + Math.sin(a) * 0.045, 0.004, 0.001, 'y', 6);
  }
  // Seletor de temperatura.
  m.bloco('plastico', '#2a6fb5', 0, yCano + 0.042, zc, 0.03, 0.012, 0.014, 0.003);
  // Fio até a emenda, no alto, junto à parede.
  const ye = H / 2 - 0.014;
  m.tubo('plastico', '#f1f1ee', [[0.03, yCano + 0.02, zc - 0.03], [0.03, ye - 0.03, zp + 0.06], [0, ye - 0.006, zp + 0.016]], 0.004, 4, 8);
  emenda(m, 0, ye, zp + 0.013);
  T('plug', [0, ye + 0.012, zp + 0.013], PARA_CIMA, 0.028);
}

// ---------------------------------------------------------------- Demais: caixa com rótulo

function caixa(item: Aparelho, m: Molde, T: Marcar): void {
  const [W, H, D] = item.dimensoes;
  const pe = 0.015;
  m.bloco('plastico', '#7f8b96', 0, pe / 2, 0, W, H - pe, D, 0.012);
  pes(m, 0, -H / 2, 0, W, D, pe + 0.002, 0.014);
  m.bloco('plastico', '#59636d', 0, H / 2 - 0.004, 0, W * 0.5, 0.01, D * 0.3, 0.004);
  const le = W * 0.86;
  const he = (H - pe) * 0.7;
  m.estampa(
    estampa(`rotulo-${item.id}`, 384, Math.round((384 * he) / le), (g, w, h) => {
      retangulo(g, 0, 0, w, h, 12, '#f3f4f2');
      logotipo(g, 40, h * 0.2, 22, '#e08a1c');
      // Nome do item, quebrado em até três linhas.
      const palavras = item.nome.split(' ');
      const linhas: string[] = [];
      g.font = `bold ${h * 0.14}px system-ui, "Segoe UI", Arial, sans-serif`;
      for (const p of palavras) {
        const ultima = linhas[linhas.length - 1];
        if (ultima !== undefined && g.measureText(`${ultima} ${p}`).width < w - 40) linhas[linhas.length - 1] = `${ultima} ${p}`;
        else linhas.push(p);
      }
      linhas.slice(0, 3).forEach((l, i) => texto(g, l, w / 2, h * (0.44 + i * 0.17), h * 0.14, '#1c2630', 'center', 'bold', w - 24));
      texto(g, `${item.potenciaW.toLocaleString('pt-BR')} W`, w - 20, h * 0.2, h * 0.14, '#5d6770', 'right');
    }),
    0, pe / 2, D / 2 + 0.0006, le, he, 'pz',
  );
  plugueComTerminal(m, T, 0, H / 2, -D / 2 + 0.04, [0, H / 2 - 0.03, -D / 2 - 0.004]);
}

export function construirAparelho(item: Aparelho, m: Molde, T: Marcar): void {
  switch (item.forma) {
    case 'geladeira':
      return geladeira(item, m, T);
    case 'ventilador':
      return ventilador(item, m, T);
    case 'tv':
      return tv(item, m, T);
    case 'pc':
      return pc(item, m, T);
    case 'notebook':
      return notebook(item, m, T);
    case 'roteador':
      return roteador(item, m, T);
    case 'microondas':
      return microondas(item, m, T);
    case 'lampada':
      return lampada(item, m, T);
    case 'chuveiro':
      return chuveiro(item, m, T);
    case 'caixa':
      return caixa(item, m, T);
  }
}
