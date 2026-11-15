import { describe, expect, it } from 'vitest';
import {
  altitudeDoPixel,
  altitudeNosBlocos,
  blocoDe,
  blocosDoCaminho,
  chaveDoBloco,
  urlDoBloco,
  ZOOM_DO_RELEVO,
  type Bloco,
} from './blocos';

const Z = ZOOM_DO_RELEVO;
/** Graus de longitude de um pixel no zoom 11. */
const PIXEL_GRAUS = 360 / 2 ** Z / 256;

function blocoCom(valor: (px: number, py: number) => number): Bloco {
  const b = new Float32Array(256 * 256);
  for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) b[py * 256 + px] = valor(px, py);
  return b;
}

describe('Relevo: pixel Terrarium', () => {
  it('converte pixels da especificação', () => {
    expect(altitudeDoPixel(128, 0, 0)).toBeCloseTo(0, 2);
    expect(altitudeDoPixel(130, 110, 128)).toBeCloseTo(622.5, 2);
    expect(altitudeDoPixel(127, 255, 0)).toBeCloseTo(-1, 2);
  });
});

describe('Relevo: bloco de uma coordenada (zoom 11)', () => {
  it('(0; 0) fica no bloco 1024/1024, pixel (0; 0)', () => {
    const b = blocoDe({ lat: 0, lon: 0 }, Z);
    expect([b.x, b.y]).toEqual([1024, 1024]);
    expect(b.px).toBeCloseTo(0, 1);
    expect(b.py).toBeCloseTo(0, 1);
  });
  it('(−10; −50) fica no bloco 739/1081, pixel (142,2; 46,1)', () => {
    const b = blocoDe({ lat: -10, lon: -50 }, Z);
    expect([b.x, b.y]).toEqual([739, 1081]);
    expect(b.px).toBeCloseTo(142.2, 1);
    expect(b.py).toBeCloseTo(46.1, 1);
  });
  it('(45; 90) fica no bloco 1536/736, pixel (0; 183,5)', () => {
    const b = blocoDe({ lat: 45, lon: 90 }, Z);
    expect([b.x, b.y]).toEqual([1536, 736]);
    expect(b.px).toBeCloseTo(0, 1);
    expect(b.py).toBeCloseTo(183.5, 1);
  });
});

describe('Relevo: chave e endereço', () => {
  it('monta a chave e o endereço do bloco', () => {
    expect(chaveDoBloco(11, 739, 1081)).toBe('11/739/1081');
    expect(urlDoBloco(11, 739, 1081)).toBe(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/739/1081.png',
    );
  });
});

describe('Relevo: blocos do caminho', () => {
  it('um ponto: o bloco dele e os oito vizinhos, sem repetir', () => {
    const r = blocosDoCaminho([{ lat: -10, lon: -50 }], Z);
    expect(r).toHaveLength(9);
    const chaves = new Set(r.map((b) => chaveDoBloco(Z, b.x, b.y)));
    expect(chaves.size).toBe(9);
    expect(chaves.has('11/739/1081')).toBe(true);
    expect(chaves.has('11/738/1080')).toBe(true);
    expect(chaves.has('11/740/1082')).toBe(true);
  });
  it('vizinhos das duas pontas, pontos do meio só com o próprio bloco', () => {
    const pontos = [
      { lat: -10, lon: -50 },
      { lat: -10, lon: -48 }, // meio: bloco mais distante, sem vizinhos
      { lat: -10, lon: -40 },
    ];
    const r = blocosDoCaminho(pontos, Z);
    const chaves = r.map((b) => chaveDoBloco(Z, b.x, b.y));
    expect(new Set(chaves).size).toBe(chaves.length);
    const meio = blocoDe(pontos[1], Z);
    expect(chaves).toContain(chaveDoBloco(Z, meio.x, meio.y));
    expect(chaves).not.toContain(chaveDoBloco(Z, meio.x, meio.y + 1));
    expect(r).toHaveLength(9 + 9 + 1);
  });
  it('não repete bloco quando pontos caem no mesmo bloco', () => {
    const r = blocosDoCaminho(
      [
        { lat: -10, lon: -50 },
        { lat: -10.001, lon: -50.001 },
      ],
      Z,
    );
    expect(r).toHaveLength(9);
  });
  it('respeita as bordas do mundo', () => {
    const r = blocosDoCaminho([{ lat: 0, lon: -179.99 }], Z);
    expect(r.every((b) => b.x >= 0 && b.y >= 0 && b.x < 2048 && b.y < 2048)).toBe(true);
    expect(r).toHaveLength(6);
    const polo = blocosDoCaminho([{ lat: 85, lon: 0 }], Z);
    expect(polo.every((b) => b.y >= 0)).toBe(true);
  });
  it('lista vazia não pede nada', () => {
    expect(blocosDoCaminho([], Z)).toEqual([]);
  });
});

describe('Relevo: altitude nos blocos (bilinear)', () => {
  it('no pixel exato devolve o valor do pixel', () => {
    const mapa = new Map([[chaveDoBloco(Z, 1024, 1024), blocoCom((px, py) => px * 10 + py)]]);
    expect(altitudeNosBlocos(mapa, { lat: 0, lon: 0 }, Z)).toBeCloseTo(0, 6);
  });
  it('entre dois pixels devolve a média', () => {
    const mapa = new Map([[chaveDoBloco(Z, 1024, 1024), blocoCom((px) => px * 10)]]);
    expect(altitudeNosBlocos(mapa, { lat: 0, lon: PIXEL_GRAUS * 0.5 }, Z)).toBeCloseTo(5, 4);
    expect(altitudeNosBlocos(mapa, { lat: 0, lon: PIXEL_GRAUS * 10.25 }, Z)).toBeCloseTo(102.5, 3);
  });
  it('interpola nas duas direções', () => {
    const mapa = new Map([[chaveDoBloco(Z, 739, 1081), blocoCom((px, py) => px * 4 + py * 100)]]);
    const b = blocoDe({ lat: -10, lon: -50 }, Z);
    const esperado = Math.floor(b.px) * 4 + (b.px % 1) * 4 + Math.floor(b.py) * 100 + (b.py % 1) * 100;
    expect(altitudeNosBlocos(mapa, { lat: -10, lon: -50 }, Z)).toBeCloseTo(esperado, 2);
  });
  it('atravessa a borda para o bloco vizinho', () => {
    const mapa = new Map([
      [chaveDoBloco(Z, 1023, 1024), blocoCom(() => 100)],
      [chaveDoBloco(Z, 1024, 1024), blocoCom(() => 200)],
    ]);
    // Meio pixel antes da borda, no bloco 1023: coluna 255 (100) e coluna 0 do vizinho (200).
    expect(altitudeNosBlocos(mapa, { lat: 0, lon: -PIXEL_GRAUS * 0.5 }, Z)).toBeCloseTo(150, 3);
  });
  it('sem o bloco vizinho, usa o pixel da borda', () => {
    const mapa = new Map([[chaveDoBloco(Z, 1023, 1024), blocoCom(() => 100)]]);
    expect(altitudeNosBlocos(mapa, { lat: 0, lon: -PIXEL_GRAUS * 0.5 }, Z)).toBeCloseTo(100, 6);
  });
  it('erro claro quando o bloco do ponto não foi carregado', () => {
    expect(() => altitudeNosBlocos(new Map(), { lat: 0, lon: 0 }, Z)).toThrow(/Relevo não carregado.*11\/1024\/1024/);
  });
});
