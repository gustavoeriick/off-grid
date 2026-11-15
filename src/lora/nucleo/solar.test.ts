// Testes do dimensionamento do repetidor solar. Esperados: docs/especificacao/lora.md, seção 8.

import { describe, expect, it } from 'vitest';
import { AJUSTES_PADRAO_DO_REPETIDOR_SOLAR, dimensionarRepetidorSolar, necessidadeSolar, SOL_DO_PIOR_MES } from './solar';

describe('repetidor solar', () => {
  it('o sol do pior mês vem do simulador solar: junho no Rio, 3,46 kWh/m²/dia', () => {
    expect(SOL_DO_PIOR_MES).toEqual({ kwhM2Dia: 3.46, mes: 'junho', local: 'Rio de Janeiro' });
  });

  it('faixa padrão: de 5 a 40 mA, 3 dias sem sol', () => {
    const { min, max } = dimensionarRepetidorSolar(AJUSTES_PADRAO_DO_REPETIDOR_SOLAR);
    // 5 mA × 3,7 V × 24 h = 0,444 Wh; 40 mA = 3,552 Wh.
    expect(min.whPorDia).toBeCloseTo(0.444, 3);
    expect(max.whPorDia).toBeCloseTo(3.552, 3);
    // Placa: Wh por dia ÷ (3,46 × 0,93 × 0,975).
    expect(min.placaW).toBeCloseTo(0.1415, 3);
    expect(max.placaW).toBeCloseTo(1.1322, 3);
    // Bateria: Wh por dia × 3 dias ÷ 0,9.
    expect(min.bateriaWh).toBeCloseTo(1.48, 2);
    expect(max.bateriaWh).toBeCloseTo(11.84, 2);
    expect(min.bateriaMah).toBeCloseTo(400, 0);
    expect(max.bateriaMah).toBeCloseTo(3200, 0);
  });

  it('consumo trocado de ordem dá a mesma faixa; sem sol não há placa que resolva; nada sai NaN', () => {
    const a = dimensionarRepetidorSolar({ ...AJUSTES_PADRAO_DO_REPETIDOR_SOLAR, consumoMinMa: 40, consumoMaxMa: 5 });
    expect(a.min.placaW).toBeLessThan(a.max.placaW);
    expect(necessidadeSolar(20, 3, 0).placaW).toBe(Infinity);
    const zero = necessidadeSolar(0, 0, 3.46);
    for (const v of Object.values(zero)) expect(v).toBe(0);
    for (const v of Object.values(necessidadeSolar(-5, -1, 3.46))) expect(Number.isFinite(v)).toBe(true);
  });
});
