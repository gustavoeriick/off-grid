// Conta do trajeto dos cabos ("Arrumar os cabos"): docs/especificacao/cena-e-interface.md, seção 8.
// Mundos pequenos, montados à mão: um cômodo de 4 × 3 m com 2,5 m de pé-direito, com o que cada caso precisa.

import { describe, expect, it } from 'vitest';
import {
  apoioMaisPerto, caminhoLivre, ESPACO_ENTRE_CABOS, type FaceDoMundo, FOLGA_DO_TRAJETO, larguraDoGrampo, type Mundo, type P3, type PontaDoTrajeto,
  tracarTrajeto, type Trajeto, VAO_ENTRE_GRAMPOS,
} from './trajeto';

const face = (eixo: 0 | 1 | 2, sinal: 1 | -1, min: P3, max: P3, apoio = true, superficie = 'parede'): FaceDoMundo => ({ eixo, sinal, min, max, apoio, superficie });

/** Cômodo: piso em y = 0 e quatro paredes, vistas de dentro. */
function comodo(): FaceDoMundo[] {
  return [
    face(1, 1, [0, 0, 0], [4, 0, 3], true, 'piso'),
    face(0, 1, [0, 0, 0], [0, 2.5, 3], true, 'parede-a'),
    face(2, 1, [0, 0, 0], [4, 2.5, 0], true, 'parede-b'),
    face(0, -1, [4, 0, 0], [4, 2.5, 3], true, 'parede-c'),
    face(2, -1, [0, 0, 3], [4, 2.5, 3], true, 'parede-d'),
  ];
}

const mundo = (faces: FaceDoMundo[], caixas: Mundo['caixas'] = []): Mundo => ({ faces, caixas, triangulos: [] });
const terminal = (pos: P3, saida: P3 = [0, -1, 0]): PontaDoTrajeto => ({ tipo: 'terminal', pos, saida });
const LARGURA = larguraDoGrampo(0.007);
const opcoes = { largura: LARGURA, ocupados: [] };

/** Cada trecho da linha anda em um eixo só. */
function ortogonal(t: Trajeto): boolean {
  return t.pontos.every((p, i) => i === 0 || [0, 1, 2].filter((e) => Math.abs(p[e]! - t.pontos[i - 1]![e]!) > 1e-6).length <= 1);
}

function exigir(t: Trajeto | null): Trajeto {
  expect(t).not.toBeNull();
  return t!;
}

