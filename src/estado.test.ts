// Testes do laço de simulação do estado (tarefa 3.2).
// Esperados: docs/especificacao/casos-de-teste.md (autonomia do cenário do plano) e a seção 11 da especificação da cena.

import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOGO } from './catalogo';
import { ROTEIRO_TUTORIAL } from './conteudo/roteiros';
import { acoes, assinar, emTutorial, estado, horaLocalDe, recalcularAgora } from './estado';

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

// Fase 7: o tutorial é um projeto à parte (docs/especificacao/tutorial.md).
describe('tutorial', () => {
  beforeEach(() => {
    if (emTutorial()) acoes.sairDoTutorial();
    acoes.novoProjeto();
    recalcularAgora();
  });

  it('entrar guarda a casa e abre só o quartinho; sair devolve a casa igual', () => {
    acoes.adicionarDispositivo('acc-quadro-8', { pos: [0, 1.3, 0], quat: [0, 0, 0, 1], superficie: 'parede-quartinho-fundo', giro: 0 });
    const casa = JSON.stringify(estado.projeto);
    acoes.entrarNoTutorial();
    expect(emTutorial()).toBe(true);
    expect(estado.projeto.dispositivos).toHaveLength(0);
    expect(estado.projeto.casa.varandas).toHaveLength(0);
    // Desfazer não atravessa a entrada no tutorial.
    acoes.desfazer();
    expect(emTutorial()).toBe(true);
    acoes.sairDoTutorial();
    expect(emTutorial()).toBe(false);
    expect(JSON.stringify(estado.projeto)).toBe(casa);
  });

  it('"Novo" dentro do tutorial recomeça o tutorial, e a casa continua guardada', () => {
    const casa = JSON.stringify(estado.projeto);
    acoes.entrarNoTutorial();
    acoes.adicionarDispositivo('bat-moura-12mn105', { pos: [0, 0.1, 0], quat: [0, 0, 0, 1], superficie: 'piso-quartinho', giro: 0 });
    acoes.novoProjeto();
    expect(emTutorial()).toBe(true);
    expect(estado.projeto.dispositivos).toHaveLength(0);
    acoes.entrarNoTutorial();
    acoes.sairDoTutorial();
    expect(JSON.stringify(estado.projeto)).toBe(casa);
  });

  it('os destaques só avisam quando mudam e somem ao sair', () => {
    let avisos = 0;
    const cancelar = assinar('destaques', () => (avisos += 1));
    acoes.entrarNoTutorial();
    acoes.definirDestaques([{ tipo: 'superficie', id: 'telhado-quartinho' }]);
    acoes.definirDestaques([{ tipo: 'superficie', id: 'telhado-quartinho' }]);
    expect(avisos).toBe(1);
    acoes.sairDoTutorial();
    expect(estado.destaques).toHaveLength(0);
    cancelar();
  });

  it('o sistema do tutorial montado passa em todos os passos e a lâmpada atravessa a noite', () => {
    acoes.entrarNoTutorial();
    const em = (superficie: string, x = 0) => ({ pos: [x, 0.5, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number], superficie, giro: 0 });
    const placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-quartinho'));
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    const ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    const lamp = acoes.adicionarDispositivo('ap-lampada', em('piso-quartinho', 1));
    const liga = (a: string, ta: string, b: string, tb: string): string => acoes.adicionarCabo({ disp: a, terminal: ta }, { disp: b, terminal: tb }, 1)!;
    const positivo = liga(bat, 'pos', inv, 'batPos');
    liga(bat, 'neg', inv, 'batNeg');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-100');
    liga(bat, 'pos', ctl, 'batPos');
    liga(bat, 'neg', ctl, 'batNeg');
    liga(placa, 'pos', ctl, 'pvPos');
    liga(placa, 'neg', ctl, 'pvNeg');
    liga(lamp, 'plug', inv, 'caSaida');
    acoes.definirLigado(lamp, true);
    recalcularAgora();
    const pendentes = ROTEIRO_TUTORIAL.passos.filter((p) => !p.feito(estado.projeto, estado.derivados, CATALOGO)).map((p) => p.id);
    expect(pendentes).toEqual([]);
    // Com tudo feito, nenhum passo pede realce de ligação.
    for (const p of ROTEIRO_TUTORIAL.passos.filter((x) => x.id.startsWith('cabos'))) expect(p.onde!(estado.projeto, CATALOGO)).toEqual([]);
    // Teste de autonomia: das 18:00, sem rede, a lâmpada de 9 W não esvazia a bateria em 24 horas.
    acoes.definirTempo(Date.UTC(2026, 5, 21, 21, 0, 0));
    acoes.recarregarBateria();
    acoes.alternarQuedaDeLuz();
    for (let i = 0; i < 24 * 12; i += 1) acoes.avancarTempo(5);
    expect(estado.simulacao.quedaDeLuz.apagouMsUtc).toBeNull();
    expect(estado.simulacao.estadoSim.soc).toBeGreaterThan(0.5);
    acoes.alternarQuedaDeLuz();
    acoes.sairDoTutorial();
  });
});

