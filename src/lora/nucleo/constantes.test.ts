import { describe, expect, it } from 'vitest';
import {
  FOLGA_COM_SOBRA_DB,
  FRACAO_DE_FRESNEL,
  MODO_PADRAO,
  MODOS,
  RAIO_EFETIVO_KM,
  REGIOES,
} from './constantes';
import { perto } from './apoio-de-teste';

describe('constantes', () => {
  it('raio efetivo é 4/3 do raio médio', () => {
    perto(RAIO_EFETIVO_KM, 8494.7, 0.1);
  });

  it('regiões com a frequência no meio da faixa', () => {
    for (const r of Object.values(REGIOES)) {
      expect(r.frequenciaMHz).toBe((r.faixaMHz[0] + r.faixaMHz[1]) / 2);
      expect(r.potenciaMaxDbm).toBe(30);
    }
    expect(REGIOES.ANZ.frequenciaMHz).toBe(921.5);
    expect(REGIOES.BR_902.frequenciaMHz).toBe(904.75);
  });

  it('nove modos com a sensibilidade igual a 22 menos o orçamento', () => {
    expect(MODOS).toHaveLength(9);
    for (const m of MODOS) expect(m.sensibilidadeDbm).toBe(22 - m.orcamentoDb);
    expect(new Set(MODOS.map((m) => m.id)).size).toBe(9);
  });

  it('valores da tabela', () => {
    const porId = (id: string) => MODOS.find((m) => m.id === id)!;
    expect(porId('short-turbo').sensibilidadeDbm).toBe(-118);
    expect(porId('short-slow').sensibilidadeDbm).toBe(-123.5);
    expect(porId('medium-slow').sensibilidadeDbm).toBe(-128.5);
    expect(porId('long-fast').sensibilidadeDbm).toBe(-131);
    expect(porId('long-moderate').sensibilidadeDbm).toBe(-134);
    expect(porId('long-moderate').bandaKHz).toBe(125);
  });

  it('padrões', () => {
    expect(MODO_PADRAO).toBe('long-fast');
    expect(MODOS.some((m) => m.id === MODO_PADRAO)).toBe(true);
    expect(FOLGA_COM_SOBRA_DB).toBe(10);
    expect(FRACAO_DE_FRESNEL).toBe(0.6);
  });
});
