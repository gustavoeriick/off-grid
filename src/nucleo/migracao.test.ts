import { describe, expect, it } from 'vitest';
import { CASA_INICIAL, cenarioPlanoNoPapel } from './cenarios';
import { converterProjeto } from './migracao';

/** Um projeto no formato da versão 1. */
function projetoV1(sobre: Record<string, unknown> = {}): Record<string, unknown> {
  const p = structuredClone(cenarioPlanoNoPapel()) as unknown as Record<string, unknown>;
  const casa: Record<string, unknown> = { ...(p.casa as Record<string, unknown>) };
  delete casa.varandas;
  delete casa.paredesInternas;
  delete casa.comodos;
  p.versao = 1;
  p.casa = { ...casa, varanda: { lado: 'frente', profundidade: 3, inclinacaoPct: 30 }, ...sobre };
  for (const c of p.cabos as Record<string, unknown>[]) delete c.quadro;
  return p;
}

describe('converterProjeto', () => {
  it('versão 1 com varanda: lista de uma varanda, paredes e cômodos iniciais, cabos sem quadro', () => {
    const v1 = projetoV1();
    const copia = structuredClone(v1);
    const p = converterProjeto(v1);
    expect(p.versao).toBe(2);
    expect(p.casa.varandas).toEqual([{ lado: 'frente', profundidade: 3, inclinacaoPct: 30, largura: null, deslocamento: 0 }]);
    expect('varanda' in p.casa).toBe(false);
    expect(p.casa.paredesInternas).toEqual(CASA_INICIAL.paredesInternas);
    expect(p.casa.comodos).toEqual(CASA_INICIAL.comodos);
    expect(p.cabos.every((c) => c.quadro === null)).toBe(true);
    expect(p.casa.quartinho).toEqual(CASA_INICIAL.quartinho);
    expect(v1).toEqual(copia);
  });

  it('versão 1 sem varanda: lista vazia', () => {
    const p = converterProjeto(projetoV1({ varanda: null }));
    expect(p.casa.varandas).toEqual([]);
  });

  it('peças no telhado e no piso da varanda passam para a superfície do lado', () => {
    const v1 = projetoV1({ varanda: { lado: 'esquerda', profundidade: 2, inclinacaoPct: 25 } });
    const ds = v1.dispositivos as { superficie: string | null }[];
    ds[0].superficie = 'telhado-varanda';
    ds[1].superficie = 'piso-varanda';
    ds[2].superficie = 'telhado-frente';
    const p = converterProjeto(v1);
    expect(p.dispositivos[0].superficie).toBe('telhado-varanda-esquerda');
    expect(p.dispositivos[1].superficie).toBe('piso-varanda-esquerda');
    expect(p.dispositivos[2].superficie).toBe('telhado-frente');
    expect(p.casa.varandas[0].lado).toBe('esquerda');
  });

  it('medidas diferentes das iniciais: paredes e cômodos vazios', () => {
    const p = converterProjeto(projetoV1({ largura: 9 }));
    expect(p.casa.paredesInternas).toEqual([]);
    expect(p.casa.comodos).toEqual([]);
    expect(converterProjeto(projetoV1({ andares: 1 })).casa.comodos).toEqual([]);
  });

  it('versão 2 passa como está', () => {
    const v2 = cenarioPlanoNoPapel();
    expect(converterProjeto(structuredClone(v2))).toEqual(v2);
  });

  it('versão desconhecida ou dado inválido lança erro em português', () => {
    expect(() => converterProjeto({ ...projetoV1(), versao: 3 })).toThrow(/só abre as versões 1 e 2/);
    expect(() => converterProjeto({ nome: 'x' })).toThrow(/sem versão/);
    expect(() => converterProjeto(null)).toThrow(/não é um projeto/);
    expect(() => converterProjeto('texto')).toThrow(/não é um projeto/);
    expect(() => converterProjeto({ versao: 1 })).toThrow(/incompleto/);
  });
});
