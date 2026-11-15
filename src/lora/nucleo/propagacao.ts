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

/**
 * Perda além do horizonte, A(a), em dB (ITU-R P.526-16, § 3.1.1.2, eq. 21 a 25, com β = 1).
 * `dKm` e `raioKm` em km, alturas em METROS, frequência em MHz. Pode dar negativo (o chamador decide o piso).
 * Altura zero ou negativa não tem G(Y) definido: devolve 0 em vez de -Infinity.
 */
export function perdaAlemDoHorizonteDb(
  dKm: number,
  h1M: number,
  h2M: number,
  mhz: number,
  raioKm: number,
): number {
  if (!(dKm > 0) || !(h1M > 0) || !(h2M > 0) || !(raioKm > 0)) return 0;
  const x = 2.188 * Math.cbrt(mhz) * Math.pow(raioKm, -2 / 3) * dKm;
  const y = (h: number) => 9.575e-3 * Math.pow(mhz, 2 / 3) * Math.pow(raioKm, -1 / 3) * h;
  const fx = x >= 1.6 ? 11 + 10 * Math.log10(x) - 17.6 * x : -20 * Math.log10(x) - 5.6488 * Math.pow(x, 1.425);
  const gy = (v: number) => (v > 2 ? 17.6 * Math.sqrt(v - 1.1) - 5 * Math.log10(v - 1.1) - 8 : 20 * Math.log10(v + 0.1 * v * v * v));
  return -(fx + gy(y(h1M)) + gy(y(h2M)));
}

/**
 * Perda por difração da Terra esférica, em dB (ITU-R P.526-16, § 3.2). `h1M` e `h2M` são as alturas das
 * antenas acima da superfície lisa, em METROS (aqui dentro viram km, junto com a distância, o raio e λ).
 * Distância zero ou altura zero: 0.
 */
export function perdaDaTerraEsfericaDb(dKm: number, h1M: number, h2M: number, mhz: number): number {
  if (!(dKm > 0) || !(h1M > 0) || !(h2M > 0)) return 0;
  const ae = RAIO_EFETIVO_KM;
  const h1 = h1M / 1000;
  const h2 = h2M / 1000;
  const lambdaKm = comprimentoDeOndaM(mhz) / 1000;
  const dlos = Math.sqrt(2 * ae) * (Math.sqrt(h1) + Math.sqrt(h2));
  if (dKm >= dlos) return Math.max(0, perdaAlemDoHorizonteDb(dKm, h1M, h2M, mhz, ae));

  const c = (h1 - h2) / (h1 + h2);
  const m = (dKm * dKm) / (4 * ae * (h1 + h2));
  const arg = Math.max(-1, Math.min(1, ((3 * c) / 2) * Math.sqrt((3 * m) / Math.pow(m + 1, 3))));
  const b = 2 * Math.sqrt((m + 1) / (3 * m)) * Math.cos(Math.PI / 3 + Math.acos(arg) / 3);
  const d1 = (dKm / 2) * (1 + b);
  const d2 = dKm - d1;
  const h = ((h1 - (d1 * d1) / (2 * ae)) * d2 + (h2 - (d2 * d2) / (2 * ae)) * d1) / dKm;
  const hreq = 0.552 * Math.sqrt((d1 * d2 * lambdaKm) / dKm);
  if (h > hreq) return 0;
  const aem = 0.5 * Math.pow(dKm / (Math.sqrt(h1) + Math.sqrt(h2)), 2);
  const ah = perdaAlemDoHorizonteDb(dKm, h1M, h2M, mhz, aem);
  if (ah < 0) return 0;
  return (1 - h / hreq) * ah;
}

/** As parcelas do método completo de difração (§ 4.5.2), para a tela e para os testes conferirem uma a uma. */
export interface ParcelasDaDifracao {
  /** Bullington do perfil de verdade. */
  lbaDb: number;
  /** Bullington do caminho liso (alturas zero, antenas a h'ts e h'rs). */
  lbsDb: number;
  /** Terra esférica com h'ts e h'rs. */
  lsphDb: number;
  /** Altura efetiva da antena do começo acima da superfície lisa, em m (h'ts). */
  alturaLisaInicioM: number;
  /** Altura efetiva da antena do fim acima da superfície lisa, em m (h'rs). */
  alturaLisaFimM: number;
  /** Perda total: `lba + máx(lsph − lbs; 0)`. */
  perdaDb: number;
  /** A parcela `máx(lsph − lbs; 0)`. */
  terraLisaDb: number;
  /** A parte de Bullington do perfil de verdade. */
  bullington: Difracao;
}

