// Lugar dos visores ampliados na tela: ao lado ou acima da peça, sem cair sobre ela nem um sobre o outro.
// Especificação: docs/especificacao/operar.md, seção 7.
//
// Conta pura, em pixels da tela (origem no canto de cima, à esquerda). Quem mede as peças e desenha é `operar.ts`.
// Este é o ponto único de onde sai a posição do visor: os ajustes A1 e A2 do plano (visores configuráveis e
// arrastar o visor) entram aqui, como mais um candidato ou como um lugar fixo no pedido.

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface PedidoDeLugar {
  id: string;
  /** Caixa da peça na tela. */
  peca: Retangulo;
  /** Medidas do visor na tela. */
  largura: number;
  altura: number;
  /** Candidato escolhido no quadro anterior. Nulo se o visor não estava na tela. */
  anterior: number | null;
}

/** O que o visor deve evitar, sem ser proibido. */
export interface Estorvo {
  ret: Retangulo;
  /** Custo de cobrir metade do estorvo, ou mais. */
  peso: number;
  /**
   * `coberto`: o visor ficaria por cima dele (peça, botão, proteção); o custo cresce com a parte do estorvo coberta.
   * `cobre`: ele ficaria por cima do visor (painel da página); o custo cresce com a parte do visor coberta.
   * Nos dois casos o custo cresce sem degrau, de zero até o peso (com metade coberta): um degrau faria o visor
   * trocar de lugar e voltar quando a câmera passa devagar pelo ponto em que ele encosta no estorvo.
   */
  tipo: 'coberto' | 'cobre';
  /** Peça a que pertence: o visor dela não o conta (a peça dele é tratada à parte). */
  dono?: string;
}

export interface LugarEscolhido {
  ret: Retangulo;
  candidato: number;
}

/** Folga entre o visor e a peça dele, entre dois visores, e entre o visor e a borda da tela. */
export const FOLGA_DA_PECA_PX = 14;
export const FOLGA_ENTRE_VISORES_PX = 8;
export const MARGEM_DA_TELA_PX = 8;
/**
 * Quanto um lugar novo precisa ser melhor que o atual para o visor mudar: é o que o impede de tremer. Fica abaixo da
 * menor diferença entre dois candidatos (6), para o visor voltar ao lugar preferido assim que ele fica livre.
 */
const APEGO = 5;
/** O lugar atual tolera esta sobreposição com outro visor antes de ser largado. */
const TOLERANCIA_PX = 4;

interface Candidato {
  /** Canto de cima, à esquerda, a partir da caixa da peça e das medidas do visor. */
  em(p: Retangulo, l: number, a: number): [x: number, y: number];
  /** Custo fixo: a ordem de preferência. */
  custo: number;
}

const G = FOLGA_DA_PECA_PX;
const meioX = (p: Retangulo): number => p.x + p.largura / 2;
const meioY = (p: Retangulo): number => p.y + p.altura / 2;
const acima = (linha: number, desvio: number, custo: number): Candidato => ({
  em: (p, l, a) => [meioX(p) - l / 2 + desvio * l, p.y - G - a - linha * (a + FOLGA_ENTRE_VISORES_PX)],
  custo,
});

/** Lugares possíveis, do preferido ao último recurso. A ordem da lista é o número do candidato: não reordenar. */
const CANDIDATOS: readonly Candidato[] = [
  acima(0, 0, 0),
  acima(0, 0.5, 6),
  acima(0, -0.5, 6),
  // Ao lado, na altura do meio da peça.
  { em: (p, l, a) => [p.x + p.largura + G, meioY(p) - a / 2], custo: 10 },
  { em: (p, l, a) => [p.x - G - l, meioY(p) - a / 2], custo: 10 },
  // Empilhado: uma linha acima.
  acima(1, 0, 12),
  acima(0, 1.05, 14),
  acima(0, -1.05, 14),
  // Na diagonal de cima.
  { em: (p, l, a) => [p.x + p.largura + G, p.y - a * 0.6], custo: 16 },
  { em: (p, l, a) => [p.x - G - l, p.y - a * 0.6], custo: 16 },
  acima(1, 0.6, 18),
  acima(1, -0.6, 18),
  acima(2, 0, 24),
  acima(1, 1.2, 26),
  acima(1, -1.2, 26),
  acima(2, 0.7, 30),
  acima(2, -0.7, 30),
  acima(3, 0, 36),
  // Abaixo: só quando não sobra lugar em cima nem dos lados.
  { em: (p, l, a) => [meioX(p) - l / 2, p.y + p.altura + G], custo: 40 },
  { em: (p, l, a) => [meioX(p) - l / 2 + l, p.y + p.altura + G], custo: 46 },
  { em: (p, l, a) => [meioX(p) - l / 2 - l, p.y + p.altura + G], custo: 46 },
];

