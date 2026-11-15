import { describe, expect, it } from 'vitest';
import { perfilDeDistanciaZero, perfilDeTeste, perto } from './apoio-de-teste';
import {
  comprimentoDeOndaM,
  curvaDaTerraM,
  difracaoDeBullington,
  geometriaDoEnlace,
  perdaNoArLivreDb,
  perdaPorObstaculoDb,
  raioDeFresnelM,
} from './propagacao';

describe('perdaNoArLivreDb', () => {
  it('20 km em 915 MHz: 117,70 dB', () => perto(perdaNoArLivreDb(20, 915), 117.7));
  it('40 km em 915 MHz: 123,72 dB', () => perto(perdaNoArLivreDb(40, 915), 123.72));
  it('20 km em 921,5 MHz: 117,76 dB', () => perto(perdaNoArLivreDb(20, 921.5), 117.76));
  it('1 km em 904,75 MHz: 91,58 dB', () => perto(perdaNoArLivreDb(1, 904.75), 91.58));
  it('distância zero dá 0, sem -Infinity nem NaN', () => {
    expect(perdaNoArLivreDb(0, 915)).toBe(0);
  });
});

describe('comprimentoDeOndaM', () => {
  it('915 MHz dá cerca de 0,328 m', () => perto(comprimentoDeOndaM(915), 0.3277, 0.0001));
});

describe('curva da Terra e Fresnel em 915 MHz', () => {
  it('no meio de 20 km: curva 5,89 m, raio 40,49 m, 60% 24,29 m', () => {
    perto(curvaDaTerraM(10, 10), 5.89);
    perto(raioDeFresnelM(10, 10, 915), 40.49);
    perto(0.6 * raioDeFresnelM(10, 10, 915), 24.29);
  });
  it('no meio de 40 km: curva 23,54 m, raio 57,26 m, 60% 34,35 m', () => {
    perto(curvaDaTerraM(20, 20), 23.54);
    perto(raioDeFresnelM(20, 20, 915), 57.26);
    perto(0.6 * raioDeFresnelM(20, 20, 915), 34.35);
  });
  it('a 5 km de um enlace de 20 km: curva 4,41 m, raio 35,06 m', () => {
    perto(curvaDaTerraM(5, 15), 4.41);
    perto(raioDeFresnelM(5, 15, 915), 35.06);
  });
  it('nas pontas e com distância zero, o raio é 0 e a curva é 0', () => {
    expect(raioDeFresnelM(0, 20, 915)).toBe(0);
    expect(raioDeFresnelM(20, 0, 915)).toBe(0);
    expect(raioDeFresnelM(0, 0, 915)).toBe(0);
    expect(curvaDaTerraM(0, 0)).toBe(0);
  });
});

describe('perdaPorObstaculoDb (J)', () => {
  it('ν = -1: 0', () => expect(perdaPorObstaculoDb(-1)).toBe(0));
  it('ν = -0,78: 0', () => expect(perdaPorObstaculoDb(-0.78)).toBe(0));
  it('ν = 0: 6,03 dB', () => perto(perdaPorObstaculoDb(0), 6.03));
  it('ν = 1: 13,93 dB', () => perto(perdaPorObstaculoDb(1), 13.93));
  it('ν = 2,4: 20,54 dB', () => perto(perdaPorObstaculoDb(2.4), 20.54));
});

