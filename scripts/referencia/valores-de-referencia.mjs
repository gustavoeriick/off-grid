// Implementação mínima das fórmulas da especificação (docs/especificacao/).
// Serve para gerar e conferir os números esperados dos casos de teste.
// Não é usada pelo simulador. Rodar: node scripts/referencia/valores-de-referencia.mjs

const rad = Math.PI / 180;
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');

// ---------------------------------------------------------------- Sol (algoritmo da NOAA)

export function posicaoSol(msUtc, lat, lon) {
  const JD = msUtc / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * M * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eot = (4 / rad) * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad)
            + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
            - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const d = new Date(msUtc);
  const minUtc = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const tst = (((minUtc + eot + 4 * lon) % 1440) + 1440) % 1440;   // tempo solar verdadeiro, em minutos
  const ha = tst / 4 - 180;                                       // ângulo horário, em graus
  const cosZen = Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen))) / rad;
  let arg = (Math.sin(lat * rad) * Math.cos(zen * rad) - Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.sin(zen * rad));
  arg = Math.max(-1, Math.min(1, arg));
  const azimute = ha > 0 ? (Math.acos(arg) / rad + 180) % 360 : (540 - Math.acos(arg) / rad) % 360;
  return { azimute, elevacao: 90 - zen };
}

// Eixos do simulador: X = leste, Y = cima, Z = sul.
export const direcaoSol = (az, el) => [Math.sin(az * rad) * Math.cos(el * rad), Math.sin(el * rad), -Math.cos(az * rad) * Math.cos(el * rad)];
export const normalDoPlano = (inclinacao, azimute) => [Math.sin(inclinacao * rad) * Math.sin(azimute * rad), Math.cos(inclinacao * rad), -Math.sin(inclinacao * rad) * Math.cos(azimute * rad)];

// ---------------------------------------------------------------- Irradiação

export const RIO = {
  id: 'rio', nome: 'Rio de Janeiro', lat: -22.9, lon: -43.2, fuso: -3,
  ghiMensal: [5.78, 5.97, 5.14, 4.52, 3.68, 3.46, 3.64, 4.26, 4.57, 5.00, 5.05, 5.56],   // kWh/m²/dia, NASA POWER
  tempMensal: [25.7, 25.8, 25.4, 24.3, 22.3, 21.5, 21.0, 21.3, 22.0, 22.9, 23.4, 24.7],  // °C, NASA POWER
};

const horaLocal = (local, ms) => new Date(ms + local.fuso * 3600000);
const meiaNoiteLocal = (local, ms) => { const d = horaLocal(local, ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - local.fuso * 3600000; };
const diaDoAno = (local, ms) => { const d = horaLocal(local, ms); return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); };

export const ghiCeuLimpo = (el) => { if (el <= 0) return 0; const s = Math.sin(el * rad); return 1098 * s * Math.exp(-0.057 / s); };   // Haurwitz
export const extraterrestreHorizontal = (dia, el) => el > 0 ? 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * dia / 365)) * Math.sin(el * rad) : 0;

const cacheDia = new Map();
export function energiaClaraDoDia(local, ms) {            // Wh/m² de céu limpo no dia local, passo de 5 min
  const m0 = meiaNoiteLocal(local, ms), chave = local.id + m0;
  if (!cacheDia.has(chave)) {
    let wh = 0;
    for (let i = 0; i < 288; i++) wh += ghiCeuLimpo(posicaoSol(m0 + (i + 0.5) * 300000, local.lat, local.lon).elevacao) * (5 / 60);
    cacheDia.set(chave, wh);
  }
  return cacheDia.get(chave);
}

export function fatorClima(local, ms, clima) {
  if (clima === 'limpo') return 1;
  if (clima === 'nublado') return 0.35;
  if (clima === 'chuvoso') return 0.15;
  const mes = horaLocal(local, ms).getUTCMonth();
  return Math.min(1.05, local.ghiMensal[mes] * 1000 / energiaClaraDoDia(local, ms));
}

export function erbs(kt) {
  if (kt <= 0.22) return 1 - 0.09 * kt;
  if (kt <= 0.8) return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  return 0.165;
}

