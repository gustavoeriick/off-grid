// Testes do laço de simulação do estado (tarefa 3.2).
// Esperados: docs/especificacao/casos-de-teste.md (autonomia do cenário do plano) e a seção 11 da especificação da cena.

import { beforeEach, describe, expect, it } from 'vitest';
import { acoes, estado, horaLocalDe, recalcularAgora } from './estado';

/** 21/06/2026 às 20:00 no Rio (UTC − 3). */
const VINTE_HORAS = Date.UTC(2026, 5, 21, 23, 0, 0);

describe('simulação no tempo', () => {
  beforeEach(() => {
    acoes.novoProjeto();
    recalcularAgora();
    if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
    acoes.recarregarBateria();
    acoes.definirTempo(VINTE_HORAS);
  });

  it('hora local no fuso do Rio', () => {
    expect(horaLocalDe(estado.projeto, VINTE_HORAS)).toBeCloseTo(20, 6);
  });

  it('com a rede ligada, a bateria fica cheia e a origem é a rede', () => {
    acoes.avancarTempo(120);
    expect(estado.simulacao.estadoSim.soc).toBeCloseTo(1, 3);
    expect(estado.simulacao.saida.origem).toBe('rede');
    expect(estado.tempo.msUtc).toBe(VINTE_HORAS + 120 * 60_000);
  });

  it('queda de luz às 20 h: a bateria esvazia por volta das 3 h e o horário fica registrado', () => {
    acoes.alternarQuedaDeLuz();
    expect(estado.simulacao.quedaDeLuz.inicioMsUtc).toBe(VINTE_HORAS);
    // Avança em pedaços irregulares, como o relógio da tela faz.
    for (let i = 0; i < 200; i += 1) acoes.avancarTempo(3.7);
    const apagou = estado.simulacao.quedaDeLuz.apagouMsUtc;
    expect(apagou).not.toBeNull();
    const horas = (apagou! - VINTE_HORAS) / 3_600_000;
    // Especificação: com os horários de uso, a bateria esvazia perto das 03:10 (7,2 h depois).
    expect(horas).toBeGreaterThan(6.9);
    expect(horas).toBeLessThan(7.5);
    expect(estado.simulacao.estadoSim.cortado).toBe(true);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
  });

  it('com o tempo parado e a bateria cheia, os mostradores têm números de verdade', () => {
    acoes.definirTempo(Date.UTC(2026, 5, 21, 15, 0, 0));
    const s = estado.simulacao.saida;
    for (const v of [s.pvW, s.bateriaW, s.redeW, s.cargaAtendidaW, s.estado.soc]) expect(Number.isFinite(v)).toBe(true);
    expect(s.estado.soc).toBe(1);
  });

  it('o histórico guarda um ponto a cada 10 minutos simulados', () => {
    acoes.alternarQuedaDeLuz();
    acoes.avancarTempo(60);
    const h = estado.simulacao.historico;
    expect(h.length).toBeGreaterThanOrEqual(5);
    expect(h.length).toBeLessThanOrEqual(7);
    expect(h[h.length - 1]!.soc).toBeLessThan(1);
    expect(h.every((p) => p.semRede)).toBe(true);
  });

  it('saltar no tempo não gasta bateria; bateria cheia religa o inversor', () => {
    acoes.alternarQuedaDeLuz();
    acoes.avancarTempo(60);
    const soc = estado.simulacao.estadoSim.soc;
    acoes.definirTempo(VINTE_HORAS + 5 * 3_600_000);
    expect(estado.simulacao.estadoSim.soc).toBe(soc);
    acoes.recarregarBateria();
    expect(estado.simulacao.estadoSim.soc).toBe(1);
    expect(estado.simulacao.estadoSim.cortado).toBe(false);
  });
});
