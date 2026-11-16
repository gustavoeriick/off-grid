// Lugar dos visores ampliados na tela (operar.md, seção 7.2): sempre acima da peça, empilhando para cima; o visor
// arrastado fica onde foi solto e os outros desviam dele.

import { describe, expect, it } from 'vitest';
import { escolherLugares, FOLGA_DA_PECA_PX, MARGEM_DA_TELA_PX, type PedidoDeLugar, type Retangulo, sobreposicao } from './lugarDosVisores';

const TELA = { largura: 820, altura: 780 };
const ret = (x: number, y: number, largura: number, altura: number): Retangulo => ({ x, y, largura, altura });
const pedido = (id: string, peca: Retangulo, mais: Partial<PedidoDeLugar> = {}): PedidoDeLugar => ({ id, peca, largura: 180, altura: 100, ...mais });
const meioX = (r: Retangulo): number => r.x + r.largura / 2;
const dentroDaTela = (r: Retangulo): boolean =>
  r.x >= MARGEM_DA_TELA_PX && r.y >= MARGEM_DA_TELA_PX && r.x + r.largura <= TELA.largura - MARGEM_DA_TELA_PX && r.y + r.altura <= TELA.altura - MARGEM_DA_TELA_PX;

describe('lugar dos visores ampliados', () => {
  it('sozinho, o visor fica acima da peça, centrado e com folga', () => {
    const peca = ret(400, 500, 80, 60);
    const lugar = escolherLugares([pedido('a', peca)], [], TELA).get('a')!;
    expect(lugar.nivel).toBe(0);
    expect(lugar.arrastado).toBe(false);
    expect(meioX(lugar.ret)).toBeCloseTo(440);
    expect(lugar.ret.y + lugar.ret.altura).toBeCloseTo(500 - FOLGA_DA_PECA_PX);
    expect(sobreposicao(lugar.ret, peca)).toBe(0);
  });

  it('peças vizinhas: o visor de trás na ordem sobe, sem ir para os lados', () => {
    const pecas = [ret(380, 560, 90, 70), ret(470, 565, 70, 50), ret(430, 380, 60, 70), ret(300, 540, 60, 120)];
    const pedidos = pecas.map((p, i) => pedido(`p${i}`, p));
    const lugares = escolherLugares(pedidos, [], TELA);
    const postos = pedidos.map((p) => lugares.get(p.id)!);
    expect(postos[0]!.nivel).toBe(0);
    expect(postos[1]!.nivel).toBeGreaterThan(0);
    postos.forEach((a, i) => {
      expect(dentroDaTela(a.ret), `p${i} na tela`).toBe(true);
      // Centrado sobre a peça dele, e acima dela.
      expect(meioX(a.ret), `p${i} centrado`).toBeCloseTo(meioX(pecas[i]!));
      expect(a.ret.y + a.ret.altura, `p${i} acima da peça`).toBeLessThanOrEqual(pecas[i]!.y - FOLGA_DA_PECA_PX + 1e-6);
      postos.forEach((b, j) => {
        if (j > i) expect(sobreposicao(a.ret, b.ret), `p${i} sobre p${j}`).toBe(0);
      });
    });
  });

  it('peça na borda da tela: o visor fica inteiro na tela', () => {
    for (const peca of [ret(5, 300, 70, 60), ret(740, 300, 70, 60), ret(10, 700, 70, 60), ret(730, 690, 80, 80), ret(400, 20, 80, 60)]) {
      const lugar = escolherLugares([pedido('a', peca)], [], TELA).get('a')!;
      expect(dentroDaTela(lugar.ret)).toBe(true);
    }
  });

  it('sobe para não tapar uma proteção; sem lugar acima dela na tela, fica logo acima da peça', () => {
    const peca = ret(400, 500, 80, 60);
    const protecao = ret(430, 430, 28, 28);
    const lugar = escolherLugares([pedido('a', peca)], [{ ret: protecao }], TELA).get('a')!;
    expect(sobreposicao(lugar.ret, protecao)).toBe(0);
    expect(lugar.ret.y + lugar.ret.altura).toBeLessThan(protecao.y);
    expect(meioX(lugar.ret)).toBeCloseTo(440);
    // Peça perto do alto da tela: acima da proteção o visor sairia da tela.
    const alta = ret(400, 150, 80, 60);
    const noAlto = ret(430, 90, 28, 28);
    const semSaida = escolherLugares([pedido('a', alta)], [{ ret: noAlto }], TELA).get('a')!;
    expect(dentroDaTela(semSaida.ret)).toBe(true);
    expect(semSaida.ret.y + semSaida.ret.altura).toBeCloseTo(150 - FOLGA_DA_PECA_PX);
    // O terminal da própria peça não conta: o visor dela já fica acima dela.
    const proprio = escolherLugares([pedido('a', peca)], [{ ret: protecao, dono: 'a' }], TELA).get('a')!;
    expect(proprio.nivel).toBe(0);
  });

  it('visor arrastado fica onde foi solto, mesmo sobre a peça ou sobre outro visor; só é trazido para dentro da tela', () => {
    const peca = ret(400, 500, 80, 60);
    const solto = escolherLugares([pedido('a', peca, { fixo: [440, 530] })], [{ ret: ret(430, 500, 28, 28) }], TELA).get('a')!;
    expect(solto.arrastado).toBe(true);
    expect([meioX(solto.ret), solto.ret.y + solto.ret.altura / 2]).toEqual([440, 530]);
    const fora = escolherLugares([pedido('a', peca, { fixo: [900, -50] })], [], TELA).get('a')!;
    expect(dentroDaTela(fora.ret)).toBe(true);
    // Com a barra de ajuda no alto da cena, o visor para abaixo dela.
    const sobABarra = escolherLugares([pedido('a', peca, { fixo: [400, 0] }), pedido('b', ret(100, 40, 80, 60))], [], { ...TELA, topo: 30 });
    expect(sobABarra.get('a')!.ret.y).toBe(30 + MARGEM_DA_TELA_PX);
    expect(sobABarra.get('b')!.ret.y).toBe(30 + MARGEM_DA_TELA_PX);
    // Dois arrastados para o mesmo ponto: a escolha é da pessoa, nenhum é reposicionado.
    const dois = escolherLugares([pedido('a', peca, { fixo: [300, 300] }), pedido('b', ret(100, 500, 80, 60), { fixo: [310, 310] })], [], TELA);
    expect(meioX(dois.get('a')!.ret)).toBe(300);
    expect(meioX(dois.get('b')!.ret)).toBe(310);
  });

  it('o visor no lugar padrão desvia do arrastado, mesmo vindo antes dele na ordem', () => {
    const pecaA = ret(400, 500, 80, 60);
    const pecaB = ret(100, 500, 80, 60);
    // O visor de `b` foi solto bem em cima do lugar padrão do visor de `a`.
    const lugares = escolherLugares([pedido('a', pecaA), pedido('b', pecaB, { fixo: [440, 436] })], [], TELA);
    const a = lugares.get('a')!;
    const b = lugares.get('b')!;
    expect(b.arrastado).toBe(true);
    expect(meioX(b.ret)).toBe(440);
    expect(sobreposicao(a.ret, b.ret)).toBe(0);
    expect(a.nivel).toBe(1);
    expect(meioX(a.ret)).toBeCloseTo(440);
    expect(a.ret.y + a.ret.altura).toBeLessThan(b.ret.y);
  });

  it('a câmera andando devagar não faz o visor subir e descer: ele sobe uma vez e fica até o lugar de baixo estar livre com folga', () => {
    // Duas peças se aproximam um pixel por quadro e depois se afastam.
    let anterior: number | null = null;
    let trocas = 0;
    const niveis: number[] = [];
    for (let passo = 0; passo < 400; passo++) {
      const x = passo < 200 ? 500 - passo : 300 + (passo - 200);
      const pecas = [ret(200, 500, 80, 60), ret(x, 500, 80, 60)];
      const lugares = escolherLugares([pedido('p0', pecas[0]!), pedido('p1', pecas[1]!, { anterior })], [], TELA);
      const nivel = lugares.get('p1')!.nivel;
      if (anterior !== null && nivel !== anterior) trocas++;
      expect(lugares.get('p0')!.nivel).toBe(0);
      expect(sobreposicao(lugares.get('p0')!.ret, lugares.get('p1')!.ret)).toBe(0);
      anterior = nivel;
      niveis.push(nivel);
    }
    expect(Math.max(...niveis)).toBe(1);
    expect(trocas).toBe(2);
  });

  it('a mesma entrada dá sempre a mesma saída', () => {
    const pedidos = [pedido('a', ret(380, 560, 90, 70)), pedido('b', ret(470, 565, 70, 50), { fixo: [200, 200] })];
    expect([...escolherLugares(pedidos, [], TELA)]).toEqual([...escolherLugares(pedidos, [], TELA)]);
  });
});
