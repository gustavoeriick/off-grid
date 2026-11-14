import { describe, expect, it } from 'vitest';
import { CASA_INICIAL } from './cenarios';
import { ajustarParedesInternas, areaDoComodo, comodoDe } from './comodos';
import type { CasaConfig, Dispositivo } from './tipos';

function peca(superficie: string | null, x: number, z: number, y = 1): Dispositivo {
  return { uid: 'p', itemId: 'ap-tv', pos: [x, y, z], quat: [0, 0, 0, 1], superficie, giro: 0, ligado: true, uso: null };
}
const casa = (): CasaConfig => structuredClone(CASA_INICIAL);
const nome = (c: CasaConfig, d: Dispositivo): string | undefined => comodoDe(c, d)?.nome;

describe('comodoDe: casa inicial', () => {
  it('uma peça em cada cômodo', () => {
    const c = casa();
    expect(nome(c, peca('piso-terreo', 1, 2))).toBe('Sala');
    expect(nome(c, peca('piso-terreo', -2, -2.5))).toBe('Cozinha');
    expect(nome(c, peca('piso-superior', 1, 2.5))).toBe('Quarto 1');
    expect(nome(c, peca('piso-superior', -2, -2))).toBe('Quarto 2');
    expect(nome(c, peca('piso-superior', 2.5, -2))).toBe('Corredor');
  });

  it('peça em parede: o andar vem do id da superfície', () => {
    const c = casa();
    expect(nome(c, peca('parede-fundos-0', 0, -3.4))).toBe('Cozinha');
    expect(nome(c, peca('parede-frente-1', 1, 3.4))).toBe('Quarto 1');
    expect(nome(c, peca('parede-esquerda-1', -3.9, -2))).toBe('Quarto 2');
    expect(nome(c, peca('parede-interna-terreo', 1, -0.6))).toBe('Sala');
    expect(nome(c, peca('parede-interna-superior-meio', 0.7, -2))).toBe('Corredor');
  });

  it('a passagem conta como parede fechada: a porta não junta os cômodos', () => {
    const c = casa();
    // Dos dois lados da passagem do térreo (x = 0,3).
    expect(nome(c, peca('piso-terreo', 0.3, -0.5))).toBe('Sala');
    expect(nome(c, peca('piso-terreo', 0.3, -0.9))).toBe('Cozinha');
    const area = areaDoComodo(c, c.comodos.find((x) => x.nome === 'Sala')!);
    expect(area.contem(0.3, -0.9)).toBe(false);
  });

  it('áreas: Sala e Cozinha somam a planta do térreo', () => {
    const c = casa();
    const sala = areaDoComodo(c, c.comodos[0]);
    const cozinha = areaDoComodo(c, c.comodos[1]);
    expect(sala.metrosQuadrados + cozinha.metrosQuadrados).toBeCloseTo(8 * 7, 6);
    expect(cozinha.metrosQuadrados).toBeCloseTo(8 * 2.8, 6);
  });

  it('varanda, quartinho e telhado', () => {
    const c = casa();
    expect(nome(c, peca('piso-varanda-frente', 0, 5))).toBe('Varanda');
    expect(nome(c, peca('telhado-varanda-frente', 0, 5))).toBe('Varanda');
    expect(nome(c, peca('piso-quartinho', 6.5, -2))).toBe('Quartinho');
    expect(nome(c, peca('parede-quartinho-fundo', 6.5, -3))).toBe('Quartinho');
    expect(nome(c, peca('telhado-quartinho', 6.5, -2))).toBe('Quartinho');
    expect(comodoDe(c, peca('telhado-frente', 0, 1))).toBeNull();
    expect(comodoDe(c, peca('telhado-fundos', 0, -1))).toBeNull();
    expect(comodoDe(c, peca(null, 0, 0))).toBeNull();
  });

  it('área sem ponto de cômodo é "Sem nome"', () => {
    const c = casa();
    c.comodos = c.comodos.filter((x) => x.nome !== 'Cozinha');
    expect(nome(c, peca('piso-terreo', 0, -2))).toBe('Sem nome');
    expect(nome(c, peca('piso-terreo', 0, 2))).toBe('Sala');
  });

  it('casa de um andar ignora o andar de cima', () => {
    const c = casa();
    c.andares = 1;
    expect(comodoDe(c, peca('piso-superior', 1, 2.5))).toBeNull();
    expect(nome(c, peca('piso-terreo', 1, 2))).toBe('Sala');
  });
});

describe('ajustarParedesInternas', () => {
  it('encolher a largura corta as pontas e acompanha as passagens', () => {
    const p = ajustarParedesInternas(CASA_INICIAL.paredesInternas, 6, 7);
    const terreo = p.find((x) => x.uid === 'terreo')!;
    expect(terreo.de).toEqual([-3, -0.7]);
    expect(terreo.para).toEqual([3, -0.7]);
    expect(terreo.passagens).toEqual([3.3]);
    // A parede do meio (x = 0,6) continua dentro.
    expect(p.find((x) => x.uid === 'superior-meio')).toBeDefined();
  });

  it('encolher a profundidade corta a parede do meio e remove a que sai da planta', () => {
    const p = ajustarParedesInternas(CASA_INICIAL.paredesInternas, 8, 6);
    const meio = p.find((x) => x.uid === 'superior-meio')!;
    expect(meio.de).toEqual([0.6, -3]);
    expect(meio.para).toEqual([0.6, 0.4]);
    // A passagem estava a 3,0 da ponta em z = -3,5 e fica a 2,5 da ponta nova.
    expect(meio.passagens).toEqual([2.5]);
    const p2 = ajustarParedesInternas(CASA_INICIAL.paredesInternas, 8, 0.6);
    expect(p2.find((x) => x.uid === 'terreo')).toBeUndefined();
  });

  it('remove a parede que fica com menos de 0,5 m e não altera a entrada', () => {
    const antes = structuredClone(CASA_INICIAL.paredesInternas);
    expect(ajustarParedesInternas(CASA_INICIAL.paredesInternas, 8, 7)).toEqual(antes);
    const curta = [{ uid: 'x', andar: 0 as const, de: [2, 0] as [number, number], para: [3.4, 0] as [number, number], passagens: [] }];
    expect(ajustarParedesInternas(curta, 4, 7)).toHaveLength(0);
    expect(ajustarParedesInternas(curta, 6, 7)).toHaveLength(1);
    expect(CASA_INICIAL.paredesInternas).toEqual(antes);
  });

  it('passagem que deixa de caber some', () => {
    const p = ajustarParedesInternas(CASA_INICIAL.paredesInternas, 1.2, 7);
    expect(p.find((x) => x.uid === 'terreo')!.passagens).toEqual([]);
  });
});
