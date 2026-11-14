// Estado do aplicativo e ações. Arquivo do coordenador.
// Especificação: docs/especificacao/cena-e-interface.md, seção 10.
// Fase 1: projeto, tempo e modo de visão. Seleção, simulação e derivados entram nas fases 2 e 3.

import { cenarioPlanoNoPapel } from './nucleo/cenarios';
import type { CasaConfig, Clima, Projeto } from './nucleo/tipos';

export type ModoVisao = 'completa' | 'sem-telhado' | 'terreo';

export interface EstadoApp {
  projeto: Projeto;
  tempo: {
    /** Instante simulado, em milissegundos UTC. */
    msUtc: number;
    /** Minutos simulados por segundo real. Zero é pausa. */
    velocidade: number;
  };
  visao: ModoVisao;
}

export type Evento = 'projeto' | 'tempo' | 'visao';

const ouvintes: Record<Evento, Set<() => void>> = {
  projeto: new Set(),
  tempo: new Set(),
  visao: new Set(),
};

/** 21/06/2026 ao meio-dia no Rio (UTC − 3). */
const INSTANTE_INICIAL = Date.UTC(2026, 5, 21, 15, 0, 0);

export const estado: EstadoApp = {
  projeto: cenarioPlanoNoPapel(),
  tempo: { msUtc: INSTANTE_INICIAL, velocidade: 0 },
  visao: 'completa',
};

/** Registra uma função chamada a cada mudança do tipo dado. Devolve a função que cancela o registro. */
export function assinar(evento: Evento, fn: () => void): () => void {
  ouvintes[evento].add(fn);
  return () => ouvintes[evento].delete(fn);
}

function avisar(evento: Evento): void {
  for (const fn of ouvintes[evento]) fn();
}

export const acoes = {
  /** Troca campos da casa: medidas, varanda, quartinho, orientação. */
  alterarCasa(mudanca: Partial<CasaConfig>): void {
    estado.projeto.casa = { ...estado.projeto.casa, ...mudanca };
    avisar('projeto');
  },

  definirClima(clima: Clima): void {
    estado.projeto.clima = clima;
    avisar('projeto');
  },

  definirTempo(msUtc: number): void {
    estado.tempo.msUtc = msUtc;
    avisar('tempo');
  },

  /** Minutos simulados por segundo real: 0, 1, 10 ou 60. */
  definirVelocidade(velocidade: number): void {
    estado.tempo.velocidade = velocidade;
    avisar('tempo');
  },

  definirVisao(visao: ModoVisao): void {
    estado.visao = visao;
    avisar('visao');
  },
};
