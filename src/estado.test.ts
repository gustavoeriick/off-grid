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

// Achados da revisão das fases 2 a 5: referências órfãs, escolha do quadro, histórico e estimativas pela data.
describe('projeto: quadros, histórico e data', () => {
  const quat: [number, number, number, number] = [0, 0, 0, 1];
  const naParede = (superficie: string, x = 0) => ({ pos: [x, 1.3, 0] as [number, number, number], quat, superficie, giro: 0 });

  beforeEach(() => {
    acoes.novoProjeto();
    recalcularAgora();
  });

  it('apagar a parede que tem um quadro solta os cabos que passavam por ele', () => {
    const quadro = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-interna-terreo'));
    const cabo = estado.projeto.cabos[0]!.uid;
    acoes.instalarProtecao(cabo, 'prot-dps-cc-600');
    expect(estado.projeto.cabos.find((c) => c.uid === cabo)!.quadro).toBe(quadro);
    acoes.removerParede('terreo');
    expect(estado.projeto.dispositivos.some((d) => d.uid === quadro)).toBe(false);
    expect(estado.projeto.cabos.find((c) => c.uid === cabo)!.quadro).toBeNull();
    recalcularAgora();
    expect(estado.derivados.sugestoes.some((s) => s.regra === 'sem-quadro')).toBe(true);
  });

  it('uma peça nova que recebe o identificador de um quadro apagado não herda os cabos dele', () => {
    const a = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo'));
    const cabo = estado.projeto.cabos[0]!.uid;
    acoes.instalarProtecao(cabo, 'prot-dps-cc-600');
    acoes.removerDispositivo(a);
    acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo'));
    expect(estado.projeto.cabos.find((c) => c.uid === cabo)!.quadro).toBeNull();
  });

  it('proteção que não cabe no quadro do cabo não leva o cabo inteiro para um quadro sem lugar', () => {
    const q1 = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo', 0));
    const q2 = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo', 50));
    const [c1, c2] = [estado.projeto.cabos[0]!.uid, estado.projeto.cabos[1]!.uid];
    // Enche o segundo quadro com 3 DPS (6 dos 8 módulos) em outro cabo.
    const cabo2 = estado.projeto.cabos.find((c) => c.uid === c2)!;
    cabo2.quadro = q2;
    cabo2.protecoes = ['prot-dps-cc-600', 'prot-dps-cc-600', 'prot-dps-cc-600'];
    // O primeiro cabo recebe DPS até o quadro dele encher: 4 × 2 módulos = 8.
    for (let i = 0; i < 4; i += 1) acoes.instalarProtecao(c1, 'prot-dps-cc-600');
    const cabo1 = (): (typeof estado.projeto.cabos)[number] => estado.projeto.cabos.find((c) => c.uid === c1)!;
    expect(cabo1().quadro).toBe(q1);
    // A quinta não cabe no q1; o cabo inteiro (10 módulos) também não cabe no q2, que tem 2 livres: fica onde está.
    acoes.instalarProtecao(c1, 'prot-dps-cc-600');
    expect(cabo1().quadro).toBe(q1);
    recalcularAgora();
    expect(estado.derivados.sugestoes.some((s) => s.regra === 'quadro-cheio')).toBe(true);
  });

  it('trocar o modelo só vale dentro do mesmo tipo de equipamento', () => {
    const quadro = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo'));
    expect(acoes.trocarModelo(quadro, 'acc-haste')).toBe(false);
    expect(estado.projeto.dispositivos.find((d) => d.uid === quadro)!.itemId).toBe('acc-quadro-8');
  });

  it('desfazer e refazer devolvem o projeto; cancelar um arraste não apaga o refazer', () => {
    const antes = JSON.stringify(estado.projeto);
    const quadro = acoes.adicionarDispositivo('acc-quadro-8', naParede('parede-quartinho-fundo'));
    const depois = JSON.stringify(estado.projeto);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    // Um arraste começado e cancelado no meio do caminho.
    acoes.marcarHistorico();
    acoes.alterarCasa({ beiral: 1 }, { historico: false });
    acoes.cancelarArraste();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    acoes.refazer();
    expect(JSON.stringify(estado.projeto)).toBe(depois);
    expect(estado.projeto.dispositivos.some((d) => d.uid === quadro)).toBe(true);
  });

  it('comprimento de cabo só aceita número de verdade', () => {
    const cabo = estado.projeto.cabos[0]!;
    acoes.definirComprimentos(new Map([[cabo.uid, Number.NaN]]));
    expect(estado.projeto.cabos[0]!.comprimento).toBe(cabo.comprimento);
  });

  it('arquivo que não é um projeto é recusado sem trocar o que está na tela', () => {
    const antes = JSON.stringify(estado.projeto);
    expect(() => acoes.carregarProjeto({ versao: 2, nome: 'x' })).toThrow();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
  });

  it('abrir outro projeto zera a simulação', () => {
    acoes.definirTempo(VINTE_HORAS);
    acoes.alternarQuedaDeLuz();
    acoes.avancarTempo(600);
    expect(estado.simulacao.estadoSim.soc).toBeLessThan(1);
    acoes.carregarProjeto(JSON.parse(acoes.exportarProjeto()));
    expect(estado.simulacao.estadoSim.soc).toBe(1);
    expect(estado.simulacao.quedaDeLuz.ativa).toBe(false);
    expect(estado.simulacao.historico).toHaveLength(0);
  });

  it('as estimativas do dia acompanham a data', async () => {
    acoes.carregarProjeto(JSON.parse(JSON.stringify((await import('./nucleo/cenarios')).cenarioPlanoCorrigido())));
    acoes.definirTempo(Date.UTC(2026, 5, 21, 15));
    recalcularAgora();
    const junho = estado.derivados.estimativas.geracaoDiaKwh;
    acoes.definirTempo(Date.UTC(2026, 11, 21, 15));
    // O recálculo é agendado: espera mais que os 150 ms.
    await new Promise((r) => setTimeout(r, 250));
    const dezembro = estado.derivados.estimativas.geracaoDiaKwh;
    expect(dezembro).not.toBe(junho);
  });
});
