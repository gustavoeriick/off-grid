import { describe, expect, it } from 'vitest';
import type { CodigoDeConsequencia } from '../nucleo/operacao';
import { CONSERTO_DE_GRACA, SE_LIGAR_DE_NOVO, TEXTO_GERAL_DE_FUSIVEL_QUEIMADO, TEXTOS_DE_OPERACAO, TEXTOS_POR_CODIGO, textoDoEvento } from './textosDeOperacao';

// Lista exaustiva: se o núcleo ganhar um código, o tipo obriga a acrescentá-lo aqui.
const CODIGOS: Record<CodigoDeConsequencia, true> = {
  'controlador-sem-bateria': true,
  'bateria-invertida': true,
  'curto-na-bateria': true,
  'arco-no-conector': true,
  'arco-no-disjuntor-ca': true,
  sobrecarga: true,
  desarme: true,
  'fusivel-queimou': true,
};

describe('textos de operação', () => {
  it('todo código de consequência tem texto, e todo texto é usado', () => {
    const usados = new Set<string>();
    for (const codigo of Object.keys(CODIGOS) as CodigoDeConsequencia[]) {
      const chaves = TEXTOS_POR_CODIGO[codigo];
      expect(chaves.length, codigo).toBeGreaterThan(0);
      for (const chave of chaves) {
        const t = TEXTOS_DE_OPERACAO[chave];
        expect(t, chave).toBeDefined();
        for (const campo of [t.titulo, t.oQueHouve, t.porQue, t.oQueFazer]) expect(campo.trim().length, chave).toBeGreaterThan(10);
        usados.add(chave);
      }
      expect(textoDoEvento(codigo)).toBeDefined();
    }
    expect([...usados].sort()).toEqual(Object.keys(TEXTOS_DE_OPERACAO).sort());
  });

  it('as duas versões de bateria invertida e de curto existem', () => {
    expect(textoDoEvento('bateria-invertida', { inversor: true }).titulo).toContain('inversor');
    expect(textoDoEvento('bateria-invertida', { inversor: false }).titulo).toContain('controlador');
    expect(textoDoEvento('curto-na-bateria', { comProtecao: true }).titulo).toContain('proteção');
    expect(textoDoEvento('curto-na-bateria', { comProtecao: false }).titulo).toContain('cabos');
  });

  it('nenhum texto traz número (corrente de curto, tempo ou outro valor inventado)', () => {
    const todos = [CONSERTO_DE_GRACA, SE_LIGAR_DE_NOVO, TEXTO_GERAL_DE_FUSIVEL_QUEIMADO];
    for (const t of Object.values(TEXTOS_DE_OPERACAO)) todos.push(t.titulo, t.oQueHouve, t.porQue, t.oQueFazer, t.simplificacao ?? '', t.antesDeConsertar ?? '');
    for (const texto of todos) expect(texto).not.toMatch(/\d/);
  });

  it('onde a especificação marca simplificação, o texto diz isso', () => {
    expect(TEXTOS_DE_OPERACAO['controlador-sem-bateria'].simplificacao).toMatch(/^Simplificação/);
    expect(TEXTOS_DE_OPERACAO.desarme.simplificacao).toMatch(/^Simplificação/);
    expect(TEXTOS_DE_OPERACAO['fusivel-queimou'].simplificacao).toMatch(/^Simplificação/);
  });

  it('os textos de peça estragada avisam o que corrigir antes, quando há ligação a corrigir', () => {
    for (const chave of ['controlador-sem-bateria', 'bateria-invertida-inversor', 'bateria-invertida-controlador', 'curto-na-bateria-com-protecao', 'curto-na-bateria-sem-protecao'] as const) {
      expect(TEXTOS_DE_OPERACAO[chave].antesDeConsertar, chave).toBeTruthy();
      expect(TEXTOS_DE_OPERACAO[chave].estraga, chave).toBe(true);
    }
  });
});
