// Grade das placas em uma água de telhado: quantas cabem em uma fileira, onde a fileira começa e quanto falta até a borda.
// Só contas, sem Three.js: quem usa é `lugares.ts`. Especificação: docs/especificacao/cena-e-interface.md, seções 5 e 6.

/** Folga entre placas vizinhas, em metros. */
export const FOLGA_ENTRE_PLACAS = 0.02;

/** Tolerância das contas de comprimento, em metros: a medida que cabe justa não é recusada por ruído de conta. */
const TOLERANCIA = 1e-6;

/**
 * Quantas placas de `medida` cabem lado a lado em `extensao`, com a folga entre elas (nas bordas não há folga):
 * o maior n com n × medida + (n − 1) × folga ≤ extensão.
 */
export function quantasCabem(extensao: number, medida: number, folga = FOLGA_ENTRE_PLACAS): number {
  if (!(medida > 0) || extensao + TOLERANCIA < medida) return 0;
  return Math.floor((extensao + folga + TOLERANCIA) / (medida + folga));
}

/**
 * Âncora da grade de uma água sem placa dessa medida: o centro de uma das casas da fileira que faz caber o maior
 * número de placas, centrada entre `min` e `max` (sobra igual dos dois lados). Com número ímpar de placas é o meio da
 * água; com número par, meio passo ao lado. Se não cabe nenhuma, o meio da água.
 */
export function ancoraDaFileira(min: number, max: number, medida: number, folga = FOLGA_ENTRE_PLACAS): number {
  const meio = (min + max) / 2;
  const n = quantasCabem(max - min, medida, folga);
  return n === 0 ? meio : meio - ((n - 1) / 2) * (medida + folga);
}

/** Quanto a placa de centro `centro` e medida `medida` passa da borda do trecho de `min` a `max`, em metros. Zero se cabe. */
export function passaDaBorda(centro: number, medida: number, min: number, max: number): number {
  const passa = Math.max(min - (centro - medida / 2), centro + medida / 2 - max);
  return passa > TOLERANCIA ? passa : 0;
}

/** Centímetros inteiros para a mensagem "faltam X cm": arredondados para cima, e nunca zero. */
export function centimetrosQueFaltam(metros: number): number {
  return Math.max(1, Math.ceil(metros * 100 - 1e-4));
}

/**
 * Uma placa de `medida` caberia em `extensao` se as que já estão na fileira (medidas em `postas`) fossem encostadas
 * umas nas outras, com a folga entre elas.
 */
export function cabeSeArrumar(extensao: number, postas: readonly number[], medida: number, folga = FOLGA_ENTRE_PLACAS): boolean {
  const ocupado = postas.reduce((soma, m) => soma + m + folga, 0);
  return ocupado + medida <= extensao + TOLERANCIA;
}

// ---------------------------------------------------------------- "Arrumar as placas"

