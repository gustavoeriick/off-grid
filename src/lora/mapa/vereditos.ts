// Cores e palavras do veredito de um enlace, usadas pelo mapa e pelo corte do terreno.
// O veredito nunca aparece só como cor: sempre vem com as palavras. Especificação: docs/especificacao/lora.md, seções 4.7 e 7.

import type { SituacaoDoEnlace } from '../calculo';
import type { Veredito } from '../nucleo/tipos';

export type Tom = Veredito | 'calculando' | 'erro';

export const PALAVRAS_DO_VEREDITO: Record<Tom, string> = {
  folga: 'fecha com folga',
  limite: 'fecha no limite',
  'nao-fecha': 'não fecha',
  calculando: 'calculando…',
  erro: 'sem relevo',
};

export function tomDaSituacao(situacao: SituacaoDoEnlace | null): Tom {
  if (!situacao || situacao.estado === 'calculando') return 'calculando';
  if (situacao.estado === 'erro') return 'erro';
  return situacao.resultado.veredito;
}

/** Distância como se escreve no Brasil: 850 m, 7,2 km, 39,7 km. */
export function distanciaTexto(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
