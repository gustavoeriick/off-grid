import { describe, expect, it } from 'vitest';
import type { Catalogo, Item } from '../catalogo/tipos';
import {
  ambienteSemSombra,
  irradiancia,
  irradianciaNasPlacas,
  irradianciaNoPlano,
  LOCAIS,
  localPorId,
} from './irradiancia';
import { direcaoSol, normalDoPlano } from './sol';
import type { AmbientePlacas, Dispositivo, Projeto, Vec3 } from './tipos';

const RIO = LOCAIS[0]!;
const ms = (a: number, m: number, d: number, h: number, min = 0) => Date.UTC(a, m - 1, d, h, min);
const NORTE_17 = normalDoPlano(17, 0);

/** Meia-noite local (UTC−3) do dia 15 do mês, em 2026. */
const meiaNoite = (mes: number) => ms(2026, mes, 15, 3);

function somaDoDia(mes: number, clima: 'tipico' | 'limpo') {
  let ghi = 0;
  let plano = 0;
  const m0 = meiaNoite(mes);
  for (let i = 0; i < 288; i++) {
    const irr = irradiancia(RIO, m0 + (i + 0.5) * 300000, clima);
    ghi += irr.ghi / 12;
    plano += irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), NORTE_17) / 12;
  }
  return { ghi: ghi / 1000, plano: plano / 1000 };
}

describe('LOCAIS', () => {
  it('traz o Rio com os dados da especificação', () => {
    expect(localPorId('rio')).toBe(RIO);
    expect(RIO.nome).toBe('Rio de Janeiro');
    expect([RIO.lat, RIO.lon, RIO.fuso]).toEqual([-22.9, -43.2, -3]);
    expect(RIO.ghiMensal).toEqual([5.78, 5.97, 5.14, 4.52, 3.68, 3.46, 3.64, 4.26, 4.57, 5.0, 5.05, 5.56]);
    expect(RIO.tempMensal).toEqual([25.7, 25.8, 25.4, 24.3, 22.3, 21.5, 21.0, 21.3, 22.0, 22.9, 23.4, 24.7]);
  });

  it('id desconhecido não existe', () => {
    expect(localPorId('marte')).toBeUndefined();
  });
});

describe('dia típico no Rio, dia 15 de cada mês', () => {
  // mês, GHI do dia, no plano a 17° norte, PVGIS no plano
  const tabela: [number, number, number, number][] = [
    [1, 5.78, 5.54, 5.78],
    [2, 5.97, 5.83, 6.24],
    [3, 5.14, 5.18, 5.71],
    [4, 4.52, 4.77, 5.19],
    [5, 3.68, 4.01, 4.46],
    [6, 3.46, 3.9, 4.2],
    [7, 3.64, 4.07, 4.43],
    [8, 4.26, 4.6, 4.76],
    [9, 4.57, 4.66, 4.86],
    [10, 5.0, 4.94, 4.9],
    [11, 5.05, 4.9, 5.07],
    [12, 5.56, 5.32, 5.52],
  ];
  for (const [mes, ghiEsperado, planoEsperado, pvgis] of tabela) {
    it(`mês ${mes}`, () => {
      const { ghi, plano } = somaDoDia(mes, 'tipico');
      expect(Math.abs(ghi / ghiEsperado - 1)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(plano / planoEsperado - 1)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(plano / pvgis - 1)).toBeLessThanOrEqual(0.12);
    });
  }
});

describe('céu limpo perto do meio-dia solar (tolerância 1%)', () => {
  const casos: [string, number, number, number, number, number, number, number][] = [
    // rótulo, instante UTC, elevação, GHI, DNI, DHI, no plano, tAmb
    ['21/06/2026 11:55', ms(2026, 6, 21, 14, 55), 43.66, 698, 836, 121, 845, 24.3],
    ['21/12/2026 11:51', ms(2026, 12, 21, 14, 51), 89.46, 1037, 832, 205, 997, 27.4],
  ];
  for (const [rotulo, t, el, ghi, dni, dhi, plano, tAmb] of casos) {
    it(rotulo, () => {
      const irr = irradiancia(RIO, t, 'limpo');
      const perto = (obtido: number, esperado: number) =>
        expect(Math.abs(obtido / esperado - 1)).toBeLessThanOrEqual(0.01);
      perto(irr.elevacao, el);
      perto(irr.ghi, ghi);
      perto(irr.dni, dni);
      perto(irr.dhi, dhi);
      perto(irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), NORTE_17), plano);
      perto(irr.tAmb, tAmb);
    });
  }
});

describe('noite e climas', () => {
  it('à noite todas as irradiâncias são zero', () => {
    const t = ms(2026, 6, 21, 3); // 00:00 local
    for (const clima of ['tipico', 'limpo', 'nublado', 'chuvoso'] as const) {
      const irr = irradiancia(RIO, t, clima);
      expect([irr.ghi, irr.dni, irr.dhi]).toEqual([0, 0, 0]);
      expect(irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), NORTE_17)).toBe(0);
    }
  });

  it('nublado e chuvoso dão 35% e 15% do GHI de céu limpo no mesmo instante', () => {
    const t = ms(2026, 3, 10, 15);
    const limpo = irradiancia(RIO, t, 'limpo').ghi;
    expect(irradiancia(RIO, t, 'nublado').ghi).toBeCloseTo(0.35 * limpo, 8);
    expect(irradiancia(RIO, t, 'chuvoso').ghi).toBeCloseTo(0.15 * limpo, 8);
  });

  it('com sol baixo (até 3°) não há direta e toda a luz é difusa', () => {
    // 21/06 às 17:05 local: elevação de poucos graus
    const t = ms(2026, 6, 21, 20, 5);
    const irr = irradiancia(RIO, t, 'limpo');
    expect(irr.elevacao).toBeGreaterThan(0);
    expect(irr.elevacao).toBeLessThanOrEqual(3);
    expect(irr.dni).toBe(0);
    expect(irr.dhi).toBe(irr.ghi);
  });

  it('DNI nunca passa de 1100 W/m²', () => {
    for (let h = 0; h < 24; h += 0.25) {
      expect(irradiancia(RIO, ms(2026, 12, 21, 0) + h * 3600000, 'limpo').dni).toBeLessThanOrEqual(1100);
    }
  });
});

