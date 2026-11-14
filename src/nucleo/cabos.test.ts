import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { TipoCabo } from '../catalogo/tipos';
import { CASA_INICIAL, cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { analisarCircuito } from './circuito';
import { correntesDeProjeto, quedasDeTensao, resistencia } from './cabos';
import type { Cabo, Projeto } from './tipos';

const cabo = (id: string): TipoCabo => {
  const item = CATALOGO.get(id);
  if (item?.categoria !== 'cabo') throw new Error(id);
  return item;
};

const correntes = (p: Projeto) => correntesDeProjeto(p, CATALOGO, analisarCircuito(p, CATALOGO));
const quedas = (p: Projeto) => quedasDeTensao(p, CATALOGO, analisarCircuito(p, CATALOGO));

/** Cabo: `de`, `para` no formato `uid.terminal`, tipo e comprimento. */
type Lig = [de: string, para: string, caboId: string, comprimento: number];

function montar(pecas: Record<string, string>, ligacoes: Lig[]): Projeto {
  const cabos: Cabo[] = ligacoes.map(([de, para, caboId, comprimento], i) => {
    const [dDe, tDe] = de.split('.');
    const [dPara, tPara] = para.split('.');
    return { uid: `c${i + 1}`, de: { disp: dDe, terminal: tDe }, para: { disp: dPara, terminal: tPara }, caboId, comprimento, protecoes: [] };
  });
  return {
    versao: 1,
    nome: 'teste',
    casa: structuredClone(CASA_INICIAL),
    localId: 'rio',
    clima: 'tipico',
    tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null,
    })),
    cabos,
  };
}

const RENEPV = 'placa-renepv-585';
const base = { inv: 'inv-anenji-3kw-24v-127', bat: 'bat-alfx-24v-100' };
const ligaBateria: Lig[] = [['bat.pos', 'inv.batPos', 'cabo-bat-35', 1], ['bat.neg', 'inv.batNeg', 'cabo-bat-35', 1]];

/** Três placas em paralelo, cada uma com o próprio par de cabos até o inversor. */
function tresComPares(caboId: string): Projeto {
  return montar(
    { ...base, p1: RENEPV, p2: RENEPV, p3: RENEPV },
    [
      ...ligaBateria,
      ...['p1', 'p2', 'p3'].flatMap((p): Lig[] => [[`${p}.pos`, 'inv.pvPos', caboId, 12], [`${p}.neg`, 'inv.pvNeg', caboId, 12]]),
    ],
  );
}

/** Três placas em paralelo emendadas em um ponto (placa 1) e um só par de cabos até o inversor. */
function tresEmendadas(caboId: string): Projeto {
  return montar(
    { ...base, p1: RENEPV, p2: RENEPV, p3: RENEPV },
    [
      ...ligaBateria,
      ['p1.pos', 'inv.pvPos', caboId, 12],
      ['p1.neg', 'inv.pvNeg', caboId, 12],
      ['p2.pos', 'p1.pos', caboId, 0],
      ['p3.pos', 'p1.pos', caboId, 0],
      ['p2.neg', 'p1.neg', caboId, 0],
      ['p3.neg', 'p1.neg', caboId, 0],
    ],
  );
}

describe('resistencia', () => {
  it('cobre', () => expect(resistencia(cabo('cabo-solar-6'), 12)).toBeCloseTo(0.038, 4));
  it('alucobre', () => expect(resistencia(cabo('cabo-bat-25-alucobre'), 10)).toBeCloseTo(0.01216, 5));
});

describe('correntesDeProjeto: cenários', () => {
  it('"plano no papel"', () => {
    const c = correntes(cenarioPlanoNoPapel());
    expect(c.get('c1')).toBeCloseTo(17.75, 2);
    expect(c.get('c2')).toBeCloseTo(17.75, 2);
    expect(c.get('c3')).toBeCloseTo(127.4, 1);
    expect(c.get('c4')).toBeCloseTo(127.4, 1);
    expect(c.get('c5')).toBeCloseTo(8.56, 2);
    expect(c.get('c9')).toBeCloseTo(1.18, 2);
  });

  it('"plano corrigido": as emendas também levam 17,75 A', () => {
    const c = correntes(cenarioPlanoCorrigido());
    for (const uid of ['c1', 'c2', 'c12']) expect(c.get(uid)).toBeCloseTo(17.75, 2);
  });

  it('todo cabo do projeto aparece no mapa', () => {
    const p = cenarioPlanoNoPapel();
    expect(correntes(p).size).toBe(p.cabos.length);
  });
});

