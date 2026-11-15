import { beforeEach, describe, expect, it } from 'vitest';
import { RESPOSTA_OPEN_METEO } from '../dados/exemplosDeResposta';
import { converterRespostaOpenMeteo } from '../dados/openMeteo';
import { climaRealDe, limparClimaReal, registrarClimaReal, temClimaReal } from './climaReal';
import { irradiancia, LOCAIS, localDoProjeto } from './irradiancia';
import type { Local, Projeto } from './tipos';

const RIO = LOCAIS[0]!;
const H = 3600000;
const T0 = Date.UTC(2026, 5, 1, 12); // carimbo (fim da hora)

beforeEach(() => limparClimaReal());

describe('armazém de clima real', () => {
  it('sem dados, não há clima', () => {
    expect(temClimaReal('rio', T0)).toBe(false);
    expect(climaRealDe('rio', T0)).toBeUndefined();
  });

  it('interpola entre os meios das horas vizinhas', () => {
    registrarClimaReal('rio', [
      { msUtc: T0, ghi: 100, dni: 200, dhi: 50, tAmb: 20 },
      { msUtc: T0 + H, ghi: 300, dni: 400, dhi: 150, tAmb: 24 },
    ]);
    // Meio da hora que termina em T0 = T0 − 30 min: valor exato da primeira amostra.
    expect(climaRealDe('rio', T0 - H / 2)).toMatchObject({ ghi: 100, dni: 200, dhi: 50 });
    // Meio da segunda hora: valor exato da segunda.
    expect(climaRealDe('rio', T0 + H / 2)).toMatchObject({ ghi: 300, dni: 400, dhi: 150 });
    // No meio do caminho entre os dois centros (em T0).
    const m = climaRealDe('rio', T0)!;
    expect([m.ghi, m.dni, m.dhi]).toEqual([200, 300, 100]);
    // Temperatura: instantânea no carimbo.
    expect(m.tAmb).toBe(20);
    expect(climaRealDe('rio', T0 + H / 2)!.tAmb).toBeCloseTo(22, 10);
  });

  it('fora da cobertura não há dados; bordas valem', () => {
    registrarClimaReal('rio', [
      { msUtc: T0, ghi: 100, dni: 200, dhi: 50, tAmb: 20 },
      { msUtc: T0 + H, ghi: 300, dni: 400, dhi: 150, tAmb: 24 },
    ]);
    expect(temClimaReal('rio', T0 - H / 2 - 1)).toBe(false);
    expect(temClimaReal('rio', T0 - H / 2)).toBe(true);
    expect(temClimaReal('rio', T0 + H / 2)).toBe(true);
    expect(temClimaReal('rio', T0 + H / 2 + 1)).toBe(false);
    expect(temClimaReal('outro', T0)).toBe(false);
  });

  it('não interpola por cima de um buraco na série', () => {
    registrarClimaReal('rio', [
      { msUtc: T0, ghi: 100, dni: 0, dhi: 0, tAmb: 20 },
      { msUtc: T0 + 5 * H, ghi: 300, dni: 0, dhi: 0, tAmb: 24 },
    ]);
    expect(temClimaReal('rio', T0 + 2 * H)).toBe(false);
  });

  it('nunca devolve radiação negativa', () => {
    registrarClimaReal('rio', [
      { msUtc: T0, ghi: -5, dni: -5, dhi: -5, tAmb: 20 },
      { msUtc: T0 + H, ghi: 10, dni: 10, dhi: 10, tAmb: 20 },
    ]);
    expect(climaRealDe('rio', T0 - H / 2)).toMatchObject({ ghi: 0, dni: 0, dhi: 0 });
  });

  it('registrar de novo junta as séries e substitui horas repetidas', () => {
    registrarClimaReal('rio', [{ msUtc: T0, ghi: 1, dni: 1, dhi: 1, tAmb: 1 }]);
    registrarClimaReal('rio', [
      { msUtc: T0, ghi: 2, dni: 2, dhi: 2, tAmb: 2 },
      { msUtc: T0 + H, ghi: 4, dni: 4, dhi: 4, tAmb: 4 },
    ]);
    expect(climaRealDe('rio', T0 - H / 2)!.ghi).toBe(2);
    expect(climaRealDe('rio', T0 + H / 2)!.ghi).toBe(4);
  });
});

describe("irradiancia com clima 'real'", () => {
  it("sem dados é igual a 'tipico'", () => {
    const ms = Date.UTC(2026, 0, 15, 15);
    expect(irradiancia(RIO, ms, 'real')).toEqual(irradiancia(RIO, ms, 'tipico'));
  });

  it('usa os dados, com sol e temperatura; zero com o sol abaixo do horizonte', () => {
    const meiaNoite = Date.UTC(2026, 0, 15, 3);
    const serie = [];
    for (let h = -2; h <= 27; h++) serie.push({ msUtc: meiaNoite + h * H, ghi: 500, dni: 600, dhi: 120, tAmb: 28 });
    registrarClimaReal('rio', serie);
    const dia = irradiancia(RIO, meiaNoite + 12 * H, 'real'); // meio-dia local
    expect([dia.ghi, dia.dni, dia.dhi, dia.tAmb]).toEqual([500, 600, 120, 28]);
    expect(dia.elevacao).toBeGreaterThan(60);
    const noite = irradiancia(RIO, meiaNoite + 2 * H, 'real'); // 02h local
    expect([noite.ghi, noite.dni, noite.dhi]).toEqual([0, 0, 0]);
    expect(noite.tAmb).toBe(28);
  });

  it('exemplo real do Open-Meteo no Rio: energia do dia plausível e conversão de unidade/hora', () => {
    const amostras = converterRespostaOpenMeteo(RESPOSTA_OPEN_METEO);
    expect(amostras).toHaveLength(72);
    expect(amostras[0]!.msUtc).toBe(Date.UTC(2025, 11, 20, 0));
    registrarClimaReal('rio', amostras);
    const m0 = Date.UTC(2025, 11, 21, 3); // meia-noite local do dia 21/12/2025
    let wh = 0;
    let maxGhi = 0;
    for (let i = 0; i < 288; i++) {
      const irr = irradiancia(RIO, m0 + (i + 0.5) * 300000, 'real');
      wh += irr.ghi / 12;
      maxGhi = Math.max(maxGhi, irr.ghi);
    }
    expect(wh / 1000).toBeGreaterThan(0.5);
    expect(wh / 1000).toBeLessThan(9);
    expect(maxGhi).toBeLessThan(1400);
  });
});

describe('localDoProjeto', () => {
  const custom: Local = {
    id: 'local--3.12--60.02',
    nome: 'Manaus',
    lat: -3.12,
    lon: -60.02,
    fuso: -4,
    ghiMensal: Array(12).fill(4.5),
    tempMensal: Array(12).fill(27),
  };
  const base = { localId: 'rio' } as Pick<Projeto, 'localId' | 'localPersonalizado'>;

  it('devolve o personalizado quando o id confere', () => {
    expect(localDoProjeto({ localId: custom.id, localPersonalizado: custom })).toBe(custom);
  });
  it('cai em LOCAIS quando não há personalizado ou o id não confere', () => {
    expect(localDoProjeto(base)).toBe(RIO);
    expect(localDoProjeto({ localId: 'rio', localPersonalizado: custom })).toBe(RIO);
  });
  it('id desconhecido sem personalizado não existe', () => {
    expect(localDoProjeto({ localId: custom.id })).toBeUndefined();
  });
});
