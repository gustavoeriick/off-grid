import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Item } from '../catalogo/tipos';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { calcularOrcamento } from './orcamento';

type Esperada = [itemId: string, quantidade: number, unitario: number, total: number];

function conferir(orc: ReturnType<typeof calcularOrcamento>, esperadas: Esperada[]) {
  expect(orc.linhas.map((l) => l.itemId)).toEqual(esperadas.map((e) => e[0]));
  esperadas.forEach(([itemId, quantidade, unitario, total], i) => {
    const l = orc.linhas[i];
    expect(l.itemId, itemId).toBe(itemId);
    expect(l.quantidade, `${itemId} quantidade`).toBeCloseTo(quantidade, 9);
    expect(l.unitario, `${itemId} unitário`).toBeCloseTo(unitario, 9);
    expect(l.total, `${itemId} total`).toBeCloseTo(total, 9);
  });
}

describe('calcularOrcamento: plano no papel', () => {
  const orc = calcularOrcamento(cenarioPlanoNoPapel(), CATALOGO);

  it('bate linha a linha com a tabela', () => {
    conferir(orc, [
      ['placa-renepv-585', 1, 819.0, 819.0],
      ['inv-anenji-3kw-24v-127', 1, 2309.0, 2309.0],
      ['bat-alfx-24v-100', 1, 3750.0, 3750.0],
      ['cabo-solar-6', 24, 8.5, 204.0],
      ['cabo-bat-25', 2, 55.0, 110.0],
      ['cabo-ca-2p5', 77, 8.82, 679.14],
      ['prot-disjuntor-cc-32', 1, 47.9, 47.9],
      ['prot-fusivel-anl-150', 1, 35.78, 35.78],
      ['acc-ganchos-8', 1, 251.79, 251.79],
      ['acc-trilhos', 1, 357.93, 357.93],
      ['acc-mc4-10', 1, 58.68, 58.68],
      ['acc-haste', 1, 44.97, 44.97],
    ]);
  });

  it('agrupa e dá unidade certa', () => {
    expect(orc.linhas.map((l) => l.grupo)).toEqual([
      ...Array(3).fill('equipamentos'),
      ...Array(3).fill('cabos'),
      ...Array(2).fill('protecoes'),
      ...Array(4).fill('instalacao'),
    ]);
    expect(orc.linhas.filter((l) => l.grupo === 'cabos').every((l) => l.unidade === 'm')).toBe(true);
    expect(orc.linhas.filter((l) => l.grupo !== 'cabos').every((l) => l.unidade === 'un')).toBe(true);
  });

  it('soma 8.668,19 e marca só o cabo de bateria como típico (110,00)', () => {
    expect(orc.total).toBeCloseTo(8668.19, 2);
    expect(orc.totalTipico).toBeCloseTo(110.0, 2);
    expect(orc.linhas.filter((l) => l.tipico).map((l) => l.itemId)).toEqual(['cabo-bat-25']);
  });

  it('traz a url do item quando ele tem', () => {
    for (const l of orc.linhas) expect(l.url).toBe(CATALOGO.get(l.itemId)?.url);
  });
});

describe('calcularOrcamento: plano corrigido', () => {
  const orc = calcularOrcamento(cenarioPlanoCorrigido(), CATALOGO);

  it('bate com a tabela corrigida', () => {
    conferir(orc, [
      ['placa-renepv-585', 2, 819.0, 1638.0],
      ['inv-anenji-3kw-24v-127', 1, 2309.0, 2309.0],
      ['bat-alfx-24v-100', 1, 3750.0, 3750.0],
      ['cabo-solar-6', 25.5, 8.5, 216.75],
      // 76,49 por metro: pesquisa/precos-mercado-livre-2026-11-14.md, anúncio MLB4849524870.
      ['cabo-bat-35', 2, 76.49, 152.98],
      ['cabo-ca-2p5', 77, 8.82, 679.14],
      ['prot-disjuntor-cc-32', 1, 47.9, 47.9],
      ['prot-dps-cc-600', 1, 63.3, 63.3],
      ['prot-fusivel-anl-150', 1, 35.78, 35.78],
      ['prot-disjuntor-ca-16', 6, 18.0, 108.0],
      ['acc-ganchos-8', 1, 251.79, 251.79],
      ['acc-trilhos', 1, 357.93, 357.93],
      ['acc-mc4-10', 1, 58.68, 58.68],
      ['acc-haste', 1, 44.97, 44.97],
      ['acc-quadro-8', 2, 41.7, 83.4],
    ]);
  });

  it('soma 9.797,62 sem valor típico', () => {
    expect(orc.total).toBeCloseTo(9797.62, 2);
    expect(orc.totalTipico).toBe(0);
  });
});

describe('calcularOrcamento: casos de borda', () => {
  it('projeto sem placa nem inversor não leva instalação', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.dispositivos = projeto.dispositivos.filter((d) => d.uid !== 'placa1' && d.uid !== 'inversor');
    projeto.cabos = [];
    const orc = calcularOrcamento(projeto, CATALOGO);
    expect(orc.linhas.map((l) => l.itemId)).toEqual(['bat-alfx-24v-100']);
  });

  it('três placas levam dois kits de ganchos e de trilhos', () => {
    const projeto = cenarioPlanoCorrigido();
    projeto.dispositivos.push({ ...projeto.dispositivos[0], uid: 'placa3' });
    const orc = calcularOrcamento(projeto, CATALOGO);
    expect(orc.linhas.find((l) => l.itemId === 'acc-ganchos-8')?.quantidade).toBe(2);
    expect(orc.linhas.find((l) => l.itemId === 'acc-trilhos')?.quantidade).toBe(2);
    expect(orc.linhas.find((l) => l.itemId === 'acc-mc4-10')?.quantidade).toBe(1);
  });

  it('arredonda cada linha a centavos antes de somar', () => {
    const base = CATALOGO.get('cabo-solar-6')!;
    const teste: Item = { ...base, preco: 0.333 };
    const catalogo = new Map(CATALOGO);
    catalogo.set(teste.id, teste);
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos = [projeto.cabos[0]];
    const orc = calcularOrcamento(projeto, catalogo);
    const linha = orc.linhas.find((l) => l.itemId === 'cabo-solar-6')!;
    expect(linha.total).toBe(4.0); // 12 × 0,333 = 3,996
  });
});
