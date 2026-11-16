// Partes puras da busca de endereço: o pedido e a leitura da resposta. Só lugares inventados, perto de lat -10, lon -50.
import { describe, expect, it } from 'vitest';
import { ENDERECO_DO_SERVICO, ErroDeEndereco, lerRespostaDeEnderecos, textoBasta, textoNormalizado, urlDaBusca } from './enderecos';

const item = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  display_name: 'Rua de Teste, Cidade Fictícia, Estado Fictício, Brasil',
  lat: '-10.0200',
  lon: '-50.0300',
  boundingbox: ['-10.0300', '-10.0100', '-50.0400', '-50.0200'],
  ...extra,
});

describe('urlDaBusca', () => {
  it('leva exatamente q, format, limit, accept-language e countrycodes no Brasil', () => {
    const url = new URL(urlDaBusca('  Rua de Teste, Cidade Fictícia  ', 'brasil'));
    expect(`${url.origin}${url.pathname}`).toBe(ENDERECO_DO_SERVICO);
    expect([...url.searchParams.keys()]).toEqual(['q', 'format', 'limit', 'accept-language', 'countrycodes']);
    expect(url.searchParams.get('q')).toBe('Rua de Teste, Cidade Fictícia');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('accept-language')).toBe('pt-BR');
    expect(url.searchParams.get('countrycodes')).toBe('br');
  });

  it('no mundo todo não leva countrycodes', () => {
    const url = new URL(urlDaBusca('Rua de Teste', 'mundo'));
    expect([...url.searchParams.keys()]).toEqual(['q', 'format', 'limit', 'accept-language']);
  });

  it('o texto vai codificado e não abre parâmetro novo', () => {
    const url = new URL(urlDaBusca('Rua A&countrycodes=xx#y', 'brasil'));
    expect(url.searchParams.get('q')).toBe('Rua A&countrycodes=xx#y');
    expect(url.searchParams.getAll('countrycodes')).toEqual(['br']);
    expect(url.hash).toBe('');
  });
});

describe('texto da busca', () => {
  it('menos de 3 caracteres (sem as pontas) não basta', () => {
    expect(textoBasta('  ab ')).toBe(false);
    expect(textoBasta('abc')).toBe(true);
  });

  it('normaliza espaços e maiúsculas para o cache', () => {
    expect(textoNormalizado('  Rua   DE Teste ')).toBe('rua de teste');
  });
});

describe('lerRespostaDeEnderecos', () => {
  it('lê nome, coordenadas e caixa (o serviço manda números como texto)', () => {
    const [r] = lerRespostaDeEnderecos([item()]);
    expect(r).toEqual({
      nome: 'Rua de Teste, Cidade Fictícia, Estado Fictício, Brasil',
      lat: -10.02,
      lon: -50.03,
      caixa: { sul: -10.03, norte: -10.01, oeste: -50.04, leste: -50.02 },
    });
  });

  it('aceita números de verdade', () => {
    expect(lerRespostaDeEnderecos([item({ lat: -10.5, lon: -50.5 })])[0]).toMatchObject({ lat: -10.5, lon: -50.5 });
  });

  it('resposta que não é lista conta como falha', () => {
    for (const ruim of [{}, null, 'texto', 42, { error: 'x' }]) {
      expect(() => lerRespostaDeEnderecos(ruim)).toThrow(ErroDeEndereco);
    }
    try {
      lerRespostaDeEnderecos({});
    } catch (e) {
      expect((e as ErroDeEndereco).tipo).toBe('falha');
    }
  });

  it('lista vazia dá lista vazia', () => {
    expect(lerRespostaDeEnderecos([])).toEqual([]);
  });

  it('descarta item com latitude ou longitude que não é número ou fora dos limites', () => {
    const ruins = [
      item({ lat: 'abc' }),
      item({ lon: 'abc' }),
      item({ lat: '' }),
      item({ lat: null }),
      item({ lon: undefined }),
      item({ lat: '91' }),
      item({ lat: -90.1 }),
      item({ lon: '180.5' }),
      item({ lon: -181 }),
      item({ lat: Number.NaN }),
      item({ lon: Number.POSITIVE_INFINITY }),
    ];
    expect(lerRespostaDeEnderecos(ruins)).toEqual([]);
    expect(lerRespostaDeEnderecos([ruins[0], item({ display_name: 'Praça de Teste' }), ruins[5]]).map((r) => r.nome)).toEqual(['Praça de Teste']);
  });

  it('aceita os limites exatos', () => {
    const r = lerRespostaDeEnderecos([item({ lat: '90', lon: '-180' }), item({ lat: -90, lon: 180 })]);
    expect(r).toHaveLength(2);
  });

  it('descarta item sem nome em texto e item que não é objeto', () => {
    expect(lerRespostaDeEnderecos([item({ display_name: '' }), item({ display_name: '  ' }), item({ display_name: 5 }), null, 'x', 7, []])).toEqual([]);
  });

  it('guarda o nome como veio, sem interpretar HTML', () => {
    const [r] = lerRespostaDeEnderecos([item({ display_name: '<img src=x onerror=alert(1)> Rua de Teste' })]);
    expect(r?.nome).toBe('<img src=x onerror=alert(1)> Rua de Teste');
  });

  it('caixa ruim vira nula e o item continua valendo', () => {
    for (const caixa of [undefined, null, 'x', [], ['1', '2', '3'], ['a', 'b', 'c', 'd'], ['-10', '-11', '-50', '-49'], ['-10', '-9', '-49', '-50'], ['-95', '-9', '-50', '-49'], ['-10', '-9', '-50', '181']]) {
      const [r] = lerRespostaDeEnderecos([item({ boundingbox: caixa })]);
      expect(r?.caixa).toBeNull();
      expect(r?.lat).toBe(-10.02);
    }
  });

  it('no máximo 5 itens', () => {
    const muitos = Array.from({ length: 9 }, (_, i) => item({ display_name: `Lugar de Teste ${i + 1}` }));
    const r = lerRespostaDeEnderecos(muitos);
    expect(r).toHaveLength(5);
    expect(r[4]?.nome).toBe('Lugar de Teste 5');
  });

  it('os cinco são contados depois de descartar os ruins', () => {
    const lista = [item({ lat: 'x' }), ...Array.from({ length: 6 }, (_, i) => item({ display_name: `Lugar de Teste ${i + 1}` }))];
    expect(lerRespostaDeEnderecos(lista).map((r) => r.nome)).toEqual(['Lugar de Teste 1', 'Lugar de Teste 2', 'Lugar de Teste 3', 'Lugar de Teste 4', 'Lugar de Teste 5']);
  });
});