describe('difracaoDeBullington, 915 MHz, terreno ao nível do mar', () => {
  const caso = (
    km: number,
    hInicio: number,
    hFim: number,
    picos: Record<number, number>,
    visada: boolean,
    luc: number,
    perda: number,
  ) => {
    const d = difracaoDeBullington(perfilDeTeste(km, picos), hInicio, hFim, 915);
    expect(d.visada).toBe(visada);
    perto(d.lucDb, luc);
    perto(d.perdaDb, perda);
  };

  it('plano, 20 km, antenas a 8 m: com visada, Luc 5,40, perda 11,57', () => caso(20, 8, 8, {}, true, 5.4, 11.57));
  it('plano, 20 km, antenas a 30 m: com visada, 0 e 0', () => caso(20, 30, 30, {}, true, 0, 0));
  it('plano, 40 km, antenas a 8 m: sem visada, Luc 10,17, perda 18,99', () => caso(40, 8, 8, {}, false, 10.17, 18.99));
  it('plano, 40 km, antenas a 60 m: com visada, 0 e 0', () => caso(40, 60, 60, {}, true, 0, 0));
  it('morro de 100 m no meio (um ponto), 20 km, antenas a 10 m: sem visada, Luc 23,36, perda 33,55', () =>
    caso(20, 10, 10, { 10: 100 }, false, 23.36, 33.55));
  it('morros de 80 m aos 5 km e de 120 m aos 14 km: sem visada, Luc 28,25, perda 38,56', () =>
    caso(20, 10, 10, { 5: 80, 14: 120 }, false, 28.25, 38.56));
  it('uma ponta a 300 m e a outra a 10 m, plano, 40 km: com visada, 0 e 0', () => {
    // As antenas ficam a 300 m e a 10 m de altitude (terreno ao nível do mar).
    caso(40, 300, 10, {}, true, 0, 0);
  });

  it('perfil de dois pontos: sem obstáculo, perda 0', () => {
    const d = difracaoDeBullington(
      [
        { dKm: 0, altM: 0 },
        { dKm: 5, altM: 0 },
      ],
      6,
      6,
      915,
    );
    expect(d).toEqual({ visada: true, lucDb: 0, perdaDb: 0 });
  });

  it('distância zero: perda 0, sem NaN', () => {
    const d = difracaoDeBullington(perfilDeDistanciaZero(), 6, 6, 915);
    expect(d).toEqual({ visada: true, lucDb: 0, perdaDb: 0 });
  });

  it('antenas de alturas diferentes mudam o resultado e não dão NaN', () => {
    const igual = difracaoDeBullington(perfilDeTeste(20), 8, 8, 915);
    const diferente = difracaoDeBullington(perfilDeTeste(20), 8, 20, 915);
    expect(Number.isFinite(diferente.perdaDb)).toBe(true);
    expect(diferente.perdaDb).toBeLessThan(igual.perdaDb);
  });

  it('perfil com menos de dois pontos lança erro claro', () => {
    expect(() => difracaoDeBullington([{ dKm: 0, altM: 0 }], 6, 6, 915)).toThrow(/dois pontos/);
  });
});

describe('geometriaDoEnlace', () => {
  it('plano de 20 km, antenas de 8 m: no meio a folga é 8 − 5,89 e a zona não está livre', () => {
    const g = geometriaDoEnlace(perfilDeTeste(20), 8, 8, 915);
    expect(g.distanciaKm).toBe(20);
    expect(g.antenaInicioM).toBe(8);
    expect(g.antenaFimM).toBe(8);
    const meio = g.pontos[100];
    perto(meio.dKm, 10);
    perto(meio.curvaM, 5.89);
    perto(meio.linhaM, 8);
    perto(meio.folgaM, 8 - 5.89);
    perto(meio.raioDeFresnelM, 40.49);
    expect(g.zonaLivre).toBe(false);
    expect(g.piorPonto).not.toBeNull();
    perto(g.piorPonto!.dKm, 10, 0.5);
  });

  it('zona livre com antenas altas', () => {
    const g = geometriaDoEnlace(perfilDeTeste(20), 60, 60, 915);
    expect(g.zonaLivre).toBe(true);
  });

  it('nas pontas a folga é a altura da antena e o raio é 0', () => {
    const g = geometriaDoEnlace(perfilDeTeste(20), 8, 12, 915);
    expect(g.pontos[0].folgaM).toBe(8);
    expect(g.pontos[0].raioDeFresnelM).toBe(0);
    perto(g.pontos[g.pontos.length - 1].folgaM, 12);
  });

  it('antenas de alturas diferentes: a linha é reta entre as altitudes das antenas', () => {
    const perfil = perfilDeTeste(20);
    perfil[0] = { dKm: 0, altM: 100 };
    const g = geometriaDoEnlace(perfil, 10, 30, 915);
    expect(g.antenaInicioM).toBe(110);
    expect(g.antenaFimM).toBe(30);
    perto(g.pontos[100].linhaM, 70);
  });

  it('o terreno que corta a linha dá folga negativa no pior ponto', () => {
    const g = geometriaDoEnlace(perfilDeTeste(20, { 10: 100 }), 10, 10, 915);
    expect(g.zonaLivre).toBe(false);
    perto(g.piorPonto!.dKm, 10);
    expect(g.piorPonto!.folgaM).toBeLessThan(0);
  });

  it('perfil de dois pontos: sem pontos do meio, zona livre e sem pior ponto', () => {
    const g = geometriaDoEnlace(
      [
        { dKm: 0, altM: 0 },
        { dKm: 5, altM: 0 },
      ],
      6,
      6,
      915,
    );
    expect(g.zonaLivre).toBe(true);
    expect(g.piorPonto).toBeNull();
    expect(g.pontos).toHaveLength(2);
  });

  it('distância zero: nenhum número é NaN', () => {
    const g = geometriaDoEnlace(perfilDeDistanciaZero(), 6, 6, 915);
    for (const p of g.pontos) {
      for (const v of Object.values(p)) expect(Number.isNaN(v)).toBe(false);
    }
  });
});