// Grampo de parede: organiza o cabo na cena (docs/especificacao/cena-e-interface.md, seção dos cabos).
describe('grampo de parede', () => {
  const quat: [number, number, number, number] = [0, 0, 0, 1];
  const em = (x: number) => ({ pos: [x, 1.5, 0] as [number, number, number], quat, superficie: 'parede-quartinho-fundo', giro: 0 });

  beforeEach(() => {
    if (emTutorial()) acoes.sairDoTutorial();
    acoes.novoProjeto();
    recalcularAgora();
  });

  it('entra na ordem pedida, não entra no orçamento e não muda as sugestões', () => {
    const cabo = estado.projeto.cabos[0]!.uid;
    const total = estado.derivados.orcamento.total;
    const sugestoes = estado.derivados.sugestoes.map((s) => s.regra);
    const a = acoes.adicionarGrampo(cabo, 0, em(0))!;
    const b = acoes.adicionarGrampo(cabo, 0, em(1))!;
    const c = acoes.adicionarGrampo(cabo, 99, em(2))!;
    expect(estado.projeto.cabos.find((x) => x.uid === cabo)!.grampos).toEqual([b, a, c]);
    recalcularAgora();
    expect(estado.derivados.orcamento.total).toBe(total);
    expect(estado.derivados.sugestoes.map((s) => s.regra)).toEqual(sugestoes);
    expect(acoes.adicionarGrampo('nao-existe', 0, em(3))).toBeNull();
  });

  it('apagar o grampo solta o cabo naquele ponto; apagar o cabo leva os grampos; desfazer devolve', () => {
    const cabo = estado.projeto.cabos[0]!.uid;
    const pecas = estado.projeto.dispositivos.length;
    const a = acoes.adicionarGrampo(cabo, 0, em(0))!;
    const b = acoes.adicionarGrampo(cabo, 1, em(1))!;
    acoes.removerDispositivo(a);
    expect(estado.projeto.cabos.find((x) => x.uid === cabo)!.grampos).toEqual([b]);
    acoes.removerCabo(cabo);
    expect(estado.projeto.dispositivos).toHaveLength(pecas);
    acoes.desfazer();
    expect(estado.projeto.cabos.find((x) => x.uid === cabo)!.grampos).toEqual([b]);
    expect(estado.projeto.dispositivos.some((d) => d.uid === b)).toBe(true);
  });
});

// Achados da revisão da fase 7.
describe('tutorial: a casa não se perde', () => {
  beforeEach(() => {
    if (emTutorial()) acoes.sairDoTutorial();
    acoes.novoProjeto();
    recalcularAgora();
  });

  it('abrir na casa um arquivo exportado de dentro do tutorial guarda a casa; sair a devolve', () => {
    acoes.entrarNoTutorial();
    const arquivo = acoes.exportarProjeto();
    acoes.sairDoTutorial();
    acoes.adicionarDispositivo('acc-quadro-8', { pos: [0, 1.3, 0], quat: [0, 0, 0, 1], superficie: 'parede-quartinho-fundo', giro: 0 });
    const casa = JSON.stringify(estado.projeto);
    acoes.carregarProjeto(JSON.parse(arquivo));
    expect(emTutorial()).toBe(true);
    acoes.sairDoTutorial();
    expect(JSON.stringify(estado.projeto)).toBe(casa);
  });

  it('entrar no tutorial para o relógio; salto do relógio e "Bateria cheia" contam como intervenção', () => {
    acoes.definirVelocidade(60);
    acoes.entrarNoTutorial();
    expect(estado.tempo.velocidade).toBe(0);
    const antes = estado.simulacao.intervencoes;
    acoes.avancarTempo(30);
    expect(estado.simulacao.intervencoes).toBe(antes);
    acoes.definirTempo(estado.tempo.msUtc + 3_600_000);
    acoes.recarregarBateria();
    expect(estado.simulacao.intervencoes).toBe(antes + 2);
    acoes.sairDoTutorial();
  });
});
