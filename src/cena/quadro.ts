// Ocupação do trilho de um quadro de energia. Especificação: docs/especificacao/fase-2.md, seção 1.3.
// Conta pura sobre o projeto: quem desenha é a camada de dispositivos (as proteções no trilho) e a de cabos.

import type { Catalogo, Protecao } from '../catalogo/tipos';
import { modulosDaProtecao } from '../nucleo/consultor';
import type { Projeto } from '../nucleo/tipos';
import { TRILHO } from './modelos';

export interface PecaDoTrilho {
  cabo: string;
  /** Índice da proteção em `cabo.protecoes`. */
  indice: number;
  item: Protecao;
  /** Centro da peça ao longo do trilho, em coordenadas do quadro. */
  x: number;
  modulos: number;
}

export interface OcupacaoDoQuadro {
  /** Proteções que cabem no trilho, da esquerda para a direita, na ordem dos cabos do projeto. */
  pecas: PecaDoTrilho[];
  /** Por cabo que passa pelo quadro: onde o fio entra e onde sai, ao longo do trilho. */
  cabos: Map<string, { entrada: number; saida: number }>;
}

/** Distância entre o fio que entra e o que sai, quando os dois vão ao mesmo polo. */
const FOLGA_ENTRE_FIOS = 0.008;

export function ocupacaoDoQuadro(projeto: Projeto, catalogo: Catalogo, uidQuadro: string, modulos: number): OcupacaoDoQuadro {
  const pecas: PecaDoTrilho[] = [];
  const cabos = new Map<string, { entrada: number; saida: number }>();
  const inicio = (-modulos * TRILHO.modulo) / 2;
  let usados = 0;
  for (const c of projeto.cabos) {
    if (c.quadro !== uidQuadro) continue;
    const doCabo: PecaDoTrilho[] = [];
    c.protecoes.forEach((id, indice) => {
      const item = catalogo.get(id);
      if (item?.categoria !== 'protecao') return;
      const n = modulosDaProtecao(item);
      if (n === null || usados + n > modulos) return;
      doCabo.push({ cabo: c.uid, indice, item, x: inicio + (usados + n / 2) * TRILHO.modulo, modulos: n });
      usados += n;
    });
    pecas.push(...doCabo);
    const primeira = doCabo[0];
    const ultima = doCabo[doCabo.length - 1];
    if (primeira && ultima) {
      // O fio entra no primeiro polo da primeira peça e sai do último polo da última.
      const entrada = primeira.x - ((primeira.modulos - 1) * TRILHO.modulo) / 2;
      const saida = ultima.x + ((ultima.modulos - 1) * TRILHO.modulo) / 2;
      cabos.set(c.uid, entrada === saida ? { entrada: entrada - FOLGA_ENTRE_FIOS / 2, saida: saida + FOLGA_ENTRE_FIOS / 2 } : { entrada, saida });
    } else {
      // Cabo que passa pelo quadro sem peça no trilho (quadro cheio): atravessa depois da última peça.
      const x = Math.min(inicio + (usados + 0.5) * TRILHO.modulo, -inicio);
      cabos.set(c.uid, { entrada: x - FOLGA_ENTRE_FIOS / 2, saida: x + FOLGA_ENTRE_FIOS / 2 });
    }
  }
  return { pecas, cabos };
}
