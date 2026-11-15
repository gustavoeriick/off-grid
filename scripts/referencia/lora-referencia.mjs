// Recalcula os números esperados dos casos de teste do simulador de rádio LoRa.
// Implementação independente da de src/lora/nucleo, escrita a partir de docs/especificacao/lora.md.
// Uso: node scripts/referencia/lora-referencia.mjs

const R_TERRA_KM = 6371.0088; // raio médio da Terra
const K = 4 / 3; // fator de raio efetivo da atmosfera padrão
const RE_KM = K * R_TERRA_KM;
const C_M_S = 299_792_458;

const log10 = Math.log10;
const rad = (g) => (g * Math.PI) / 180;
const f = (n, casas = 2) => n.toFixed(casas).replace('.', ',');

const comprimentoDeOnda = (mhz) => C_M_S / (mhz * 1e6);
const fspl = (km, mhz) => 32.45 + 20 * log10(mhz) + 20 * log10(km);
const curva = (d1, d2) => ((d1 * d2) / (2 * RE_KM)) * 1000;
const fresnel = (d1, d2, mhz) => 17.32 * Math.sqrt((d1 * d2) / ((mhz / 1000) * (d1 + d2)));
const J = (v) => (v > -0.78 ? 6.9 + 20 * log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1) : 0);

function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRA_KM * Math.asin(Math.sqrt(h));
}

/** ITU-R P.526-16, § 4.5.1. `perfil`: [km desde o início, altitude do terreno em m]; pontas com a altitude da antena. */
function bullington(perfil, hts, hrs, mhz) {
  const d = perfil[perfil.length - 1][0];
  const lambda = comprimentoDeOnda(mhz);
  const ce = 1 / RE_KM;
  const meio = perfil.slice(1, -1);
  const alto = ([di, hi]) => hi + 500 * ce * di * (d - di);
  const stim = Math.max(...meio.map((p) => (alto(p) - hts) / p[0]));
  const str = (hrs - hts) / d;
  let luc;
  let visada;
  if (stim < str) {
    visada = true;
    const vmax = Math.max(...meio.map((p) => (alto(p) - (hts * (d - p[0]) + hrs * p[0]) / d) * Math.sqrt((0.002 * d) / (lambda * p[0] * (d - p[0])))));
    luc = J(vmax);
  } else {
    visada = false;
    const srim = Math.max(...meio.map((p) => (alto(p) - hrs) / (d - p[0])));
    const db = (hrs - hts + srim * d) / (stim + srim);
    const vb = (hts + stim * db - (hts * (d - db) + hrs * db) / d) * Math.sqrt((0.002 * d) / (lambda * db * (d - db)));
    luc = J(vb);
  }
  return { visada, luc, lb: luc + (1 - Math.exp(-luc / 6)) * (10 + 0.02 * d) };
}

/** ITU-R P.526-16, § 3.1.1.2: perda de difração na Terra esférica além do horizonte, com β = 1. `aKm` é o raio efetivo usado. */
function alemDoHorizonte(dKm, h1M, h2M, mhz, aKm) {
  const X = 2.188 * Math.cbrt(mhz) * aKm ** (-2 / 3) * dKm;
  const Y = (h) => 9.575e-3 * mhz ** (2 / 3) * aKm ** (-1 / 3) * h;
  const F = X >= 1.6 ? 11 + 10 * log10(X) - 17.6 * X : -20 * log10(X) - 5.6488 * X ** 1.425;
  const G = (y) => (y > 2 ? 17.6 * Math.sqrt(y - 1.1) - 5 * log10(y - 1.1) - 8 : 20 * log10(y + 0.1 * y ** 3));
  return -(F + G(Y(h1M)) + G(Y(h2M)));
}

/** ITU-R P.526-16, § 3.2: perda de difração na Terra esférica para qualquer distância. Alturas em m acima da superfície lisa. */
function terraEsferica(dKm, h1M, h2M, mhz) {
  const h1 = h1M / 1000;
  const h2 = h2M / 1000;
  const dlos = Math.sqrt(2 * RE_KM) * (Math.sqrt(h1) + Math.sqrt(h2));
  if (dKm >= dlos) return Math.max(0, alemDoHorizonte(dKm, h1M, h2M, mhz, RE_KM));
  const c = (h1 - h2) / (h1 + h2);
  const m = dKm ** 2 / (4 * RE_KM * (h1 + h2));
  const b = 2 * Math.sqrt((m + 1) / (3 * m)) * Math.cos(Math.PI / 3 + Math.acos((3 * c) / 2 * Math.sqrt((3 * m) / (m + 1) ** 3)) / 3);
  const d1 = (dKm / 2) * (1 + b);
  const d2 = dKm - d1;
  const h = ((h1 - d1 ** 2 / (2 * RE_KM)) * d2 + (h2 - d2 ** 2 / (2 * RE_KM)) * d1) / dKm;
  const hreq = 0.552 * Math.sqrt((d1 * d2 * (comprimentoDeOnda(mhz) / 1000)) / dKm);
  if (h > hreq) return 0;
  const aem = 0.5 * (dKm / (Math.sqrt(h1) + Math.sqrt(h2))) ** 2;
  const ah = alemDoHorizonte(dKm, h1M, h2M, mhz, aem);
  return ah < 0 ? 0 : (1 - h / hreq) * ah;
}

