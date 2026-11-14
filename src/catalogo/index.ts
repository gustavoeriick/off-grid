// Catálogo de produtos: lista curada, cada item ligado a um anúncio da pesquisa em pesquisa/.
// Especificação: docs/especificacao/catalogo.md

import { APARELHOS, REDE } from './aparelhos';
import { BATERIAS } from './baterias';
import { CONTROLADORES, PLACAS } from './geracao';
import { INVERSORES } from './inversores';
import { ACESSORIOS, CABOS, PROTECOES } from './instalacao';
import type { Catalogo, Item } from './tipos';

export type * from './tipos';
export { gruposDoCatalogo, grupoDoItem, type GrupoDoCatalogo } from './grupos';

const ITENS: Item[] = [
  ...PLACAS,
  ...BATERIAS,
  ...INVERSORES,
  ...CONTROLADORES,
  ...PROTECOES,
  ...CABOS,
  ...ACESSORIOS,
  ...APARELHOS,
  ...REDE,
];

export const CATALOGO: Catalogo = new Map(ITENS.map((item) => [item.id, item]));

export function itemPorId(id: string): Item | undefined {
  return CATALOGO.get(id);
}
