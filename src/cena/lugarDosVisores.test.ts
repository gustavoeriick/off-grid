// Lugar dos visores ampliados na tela (operar.md, seção 7): fora da peça, sem sobreposição, dentro da tela e sem tremer.

import { describe, expect, it } from 'vitest';
import { escolherLugares, type Estorvo, FOLGA_DA_PECA_PX, MARGEM_DA_TELA_PX, type PedidoDeLugar, type Retangulo, sobreposicao } from './lugarDosVisores';

const TELA = { largura: 820, altura: 780 };
const ret = (x: number, y: number, largura: number, altura: number): Retangulo => ({ x, y, largura, altura });
const pedido = (id: string, peca: Retangulo, anterior: number | null = null): PedidoDeLugar => ({ id, peca, largura: 180, altura: 100, anterior });
const dentroDaTela = (r: Retangulo): boolean =>
  r.x >= MARGEM_DA_TELA_PX && r.y >= MARGEM_DA_TELA_PX && r.x + r.largura <= TELA.largura - MARGEM_DA_TELA_PX && r.y + r.altura <= TELA.altura - MARGEM_DA_TELA_PX;

describe('lugar dos visores ampliados', () => {
  it('sozinho, o visor fica acima da peça, centrado e com folga', () => {
    const peca = ret(400, 500, 80, 60);
    const lugar = escolherLugares([pedido('a', peca)], [], TELA).get('a')!;
    expect(lugar.candidato).toBe(0);
    expect(lugar.ret.x + lugar.ret.largura / 2).toBeCloseTo(440);
    expect(lugar.ret.y + lugar.ret.altura).toBeCloseTo(500 - FOLGA_DA_PECA_PX);
    expect(sobreposicao(lugar.ret, peca)).toBe(0);
  });

  it('peças vizinhas: os visores não se sobrepõem, nem ficam sobre a peça de cada um', () => {
    const pecas = [ret(380, 560, 90, 70), ret(470, 565, 70, 50), ret(430, 380, 60, 70), ret(300, 540, 60, 120)];
    const pedidos = pecas.map((p, i) => pedido(`p${i}`, p));
    const lugares = escolherLugares(pedidos, [], TELA);
    const postos = pedidos.map((p) => lugares.get(p.id)!.ret);
    postos.forEach((a, i) => {
      expect(dentroDaTela(a), `p${i} na tela`).toBe(true);
      expect(sobreposicao(a, pecas[i]!), `p${i} sobre a peça dele`).toBe(0);
      postos.forEach((b, j) => {
        if (j > i) expect(sobreposicao(a, b), `p${i} sobre p${j}`).toBe(0);
      });
    });
  });

  it('peça no canto da tela: o visor fica inteiro na tela e fora da peça', () => {
    for (const peca of [ret(5, 5, 70, 60), ret(740, 10, 70, 60), ret(10, 700, 70, 60), ret(730, 690, 80, 80)]) {
      const lugar = escolherLugares([pedido('a', peca)], [], TELA).get('a')!;
      expect(dentroDaTela(lugar.ret)).toBe(true);
      expect(sobreposicao(lugar.ret, peca)).toBe(0);
    }
  });

  it('evita cobrir um botão de ligar e um painel da página quando há outro lugar', () => {
    const peca = ret(400, 500, 80, 60);
    const botao: Estorvo = { ret: ret(430, 430, 30, 30), peso: 30, tipo: 'coberto' };
    const comBotao = escolherLugares([pedido('a', peca)], [botao], TELA).get('a')!;
    expect(sobreposicao(comBotao.ret, botao.ret)).toBe(0);
    const painel: Estorvo = { ret: ret(0, 0, 820, 420), peso: 60, tipo: 'cobre' };
    const comPainel = escolherLugares([pedido('a', peca)], [painel], TELA).get('a')!;
    expect(sobreposicao(comPainel.ret, painel.ret)).toBe(0);
    expect(sobreposicao(comPainel.ret, peca)).toBe(0);
  });

  it('o lugar do quadro anterior é mantido enquanto serve: a câmera andando devagar não faz o visor trocar de lugar', () => {
    // Duas peças se aproximam um pixel por quadro. Sem apego, o segundo visor trocaria de lugar assim que encostasse.
    let anteriores: (number | null)[] = [null, null];
    let trocas = 0;
    for (let passo = 0; passo < 200; passo++) {
      const pecas = [ret(200, 500, 80, 60), ret(600 - passo, 500, 80, 60)];
      const lugares = escolherLugares(pecas.map((p, i) => pedido(`p${i}`, p, anteriores[i] ?? null)), [], TELA);
      const novos = pecas.map((_, i) => lugares.get(`p${i}`)!.candidato);
      if (anteriores[1] !== null && novos[1] !== anteriores[1]) trocas++;
      expect(novos[0]).toBe(0);
      expect(sobreposicao(lugares.get('p0')!.ret, lugares.get('p1')!.ret)).toBeLessThan(5 * 100);
      anteriores = novos;
    }
    expect(trocas).toBeLessThanOrEqual(2);
  });

  it('a mesma entrada dá sempre a mesma saída', () => {
    const pedidos = [pedido('a', ret(380, 560, 90, 70)), pedido('b', ret(470, 565, 70, 50))];
    expect([...escolherLugares(pedidos, [], TELA)]).toEqual([...escolherLugares(pedidos, [], TELA)]);
  });
});
