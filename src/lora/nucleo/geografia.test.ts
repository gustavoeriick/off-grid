import { describe, expect, it } from 'vitest';
import { perto } from './apoio-de-teste';
import { distanciaKm, pontoNoCaminho, rumoGraus } from './geografia';

describe('distanciaKm', () => {
  it('de (0; 0) a (0; 1): 111,195 km', () => {
    perto(distanciaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 111.195);
  });

  it('de (-10; -50) a (-10,2; -50,3): 39,663 km', () => {
    perto(distanciaKm({ lat: -10, lon: -50 }, { lat: -10.2, lon: -50.3 }), 39.663);
  });

  it('pontos iguais dão zero, sem NaN', () => {
    expect(distanciaKm({ lat: -10, lon: -50 }, { lat: -10, lon: -50 })).toBe(0);
  });

  it('é simétrica', () => {
    const a = { lat: -10, lon: -50 };
    const b = { lat: -10.2, lon: -50.3 };
    perto(distanciaKm(a, b), distanciaKm(b, a), 1e-9);
  });
});

describe('pontoNoCaminho', () => {
  const a = { lat: -10, lon: -50 };
  const b = { lat: -10.2, lon: -50.3 };

  it('t = 0 e t = 1 dão as pontas', () => {
    const p0 = pontoNoCaminho(a, b, 0);
    const p1 = pontoNoCaminho(a, b, 1);
    perto(p0.lat, a.lat, 1e-9);
    perto(p0.lon, a.lon, 1e-9);
    perto(p1.lat, b.lat, 1e-9);
    perto(p1.lon, b.lon, 1e-9);
  });

  it('a meio caminho fica à metade da distância', () => {
    const m = pontoNoCaminho(a, b, 0.5);
    perto(distanciaKm(a, m), distanciaKm(a, b) / 2, 1e-6);
    perto(distanciaKm(m, b), distanciaKm(a, b) / 2, 1e-6);
  });

  it('pontos coincidentes devolvem o próprio ponto', () => {
    expect(pontoNoCaminho(a, a, 0.5)).toEqual(a);
  });
});

describe('rumoGraus', () => {
  const o = { lat: 0, lon: 0 };
  it('norte, leste, sul e oeste', () => {
    perto(rumoGraus(o, { lat: 1, lon: 0 }), 0);
    perto(rumoGraus(o, { lat: 0, lon: 1 }), 90);
    perto(rumoGraus(o, { lat: -1, lon: 0 }), 180);
    perto(rumoGraus(o, { lat: 0, lon: -1 }), 270);
  });

  it('fica entre 0 e 360', () => {
    const r = rumoGraus({ lat: -10, lon: -50 }, { lat: -10.2, lon: -50.3 });
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(360);
    expect(r).toBeGreaterThan(180); // sudoeste
  });

  it('pontos iguais dão 0, sem NaN', () => {
    expect(rumoGraus(o, o)).toBe(0);
  });
});
