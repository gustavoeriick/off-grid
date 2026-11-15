import { describe, expect, it } from 'vitest';
import type { ContaDoEnlace, Geometria } from '../nucleo/tipos';
import {
  comSinal, cortar, dbComSinal, dbmTexto, dbTexto, distanciaTexto, lerNumero, linhasDaConta, radiosNoMeio, resumoDaRota, resumoDoEnlace,
  TEXTO_SEM_LIGACAO, textoDaZona, textoDoVeredito, textoSemSugestaoQueFecha, trechoDaSugestaoTexto, vereditoEmDestaque,
} from './textos';

const M = '−';

describe('formatação', () => {
  it('dB com sinal e vírgula decimal', () => {
    expect(dbComSinal(3.45)).toBe('+3,5 dB');
    expect(dbComSinal(-12.04)).toBe(`${M}12,0 dB`);
    expect(dbComSinal(0)).toBe('0,0 dB');
    expect(dbComSinal(-0.01)).toBe('0,0 dB');
    expect(comSinal(10, 0)).toBe('+10');
  });
  it('dB e dBm sem sinal obrigatório', () => {
    expect(dbTexto(12)).toBe('12,0 dB');
    expect(dbmTexto(-95.34)).toBe(`${M}95,3 dBm`);
    expect(dbmTexto(22)).toBe('22,0 dBm');
  });
  it('distância', () => {
    expect(distanciaTexto(0.45)).toBe('450 m');
    expect(distanciaTexto(2.5)).toBe('2,50 km');
    expect(distanciaTexto(20.34)).toBe('20,3 km');
  });
  it('corta e lê números', () => {
    expect(cortar(150, 1, 100)).toBe(100);
    expect(cortar(-3, 0, 30)).toBe(0);
    expect(cortar(Number.NaN, 1, 100)).toBe(1);
    expect(lerNumero('12,5')).toBe(12.5);
    expect(lerNumero(' 7 ')).toBe(7);
    expect(lerNumero('-3.5')).toBe(-3.5);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('abc')).toBeNull();
  });
});

describe('veredito', () => {
  it('textos', () => {
    expect(textoDoVeredito('folga')).toBe('fecha com folga');
    expect(textoDoVeredito('limite')).toBe('fecha no limite');
    expect(textoDoVeredito('nao-fecha')).toBe('não fecha');
    expect(vereditoEmDestaque('nao-fecha')).toBe('Não fecha');
  });
  it('resumo do enlace', () => {
    expect(resumoDoEnlace(null).veredito).toBe('calculando…');
    expect(resumoDoEnlace({ estado: 'erro', mensagem: 'x' }).classe).toBe('erro');
    expect(resumoDoEnlace({ estado: 'pronto', veredito: 'limite', distanciaKm: 20.34, folgaDb: 3.2 })).toEqual({
      veredito: 'fecha no limite',
      detalhe: '20,3 km, folga +3,2 dB',
      classe: 'limite',
    });
  });
});

describe('conta', () => {
  const conta: ContaDoEnlace = {
    frequenciaMHz: 921.5,
    distanciaKm: 20,
    potenciaDbm: 22,
    ganhoTxDbi: 3,
    caboTxDb: 1,
    arLivreDb: 117.76,
    difracaoDb: 0,
    margemDoAmbienteDb: 5,
    ganhoRxDbi: 3,
    caboRxDb: 1,
    recebidoDbm: -96.76,
    sensibilidadeDbm: -131,
    folgaDb: 34.24,
  };
  it('cada linha com o sinal certo', () => {
    const l = linhasDaConta(conta);
    expect(l).toHaveLength(11);
    expect(l[0]!.valor).toBe('+22,0 dBm');
    expect(l[2]!.valor).toBe(`${M}1,0 dB`);
    expect(l[3]!.valor).toBe(`${M}117,8 dB`);
    expect(l[4]!.valor).toBe('0,0 dB');
    expect(l[8]!.valor).toBe(`${M}96,8 dBm`);
    expect(l[9]!.valor).toBe(`${M}131,0 dBm`);
    expect(l[10]!.valor).toBe('+34,2 dB');
  });
});

describe('zona de Fresnel', () => {
  const base = { distanciaKm: 10, antenaInicioM: 0, antenaFimM: 0 };
  it('livre', () => {
    expect(textoDaZona({ ...base, pontos: [], zonaLivre: true, piorPonto: null } as Geometria)).toContain('livre');
  });
  it('com o pior ponto', () => {
    const g = { ...base, pontos: [], zonaLivre: false, piorPonto: { dKm: 4.2, altM: 0, curvaM: 0, linhaM: 0, folgaM: 2, raioDeFresnelM: 10 } } as Geometria;
    const t = textoDaZona(g);
    expect(t).toContain('4,20 km');
    expect(t).toContain('não está livre');
    expect(t).toContain('a linha passa 2,0 m acima do terreno');
  });
  it('terreno acima da linha', () => {
    const g = { ...base, pontos: [], zonaLivre: false, piorPonto: { dKm: 4.2, altM: 0, curvaM: 0, linhaM: 0, folgaM: -3, raioDeFresnelM: 10 } } as Geometria;
    expect(textoDaZona(g)).toContain('o terreno passa 3,0 m acima da linha');
  });
});

