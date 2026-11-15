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
