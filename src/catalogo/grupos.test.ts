import { describe, expect, it } from 'vitest';
import { CATALOGO, grupoDoItem, gruposDoCatalogo } from './index';

const grupos = gruposDoCatalogo(CATALOGO);

describe('tipos de equipamento do catálogo', () => {
  it('todo item pertence a exatamente um tipo', () => {
    const vistos = new Map<string, number>();
    for (const g of grupos) for (const i of g.itens) vistos.set(i.id, (vistos.get(i.id) ?? 0) + 1);
    expect(vistos.size).toBe(CATALOGO.size);
    for (const id of CATALOGO.keys()) expect(vistos.get(id), id).toBe(1);
  });

  it('as chaves são únicas e grupoDoItem acha o tipo', () => {
    expect(new Set(grupos.map((g) => g.chave)).size).toBe(grupos.length);
    for (const g of grupos) for (const i of g.itens) expect(grupoDoItem(CATALOGO, i.id)?.chave).toBe(g.chave);
    expect(grupoDoItem(CATALOGO, 'nao-existe')).toBeUndefined();
  });

  it('150 W e 155 W são o mesmo tipo', () => {
    expect(grupoDoItem(CATALOGO, 'placa-solarborn-150')).toBe(grupoDoItem(CATALOGO, 'placa-resun-155'));
  });

  it('550, 585 e 610 W são três tipos', () => {
    const a = grupoDoItem(CATALOGO, 'placa-jinko-550');
    const b = grupoDoItem(CATALOGO, 'placa-renepv-585');
    const c = grupoDoItem(CATALOGO, 'placa-helius-610');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('as duas placas de 585 W formam um tipo de 2 modelos', () => {
    const g = grupoDoItem(CATALOGO, 'placa-renepv-585');
    expect(g?.itens.map((i) => i.id).sort()).toEqual(['placa-renepv-585', 'placa-ronma-585']);
    expect(g?.nome).toBe('Placa solar de 585 W');
  });

  it('os itens do tipo ficam em ordem de preço e a referência é o mais barato sem aviso', () => {
    for (const g of grupos) {
      const precos = g.itens.map((i) => i.preco);
      expect(precos, g.nome).toEqual([...precos].sort((a, b) => a - b));
      const esperado = g.itens.find((i) => !i.naoRecomendado) ?? g.itens[0];
      expect(g.referencia, g.nome).toBe(esperado);
    }
  });

  it('nomes de tipos de equipamento montados dos dados', () => {
    const nomes = new Set(grupos.map((g) => g.nome));
    for (const n of [
      'Placa solar de 585 W',
      'Bateria de lítio 24 V 100 Ah',
      'Bateria estacionária de chumbo 12 V 105 Ah',
      'Bateria automotiva 12 V 60 Ah',
      'Inversor híbrido 3.000 W 24 V (MPPT)',
      'Inversor 1.000 W 12 V onda modificada',
      'Estação portátil 256 Wh',
      'Controlador MPPT 40 A',
      'Disjuntor de corrente contínua 32 A',
      'Fusível 150 A',
      'DPS de corrente contínua',
      'Cabo solar 6 mm²',
      'Cabo de bateria 35 mm²',
      'Cabo de bateria 25 mm² (alucobre)',
    ]) {
      expect(nomes.has(n), n).toBe(true);
    }
  });

  it('nenhum nome de tipo leva marca de fabricante', () => {
    const marcas = [
      'Renepv', 'RonMa', 'Helius', 'DA Solar', 'Jinko', 'Resun', 'SolarBorn', 'Alfx', 'Moura', 'Epever', 'Belifou', 'Auxom',
      'Freedom', 'PowerTek', 'Felicity', 'Dyness', 'Anenji', 'Jesudom', 'Aiker', 'Knup', 'Tataliken', 'Vedo', 'EcoFlow',
      'Bluetti', 'PowMr', 'Panda', 'Minipa',
    ];
    for (const g of grupos.filter((x) => ['placa', 'bateria', 'inversor', 'controlador', 'protecao', 'cabo'].includes(x.categoria))) {
      for (const m of marcas) expect(g.nome.toLowerCase(), `${g.nome} / ${m}`).not.toContain(m.toLowerCase());
    }
  });
});
