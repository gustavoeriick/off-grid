// Médias mensais de uma cidade, baixadas da climatologia da NASA POWER.
// Só latitude e longitude vão na requisição.

import type { Local } from '../nucleo/tipos';

const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function doze(parametros: Record<string, Record<string, unknown>>, nome: string): number[] {
  const p = parametros[nome];
  return MESES.map((m) => {
    const v = p?.[m];
    // A NASA marca dado faltando com -999.
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= -900) {
      throw new Error(`Resposta da NASA POWER incompleta: falta ${nome} em ${m}.`);
    }
    return v;
  });
}

/** Monta um `Local` com as 12 médias mensais de GHI (kWh/m²/dia) e de temperatura (°C). */
export async function baixarLocal(nome: string, lat: number, lon: number, fuso: number): Promise<Local> {
  const url =
    'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE' +
    `&longitude=${lon}&latitude=${lat}&format=JSON`;
  let resposta: Response;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error('Não consegui falar com a NASA POWER. Confira a internet e tente de novo.');
  }
  let corpo: { properties?: { parameter?: Record<string, Record<string, unknown>> } } | null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }
  if (!resposta.ok) throw new Error(`A NASA POWER respondeu com erro ${resposta.status}.`);
  const parametros = corpo?.properties?.parameter;
  if (!parametros) throw new Error('Resposta da NASA POWER inesperada.');
  return {
    id: `local-${lat.toFixed(2)}-${lon.toFixed(2)}`,
    nome,
    lat,
    lon,
    fuso,
    ghiMensal: doze(parametros, 'ALLSKY_SFC_SW_DWN'),
    tempMensal: doze(parametros, 'T2M'),
  };
}
