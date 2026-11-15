// Ajudante para criar elementos SVG, no mesmo estilo do `h` de ../ui/dom.

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, atributos: Record<string, string | number | undefined> | null, ...filhos: (Node | string | null | false | undefined)[]): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v !== undefined) e.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f !== null && f !== false && f !== undefined) e.append(f);
  return e;
}
