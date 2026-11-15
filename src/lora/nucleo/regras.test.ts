import { describe, expect, it } from 'vitest';
import { modoDeTeste, perto, radioDeTeste } from './apoio-de-teste';
import { avisosDaRegra, FRASE_DA_ANATEL, limitePelaAntenaDbm, limitePelaDensidadeDbm } from './regras';

describe('limite pela densidade espectral', () => {
  it('125 kHz: 24,20 dBm', () => perto(limitePelaDensidadeDbm(125), 24.2));
  it('250 kHz: 27,21 dBm', () => perto(limitePelaDensidadeDbm(250), 27.21));
  it('500 kHz: 30,00 dBm', () => perto(limitePelaDensidadeDbm(500), 30));
});

describe('limite pela antena', () => {
  it('até 6 dBi o limite é 30 dBm; acima, cai o mesmo tanto', () => {
    expect(limitePelaAntenaDbm(0)).toBe(30);
    expect(limitePelaAntenaDbm(6)).toBe(30);
    expect(limitePelaAntenaDbm(9)).toBe(27);
  });
});

describe('avisosDaRegra', () => {
  it('22 dBm, 0 dBi, Long Fast: sem aviso', () => {
    expect(avisosDaRegra(radioDeTeste(), modoDeTeste('long-fast'))).toEqual([]);
  });

  it('30 dBm em 500 kHz com 6 dBi: sem aviso (no limite não avisa)', () => {
    expect(avisosDaRegra(radioDeTeste({ potenciaDbm: 30, ganhoDbi: 6 }), modoDeTeste('long-turbo'))).toEqual([]);
  });

  it('30 dBm com 9 dBi: avisa que o limite caiu para 27 dBm', () => {
    const avisos = avisosDaRegra(radioDeTeste({ potenciaDbm: 30, ganhoDbi: 9 }), modoDeTeste('long-turbo'));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('27 dBm');
    expect(avisos[0].endsWith(FRASE_DA_ANATEL)).toBe(true);
  });

  it('28 dBm em 250 kHz: aviso da densidade espectral, dizendo que é estimativa', () => {
    const avisos = avisosDaRegra(radioDeTeste({ potenciaDbm: 28 }), modoDeTeste('long-fast'));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('estimativa');
    expect(avisos[0]).toContain('250 kHz');
    expect(avisos[0].endsWith('Confira a regra vigente na Anatel. O rádio precisa ser homologado.')).toBe(true);
  });

  it('30 dBm em 125 kHz com 9 dBi: os dois avisos, ambos com a frase final', () => {
    const avisos = avisosDaRegra(radioDeTeste({ potenciaDbm: 30, ganhoDbi: 9 }), modoDeTeste('long-moderate'));
    expect(avisos).toHaveLength(2);
    for (const a of avisos) expect(a.endsWith(FRASE_DA_ANATEL)).toBe(true);
  });
});
