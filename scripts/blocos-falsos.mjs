// Blocos de mapa e de relevo falsos, para a verificação do ambiente de rádio LoRa não depender da internet.
// O terreno é inventado, em um lugar neutro (perto de −10; −50), sem relação com casa nenhuma.
// Os PNGs são montados aqui mesmo, com o zlib do Node.

import { deflateSync } from 'node:zlib';

const LADO = 256;

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(dados) {
  let c = 0xffffffff;
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pedaco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/** PNG RGB de 256 × 256 em que `cor(px, py)` devolve [r, g, b] de cada pixel. */
export function pngDe(cor) {
  const linhas = Buffer.alloc(LADO * (1 + LADO * 3));
  for (let py = 0; py < LADO; py++) {
    const base = py * (1 + LADO * 3);
    linhas[base] = 0; // sem filtro
    for (let px = 0; px < LADO; px++) {
      const [r, g, b] = cor(px, py);
      linhas[base + 1 + px * 3] = r;
      linhas[base + 2 + px * 3] = g;
      linhas[base + 3 + px * 3] = b;
    }
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(LADO, 0);
  cabecalho.writeUInt32BE(LADO, 4);
  cabecalho[8] = 8; // bits por canal
  cabecalho[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', cabecalho), pedaco('IDAT', deflateSync(linhas)), pedaco('IEND', Buffer.alloc(0))]);
}

/** Coordenada do canto de cima à esquerda de um pixel de um bloco (projeção de Mercator da web). */
function coordenadaDoPixel(z, x, y, px, py) {
  const n = 2 ** z;
  const lon = ((x + px / LADO) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / LADO)) / n))) * 180) / Math.PI;
  return { lat, lon };
}

// ---------------------------------------------------------------- O terreno inventado

const KM_POR_GRAU = 111.195;
const ORIGEM = { lat: -10, lon: -50 };
const emKm = (lat, lon) => ({ x: (lon - ORIGEM.lon) * KM_POR_GRAU * Math.cos((ORIGEM.lat * Math.PI) / 180), y: (lat - ORIGEM.lat) * KM_POR_GRAU });
const doKm = (x, y) => ({ lat: ORIGEM.lat + y / KM_POR_GRAU, lon: ORIGEM.lon + x / (KM_POR_GRAU * Math.cos((ORIGEM.lat * Math.PI) / 180)) });
const morro = (x, y, cx, cy, raioKm) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * raioKm ** 2));

/** Lugares do cenário: dois morros que se enxergam por cima de um vale, e um lugar baixo atrás de uma serra. */
export const LUGARES = {
  /** No alto de um morro. */
  morroA: doKm(0, 0),
  /** No alto de outro morro, a cerca de 21 km do primeiro, com um vale no meio. */
  morroB: doKm(-20, -6),
  /** Lugar baixo atrás da serra: de `morroA` até aqui, a serra fica no meio do caminho. */
  atrasDaSerra: doKm(-9, -23),
  /** Centro do cenário, para enquadrar o mapa. */
  centro: doKm(-9, -18),
};

/** Altitude do terreno inventado, em metros. */
export function altitudeFalsa(lat, lon) {
  const { x, y } = emKm(lat, lon);
  const ondulado = 220 + 25 * Math.sin(x / 3.1) * Math.cos(y / 2.3) + 15 * Math.sin(x / 1.1 + y / 1.7);
  const morros = 280 * morro(x, y, 0, 0, 2.5) + 280 * morro(x, y, -20, -6, 2.5);
  const serra = 520 * Math.exp(-((y + 16) ** 2) / (2 * 1.5 ** 2)) * Math.exp(-((x + 5) ** 2) / (2 * 12 ** 2));
  return ondulado + morros + serra;
}

/** Bloco de relevo no formato Terrarium: altitude = R·256 + G + B/256 − 32768. */
export function blocoDeRelevoFalso(z, x, y) {
  return pngDe((px, py) => {
    const { lat, lon } = coordenadaDoPixel(z, x, y, px, py);
    const v = altitudeFalsa(lat, lon) + 32768;
    return [Math.floor(v / 256), Math.floor(v) % 256, Math.floor((v - Math.floor(v)) * 256)];
  });
}

/** Bloco do mapa de fundo: sem ruas nem nomes, só o terreno inventado em tons de verde a marrom e a borda do bloco. */
export function blocoDeMapaFalso(z, x, y) {
  return pngDe((px, py) => {
    if (px === 0 || py === 0) return [205, 212, 200];
    const { lat, lon } = coordenadaDoPixel(z, x, y, px + 0.5, py + 0.5);
    const t = Math.min(1, Math.max(0, (altitudeFalsa(lat, lon) - 150) / 650));
    return [Math.round(222 - 52 * t), Math.round(234 - 84 * t), Math.round(212 - 102 * t)];
  });
}

const ENDERECO_DO_MAPA = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/;
const ENDERECO_DO_RELEVO = /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/;

/**
 * Intercepta os dois serviços de fora e responde com os blocos falsos. Devolve a contagem dos pedidos e a lista
 * de qualquer pedido que tenha saído para outro endereço (que tem de ficar vazia).
 * `origem` é o endereço do próprio site (o vite preview).
 */
export async function interceptarBlocos(pagina, origem) {
  const pedidos = { mapa: 0, relevo: 0, outros: [], relevoFalha: false };
  const guardados = new Map();
  const responder = (expressao, gerar, contar) => async (rota) => {
    const url = rota.request().url();
    const m = expressao.exec(url);
    if (!m) return rota.abort();
    contar();
    if (expressao === ENDERECO_DO_RELEVO && pedidos.relevoFalha) return rota.fulfill({ status: 503, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'fora do ar' });
    let corpo = guardados.get(url);
    if (!corpo) {
      corpo = gerar(Number(m[1]), Number(m[2]), Number(m[3]));
      guardados.set(url, corpo);
    }
    return rota.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: corpo });
  };
  await pagina.route('https://tile.openstreetmap.org/**', responder(ENDERECO_DO_MAPA, blocoDeMapaFalso, () => (pedidos.mapa += 1)));
  await pagina.route('https://s3.amazonaws.com/**', responder(ENDERECO_DO_RELEVO, blocoDeRelevoFalso, () => (pedidos.relevo += 1)));
  pagina.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(origem) || url.startsWith('data:') || url.startsWith('blob:')) return;
    if (ENDERECO_DO_MAPA.test(url) || ENDERECO_DO_RELEVO.test(url)) return;
    pedidos.outros.push(url);
  });
  return pedidos;
}