/** Retângulo útil de uma água de telhado: `u` corre ao longo da largura e `v` sobe a queda, em metros. */
export interface AguaDoTelhado {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Uma placa na água: o centro dela e a medida que ocupa ao longo de `u` e de `v`, já com o giro em que está. */
export interface PlacaNaAgua {
  uid: string;
  u: number;
  v: number;
  largura: number;
  altura: number;
}

export type Arrumacao =
  | {
      ok: true;
      /** Centro novo de cada placa da água, todas elas, também as que não saíram do lugar. */
      posicoes: Map<string, { u: number; v: number }>;
      /** Quantas mudam de lugar. */
      movidas: number;
    }
  /** Não dá para acomodar todas sem sobrepor: nada muda, e `motivo` diz por quê, em palavras para a tela. */
  | { ok: false; motivo: string };

/** Abaixo disto (meio milímetro) a placa conta como já estando no lugar. */
const MESMO_LUGAR = 0.0005;

/**
 * Começo, entre `0` e `casas − usadas`, do trecho de `usadas` casas seguidas cujo meio fica mais perto de `alvo`.
 * As casas têm centro em `ancora + i × passo`. No empate, vale o começo menor.
 */
function trechoMaisPerto(ancora: number, passo: number, casas: number, usadas: number, alvo: number): number {
  let melhor = 0;
  let menor = Infinity;
  for (let s = 0; s + usadas <= casas; s++) {
    const distancia = Math.abs(ancora + (s + (usadas - 1) / 2) * passo - alvo);
    if (distancia < menor - TOLERANCIA) {
      menor = distancia;
      melhor = s;
    }
  }
  return melhor;
}

/**
 * "Arrumar as placas": a posição nova de cada placa de uma água, de modo que caiba o máximo.
 *
 * - Placas de mesma medida (com o giro em que estão) formam um grupo, com fileiras próprias. Cada fileira usa as casas
 *   da grade em que cabe o maior número de placas, centrada na largura da água (a mesma de `ancoraDaFileira`), com a
 *   folga entre vizinhas e nenhuma casa pulada. Fileira que não enche fica no trecho da grade mais perto de onde as
 *   placas dela estavam: assim a casa que sobra continua inteira, para a próxima placa.
 * - A ordem de leitura se mantém: de cima para baixo e, na fileira, ao longo de `u`. Vizinhas continuam vizinhas, e os
 *   cabos entre elas não se cruzam.
 * - Com um grupo só, as fileiras ficam nas casas da grade centrada ao longo da queda, no trecho mais perto de onde
 *   estavam. Com medidas diferentes, os grupos são empilhados (o de cima continua em cima) e o conjunto fica centrado.
 * - Se as fileiras não cabem na água, nada muda: a resposta traz o motivo.
 *
 * Nenhuma placa sai da água, muda de giro ou some. Arrumar o que já está arrumado devolve as mesmas posições.
 */
export function arrumarPlacas(agua: AguaDoTelhado, placas: readonly PlacaNaAgua[], folga = FOLGA_ENTRE_PLACAS): Arrumacao {
  const posicoes = new Map<string, { u: number; v: number }>();
  if (placas.length === 0) return { ok: true, posicoes, movidas: 0 };
  const largura = agua.u1 - agua.u0;
  const queda = agua.v1 - agua.v0;

  interface Grupo {
    chave: string;
    largura: number;
    altura: number;
    placas: PlacaNaAgua[];
    porFileira: number;
    fileiras: number;
    extensao: number;
    meio: number;
  }
  const porChave = new Map<string, Grupo>();
  for (const p of placas) {
    // Medidas iguais até o milímetro são a mesma medida.
    const chave = `${Math.round(p.largura * 1000)}x${Math.round(p.altura * 1000)}`;
    const grupo = porChave.get(chave);
    if (grupo) grupo.placas.push(p);
    else porChave.set(chave, { chave, largura: p.largura, altura: p.altura, placas: [p], porFileira: 0, fileiras: 0, extensao: 0, meio: 0 });
  }

  const grupos = [...porChave.values()];
  for (const g of grupos) {
    g.porFileira = quantasCabem(largura, g.largura, folga);
    if (g.porFileira === 0 || quantasCabem(queda, g.altura, folga) === 0) return { ok: false, motivo: 'Há uma placa maior do que este telhado.' };
    g.fileiras = Math.ceil(g.placas.length / g.porFileira);
    g.extensao = g.fileiras * g.altura + (g.fileiras - 1) * folga;
    const vs = g.placas.map((p) => p.v);
    g.meio = (Math.min(...vs) + Math.max(...vs)) / 2;
    // Ordem de leitura: fileiras de cima para baixo (placa a menos de meia altura da primeira é da mesma fileira) e, nelas, ao longo de u.
    const porAltura = [...g.placas].sort((a, b) => b.v - a.v || a.u - b.u || a.uid.localeCompare(b.uid));
    const lidas: PlacaNaAgua[] = [];
    let fileira: PlacaNaAgua[] = [];
    const fechar = (): void => {
      lidas.push(...fileira.sort((a, b) => a.u - b.u || a.uid.localeCompare(b.uid)));
      fileira = [];
    };
    for (const p of porAltura) {
      if (fileira.length > 0 && fileira[0]!.v - p.v > g.altura / 2) fechar();
      fileira.push(p);
    }
    fechar();
    g.placas = lidas;
  }
  grupos.sort((a, b) => b.meio - a.meio || a.chave.localeCompare(b.chave));

  const total = grupos.reduce((soma, g) => soma + g.extensao, 0) + (grupos.length - 1) * folga;
  if (total > queda + TOLERANCIA) {
    const falta = centimetrosQueFaltam(total - queda);
    return {
      ok: false,
      motivo:
        grupos.length > 1
          ? `Placas de medidas diferentes ficam em fileiras separadas, e assim faltam ${falta} cm de telhado para caberem todas sem ficar uma em cima da outra.`
          : `Faltam ${falta} cm de telhado para as fileiras caberem sem ficar uma placa em cima da outra.`,
    };
  }

  // Centro da fileira de cima do primeiro grupo; os seguintes vêm logo abaixo.
  let topo: number;
  const unico = grupos.length === 1 ? grupos[0]! : null;
  if (unico) {
    const passo = unico.altura + folga;
    const casas = quantasCabem(queda, unico.altura, folga);
    const ancora = ancoraDaFileira(agua.v0, agua.v1, unico.altura, folga);
    const s = trechoMaisPerto(ancora, passo, casas, unico.fileiras, unico.meio);
    topo = ancora + (s + unico.fileiras - 1) * passo + unico.altura / 2;
  } else {
    topo = (agua.v0 + agua.v1) / 2 + total / 2;
  }

  let movidas = 0;
  for (const g of grupos) {
    const passoU = g.largura + folga;
    const ancoraU = ancoraDaFileira(agua.u0, agua.u1, g.largura, folga);
    for (let f = 0; f < g.fileiras; f++) {
      const daFileira = g.placas.slice(f * g.porFileira, (f + 1) * g.porFileira);
      const v = topo - g.altura / 2 - f * (g.altura + folga);
      const meio = daFileira.reduce((soma, p) => soma + p.u, 0) / daFileira.length;
      const s = trechoMaisPerto(ancoraU, passoU, g.porFileira, daFileira.length, meio);
      daFileira.forEach((p, i) => {
        const u = ancoraU + (s + i) * passoU;
        posicoes.set(p.uid, { u, v });
        if (Math.abs(u - p.u) > MESMO_LUGAR || Math.abs(v - p.v) > MESMO_LUGAR) movidas++;
      });
    }
    topo -= g.extensao + folga;
  }
  return { ok: true, posicoes, movidas };
}
