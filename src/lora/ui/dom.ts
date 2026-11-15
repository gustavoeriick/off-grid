// Ajudantes de DOM do ambiente de LoRa. São cópias pequenas dos do ambiente solar, para os dois não dependerem um do outro.

type Atributos = Record<string, string | boolean | undefined> | null;
export type Filho = Node | string | null | false | undefined;

/** Cria um elemento. Textos entram como nós de texto, nunca como HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, atributos: Atributos, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === undefined || v === false) continue;
    e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos) if (f !== null && f !== false && f !== undefined) e.append(f);
  return e;
}

export function el<T extends HTMLElement>(seletor: string): T {
  const e = document.querySelector<T>(seletor);
  if (!e) throw new Error(`Elemento não encontrado: ${seletor}`);
  return e;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Mensagem curta no pé da tela. Erros ficam mais tempo. */
export function mostrarMensagem(texto: string, erro = false): void {
  const caixa = el<HTMLElement>('#mensagem');
  caixa.textContent = texto;
  caixa.className = erro ? 'erro' : '';
  caixa.hidden = false;
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => (caixa.hidden = true), erro ? 8000 : 3500);
}

/** Número com vírgula decimal, como se escreve no Brasil. */
export function num(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Data e hora curtas: 15/11/2026 às 14:42. */
export function dataTexto(ms: number): string {
  const d = new Date(ms);
  const dois = (n: number): string => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
