// Ajudas só dos testes do núcleo de rádio.
import { expect } from 'vitest';
import { MODOS } from './constantes';
import type { Ambiente, Perfil, Radio } from './tipos';

/** Confere um valor com a tolerância da especificação: 0,01 na unidade da linha. */
export function perto(valor: number, esperado: number, tolerancia = 0.01): void {
  expect(Math.abs(valor - esperado), `${valor} deveria estar a ${tolerancia} de ${esperado}`).toBeLessThanOrEqual(
    tolerancia,
  );
}

/** Perfil feito à mão: terreno ao nível do mar, um ponto a cada 0,1 km, com picos `{ dKm: altura }`. */
export function perfilDeTeste(totalKm: number, picos: Record<number, number> = {}): Perfil {
  const n = Math.round(totalKm / 0.1) + 1;
  const perfil: Perfil = [];
  for (let i = 0; i < n; i++) {
    const dKm = Math.round(i * 0.1 * 10) / 10;
    perfil.push({ dKm: i === n - 1 ? totalKm : dKm, altM: picos[dKm] ?? 0 });
  }
  return perfil;
}

export function modoDeTeste(id = 'long-fast') {
  const m = MODOS.find((x) => x.id === id);
  if (!m) throw new Error(`modo ${id} não existe`);
  return m;
}

export function ambienteDeTeste(mhz = 915, margem = 0, modo = 'long-fast'): Ambiente {
  return { frequenciaMHz: mhz, modo: modoDeTeste(modo), margemDoAmbienteDb: margem };
}

export function radioDeTeste(extra: Partial<Radio> = {}): Radio {
  return { alturaDaAntenaM: 8, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0, ...extra };
}

/** Perfil de pontos coincidentes, como `montarPerfil` devolve: 20 pontos, todos com dKm 0. */
export function perfilDeDistanciaZero(): Perfil {
  return Array.from({ length: 20 }, () => ({ dKm: 0, altM: 0 }));
}
