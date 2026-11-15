import { describe, expect, it } from 'vitest';
import { blocosDoCaminho, ZOOM_DO_RELEVO } from './blocos';
import { criarRelevo } from './relevo';

const PONTO = { lat: -10, lon: -50 };
const OUTRO = { lat: -10, lon: -40 };

/** Imagem RGBA 256×256 de uma altitude única: R=128 e G=valor dá `valor` metros. */
function imagem(altitude: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    rgba[i * 4] = 128;
    rgba[i * 4 + 1] = altitude;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function fabrica(opcoes: { falhas?: number } = {}) {
  const pedidos: string[] = [];
  let ativos = 0;
  let maximo = 0;
  let falhasRestantes = opcoes.falhas ?? 0;
  const buscar = async (url: string): Promise<Blob> => {
    pedidos.push(url);
    ativos++;
    maximo = Math.max(maximo, ativos);
    try {
      await new Promise((r) => setTimeout(r, 2));
      if (falhasRestantes > 0) {
        falhasRestantes--;
        throw new Error('resposta 404');
      }
      return new Blob(['x']);
    } finally {
      ativos--;
    }
  };
  const decodificar = async (): Promise<Uint8ClampedArray> => imagem(42);
  return { buscar, decodificar, pedidos, maximoSimultaneo: () => maximo };
}

describe('criarRelevo', () => {
  it('carrega o bloco do ponto e os oito vizinhos e responde a altitude', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await relevo.carregar([PONTO]);
    expect(f.pedidos).toHaveLength(9);
    expect(f.pedidos.every((u) => u.startsWith('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/'))).toBe(true);
    expect(relevo.altitudeEm(PONTO)).toBeCloseTo(42, 6);
  });

  it('nunca envia coordenadas na requisição', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await relevo.carregar([PONTO]);
    for (const url of f.pedidos) {
      expect(url).toMatch(/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/11\/\d+\/\d+\.png$/);
    }
  });

  it('carrega só o que falta', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await relevo.carregar([PONTO]);
    await relevo.carregar([PONTO]);
    expect(f.pedidos).toHaveLength(9);
    await relevo.carregar([OUTRO]);
    expect(f.pedidos).toHaveLength(18);
  });

  it('não baixa duas vezes o mesmo bloco pedido ao mesmo tempo', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await Promise.all([relevo.carregar([PONTO]), relevo.carregar([PONTO]), relevo.carregar([PONTO])]);
    expect(f.pedidos).toHaveLength(9);
    expect(new Set(f.pedidos).size).toBe(9);
  });

  it('limita a 6 downloads simultâneos', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    expect(blocosDoCaminho([PONTO, OUTRO], ZOOM_DO_RELEVO).length).toBeGreaterThan(6);
    await relevo.carregar([PONTO, OUTRO]);
    expect(f.pedidos).toHaveLength(18);
    expect(f.maximoSimultaneo()).toBe(6);
  });

  it('erro de rede ou 404 tem mensagem em português dizendo a operação', async () => {
    const f = fabrica({ falhas: 1 });
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await expect(relevo.carregar([PONTO])).rejects.toThrow(/Não foi possível baixar o bloco de relevo 11\/\d+\/\d+: resposta 404/);
  });

  it('erro de decodificação tem mensagem própria', async () => {
    const f = fabrica();
    const relevo = criarRelevo({
      buscar: f.buscar,
      decodificar: async () => {
        throw new Error('imagem quebrada');
      },
    });
    await expect(relevo.carregar([PONTO])).rejects.toThrow(/Não foi possível decodificar a imagem do bloco de relevo.*imagem quebrada/);
  });

  it('imagem de tamanho errado é erro', async () => {
    const f = fabrica();
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: async () => new Uint8ClampedArray(16) });
    await expect(relevo.carregar([PONTO])).rejects.toThrow(/tamanho inesperado/);
  });

  it('bloco com erro não fica guardado: nova tentativa baixa de novo', async () => {
    const f = fabrica({ falhas: 1 });
    const relevo = criarRelevo({ buscar: f.buscar, decodificar: f.decodificar });
    await expect(relevo.carregar([PONTO])).rejects.toThrow();
    expect(() => relevo.altitudeEm(PONTO)).toThrow(/Relevo não carregado|bloco/);
    await relevo.carregar([PONTO]);
    expect(relevo.altitudeEm(PONTO)).toBeCloseTo(42, 6);
    // 9 na primeira rodada (um falhou) + o que faltou na segunda (pelo menos o que falhou).
    expect(f.pedidos.length).toBeGreaterThanOrEqual(10);
  });

  it('altitudeEm sem carregar dá erro claro', () => {
    const relevo = criarRelevo({ buscar: fabrica().buscar, decodificar: fabrica().decodificar });
    expect(() => relevo.altitudeEm(PONTO)).toThrow(/Relevo não carregado/);
  });

  it('tem texto de atribuição', () => {
    expect(criarRelevo().atribuicao).toMatch(/Mapzen/);
  });
});
