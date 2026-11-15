// Clima real de um dia, baixado do Open-Meteo. Só latitude e longitude do local vão na requisição.
//
// Convenção de hora (a mesma de src/nucleo/climaReal.ts): o carimbo é o FIM da hora; a radiação
// é a média da hora anterior ao carimbo e a temperatura é o valor no carimbo. Com `timezone=GMT`,
// os carimbos já são UTC.

import type { AmostraClima } from '../nucleo/climaReal';
import type { Local } from '../nucleo/tipos';

const URL_ARQUIVO = 'https://archive-api.open-meteo.com/v1/archive';
const DIA_MS = 86400000;
/** O arquivo do Open-Meteo só tem dias com mais de 5 dias de idade. */
const ATRASO_ARQUIVO_DIAS = 5;
const VARIAVEIS = 'shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m';

export interface ClimaBaixado {
  /** Série horária já deslocada para o dia pedido (em múltiplos de dias inteiros). */
  dados: AmostraClima[];
  /** Data local (AAAA-MM-DD) de onde os dados realmente vieram. Difere do dia pedido quando ele é futuro ou recente demais. */
  dataDosDados: string;
  fonte: string;
}

const dois = (n: number) => String(n).padStart(2, '0');
const isoData = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function meiaNoiteLocal(fuso: number, ms: number): number {
  const d = new Date(ms + fuso * 3600000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - fuso * 3600000;
}

/**
 * O arquivo serve o dia se todas as datas que a requisição pede (até o dia seguinte ao dia,
 * em UTC) já passaram há mais de 5 dias.
 */
function arquivoServe(m0: number, agoraMs: number): boolean {
  const ultimaData = isoData(m0 + 2 * DIA_MS);
  return ultimaData < isoData(agoraMs - ATRASO_ARQUIVO_DIAS * DIA_MS);
}

function numero(v: unknown, quando: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Resposta do Open-Meteo incompleta: falta valor em ${quando}.`);
  }
  return v;
}

/** Converte a resposta do Open-Meteo em amostras. Lança erro em qualquer dado faltando. */
export function converterRespostaOpenMeteo(resposta: unknown): AmostraClima[] {
  const r = resposta as { error?: unknown; reason?: unknown; hourly?: Record<string, unknown> } | null;
  if (!r || typeof r !== 'object') throw new Error('Resposta do Open-Meteo inesperada.');
  if (r.error) {
    throw new Error(`O Open-Meteo recusou o pedido: ${typeof r.reason === 'string' ? r.reason : 'motivo desconhecido'}.`);
  }
  const h = r.hourly;
  const tempos = h?.time;
  const campos = ['shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation', 'temperature_2m'].map((c) => h?.[c]);
  if (!Array.isArray(tempos) || tempos.length === 0 || campos.some((c) => !Array.isArray(c) || c.length !== tempos.length)) {
    throw new Error('Resposta do Open-Meteo inesperada: faltam as séries horárias.');
  }
  const [ghi, dni, dhi, temp] = campos as unknown[][];
  return tempos.map((t, i) => {
    const ms = typeof t === 'string' ? Date.parse(`${t}Z`) : NaN;
    if (!Number.isFinite(ms)) throw new Error('Resposta do Open-Meteo inesperada: horário ilegível.');
    return {
      msUtc: ms,
      ghi: numero(ghi![i], String(t)),
      dni: numero(dni![i], String(t)),
      dhi: numero(dhi![i], String(t)),
      tAmb: numero(temp![i], String(t)),
    };
  });
}

/**
 * Baixa o clima real do dia local de `msUtc` (mais o dia anterior e o seguinte, para interpolar nas bordas).
 * Se o dia é futuro ou recente demais, usa a mesma data do ano mais recente que o arquivo já tem
 * e desloca os carimbos para o dia pedido; `dataDosDados` diz de que data vieram.
 */
export async function baixarClimaDoDia(local: Local, msUtc: number, agoraMs: number = Date.now()): Promise<ClimaBaixado> {
  const m0 = meiaNoiteLocal(local.fuso, msUtc);
  const dia = new Date(m0 + local.fuso * 3600000);
  const ano0 = dia.getUTCFullYear();
  const mes = dia.getUTCMonth();
  const d = dia.getUTCDate();

  let m0Dados = m0;
  if (!arquivoServe(m0, agoraMs)) {
    let achou = false;
    for (let ano = ano0 - 1; ano >= ano0 - 15; ano--) {
      const cand = new Date(Date.UTC(ano, mes, d));
      if (cand.getUTCMonth() !== mes) continue; // 29 de fevereiro em ano comum
      const m = cand.getTime() - local.fuso * 3600000;
      if (arquivoServe(m, agoraMs)) {
        m0Dados = m;
        achou = true;
        break;
      }
    }
    if (!achou) throw new Error('Não encontrei um ano anterior com dados para essa data.');
  }

  const url =
    `${URL_ARQUIVO}?latitude=${local.lat}&longitude=${local.lon}` +
    `&start_date=${isoData(m0Dados - DIA_MS)}&end_date=${isoData(m0Dados + 2 * DIA_MS)}` +
    `&hourly=${VARIAVEIS}&timezone=GMT`;

  let resposta: Response;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error('Não consegui falar com o Open-Meteo. Confira a internet e tente de novo.');
  }
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }
  if (!resposta.ok) {
    const motivo = (corpo as { reason?: unknown } | null)?.reason;
    throw new Error(`O Open-Meteo respondeu com erro ${resposta.status}${typeof motivo === 'string' ? `: ${motivo}` : ''}.`);
  }
  const amostras = converterRespostaOpenMeteo(corpo);

  const desloc = m0 - m0Dados;
  const dados = amostras.map((a) => ({ ...a, msUtc: a.msUtc + desloc }));
  // O dia inteiro precisa estar coberto, do meio da primeira hora ao meio da última.
  const primeiro = Math.min(...dados.map((a) => a.msUtc));
  const ultimo = Math.max(...dados.map((a) => a.msUtc));
  if (primeiro - 1800000 > m0 || ultimo - 1800000 < m0 + DIA_MS) {
    throw new Error('O Open-Meteo devolveu dados que não cobrem o dia inteiro.');
  }
  const dl = new Date(m0Dados + local.fuso * 3600000);
  return {
    dados,
    dataDosDados: `${dl.getUTCFullYear()}-${dois(dl.getUTCMonth() + 1)}-${dois(dl.getUTCDate())}`,
    fonte: 'Open-Meteo (reanálise ERA5)',
  };
}
