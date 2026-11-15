// Irradiação solar. Especificação: docs/especificacao/nucleo.md, seção 2. Tarefa 1.3.

import type { Catalogo } from '../catalogo/tipos';
import { climaRealDe } from './climaReal';
import { direcaoSol, posicaoSol } from './sol';
import type { AmbientePlacas, Clima, CondicaoPlaca, Irradiancia, Local, Projeto, Vec3 } from './tipos';

const RAD = Math.PI / 180;

/** Locais disponíveis. Começa só com o Rio de Janeiro. */
export const LOCAIS: Local[] = [
  {
    id: 'rio',
    nome: 'Rio de Janeiro',
    lat: -22.9,
    lon: -43.2,
    fuso: -3,
    // kWh/m²/dia, climatologia da NASA POWER
    ghiMensal: [5.78, 5.97, 5.14, 4.52, 3.68, 3.46, 3.64, 4.26, 4.57, 5.0, 5.05, 5.56],
    // °C, climatologia da NASA POWER
    tempMensal: [25.7, 25.8, 25.4, 24.3, 22.3, 21.5, 21.0, 21.3, 22.0, 22.9, 23.4, 24.7],
  },
];

export function localPorId(id: string): Local | undefined {
  return LOCAIS.find((l) => l.id === id);
}

/** Local do projeto: o personalizado, se o `id` dele é o `localId`; senão o de `LOCAIS`. */
export function localDoProjeto(projeto: Pick<Projeto, 'localId' | 'localPersonalizado'>): Local | undefined {
  const p = projeto.localPersonalizado;
  if (p && p.id === projeto.localId) return p;
  return localPorId(projeto.localId);
}

// ---------------------------------------------------------------- Data local

/** Instante deslocado pelo fuso: os campos UTC do resultado são a data e a hora locais. */
function relogioLocal(local: Local, ms: number): Date {
  return new Date(ms + local.fuso * 3600000);
}

function meiaNoiteLocal(local: Local, ms: number): number {
  const d = relogioLocal(local, ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - local.fuso * 3600000;
}

function diaDoAno(local: Local, ms: number): number {
  const d = relogioLocal(local, ms);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

// ---------------------------------------------------------------- Céu

/** Haurwitz: GHI de céu limpo, em W/m². */
function ghiCeuLimpo(elevacao: number): number {
  if (elevacao <= 0) return 0;
  const s = Math.sin(elevacao * RAD);
  return 1098 * s * Math.exp(-0.057 / s);
}

function extraterrestreHorizontal(dia: number, elevacao: number): number {
  if (elevacao <= 0) return 0;
  return 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * dia) / 365)) * Math.sin(elevacao * RAD);
}

const cacheEnergiaClara = new Map<string, number>();

/** Wh/m² de céu limpo no dia local do instante, em passos de 5 minutos avaliados no meio do passo. */
function energiaClaraDoDia(local: Local, ms: number): number {
  const m0 = meiaNoiteLocal(local, ms);
  const chave = `${local.id}|${m0}`;
  let wh = cacheEnergiaClara.get(chave);
  if (wh === undefined) {
    wh = 0;
    for (let i = 0; i < 288; i++) {
      wh += ghiCeuLimpo(posicaoSol(m0 + (i + 0.5) * 300000, local.lat, local.lon).elevacao) / 12;
    }
    cacheEnergiaClara.set(chave, wh);
  }
  return wh;
}

function fatorClima(local: Local, ms: number, clima: Clima): number {
  if (clima === 'limpo') return 1;
  if (clima === 'nublado') return 0.35;
  if (clima === 'chuvoso') return 0.15;
  const mes = relogioLocal(local, ms).getUTCMonth();
  return Math.min(1.05, ((local.ghiMensal[mes] ?? 0) * 1000) / energiaClaraDoDia(local, ms));
}

/** Fração difusa de Erbs. */
function erbs(kt: number): number {
  if (kt <= 0.22) return 1 - 0.09 * kt;
  if (kt <= 0.8) return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  return 0.165;
}

