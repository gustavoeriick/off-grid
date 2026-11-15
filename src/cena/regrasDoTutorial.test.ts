// Regras puras da cena com `soQuartinho` (tutorial): o corpo da casa não existe e não pode acusar nada.
// Especificação: docs/especificacao/tutorial.md, seções 2 e 3.

import { describe, expect, it } from 'vitest';
import { cenarioPlanoNoPapel, cenarioTutorial } from '../nucleo/cenarios';
import { avisoDoQuartinho, novaVaranda, varandaSobreOQuartinho } from './regrasDaCasa';
import { novoObstaculo, obstaculoLivre, pegadasDaCasa, terrenoLivre } from './regrasDosObstaculos';

describe('regras da casa no tutorial', () => {
  const tutorial = cenarioTutorial();
  const casa = tutorial.casa;

  it('o quartinho no meio do terreno não está "em cima da casa"', () => {
    // Com as mesmas medidas e a casa de verdade, o quartinho na origem ficaria dentro da planta.
    expect(avisoDoQuartinho({ ...casa, soQuartinho: false })).not.toBeNull();
    expect(avisoDoQuartinho(casa)).toBeNull();
  });

  it('nenhuma varanda fica em cima do quartinho', () => {
    expect(varandaSobreOQuartinho(casa, novaVaranda('frente', casa))).toBe(false);
  });

  it('só o quartinho ocupa chão', () => {
    const pegadas = pegadasDaCasa(casa);
    expect(pegadas).toHaveLength(1);
    expect(pegadas[0]).toEqual({ x: 0, z: 0, largura: 3, profundidade: 2.5, giro: 0 });
    // A 4 m do meio, dentro do que seria a planta da casa, o terreno está livre.
    expect(terrenoLivre(tutorial, { x: 4, z: 0, largura: 1, profundidade: 1, giro: 0 })).toBe(true);
    expect(terrenoLivre(tutorial, { x: 0.5, z: 0, largura: 1, profundidade: 1, giro: 0 })).toBe(false);
  });

  it('obstáculo novo nasce perto do quartinho, fora dele', () => {
    for (const tipo of ['muro', 'vizinho', 'arvore'] as const) {
      const o = novoObstaculo(tipo, tutorial);
      expect(obstaculoLivre(casa, o)).toBe(true);
      expect(Math.hypot(o.x, o.z)).toBeLessThan(14);
    }
  });

  it('na casa de verdade as regras continuam como eram', () => {
    const plano = cenarioPlanoNoPapel();
    expect(pegadasDaCasa(plano.casa).length).toBe(2 + plano.casa.varandas.length);
    const muro = novoObstaculo('muro', plano);
    expect(muro.x).toBe(0);
    expect(muro.z).toBeLessThan(-plano.casa.profundidade / 2);
  });
});