/**
 * Método completo de difração (ITU-R P.526-16, § 4.5.2, eq. 58 a 66; especificação 4.5.1).
 * Perfil de dois pontos ou de distância zero: sem superfície a ajustar, a parcela de terra lisa é 0.
 */
export function parcelasDaDifracaoCompleta(
  perfil: Perfil,
  alturaInicioM: number,
  alturaFimM: number,
  mhz: number,
): ParcelasDaDifracao {
  const bullington = difracaoDeBullington(perfil, alturaInicioM, alturaFimM, mhz);
  const n = perfil.length;
  const d = perfil[n - 1].dKm;
  const h1 = perfil[0].altM;
  const hn = perfil[n - 1].altM;
  const hts = h1 + alturaInicioM;
  const hrs = hn + alturaFimM;
  const semTerraLisa: ParcelasDaDifracao = {
    lbaDb: bullington.perdaDb,
    lbsDb: 0,
    lsphDb: 0,
    alturaLisaInicioM: alturaInicioM,
    alturaLisaFimM: alturaFimM,
    perdaDb: bullington.perdaDb,
    terraLisaDb: 0,
    bullington,
  };
  if (!(d > 0)) return semTerraLisa;

  // Superfície lisa ajustada ao perfil.
  let v1 = 0;
  let v2 = 0;
  for (let i = 1; i < n; i++) {
    const di = perfil[i].dKm;
    const da = perfil[i - 1].dKm;
    const hi = perfil[i].altM;
    const ha = perfil[i - 1].altM;
    v1 += (di - da) * (hi + ha);
    v2 += (di - da) * (hi * (2 * di + da) + ha * (di + 2 * da));
  }
  const hstip = (2 * v1 * d - v2) / (d * d);
  const hsrip = (v2 - v1 * d) / (d * d);

  // Obstrução acima da reta entre as antenas (só pontos do meio, com di entre 0 e d).
  let hobs = -Infinity;
  let alfaT = -Infinity;
  let alfaR = -Infinity;
  for (const p of perfil.slice(1, n - 1)) {
    if (!(p.dKm > 0 && p.dKm < d)) continue;
    const hob = p.altM - (hts * (d - p.dKm) + hrs * p.dKm) / d;
    hobs = Math.max(hobs, hob);
    alfaT = Math.max(alfaT, hob / p.dKm);
    alfaR = Math.max(alfaR, hob / (d - p.dKm));
  }
  let hstp = hstip;
  let hsrp = hsrip;
  if (hobs > 0) {
    const soma = alfaT + alfaR;
    hstp = hstip - (hobs * alfaT) / soma;
    hsrp = hsrip - (hobs * alfaR) / soma;
  }
  const hst = Math.min(hstp, h1);
  const hsr = Math.min(hsrp, hn);
  const ats = hts - hst;
  const ars = hrs - hsr;
  if (!(ats > 0) || !(ars > 0) || !Number.isFinite(ats + ars)) return semTerraLisa;

  const plano = perfil.map((p) => ({ dKm: p.dKm, altM: 0 }));
  const lbs = difracaoDeBullington(plano, ats, ars, mhz).perdaDb;
  const lsph = perdaDaTerraEsfericaDb(d, ats, ars, mhz);
  const terraLisaDb = Math.max(lsph - lbs, 0);
  return {
    lbaDb: bullington.perdaDb,
    lbsDb: lbs,
    lsphDb: lsph,
    alturaLisaInicioM: ats,
    alturaLisaFimM: ars,
    perdaDb: bullington.perdaDb + terraLisaDb,
    terraLisaDb,
    bullington,
  };
}

/** Difração do método completo: Bullington do perfil de verdade mais a parcela do caminho liso. */
export function difracaoCompleta(
  perfil: Perfil,
  alturaInicioM: number,
  alturaFimM: number,
  mhz: number,
): Difracao {
  const p = parcelasDaDifracaoCompleta(perfil, alturaInicioM, alturaFimM, mhz);
  return { visada: p.bullington.visada, lucDb: p.bullington.lucDb, perdaDb: p.perdaDb, terraLisaDb: p.terraLisaDb };
}