export function irradiancia(local, ms, clima) {
  const { azimute, elevacao } = posicaoSol(ms, local.lat, local.lon);
  const h = horaLocal(local, ms);
  const hora = h.getUTCHours() + h.getUTCMinutes() / 60;
  const tAmb = local.tempMensal[h.getUTCMonth()] + 4 * Math.cos(2 * Math.PI * (hora - 15) / 24);
  const ghi = fatorClima(local, ms, clima) * ghiCeuLimpo(elevacao);
  if (ghi <= 0) return { ghi: 0, dni: 0, dhi: 0, tAmb, azimute, elevacao };
  const g0h = extraterrestreHorizontal(diaDoAno(local, ms), elevacao);
  const kt = g0h < 1 ? 0 : Math.min(1, ghi / g0h);
  let dhi = erbs(kt) * ghi, dni = 0;
  if (elevacao > 3) dni = Math.min(1100, (ghi - dhi) / Math.sin(elevacao * rad)); else dhi = ghi;
  return { ghi, dni, dhi, tAmb, azimute, elevacao };
}

export function irradianciaNoPlano(irr, sol, normal, fSombra = 0, fCeuTapado = 0, albedo = 0.2) {
  if (irr.ghi <= 0) return 0;
  const cosInc = Math.max(0, sol[0] * normal[0] + sol[1] * normal[1] + sol[2] * normal[2]);
  const iam = cosInc > 0 ? Math.max(0, 1 - 0.05 * (1 / Math.max(cosInc, 0.05) - 1)) : 0;
  const cosIncl = normal[1];
  const direta = irr.dni * cosInc * iam * (1 - fSombra);
  const difusa = irr.dhi * (1 + cosIncl) / 2 * (1 - fCeuTapado);
  const refletida = irr.ghi * albedo * (1 - cosIncl) / 2;
  return direta + difusa + refletida;
}

// ---------------------------------------------------------------- Placa, controlador, bateria, inversor

export const CONST = {
  noct: 47, coefPmax: -0.0035, coefVmp: -0.0030, coefVoc: -0.0027, perdasPlaca: 0.07,
  rendimentoMppt: 0.97, fatorTensaoCarga: 1.17, tFrio: 10, tQuente: 70, rho: 0.019,
};

export function estadoPlaca(p, g, tAmb) {
  if (g < 20) return { p: 0, v: 0, i: 0, tCel: tAmb };
  const tCel = tAmb + (CONST.noct - 20) * g / 800;
  const pot = p.wp * (g / 1000) * (1 + CONST.coefPmax * (tCel - 25)) * (1 - CONST.perdasPlaca);
  const v = p.vmp * (1 + CONST.coefVmp * (tCel - 25));
  return { p: pot, v, i: pot / v, tCel };
}
export const vocFrio = (p, n = 1) => n * p.voc * (1 + CONST.coefVoc * (CONST.tFrio - 25));
export const vmpQuente = (p, n = 1) => n * p.vmp * (1 + CONST.coefVmp * (CONST.tQuente - 25));

// ---------------------------------------------------------------- Sombra (geometria da prova de conceito)

