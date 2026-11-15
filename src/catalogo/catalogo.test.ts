// Teste de consistência do catálogo. Especificação: docs/especificacao/catalogo.md, seção 2.

import { describe, expect, it } from 'vitest';
import { ANUNCIOS, COLETA } from './anuncios';
import { CATALOGO, itemPorId } from './index';
import type { Aparelho, Bateria, Controlador, Inversor, Item, Placa, TipoCabo } from './tipos';
import { PESQUISA } from './pesquisa';

const itens: Item[] = [...CATALOGO.values()];

function codigoDoLink(url: string): string {
  const m = url.match(/\/(?:p|up)\/(MLBU?\d+)/) ?? url.match(/\/MLB-(\d+)-/);
  if (!m) throw new Error(`Link sem código: ${url}`);
  return m[1].startsWith('MLB') ? m[1] : `MLB${m[1]}`;
}

const registroPorCodigo = new Map(PESQUISA.registros.map((r) => [r.codigo, r]));

/** Cabos vendidos em rolo ou por circuito: [metros do anúncio, condutores]. Preço do item = anúncio / metros × condutores. */
const CABOS_CONVERTIDOS: Record<string, [metros: number, condutores: number]> = {
  'cabo-solar-6': [20, 1],
  'cabo-bat-25-alucobre': [10, 1],
  'cabo-ca-2p5-alucobre': [100, 3],
  'cabo-ca-2p5': [100, 3],
  'cabo-ca-4': [100, 3],
};

const centavos = (reais: number) => Math.round(reais * 100);

describe('catálogo: regras gerais', () => {
  it('tem a quantidade de itens da especificação', () => {
    expect(itens).toHaveLength(88);
  });

  it('não repete id', () => {
    const ids = itens.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem preço maior ou igual a zero, e precoMax não menor que o preço', () => {
    for (const i of itens) {
      expect(i.preco, i.id).toBeGreaterThanOrEqual(0);
      if (i.precoMax !== undefined) expect(i.precoMax, i.id).toBeGreaterThanOrEqual(i.preco);
    }
  });

  it('tem nome e detalhe em todos os itens', () => {
    for (const i of itens) {
      expect(i.nome.length, i.id).toBeGreaterThan(0);
      expect(i.detalhe.length, i.id).toBeGreaterThan(0);
    }
  });

  it('itemPorId devolve o item do catálogo', () => {
    expect(itemPorId('placa-renepv-585')?.id).toBe('placa-renepv-585');
    expect(itemPorId('nao-existe')).toBeUndefined();
  });
});

describe('catálogo: ligação com a pesquisa', () => {
  it('todo item com url tem coletadoEm, e o código do link existe na pesquisa com o mesmo preço', () => {
    for (const i of itens.filter((x) => x.url)) {
      expect(i.coletadoEm, i.id).toBe(PESQUISA.coletadoEm);
      const registro = registroPorCodigo.get(codigoDoLink(i.url!));
      expect(registro, `${i.id}: código do link fora da pesquisa`).toBeDefined();
      expect(registro!.link, i.id).toBe(i.url);
      const conversao = CABOS_CONVERTIDOS[i.id];
      if (conversao) {
        const [metros, condutores] = conversao;
        expect(centavos(i.preco), i.id).toBe(Math.round((centavos(registro!.preco!) * condutores) / metros));
      } else {
        expect(i.preco, i.id).toBe(registro!.preco);
      }
    }
  });

  it('anuncios.ts bate com o JSON da pesquisa', () => {
    expect(COLETA).toBe(PESQUISA.coletadoEm);
    for (const [codigo, a] of Object.entries(ANUNCIOS)) {
      const registro = registroPorCodigo.get(codigo);
      expect(registro, codigo).toBeDefined();
      expect(a.preco, codigo).toBe(registro!.preco);
      expect(a.url, codigo).toBe(registro!.link);
    }
  });

  it('item sem url tem preço estimado em tipico, exceto o PowMr, a tomada da rede e os aparelhos', () => {
    for (const i of itens.filter((x) => !x.url)) {
      if (i.id === 'inv-powmr-ps3k-110') {
        expect(i.coletadoEm, i.id).toBe(PESQUISA.coletadoEm);
        expect(i.tipico ?? [], i.id).not.toContain('preco');
      } else if (i.categoria === 'aparelho' || i.categoria === 'rede') {
        expect(i.preco, i.id).toBe(0);
        expect(i.tipico ?? [], i.id).not.toContain('preco');
      } else {
        expect(i.tipico ?? [], i.id).toContain('preco');
      }
    }
  });

  it('item com url não tem preço marcado como típico', () => {
    for (const i of itens.filter((x) => x.url)) expect(i.tipico ?? [], i.id).not.toContain('preco');
  });

  it('só alucobre leva naoRecomendado entre os cabos, e todo alucobre leva', () => {
    for (const c of itens.filter((x): x is TipoCabo => x.categoria === 'cabo')) {
      expect(c.naoRecomendado !== undefined, c.id).toBe(!c.cobre);
    }
  });
});