/**
 * ITU-R P.526-16, § 4.5.2: método completo. `terreno`: [km, altitude do terreno em m]; alturas das antenas acima do terreno.
 * Devolve a perda de Bullington do caminho (`lba`), a do caminho liso (`lbs`), a da Terra esférica (`lsph`) e a total.
 */
function difracaoCompleta(terreno, alturaTx, alturaRx, mhz) {
  const n = terreno.length;
  const d = terreno[n - 1][0];
  const hts = terreno[0][1] + alturaTx;
  const hrs = terreno[n - 1][1] + alturaRx;
  const lba = bullington(terreno, hts, hrs, mhz).lb;
  let v1 = 0;
  let v2 = 0;
  for (let i = 1; i < n; i++) {
    const [di, hi] = terreno[i];
    const [da, ha] = terreno[i - 1];
    v1 += (di - da) * (hi + ha);
    v2 += (di - da) * (hi * (2 * di + da) + ha * (di + 2 * da));
  }
  const hstip = (2 * v1 * d - v2) / d ** 2;
  const hsrip = (v2 - v1 * d) / d ** 2;
  const meio = terreno.slice(1, -1);
  const hobi = ([di, hi]) => hi - (hts * (d - di) + hrs * di) / d;
  const hobs = Math.max(...meio.map(hobi));
  const aobt = Math.max(...meio.map((p) => hobi(p) / p[0]));
  const aobr = Math.max(...meio.map((p) => hobi(p) / (d - p[0])));
  let hstp = hstip;
  let hsrp = hsrip;
  if (hobs > 0) {
    hstp = hstip - hobs * (aobt / (aobt + aobr));
    hsrp = hsrip - hobs * (aobr / (aobt + aobr));
  }
  const hst = Math.min(hstp, terreno[0][1]);
  const hsr = Math.min(hsrp, terreno[n - 1][1]);
  const htsL = hts - hst;
  const hrsL = hrs - hsr;
  const lbs = bullington(terreno.map(([di]) => [di, 0]), htsL, hrsL, mhz).lb;
  const lsph = terraEsferica(d, htsL, hrsL, mhz);
  return { lba, lbs, lsph, total: lba + Math.max(lsph - lbs, 0) };
}

/** Perfil com um ponto a cada `passo` km; `altitude(km)` dá o terreno. */
function perfil(dKm, passo, altitude) {
  const n = Math.round(dKm / passo);
  return Array.from({ length: n + 1 }, (_, i) => [(i * dKm) / n, altitude((i * dKm) / n)]);
}

console.log('## Perda no ar livre (dB)');
for (const [km, mhz] of [[20, 915], [40, 915], [20, 921.5], [1, 904.75]]) console.log(`${km} km, ${f(mhz)} MHz: ${f(fspl(km, mhz))}`);

console.log('\n## Distância (km)');
console.log(`(0; 0) a (0; 1): ${f(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 3)}`);
console.log(`(-10; -50) a (-10,2; -50,3): ${f(haversine({ lat: -10, lon: -50 }, { lat: -10.2, lon: -50.3 }), 3)}`);

console.log('\n## Curva da Terra e zona de Fresnel no meio do caminho (m)');
for (const km of [20, 40]) console.log(`${km} km: curva ${f(curva(km / 2, km / 2))}, Fresnel ${f(fresnel(km / 2, km / 2, 915))}, 60% ${f(0.6 * fresnel(km / 2, km / 2, 915))}`);
console.log(`a 5 km de um enlace de 20 km: curva ${f(curva(5, 15))}, Fresnel ${f(fresnel(5, 15, 915))}`);

console.log('\n## Perda por obstáculo J(ν) (dB)');
for (const v of [-1, -0.78, 0, 1, 2.4]) console.log(`ν = ${f(v)}: ${f(J(v))}`);

console.log('\n## Difração de Bullington, 915 MHz, terreno ao nível do mar, um ponto a cada 0,1 km');
const casos = [
  ['plano, 20 km, antenas a 8 m', perfil(20, 0.1, () => 0), 8, 8],
  ['plano, 20 km, antenas a 30 m', perfil(20, 0.1, () => 0), 30, 30],
  ['plano, 40 km, antenas a 8 m', perfil(40, 0.1, () => 0), 8, 8],
  ['plano, 40 km, antenas a 60 m', perfil(40, 0.1, () => 0), 60, 60],
  ['morro de 100 m no meio, 20 km, antenas a 10 m', perfil(20, 0.1, (x) => (Math.abs(x - 10) < 0.05 ? 100 : 0)), 10, 10],
  ['dois morros (80 m aos 5 km, 120 m aos 14 km), 20 km, antenas a 10 m', perfil(20, 0.1, (x) => (Math.abs(x - 5) < 0.05 ? 80 : Math.abs(x - 14) < 0.05 ? 120 : 0)), 10, 10],
  ['ponta a 300 m e ponta a 10 m, plano entre elas, 40 km', perfil(40, 0.1, () => 0), 300, 10],
];
for (const [nome, p, hts, hrs] of casos) {
  const r = bullington(p, hts, hrs, 915);
  console.log(`${nome}: ${r.visada ? 'com visada' : 'sem visada'}, Luc ${f(r.luc)}, perda ${f(r.lb)}`);
}

