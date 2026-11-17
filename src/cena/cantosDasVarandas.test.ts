// Canto entre duas varandas de lados vizinhos: quando existe, que retângulo ocupa e como o telhado fecha.
// Especificação: docs/especificacao/cena-e-interface.md, seção 3 (Varandas).

import { describe, expect, it } from 'vitest';
import { cenarioPlanoNoPapel } from '../nucleo/cenarios';
import type { CasaConfig, LadoCasa, Varanda } from '../nucleo/tipos';
import { avisoDoQuartinho, cantosDasVarandas, varandaSobreOQuartinho } from './regrasDaCasa';
import { pegadasDaCasa, terrenoLivre } from './regrasDosObstaculos';

function varanda(lado: LadoCasa, extra: Partial<Varanda> = {}): Varanda {
  return { lado, profundidade: 3, inclinacaoPct: 30, largura: null, deslocamento: 0, ...extra };
}

/** Sobrado de 8 × 7 m, com o quartinho longe para não entrar na conta. */
function casaCom(varandas: Varanda[], extra: Partial<CasaConfig> = {}): CasaConfig {
  const base = cenarioPlanoNoPapel().casa;
  return { ...base, largura: 8, profundidade: 7, andares: 2, peDireito: 2.8, varandas, quartinho: { ...base.quartinho, x: 14, z: -14 }, ...extra };
}

describe('canto entre duas varandas vizinhas', () => {
  it('uma varanda só, ou duas em lados opostos, não têm canto', () => {
    expect(cantosDasVarandas(casaCom([varanda('frente')]))).toEqual([]);
    expect(cantosDasVarandas(casaCom([varanda('frente'), varanda('fundos')]))).toEqual([]);
  });

  it('frente e direita iguais fecham em espigão, da quina da casa à quina de fora', () => {
    const cantos = cantosDasVarandas(casaCom([varanda('frente'), varanda('direita')]));
    expect(cantos).toEqual([{ lados: ['frente', 'direita'], planta: { x0: 4, x1: 7, z0: 3.5, z1: 6.5 }, fechamento: 'espigao' }]);
  });

  it('profundidades diferentes: o canto fica aberto e cada medida vem de uma varanda', () => {
    const cantos = cantosDasVarandas(casaCom([varanda('frente', { profundidade: 2 }), varanda('direita', { profundidade: 4, inclinacaoPct: 20 })]));
    expect(cantos).toHaveLength(1);
    // Em X o canto tem a profundidade da varanda da direita; em Z, a da varanda da frente.
    expect(cantos[0]!.planta).toEqual({ x0: 4, x1: 8, z0: 3.5, z1: 5.5 });
    expect(cantos[0]!.fechamento).toBe('aberto');
  });

  it('mesma profundidade com inclinações diferentes também fica aberto', () => {
    const cantos = cantosDasVarandas(casaCom([varanda('frente', { inclinacaoPct: 30 }), varanda('direita', { inclinacaoPct: 20 })]));
    expect(cantos[0]!.fechamento).toBe('aberto');
  });

  it('inclinações pedidas diferentes que o desenho corta para a mesma fecham em espigão', () => {
    // Com 6 m e a parede em 3,05 m, a beira de 2,0 m limita as duas a 17,5%.
    const cantos = cantosDasVarandas(casaCom([varanda('frente', { profundidade: 6, inclinacaoPct: 40 }), varanda('direita', { profundidade: 6, inclinacaoPct: 60 })]));
    expect(cantos[0]!.fechamento).toBe('espigao');
  });

  it('os quatro cantos, cada um no seu quadrante', () => {
    const cantos = cantosDasVarandas(casaCom([varanda('frente'), varanda('fundos'), varanda('esquerda'), varanda('direita')]));
    expect(cantos.map((c) => c.lados)).toEqual([
      ['frente', 'direita'],
      ['direita', 'fundos'],
      ['fundos', 'esquerda'],
      ['esquerda', 'frente'],
    ]);
    expect(cantos.map((c) => c.planta)).toEqual([
      { x0: 4, x1: 7, z0: 3.5, z1: 6.5 },
      { x0: 4, x1: 7, z0: -6.5, z1: -3.5 },
      { x0: -7, x1: -4, z0: -6.5, z1: -3.5 },
      { x0: -7, x1: -4, z0: 3.5, z1: 6.5 },
    ]);
    expect(cantos.every((c) => c.fechamento === 'espigao')).toBe(true);
  });

  it('só há canto quando as duas encostam na quina', () => {
    // Meia varanda na frente, encostada na ponta direita da fachada (deslocamento positivo vai para +X).
    const naQuina = varanda('frente', { largura: 4, deslocamento: 2 });
    expect(cantosDasVarandas(casaCom([naQuina, varanda('direita')]))).toHaveLength(1);
    // A mesma meia varanda não faz canto com a da esquerda.
    expect(cantosDasVarandas(casaCom([naQuina, varanda('esquerda')]))).toEqual([]);
    // A 10 cm da quina já não encosta.
    expect(cantosDasVarandas(casaCom([varanda('frente', { largura: 4, deslocamento: 1.9 }), varanda('direita')]))).toEqual([]);
    // Na direita, a ponta negativa é a da frente: deslocamento negativo leva a varanda para +Z.
    expect(cantosDasVarandas(casaCom([varanda('frente'), varanda('direita', { largura: 3, deslocamento: -2 })]))).toHaveLength(1);
    expect(cantosDasVarandas(casaCom([varanda('frente'), varanda('direita', { largura: 3, deslocamento: 2 })]))).toEqual([]);
  });

  it('deslocamento que passaria da fachada é cortado, e a varanda encosta na quina', () => {
    expect(cantosDasVarandas(casaCom([varanda('frente', { largura: 4, deslocamento: 5 }), varanda('direita')]))).toHaveLength(1);
  });

  it('no tutorial, sem o corpo da casa, não há canto', () => {
    expect(cantosDasVarandas(casaCom([varanda('frente'), varanda('direita')], { soQuartinho: true }))).toEqual([]);
  });

  it('o canto é chão ocupado: nem peça no terreno nem o quartinho entram nele', () => {
    const casa = casaCom([varanda('frente'), varanda('direita')]);
    // Casa, duas varandas, o canto e o quartinho.
    expect(pegadasDaCasa(casa)).toHaveLength(5);
    const noCanto = { x: 5.5, z: 5, largura: 1, profundidade: 1, giro: 0 };
    expect(terrenoLivre({ casa, obstaculos: [] }, noCanto)).toBe(false);
    expect(terrenoLivre({ casa: casaCom([varanda('frente')]), obstaculos: [] }, noCanto)).toBe(true);

    const comQuartinho = { ...casa, quartinho: { ...casa.quartinho, x: 5.5, z: 5, giro: 0 } };
    expect(avisoDoQuartinho(comQuartinho)).not.toBeNull();
    // A varanda da direita, sozinha, não alcança o quartinho; é o canto com a da frente que alcança.
    expect(varandaSobreOQuartinho(comQuartinho, varanda('direita'))).toBe(true);
    expect(varandaSobreOQuartinho({ ...comQuartinho, varandas: [] }, varanda('direita'))).toBe(false);
  });
});
