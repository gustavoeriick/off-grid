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
