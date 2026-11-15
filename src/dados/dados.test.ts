import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAIS } from '../nucleo/irradiancia';
import { CIDADES } from './cidades';
import { RESPOSTA_NASA_POWER, RESPOSTA_OPEN_METEO } from './exemplosDeResposta';
import { baixarLocal } from './nasaPower';
import { baixarClimaDoDia } from './openMeteo';

const RIO = { ...LOCAIS[0]!, lat: -22.91, lon: -43.17 };
const AGORA = Date.UTC(2026, 10, 14, 12);
const DIA_PASSADO = Date.UTC(2025, 11, 21, 15);

function simular(corpo: unknown, status = 200) {
  const f = vi.fn(async (_url: string) => new Response(JSON.stringify(corpo), { status }));
  vi.stubGlobal('fetch', f);
  return f;
}
const urlDe = (f: ReturnType<typeof simular>) => new URL(String(f.mock.calls[0]![0]));

afterEach(() => vi.unstubAllGlobals());

describe('baixarClimaDoDia', () => {
  it('dia passado: usa o arquivo com a própria data, só com latitude e longitude do local', async () => {
    const f = simular(RESPOSTA_OPEN_METEO);
    const r = await baixarClimaDoDia(RIO, DIA_PASSADO, AGORA);
    const u = urlDe(f);
    expect(u.origin + u.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect([...u.searchParams.keys()].sort()).toEqual(['end_date', 'hourly', 'latitude', 'longitude', 'start_date', 'timezone']);
    expect(u.searchParams.get('latitude')).toBe('-22.91');
    expect(u.searchParams.get('longitude')).toBe('-43.17');
    expect(u.searchParams.get('start_date')).toBe('2025-12-20');
    expect(u.searchParams.get('end_date')).toBe('2025-12-23');
    expect(u.searchParams.get('timezone')).toBe('GMT');
    expect(u.searchParams.get('hourly')).toBe('shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m');
    expect(r.dataDosDados).toBe('2025-12-21');
    expect(r.dados).toHaveLength(72);
    expect(r.dados[0]!.msUtc).toBe(Date.UTC(2025, 11, 20, 0));
    const i = RESPOSTA_OPEN_METEO.hourly.time.indexOf('2025-12-21T12:00');
    expect(r.dados[i]!.msUtc).toBe(Date.UTC(2025, 11, 21, 12));
    expect(r.dados[i]!.ghi).toBe(RESPOSTA_OPEN_METEO.hourly.shortwave_radiation[i]);
    expect(r.dados[i]!.tAmb).toBe(RESPOSTA_OPEN_METEO.hourly.temperature_2m[i]);
  });

  it('dia futuro: usa o mesmo dia do ano anterior e desloca para o dia pedido', async () => {
    const f = simular(RESPOSTA_OPEN_METEO);
    const r = await baixarClimaDoDia(RIO, Date.UTC(2026, 11, 21, 15), AGORA);
    expect(urlDe(f).searchParams.get('start_date')).toBe('2025-12-20');
    expect(r.dataDosDados).toBe('2025-12-21');
    expect(r.dados[0]!.msUtc).toBe(Date.UTC(2026, 11, 20, 0));
  });

  it('dia recente demais (há 3 dias): usa o ano anterior', async () => {
    // Mesma série de exemplo, recuada 40 dias (de dezembro para novembro de 2025).
    const h = RESPOSTA_OPEN_METEO.hourly;
    const recuado = h.time.map((t) => new Date(Date.parse(`${t}Z`) - 40 * 86400000).toISOString().slice(0, 16));
    const f = simular({ hourly: { ...h, time: recuado } });
    const r = await baixarClimaDoDia(RIO, Date.UTC(2026, 10, 11, 15), AGORA);
    expect(urlDe(f).searchParams.get('start_date')).toBe('2025-11-10');
    expect(r.dataDosDados).toBe('2025-11-11');
  });
});

describe('baixarClimaDoDia, erros', () => {
  it('falha de rede vira erro em português', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(baixarClimaDoDia(RIO, DIA_PASSADO, AGORA)).rejects.toThrow(/Open-Meteo/);
  });
  it('status de erro vira erro com o motivo', async () => {
    simular({ error: true, reason: 'Data fora do intervalo' }, 400);
    await expect(baixarClimaDoDia(RIO, DIA_PASSADO, AGORA)).rejects.toThrow(/400.*Data fora do intervalo/);
  });
  it('resposta sem séries é recusada', async () => {
    simular({ hourly: {} });
    await expect(baixarClimaDoDia(RIO, DIA_PASSADO, AGORA)).rejects.toThrow(/inesperada/);
  });
  it('valor nulo no meio da série é recusado, sem dados parciais', async () => {
    const h = RESPOSTA_OPEN_METEO.hourly;
    const ghi: (number | null)[] = [...h.shortwave_radiation];
    ghi[30] = null;
    simular({ hourly: { ...h, shortwave_radiation: ghi } });
    await expect(baixarClimaDoDia(RIO, DIA_PASSADO, AGORA)).rejects.toThrow(/incompleta/);
  });
  it('dados que não cobrem o dia são recusados', async () => {
    const h = RESPOSTA_OPEN_METEO.hourly;
    simular({ hourly: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, (v as unknown[]).slice(0, 30)])) });
    await expect(baixarClimaDoDia(RIO, DIA_PASSADO, AGORA)).rejects.toThrow(/cobrem/);
  });
});

describe('baixarLocal', () => {
  it('monta as 12 médias de GHI e de temperatura', async () => {
    const f = simular(RESPOSTA_NASA_POWER);
    const l = await baixarLocal('Rio de Janeiro', -22.91, -43.17, -3);
    const u = urlDe(f);
    expect(u.origin + u.pathname).toBe('https://power.larc.nasa.gov/api/temporal/climatology/point');
    expect(u.searchParams.get('latitude')).toBe('-22.91');
    expect(u.searchParams.get('longitude')).toBe('-43.17');
    expect(l.id).toBe('local--22.91--43.17');
    expect([l.nome, l.lat, l.lon, l.fuso]).toEqual(['Rio de Janeiro', -22.91, -43.17, -3]);
    expect(l.ghiMensal).toHaveLength(12);
    expect(l.tempMensal).toHaveLength(12);
    expect(l.ghiMensal[0]).toBe(5.7818);
    expect(l.ghiMensal[11]).toBe(5.5603);
    expect(l.tempMensal[6]).toBe(20.95);
  });
  it('erro de status e dado faltando viram erro', async () => {
    simular({}, 500);
    await expect(baixarLocal('X', 0, 0, -3)).rejects.toThrow(/500/);
    const p = structuredClone(RESPOSTA_NASA_POWER) as { properties: { parameter: { T2M: Record<string, number> } } };
    p.properties.parameter.T2M.MAR = -999;
    simular(p);
    await expect(baixarLocal('X', 0, 0, -3)).rejects.toThrow(/T2M em MAR/);
  });
});

describe('CIDADES', () => {
  it('tem 27 capitais, sem repetição, com fusos esperados', () => {
    expect(CIDADES).toHaveLength(27);
    expect(new Set(CIDADES.map((c) => c.nome)).size).toBe(27);
    const fuso = (uf: string) => CIDADES.find((c) => c.uf === uf)!.fuso;
    for (const uf of ['AM', 'RO', 'RR', 'MS', 'MT']) expect(fuso(uf)).toBe(-4);
    expect(fuso('AC')).toBe(-5);
    expect(fuso('RJ')).toBe(-3);
  });
});
