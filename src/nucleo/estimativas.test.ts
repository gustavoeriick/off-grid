import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { analisarCircuito } from './circuito';
import { estimar } from './estimativas';
import { ambienteSemSombra } from './irradiancia';
import { normalDoPlano } from './sol';
import type { AmbientePlacas, Projeto } from './tipos';

const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
// Meio-dia local (UTC−3) de cada data.
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);
const MS_21_DEZ = Date.UTC(2026, 11, 21, 15);

function perto(real: number, esperado: number, tol?: number) {
  const t = tol ?? Math.max(Math.abs(esperado) * 0.005, 0.01);
  expect(Math.abs(real - esperado), `${real} vs ${esperado}`).toBeLessThanOrEqual(t);
}

function estimarProjeto(projeto: Projeto, ambiente: AmbientePlacas, ms: number) {
  return estimar(projeto, CATALOGO, analisarCircuito(projeto, CATALOGO), ambiente, ms);
}

describe('estimar com o ambiente sem sombra', () => {
  it.each([
    ['Plano no papel, 21/06', cenarioPlanoNoPapel, MS_21_JUN, 0, 8.85, 4.08],
    ['Plano corrigido, 21/06', cenarioPlanoCorrigido, MS_21_JUN, 3.91, 8.85, 4.08],
    ['Plano corrigido, 21/12', cenarioPlanoCorrigido, MS_21_DEZ, 5.23, 8.85, 4.08],
  ])('%s', (_nome, cenario, ms, geracao, consumo, autonomia) => {
    const e = estimarProjeto(cenario(), AMBIENTE, ms);
    perto(e.geracaoDiaKwh, geracao, Math.max(geracao * 0.02, 0.001));
    perto(e.consumoDiaKwh, consumo);
    perto(e.autonomiaHoras as number, autonomia);
    for (const [uid, perda] of e.perdaSombra) expect(perda, uid).toBe(0);
  });

  it('o consumo sobe para 10,91 kWh com o PC de trabalho o dia inteiro', () => {
    const projeto = cenarioPlanoCorrigido();
    const pc = projeto.dispositivos.find((d) => d.uid === 'ap-pc-trabalho')!;
    pc.uso = { inicio: 0, fim: 24 };
    perto(estimarProjeto(projeto, AMBIENTE, MS_21_JUN).consumoDiaKwh, 10.91);
  });

  it('aparelho desligado sai do consumo e da autonomia', () => {
    const base = estimarProjeto(cenarioPlanoCorrigido(), AMBIENTE, MS_21_JUN);
    const projeto = cenarioPlanoCorrigido();
    projeto.dispositivos.find((d) => d.uid === 'ap-tv')!.ligado = false;
    const e = estimarProjeto(projeto, AMBIENTE, MS_21_JUN);
    expect(e.consumoDiaKwh).toBeLessThan(base.consumoDiaKwh);
    expect(e.autonomiaHoras as number).toBeGreaterThan(base.autonomiaHoras as number);
  });

  it('sem carga ligada não há autonomia', () => {
    const projeto = cenarioPlanoCorrigido();
    for (const d of projeto.dispositivos) if (d.uid.startsWith('ap-')) d.ligado = false;
    expect(estimarProjeto(projeto, AMBIENTE, MS_21_JUN).autonomiaHoras).toBeNull();
  });

  it('sem bateria não há autonomia', () => {
    const projeto = cenarioPlanoCorrigido();
    projeto.dispositivos = projeto.dispositivos.filter((d) => d.uid !== 'bateria1');
    projeto.cabos = projeto.cabos.filter((c) => c.de.disp !== 'bateria1');
    expect(estimarProjeto(projeto, AMBIENTE, MS_21_JUN).autonomiaHoras).toBeNull();
  });

  it('sem bateria a geração aparece, com a tensão de carga do inversor (24 × 1,17 = 28,08 V)', () => {
    // Com a bateria de 24 V a tensão de carga também é 28,08 V: a geração é a mesma do "plano corrigido", 3,91 kWh.
    const projeto = cenarioPlanoCorrigido();
    projeto.dispositivos = projeto.dispositivos.filter((d) => d.uid !== 'bateria1');
    projeto.cabos = projeto.cabos.filter((c) => c.de.disp !== 'bateria1');
    const e = estimarProjeto(projeto, AMBIENTE, MS_21_JUN);
    perto(e.geracaoDiaKwh, 3.91, 3.91 * 0.02);
    perto(e.geracaoDiaKwh, estimarProjeto(cenarioPlanoCorrigido(), AMBIENTE, MS_21_JUN).geracaoDiaKwh, 1e-9);
  });

  it('projeto vazio estima zero', () => {
    const projeto = cenarioPlanoCorrigido();
    projeto.dispositivos = [];
    projeto.cabos = [];
    const e = estimarProjeto(projeto, AMBIENTE, MS_21_JUN);
    expect(e).toEqual({ geracaoDiaKwh: 0, consumoDiaKwh: 0, autonomiaHoras: null, perdaSombra: new Map() });
  });
});

describe('perdaSombra', () => {
  // Sombra total na placa1 quando o sol está a oeste (x < 0): a tarde inteira.
  const ambiente: AmbientePlacas = {
    normal: () => normalDoPlano(17, 0),
    sombra: (uid, sol) => (uid === 'placa1' && sol[0] < 0 ? 1 : 0),
    ceuTapado: () => 0,
  };

  it('só a placa tapada perde, entre 0 e 1', () => {
    const e = estimarProjeto(cenarioPlanoCorrigido(), ambiente, MS_21_DEZ);
    const perda = e.perdaSombra.get('placa1') as number;
    expect(perda).toBeGreaterThan(0.1);
    expect(perda).toBeLessThan(0.9);
    expect(e.perdaSombra.get('placa2')).toBe(0);
  });

  it('a geração do arranjo cai com a sombra', () => {
    const livre = estimarProjeto(cenarioPlanoCorrigido(), AMBIENTE, MS_21_DEZ);
    const sombreado = estimarProjeto(cenarioPlanoCorrigido(), ambiente, MS_21_DEZ);
    expect(sombreado.geracaoDiaKwh).toBeLessThan(livre.geracaoDiaKwh);
  });

  it('o céu tapado também conta', () => {
    const tapado: AmbientePlacas = { ...AMBIENTE, ceuTapado: () => 0.5 };
    const e = estimarProjeto(cenarioPlanoCorrigido(), tapado, MS_21_DEZ);
    expect(e.perdaSombra.get('placa1') as number).toBeGreaterThan(0);
  });
});