describe('irradianciaNoPlano', () => {
  const irr = { ghi: 800, dni: 700, dhi: 100, tAmb: 25, azimute: 0, elevacao: 60 };

  it('sombra total tira a direta e céu tapado total tira a difusa', () => {
    const sol = direcaoSol(0, 60);
    const normal: Vec3 = [0, 1, 0];
    const livre = irradianciaNoPlano(irr, sol, normal);
    const semDireta = irradianciaNoPlano(irr, sol, normal, 1);
    const semCeu = irradianciaNoPlano(irr, sol, normal, 0, 1);
    expect(semDireta).toBeCloseTo(100, 8); // só difusa; placa horizontal não reflete
    expect(semCeu).toBeCloseTo(livre - 100, 8);
  });

  it('placa de costas para o sol não recebe direta', () => {
    const sol = direcaoSol(0, 10);
    const normal = normalDoPlano(60, 180);
    const g = irradianciaNoPlano(irr, sol, normal);
    const difusa = (100 * (1 + normal[1])) / 2;
    const refletida = (800 * 0.2 * (1 - normal[1])) / 2;
    expect(g).toBeCloseTo(difusa + refletida, 8);
  });

  it('sem GHI o resultado é zero', () => {
    expect(irradianciaNoPlano({ ...irr, ghi: 0, dni: 0, dhi: 0 }, [0, 1, 0], [0, 1, 0])).toBe(0);
  });
});

describe('irradianciaNasPlacas', () => {
  const placaTeste: Item = {
    id: 'placa-teste',
    nome: 'Placa de teste',
    detalhe: '',
    linha: 'plano',
    preco: 0,
    categoria: 'placa',
    wp: 585,
    voc: 52,
    vmp: 43.8,
    isc: 14.2,
    imp: 13.35,
    largura: 1.134,
    altura: 2.279,
  };
  const aparelhoTeste = { id: 'ap-teste', categoria: 'aparelho' } as unknown as Item;
  const catalogo: Catalogo = new Map<string, Item>([
    [placaTeste.id, placaTeste],
    [aparelhoTeste.id, aparelhoTeste],
  ]);

  const disp = (uid: string, itemId: string): Dispositivo => ({
    uid,
    itemId,
    pos: [0, 0, 0],
    quat: [0, 0, 0, 1],
    superficie: null,
    giro: 0,
    ligado: true,
    uso: null,
  });
  const projeto: Projeto = {
    versao: 1,
    nome: 'teste',
    casa: {} as Projeto['casa'],
    localId: 'rio',
    clima: 'limpo',
    tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: [disp('placa1', 'placa-teste'), disp('ap1', 'ap-teste'), disp('placa2', 'placa-teste')],
    cabos: [],
  };

  it('devolve só as placas, com o g do plano e a tAmb do instante', () => {
    const t = ms(2026, 6, 21, 14, 55);
    const r = irradianciaNasPlacas(projeto, catalogo, RIO, t, ambienteSemSombra(NORTE_17));
    expect([...r.keys()]).toEqual(['placa1', 'placa2']);
    const irr = irradiancia(RIO, t, 'limpo');
    const esperado = irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), NORTE_17);
    expect(r.get('placa1')!.g).toBeCloseTo(esperado, 8);
    expect(r.get('placa1')!.tAmb).toBeCloseTo(irr.tAmb, 8);
  });

  it('só consulta a sombra quando há sol direto', () => {
    let consultas = 0;
    const ambiente: AmbientePlacas = {
      normal: () => NORTE_17,
      sombra: () => {
        consultas++;
        return 0;
      },
      ceuTapado: () => 0,
    };
    irradianciaNasPlacas(projeto, catalogo, RIO, ms(2026, 6, 21, 3), ambiente); // meia-noite
    expect(consultas).toBe(0);
    irradianciaNasPlacas(projeto, catalogo, RIO, ms(2026, 6, 21, 15), ambiente); // meio-dia
    expect(consultas).toBe(2);
  });

  it('sombra e céu tapado reduzem o g', () => {
    const t = ms(2026, 6, 21, 15);
    const livre = irradianciaNasPlacas(projeto, catalogo, RIO, t, ambienteSemSombra(NORTE_17)).get('placa1')!.g;
    const ambiente: AmbientePlacas = { normal: () => NORTE_17, sombra: () => 1, ceuTapado: () => 0.5 };
    const g = irradianciaNasPlacas(projeto, catalogo, RIO, t, ambiente).get('placa1')!.g;
    expect(g).toBeLessThan(livre);
  });
});

describe('ambienteSemSombra', () => {
  it('mesma normal para todas, sem sombra e sem céu tapado', () => {
    const a = ambienteSemSombra(NORTE_17);
    expect(a.normal('x')).toEqual(NORTE_17);
    expect(a.normal('y')).toEqual(NORTE_17);
    expect(a.sombra('x', [0, 1, 0])).toBe(0);
    expect(a.ceuTapado('x')).toBe(0);
  });
});
