// Confere o JSON gerado por scripts/importar-pesquisa.mjs. Especificação: catalogo.md, seção 1,
// e casos-de-teste.md, seção 12.

import { describe, expect, it } from 'vitest';
import { PESQUISA } from './pesquisa';

const CONTAGEM_ESPERADA: Record<string, number> = {
  A1: 5, A2: 5, A3: 6, A4: 5, A5: 14, A6: 8, A7: 9, A8: 15,
  B1: 3, B2: 3, B3: 3, B4: 5, B5: 8, B6: 8, B7: 9, B8: 6,
  C1: 6, C2: 6, C3: 12, C4: 3, C5: 9, C6: 3, C7: 6,
  D1: 2, D2: 6, D3: 9, D4: 9, D5: 9, D6: 9,
};

describe('pesquisa importada', () => {
  const { registros } = PESQUISA;

  it('traz a data da coleta', () => {
    expect(PESQUISA.coletadoEm).toBe('2026-11-14');
  });

  it('tem 201 registros', () => {
    expect(registros).toHaveLength(201);
  });

  it('tem a contagem esperada em cada seção', () => {
    const contagem: Record<string, number> = {};
    for (const r of registros) contagem[r.secao] = (contagem[r.secao] ?? 0) + 1;
    expect(contagem).toEqual(CONTAGEM_ESPERADA);
  });

  it('não tem preço nulo', () => {
    expect(registros.filter((r) => r.preco === null)).toEqual([]);
  });

  it('guarda o preço do Epever 3210CN sem os centavos e com a nota', () => {
    const r = registros.find((x) => x.codigo === 'MLB2074314862');
    expect(r?.preco).toBe(1286.0);
    expect(r?.notaPreco).toBe('listagem, que omite os centavos');
  });

  it('guarda o preço do cabo de 25 mm² de 5 m com a nota da listagem', () => {
    const r = registros.find((x) => x.codigo === 'MLB23503621');
    expect(r?.preco).toBe(114.98);
    expect(r?.notaPreco).toBe('na listagem aparecia 121,03');
  });

  it('tira o código do anúncio dos três formatos de link', () => {
    const por = (trecho: string) => registros.find((r) => r.link.includes(trecho))?.codigo;
    expect(por('/p/MLB62243910')).toBe('MLB62243910');
    expect(por('/up/MLBU5844565353')).toBe('MLBU5844565353');
    expect(por('MLB-4079433561-')).toBe('MLB4079433561');
  });

  it('converte "não informado" e "-" em nulo', () => {
    // Nenhum anúncio mostrava preço menor no Pix.
    expect(registros.every((r) => r.precoPix === null)).toBe(true);
    const semRiscado = registros.find((r) => r.codigo === 'MLB2073543374');
    expect(semRiscado?.precoRiscado).toBeNull();
    const comRiscado = registros.find((r) => r.codigo === 'MLB2051879022');
    expect(comRiscado?.precoRiscado).toBe(4999);
  });

  it('não repete código de anúncio', () => {
    const codigos = registros.map((r) => r.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});
