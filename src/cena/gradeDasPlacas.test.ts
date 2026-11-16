import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { ancoraDaFileira, cabeSeArrumar, centimetrosQueFaltam, FOLGA_ENTRE_PLACAS, passaDaBorda, quantasCabem } from './gradeDasPlacas';

/** Água do quartinho do tutorial: 3 m de largura mais 0,2 m de beiral de cada lado. */
const LARGURA = 3.4;
/** Ao longo da queda: (2,5 m + 2 × 0,2 m de beiral) × √(1 + 0,15²), inclinação de 15%. */
const QUEDA = 2.9 * Math.hypot(1, 0.15);

function placa(id: string): { largura: number; altura: number } {
  const item = CATALOGO.get(id);
  if (item?.categoria !== 'placa') throw new Error(`não é placa: ${id}`);
  return item;
}

describe('quantas placas cabem em uma fileira', () => {
  it('a folga fica só entre as placas, não nas bordas', () => {
    expect(FOLGA_ENTRE_PLACAS).toBe(0.02);
    expect(quantasCabem(1, 1)).toBe(1);
    expect(quantasCabem(2.02, 1)).toBe(2);
    expect(quantasCabem(2.019, 1)).toBe(1);
    expect(quantasCabem(0.99, 1)).toBe(0);
    expect(quantasCabem(3, 0)).toBe(0);
  });

  it('na água do quartinho do tutorial (3,4 m): placas grandes, duas em pé ou uma deitada por fileira', () => {
    for (const id of ['placa-renepv-585', 'placa-ronma-585', 'placa-helius-610', 'placa-dasolar-550', 'placa-jinko-550']) {
      const p = placa(id);
      // Em pé: 2 × 1,134 + 0,02 = 2,288 m cabem; a terceira pede 3,442 m, 4,2 cm a mais do que os 3,4 m.
      expect(quantasCabem(LARGURA, p.largura)).toBe(2);
      expect(3 * p.largura + 2 * FOLGA_ENTRE_PLACAS - LARGURA).toBeCloseTo(0.042, 6);
      expect(quantasCabem(QUEDA, p.altura)).toBe(1);
      // Deitada: uma por fileira, duas fileiras.
      expect(quantasCabem(LARGURA, p.altura)).toBe(1);
      expect(quantasCabem(QUEDA, p.largura)).toBe(2);
    }
  });

  it('na água do quartinho do tutorial: placas pequenas', () => {
    const p100 = placa('placa-resun-100');
    // 0,67 m: quatro (2,74 m); a quinta pede 3,43 m.
    expect(quantasCabem(LARGURA, p100.largura)).toBe(4);
    expect(quantasCabem(QUEDA, p100.altura)).toBe(2);
    expect(quantasCabem(LARGURA, p100.altura)).toBe(3);
    expect(quantasCabem(QUEDA, p100.largura)).toBe(4);
    const p150 = placa('placa-solarborn-150');
    expect(quantasCabem(LARGURA, p150.largura)).toBe(4);
    expect(quantasCabem(QUEDA, p150.altura)).toBe(1);
    expect(quantasCabem(LARGURA, p150.altura)).toBe(2);
  });
});

describe('âncora da grade em água sem placa da medida', () => {
  it('número ímpar de placas: o meio da água', () => {
    expect(ancoraDaFileira(-1.7, 1.7, 1.01)).toBeCloseTo(-1.03, 9);
    expect(ancoraDaFileira(0, 3, 2.5)).toBeCloseTo(1.5, 9);
  });

  it('número par de placas: meio passo ao lado, com sobra igual nas duas bordas', () => {
    // Duas placas de 1,134 m em 3,4 m: centros em ±0,577 m, sobra de 0,556 m de cada lado.
    const ancora = ancoraDaFileira(-1.7, 1.7, 1.134);
    expect(ancora).toBeCloseTo(-0.577, 9);
    expect(ancora - 1.134 / 2 - -1.7).toBeCloseTo(1.7 - (ancora + 1.154 + 1.134 / 2), 9);
  });

  it('todas as casas da fileira cabem na água, e a seguinte não', () => {
    for (const medida of [0.67, 1.01, 1.134, 1.48, 2.278, 2.382]) {
      const n = quantasCabem(LARGURA, medida);
      const ancora = ancoraDaFileira(0, LARGURA, medida);
      for (let i = 0; i < n; i++) expect(passaDaBorda(ancora + i * (medida + FOLGA_ENTRE_PLACAS), medida, 0, LARGURA)).toBe(0);
      expect(passaDaBorda(ancora + n * (medida + FOLGA_ENTRE_PLACAS), medida, 0, LARGURA)).toBeGreaterThan(0);
      expect(passaDaBorda(ancora - (medida + FOLGA_ENTRE_PLACAS), medida, 0, LARGURA)).toBeGreaterThan(0);
    }
  });

  it('sem lugar para nenhuma, fica no meio', () => {
    expect(ancoraDaFileira(0, 1, 2)).toBe(0.5);
  });
});

describe('quanto falta até a borda', () => {
  it('a terceira placa grande, na grade de duas encostadas na borda esquerda, passa 4,2 cm: a mensagem diz 5 cm', () => {
    // Primeira encostada em −1,7 m; a terceira casa da grade dela.
    const terceira = -1.7 + 1.134 / 2 + 2 * (1.134 + FOLGA_ENTRE_PLACAS);
    const passa = passaDaBorda(terceira, 1.134, -1.7, 1.7);
    expect(passa).toBeCloseTo(0.042, 9);
    expect(centimetrosQueFaltam(passa)).toBe(5);
  });

  it('arredonda para cima e nunca diz zero', () => {
    expect(centimetrosQueFaltam(0.03)).toBe(3);
    expect(centimetrosQueFaltam(0.0301)).toBe(4);
    expect(centimetrosQueFaltam(0.0004)).toBe(1);
  });

  it('do lado de baixo também', () => {
    expect(passaDaBorda(0.4, 1, 0, 3)).toBeCloseTo(0.1, 9);
    expect(passaDaBorda(0.5, 1, 0, 3)).toBe(0);
  });
});

describe('cabe mais uma se as outras forem para o lado', () => {
  it('três de 0,67 m espalhadas em 3,4 m deixam lugar para a quarta, mas não para a quinta', () => {
    expect(cabeSeArrumar(LARGURA, [0.67, 0.67, 0.67], 0.67)).toBe(true);
    expect(cabeSeArrumar(LARGURA, [0.67, 0.67, 0.67, 0.67], 0.67)).toBe(false);
  });

  it('duas placas grandes em 3,4 m não deixam lugar para a terceira, por mais que se arrume', () => {
    expect(cabeSeArrumar(LARGURA, [1.134, 1.134], 1.134)).toBe(false);
    expect(cabeSeArrumar(LARGURA, [1.134], 1.134)).toBe(true);
  });

  it('medidas misturadas contam pela soma', () => {
    expect(cabeSeArrumar(LARGURA, [1.134, 0.67], 1.134)).toBe(true);
    expect(cabeSeArrumar(LARGURA, [1.134, 1.01], 1.134)).toBe(true);
    expect(cabeSeArrumar(LARGURA, [2.278], 1.134)).toBe(false);
  });
});
