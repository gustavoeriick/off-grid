import { describe, expect, it } from 'vitest';
import { direcaoSol, normalDoPlano, posicaoSol } from './sol';

// Hora local do Rio = UTC − 3.
const ms = (a: number, m: number, d: number, h: number) => Date.UTC(a, m - 1, d, h, 0);

const RIO: [number, number] = [-22.9, -43.2];

describe('posicaoSol contra a tabela da especificação (tolerância 0,05°)', () => {
  const casos: [string, number, [number, number], number, number][] = [
    ['Rio 21/06/2026 12:00', ms(2026, 6, 21, 15), RIO, 358.3, 43.64],
    ['Rio 21/06/2026 08:00', ms(2026, 6, 21, 11), RIO, 54.83, 16.55],
    ['Rio 21/06/2026 16:00', ms(2026, 6, 21, 19), RIO, 303.74, 14.52],
    ['Rio 21/12/2026 12:00', ms(2026, 12, 21, 15), RIO, 255.08, 87.85],
    ['Rio 21/12/2026 07:00', ms(2026, 12, 21, 10), RIO, 106.55, 23.95],
    ['Rio 20/03/2026 12:00', ms(2026, 3, 20, 15), RIO, 0.13, 67.09],
    ['Rio 21/06/2026 00:00', ms(2026, 6, 21, 3), RIO, 66.52, -88.64],
    ['Fortaleza 21/12/2026 12:00', ms(2026, 12, 21, 15), [-3.73, -38.52], 198.19, 69.18],
    ['Porto Alegre 21/06/2026 12:00', ms(2026, 6, 21, 15), [-30.03, -51.23], 7.61, 36.15],
  ];
  for (const [rotulo, t, [lat, lon], az, el] of casos) {
    it(rotulo, () => {
      const s = posicaoSol(t, lat, lon);
      expect(Math.abs(s.azimute - az)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(s.elevacao - el)).toBeLessThanOrEqual(0.05);
    });
  }
});

describe('direcaoSol e normalDoPlano', () => {
  it('no Rio, ao meio-dia de 21/06, o sol está ao norte (z negativo)', () => {
    const s = posicaoSol(ms(2026, 6, 21, 15), ...RIO);
    const v = direcaoSol(s.azimute, s.elevacao);
    expect(v[2]).toBeLessThan(0);
    expect(v[1]).toBeGreaterThan(0);
  });

  it('é um vetor unitário', () => {
    const v = direcaoSol(123, 34);
    expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  });

  it('pontos cardeais: leste é +x, norte é −z, zênite é +y', () => {
    const leste = direcaoSol(90, 0);
    expect(leste[0]).toBeCloseTo(1, 12);
    const norte = direcaoSol(0, 0);
    expect(norte[2]).toBeCloseTo(-1, 12);
    expect(direcaoSol(0, 90)[1]).toBeCloseTo(1, 12);
  });

  it('normalDoPlano(17, 0) é (0; 0,9563; −0,2924)', () => {
    const n = normalDoPlano(17, 0);
    expect(n[0]).toBeCloseTo(0, 4);
    expect(n[1]).toBeCloseTo(0.9563, 4);
    expect(n[2]).toBeCloseTo(-0.2924, 4);
  });

  it('plano horizontal tem normal para cima', () => {
    const n = normalDoPlano(0, 123);
    expect(n[0]).toBeCloseTo(0, 12);
    expect(n[1]).toBeCloseTo(1, 12);
    expect(n[2]).toBeCloseTo(0, 12);
  });
});
