// Montagem do perfil do terreno. Especificação: seção 4.2.
import {
  ESPACAMENTO_DO_PERFIL_KM,
  PONTOS_MAXIMOS_DO_PERFIL,
  PONTOS_MINIMOS_DO_PERFIL,
} from './constantes';
import { distanciaKm, pontoNoCaminho } from './geografia';
import type { AltitudeEm, Coordenada, Perfil } from './tipos';

/** Número de pontos do perfil: um a cada 0,1 km, no mínimo 20 e no máximo 1.500. */
export function pontosDoPerfil(distancia: number): number {
  const desejado = Math.round(distancia / ESPACAMENTO_DO_PERFIL_KM) + 1;
  return Math.min(PONTOS_MAXIMOS_DO_PERFIL, Math.max(PONTOS_MINIMOS_DO_PERFIL, desejado));
}

/**
 * Perfil do terreno de `a` até `b`, com pontos igualmente espaçados no círculo máximo.
 * O primeiro ponto é `a` e o último é `b`.
 *
 * Decisão para pontos coincidentes: a distância é 0, o perfil sai com o mínimo de 20 pontos,
 * todos com `dKm = 0` e a altitude do ponto. As contas tratam distância zero sem NaN (ver `propagacao.ts`).
 */
export function montarPerfil(a: Coordenada, b: Coordenada, altitudeEm: AltitudeEm): Perfil {
  const total = distanciaKm(a, b);
  const n = pontosDoPerfil(total);
  const perfil: Perfil = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ponto = i === 0 ? a : i === n - 1 ? b : pontoNoCaminho(a, b, t);
    perfil.push({ dKm: total * t, altM: altitudeEm(ponto) });
  }
  return perfil;
}
