import { describe, expect, it } from 'vitest';
import { CATALOGO, gruposDoCatalogo } from '../catalogo';
import { casaTexto, casarGrupo, normalizar, palavrasDaBusca } from './buscaCatalogo';

const grupos = gruposDoCatalogo(CATALOGO);
const sempre = () => true;

function buscar(consulta: string): number {
  const p = palavrasDaBusca(consulta);
  return grupos.filter((g) => casarGrupo(g, p, 'x', sempre, g.referencia) !== null).length;
}

describe('normalizar', () => {
  it('tira acento, maiúsculas e espaço repetido', () => {
    expect(normalizar('  Proteções   AVANÇADA ')).toBe('protecoes avancada');
  });
  it('usa vírgula decimal nos dois formatos', () => {
    expect(normalizar('2.5 mm')).toBe(normalizar('2,5 mm'));
  });
});

describe('casaTexto', () => {
  it('ignora acento e maiúsculas', () => {
    expect(casaTexto('Inversor Híbrido', palavrasDaBusca('HIBRIDO'))).toBe(true);
  });
  it('número colado ou separado da unidade casa igual', () => {
    expect(casaTexto('Placa 550 W', palavrasDaBusca('550w'))).toBe(true);
    expect(casaTexto('Placa 550W', palavrasDaBusca('550 w'))).toBe(true);
    expect(casaTexto('Bateria 100 Ah', palavrasDaBusca('100ah'))).toBe(true);
  });
  it('número não casa no meio de outro número', () => {
    expect(casaTexto('Placa 1550 W', palavrasDaBusca('550 W'))).toBe(false);
  });
  it('exige todas as palavras, em qualquer ordem', () => {
    expect(casaTexto('Bateria LiFePO4 100 Ah 24 V', palavrasDaBusca('24v bateria'))).toBe(true);
    expect(casaTexto('Bateria LiFePO4 100 Ah', palavrasDaBusca('bateria 550w'))).toBe(false);
  });
  it('consulta vazia não casa nada', () => {
    expect(casaTexto('qualquer', palavrasDaBusca('   '))).toBe(false);
  });
});

describe('casarGrupo com o catálogo real', () => {
  it('texto do tipo casa sem apontar para modelo', () => {
    const g = grupos.find((x) => x.categoria === 'bateria')!;
    const a = casarGrupo(g, palavrasDaBusca(g.nome), 'Baterias', sempre, g.referencia);
    expect(a).not.toBeNull();
    expect(a!.modelo).toBeNull();
  });
  it('rótulo da aba entra no texto', () => {
    const g = grupos.find((x) => x.categoria === 'bateria')!;
    expect(casarGrupo(g, palavrasDaBusca('baterias'), 'Baterias', sempre, g.referencia)).not.toBeNull();
    expect(casarGrupo(g, palavrasDaBusca('baterias'), 'Placas', sempre, g.referencia)).toBeNull();
  });
  it('modelo que casa só em um: o cartão aponta para ele', () => {
    const g = grupos.find((x) => x.itens.length > 1 && x.itens.some((i) => i.id !== x.referencia.id))!;
    const alvo = g.itens.find((i) => i.id !== g.referencia.id)!;
    // Palavra inventada que só o modelo alvo tem, via nome do modelo.
    const alvoComMarca = { ...alvo, nome: `${alvo.nome} zzmarcaxx` };
    const g2 = { ...g, itens: g.itens.map((i) => (i.id === alvo.id ? alvoComMarca : i)) };
    const a = casarGrupo(g2, palavrasDaBusca('ZZMarcaXX'), 'x', sempre, g.referencia);
    expect(a?.modelo?.id).toBe(alvo.id);
  });
  it('o filtro de linha vale: sem modelo na linha, não aparece', () => {
    const g = grupos[0];
    expect(casarGrupo(g, palavrasDaBusca(g.nome), 'x', () => false, g.referencia)).toBeNull();
  });
  it('sem resultado', () => {
    expect(buscar('zzzz inexistente 99999')).toBe(0);
  });
  it('acha tipos pela potência', () => {
    expect(buscar('550 W')).toBeGreaterThanOrEqual(0);
    expect(buscar('placa')).toBeGreaterThan(0);
    expect(buscar('PLACA')).toBe(buscar('placa'));
  });
});