describe('catálogo: características físicas', () => {
  it('placas: voc > vmp > 0, isc >= imp > 0 e vmp × imp entre 95% e 105% de wp', () => {
    const placas = itens.filter((i): i is Placa => i.categoria === 'placa');
    expect(placas).toHaveLength(8);
    for (const p of placas) {
      expect(p.voc, p.id).toBeGreaterThan(p.vmp);
      expect(p.vmp, p.id).toBeGreaterThan(0);
      expect(p.isc, p.id).toBeGreaterThanOrEqual(p.imp);
      expect(p.imp, p.id).toBeGreaterThan(0);
      expect(p.vmp * p.imp, p.id).toBeGreaterThanOrEqual(0.95 * p.wp);
      expect(p.vmp * p.imp, p.id).toBeLessThanOrEqual(1.05 * p.wp);
      expect(p.largura, p.id).toBeGreaterThan(0);
      expect(p.altura, p.id).toBeGreaterThan(0);
    }
  });

  it('baterias: tensão 12, 24 ou 48; ah, descarga e carga maiores que zero', () => {
    const baterias = itens.filter((i): i is Bateria => i.categoria === 'bateria');
    expect(baterias).toHaveLength(13);
    for (const b of baterias) {
      expect([12, 24, 48], b.id).toContain(b.tensao);
      expect(b.ah, b.id).toBeGreaterThan(0);
      expect(b.descargaMaxA, b.id).toBeGreaterThan(0);
      expect(b.cargaMaxA, b.id).toBeGreaterThan(0);
      expect(b.ciclos, b.id).toBeGreaterThan(0);
    }
  });

  it('entradas solares: vocMax >= vMax > vMin >= 0', () => {
    const comSolar = itens.filter((i): i is Inversor | Controlador => i.categoria === 'inversor' || i.categoria === 'controlador');
    let conferidas = 0;
    for (const i of comSolar) {
      if (!i.solar) continue;
      conferidas++;
      expect(i.solar.vocMax, i.id).toBeGreaterThanOrEqual(i.solar.vMax);
      expect(i.solar.vMax, i.id).toBeGreaterThan(i.solar.vMin);
      expect(i.solar.vMin, i.id).toBeGreaterThanOrEqual(0);
      expect(i.solar.correnteCargaA, i.id).toBeGreaterThan(0);
      expect(i.solar.potenciaMaxW, i.id).toBeGreaterThan(0);
    }
    expect(conferidas).toBe(14);
  });

  it('inversores: potências, rendimento e tensões coerentes', () => {
    for (const v of itens.filter((i): i is Inversor => i.categoria === 'inversor')) {
      expect(v.potenciaW, v.id).toBeGreaterThan(0);
      expect(v.picoW, v.id).toBeGreaterThanOrEqual(v.potenciaW);
      expect(v.rendimento, v.id).toBeGreaterThan(0);
      expect(v.rendimento, v.id).toBeLessThan(1);
      expect(v.consumoVazioW, v.id).toBeGreaterThan(0);
      expect(v.tipico, v.id).toContain('rendimento');
    }
  });

  it('cabos: ampacidade e seção maiores que zero', () => {
    const cabos = itens.filter((i): i is TipoCabo => i.categoria === 'cabo');
    expect(cabos).toHaveLength(13);
    for (const c of cabos) {
      expect(c.ampacidade, c.id).toBeGreaterThan(0);
      expect(c.secao, c.id).toBeGreaterThan(0);
    }
  });

  it('aparelhos: preço zero, horário de uso válido e média não maior que a potência', () => {
    const aparelhos = itens.filter((i): i is Aparelho => i.categoria === 'aparelho');
    expect(aparelhos).toHaveLength(17);
    for (const a of aparelhos) {
      expect(a.preco, a.id).toBe(0);
      expect(a.usoPadrao.inicio, a.id).toBeGreaterThanOrEqual(0);
      expect(a.usoPadrao.inicio, a.id).toBeLessThanOrEqual(24);
      expect(a.usoPadrao.fim, a.id).toBeGreaterThanOrEqual(0);
      expect(a.usoPadrao.fim, a.id).toBeLessThanOrEqual(24);
      expect(a.mediaW, a.id).toBeLessThanOrEqual(a.potenciaW);
      expect(a.picoW, a.id).toBeGreaterThanOrEqual(a.potenciaW);
    }
  });

  it('os seis aparelhos do plano somam 465 W de média', () => {
    const ids = ['ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv'];
    const soma = ids.reduce((s, id) => s + (itemPorId(id) as Aparelho).mediaW, 0);
    expect(soma).toBe(465);
  });
});

describe('catálogo: itens usados pelos cenários e pelo consultor', () => {
  const NECESSARIOS = [
    'placa-renepv-585', 'inv-anenji-3kw-24v-127', 'bat-alfx-24v-100', 'rede-tomada',
    'cabo-solar-6', 'cabo-bat-25', 'cabo-bat-35', 'cabo-ca-2p5',
    'prot-fusivel-anl-150', 'prot-disjuntor-cc-32', 'prot-dps-cc-600', 'prot-disjuntor-ca-16',
    'acc-ganchos-8', 'acc-trilhos', 'acc-mc4-10', 'acc-haste',
    'ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv',
  ];

  it.each(NECESSARIOS)('existe %s', (id) => {
    expect(CATALOGO.has(id), id).toBe(true);
  });

  it('o item de cada categoria tem a categoria certa', () => {
    expect(itemPorId('placa-renepv-585')?.categoria).toBe('placa');
    expect(itemPorId('inv-anenji-3kw-24v-127')?.categoria).toBe('inversor');
    expect(itemPorId('bat-alfx-24v-100')?.categoria).toBe('bateria');
    expect(itemPorId('rede-tomada')?.categoria).toBe('rede');
    expect(itemPorId('prot-dps-cc-600')?.categoria).toBe('protecao');
  });
});