describe('correntesDeProjeto: três placas em paralelo', () => {
  it('cada uma com o próprio par: 17,75 A em cada cabo', () => {
    const c = correntes(tresComPares('cabo-solar-6'));
    for (const uid of ['c3', 'c4', 'c5', 'c6', 'c7', 'c8']) expect(c.get(uid)).toBeCloseTo(17.75, 2);
  });

  it('emendadas em um ponto: 53,25 A no par comum, 17,75 A nas emendas', () => {
    const c = correntes(tresEmendadas('cabo-solar-6'));
    expect(c.get('c3')).toBeCloseTo(53.25, 2);
    expect(c.get('c4')).toBeCloseTo(53.25, 2);
    for (const uid of ['c5', 'c6', 'c7', 'c8']) expect(c.get(uid)).toBeCloseTo(17.75, 2);
  });
});

describe('correntesDeProjeto: outras redes', () => {
  it('cabo que fecha laço fica com 0', () => {
    const p = tresEmendadas('cabo-solar-6');
    // Segundo cabo entre os mesmos terminais de uma emenda.
    p.cabos.push({ uid: 'extra', de: { disp: 'p2', terminal: 'pos' }, para: { disp: 'p1', terminal: 'pos' }, caboId: 'cabo-solar-6', comprimento: 1, protecoes: [] });
    const c = correntes(p);
    expect(c.get('c3')).toBeCloseTo(53.25, 2);
    expect(c.get('c5')! + c.get('extra')!).toBeCloseTo(17.75, 2);
    expect([c.get('c5'), c.get('extra')].filter((x) => x === 0)).toHaveLength(1);
  });

  it('controlador no barramento injeta a corrente de carga dele', () => {
    const p = montar(
      { ...base, ctl: 'ctl-epever-xtra4210n' },
      [
        ['bat.pos', 'inv.batPos', 'cabo-bat-35', 1],
        ['bat.neg', 'inv.batNeg', 'cabo-bat-35', 1],
        ['ctl.batPos', 'bat.pos', 'cabo-bat-35', 1],
        ['ctl.batNeg', 'bat.neg', 'cabo-bat-35', 1],
      ],
    );
    const c = correntes(p);
    expect(c.get('c1')).toBeCloseTo(127.4 + 40, 1);
    expect(c.get('c3')).toBeCloseTo(40, 1);
    expect(c.get('c2')).toBeCloseTo(127.4 + 40, 1);
    expect(c.get('c4')).toBeCloseTo(40, 1);
  });

  it('banco em série: a emenda leva a corrente do ramo', () => {
    const p = montar(
      { inv: 'inv-anenji-3kw-24v-127', b1: 'bat-belifou-12v-100', b2: 'bat-belifou-12v-100' },
      [['b1.pos', 'inv.batPos', 'cabo-bat-35', 1], ['b1.neg', 'b2.pos', 'cabo-bat-35', 0.3], ['b2.neg', 'inv.batNeg', 'cabo-bat-35', 1]],
    );
    const c = correntes(p);
    // lítio de 24 V (2 x 12 V): tensaoRef 25,6 V
    const i = 3000 / (0.92 * 25.6);
    for (const uid of ['c1', 'c2', 'c3']) expect(c.get(uid)).toBeCloseTo(i, 1);
  });

  it('sem inversor, não há corrente', () => {
    const p = montar({ p1: RENEPV }, [['p1.pos', 'p1.neg', 'cabo-solar-6', 1]]);
    expect(correntes(p).get('c1')).toBe(0);
    expect(quedas(p)).toEqual([]);
  });
});

