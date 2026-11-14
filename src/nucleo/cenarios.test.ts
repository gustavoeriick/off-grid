import { describe, expect, it } from 'vitest';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';

describe('cenarioPlanoNoPapel', () => {
  const projeto = cenarioPlanoNoPapel();

  it('tem uma placa, o inversor, uma bateria, a tomada e seis aparelhos', () => {
    expect(projeto.dispositivos.map((d) => d.uid)).toEqual([
      'placa1', 'inversor', 'bateria1', 'rede',
      'ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv',
    ]);
  });

  it('tem os onze cabos da especificação', () => {
    expect(projeto.cabos.map((c) => c.uid)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
    expect(projeto.cabos.find((c) => c.uid === 'c3')).toMatchObject({
      de: { disp: 'bateria1', terminal: 'pos' },
      para: { disp: 'inversor', terminal: 'batPos' },
      caboId: 'cabo-bat-25',
      comprimento: 1,
      protecoes: ['prot-fusivel-anl-150'],
    });
    expect(projeto.cabos.find((c) => c.uid === 'c9')).toMatchObject({
      de: { disp: 'inversor', terminal: 'caSaida' },
      para: { disp: 'ap-geladeira', terminal: 'plug' },
      comprimento: 12,
    });
  });

  it('soma 77 metros de circuito de corrente alternada', () => {
    const metros = projeto.cabos.filter((c) => c.caboId === 'cabo-ca-2p5').reduce((soma, c) => soma + c.comprimento, 0);
    expect(metros).toBe(77);
  });

  it('devolve um projeto novo a cada chamada', () => {
    const outro = cenarioPlanoNoPapel();
    outro.cabos.pop();
    outro.casa.largura = 99;
    expect(cenarioPlanoNoPapel().cabos).toHaveLength(11);
    expect(cenarioPlanoNoPapel().casa.largura).toBe(8);
  });
});

describe('cenarioPlanoCorrigido', () => {
  const projeto = cenarioPlanoCorrigido();
  const cabo = (uid: string) => projeto.cabos.find((c) => c.uid === uid);

  it('põe a segunda placa em série', () => {
    expect(projeto.dispositivos.map((d) => d.uid).slice(0, 2)).toEqual(['placa1', 'placa2']);
    expect(cabo('c12')).toMatchObject({ de: { disp: 'placa1', terminal: 'neg' }, para: { disp: 'placa2', terminal: 'pos' }, comprimento: 1.5 });
    expect(cabo('c2')).toMatchObject({ de: { disp: 'placa2', terminal: 'neg' }, para: { disp: 'inversor', terminal: 'pvNeg' } });
  });

  it('troca o cabo da bateria e acrescenta as proteções', () => {
    expect(cabo('c3')?.caboId).toBe('cabo-bat-35');
    expect(cabo('c4')?.caboId).toBe('cabo-bat-35');
    expect(cabo('c1')?.protecoes).toEqual(['prot-disjuntor-cc-32', 'prot-dps-cc-600']);
    for (const uid of ['c6', 'c7', 'c8', 'c9', 'c10', 'c11']) expect(cabo(uid)?.protecoes).toEqual(['prot-disjuntor-ca-16']);
    expect(cabo('c5')?.protecoes).toEqual([]);
  });
});
