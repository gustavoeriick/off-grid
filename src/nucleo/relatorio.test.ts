import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { relatorioDoCenario } from './relatorio';

describe('relatorioDoCenario', () => {
  it('"plano no papel": as seis regras, a autonomia e o total do orçamento', () => {
    const texto = relatorioDoCenario(cenarioPlanoNoPapel(), CATALOGO);
    for (const regra of [
      'placas-abaixo-da-tensao', 'protecao-maior-que-o-cabo', 'autonomia-curta',
      'carga-acima-da-bateria', 'sem-dps-nas-placas', 'sem-disjuntor-na-saida', 'sem-quadro',
    ]) {
      expect(texto, regra).toContain(`${regra}:`);
    }
    expect(texto).toContain('Sugestões do consultor (7):');
    expect(texto).toContain('Autonomia com o que está ligado: 4,1 horas');
    expect(texto).toContain('Total: R$ 8.668,19');
  });

  it('"plano corrigido": três regras, geração nas duas datas e o total do orçamento', () => {
    const texto = relatorioDoCenario(cenarioPlanoCorrigido(), CATALOGO);
    expect(texto).toContain('Sugestões do consultor (3):');
    expect(texto).toContain('21/06/2026: geração 3,9');
    expect(texto).toContain('21/12/2026: geração 5,');
    expect(texto).toContain('Total: R$ 9.797,62');
  });
});