describe('trajeto de um cabo pelas superfícies', () => {
  it('na mesma parede: trechos retos e ortogonais, rentes a ela, com grampo nas pontas e na dobra', () => {
    const t = exigir(tracarTrajeto(mundo(comodo()), terminal([0.05, 1.6, 0.5]), terminal([0.05, 0.9, 2.5]), opcoes));
    expect(ortogonal(t)).toBe(true);
    for (const p of t.pontos) expect(p[0]).toBeCloseTo(FOLGA_DO_TRAJETO, 3);
    expect(t.grampos.length).toBeGreaterThanOrEqual(2);
    for (const g of t.grampos) {
      expect(g.normal).toEqual([1, 0, 0]);
      expect(g.pos[0]).toBeCloseTo(0, 6);
      expect(g.superficie).toBe('parede-a');
    }
    // Uma dobra só: desce (ou corre) e vira uma vez.
    expect(t.pontos.length).toBeLessThanOrEqual(3);
  });

  it('de uma parede a outra: passa pela quina, com um grampo de cada lado dela e nenhum vão maior que 1,5 m', () => {
    const t = exigir(tracarTrajeto(mundo(comodo()), terminal([0.05, 1.6, 2.6]), terminal([3.4, 1.6, 0.05]), opcoes));
    expect(ortogonal(t)).toBe(true);
    const normais = new Set(t.grampos.map((g) => g.normal.join(',')));
    expect(normais.has('1,0,0')).toBe(true);
    expect(normais.has('0,0,1')).toBe(true);
    // Nada de diagonal: o cabo vai até a quina (x e z a 1 cm das duas paredes).
    expect(t.pontos.some((p) => Math.abs(p[0] - FOLGA_DO_TRAJETO) < 2e-3 && Math.abs(p[2] - FOLGA_DO_TRAJETO) < 2e-3)).toBe(true);
    for (let i = 1; i < t.grampos.length; i++) {
      const a = t.grampos[i - 1]!;
      const b = t.grampos[i]!;
      if (a.normal.join() !== b.normal.join()) {
        // Os dois grampos da quina ficam a poucos centímetros dela.
        expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2])).toBeLessThan(0.12);
      } else {
        expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2])).toBeLessThanOrEqual(VAO_ENTRE_GRAMPOS + 1e-6);
      }
    }
  });

  it('desvia de uma peça presa na parede', () => {
    const peca = { min: [0, 0.4, 1.2] as P3, max: [0.2, 2.2, 1.8] as P3 };
    const t = exigir(tracarTrajeto(mundo(comodo(), [peca]), terminal([0.05, 1.3, 0.4], [0, 0, -1]), terminal([0.05, 1.3, 2.6], [0, 0, 1]), opcoes));
    expect(ortogonal(t)).toBe(true);
    for (let i = 1; i < t.pontos.length; i++) {
      expect(caminhoLivre({ faces: [], caixas: [peca], triangulos: [] }, t.pontos[i - 1]!, t.pontos[i]!)).toBe(true);
    }
    // Passou por cima ou por baixo da peça.
    expect(t.pontos.some((p) => p[1] > 2.2 || p[1] < 0.4)).toBe(true);
  });

  it('o segundo cabo corre ao lado do primeiro, sem ficar em cima dele', () => {
    const m = mundo(comodo());
    const primeiro = exigir(tracarTrajeto(m, terminal([0.05, 1.6, 0.5]), terminal([3.4, 1.6, 0.05]), opcoes));
    const ocupados = primeiro.trechos.map((x) => ({ ...x, largura: LARGURA }));
    const segundo = exigir(tracarTrajeto(m, terminal([0.05, 1.6, 0.55]), terminal([3.45, 1.6, 0.05]), { largura: LARGURA, ocupados }));
    const lado = LARGURA + ESPACO_ENTRE_CABOS;
    // Trechos paralelos dos dois cabos, um de frente para o outro, ficam a pelo menos uma faixa de distância.
    let vizinhos = 0;
    for (const a of primeiro.trechos) {
      for (const b of segundo.trechos) {
        const eixoA = [0, 1, 2].find((e) => Math.abs(a.a[e]! - a.b[e]!) > 1e-6);
        const eixoB = [0, 1, 2].find((e) => Math.abs(b.a[e]! - b.b[e]!) > 1e-6);
        if (eixoA === undefined || eixoA !== eixoB) continue;
        const sobrepoe = Math.min(Math.max(a.a[eixoA]!, a.b[eixoA]!), Math.max(b.a[eixoA]!, b.b[eixoA]!)) - Math.max(Math.min(a.a[eixoA]!, a.b[eixoA]!), Math.min(b.a[eixoA]!, b.b[eixoA]!));
        if (sobrepoe < 0.2) continue;
        const outros = [0, 1, 2].filter((e) => e !== eixoA);
        const d = Math.hypot(a.a[outros[0]!]! - b.a[outros[0]!]!, a.a[outros[1]!]! - b.a[outros[1]!]!);
        expect(d).toBeGreaterThanOrEqual(lado - 2e-3);
        if (d < lado + 0.01) vizinhos++;
      }
    }
    // E correm juntos: ao menos um trecho comprido lado a lado.
    expect(vizinhos).toBeGreaterThanOrEqual(1);
  });

  it('de um cômodo a outro: usa o vão da porta, não atravessa a parede', () => {
    // Parede de 10 cm no meio do cômodo (x de 1,95 a 2,05), com um vão de z = 1 a 1,8 e 2,1 m de altura.
    const divisoria: FaceDoMundo[] = [];
    for (const [sinal, x] of [[-1, 1.95], [1, 2.05]] as const) {
      divisoria.push(face(0, sinal, [x, 0, 0], [x, 2.5, 1]), face(0, sinal, [x, 0, 1.8], [x, 2.5, 3]), face(0, sinal, [x, 2.1, 1], [x, 2.5, 1.8]));
    }
    divisoria.push(face(2, 1, [1.95, 0, 1], [2.05, 2.1, 1]), face(2, -1, [1.95, 0, 1.8], [2.05, 2.1, 1.8]), face(1, -1, [1.95, 2.1, 1], [2.05, 2.1, 1.8]));
    const t = exigir(tracarTrajeto(mundo([...comodo(), ...divisoria]), terminal([0.05, 1.2, 0.4]), terminal([3.95, 1.2, 0.4]), opcoes));
    expect(ortogonal(t)).toBe(true);
    let cruzou = 0;
    for (let i = 1; i < t.pontos.length; i++) {
      const a = t.pontos[i - 1]!;
      const b = t.pontos[i]!;
      if ((a[0] - 2) * (b[0] - 2) > 0) continue;
      cruzou++;
      // Onde cruza o plano do meio da parede, está dentro do vão.
      expect(a[2]).toBeGreaterThan(1);
      expect(a[2]).toBeLessThan(1.8);
      expect(a[1]).toBeLessThan(2.1);
    }
    expect(cruzou).toBeGreaterThanOrEqual(1);
  });

  it('entre duas construções: cruza o vão em linha reta, acima da altura mínima, com grampo nas duas pontas', () => {
    const faces = [face(0, 1, [0, 0, 0], [0, 3, 3], true, 'casa'), face(0, -1, [1.5, 0, 0], [1.5, 3, 3], true, 'quartinho')];
    const t = exigir(tracarTrajeto(mundo(faces), terminal([0.05, 1, 1]), terminal([1.45, 1, 1.4]), { ...opcoes, alturaMinimaDoVao: 1.8 }));
    const vao = t.pontos.findIndex((p, i) => i > 0 && Math.abs(p[0] - t.pontos[i - 1]![0]) > 1);
    expect(vao).toBeGreaterThan(0);
    const [a, b] = [t.pontos[vao - 1]!, t.pontos[vao]!];
    expect(a[1]).toBeGreaterThanOrEqual(1.8);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(a[2]).toBeCloseTo(b[2], 6);
    // Um grampo em cada ponta do vão.
    expect(t.grampos.some((g) => g.superficie === 'casa' && Math.abs(g.pos[1] - a[1]) < 1e-6 && Math.abs(g.pos[2] - a[2]) < 1e-6)).toBe(true);
    expect(t.grampos.some((g) => g.superficie === 'quartinho' && Math.abs(g.pos[1] - b[1]) < 1e-6 && Math.abs(g.pos[2] - b[2]) < 1e-6)).toBe(true);
  });

  it('sem caminho e sem céu aberto para um vão, devolve nulo', () => {
    const faces = [face(0, 1, [0, 0, 0], [0, 3, 3]), face(0, -1, [1.5, 0, 0], [1.5, 3, 3]), face(1, -1, [-1, 3.2, -1], [3, 3.2, 4], false)];
    expect(tracarTrajeto(mundo(faces), terminal([0.05, 1, 1]), terminal([1.45, 1, 1.4]), { ...opcoes, alturaMinimaDoVao: 1.8 })).toBeNull();
  });

  it('não passa por cima do topo de uma parede', () => {
    // Mureta de 1 m de altura no meio do cômodo, de parede a parede: o cabo dá a volta pelo piso? Não há passagem
    // por baixo; pelo topo não vale. O caminho que sobra é pelas paredes do cômodo, por cima da linha da mureta.
    const mureta = [face(0, -1, [1.95, 0, 0], [1.95, 1, 3]), face(0, 1, [2.05, 0, 0], [2.05, 1, 3]), face(1, 1, [1.95, 1, 0], [2.05, 1, 3], false)];
    const t = exigir(tracarTrajeto(mundo([...comodo(), ...mureta]), terminal([0.05, 0.5, 1.5]), terminal([3.95, 0.5, 1.5]), opcoes));
    for (let i = 1; i < t.pontos.length; i++) {
      const a = t.pontos[i - 1]!;
      const b = t.pontos[i]!;
      if ((a[0] - 2) * (b[0] - 2) > 0) continue;
      // Cruza a linha da mureta encostado em uma parede do cômodo, acima dela.
      expect(a[1]).toBeGreaterThan(1);
      expect(Math.min(Math.abs(a[2] - FOLGA_DO_TRAJETO), Math.abs(a[2] - (3 - FOLGA_DO_TRAJETO)))).toBeLessThan(2e-3);
    }
  });
});

describe('auxiliares do trajeto', () => {
  it('largura do grampo acompanha o cabo grosso', () => {
    expect(larguraDoGrampo(0.006)).toBeCloseTo(0.03, 9);
    expect(larguraDoGrampo(0.011)).toBeCloseTo(0.044, 9);
  });

  it('apoio mais perto: o ponto da face de frente para o terminal', () => {
    const g = apoioMaisPerto(mundo(comodo()), [0.08, 1.3, 1.5], [0, -1, 0]);
    expect(g?.superficie).toBe('parede-a');
    expect(g?.pos[0]).toBeCloseTo(0, 9);
    expect(g?.pos[1]).toBeCloseTo(1.2, 9);
    expect(g?.normal).toEqual([1, 0, 0]);
  });
});