describe('rotas e sugestão de repetidor', () => {
  const nomes: Record<string, string> = { a: 'Casa A', r: 'Repetidor 1', b: 'Casa B' };
  const nome = (id: string): string => nomes[id] ?? '?';

  it('rádios no meio, em palavras', () => {
    expect(radiosNoMeio(0)).toContain('sem rádio no meio');
    expect(radiosNoMeio(1)).toBe('1 rádio no meio');
    expect(radiosNoMeio(3)).toBe('3 rádios no meio');
  });
  it('enquanto os enlaces calculam', () => {
    expect(resumoDaRota(null, nome, 3)).toMatchObject({ veredito: 'calculando…', classe: 'calculando', caminho: '' });
  });
  it('sem ligação desenhada', () => {
    const r = resumoDaRota({ rota: null, motivo: 'sem-ligacao' }, nome, 3);
    expect(r.veredito).toBe('sem ligação');
    expect(r.detalhe).toBe(TEXTO_SEM_LIGACAO);
  });
  it('passa do limite de saltos: diz quantos rádios seriam precisos, o limite e onde mudar', () => {
    const r = resumoDaRota({ rota: null, motivo: 'limite', pontosNoMeio: 2 }, nome, 1);
    expect(r.veredito).toBe('passa do limite de saltos');
    expect(r.detalhe).toContain('precisa de 2 rádios no meio');
    expect(r.detalhe).toContain('o limite de saltos deste projeto é 1');
    expect(r.detalhe).toContain('Configuração da rede');
  });
  it('rota pelo repetidor: caminho por nome, trecho mais fraco e rádios no meio', () => {
    const r = resumoDaRota({ rota: { pontos: ['a', 'r', 'b'], maisFraco: { de: 'r', para: 'b' }, folgaDb: 12.34, veredito: 'limite', pontosNoMeio: 1 } }, nome, 3);
    expect(r.veredito).toBe('fecha no limite');
    expect(r.classe).toBe('limite');
    expect(r.caminho).toBe('Casa A → Repetidor 1 → Casa B');
    expect(r.detalhe).toBe('Passa por 1 rádio no meio. Trecho mais fraco: Repetidor 1 ↔ Casa B, folga +12,3 dB.');
  });
  it('rota que não fecha: diz o trecho que derruba', () => {
    const r = resumoDaRota({ rota: { pontos: ['a', 'r', 'b'], maisFraco: { de: 'a', para: 'r' }, folgaDb: -4.5, veredito: 'nao-fecha', pontosNoMeio: 1 } }, nome, 3);
    expect(r.veredito).toBe('não fecha');
    expect(r.detalhe).toContain(`O trecho Casa A ↔ Repetidor 1 derruba a rota: folga ${M}4,5 dB.`);
  });
  it('ligação direta', () => {
    const direta = { pontos: ['a', 'b'], maisFraco: { de: 'a', para: 'b' }, pontosNoMeio: 0 };
    expect(resumoDaRota({ rota: { ...direta, folgaDb: 20, veredito: 'folga' } }, nome, 3).detalhe).toBe('Ligação direta, sem rádio no meio. Folga +20,0 dB.');
    expect(resumoDaRota({ rota: { ...direta, folgaDb: -13, veredito: 'nao-fecha' } }, nome, 3).detalhe).toBe(`A ligação direta não fecha: folga ${M}13,0 dB.`);
  });
  it('trecho de uma sugestão', () => {
    expect(trechoDaSugestaoTexto('Casa A', { distanciaKm: 17.35, folgaDb: 35.41 })).toBe('Casa A ↔ repetidor: 17,4 km, folga +35,4 dB');
  });
  it('nenhuma sugestão fecha: aponta a ponta que ficou sem ligação', () => {
    const fecha = { veredito: 'limite' as const };
    const naoFecha = { veredito: 'nao-fecha' as const };
    expect(textoSemSugestaoQueFecha(undefined, 'Casa A', 'Casa B')).toBeNull();
    expect(textoSemSugestaoQueFecha({ trechoA: fecha, trechoB: fecha }, 'Casa A', 'Casa B')).toBeNull();
    const t = textoSemSugestaoQueFecha({ trechoA: fecha, trechoB: naoFecha }, 'Casa A', 'Casa B')!;
    expect(t).toContain('Um repetidor só não resolve');
    expect(t).toContain('repetir a busca entre ele e Casa B');
    expect(textoSemSugestaoQueFecha({ trechoA: naoFecha, trechoB: fecha }, 'Casa A', 'Casa B')).toContain('entre ele e Casa A');
    expect(textoSemSugestaoQueFecha({ trechoA: naoFecha, trechoB: naoFecha }, 'Casa A', 'Casa B')).toContain('Um repetidor só não resolve');
  });
});
