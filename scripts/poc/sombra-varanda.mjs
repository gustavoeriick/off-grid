// Prova de conceito: quanto o 2º andar sombreia um painel no telhado da varanda do térreo,
// conforme o lado da casa em que a varanda fica. Dados horários reais do PVGIS (SARAH3) para o Rio.
// As medidas da casa abaixo são SUPOSIÇÕES para ilustrar; o simulador vai receber as medidas reais.

const LAT = -22.9, LON = -43.2;         // coordenada genérica da cidade do Rio
const TILT = 17;                        // inclinação do telhado da varanda (≈30%, mínimo da telha colonial)
const YEARS = [2019, 2023];
const KWP = 0.55;                       // 1 painel de 550 W
const PR = 0.74;                        // mesma razão de desempenho que o PVGIS aplicou no PVcalc (perdas 14% + temperatura)

// Geometria suposta (metros), no referencial da fachada: a = ao longo da fachada, d = para fora, z = para cima
const HOUSE_W = 8, HOUSE_D = 8;         // casa 8 x 8
const VERANDA_TOP_Z = 3.1;              // onde o telhado da varanda encosta na parede
const EAVE_Z = 6.2;                     // altura do beiral do 2º andar
const EAVE_OVERHANG = 0.5;              // beiral avançando sobre a varanda
const PANEL_L = 2.279, PANEL_W = 1.134; // painel de 550 W em pé (lado maior acompanhando a caída do telhado)

const rad = Math.PI / 180;

function sunPos(ms, lat, lon) {
  const JD = ms / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eot = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad)
            + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
            - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const d = new Date(ms);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const tst = (((utcMin + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZen = Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen))) / rad;
  let acosArg = (Math.sin(lat * rad) * Math.cos(zen * rad) - Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.sin(zen * rad));
  acosArg = Math.max(-1, Math.min(1, acosArg));
  const az = ha > 0 ? (Math.acos(acosArg) / rad + 180) % 360 : (540 - Math.acos(acosArg) / rad) % 360;
  return { az, el: 90 - zen };          // azimute em graus a partir do norte, sentido horário
}

// Caixas que bloqueiam o sol, no referencial da fachada [a, d, z]
const BOXES = [
  { min: [-HOUSE_W / 2, -HOUSE_D, 0], max: [HOUSE_W / 2, 0, EAVE_Z] },                                   // corpo da casa
  { min: [-HOUSE_W / 2 - 0.5, 0, EAVE_Z - 0.2], max: [HOUSE_W / 2 + 0.5, EAVE_OVERHANG, EAVE_Z + 0.1] }, // beiral
];

function rayHitsBox(o, dir, box) {
  let tmin = 1e-6, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return false;
    } else {
      let t1 = (box.min[i] - o[i]) / dir[i], t2 = (box.max[i] - o[i]) / dir[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
const blocked = (o, dir) => BOXES.some(b => rayHitsBox(o, dir, b));

// Pontos de amostra no painel, para um painel cujo centro fica a `dCenter` metros da parede
function panelPoints(dCenter) {
  const pts = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
    const t = (i / 6 - 0.5) * PANEL_L, w = (j / 2 - 0.5) * PANEL_W;
    const d = dCenter + t * Math.cos(TILT * rad);
    pts.push([w, d, VERANDA_TOP_Z - d * Math.tan(TILT * rad) + 0.08]);
  }
  return pts;
}

// Fração do céu difuso (ponderada pelo cosseno) que a casa tapa, vista do painel
function skyBlockedFraction(pts) {
  const n = [0, Math.sin(TILT * rad), Math.cos(TILT * rad)];   // normal do painel no referencial da fachada
  const t1 = [1, 0, 0];
  const t2 = [0, Math.cos(TILT * rad), -Math.sin(TILT * rad)];
  let sky = 0, hit = 0;
  const N = 60;
  for (const p of pts) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u1 = (i + 0.5) / N, u2 = (j + 0.5) / N;
    const r = Math.sqrt(u1), phi = 2 * Math.PI * u2, zc = Math.sqrt(1 - u1);
    const dir = [0, 1, 2].map(k => r * Math.cos(phi) * t1[k] + r * Math.sin(phi) * t2[k] + zc * n[k]);
    if (dir[2] <= 0) continue;          // essa direção enxerga o chão, não o céu
    sky++;
    if (blocked(p, dir)) hit++;
  }
  return hit / sky;
}

