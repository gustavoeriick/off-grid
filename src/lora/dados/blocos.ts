// Blocos de relevo "Terrarium" (Terrain Tiles). Parte pura: sem DOM, sem rede.
// Especificação: docs/especificacao/lora.md, seção 5.
import type { Coordenada } from '../nucleo/tipos';

/** Nível de zoom dos blocos de relevo: cerca de 18 km de lado e 70 m por pixel no Rio. */
export const ZOOM_DO_RELEVO = 11;

/** Lado de um bloco, em pixels. */
export const LADO_DO_BLOCO = 256;

/** Altitudes de um bloco, em metros, em ordem de linhas: o valor do pixel (px, py) está em `py * 256 + px`. */
export type Bloco = Float32Array;

/** Latitude máxima da projeção de Mercator da web. */
const LATITUDE_MAXIMA = 85.0511287798066;

export interface PosicaoNoBloco {
  /** Coluna e linha do bloco no zoom. */
  x: number;
  y: number;
  /** Posição dentro do bloco, em pixels, de 0 a 256 (exclusive). */
  px: number;
  py: number;
}

/** Posição contínua (em blocos) no mapa de Mercator da web, antes de separar bloco e pixel. */
function posicaoNoMundo(c: Coordenada, zoom: number): { u: number; v: number } {
  const n = 2 ** zoom;
  const lat = Math.max(-LATITUDE_MAXIMA, Math.min(LATITUDE_MAXIMA, c.lat));
  const rad = (lat * Math.PI) / 180;
  const u = ((c.lon + 180) / 360) * n;
  const v = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  // Longitude 180 cairia no bloco n; mantém dentro do mundo.
  const limite = n - 1e-9;
  return { u: Math.max(0, Math.min(limite, u)), v: Math.max(0, Math.min(limite, v)) };
}

/** Bloco que contém a coordenada e a posição em pixels dentro dele (projeção de Mercator da web). */
export function blocoDe(coordenada: Coordenada, zoom: number): PosicaoNoBloco {
  const { u, v } = posicaoNoMundo(coordenada, zoom);
  const x = Math.floor(u);
  const y = Math.floor(v);
  return { x, y, px: (u - x) * LADO_DO_BLOCO, py: (v - y) * LADO_DO_BLOCO };
}

/** Altitude em metros de um pixel Terrarium: R·256 + G + B/256 − 32768. */
export function altitudeDoPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export function chaveDoBloco(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/** Endereço do bloco. O servidor só fica sabendo qual bloco foi pedido, nunca a coordenada exata. */
export function urlDoBloco(z: number, x: number, y: number): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

/**
 * Blocos que um caminho precisa: o bloco de cada ponto, sem repetir, mais os oito vizinhos
 * do bloco do primeiro e do último ponto (para o servidor não saber onde está a ponta).
 * Vizinhos fora do mundo são descartados.
 */
export function blocosDoCaminho(pontos: Coordenada[], zoom: number): { x: number; y: number }[] {
  const n = 2 ** zoom;
  const vistos = new Map<string, { x: number; y: number }>();
  const juntar = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    const chave = chaveDoBloco(zoom, x, y);
    if (!vistos.has(chave)) vistos.set(chave, { x, y });
  };
  for (const p of pontos) {
    const b = blocoDe(p, zoom);
    juntar(b.x, b.y);
  }
  const pontas = pontos.length === 0 ? [] : [pontos[0], pontos[pontos.length - 1]];
  for (const p of pontas) {
    const b = blocoDe(p, zoom);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) juntar(b.x + dx, b.y + dy);
    }
  }
  return [...vistos.values()];
}

/**
 * Altitude de um ponto, por interpolação bilinear entre os quatro pixels vizinhos.
 * Atravessa a borda para o bloco vizinho; se ele não está no mapa, usa o pixel da borda do bloco do ponto.
 * Lança erro se o bloco do próprio ponto não foi carregado.
 *
 * Convenção: o valor de um pixel vale no canto superior esquerdo dele, ou seja, na posição
 * inteira (px, py), a mesma em que `blocoDe` conta. A interpolação é entre (px, py) e (px+1, py+1).
 */
export function altitudeNosBlocos(blocos: Map<string, Bloco>, coordenada: Coordenada, zoom: number): number {
  const { u, v } = posicaoNoMundo(coordenada, zoom);
  const bx = Math.floor(u);
  const by = Math.floor(v);
  const proprio = blocos.get(chaveDoBloco(zoom, bx, by));
  if (!proprio) {
    throw new Error(
      `Relevo não carregado: falta o bloco ${chaveDoBloco(zoom, bx, by)} do ponto (${coordenada.lat}; ${coordenada.lon}).`,
    );
  }
  const n = 2 ** zoom;
  const gx = u * LADO_DO_BLOCO;
  const gy = v * LADO_DO_BLOCO;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;

  const minX = bx * LADO_DO_BLOCO;
  const minY = by * LADO_DO_BLOCO;
  const pixel = (cx: number, cy: number): number => {
    const tx = Math.floor(cx / LADO_DO_BLOCO);
    const ty = Math.floor(cy / LADO_DO_BLOCO);
    const bloco = tx >= 0 && ty >= 0 && tx < n && ty < n ? blocos.get(chaveDoBloco(zoom, tx, ty)) : undefined;
    if (bloco) return bloco[(cy - ty * LADO_DO_BLOCO) * LADO_DO_BLOCO + (cx - tx * LADO_DO_BLOCO)];
    // Vizinho ausente (ou fim do mundo): pixel da borda do bloco do ponto.
    const lx = Math.max(minX, Math.min(minX + LADO_DO_BLOCO - 1, cx)) - minX;
    const ly = Math.max(minY, Math.min(minY + LADO_DO_BLOCO - 1, cy)) - minY;
    return proprio[ly * LADO_DO_BLOCO + lx];
  };

  const a = pixel(ix, iy);
  const b = pixel(ix + 1, iy);
  const c = pixel(ix, iy + 1);
  const d = pixel(ix + 1, iy + 1);
  const cima = a * (1 - fx) + b * fx;
  const baixo = c * (1 - fx) + d * fx;
  return cima * (1 - fy) + baixo * fy;
}