/** Área em que dois retângulos se sobrepõem, com `folga` somada em volta do primeiro (negativa encolhe). */
export function sobreposicao(a: Retangulo, b: Retangulo, folga = 0): number {
  const l = Math.min(a.x + a.largura + folga, b.x + b.largura) - Math.max(a.x - folga, b.x);
  const h = Math.min(a.y + a.altura + folga, b.y + b.altura) - Math.max(a.y - folga, b.y);
  return l > 0 && h > 0 ? l * h : 0;
}

const limitar = (v: number, min: number, max: number): number => (max < min ? min : Math.min(max, Math.max(min, v)));

/**
 * Escolhe o lugar de cada visor, na ordem dos pedidos (que deve ser sempre a mesma: quem vem antes escolhe antes).
 * Nenhum visor fica sobre a peça dele nem sobre outro visor, enquanto houver candidato que o permita; todos ficam
 * dentro da tela. O lugar do quadro anterior é mantido até outro ser claramente melhor.
 */
export function escolherLugares(pedidos: readonly PedidoDeLugar[], estorvos: readonly Estorvo[], tela: { largura: number; altura: number }): Map<string, LugarEscolhido> {
  const escolhidos = new Map<string, LugarEscolhido>();
  const postos: Retangulo[] = [];
  for (const pedido of pedidos) {
    const { largura: l, altura: a, peca } = pedido;
    const area = Math.max(1, l * a);
    let melhor: LugarEscolhido | null = null;
    let menor = Infinity;
    CANDIDATOS.forEach((cand, i) => {
      const [x0, y0] = cand.em(peca, l, a);
      const x = limitar(x0, MARGEM_DA_TELA_PX, tela.largura - l - MARGEM_DA_TELA_PX);
      const y = limitar(y0, MARGEM_DA_TELA_PX, tela.altura - a - MARGEM_DA_TELA_PX);
      const ret: Retangulo = { x, y, largura: l, altura: a };
      const atual = pedido.anterior === i;
      // Empurrado pela borda da tela, o lugar vale menos: o visor se afasta de onde devia estar.
      let custo = cand.custo + 0.5 * (Math.abs(x - x0) + Math.abs(y - y0)) - (atual ? APEGO : 0);
      // Sobre a própria peça ou sobre outro visor: só se não houver outra saída.
      const naPeca = sobreposicao(ret, peca, atual ? 0 : G / 2);
      if (naPeca > 0) custo += 5000 + (100 * naPeca) / area;
      for (const outro of postos) {
        const s = sobreposicao(ret, outro, atual ? -TOLERANCIA_PX : FOLGA_ENTRE_VISORES_PX);
        if (s > 0) custo += 10000 + (100 * s) / area;
      }
      for (const e of estorvos) {
        if (e.dono === pedido.id) continue;
        const s = sobreposicao(ret, e.ret);
        if (s <= 0) continue;
        const parte = e.tipo === 'cobre' ? s / area : s / Math.max(1, e.ret.largura * e.ret.altura);
        custo += e.peso * Math.min(1, 2 * parte);
      }
      if (custo < menor) {
        menor = custo;
        melhor = { ret, candidato: i };
      }
    });
    if (!melhor) continue;
    escolhidos.set(pedido.id, melhor);
    postos.push((melhor as LugarEscolhido).ret);
  }
  return escolhidos;
}

/** Ponto do retângulo mais perto de um ponto dado. */
export function pontoMaisPerto(r: Retangulo, x: number, y: number, encolher = 0): [x: number, y: number] {
  const ex = r.largura * encolher;
  const ey = r.altura * encolher;
  return [limitar(x, r.x + ex, r.x + r.largura - ex), limitar(y, r.y + ey, r.y + r.altura - ey)];
}
