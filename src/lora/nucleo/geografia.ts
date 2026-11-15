// Geografia sobre a esfera de raio médio. Especificação: seção 4.1.
import { RAIO_MEDIO_DA_TERRA_KM } from './constantes';
import type { Coordenada } from './tipos';

const PARA_RAD = Math.PI / 180;
const PARA_GRAUS = 180 / Math.PI;

/** Ângulo central entre dois pontos, em radianos (haversine). */
function anguloCentral(a: Coordenada, b: Coordenada): number {
  const dLat = (b.lat - a.lat) * PARA_RAD;
  const dLon = (b.lon - a.lon) * PARA_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * PARA_RAD) * Math.cos(b.lat * PARA_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distância entre dois pontos, em km, pela fórmula do haversine com o raio médio. Pontos iguais dão 0. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  return anguloCentral(a, b) * RAIO_MEDIO_DA_TERRA_KM;
}

/**
 * Ponto a uma fração `t` (0 a 1) do círculo máximo entre `a` e `b`.
 * Pontos coincidentes (ou opostos na Terra, onde o caminho não é único) devolvem `a`.
 */
export function pontoNoCaminho(a: Coordenada, b: Coordenada, t: number): Coordenada {
  const delta = anguloCentral(a, b);
  const seno = Math.sin(delta);
  if (delta < 1e-12 || Math.abs(seno) < 1e-12) return { lat: a.lat, lon: a.lon };
  const fa = Math.sin((1 - t) * delta) / seno;
  const fb = Math.sin(t * delta) / seno;
  const lat1 = a.lat * PARA_RAD;
  const lon1 = a.lon * PARA_RAD;
  const lat2 = b.lat * PARA_RAD;
  const lon2 = b.lon * PARA_RAD;
  const x = fa * Math.cos(lat1) * Math.cos(lon1) + fb * Math.cos(lat2) * Math.cos(lon2);
  const y = fa * Math.cos(lat1) * Math.sin(lon1) + fb * Math.cos(lat2) * Math.sin(lon2);
  const z = fa * Math.sin(lat1) + fb * Math.sin(lat2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) * PARA_GRAUS, lon: Math.atan2(y, x) * PARA_GRAUS };
}

/** Rumo inicial de `a` para `b`, de 0 a 360 graus a partir do norte. Pontos iguais dão 0. */
export function rumoGraus(a: Coordenada, b: Coordenada): number {
  const lat1 = a.lat * PARA_RAD;
  const lat2 = b.lat * PARA_RAD;
  const dLon = (b.lon - a.lon) * PARA_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  if (x === 0 && y === 0) return 0;
  return (Math.atan2(y, x) * PARA_GRAUS + 360) % 360;
}