const CASA = { largura: 8, profundidade: 8, topoVaranda: 3.1, beiralAltura: 6.2, beiral: 0.5, inclinacao: 17, placaL: 2.279, placaW: 1.134 };
const CAIXAS = [
  { min: [-CASA.largura / 2, -CASA.profundidade, 0], max: [CASA.largura / 2, 0, CASA.beiralAltura] },
  { min: [-CASA.largura / 2 - 0.5, 0, CASA.beiralAltura - 0.2], max: [CASA.largura / 2 + 0.5, CASA.beiral, CASA.beiralAltura + 0.1] },
];
function raioAtinge(o, dir, cx) {
  let t0 = 1e-6, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) { if (o[i] < cx.min[i] || o[i] > cx.max[i]) return false; continue; }
    let a = (cx.min[i] - o[i]) / dir[i], b = (cx.max[i] - o[i]) / dir[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
const tapado = (o, dir) => CAIXAS.some(c => raioAtinge(o, dir, c));
function pontosDaPlaca(dCentro) {     // referencial da fachada: [ao longo, para fora, para cima]
  const pts = [], b = CASA.inclinacao * rad;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const t = (i / 4 - 0.5) * CASA.placaL * 0.9, w = (j / 2 - 0.5) * CASA.placaW * 0.9;
    const d = dCentro + t * Math.cos(b);
    pts.push([w, d, CASA.topoVaranda - d * Math.tan(b) + 0.08]);
  }
  return pts;
}
function ceuTapado(pts) {
  const b = CASA.inclinacao * rad, n = [0, Math.sin(b), Math.cos(b)], t1 = [1, 0, 0], t2 = [0, Math.cos(b), -Math.sin(b)];
  let ceu = 0, hit = 0;
  const N = 40;
  for (const p of pts) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u1 = (i + 0.5) / N, u2 = (j + 0.5) / N, r = Math.sqrt(u1), phi = 2 * Math.PI * u2, zc = Math.sqrt(1 - u1);
    const dir = [0, 1, 2].map(k => r * Math.cos(phi) * t1[k] + r * Math.sin(phi) * t2[k] + zc * n[k]);
    if (dir[2] <= 0) continue;
    ceu++; if (tapado(p, dir)) hit++;
  }
  return hit / ceu;
}

// Energia diária (kWh) de uma placa na varanda, com e sem a sombra da casa.
// azimuteFachada: para onde a varanda olha (0 = norte, 90 = leste, 180 = sul, 270 = oeste).
function diaNaVaranda(placa, local, msDia, clima, azimuteFachada, dCentro = 1.5) {
  const pts = pontosDaPlaca(dCentro), fCeu = ceuTapado([pts[1], pts[7], pts[13]]);
  const normal = normalDoPlano(CASA.inclinacao, azimuteFachada);
  const f = [Math.sin(azimuteFachada * rad), Math.cos(azimuteFachada * rad)];   // para fora, em [leste, norte]
  const u = [f[1], -f[0]];
  const m0 = meiaNoiteLocal(local, msDia);
  let livre = 0, comSombra = 0;
  for (let i = 0; i < 144; i++) {
    const ms = m0 + (i + 0.5) * 600000, irr = irradiancia(local, ms, clima);
    if (irr.ghi <= 0) continue;
    const sol = direcaoSol(irr.azimute, irr.elevacao);
    const enu = [sol[0], -sol[2], sol[1]];                                    // [leste, norte, cima]
    const dir = [enu[0] * u[0] + enu[1] * u[1], enu[0] * f[0] + enu[1] * f[1], enu[2]];
    const fSombra = pts.filter(p => tapado(p, dir)).length / pts.length;
    livre += estadoPlaca(placa, irradianciaNoPlano(irr, sol, normal), irr.tAmb).p / 6;
    comSombra += estadoPlaca(placa, irradianciaNoPlano(irr, sol, normal, fSombra, fCeu), irr.tAmb).p / 6;
  }
  return { livre: livre / 1000, comSombra: comSombra / 1000, fCeu };
}

// ---------------------------------------------------------------- Relatório

const RENEPV = { wp: 585, voc: 52.01, vmp: 43.83, isc: 14.2, imp: 13.35 };
const ms = (a, m, d, h = 0, min = 0) => Date.UTC(a, m - 1, d, h, min);

console.log('== 1. Posição do sol (graus) ==');
for (const [rot, t, lat, lon] of [
  ['Rio, 21/06/2026 12:00 local', ms(2026, 6, 21, 15), -22.9, -43.2],
  ['Rio, 21/06/2026 08:00 local', ms(2026, 6, 21, 11), -22.9, -43.2],
  ['Rio, 21/06/2026 16:00 local', ms(2026, 6, 21, 19), -22.9, -43.2],
  ['Rio, 21/12/2026 12:00 local', ms(2026, 12, 21, 15), -22.9, -43.2],
  ['Rio, 21/12/2026 07:00 local', ms(2026, 12, 21, 10), -22.9, -43.2],
  ['Rio, 20/03/2026 12:00 local', ms(2026, 3, 20, 15), -22.9, -43.2],
  ['Rio, 21/06/2026 00:00 local', ms(2026, 6, 21, 3), -22.9, -43.2],
  ['Fortaleza, 21/12/2026 12:00 local', ms(2026, 12, 21, 15), -3.73, -38.52],
  ['Porto Alegre, 21/06/2026 12:00 local', ms(2026, 6, 21, 15), -30.03, -51.23],
]) { const s = posicaoSol(t, lat, lon); console.log(`${rot.padEnd(38)} azimute ${fmt(s.azimute)}  elevação ${fmt(s.elevacao)}`); }

