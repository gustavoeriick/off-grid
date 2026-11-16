// Testes do laço de simulação do estado (tarefa 3.2).
// Esperados: docs/especificacao/casos-de-teste.md (autonomia do cenário do plano) e a seção 11 da especificação da cena.

import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOGO } from './catalogo';
import { ROTEIRO_TUTORIAL } from './conteudo/roteiros';
import { acoes, analiseViva, assinar, correntesDeOperacaoAgora, emTutorial, estado, horaLocalDe, PECA_NOVA_NASCE_DESLIGADA, recalcularAgora } from './estado';
import { cenarioPlanoCorrigido } from './nucleo/cenarios';

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
    const doControlador = liga(bat, 'pos', ctl, 'batPos');
    liga(bat, 'neg', ctl, 'batNeg');
    // Sem proteção no cabo do controlador, o consultor acusa erro e o passo 6 não fecha.
    recalcularAgora();
    expect(estado.derivados.sugestoes.some((s) => s.regra === 'sem-protecao-do-controlador')).toBe(true);
    acoes.instalarProtecao(doControlador, 'prot-disjuntor-cc-80');
    // Fase 8: as proteções nascem abertas. A bateria entra antes das placas: fusível e disjuntor fechados, depois os cabos da placa.
    acoes.alternarProtecao(positivo, 0);
    acoes.alternarProtecao(doControlador, 0);
    liga(placa, 'pos', ctl, 'pvPos');
    liga(placa, 'neg', ctl, 'pvNeg');
    liga(lamp, 'plug', inv, 'caSaida');
    // O inversor e o aparelho nascem desligados.
    acoes.definirLigado(inv, true);
    acoes.definirLigado(lamp, true);
    recalcularAgora();
    expect(estado.projeto.dispositivos.some((d) => d.queimado !== undefined)).toBe(false);
    const pendentes = ROTEIRO_TUTORIAL.passos.filter((p) => !p.feito(estado.projeto, estado.derivados, CATALOGO)).map((p) => p.id);
    expect(pendentes).toEqual([]);
    // Com tudo feito, nenhum passo pede realce de ligação.
    for (const p of ROTEIRO_TUTORIAL.passos.filter((x) => x.id.startsWith('cabos'))) expect(p.onde!(estado.projeto, CATALOGO)).toEqual([]);
    // Teste de autonomia: das 18:00, sem rede, a lâmpada de 9 W não esvazia a bateria em 24 horas.
    acoes.definirTempo(Date.UTC(2026, 5, 21, 21, 0, 0));
    acoes.recarregarBateria();
    acoes.alternarQuedaDeLuz();
    // Às 18:00 a lâmpada está no horário de uso e é atendida pela bateria.
    expect(estado.simulacao.saida.cargaAtendidaW).toBeGreaterThan(0);
    for (let i = 0; i < 24 * 12; i += 1) acoes.avancarTempo(5);
    expect(estado.projeto.dispositivos.some((d) => d.queimado !== undefined || d.falha !== undefined)).toBe(false);
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

  it('arrumar os cabos troca os grampos de vários cabos em um passo só de desfazer', () => {
    const [c1, c2] = [estado.projeto.cabos[0]!.uid, estado.projeto.cabos[1]!.uid];
    const pecas = estado.projeto.dispositivos.length;
    const velho = acoes.adicionarGrampo(c1, 0, em(0))!;
    const antes = JSON.stringify(estado.projeto);
    acoes.definirGramposDosCabos(new Map([[c1, [em(1), em(2)]], [c2, [em(3)]], ['nao-existe', [em(4)]]]));
    const cabo = (uid: string) => estado.projeto.cabos.find((x) => x.uid === uid)!;
    expect(cabo(c1).grampos).toHaveLength(2);
    expect(cabo(c2).grampos).toHaveLength(1);
    expect(cabo(c1).grampos).not.toContain(velho);
    expect(estado.projeto.dispositivos).toHaveLength(pecas + 3);
    expect(new Set(estado.projeto.dispositivos.map((d) => d.uid)).size).toBe(pecas + 3);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    // Lista vazia solta o cabo.
    acoes.definirGramposDosCabos(new Map([[c1, []]]));
    expect(cabo(c1).grampos).toEqual([]);
    expect(estado.projeto.dispositivos).toHaveLength(pecas);
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

// "Meus projetos": vários projetos gravados no navegador, cada um com a casa, a orientação e a montagem dele.
describe('meus projetos', () => {
  beforeEach(() => {
    if (emTutorial()) acoes.sairDoTutorial();
    // Deixa só um projeto na biblioteca: apaga os outros e volta o da tela ao cenário inicial.
    for (const p of acoes.listarProjetos().filter((x) => !x.atual)) acoes.apagarProjeto(p.id);
    acoes.novoProjeto();
    recalcularAgora();
  });

  it('o projeto da tela já está na lista; criar outro grava o primeiro e abre o novo', () => {
    expect(acoes.listarProjetos().filter((p) => p.atual)).toHaveLength(1);
    const primeiro = acoes.listarProjetos().find((p) => p.atual)!.id;
    acoes.alterarCasa({ orientacaoGraus: 90 });
    const quadro = acoes.adicionarDispositivo('acc-quadro-8', { pos: [0, 1.3, 0], quat: [0, 0, 0, 1], superficie: 'parede-quartinho-fundo', giro: 0 });
    const minhaCasa = JSON.stringify(estado.projeto);

    const pais = acoes.criarProjeto('Casa dos pais', 'vazia')!;
    expect(estado.projeto.nome).toBe('Casa dos pais');
    expect(estado.projeto.cabos).toHaveLength(0);
    expect(estado.projeto.casa.orientacaoGraus).not.toBe(90);
    expect(acoes.listarProjetos().find((p) => p.atual)!.id).toBe(pais);
    // Desfazer não atravessa a troca de projeto.
    acoes.desfazer();
    expect(estado.projeto.nome).toBe('Casa dos pais');
    acoes.alterarCasa({ orientacaoGraus: 270 });

    expect(acoes.abrirProjeto(primeiro)).toBe(true);
    expect(JSON.stringify(estado.projeto)).toBe(minhaCasa);
    expect(estado.projeto.dispositivos.some((d) => d.uid === quadro)).toBe(true);
    expect(acoes.abrirProjeto(pais)).toBe(true);
    expect(estado.projeto.casa.orientacaoGraus).toBe(270);
  });

  it('renomear, duplicar e apagar; nome repetido ganha número', () => {
    const primeiro = acoes.listarProjetos().find((p) => p.atual)!.id;
    acoes.renomearProjeto(primeiro, '  Minha   casa ');
    expect(estado.projeto.nome).toBe('Minha casa');
    const outro = acoes.criarProjeto('Minha casa', 'copia')!;
    expect(estado.projeto.nome).toBe('Minha casa (2)');
    // Renomear e duplicar um projeto que não está na tela.
    acoes.renomearProjeto(primeiro, 'Sítio');
    const copia = acoes.duplicarProjeto(primeiro)!;
    const nomes = Object.fromEntries(acoes.listarProjetos().map((p) => [p.id, p.nome]));
    expect(nomes[primeiro]).toBe('Sítio');
    expect(nomes[copia]).toBe('Sítio (cópia)');
    expect(acoes.listarProjetos().find((p) => p.atual)!.id).toBe(outro);
    // Apagar o da tela abre outro; a lista nunca fica sem o projeto da tela.
    expect(acoes.apagarProjeto(outro)).toBe(true);
    expect(acoes.listarProjetos().map((p) => p.id).sort()).toEqual([primeiro, copia].sort());
    expect(acoes.listarProjetos().filter((p) => p.atual)).toHaveLength(1);
    acoes.apagarProjeto(primeiro);
    acoes.apagarProjeto(copia);
    expect(acoes.listarProjetos()).toHaveLength(1);
    expect(estado.projeto.nome).toBe('Minha casa');
    expect(estado.projeto.cabos).toHaveLength(0);
  });

  it('importar um arquivo cria um projeto novo e não toca no que estava na tela', () => {
    const primeiro = acoes.listarProjetos().find((p) => p.atual)!.id;
    const arquivo = JSON.parse(acoes.exportarProjeto());
    acoes.alterarCasa({ beiral: 1 });
    const naTela = JSON.stringify(estado.projeto);
    acoes.importarProjeto(arquivo);
    expect(acoes.listarProjetos()).toHaveLength(2);
    expect(acoes.listarProjetos().find((p) => p.atual)!.id).not.toBe(primeiro);
    expect(() => acoes.importarProjeto({ versao: 2, nome: 'x' })).toThrow();
    expect(acoes.listarProjetos()).toHaveLength(2);
    acoes.abrirProjeto(primeiro);
    expect(JSON.stringify(estado.projeto)).toBe(naTela);
  });

  it('o tutorial não entra na lista, e a lista não pode ser mexida de dentro dele', () => {
    const antes = acoes.listarProjetos();
    const casa = JSON.stringify(estado.projeto);
    acoes.entrarNoTutorial();
    acoes.adicionarDispositivo('bat-moura-12mn105', { pos: [0, 0.1, 0], quat: [0, 0, 0, 1], superficie: 'piso-quartinho', giro: 0 });
    expect(acoes.criarProjeto('Outro', 'vazia')).toBeNull();
    expect(acoes.abrirProjeto(antes[0]!.id)).toBe(false);
    expect(acoes.apagarProjeto(antes[0]!.id)).toBe(false);
    expect(acoes.listarProjetos().map((p) => p.id)).toEqual(antes.map((p) => p.id));
    acoes.sairDoTutorial();
    expect(JSON.stringify(estado.projeto)).toBe(casa);
    expect(acoes.listarProjetos()).toHaveLength(antes.length);
  });
});

// Fase 8: operar o sistema (docs/especificacao/operar.md). Chaves, o que está vivo, consequências e eventos.
describe('operar o sistema', () => {
  /** 21/06/2026 ao meio-dia no Rio: há sol na placa. */
  const MEIO_DIA = Date.UTC(2026, 5, 21, 15, 0, 0);
  const quat: [number, number, number, number] = [0, 0, 0, 1];
  const em = (superficie: string, x = 0) => ({ pos: [x, 0.5, 0] as [number, number, number], quat, superficie, giro: 0 });
  const liga = (a: string, ta: string, b: string, tb: string): string => acoes.adicionarCabo({ disp: a, terminal: ta }, { disp: b, terminal: tb }, 1)!;
  const peca = (uid: string) => estado.projeto.dispositivos.find((d) => d.uid === uid)!;
  const cabo = (uid: string) => estado.projeto.cabos.find((c) => c.uid === uid)!;
  const codigosDosEventos = (): string[] => estado.simulacao.eventos.map((e) => e.codigo);

  /**
   * A montagem do tutorial (placa de 100 W, bateria de 12 V, inversor de 500 W, controlador PWM e uma lâmpada), sem os
   * cabos da placa e com tudo como nasce: proteções abertas, inversor e lâmpada desligados.
   */
  function montar(protecaoDoControlador = 'prot-disjuntor-cc-80') {
    acoes.entrarNoTutorial();
    const placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-quartinho'));
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    const ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    const lamp = acoes.adicionarDispositivo('ap-lampada', em('piso-quartinho', 1));
    const positivo = liga(bat, 'pos', inv, 'batPos');
    liga(bat, 'neg', inv, 'batNeg');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-100');
    const doControlador = liga(bat, 'pos', ctl, 'batPos');
    liga(bat, 'neg', ctl, 'batNeg');
    acoes.instalarProtecao(doControlador, protecaoDoControlador);
    liga(lamp, 'plug', inv, 'caSaida');
    // No teste a lâmpada funciona o dia inteiro, como no teste de autonomia do tutorial.
    acoes.definirUso(lamp, { inicio: 0, fim: 24 });
    return { placa, bat, inv, ctl, lamp, positivo, doControlador };
  }
  const ligarPlaca = (m: { placa: string; ctl: string }): string[] => [liga(m.placa, 'pos', m.ctl, 'pvPos'), liga(m.placa, 'neg', m.ctl, 'pvNeg')];

  beforeEach(() => {
    if (emTutorial()) acoes.sairDoTutorial();
    acoes.novoProjeto();
    if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
    acoes.recarregarBateria();
    acoes.definirTempo(VINTE_HORAS);
    recalcularAgora();
  });

  it('aparelho e inversor novos nascem desligados; fusível e disjuntor novos nascem abertos; o DPS fica fechado', () => {
    expect(PECA_NOVA_NASCE_DESLIGADA).toBe(true);
    const naParede = { pos: [0, 1.3, 0] as [number, number, number], quat, superficie: 'parede-quartinho-fundo', giro: 0 };
    expect(peca(acoes.adicionarDispositivo('ap-ventilador', naParede)).ligado).toBe(false);
    expect(peca(acoes.adicionarDispositivo('inv-aiker-500-12v-110', naParede)).ligado).toBe(false);
    expect(peca(acoes.adicionarDispositivo('placa-resun-100', naParede)).ligado).toBe(true);
    expect(peca(acoes.adicionarDispositivo('bat-moura-12mn105', naParede)).ligado).toBe(true);
    expect(peca(acoes.adicionarDispositivo('acc-quadro-8', naParede)).ligado).toBe(true);
    // c2 é o negativo das placas do cenário inicial: sem proteção e sem o campo `estados`.
    expect(cabo('c2').estados).toBeUndefined();
    acoes.instalarProtecao('c2', 'prot-fusivel-anl-100');
    acoes.instalarProtecao('c2', 'prot-dps-cc-600');
    acoes.instalarProtecao('c2', 'prot-disjuntor-cc-32');
    expect(cabo('c2').protecoes).toEqual(['prot-fusivel-anl-100', 'prot-dps-cc-600', 'prot-disjuntor-cc-32']);
    expect(cabo('c2').estados).toEqual(['aberta', 'fechada', 'aberta']);
  });

  it('`estados` acompanha `protecoes` ao instalar, ao remover e na sugestão do consultor', () => {
    // c1 já vem do cenário com um disjuntor, sem o campo: vale fechado e continua fechado.
    acoes.instalarProtecao('c1', 'prot-fusivel-anl-100');
    expect(cabo('c1').protecoes).toEqual(['prot-disjuntor-cc-32', 'prot-fusivel-anl-100']);
    expect(cabo('c1').estados).toEqual(['fechada', 'aberta']);
    acoes.removerProtecao('c1', 0);
    expect(cabo('c1').protecoes).toEqual(['prot-fusivel-anl-100']);
    expect(cabo('c1').estados).toEqual(['aberta']);
    acoes.removerProtecao('c1', 0);
    expect(cabo('c1').estados).toEqual([]);
    // Remover de um cabo de projeto antigo não cria o campo.
    acoes.removerProtecao('c3', 0);
    expect(cabo('c3').protecoes).toEqual([]);
    expect(cabo('c3').estados).toBeUndefined();
    // A ação "proteger cabos" do consultor instala pelo mesmo caminho.
    acoes.aplicarAcao({ tipo: 'proteger-cabos', rotulo: 'Proteger', itens: [{ cabo: 'c3', protecaoId: 'prot-fusivel-anl-150' }] });
    expect(cabo('c3').estados).toEqual(['aberta']);
    // O DPS não tem chave, e a chave de uma proteção abre e fecha.
    acoes.instalarProtecao('c3', 'prot-dps-cc-600');
    acoes.alternarProtecao('c3', 1);
    expect(cabo('c3').estados).toEqual(['aberta', 'fechada']);
    acoes.alternarProtecao('c3', 0);
    expect(cabo('c3').estados).toEqual(['fechada', 'fechada']);
    acoes.alternarProtecao('c3', 0);
    expect(cabo('c3').estados).toEqual(['aberta', 'fechada']);
    for (const c of estado.projeto.cabos) if (c.estados !== undefined) expect(c.estados).toHaveLength(c.protecoes.length);
  });

  it('com a proteção da bateria aberta nada é atendido; fechando e ligando, é', () => {
    const m = montar();
    acoes.definirLigado(m.inv, true);
    acoes.definirLigado(m.lamp, true);
    expect(analiseViva().sistema?.banco ?? []).toHaveLength(0);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    acoes.avancarTempo(30);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    expect(estado.simulacao.estadoSim.soc).toBe(1);
    // Fecha o fusível: a lâmpada acende na hora, sem esperar o recálculo dos derivados.
    acoes.alternarProtecao(m.positivo, 0);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(9);
    expect(estado.simulacao.saida.origem).toBe('bateria');
    expect(correntesDeOperacaoAgora().get(m.positivo)).toBeGreaterThan(0);
    // O botão do inversor conta.
    acoes.definirLigado(m.inv, false);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    acoes.definirLigado(m.inv, true);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(9);
    // Abrir o fusível com o inversor atendendo: a saída cai, sem dano.
    acoes.alternarProtecao(m.positivo, 0);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    expect(estado.simulacao.eventos).toHaveLength(0);
    acoes.sairDoTutorial();
  });

  it('`energizar` na montagem do tutorial fecha tudo e liga o inversor em um passo só; o aparelho fica para depois', () => {
    const m = montar();
    ligarPlaca(m);
    const antes = JSON.stringify(estado.projeto);
    expect(acoes.energizar()).toBeNull();
    expect(cabo(m.positivo).estados).toEqual(['fechada']);
    expect(cabo(m.doControlador).estados).toEqual(['fechada']);
    expect(peca(m.inv).ligado).toBe(true);
    // Os aparelhos não entram no atalho.
    expect(peca(m.lamp).ligado).toBe(false);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    const ligado = JSON.stringify(estado.projeto);
    // Energizar de novo não tem o que fazer e não cria passo de desfazer.
    expect(acoes.energizar()).toBeNull();
    acoes.definirLigado(m.lamp, true);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(9);
    expect(estado.simulacao.eventos).toHaveLength(0);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(ligado);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    acoes.refazer();
    expect(JSON.stringify(estado.projeto)).toBe(ligado);
    // Desligar o sistema: tudo aberto e o inversor desligado, em um passo.
    acoes.desenergizar();
    expect(cabo(m.positivo).estados).toEqual(['aberta']);
    expect(cabo(m.doControlador).estados).toEqual(['aberta']);
    expect(peca(m.inv).ligado).toBe(false);
    expect(estado.simulacao.eventos).toHaveLength(0);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(ligado);
    acoes.sairDoTutorial();
  });

  it('`energizar` à noite, com as placas já ligadas, deixa a bateria presente: de dia nada queima', () => {
    const m = montar();
    ligarPlaca(m);
    expect(acoes.energizar()).toBeNull();
    acoes.definirTempo(MEIO_DIA);
    expect(peca(m.ctl).queimado).toBeUndefined();
    expect(estado.simulacao.saida.pvDisponivelW).toBeGreaterThan(0);
    expect(estado.simulacao.eventos).toHaveLength(0);
    acoes.sairDoTutorial();
  });

  it('`energizar` recusa com a bateria invertida e não mexe em nada; fechar à mão queima o inversor', () => {
    acoes.entrarNoTutorial();
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    // O fusível entra (aberto) antes do segundo cabo: sem ele, a ligação invertida já queimaria o inversor ao fechar o circuito.
    const trocado = liga(bat, 'neg', inv, 'batPos');
    acoes.instalarProtecao(trocado, 'prot-fusivel-anl-100');
    liga(bat, 'pos', inv, 'batNeg');
    expect(peca(inv).queimado).toBeUndefined();
    const antes = JSON.stringify(estado.projeto);
    const recusa = acoes.energizar();
    expect(recusa?.codigo).toBe('bateria-invertida');
    expect(recusa?.texto).toBeTruthy();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    // Fechando o fusível à mão, o inversor queima na hora e o fusível também; desfazer a manobra desfaz o dano.
    acoes.alternarProtecao(trocado, 0);
    expect(peca(inv).queimado?.codigo).toBe('bateria-invertida');
    expect(cabo(trocado).estados).toEqual(['queimada']);
    expect(codigosDosEventos()).toEqual(['bateria-invertida']);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    acoes.sairDoTutorial();
  });

  it('ligar as placas com a proteção da bateria aberta, de dia, queima o controlador; desfazer a ação desfaz o dano', () => {
    acoes.definirTempo(MEIO_DIA);
    const m = montar();
    let avisos = 0;
    const cancelar = assinar('operacao', () => (avisos += 1));
    liga(m.placa, 'pos', m.ctl, 'pvPos');
    // Com um cabo só, a fileira não fecha: nada acontece.
    expect(peca(m.ctl).queimado).toBeUndefined();
    const antes = JSON.stringify(estado.projeto);
    const negativo = liga(m.placa, 'neg', m.ctl, 'pvNeg');
    expect(peca(m.ctl).queimado).toEqual({ codigo: 'controlador-sem-bateria', msUtc: MEIO_DIA });
    expect(estado.simulacao.eventos).toEqual([{ codigo: 'controlador-sem-bateria', uids: [m.ctl], msUtc: MEIO_DIA }]);
    expect(avisos).toBe(1);
    // O dano está no mesmo passo do desfazer da ação.
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    expect(cabo(negativo)).toBeUndefined();
    // Os eventos não entram no desfazer.
    expect(estado.simulacao.eventos).toHaveLength(1);
    cancelar();
    acoes.sairDoTutorial();
  });

  it('consertar sem corrigir a causa queima de novo; corrigida a causa, o conserto fica', () => {
    acoes.definirTempo(MEIO_DIA);
    const m = montar();
    ligarPlaca(m);
    expect(peca(m.ctl).queimado?.codigo).toBe('controlador-sem-bateria');
    acoes.consertar({ tipo: 'dispositivo', uid: m.ctl });
    expect(peca(m.ctl).queimado?.codigo).toBe('controlador-sem-bateria');
    expect(codigosDosEventos()).toEqual(['controlador-sem-bateria', 'controlador-sem-bateria']);
    // A causa: a bateria não chega ao controlador. Fecha as proteções e conserta.
    acoes.alternarProtecao(m.positivo, 0);
    acoes.alternarProtecao(m.doControlador, 0);
    const queimado = JSON.stringify(estado.projeto);
    acoes.consertar({ tipo: 'dispositivo', uid: m.ctl });
    expect(peca(m.ctl).queimado).toBeUndefined();
    expect(estado.simulacao.eventos).toHaveLength(2);
    expect(estado.simulacao.saida.pvDisponivelW).toBeGreaterThan(0);
    // O conserto é um passo do desfazer.
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(queimado);
    acoes.sairDoTutorial();
  });

  it('o erro armado à noite acontece quando o sol nasce, em um passo próprio do desfazer', () => {
    const m = montar();
    ligarPlaca(m);
    const cabos = estado.projeto.cabos.length;
    expect(peca(m.ctl).queimado).toBeUndefined();
    // Do começo da noite até a manhã, com o relógio andando.
    for (let i = 0; i < 15 * 6 && peca(m.ctl).queimado === undefined; i += 1) acoes.avancarTempo(10);
    expect(peca(m.ctl).queimado?.codigo).toBe('controlador-sem-bateria');
    expect(peca(m.ctl).queimado?.msUtc).toBe(estado.tempo.msUtc);
    expect(horaLocalDe(estado.projeto, estado.tempo.msUtc)).toBeGreaterThan(5);
    expect(horaLocalDe(estado.projeto, estado.tempo.msUtc)).toBeLessThan(9);
    expect(codigosDosEventos()).toEqual(['controlador-sem-bateria']);
    // Desfazer volta à montagem armada; como o sol continua lá, o controlador queima de novo, sem passo novo.
    acoes.desfazer();
    expect(estado.projeto.cabos).toHaveLength(cabos);
    expect(peca(m.ctl).queimado?.codigo).toBe('controlador-sem-bateria');
    // O desfazer seguinte tira o cabo da placa: nada queimado.
    acoes.desfazer();
    expect(estado.projeto.cabos).toHaveLength(cabos - 1);
    expect(peca(m.ctl).queimado).toBeUndefined();
    acoes.sairDoTutorial();
  });

  it('sobrecarga põe o inversor em falha; religar limpa, e volta a falhar enquanto a sobrecarga continua', () => {
    const m = montar();
    const micro = acoes.adicionarDispositivo('ap-microondas', em('piso-quartinho', 1.5));
    liga(micro, 'plug', m.inv, 'caSaida');
    acoes.definirUso(micro, { inicio: 0, fim: 24 });
    acoes.energizar();
    acoes.definirLigado(m.lamp, true);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(9);
    // 1.300 W em um inversor de 500 W.
    acoes.definirLigado(micro, true);
    expect(peca(m.inv).falha).toBe('sobrecarga');
    expect(peca(m.inv).ligado).toBe(true);
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    expect(estado.simulacao.eventos).toEqual([{ codigo: 'sobrecarga', uids: [m.inv], msUtc: VINTE_HORAS }]);
    // Religar sem tirar a causa: falha de novo.
    acoes.definirLigado(m.inv, false);
    expect(peca(m.inv).falha).toBeUndefined();
    acoes.definirLigado(m.inv, true);
    expect(peca(m.inv).falha).toBe('sobrecarga');
    expect(estado.simulacao.eventos).toHaveLength(2);
    // Desliga o micro-ondas; o inversor continua em falha até ser religado.
    acoes.definirLigado(micro, false);
    expect(peca(m.inv).falha).toBe('sobrecarga');
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(0);
    acoes.definirLigado(m.inv, true);
    expect(peca(m.inv).falha).toBeUndefined();
    expect(estado.simulacao.saida.cargaAtendidaW).toBe(9);
    expect(estado.simulacao.eventos).toHaveLength(2);
    acoes.sairDoTutorial();
  });

  it('apagar o cabo da placa com corrente passando abre arco e queima a placa', () => {
    acoes.definirTempo(MEIO_DIA);
    const m = montar();
    acoes.alternarProtecao(m.positivo, 0);
    acoes.alternarProtecao(m.doControlador, 0);
    const [positivoDaPlaca] = ligarPlaca(m);
    acoes.definirLigado(m.inv, true);
    acoes.definirLigado(m.lamp, true);
    expect(estado.simulacao.saida.pvW).toBeGreaterThan(0);
    expect(correntesDeOperacaoAgora().get(positivoDaPlaca!)).toBeGreaterThan(0);
    const antes = JSON.stringify(estado.projeto);
    acoes.removerCabo(positivoDaPlaca!);
    expect(peca(m.placa).queimado?.codigo).toBe('arco-no-conector');
    expect(codigosDosEventos()).toEqual(['arco-no-conector']);
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
    acoes.sairDoTutorial();
  });

  it('abrir um disjuntor CA em cabo de corrente contínua com corrente queima o disjuntor, e o controlador fica sem bateria', () => {
    acoes.definirTempo(MEIO_DIA);
    const m = montar('prot-disjuntor-ca-16');
    acoes.alternarProtecao(m.positivo, 0);
    acoes.alternarProtecao(m.doControlador, 0);
    ligarPlaca(m);
    acoes.definirLigado(m.inv, true);
    acoes.definirLigado(m.lamp, true);
    expect(estado.simulacao.eventos).toHaveLength(0);
    expect(correntesDeOperacaoAgora().get(m.doControlador)).toBeGreaterThan(0);
    acoes.alternarProtecao(m.doControlador, 0);
    expect(cabo(m.doControlador).estados).toEqual(['queimada']);
    // O ciclo segue: sem a bateria e com sol, o controlador queima também.
    expect(peca(m.ctl).queimado?.codigo).toBe('controlador-sem-bateria');
    expect(codigosDosEventos()).toEqual(['arco-no-disjuntor-ca', 'controlador-sem-bateria']);
    // Proteção queimada não muda com a chave; trocada, volta aberta.
    acoes.alternarProtecao(m.doControlador, 0);
    expect(cabo(m.doControlador).estados).toEqual(['queimada']);
    acoes.consertar({ tipo: 'protecao', cabo: m.doControlador, indice: 0 });
    expect(cabo(m.doControlador).estados).toEqual(['aberta']);
    acoes.sairDoTutorial();
  });

  it('os eventos guardam os 20 últimos e somem ao abrir outro projeto', () => {
    const m = montar();
    const micro = acoes.adicionarDispositivo('ap-microondas', em('piso-quartinho', 1.5));
    liga(micro, 'plug', m.inv, 'caSaida');
    acoes.definirUso(micro, { inicio: 0, fim: 24 });
    acoes.energizar();
    acoes.definirLigado(micro, true);
    for (let i = 0; i < 25; i += 1) acoes.definirLigado(m.inv, true);
    expect(estado.simulacao.eventos).toHaveLength(20);
    acoes.novoProjeto();
    expect(estado.simulacao.eventos).toHaveLength(0);
    acoes.sairDoTutorial();
  });

  it('projeto antigo, sem os campos novos, funciona como antes e não ganha campo nenhum', () => {
    acoes.carregarProjeto(JSON.parse(JSON.stringify(cenarioPlanoCorrigido())));
    recalcularAgora();
    const texto = JSON.stringify(estado.projeto);
    expect(texto).not.toContain('estados');
    // A análise viva é a mesma da de projeto: tudo fechado e ligado.
    expect(analiseViva().sistema).toEqual(estado.derivados.analise.sistema);
    acoes.definirTempo(VINTE_HORAS);
    acoes.avancarTempo(60);
    expect(estado.simulacao.saida.origem).toBe('rede');
    expect(estado.simulacao.saida.cargaAtendidaW).toBeGreaterThan(0);
    acoes.alternarQuedaDeLuz();
    acoes.avancarTempo(60);
    expect(estado.simulacao.saida.origem).toBe('bateria');
    expect(estado.simulacao.saida.cargaAtendidaW).toBeGreaterThan(0);
    // Um dia inteiro com a rede: nada desarma, nada queima, o projeto não muda.
    acoes.alternarQuedaDeLuz();
    for (let i = 0; i < 24 * 6; i += 1) acoes.avancarTempo(10);
    expect(estado.simulacao.eventos).toHaveLength(0);
    expect(JSON.stringify(estado.projeto)).toBe(texto);
  });
});
