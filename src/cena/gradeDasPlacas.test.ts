import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import {
  type AguaDoTelhado, ancoraDaFileira, arrumarPlacas, cabeSeArrumar, centimetrosQueFaltam, FOLGA_ENTRE_PLACAS, passaDaBorda, type PlacaNaAgua,
  quantasCabem,
} from './gradeDasPlacas';

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

describe('arrumar as placas de uma água', () => {
  /** Água do quartinho do tutorial, com `u` de −1,7 a 1,7 m e `v` de 0 até a queda. */
  const AGUA: AguaDoTelhado = { u0: -LARGURA / 2, u1: LARGURA / 2, v0: 0, v1: QUEDA };
  const P100 = placa('placa-resun-100');
  const P585 = placa('placa-renepv-585');
  const emPe = (uid: string, u: number, v: number, p = P100): PlacaNaAgua => ({ uid, u, v, largura: p.largura, altura: p.altura });
  const deitada = (uid: string, u: number, v: number, p = P100): PlacaNaAgua => ({ uid, u, v, largura: p.altura, altura: p.largura });

  /** Confere o que vale para qualquer arrumação: todas as placas continuam, dentro da água e com a folga entre elas. */
  function conferir(agua: AguaDoTelhado, placas: PlacaNaAgua[]): Map<string, { u: number; v: number }> {
    const r = arrumarPlacas(agua, placas);
    if (!r.ok) throw new Error(`não arrumou: ${r.motivo}`);
    expect([...r.posicoes.keys()].sort()).toEqual(placas.map((p) => p.uid).sort());
    const novas = placas.map((p) => ({ ...p, ...r.posicoes.get(p.uid)! }));
    for (const p of novas) {
      expect(passaDaBorda(p.u, p.largura, agua.u0, agua.u1), `${p.uid} em u`).toBe(0);
      expect(passaDaBorda(p.v, p.altura, agua.v0, agua.v1), `${p.uid} em v`).toBe(0);
    }
    for (const [i, a] of novas.entries()) {
      for (const b of novas.slice(i + 1)) {
        const vaoU = Math.abs(a.u - b.u) - (a.largura + b.largura) / 2;
        const vaoV = Math.abs(a.v - b.v) - (a.altura + b.altura) / 2;
        expect(Math.max(vaoU, vaoV), `${a.uid} e ${b.uid}`).toBeGreaterThanOrEqual(FOLGA_ENTRE_PLACAS - 1e-9);
      }
    }
    // Arrumar o que já está arrumado não mexe em nada.
    const deNovo = arrumarPlacas(agua, novas);
    expect(deNovo.ok && deNovo.movidas).toBe(0);
    return r.posicoes;
  }

  it('sem placa, nada a fazer', () => {
    const r = arrumarPlacas(AGUA, []);
    expect(r.ok && r.movidas === 0 && r.posicoes.size === 0).toBe(true);
  });

  it('três de 100 W espalhadas viram três casas seguidas da grade de quatro, na ordem em que estavam, e sobra lugar para a quarta', () => {
    const placas = [emPe('b', 0.1, 1.42), emPe('a', -1.3, 1.5), emPe('c', 1.36, 1.38)];
    const r = arrumarPlacas(AGUA, placas);
    expect(r.ok && r.movidas).toBe(3);
    const pos = conferir(AGUA, placas);
    const passo = P100.largura + FOLGA_ENTRE_PLACAS;
    const ancora = ancoraDaFileira(AGUA.u0, AGUA.u1, P100.largura);
    const casas = ['a', 'b', 'c'].map((uid) => (pos.get(uid)!.u - ancora) / passo);
    // Casas seguidas da grade centrada de quatro, em ordem; a que sobra fica em uma das pontas.
    for (const casa of casas) expect(casa).toBeCloseTo(Math.round(casa), 9);
    const primeira = Math.round(casas[0]!);
    expect(primeira === 0 || primeira === 1).toBe(true);
    expect(casas[1]).toBeCloseTo(primeira + 1, 9);
    expect(casas[2]).toBeCloseTo(primeira + 2, 9);
    // Todas na mesma fileira.
    expect(pos.get('a')!.v).toBeCloseTo(pos.get('b')!.v, 9);
    expect(pos.get('b')!.v).toBeCloseTo(pos.get('c')!.v, 9);
    // Com as três arrumadas, a quarta cabe na casa que sobrou, sem passar da borda.
    const livre = primeira === 0 ? 3 : 0;
    expect(passaDaBorda(ancora + livre * passo, P100.largura, AGUA.u0, AGUA.u1)).toBe(0);
  });

  it('quatro de 100 W: a fileira cheia fica centrada, com sobra igual nas duas bordas', () => {
    const placas = [emPe('a', -1.36, 1), emPe('b', -0.6, 1.1), emPe('c', 0.3, 0.9), emPe('d', 1.2, 1)];
    const pos = conferir(AGUA, placas);
    const us = ['a', 'b', 'c', 'd'].map((uid) => pos.get(uid)!.u);
    expect(us[0]! - P100.largura / 2 - AGUA.u0).toBeCloseTo(AGUA.u1 - (us[3]! + P100.largura / 2), 9);
    for (let i = 1; i < 4; i++) expect(us[i]! - us[i - 1]!).toBeCloseTo(P100.largura + FOLGA_ENTRE_PLACAS, 9);
  });

  it('duas placas grandes deslocadas vão para as duas casas da fileira centrada', () => {
    const placas = [emPe('e', -0.9, 1.3, P585), emPe('d', 1.1, 1.6, P585)];
    const pos = conferir(AGUA, placas);
    expect(pos.get('e')!.u).toBeCloseTo(-0.577, 9);
    expect(pos.get('d')!.u).toBeCloseTo(0.577, 9);
    // Uma fileira só cabe ao longo da queda: fica no meio dela.
    expect(pos.get('e')!.v).toBeCloseTo(QUEDA / 2, 9);
    expect(pos.get('d')!.v).toBeCloseTo(QUEDA / 2, 9);
  });

  it('mais placas do que cabem em uma fileira: abre a segunda, lendo de cima para baixo e da esquerda para a direita', () => {
    // Cinco de 100 W em pé: quatro por fileira, duas fileiras ao longo da queda.
    const placas = [emPe('c', 0.5, 2.3), emPe('a', -1.2, 2.35), emPe('b', -0.4, 2.28), emPe('e', -0.9, 0.7), emPe('d', 1.3, 2.3)];
    const pos = conferir(AGUA, placas);
    const cima = pos.get('a')!.v;
    for (const uid of ['b', 'c', 'd']) expect(pos.get(uid)!.v).toBeCloseTo(cima, 9);
    expect(cima - pos.get('e')!.v).toBeCloseTo(P100.altura + FOLGA_ENTRE_PLACAS, 9);
    const us = ['a', 'b', 'c', 'd'].map((uid) => pos.get(uid)!.u);
    expect([...us].sort((x, y) => x - y)).toEqual(us);
  });

  it('a placa que já está no lugar não conta como movida', () => {
    const ancora = ancoraDaFileira(AGUA.u0, AGUA.u1, P585.largura);
    const placas = [emPe('a', ancora, QUEDA / 2, P585), emPe('b', 1.0, QUEDA / 2 + 0.05, P585)];
    const r = arrumarPlacas(AGUA, placas);
    expect(r.ok && r.movidas).toBe(1);
    expect(r.ok && r.posicoes.get('a')!.u).toBeCloseTo(ancora, 9);
    expect(r.ok && r.posicoes.get('a')!.v).toBeCloseTo(QUEDA / 2, 9);
  });

  it('medidas diferentes: cada medida na fileira dela, a de cima continua em cima, e o giro não muda', () => {
    // Água maior: 5 m de largura por 4 m de queda. Duas grandes deitadas embaixo, três pequenas em pé em cima.
    const agua: AguaDoTelhado = { u0: 0, u1: 5, v0: 0, v1: 4 };
    const placas = [deitada('g1', 1.3, 0.7, P585), deitada('g2', 3.8, 0.9, P585), emPe('p1', 0.5, 3.2), emPe('p2', 2.4, 3.3), emPe('p3', 4.4, 3.1)];
    const pos = conferir(agua, placas);
    expect(pos.get('g1')!.v).toBeCloseTo(pos.get('g2')!.v, 9);
    expect(pos.get('p1')!.v).toBeCloseTo(pos.get('p3')!.v, 9);
    expect(pos.get('p1')!.v).toBeGreaterThan(pos.get('g1')!.v);
    // 2 cm entre a fileira das pequenas e a das grandes, e o conjunto centrado na queda.
    expect(pos.get('p1')!.v - P100.altura / 2 - (pos.get('g1')!.v + P585.largura / 2)).toBeCloseTo(FOLGA_ENTRE_PLACAS, 9);
    expect(4 - (pos.get('p1')!.v + P100.altura / 2)).toBeCloseTo(pos.get('g1')!.v - P585.largura / 2, 9);
  });

  it('em pé e deitada, da mesma placa, são medidas diferentes: fileiras próprias', () => {
    const agua: AguaDoTelhado = { u0: 0, u1: 5, v0: 0, v1: 4 };
    const pos = conferir(agua, [emPe('a', 1, 3), deitada('b', 1.2, 1)]);
    expect(pos.get('a')!.v).toBeGreaterThan(pos.get('b')!.v);
  });

  it('se as fileiras não cabem na água, não mexe em nada e diz o motivo', () => {
    // No quartinho, uma grande em pé e uma pequena em pé lado a lado cabem, mas em fileiras separadas não cabem na queda.
    const r = arrumarPlacas(AGUA, [emPe('g', -1, 1.4, P585), emPe('p', 0.5, 1.4)]);
    expect(r.ok).toBe(false);
    const falta = centimetrosQueFaltam(P585.altura + P100.altura + FOLGA_ENTRE_PLACAS - QUEDA);
    expect(falta).toBeGreaterThan(0);
    expect(!r.ok && r.motivo).toBe(`Placas de medidas diferentes ficam em fileiras separadas, e assim faltam ${falta} cm de telhado para caberem todas sem ficar uma em cima da outra.`);
    // Três grandes em pé: duas por fileira, e a segunda fileira não cabe na queda.
    const tres = arrumarPlacas(AGUA, [emPe('a', -1, 1.4, P585), emPe('b', 0.2, 1.4, P585), emPe('c', 1.1, 1.4, P585)]);
    expect(!tres.ok && tres.motivo).toMatch(/^Faltam \d+ cm de telhado/);
    // Placa maior do que a água.
    const pequena = arrumarPlacas({ u0: 0, u1: 1, v0: 0, v1: 1 }, [emPe('a', 0.5, 0.5, P585)]);
    expect(!pequena.ok && pequena.motivo).toBe('Há uma placa maior do que este telhado.');
  });
});
