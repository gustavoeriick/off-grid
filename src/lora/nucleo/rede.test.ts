import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, radioDeTeste } from './apoio-de-teste';
import { CANDIDATOS_AVALIADOS, SUGESTOES_MAXIMAS } from './constantes';
import { calcularEnlace } from './enlace';
import { distanciaKm, pontoNoCaminho } from './geografia';
import { montarPerfil } from './perfil';
import {
  avaliarCandidato,
  candidatosARepetidor,
  escolherSugestoes,
  melhorRota,
  piorVeredito,
  sugerirRepetidores,
  type Aresta,
  type SugestaoDeRepetidor,
} from './rede';
import type { AltitudeEm, Coordenada, Veredito } from './tipos';

const ar = (de: string, para: string, folgaDb: number, veredito: Veredito): Aresta => ({ de, para, folgaDb, veredito });

function rotaDe(r: ReturnType<typeof melhorRota>) {
  if (!r.rota) throw new Error('esperava uma rota');
  return r.rota;
}

describe('melhorRota', () => {
  it('rota direta: um trecho, nenhum ponto no meio', () => {
    const r = rotaDe(melhorRota(['A', 'B'], [ar('A', 'B', 12, 'folga')], 'A', 'B', 3));
    expect(r.pontos).toEqual(['A', 'B']);
    expect(r.trechos).toEqual([ar('A', 'B', 12, 'folga')]);
    expect(r.pontosNoMeio).toBe(0);
    expect(r.folgaDb).toBe(12);
    expect(r.veredito).toBe('folga');
    expect(r.maisFraco).toEqual(ar('A', 'B', 12, 'folga'));
  });

  it('trechos saem no sentido do percurso, mesmo com a aresta guardada ao contrário', () => {
    const r = rotaDe(melhorRota(['A', 'R', 'B'], [ar('B', 'R', 15, 'folga'), ar('R', 'A', 20, 'folga')], 'A', 'B', 3));
    expect(r.pontos).toEqual(['A', 'R', 'B']);
    expect(r.trechos.map((t) => [t.de, t.para])).toEqual([
      ['A', 'R'],
      ['R', 'B'],
    ]);
    expect(r.maisFraco.folgaDb).toBe(15);
    expect(r.folgaDb).toBe(15);
    expect(r.pontosNoMeio).toBe(1);
  });

  it('rota por um repetidor vale mais que a direta que não fecha', () => {
    const arestas = [ar('A', 'B', -8, 'nao-fecha'), ar('A', 'R', 14, 'folga'), ar('R', 'B', 11, 'folga')];
    const r = rotaDe(melhorRota(['A', 'B', 'R'], arestas, 'A', 'B', 3));
    expect(r.pontos).toEqual(['A', 'R', 'B']);
    expect(r.veredito).toBe('folga');
    expect(r.folgaDb).toBe(11);
  });

  it('veredito pesa mais que folga: a direta no limite perde para a de dois trechos com folga', () => {
    const arestas = [ar('A', 'B', 9, 'limite'), ar('A', 'R', 12, 'folga'), ar('R', 'B', 10, 'folga')];
    const r = rotaDe(melhorRota(['A', 'B', 'R'], arestas, 'A', 'B', 3));
    expect(r.pontosNoMeio).toBe(1);
    expect(r.veredito).toBe('folga');
  });

  it('a folga da rota é a do pior trecho, e o veredito é o pior dos trechos', () => {
    const arestas = [ar('A', 'R', 30, 'folga'), ar('R', 'B', 4, 'limite')];
    const r = rotaDe(melhorRota(['A', 'R', 'B'], arestas, 'A', 'B', 3));
    expect(r.folgaDb).toBe(4);
    expect(r.veredito).toBe('limite');
    expect(r.maisFraco).toEqual(ar('R', 'B', 4, 'limite'));
  });

  it('no mesmo veredito, vale a de maior folga mínima, mesmo com mais pontos no meio', () => {
    const arestas = [
      ar('A', 'B', 11, 'folga'),
      ar('A', 'R', 25, 'folga'),
      ar('R', 'S', 22, 'folga'),
      ar('S', 'B', 20, 'folga'),
    ];
    const r = rotaDe(melhorRota(['A', 'B', 'R', 'S'], arestas, 'A', 'B', 3));
    expect(r.pontos).toEqual(['A', 'R', 'S', 'B']);
    expect(r.folgaDb).toBe(20);
  });

  it('empate de veredito e de folga: vale a de menos pontos no meio', () => {
    const arestas = [
      ar('A', 'R', 15, 'folga'),
      ar('R', 'S', 15, 'folga'),
      ar('S', 'B', 15, 'folga'),
      ar('A', 'T', 15, 'folga'),
      ar('T', 'B', 15, 'folga'),
    ];
    const r = rotaDe(melhorRota(['A', 'B', 'R', 'S', 'T'], arestas, 'A', 'B', 3));
    expect(r.pontos).toEqual(['A', 'T', 'B']);
    expect(r.pontosNoMeio).toBe(1);
  });

  it('limite de saltos: cabe com 3, não cabe com 1, e informa quantos pontos no meio seriam precisos', () => {
    const pontos = ['A', 'P', 'Q', 'R', 'B'];
    const arestas = [ar('A', 'P', 12, 'folga'), ar('P', 'Q', 12, 'folga'), ar('Q', 'R', 12, 'folga'), ar('R', 'B', 12, 'folga')];
    expect(rotaDe(melhorRota(pontos, arestas, 'A', 'B', 3)).pontosNoMeio).toBe(3);
    expect(melhorRota(pontos, arestas, 'A', 'B', 1)).toEqual({ rota: null, motivo: 'limite', pontosNoMeio: 3 });
    expect(melhorRota(pontos, arestas, 'A', 'B', 2)).toEqual({ rota: null, motivo: 'limite', pontosNoMeio: 3 });
  });

  it('o limite recusa a rota melhor que passa do limite e aceita a pior que cabe', () => {
    const arestas = [
      ar('A', 'B', 2, 'limite'),
      ar('A', 'P', 30, 'folga'),
      ar('P', 'Q', 30, 'folga'),
      ar('Q', 'B', 30, 'folga'),
    ];
    const r = rotaDe(melhorRota(['A', 'B', 'P', 'Q'], arestas, 'A', 'B', 1));
    expect(r.pontos).toEqual(['A', 'B']);
    expect(r.veredito).toBe('limite');
  });

  it('em "limite", pontosNoMeio é o menor de qualquer caminho, não o de um caminho longo', () => {
    const pontos = ['A', 'P', 'Q', 'R', 'S', 'B'];
    const arestas = [
      ar('A', 'P', 12, 'folga'),
      ar('P', 'Q', 12, 'folga'),
      ar('Q', 'B', 12, 'folga'),
      ar('A', 'R', 12, 'folga'),
      ar('R', 'S', 12, 'folga'),
      ar('S', 'P', 12, 'folga'),
    ];
    expect(melhorRota(pontos, arestas, 'A', 'B', 1)).toEqual({ rota: null, motivo: 'limite', pontosNoMeio: 2 });
  });

  it('sem ligação', () => {
    const arestas = [ar('A', 'R', 12, 'folga'), ar('S', 'B', 12, 'folga')];
    expect(melhorRota(['A', 'B', 'R', 'S'], arestas, 'A', 'B', 7)).toEqual({ rota: null, motivo: 'sem-ligacao' });
    expect(melhorRota(['A', 'B'], [], 'A', 'B', 3)).toEqual({ rota: null, motivo: 'sem-ligacao' });
  });

  it('origem igual ao destino, ou ponto que não existe: sem ligação', () => {
    const arestas = [ar('A', 'B', 12, 'folga')];
    expect(melhorRota(['A', 'B'], arestas, 'A', 'A', 3)).toEqual({ rota: null, motivo: 'sem-ligacao' });
    expect(melhorRota(['A', 'B'], arestas, 'A', 'Z', 3)).toEqual({ rota: null, motivo: 'sem-ligacao' });
    expect(melhorRota(['A', 'B'], arestas, 'Z', 'B', 3)).toEqual({ rota: null, motivo: 'sem-ligacao' });
    // Aresta que aponta para ponto que não está na lista é ignorada.
    expect(melhorRota(['A', 'B'], [ar('A', 'X', 12, 'folga'), ar('X', 'B', 12, 'folga')], 'A', 'B', 3)).toEqual({
      rota: null,
      motivo: 'sem-ligacao',
    });
  });

  it('grafo com ciclo: termina e não repete ponto', () => {
    const arestas = [
      ar('A', 'P', 12, 'folga'),
      ar('P', 'Q', 12, 'folga'),
      ar('Q', 'A', 12, 'folga'),
      ar('Q', 'B', 12, 'folga'),
      ar('P', 'P', 40, 'folga'),
    ];
    const r = rotaDe(melhorRota(['A', 'P', 'Q', 'B'], arestas, 'A', 'B', 7));
    expect(r.pontos).toEqual(['A', 'Q', 'B']);
    expect(new Set(r.pontos).size).toBe(r.pontos.length);
  });

  it('30 pontos em malha densa terminam em menos de 1 s', () => {
    let semente = 12345;
    const aleatorio = () => {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
    const pontos = Array.from({ length: 30 }, (_, i) => `P${i}`);
    const arestas: Aresta[] = [];
    for (let i = 0; i < 30; i++) {
      for (let j = i + 1; j < 30; j++) {
        const folga = aleatorio() * 40 - 15;
        arestas.push(ar(pontos[i]!, pontos[j]!, folga, folga < 0 ? 'nao-fecha' : folga < 10 ? 'limite' : 'folga'));
      }
    }
    const inicio = performance.now();
    const r = melhorRota(pontos, arestas, 'P0', 'P29', 7);
    expect(performance.now() - inicio).toBeLessThan(1000);
    expect(r.rota).not.toBeNull();
  });

  it('confere com a busca exaustiva em grafos pequenos', () => {
    const posto = { folga: 0, limite: 1, 'nao-fecha': 2 } as const;
    let semente = 777;
    const aleatorio = () => {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
    for (let rodada = 0; rodada < 40; rodada++) {
      const n = 6;
      const pontos = Array.from({ length: n }, (_, i) => `P${i}`);
      const arestas: Aresta[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (aleatorio() < 0.45) continue;
          const folga = Math.round(aleatorio() * 30 - 8);
          // Veredito sorteado, sem relação obrigatória com a folga: a regra vale para qualquer entrada.
          const v = (['folga', 'limite', 'nao-fecha'] as const)[Math.floor(aleatorio() * 3)]!;
          arestas.push(ar(pontos[i]!, pontos[j]!, folga, v));
        }
      }
      const limite = 1 + Math.floor(aleatorio() * 3);
      // Busca exaustiva: todos os caminhos simples de P0 a P5.
      let melhor: { posto: number; folga: number; meio: number } | null = null;
      let menorMeio = Infinity;
      const visitar = (atual: string, visitados: string[], trechos: Aresta[]) => {
        if (atual === 'P5') {
          const meio = trechos.length - 1;
          menorMeio = Math.min(menorMeio, meio);
          if (meio > limite) return;
          const c = {
            posto: Math.max(...trechos.map((t) => posto[t.veredito])),
            folga: Math.min(...trechos.map((t) => t.folgaDb)),
            meio,
          };
          if (
            !melhor ||
            c.posto < melhor.posto ||
            (c.posto === melhor.posto && (c.folga > melhor.folga || (c.folga === melhor.folga && c.meio < melhor.meio)))
          ) {
            melhor = c;
          }
          return;
        }
        for (const a of arestas) {
          const outro = a.de === atual ? a.para : a.para === atual ? a.de : null;
          if (outro && !visitados.includes(outro)) visitar(outro, [...visitados, outro], [...trechos, a]);
        }
      };
      visitar('P0', ['P0'], []);
      const r = melhorRota(pontos, arestas, 'P0', 'P5', limite);
      if (menorMeio === Infinity) {
        expect(r).toEqual({ rota: null, motivo: 'sem-ligacao' });
      } else if (!melhor) {
        expect(r).toEqual({ rota: null, motivo: 'limite', pontosNoMeio: menorMeio });
      } else {
        const rota = rotaDe(r);
        const m = melhor as { posto: number; folga: number; meio: number };
        expect(posto[rota.veredito]).toBe(m.posto);
        expect(rota.folgaDb).toBe(m.folga);
        expect(rota.pontosNoMeio).toBe(m.meio);
      }
    }
  });
});

describe('piorVeredito', () => {
  it('nao-fecha pior que limite pior que folga', () => {
    expect(piorVeredito('folga', 'limite')).toBe('limite');
    expect(piorVeredito('limite', 'nao-fecha')).toBe('nao-fecha');
    expect(piorVeredito('folga', 'folga')).toBe('folga');
  });
});

// ---------------------------------------------------------------------------------------------
// Sugestão de repetidor. Lugares neutros: em torno de (-10; -50), longe de qualquer lugar do Gustavo.
// ---------------------------------------------------------------------------------------------

const KM_POR_GRAU = (6371.0088 * Math.PI) / 180;
const A: Coordenada = { lat: -10, lon: -50 };
const B: Coordenada = { lat: -10, lon: -49.64 };
const D = distanciaKm(A, B); // cerca de 39,4 km

/** Posição em km a leste (x) e ao norte (y) de A. */
function emKm(p: Coordenada) {
  return { x: (p.lon - A.lon) * Math.cos((A.lat * Math.PI) / 180) * KM_POR_GRAU, y: (p.lat - A.lat) * KM_POR_GRAU };
}

const radio = radioDeTeste({ alturaDaAntenaM: 6 });
const pontaA = { ...A, ...radio };
const pontaB = { ...B, ...radio };
const ambiente = ambienteDeTeste(921.5);

describe('candidatosARepetidor', () => {
  it('20 km: grade de 0,5 km dentro do retângulo, sem os pontos a menos de 1 km das pontas, só os 300 mais altos', () => {
    const b20: Coordenada = { lat: -10, lon: -50 + 20 / (KM_POR_GRAU * Math.cos((10 * Math.PI) / 180)) };
    expect(distanciaKm(A, b20)).toBeGreaterThan(19.9);
    expect(distanciaKm(A, b20)).toBeLessThan(20.1);
    let chamadas = 0;
    // Altitude crescente para leste e para o norte, sem empate.
    const alt: AltitudeEm = (p) => {
      chamadas++;
      return (p.lon + 50) * 100000 + (p.lat + 10) * 1000;
    };
    const c = candidatosARepetidor(A, b20, alt);
    // Margem de cerca de 6 km (30% de 20 km): u de cerca de -16 a 16 em passos de 0,5 e v de -6 a 6, uns 1.500
    // pontos, menos os que ficam a menos de 1 km de uma ponta.
    const dReal = distanciaKm(A, b20);
    const margem = Math.max(3, 0.3 * dReal);
    const grade = (2 * Math.floor((dReal / 2 + margem) / 0.5) + 1) * (2 * Math.floor(margem / 0.5) + 1);
    expect(grade).toBeGreaterThan(1400);
    expect(chamadas).toBeLessThan(grade);
    expect(chamadas).toBeGreaterThan(grade - 60);
    expect(c).toHaveLength(CANDIDATOS_AVALIADOS);
    // Os 300 mais altos: nenhum candidato de fora (guardado em `outros`) é mais alto que o menor dos escolhidos.
    const menor = Math.min(...c.map((x) => x.altM));
    const maior = Math.max(...c.map((x) => x.altM));
    expect(c[0]!.altM).toBe(maior);
    expect(c[CANDIDATOS_AVALIADOS - 1]!.altM).toBe(menor);
    const todos: number[] = [];
    candidatosARepetidor(A, b20, (p) => {
      const v = (p.lon + 50) * 100000 + (p.lat + 10) * 1000;
      todos.push(v);
      return v;
    });
    expect(todos.filter((v) => v > menor)).toHaveLength(CANDIDATOS_AVALIADOS - 1);
    // Limites da grade, em km a partir do começo: de -6 a 26 ao longo, ±6 de lado.
    for (const p of c) {
      const { x, y } = emKm(p);
      expect(x).toBeGreaterThanOrEqual(-6.1);
      expect(x).toBeLessThanOrEqual(26.1);
      expect(Math.abs(y)).toBeLessThanOrEqual(6.1);
      expect(distanciaKm(p, A)).toBeGreaterThanOrEqual(0.999);
      expect(distanciaKm(p, b20)).toBeGreaterThanOrEqual(0.999);
      expect(p.altM).toBe((p.lon + 50) * 100000 + (p.lat + 10) * 1000);
    }
  });

  it('exclui o que fica a menos de 1 km das pontas (grade pequena, tudo entra)', () => {
    const b3: Coordenada = { lat: -10, lon: -50 + 3 / (KM_POR_GRAU * Math.cos((10 * Math.PI) / 180)) };
    const c = candidatosARepetidor(A, b3, () => 0);
    // Margem mínima de 3 km: u de -4,5 a 4,5 (19) e v de -3 a 3 (13) = 247 pontos, menos os próximos das pontas.
    expect(c.length).toBeLessThan(247);
    expect(c.length).toBeGreaterThan(180);
    for (const p of c) {
      expect(distanciaKm(p, A)).toBeGreaterThanOrEqual(0.999);
      expect(distanciaKm(p, b3)).toBeGreaterThanOrEqual(0.999);
    }
    // Existe candidato a 1 km exato ou pouco mais de uma ponta (a grade chega perto), mas não abaixo.
    expect(Math.min(...c.map((p) => distanciaKm(p, A)))).toBeLessThan(1.6);
  });

  it('a grade é simétrica em relação ao caminho, ao longo e de lado', () => {
    const b3: Coordenada = { lat: -10, lon: -50 + 3 / (KM_POR_GRAU * Math.cos((10 * Math.PI) / 180)) };
    const meio = pontoNoCaminho(A, b3, 0.5);
    const c = candidatosARepetidor(A, b3, () => 0);
    const tem = (lat: number, lon: number) => c.some((p) => Math.abs(p.lat - lat) < 3e-5 && Math.abs(p.lon - lon) < 3e-5);
    for (const p of c) {
      expect(tem(2 * meio.lat - p.lat, p.lon), 'espelho de lado').toBe(true);
      expect(tem(p.lat, 2 * meio.lon - p.lon), 'espelho ao longo').toBe(true);
    }
  });

  it('funciona com o caminho na diagonal (grade alinhada com o caminho)', () => {
    const b: Coordenada = { lat: 0.01, lon: 0.01 };
    const a: Coordenada = { lat: -0.01, lon: -0.01 };
    const meio = pontoNoCaminho(a, b, 0.5);
    const c = candidatosARepetidor(a, b, () => 0);
    expect(c.length).toBeGreaterThan(150);
    expect(c.length).toBeLessThan(CANDIDATOS_AVALIADOS); // sem corte pelos 300: a grade inteira volta
    // Espelho pelo ponto médio (rotação de 180 graus) preserva a grade.
    for (const p of c) {
      const espelho = c.some(
        (q) => Math.abs(q.lat - (2 * meio.lat - p.lat)) < 3e-5 && Math.abs(q.lon - (2 * meio.lon - p.lon)) < 3e-5,
      );
      expect(espelho).toBe(true);
    }
  });
});

describe('escolherSugestoes', () => {
  const sug = (lat: number, folgaDb: number, veredito: Veredito): SugestaoDeRepetidor => ({
    lat,
    lon: -50,
    altM: 0,
    trechoA: { distanciaKm: 1, folgaDb, veredito },
    trechoB: { distanciaKm: 1, folgaDb, veredito },
    folgaDb,
    veredito,
  });

  it('ordena por veredito e depois por folga, e não escolhe a menos de 1 km de um já escolhido', () => {
    const lista = [
      sug(-10.0, 5, 'limite'),
      sug(-10.1, 12, 'folga'),
      sug(-10.1001, 30, 'folga'), // colado ao seguinte em folga, mas de folga maior: ganha
      sug(-10.2, 11, 'folga'),
      sug(-10.3, 50, 'nao-fecha'),
    ];
    const r = escolherSugestoes(lista);
    expect(r.map((s) => s.lat)).toEqual([-10.1001, -10.2, -10.0, -10.3]);
    expect(lista).toHaveLength(5);
  });

  it('devolve no máximo 5', () => {
    const lista = Array.from({ length: 12 }, (_, i) => sug(-10 - i * 0.05, 20 - i, 'folga'));
    expect(escolherSugestoes(lista)).toHaveLength(SUGESTOES_MAXIMAS);
  });
});

/** Vale com serra estreita (0,24 km, entre duas colunas da grade) atravessando o caminho, e um morro ao lado. */
function reliefDoVale(): AltitudeEm {
  const xMeio = D / 2;
  return (p) => {
    const { x, y } = emKm(p);
    if (Math.abs(x - (xMeio + 0.25)) < 0.12 && Math.abs(y) < 6) return 800; // a serra entre as pontas
    if (Math.hypot(x - xMeio, y - 9) < 1.5) return 600; // o morro, a 9 km do caminho
    return 0;
  };
}

describe('sugerirRepetidores', () => {
  it('vale com serra no meio: o morro ao lado enxerga as duas pontas e fecha', () => {
    const alt = reliefDoVale();
    const direto = calcularEnlace(pontaA, pontaB, montarPerfil(A, B, alt), ambiente);
    expect(direto.veredito).toBe('nao-fecha');

    const r = sugerirRepetidores(pontaA, pontaB, radio, alt, ambiente);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(5);
    const melhor = r[0]!;
    expect(melhor.veredito).not.toBe('nao-fecha');
    expect(melhor.trechoA.folgaDb).toBeGreaterThanOrEqual(0);
    expect(melhor.trechoB.folgaDb).toBeGreaterThanOrEqual(0);
    expect(melhor.altM).toBe(600);
    const { x, y } = emKm(melhor);
    expect(Math.hypot(x - D / 2, y - 9)).toBeLessThan(1.6);
    expect(melhor.folgaDb).toBe(Math.min(melhor.trechoA.folgaDb, melhor.trechoB.folgaDb));
    // A lista vem ordenada: nenhuma sugestão tem veredito melhor ou folga maior que a anterior sem ordem.
    for (let i = 1; i < r.length; i++) {
      const pa = { folga: 0, limite: 1, 'nao-fecha': 2 }[r[i - 1]!.veredito];
      const pb = { folga: 0, limite: 1, 'nao-fecha': 2 }[r[i]!.veredito];
      expect(pb).toBeGreaterThanOrEqual(pa);
      if (pb === pa) expect(r[i]!.folgaDb).toBeLessThanOrEqual(r[i - 1]!.folgaDb);
      expect(distanciaKm(r[i]!, melhor)).toBeGreaterThan(1);
    }
  });

  it('duas serras: nenhum ponto único resolve, e a lista vem sem candidato que feche', () => {
    const alt: AltitudeEm = (p) => {
      const { x, y } = emKm(p);
      if (Math.abs(y) < 30 && (Math.abs(x - D / 4) < 0.35 || Math.abs(x - (3 * D) / 4) < 0.35)) return 800;
      return 0;
    };
    const r = sugerirRepetidores(pontaA, pontaB, radio, alt, ambiente);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.veredito === 'nao-fecha')).toBe(true);
    expect(r.every((s) => s.folgaDb < 0)).toBe(true);
  });

  it('avaliarCandidato calcula os dois trechos com o cálculo do enlace', () => {
    const alt = reliefDoVale();
    const candidato = { lat: -9.92, lon: -49.82, altM: alt({ lat: -9.92, lon: -49.82 }) };
    const s = avaliarCandidato(pontaA, pontaB, candidato, radio, alt, ambiente);
    const esperadoA = calcularEnlace(pontaA, radio, montarPerfil(pontaA, candidato, alt), ambiente);
    const esperadoB = calcularEnlace(pontaB, radio, montarPerfil(pontaB, candidato, alt), ambiente);
    expect(s.trechoA.folgaDb).toBe(esperadoA.conta.folgaDb);
    expect(s.trechoB.folgaDb).toBe(esperadoB.conta.folgaDb);
    expect(s.trechoA.veredito).toBe(esperadoA.veredito);
    expect(s.lat).toBe(candidato.lat);
    expect(s.altM).toBe(candidato.altM);
  });

  it('o caso de 40 km roda em tempo razoável', () => {
    const alt = reliefDoVale();
    const inicio = performance.now();
    sugerirRepetidores(pontaA, pontaB, radio, alt, ambiente);
    const ms = performance.now() - inicio;
    console.log(`sugerirRepetidores, ${D.toFixed(1)} km: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(10000);
  });
});

