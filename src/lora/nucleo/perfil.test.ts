import { describe, expect, it } from 'vitest';
import { perto } from './apoio-de-teste';
import { distanciaKm } from './geografia';
import { montarPerfil, pontosDoPerfil } from './perfil';

const a = { lat: -10, lon: -50 };

describe('montarPerfil', () => {
  it('um ponto a cada 0,1 km: 20 km dão 201 pontos', () => {
    const b = { lat: -10, lon: -50 + 20 / 111.195 };
    const perfil = montarPerfil(a, b, () => 5);
    expect(perfil).toHaveLength(Math.round(distanciaKm(a, b) / 0.1) + 1);
    expect(perfil[0].dKm).toBe(0);
    perto(perfil[perfil.length - 1].dKm, distanciaKm(a, b), 1e-9);
    expect(perfil.every((p) => p.altM === 5)).toBe(true);
  });

  it('trecho curto tem 20 pontos, no mínimo', () => {
    const b = { lat: -10, lon: -50 + 1 / 111.195 };
    expect(montarPerfil(a, b, () => 0)).toHaveLength(20);
  });

  it('trecho muito longo tem 1.500 pontos, no máximo', () => {
    const b = { lat: -10, lon: -50 + 300 / 111.195 };
    expect(montarPerfil(a, b, () => 0)).toHaveLength(1500);
    expect(pontosDoPerfil(1000)).toBe(1500);
  });

  it('distância zero ainda dá o mínimo de 20 pontos', () => {
    expect(pontosDoPerfil(0)).toBe(20);
  });

  it('a altitude vem da função, nas pontas exatas do enlace', () => {
    const b = { lat: -10.1, lon: -50.1 };
    const vistos: { lat: number; lon: number }[] = [];
    const perfil = montarPerfil(a, b, (p) => {
      vistos.push(p);
      return p.lat * -100;
    });
    expect(vistos[0]).toEqual(a);
    expect(vistos[vistos.length - 1]).toEqual(b);
    expect(perfil[0].altM).toBeCloseTo(1000, 6);
    // dKm cresce sempre
    for (let i = 1; i < perfil.length; i++) expect(perfil[i].dKm).toBeGreaterThan(perfil[i - 1].dKm);
  });

  it('pontos coincidentes: 20 pontos com dKm 0 e sem NaN', () => {
    const perfil = montarPerfil(a, a, () => 7);
    expect(perfil).toHaveLength(20);
    expect(perfil.every((p) => p.dKm === 0 && p.altM === 7)).toBe(true);
  });
});
