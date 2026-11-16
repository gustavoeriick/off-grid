// Lugar dos visores ampliados na tela: sempre acima da peça, ou onde a pessoa o soltou.
// Especificação: docs/especificacao/operar.md, seção 7.2.
//
// Conta pura, em pixels da tela (origem no canto de cima, à esquerda). Quem mede as peças e desenha é `operar.ts`.
// Este é o ponto único de onde sai a posição do visor.
//
// - Lugar padrão: acima da peça, centrado, com folga. Se cairia sobre outro visor (ou sobre uma proteção, que o visor
//   taparia), sobe até passar dele: empilha para cima, sem ir para os lados.
// - Visor arrastado: fica onde a pessoa o soltou. Não é reposicionado; os visores no lugar padrão desviam dele.
// - Todos ficam inteiros dentro da tela.

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
  /** Centro do visor na tela, quando a pessoa o arrastou. Ausente: lugar padrão, acima da peça. */
  fixo?: readonly [x: number, y: number];
  /** Quanto o visor tinha subido no quadro anterior (`nivel` do lugar escolhido). Nulo ou ausente se não estava na tela. */
  anterior?: number | null;
}

export interface LugarEscolhido {
  ret: Retangulo;
  /** Quantas vezes o visor subiu para desviar de outro visor ou de uma proteção. Zero: logo acima da peça. */
  nivel: number;
  /** Verdadeiro para o visor que está onde a pessoa o soltou. */
  arrastado: boolean;
}

/** Folga entre o visor e a peça dele, entre dois visores, e entre o visor e a borda da tela. */
export const FOLGA_DA_PECA_PX = 14;
export const FOLGA_ENTRE_VISORES_PX = 8;
export const MARGEM_DA_TELA_PX = 8;
/**
 * O visor que subiu para desviar só desce quando o lugar de baixo fica livre com esta folga a mais: é o que o impede
 * de subir e descer quando a câmera passa devagar pelo ponto em que dois visores se encostam.
 */
const APEGO_PX = 10;

/** O que o visor no lugar padrão não deve tapar: uma proteção ou um terminal. */
export interface Estorvo {
  ret: Retangulo;
  /** Peça a que pertence: o visor dela não o conta (ele já fica acima da peça dele). */
  dono?: string;
}

/** A cena, em pixels. `topo` é a faixa do alto que um painel da página cobre (a barra de ajuda da câmera): o visor fica abaixo dela. */
export interface TelaDosVisores {
  largura: number;
  altura: number;
  topo?: number;
}

/** Área em que dois retângulos se sobrepõem, com `folga` somada em volta do primeiro (negativa encolhe). */
export function sobreposicao(a: Retangulo, b: Retangulo, folga = 0): number {
  const l = Math.min(a.x + a.largura + folga, b.x + b.largura) - Math.max(a.x - folga, b.x);
  const h = Math.min(a.y + a.altura + folga, b.y + b.altura) - Math.max(a.y - folga, b.y);
  return l > 0 && h > 0 ? l * h : 0;
}

const limitar = (v: number, min: number, max: number): number => (max < min ? min : Math.min(max, Math.max(min, v)));

/**
 * Sobe o visor a partir de `y` até ele não cair sobre outro visor (com a folga entre visores) nem sobre um estorvo.
 * Na primeira conferência vale a folga a mais de `apego` (a de quem já estava em cima); depois de subir, não.
 */
function subir(x: number, y: number, l: number, a: number, visores: readonly Retangulo[], estorvos: readonly Retangulo[], apego: number): { y: number; nivel: number } {
  let nivel = 0;
  for (let volta = 0; volta <= visores.length + estorvos.length; volta++) {
    const ret: Retangulo = { x, y, largura: l, altura: a };
    const mais = nivel === 0 ? apego : 0;
    let topo = Infinity;
    for (const b of visores) if (sobreposicao(ret, b, FOLGA_ENTRE_VISORES_PX + mais) > 0) topo = Math.min(topo, b.y);
    for (const b of estorvos) if (sobreposicao(ret, b, mais) > 0) topo = Math.min(topo, b.y);
    if (topo === Infinity) break;
    // Meio pixel a mais: a conta de ponto flutuante não deixa o visor encostado contar como sobreposto.
    y = topo - FOLGA_ENTRE_VISORES_PX - a - 0.5;
    nivel++;
  }
  return { y, nivel };
}

/**
 * Escolhe o lugar de cada visor. Os arrastados ficam onde estão (só são trazidos para dentro da tela). Os demais, na
 * ordem dos pedidos (que deve ser sempre a mesma: quem vem depois sobe mais), ficam acima da peça de cada um e sobem
 * o que for preciso para não cair sobre um visor já posto nem sobre o que está em `evitar` (proteções e terminais). Se
 * para desviar de `evitar` o visor sairia da tela, `evitar` deixa de valer; se ainda assim sairia, ele para na borda de cima.
 */
export function escolherLugares(pedidos: readonly PedidoDeLugar[], evitar: readonly Estorvo[], tela: TelaDosVisores): Map<string, LugarEscolhido> {
  const escolhidos = new Map<string, LugarEscolhido>();
  const postos: Retangulo[] = [];
  const M = MARGEM_DA_TELA_PX;
  const topo = M + Math.max(0, tela.topo ?? 0);
  for (const pedido of pedidos) {
    if (!pedido.fixo) continue;
    const { largura: l, altura: a } = pedido;
    const ret: Retangulo = {
      x: limitar(pedido.fixo[0] - l / 2, M, tela.largura - l - M),
      y: limitar(pedido.fixo[1] - a / 2, topo, tela.altura - a - M),
      largura: l,
      altura: a,
    };
    escolhidos.set(pedido.id, { ret, nivel: 0, arrastado: true });
    postos.push(ret);
  }
  for (const pedido of pedidos) {
    if (pedido.fixo) continue;
    const { largura: l, altura: a, peca } = pedido;
    const x = limitar(peca.x + peca.largura / 2 - l / 2, M, tela.largura - l - M);
    const base = Math.min(peca.y - FOLGA_DA_PECA_PX - a, tela.altura - a - M);
    const apego = (pedido.anterior ?? 0) > 0 ? APEGO_PX : 0;
    const estorvos = evitar.filter((e) => e.dono !== pedido.id).map((e) => e.ret);
    let lugar = subir(x, base, l, a, postos, estorvos, apego);
    if (lugar.y < topo && estorvos.length > 0) lugar = subir(x, base, l, a, postos, [], apego);
    const ret: Retangulo = { x, y: Math.max(topo, lugar.y), largura: l, altura: a };
    escolhidos.set(pedido.id, { ret, nivel: lugar.nivel, arrastado: false });
    postos.push(ret);
  }
  return escolhidos;
}

/** Ponto do retângulo mais perto de um ponto dado. */
export function pontoMaisPerto(r: Retangulo, x: number, y: number, encolher = 0): [x: number, y: number] {
  const ex = r.largura * encolher;
  const ey = r.altura * encolher;
  return [limitar(x, r.x + ex, r.x + r.largura - ex), limitar(y, r.y + ey, r.y + r.altura - ey)];
}