describe('quedasDeTensao', () => {
  const dosPlacas = (p: Projeto) => quedas(p).find((q) => q.circuito === 'placas')!;

  it('1 placa, cabo-solar-6, 12 m + 12 m', () => {
    const q = dosPlacas(cenarioPlanoNoPapel());
    expect(q.volts).toBeCloseTo(1.01, 2);
    expect(q.fracao).toBeCloseTo(0.0231, 4);
    expect(q.limite).toBe(0.03);
    expect(q.alvo).toBeNull();
    expect(q.cabos).toEqual(['c1', 'c2']);
  });

  it('2 em série, cabo-solar-6, 12 m + 12 m (emenda sem comprimento)', () => {
    const p = cenarioPlanoCorrigido();
    p.cabos.find((c) => c.uid === 'c12')!.comprimento = 0;
    const q = dosPlacas(p);
    expect(q.volts).toBeCloseTo(1.01, 2);
    expect(q.fracao).toBeCloseTo(0.0116, 4);
  });

  it('"plano corrigido", os mesmos cabos mais a emenda de 1,5 m: 1,08 V e 1,23%', () => {
    const q = dosPlacas(cenarioPlanoCorrigido());
    // Corrente de trabalho imp = 13,35 A em c1, c2 e c12, todos de cabo-solar-6:
    // 13,35 A × 0,019 × (12 + 12 + 1,5) m / 6 mm² = 1,078 V; sobre 2 × 43,83 = 87,66 V dá 1,230%.
    // Tolerância da especificação: 0,5% do valor esperado.
    expect(Math.abs(q.volts - 1.08)).toBeLessThanOrEqual(1.08 * 0.005);
    expect(Math.abs(q.fracao - 0.0123)).toBeLessThanOrEqual(0.0123 * 0.005);
    expect(q.cabos).toEqual(['c1', 'c2', 'c12']);
  });

  it('3 em paralelo em um só par de cabo-solar-6, 12 m + 12 m', () => {
    const q = dosPlacas(tresEmendadas('cabo-solar-6'));
    expect(q.volts).toBeCloseTo(3.04, 2);
    expect(q.fracao).toBeCloseTo(0.0694, 4);
  });

  it('o mesmo com cabo-solar-10', () => {
    const q = dosPlacas(tresEmendadas('cabo-solar-10'));
    expect(q.volts).toBeCloseTo(1.83, 2);
    expect(q.fracao).toBeCloseTo(0.0417, 4);
  });

  it('3 em paralelo, cada uma com o próprio par: queda de uma placa', () => {
    const q = dosPlacas(tresComPares('cabo-solar-6'));
    expect(q.volts).toBeCloseTo(1.01, 2);
  });

  it('bateria, cabo-bat-35, 1 m + 1 m', () => {
    const q = quedas(cenarioPlanoCorrigido()).find((x) => x.circuito === 'bateria')!;
    expect(q.volts).toBeCloseTo(0.14, 2);
    expect(q.fracao).toBeCloseTo(0.0054, 4);
    expect(q.limite).toBe(0.02);
    expect(q.cabos).toEqual(['c3', 'c4']);
  });

  it('bateria no "plano no papel" (cabo de 25 mm²) cai mais', () => {
    const q = quedas(cenarioPlanoNoPapel()).find((x) => x.circuito === 'bateria')!;
    expect(q.volts).toBeCloseTo((127.4 * 0.019 * 2) / 25, 3);
  });

  it('geladeira no comprimento do cenário (12 m): resistência em dobro', () => {
    const q = quedas(cenarioPlanoNoPapel()).find((x) => x.alvo === 'ap-geladeira')!;
    expect(q.volts).toBeCloseTo(((150 / 127) * 0.019 * 12 * 2) / 2.5, 4);
  });

  it('geladeira, cabo-ca-2p5, 15 m', () => {
    // No cenário a geladeira está a 12 m (c9); a tabela usa 15 m, então o comprimento é trocado aqui.
    const p = cenarioPlanoNoPapel();
    p.cabos.find((c) => c.uid === 'c9')!.comprimento = 15;
    const q = quedas(p).find((x) => x.alvo === 'ap-geladeira')!;
    expect(q.circuito).toBe('saida');
    expect(q.volts).toBeCloseTo(0.27, 2);
    expect(q.fracao).toBeCloseTo(0.0021, 4);
    expect(q.limite).toBe(0.04);
    expect(q.cabos).toEqual(['c9']);
  });

  it('há uma queda para cada aparelho, uma de placas e uma de bateria', () => {
    const q = quedas(cenarioPlanoNoPapel());
    expect(q.filter((x) => x.circuito === 'saida')).toHaveLength(6);
    expect(q.filter((x) => x.circuito === 'placas')).toHaveLength(1);
    expect(q.filter((x) => x.circuito === 'bateria')).toHaveLength(1);
  });
});
