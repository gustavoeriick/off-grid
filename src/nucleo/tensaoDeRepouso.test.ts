import { describe, expect, it } from 'vitest';
import { tensaoDeRepouso } from './tensaoDeRepouso';

// Valores esperados: os das tabelas de fabricante citadas em operar.md, seção 7.1 (Trojan, Table 7; LiTime, seção 4.6).
describe('tensão de repouso da bateria', () => {
  it('chumbo de 12 V: os pontos da tabela da Trojan', () => {
    expect(tensaoDeRepouso('chumbo', 1, 12)).toEqual({ volts: 12.73, abaixoDaTabela: false });
    expect(tensaoDeRepouso('chumbo', 0.5, 12).volts).toBeCloseTo(12.1, 6);
    expect(tensaoDeRepouso('chumbo', 0.1, 12).volts).toBeCloseTo(11.51, 6);
  });

  it('entre dois pontos, a reta: 55 % fica no meio de 12,10 e 12,24 V', () => {
    expect(tensaoDeRepouso('chumbo', 0.55, 12).volts).toBeCloseTo(12.17, 6);
  });

  it('a automotiva usa a mesma tabela do chumbo', () => {
    expect(tensaoDeRepouso('automotiva', 0.7, 12).volts).toBeCloseTo(12.37, 6);
  });

  it('abaixo do último ponto não há extrapolação', () => {
    expect(tensaoDeRepouso('chumbo', 0.05, 12)).toEqual({ volts: 11.51, abaixoDaTabela: true });
    expect(tensaoDeRepouso('lifepo4', 0.1, 12)).toEqual({ volts: 13.05, abaixoDaTabela: true });
  });

  it('lítio de 12 V: 13,33 V cheia e o meio de cada faixa da LiTime', () => {
    expect(tensaoDeRepouso('lifepo4', 1, 12).volts).toBeCloseTo(13.33, 6);
    expect(tensaoDeRepouso('lifepo4', 0.75, 12).volts).toBeCloseTo(13.25, 6);
    expect(tensaoDeRepouso('lifepo4', 0.5, 12).volts).toBeCloseTo(13.15, 6);
    expect(tensaoDeRepouso('lifepo4', 0.25, 12).volts).toBeCloseTo(13.05, 6);
  });

  it('24 V e 48 V são a tabela de 12 V multiplicada', () => {
    expect(tensaoDeRepouso('lifepo4', 1, 24).volts).toBeCloseTo(26.66, 6);
    expect(tensaoDeRepouso('lifepo4', 1, 48).volts).toBeCloseTo(53.32, 6);
  });

  it('carga fora de 0 a 1 é presa nos limites', () => {
    expect(tensaoDeRepouso('chumbo', 1.2, 12).volts).toBeCloseTo(12.73, 6);
    expect(tensaoDeRepouso('chumbo', -1, 12).abaixoDaTabela).toBe(true);
  });
});