console.log('\n== 2. Irradiação no Rio, dia 15 de cada mês, clima típico ==');
const PVGIS_PLANO = [5.78, 6.24, 5.71, 5.19, 4.46, 4.20, 4.43, 4.76, 4.86, 4.90, 5.07, 5.52];   // kWh/m²/dia a 17° norte, PVGIS-SARAH3 2005-2023
const norte17 = normalDoPlano(17, 0);
console.log('mês  fator  GHI/dia  plano/dia  PVGIS  desvio   pico GHI  pico DNI');
let somaPlano = 0, somaPvgis = 0;
for (let m = 1; m <= 12; m++) {
  const m0 = meiaNoiteLocal(RIO, ms(2026, m, 15, 12));
  let ghi = 0, plano = 0, picoGhi = 0, picoDni = 0;
  for (let i = 0; i < 288; i++) {
    const t = m0 + (i + 0.5) * 300000, irr = irradiancia(RIO, t, 'tipico');
    ghi += irr.ghi / 12; plano += irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), norte17) / 12;
    picoGhi = Math.max(picoGhi, irr.ghi); picoDni = Math.max(picoDni, irr.dni);
  }
  somaPlano += plano; somaPvgis += PVGIS_PLANO[m - 1] * 1000;
  console.log(`${String(m).padStart(3)}  ${fmt(fatorClima(RIO, ms(2026, m, 15, 12), 'tipico'), 3)}  ${fmt(ghi / 1000)}     ${fmt(plano / 1000)}       ${fmt(PVGIS_PLANO[m - 1])}  ${(100 * (plano / 1000 / PVGIS_PLANO[m - 1] - 1)).toFixed(1).padStart(6)}%   ${fmt(picoGhi, 0).padStart(5)}     ${fmt(picoDni, 0).padStart(5)}`);
}
console.log(`ano: plano ${fmt(somaPlano / 12000)} contra PVGIS ${fmt(somaPvgis / 12000)} (${(100 * (somaPlano / somaPvgis - 1)).toFixed(1)}%)`);

console.log('\n== 3. Céu limpo ao meio-dia solar ==');
for (const [rot, t] of [['21/06', ms(2026, 6, 21, 14, 55)], ['21/12', ms(2026, 12, 21, 14, 51)]]) {
  const irr = irradiancia(RIO, t, 'limpo');
  console.log(`Rio ${rot}: elevação ${fmt(irr.elevacao)}  GHI ${fmt(irr.ghi, 0)}  DNI ${fmt(irr.dni, 0)}  DHI ${fmt(irr.dhi, 0)}  no plano 17° norte ${fmt(irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), norte17), 0)}  tAmb ${fmt(irr.tAmb, 1)}`);
}

console.log('\n== 4. Placa Renepv 585 W ==');
for (const [g, t] of [[1000, 25], [800, 20], [500, 30], [200, 25]]) {
  const e = estadoPlaca(RENEPV, g, t);
  console.log(`G ${g} W/m², ambiente ${t} °C: célula ${fmt(e.tCel, 1)} °C  P ${fmt(e.p, 1)} W  Vmp ${fmt(e.v)} V  Imp ${fmt(e.i)} A`);
}
console.log(`Voc a frio (10 °C): 1 placa ${fmt(vocFrio(RENEPV))} V, 2 em série ${fmt(vocFrio(RENEPV, 2))} V, 3 em série ${fmt(vocFrio(RENEPV, 3))} V`);
console.log(`Vmp a quente (70 °C): 1 placa ${fmt(vmpQuente(RENEPV))} V, 2 em série ${fmt(vmpQuente(RENEPV, 2))} V, 3 em série ${fmt(vmpQuente(RENEPV, 3))} V`);
{
  const e = estadoPlaca(RENEPV, 1000, 25), vCarga = 24 * CONST.fatorTensaoCarga;
  const mppt = e.p * CONST.rendimentoMppt, pwm = e.i * vCarga;
  console.log(`MPPT: ${fmt(mppt, 1)} W   PWM em bateria de 24 V (carga a ${fmt(vCarga)} V): ${fmt(pwm, 1)} W   perda do PWM: ${(100 * (1 - pwm / mppt)).toFixed(1)}%`);
}

