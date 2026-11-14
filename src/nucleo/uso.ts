// Horário de uso dos aparelhos. Especificação: docs/especificacao/nucleo.md, seção 7.

import type { Aparelho, Uso } from '../catalogo/tipos';
import type { Dispositivo } from './tipos';

/** O horário de uso de um aparelho da casa: o definido pelo usuário ou, na falta, o do catálogo. */
export function usoDe(dispositivo: Dispositivo, item: Aparelho): Uso {
  return dispositivo.uso ?? item.usoPadrao;
}

/** Horas de uso por dia. */
export function horasDeUso(uso: Uso): number {
  const horas = uso.fim - uso.inicio;
  return horas >= 0 ? horas : horas + 24;
}

/** Verdadeiro se a hora local, de 0 a 24, cai dentro do horário de uso. O início entra, o fim não. */
export function emUso(uso: Uso, horaLocal: number): boolean {
  if (horasDeUso(uso) >= 24) return true;
  const h = ((horaLocal % 24) + 24) % 24;
  return uso.inicio <= uso.fim ? h >= uso.inicio && h < uso.fim : h >= uso.inicio || h < uso.fim;
}
