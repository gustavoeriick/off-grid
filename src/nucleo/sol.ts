// Posição do sol. Especificação: docs/especificacao/nucleo.md, seção 1. Tarefa 1.3.

import type { PosicaoSol, Vec3 } from './tipos';

const RAD = Math.PI / 180;

/** Azimute e elevação do sol, em graus, pelo algoritmo da NOAA. Latitude negativa no sul, longitude negativa a oeste. */
export function posicaoSol(msUtc: number, lat: number, lon: number): PosicaoSol {
  const jd = msUtc / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  const d = new Date(msUtc);
  const minUtc = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const tst = (((minUtc + eot + 4 * lon) % 1440) + 1440) % 1440; // tempo solar verdadeiro, em minutos
  const ha = tst / 4 - 180; // ângulo horário, em graus
  const cosZen =
    Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen))) / RAD;
  let arg =
    (Math.sin(lat * RAD) * Math.cos(zen * RAD) - Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.sin(zen * RAD));
  arg = Math.max(-1, Math.min(1, arg));
  const azimute = ha > 0 ? (Math.acos(arg) / RAD + 180) % 360 : (540 - Math.acos(arg) / RAD) % 360;
  return { azimute, elevacao: 90 - zen };
}

/** Vetor unitário que aponta da cena para o sol (X leste, Y cima, Z sul). */
export function direcaoSol(azimute: number, elevacao: number): Vec3 {
  return [
    Math.sin(azimute * RAD) * Math.cos(elevacao * RAD),
    Math.sin(elevacao * RAD),
    -Math.cos(azimute * RAD) * Math.cos(elevacao * RAD),
  ];
}

/** Normal de um plano com a inclinação dada, em graus, voltado para o azimute dado. */
export function normalDoPlano(inclinacao: number, azimute: number): Vec3 {
  return [
    Math.sin(inclinacao * RAD) * Math.sin(azimute * RAD),
    Math.cos(inclinacao * RAD),
    -Math.sin(inclinacao * RAD) * Math.cos(azimute * RAD),
  ];
}