console.log('\n== 5. Autonomia de 1 bateria LiFePO4 24 V 100 Ah no inversor Anenji ==');
{
  const wh = 100 * 24 * 1.0667, util = wh * 0.9, entregue = util * 0.975, rend = 0.92, vazio = 45;
  console.log(`capacidade ${fmt(wh, 0)} Wh, utilizável ${fmt(util, 0)} Wh, entregue ao inversor ${fmt(entregue, 0)} Wh`);
  for (const carga of [465, 300, 200, 110, 40]) {
    const pcc = carga / rend + vazio;
    console.log(`carga de ${carga} W em CA: ${fmt(pcc, 1)} W na bateria, ${fmt(pcc / (24 * 1.0667), 1)} A, autonomia ${fmt(entregue / pcc)} h`);
  }
  console.log(`corrente de projeto do inversor de 3000 W: ${fmt(3000 / (rend * 24 * 1.0667), 1)} A (lítio), ${fmt(3000 / (rend * 24), 1)} A (chumbo)`);
}

console.log('\n== 6. Queda de tensão nos cabos das placas (cobre, 0,019 ohm.mm²/m) ==');
for (const [rot, i, v, s, l] of [
  ['1 placa, 6 mm², 12 m + 12 m', 13.35, 43.83, 6, 24],
  ['2 em série, 6 mm², 12 m + 12 m', 13.35, 87.66, 6, 24],
  ['3 em paralelo, 6 mm², 12 m + 12 m', 40.05, 43.83, 6, 24],
  ['3 em paralelo, 10 mm², 12 m + 12 m', 40.05, 43.83, 10, 24],
  ['bateria, 35 mm², 1 m + 1 m, 127,4 A', 127.4, 25.6, 35, 2],
  ['geladeira, 2,5 mm², 15 m + 15 m, 150 W em 127 V', 150 / 127, 127, 2.5, 30],
]) { const dv = i * CONST.rho * l / s; console.log(`${rot.padEnd(50)} queda ${fmt(dv)} V = ${fmt(100 * dv / v)}%`); }

console.log('\n== 7. Sombra na varanda (geometria da prova de conceito), 1 placa Renepv 585 W, centro a 1,5 m da parede ==');
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
for (const clima of ['tipico', 'limpo']) {
  console.log(`clima: ${clima}`);
  for (const [lado, az] of [['Norte', 0], ['Leste', 90], ['Oeste', 270], ['Sul', 180]]) {
    let livre = 0, sombra = 0, fCeu = 0; const jun = {}, dez = {};
    for (let m = 1; m <= 12; m++) {
      const r = diaNaVaranda(RENEPV, RIO, ms(2026, m, 15, 12), clima, az);
      livre += r.livre * DIAS_MES[m - 1]; sombra += r.comSombra * DIAS_MES[m - 1]; fCeu = r.fCeu;
      if (m === 6) Object.assign(jun, r); if (m === 12) Object.assign(dez, r);
    }
    console.log(`  ${lado.padEnd(6)} ano: livre ${fmt(livre / 365)}  com sombra ${fmt(sombra / 365)} kWh/dia  perda ${(100 * (1 - sombra / livre)).toFixed(1)}%   junho ${fmt(jun.comSombra)} (perda ${(100 * (1 - jun.comSombra / jun.livre)).toFixed(0)}%)   dezembro ${fmt(dez.comSombra)} (perda ${(100 * (1 - dez.comSombra / dez.livre)).toFixed(0)}%)   céu tapado ${(100 * fCeu).toFixed(0)}%`);
  }
}

