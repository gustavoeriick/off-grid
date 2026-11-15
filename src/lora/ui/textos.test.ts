import { describe, expect, it } from 'vitest';
import type { ContaDoEnlace, Geometria } from '../nucleo/tipos';
import { comSinal, cortar, dbComSinal, dbmTexto, dbTexto, distanciaTexto, lerNumero, linhasDaConta, resumoDoEnlace, textoDaZona, textoDoVeredito, vereditoEmDestaque } from './textos';

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
