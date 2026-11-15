// Propagação: ar livre, curva da Terra, zona de Fresnel e difração de Bullington.
// Especificação: seções 4.3 a 4.5. Distâncias em km, alturas em m, frequência em MHz.
import { FRACAO_DE_FRESNEL, RAIO_EFETIVO_KM, VELOCIDADE_DA_LUZ_MS } from './constantes';
import type { Difracao, Geometria, Perfil, PontoDaGeometria } from './tipos';

/** Comprimento de onda, em metros. */
export function comprimentoDeOndaM(mhz: number): number {
  return VELOCIDADE_DA_LUZ_MS / (mhz * 1e6);
}

/**
 * Perda no ar livre, em dB: `32,45 + 20·log(MHz) + 20·log(km)`.
 * Decisão: distância zero (ou negativa) não tem perda definida; devolve 0 em vez de -Infinity.
 */
export function perdaNoArLivreDb(km: number, mhz: number): number {
  if (km <= 0) return 0;
  return 32.45 + 20 * Math.log10(mhz) + 20 * Math.log10(km);
}

/** Quanto a curva da Terra levanta o terreno a `d1Km` de uma ponta e `d2Km` da outra, em metros. */
export function curvaDaTerraM(d1Km: number, d2Km: number): number {
  return ((d1Km * d2Km) / (2 * RAIO_EFETIVO_KM)) * 1000;
}

/**
 * Raio da primeira zona de Fresnel, em metros: `17,32·√(d1·d2 / (GHz·d))`.
 * Nas pontas (d1 ou d2 zero) e com distância total zero, o raio é 0.
 */
export function raioDeFresnelM(d1Km: number, d2Km: number, mhz: number): number {
  const d = d1Km + d2Km;
  if (d <= 0 || d1Km <= 0 || d2Km <= 0) return 0;
  return 17.32 * Math.sqrt((d1Km * d2Km) / ((mhz / 1000) * d));
}

/** J(ν) da P.526: perda do obstáculo de gume de faca, em dB. Zero para ν ≤ −0,78. */
export function perdaPorObstaculoDb(nu: number): number {
  if (!(nu > -0.78)) return 0;
  const x = nu - 0.1;
  return 6.9 + 20 * Math.log10(Math.sqrt(x * x + 1) + x);
}

function validar(perfil: Perfil): void {
  if (perfil.length < 2) throw new Error('O perfil precisa de pelo menos dois pontos.');
}

/** Geometria do enlace: curva, linha, folga e Fresnel em cada ponto, zona livre e pior ponto (seção 4.3). */
export function geometriaDoEnlace(
  perfil: Perfil,
  alturaInicioM: number,
  alturaFimM: number,
  mhz: number,
): Geometria {
  validar(perfil);
  const n = perfil.length;
  const d = perfil[n - 1].dKm;
  const antenaInicioM = perfil[0].altM + alturaInicioM;
  const antenaFimM = perfil[n - 1].altM + alturaFimM;

  const pontos: PontoDaGeometria[] = perfil.map((p) => {
    const d1 = p.dKm;
    const d2 = d - p.dKm;
    const curvaM = curvaDaTerraM(d1, d2);
    const linhaM = d > 0 ? antenaInicioM + ((antenaFimM - antenaInicioM) * d1) / d : antenaInicioM;
    return {
      dKm: p.dKm,
      altM: p.altM,
      curvaM,
      linhaM,
      folgaM: linhaM - (p.altM + curvaM),
      raioDeFresnelM: raioDeFresnelM(d1, d2, mhz),
    };
  });

  let zonaLivre = true;
  let piorPonto: PontoDaGeometria | null = null;
  let piorMargem = Infinity;
  for (let i = 1; i < n - 1; i++) {
    const ponto = pontos[i];
    const margem = ponto.folgaM - FRACAO_DE_FRESNEL * ponto.raioDeFresnelM;
    if (margem < 0) zonaLivre = false;
    if (margem < piorMargem) {
      piorMargem = margem;
      piorPonto = ponto;
    }
  }

  return { pontos, distanciaKm: d, antenaInicioM, antenaFimM, zonaLivre, piorPonto };
}

/**
 * Perda por difração, método de Bullington (ITU-R P.526-16, § 4.5.1, eq. 49 a 57), sem a correção
 * de Terra esférica (tarefa L1.4). Perfil sem pontos do meio, ou de distância zero, dá perda 0.
 */
export function difracaoDeBullington(
  perfil: Perfil,
  alturaInicioM: number,
  alturaFimM: number,
  mhz: number,
): Difracao {
  validar(perfil);
  const n = perfil.length;
  const d = perfil[n - 1].dKm;
  const hts = perfil[0].altM + alturaInicioM;
  const hrs = perfil[n - 1].altM + alturaFimM;
  const lambda = comprimentoDeOndaM(mhz);
  const ce = 1 / RAIO_EFETIVO_KM;

  // Só os pontos do meio, com di entre 0 e d (de fora ficam pontos repetidos ou sem distância).
  const meio = perfil
    .slice(1, n - 1)
    .filter((p) => p.dKm > 0 && p.dKm < d)
    .map((p) => ({ di: p.dKm, alto: p.altM + 500 * ce * p.dKm * (d - p.dKm) }));
  if (d <= 0 || meio.length === 0) return { visada: true, lucDb: 0, perdaDb: 0, terraLisaDb: 0 };

  let stim = -Infinity;
  for (const p of meio) stim = Math.max(stim, (p.alto - hts) / p.di);
  const str = (hrs - hts) / d;

  const visada = stim < str;
  let luc: number;
  if (visada) {
    let nuMax = -Infinity;
    for (const p of meio) {
      const linha = (hts * (d - p.di) + hrs * p.di) / d;
      nuMax = Math.max(nuMax, (p.alto - linha) * Math.sqrt((0.002 * d) / (lambda * p.di * (d - p.di))));
    }
    luc = perdaPorObstaculoDb(nuMax);
  } else {
    let srim = -Infinity;
    for (const p of meio) srim = Math.max(srim, (p.alto - hrs) / (d - p.di));
    const db = (hrs - hts + srim * d) / (stim + srim);
    const linha = (hts * (d - db) + hrs * db) / d;
    const nuB = (hts + stim * db - linha) * Math.sqrt((0.002 * d) / (lambda * db * (d - db)));
    luc = perdaPorObstaculoDb(nuB);
  }
  const perdaDb = luc + (1 - Math.exp(-luc / 6)) * (10 + 0.02 * d);
  return { visada, lucDb: luc, perdaDb, terraLisaDb: 0 };
}