console.log('\n== 8. Cenário "plano no papel" e "plano corrigido" ==');
{
  // Consumo de um dia típico: potência média x horas de uso por dia.
  const aparelhos = [['rede', 40, 24], ['pc 24 h', 70, 24], ['pc de trabalho', 135, 10], ['geladeira', 90, 24], ['ventilador', 50, 12], ['tv', 80, 5]];
  const caDia = aparelhos.reduce((s, [, w, h]) => s + w * h, 0) / 1000;
  const ccDia = caDia / 0.92 + 45 * 24 / 1000;
  console.log(`consumo do dia: ${fmt(caDia)} kWh em CA, ${fmt(ccDia)} kWh na bateria; tudo ligado ao mesmo tempo: ${aparelhos.reduce((s, [, w]) => s + w, 0)} W`);

  // Geração de 2 placas Renepv 585 W em série, 17° para o norte, sem sombra, na saída do MPPT.
  const geracao = (clima, mes) => {
    const m0 = meiaNoiteLocal(RIO, ms(2026, mes, 15, 12)); let wh = 0;
    for (let i = 0; i < 288; i++) {
      const irr = irradiancia(RIO, m0 + (i + 0.5) * 300000, clima);
      wh += 2 * estadoPlaca(RENEPV, irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), norte17), irr.tAmb).p * CONST.rendimentoMppt / 12;
    }
    return wh / 1000;
  };
  let ano = 0;
  for (let m = 1; m <= 12; m++) ano += geracao('tipico', m) * DIAS_MES[m - 1];
  console.log(`geração de 2 placas em série, clima típico: junho ${fmt(geracao('tipico', 6))}, dezembro ${fmt(geracao('tipico', 12))}, média do ano ${fmt(ano / 365)} kWh/dia`);
  console.log(`geração de 2 placas em série, céu limpo: junho ${fmt(geracao('limpo', 6))}, dezembro ${fmt(geracao('limpo', 12))} kWh/dia`);
  console.log(`cobertura do consumo pela geração média do ano: ${(100 * (ano / 365) / ccDia).toFixed(0)}%`);

  // Orçamento do cenário "plano no papel".
  const linhas = [
    ['placa Renepv 585 W', 1, 819.00], ['inversor Anenji 3 kW 24 V 127 V', 1, 2309.00], ['bateria Alfx 24 V 100 Ah', 1, 3750.00],
    ['cabo solar 6 mm² (m)', 24, 8.50], ['disjuntor CC 32 A', 1, 47.90],
    ['cabo de bateria 25 mm² cobre (m, valor típico)', 2, 55.00], ['fusível ANL 150 A com porta-fusível', 1, 35.78],
    ['cabo CA 2,5 mm² cobre, 3 condutores (m, valor típico)', 77, 6.60],
    ['kit de 8 ganchos para telha colonial', 1, 251.79], ['trilhos e grampos (por placa, valor típico)', 1, 150.00],
    ['kit de 10 pares MC4', 1, 58.68], ['haste de aterramento', 1, 44.97],
  ];
  let total = 0;
  for (const [nome, q, un] of linhas) { total += q * un; console.log(`  ${nome.padEnd(56)} ${String(q).padStart(3)} x ${fmt(un).padStart(8)} = ${fmt(q * un).padStart(9)}`); }
  console.log(`  total: R$ ${fmt(total)}`);
}