/** Irradiâncias horizontal, direta e difusa, temperatura ambiente e posição do sol em um instante. */
export function irradiancia(local: Local, msUtc: number, clima: Clima): Irradiancia {
  const { azimute, elevacao } = posicaoSol(msUtc, local.lat, local.lon);
  if (clima === 'real') {
    const real = climaRealDe(local.id, msUtc);
    if (real) {
      if (elevacao <= 0) return { ghi: 0, dni: 0, dhi: 0, tAmb: real.tAmb, azimute, elevacao };
      return { ghi: real.ghi, dni: real.dni, dhi: real.dhi, tAmb: real.tAmb, azimute, elevacao };
    }
    clima = 'tipico';
  }
  const h = relogioLocal(local, msUtc);
  const hora = h.getUTCHours() + h.getUTCMinutes() / 60;
  const tAmb = (local.tempMensal[h.getUTCMonth()] ?? 0) + 4 * Math.cos((2 * Math.PI * (hora - 15)) / 24);
  const ghi = fatorClima(local, msUtc, clima) * ghiCeuLimpo(elevacao);
  if (ghi <= 0) return { ghi: 0, dni: 0, dhi: 0, tAmb, azimute, elevacao };
  const g0h = extraterrestreHorizontal(diaDoAno(local, msUtc), elevacao);
  const kt = g0h < 1 ? 0 : Math.min(1, ghi / g0h);
  let dhi = erbs(kt) * ghi;
  let dni = 0;
  if (elevacao > 3) dni = Math.min(1100, (ghi - dhi) / Math.sin(elevacao * RAD));
  else dhi = ghi;
  return { ghi, dni, dhi, tAmb, azimute, elevacao };
}

/** Irradiância no plano de uma placa, em W/m², descontando sombra e céu tapado. */
export function irradianciaNoPlano(irr: Irradiancia, sol: Vec3, normal: Vec3, fSombra = 0, fCeuTapado = 0): number {
  if (irr.ghi <= 0) return 0;
  const cosInc = Math.max(0, sol[0] * normal[0] + sol[1] * normal[1] + sol[2] * normal[2]);
  const iam = cosInc > 0 ? Math.max(0, 1 - 0.05 * (1 / Math.max(cosInc, 0.05) - 1)) : 0;
  const direta = irr.dni * cosInc * iam * (1 - fSombra);
  const difusa = (irr.dhi * (1 + normal[1])) / 2 * (1 - fCeuTapado);
  const refletida = (irr.ghi * 0.2 * (1 - normal[1])) / 2;
  return direta + difusa + refletida;
}

/** Condição de cada placa do projeto em um instante. */
export function irradianciaNasPlacas(
  projeto: Projeto,
  catalogo: Catalogo,
  local: Local,
  msUtc: number,
  ambiente: AmbientePlacas,
): Map<string, CondicaoPlaca> {
  const irr = irradiancia(local, msUtc, projeto.clima);
  const sol = direcaoSol(irr.azimute, irr.elevacao);
  const resultado = new Map<string, CondicaoPlaca>();
  for (const disp of projeto.dispositivos) {
    if (catalogo.get(disp.itemId)?.categoria !== 'placa') continue;
    const fSombra = irr.dni > 0 ? ambiente.sombra(disp.uid, sol) : 0;
    const g = irradianciaNoPlano(irr, sol, ambiente.normal(disp.uid), fSombra, ambiente.ceuTapado(disp.uid));
    resultado.set(disp.uid, { g, tAmb: irr.tAmb });
  }
  return resultado;
}

/** Ambiente em que todas as placas têm a mesma normal, sem sombra e sem céu tapado. */
export function ambienteSemSombra(normal: Vec3): AmbientePlacas {
  return {
    normal: () => normal,
    sombra: () => 0,
    ceuTapado: () => 0,
  };
}