async function fetchSeries(aspect) {
  const url = `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=${LAT}&lon=${LON}&startyear=${YEARS[0]}&endyear=${YEARS[1]}&angle=${TILT}&aspect=${aspect}&components=1&outputformat=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PVGIS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).outputs.hourly;
}

// Lado da casa em que a varanda fica. f = direção para fora da fachada em [leste, norte]. aspect = convenção do PVGIS (0=sul, 90=oeste, -90=leste, 180=norte)
const FACADES = [
  { nome: 'Norte', aspect: 180, f: [0, 1] },
  { nome: 'Leste', aspect: -90, f: [1, 0] },
  { nome: 'Oeste', aspect: 90, f: [-1, 0] },
  { nome: 'Sul', aspect: 0, f: [0, -1] },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const POSICOES = [
  { nome: 'meio do telhado (centro a 1,5 m da parede)', d: 1.5 },
  { nome: 'ponta do telhado (centro a 1,9 m da parede)', d: 1.9 },
];

let elCheck = { n: 0, sumAbs: 0, max: 0 };
const results = [];

for (const fac of FACADES) {
  const hourly = await fetchSeries(fac.aspect);
  const u = [fac.f[1], -fac.f[0]];      // direção ao longo da fachada
  for (const pos of POSICOES) {
    const pts = panelPoints(pos.d);
    const fSky = skyBlockedFraction([pts[1], pts[10], pts[19]]);
    const free = new Array(12).fill(0), shaded = new Array(12).fill(0);
    const days = new Set();
    for (const h of hourly) {
      const [dPart, tPart] = h.time.split(':');
      const ms = Date.UTC(+dPart.slice(0, 4), +dPart.slice(4, 6) - 1, +dPart.slice(6, 8), +tPart.slice(0, 2), +tPart.slice(2, 4));
      const local = new Date(ms - 3 * 3600000);   // Rio = UTC-3
      const m = local.getUTCMonth();
      days.add(local.toISOString().slice(0, 10));
      const gb = h['Gb(i)'], gd = h['Gd(i)'], gr = h['Gr(i)'];
      free[m] += (gb + gd + gr) * KWP * PR;
      let fb = 0;
      if (gb > 0) {
        const { az, el } = sunPos(ms, LAT, LON);
        if (fac.nome === 'Norte' && pos.d === 1.5 && h.H_sun > 5) {
          const diff = Math.abs(el - h.H_sun);
          elCheck.n++; elCheck.sumAbs += diff; elCheck.max = Math.max(elCheck.max, diff);
        }
        const s = [Math.sin(az * rad) * Math.cos(el * rad), Math.cos(az * rad) * Math.cos(el * rad), Math.sin(el * rad)]; // [leste, norte, cima]
        const dir = [s[0] * u[0] + s[1] * u[1], s[0] * fac.f[0] + s[1] * fac.f[1], s[2]];
        let hit = 0;
        for (const p of pts) if (blocked(p, dir)) hit++;
        fb = hit / pts.length;
      }
      shaded[m] += (gb * (1 - fb) + gd * (1 - fSky) + gr) * KWP * PR;
    }
    const daysPerMonth = new Array(12).fill(0);
    for (const d of days) daysPerMonth[+d.slice(5, 7) - 1]++;
    const freeDay = free.map((v, i) => v / 1000 / daysPerMonth[i]);
    const shadedDay = shaded.map((v, i) => v / 1000 / daysPerMonth[i]);
    const totalDays = daysPerMonth.reduce((a, b) => a + b, 0);
    results.push({
      lado: fac.nome, pos: pos.nome, fSky,
      livreAno: free.reduce((a, b) => a + b, 0) / 1000 / totalDays,
      sombraAno: shaded.reduce((a, b) => a + b, 0) / 1000 / totalDays,
      freeDay, shadedDay,
    });
  }
}

console.log(`Validação da posição do sol contra o PVGIS: erro médio ${(elCheck.sumAbs / elCheck.n).toFixed(2)}°, máximo ${elCheck.max.toFixed(2)}° em ${elCheck.n} horas\n`);
console.log('Energia média de 1 painel de 550 W (kWh/dia), Rio, telhado a 17°, média 2019-2023');
for (const r of results) {
  const perda = (1 - r.sombraAno / r.livreAno) * 100;
  console.log(`\n${r.lado} | ${r.pos} | céu difuso tapado: ${(r.fSky * 100).toFixed(0)}%`);
  console.log(`  sem a casa na frente: ${r.livreAno.toFixed(2)} kWh/dia | com a sombra do 2º andar: ${r.sombraAno.toFixed(2)} kWh/dia | perda ${perda.toFixed(0)}%`);
  console.log('  mês     : ' + MESES.map(m => m.padStart(5)).join(''));
  console.log('  livre   : ' + r.freeDay.map(v => v.toFixed(2).padStart(5)).join(''));
  console.log('  c/sombra: ' + r.shadedDay.map(v => v.toFixed(2).padStart(5)).join(''));
}