console.log('\n== 9. Passo de simulação, fileira com sombra e orçamento do plano corrigido ==');
{
  // Queda de luz à noite, 1 bateria Alfx, 465 W de carga, passos de 5 min.
  const wh = 2560.08, rd = 0.975, socMin = 0.10, pcc = 465 / 0.92 + 45, dt = 1 / 12;
  let soc = 1, passo = 0, cortou = 0, fracao = 1;
  const marcos = {};
  while (!cortou && passo < 200) {
    passo++;
    const precisa = pcc * dt, tem = Math.max(0, soc - socMin) * wh * rd;
    if (precisa <= tem) soc -= precisa / (wh * rd); else { fracao = tem / precisa; soc = socMin; cortou = passo; }
    if (passo === 12 || passo === 24 || passo === 48) marcos[passo] = soc;
  }
  console.log(`queda por passo de 5 min: ${(pcc * dt / (wh * rd)).toFixed(6)}; soc após 12 passos ${marcos[12].toFixed(4)}, 24 passos ${marcos[24].toFixed(4)}, 48 passos ${marcos[48].toFixed(4)}`);
  console.log(`bateria vazia no passo ${cortou} (${fmt(cortou * 5 / 60)} h), com ${(100 * fracao).toFixed(1)}% da carga atendida nesse passo`);

  // Rede ligada, prioridade rede, soc 0,5, sem sol.
  const vCarga = 24 * 1.17, pelaRede = Math.min(50 * vCarga, Math.min(80, 20) * vCarga);
  console.log(`carga pela rede: ${fmt(pelaRede, 1)} W; soc sobe ${(pelaRede * 0.975 * dt / wh).toFixed(6)} por passo; potência da rede ${fmt(465 + 45 + pelaRede, 1)} W`);

  // Fileira de 2 placas, uma com 1000 W/m² e outra com 200 W/m² (sombra), a 25 °C.
  const a = estadoPlaca(RENEPV, 1000, 25), b = estadoPlaca(RENEPV, 200, 25);
  console.log(`fileira com sombra: sem desvio ${fmt(b.i * (a.v + b.v), 1)} W; com desvio ${fmt(a.i * a.v, 1)} W em ${fmt(a.v)} V`);
  const c = estadoPlaca(RENEPV, 1000, 25);
  console.log(`fileira de 2 placas iguais a 1000 W/m²: ${fmt(2 * c.p, 1)} W em ${fmt(2 * c.v)} V e ${fmt(c.i)} A; na saída do MPPT ${fmt(2 * c.p * 0.97, 1)} W`);

  // Geração de 2 placas em série em datas fixas, clima típico, 17° para o norte, sem sombra, passo de 10 min.
  for (const [rot, t] of [['21/06/2026', ms(2026, 6, 21, 15)], ['21/12/2026', ms(2026, 12, 21, 15)]]) {
    const m0 = meiaNoiteLocal(RIO, t); let w = 0;
    for (let i = 0; i < 144; i++) {
      const irr = irradiancia(RIO, m0 + (i + 0.5) * 600000, 'tipico');
      w += 2 * estadoPlaca(RENEPV, irradianciaNoPlano(irr, direcaoSol(irr.azimute, irr.elevacao), norte17), irr.tAmb).p * 0.97 / 6;
    }
    console.log(`geração em ${rot}: ${fmt(w / 1000)} kWh (${(100 * w / 1000 / 8.85).toFixed(0)}% do consumo de 8,85 kWh)`);
  }
  console.log(`autonomia: 1 bateria ${fmt(2246.47 / (465 / 0.92 + 45))} h; 2 baterias ${fmt(2 * 2246.47 / (465 / 0.92 + 45))} h; sem o PC de trabalho ${fmt(2246.47 / (330 / 0.92 + 45))} h`);

  const linhas = [
    ['placa Renepv 585 W', 2, 819.00], ['inversor Anenji', 1, 2309.00], ['bateria Alfx', 1, 3750.00],
    ['cabo solar 6 mm² (m)', 25.5, 8.50], ['disjuntor CC 32 A', 1, 47.90], ['DPS CC 600 V', 1, 63.30],
    ['cabo de bateria 35 mm² (m)', 2, 76.49], ['fusível ANL 150 A', 1, 35.78],
    ['circuito CA 2,5 mm² (m)', 77, 6.60], ['disjuntor CA 16 A', 6, 18.00],
    ['kit de 8 ganchos', 1, 251.79], ['trilhos e grampos', 2, 150.00], ['kit MC4', 1, 58.68], ['haste', 1, 44.97],
  ];
  const total = linhas.reduce((s, [, q, u]) => s + q * u, 0);
  const tipico = 77 * 6.60 + 2 * 150;
  console.log(`orçamento do plano corrigido: R$ ${fmt(total)}, dos quais R$ ${fmt(tipico)} em valores típicos`);
  console.log(`orçamento do plano no papel: valores típicos R$ ${fmt(2 * 55 + 77 * 6.60 + 150)}`);
}
