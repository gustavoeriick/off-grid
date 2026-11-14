import { describe, expect, it } from 'vitest';
import { emUso, horasDeUso } from './uso';

describe('horasDeUso', () => {
  it('conta as horas, inclusive atravessando a meia-noite', () => {
    expect(horasDeUso({ inicio: 8, fim: 18 })).toBe(10);
    expect(horasDeUso({ inicio: 0, fim: 24 })).toBe(24);
    expect(horasDeUso({ inicio: 22, fim: 6 })).toBe(8);
    expect(horasDeUso({ inicio: 9, fim: 9 })).toBe(0);
  });
});

describe('emUso', () => {
  it('o início entra e o fim não', () => {
    expect(emUso({ inicio: 8, fim: 18 }, 8)).toBe(true);
    expect(emUso({ inicio: 8, fim: 18 }, 17.99)).toBe(true);
    expect(emUso({ inicio: 8, fim: 18 }, 18)).toBe(false);
    expect(emUso({ inicio: 8, fim: 18 }, 7.5)).toBe(false);
  });

  it('atravessa a meia-noite', () => {
    expect(emUso({ inicio: 22, fim: 6 }, 23)).toBe(true);
    expect(emUso({ inicio: 22, fim: 6 }, 3)).toBe(true);
    expect(emUso({ inicio: 22, fim: 6 }, 12)).toBe(false);
  });

  it('dia inteiro sempre está em uso; horário vazio nunca', () => {
    expect(emUso({ inicio: 0, fim: 24 }, 0)).toBe(true);
    expect(emUso({ inicio: 0, fim: 24 }, 23.9)).toBe(true);
    expect(emUso({ inicio: 9, fim: 9 }, 9)).toBe(false);
  });
});