console.log('\n## Terra esférica (P.526 § 3.2), 915 MHz, alturas acima da superfície lisa');
for (const [km, h1, h2] of [[20, 8, 8], [20, 30, 30], [40, 8, 8], [40, 60, 60], [40, 300, 10], [80, 10, 10]]) console.log(`${km} km, antenas a ${h1} m e ${h2} m: ${f(terraEsferica(km, h1, h2, 915))}`);

console.log('\n## Método completo (P.526 § 4.5.2), 915 MHz: Bullington do caminho, do caminho liso, Terra esférica e total');
const completos = [
  ['plano ao nível do mar, 20 km, antenas a 8 m', perfil(20, 0.1, () => 0), 8, 8],
  ['plano ao nível do mar, 20 km, antenas a 30 m', perfil(20, 0.1, () => 0), 30, 30],
  ['plano ao nível do mar, 40 km, antenas a 8 m', perfil(40, 0.1, () => 0), 8, 8],
  ['plano ao nível do mar, 40 km, antenas a 60 m', perfil(40, 0.1, () => 0), 60, 60],
  ['planalto a 800 m, 20 km, antenas a 8 m', perfil(20, 0.1, () => 800), 8, 8],
  ['morro de 100 m no meio (um ponto só), 20 km, antenas a 10 m', perfil(20, 0.1, (x) => (Math.abs(x - 10) < 0.05 ? 100 : 0)), 10, 10],
  ['serra larga (300 m entre 8 e 12 km), 20 km, antenas a 10 m', perfil(20, 0.1, (x) => (x >= 8 && x <= 12 ? 300 : 0)), 10, 10],
  ['rampa de 0 a 400 m, 30 km, antenas a 6 m', perfil(30, 0.1, (x) => (400 * x) / 30), 6, 6],
  ['uma ponta no alto (terreno a 300 m no primeiro ponto, mar depois), 40 km, antenas a 6 m', perfil(40, 0.1, (x) => (x < 0.05 ? 300 : 0)), 6, 6],
];
for (const [nome, p, a1, a2] of completos) {
  const r = difracaoCompleta(p, a1, a2, 915);
  console.log(`${nome}: caminho ${f(r.lba)}, liso ${f(r.lbs)}, esférica ${f(r.lsph)}, total ${f(r.total)}`);
}

console.log('\n## Conta do enlace, modo Long Fast (orçamento de 153 dB com 22 dBm e 0 dBi)');
const sens = 22 - 153;
for (const [nome, km, extra] of [['20 km no ar livre', 20, 0], ['40 km no ar livre', 40, 0]]) {
  const prx = 22 + 0 + 0 - fspl(km, 915) - extra;
  console.log(`${nome}: chega ${f(prx)} dBm, sensibilidade ${f(sens)} dBm, folga ${f(prx - sens)} dB`);
}
{
  const r = bullington(casos[4][1], 10, 10, 915);
  const prx = 22 + 3 + 3 - 1 - fspl(20, 915) - r.lb;
  console.log(`morro de 100 m no meio, antenas de 3 dBi e 1 dB de cabo: chega ${f(prx)} dBm, folga ${f(prx - sens)} dB`);
}

console.log('\n## Limite de potência pela densidade espectral (Ato 14.448, 10.3.3: 8 dBm em 3 kHz), espectro plano');
for (const kHz of [125, 250, 500]) console.log(`${kHz} kHz: ${f(Math.min(30, 8 + 10 * log10(kHz / 3)))} dBm`);

console.log('\n## Relevo: blocos Terrarium');
const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;
console.log(`(128; 0; 0): ${f(terrarium(128, 0, 0))} m; (130; 110; 128): ${f(terrarium(130, 110, 128))} m; (127; 255; 0): ${f(terrarium(127, 255, 0))} m`);
const bloco = (lat, lon, z) => {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * n;
  return [x, y];
};
for (const [lat, lon] of [[0, 0], [-10, -50], [45, 90]]) {
  const [x, y] = bloco(lat, lon, 11);
  console.log(`(${lat}; ${lon}) no zoom 11: bloco ${Math.floor(x)}/${Math.floor(y)}, ponto ${f((x % 1) * 256, 1)}; ${f((y % 1) * 256, 1)}`);
}
console.log(`largura de um bloco do zoom 11 a 23° de latitude: ${f((40075.017 * Math.cos(rad(23))) / 2 ** 11, 1)} km`);
