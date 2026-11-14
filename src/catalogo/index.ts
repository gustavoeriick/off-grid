// Catálogo de produtos. A lista é preenchida na tarefa 1.2, a partir de pesquisa/.
// Especificação: docs/especificacao/catalogo.md

import type { Catalogo, Item } from './tipos';

export type * from './tipos';

const ITENS: Item[] = [];

export const CATALOGO: Catalogo = new Map(ITENS.map((item) => [item.id, item]));

export function itemPorId(id: string): Item | undefined {
  return CATALOGO.get(id);
}
