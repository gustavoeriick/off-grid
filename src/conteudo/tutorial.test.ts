// O tutorial em duas partes e o "Experimente errar" (docs/especificacao/tutorial.md e operar.md, seção 9),
// feitos com as ações do estado, como o usuário faria pela tela.
// O que se confere: cada passo, feito como o texto manda, fica feito, o painel anda para o seguinte e nada queima,
// em qualquer hora do dia simulado; cada erro guiado acontece e é consertado.

import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { acoes, emTutorial, estado, recalcularAgora } from '../estado';
import { ERROS_GUIADOS, ROTEIRO_TUTORIAL, type ContextoDoErro } from './roteiros';

const MS_HORA = 3_600_000;
/** 21/06/2026, 0:00 no Rio (UTC − 3). */
const MEIA_NOITE = Date.UTC(2026, 5, 21, 3, 0, 0);

const em = (superficie: string, x = 0) => ({ pos: [x, 0.5, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number], superficie, giro: 0 });
const liga = (a: string, ta: string, b: string, tb: string): string => acoes.adicionarCabo({ disp: a, terminal: ta }, { disp: b, terminal: tb }, 1)!;

function passoDaVez(): string | null {
  recalcularAgora();
  const p = ROTEIRO_TUTORIAL.passos.find((x) => !x.feito(estado.projeto, estado.derivados, CATALOGO));
  return p?.id ?? null;
}

const nadaQueimou = (): boolean =>
  estado.simulacao.eventos.length === 0 &&
  estado.projeto.dispositivos.every((d) => d.queimado === undefined && d.falha === undefined) &&
  estado.projeto.cabos.every((c) => c.queimado === undefined && (c.estados ?? []).every((s) => s !== 'queimada'));

interface Pecas {
  placa: string;
  bat: string;
  inv: string;
  ctl: string;
  vent: string;
  positivo: string;
  doControlador: string;
}

/** Faz o tutorial inteiro na ordem dos passos, conferindo a cada um o passo da vez e que nada queimou. */
function fazerOTutorial(): Pecas {
  const ordem: [string, () => void][] = [];
  const pecas = {} as Pecas;
  ordem.push(['placa', () => (pecas.placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-quartinho')))]);
  ordem.push(['bateria', () => (pecas.bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5)))]);
  ordem.push(['inversor', () => (pecas.inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5)))]);
  ordem.push(['cabos-da-bateria', () => {
    pecas.positivo = liga(pecas.bat, 'pos', pecas.inv, 'batPos');
    liga(pecas.bat, 'neg', pecas.inv, 'batNeg');
  }]);
  ordem.push(['fusivel', () => acoes.instalarProtecao(pecas.positivo, 'prot-fusivel-anl-100')]);
  ordem.push(['controlador', () => {
    pecas.ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    pecas.doControlador = liga(pecas.bat, 'pos', pecas.ctl, 'batPos');
    liga(pecas.bat, 'neg', pecas.ctl, 'batNeg');
    acoes.instalarProtecao(pecas.doControlador, 'prot-disjuntor-cc-80');
  }]);
  ordem.push(['aparelho', () => {
    pecas.vent = acoes.adicionarDispositivo('ap-ventilador', em('piso-quartinho', 1));
    liga(pecas.vent, 'plug', pecas.inv, 'caSaida');
  }]);
  ordem.push(['sem-erros', () => undefined]);
  ordem.push(['fechar-fusivel', () => acoes.alternarProtecao(pecas.positivo, 0)]);
  ordem.push(['fechar-controlador', () => acoes.alternarProtecao(pecas.doControlador, 0)]);
  ordem.push(['cabos-da-placa', () => {
    liga(pecas.placa, 'pos', pecas.ctl, 'pvPos');
    liga(pecas.placa, 'neg', pecas.ctl, 'pvNeg');
  }]);
  ordem.push(['ligar-inversor', () => acoes.definirLigado(pecas.inv, true)]);
  ordem.push(['ligar-aparelho', () => acoes.definirLigado(pecas.vent, true)]);

  expect(ordem.map(([id]) => id)).toEqual(ROTEIRO_TUTORIAL.passos.map((p) => p.id));
  for (const [id, fazer] of ordem) {
    // A conferência do consultor não tem ação: sem erro na montagem, ela já está feita e o painel passa direto.
    if (id === 'sem-erros') {
      expect(passoDaVez(), 'a montagem certa não deveria ter erro no consultor').toBe('fechar-fusivel');
      continue;
    }
    expect(passoDaVez(), `antes de ${id}`).toBe(id);
    fazer();
    expect(nadaQueimou(), `depois de ${id}: ${JSON.stringify(estado.simulacao.eventos)}`).toBe(true);
  }
  expect(passoDaVez()).toBeNull();
  return pecas;
}

function entrar(hora: number): void {
  if (emTutorial()) acoes.sairDoTutorial();
  acoes.entrarNoTutorial();
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  acoes.definirTempo(MEIA_NOITE + hora * MS_HORA);
  recalcularAgora();
}

describe('tutorial: os passos', () => {
  it('13 passos, ids únicos, 8 na parte de montar e 5 na de ligar', () => {
    const passos = ROTEIRO_TUTORIAL.passos;
    expect(passos).toHaveLength(13);
    expect(new Set(passos.map((p) => p.id)).size).toBe(13);
    expect(passos.filter((p) => p.parte === 'Parte 1: montar')).toHaveLength(8);
    expect(passos.filter((p) => p.parte === 'Parte 2: ligar').map((p) => p.id)).toEqual([
      'fechar-fusivel', 'fechar-controlador', 'cabos-da-placa', 'ligar-inversor', 'ligar-aparelho',
    ]);
    for (const p of passos) {
      expect(p.texto.length).toBeGreaterThan(80);
      if (p.itemId) expect(CATALOGO.get(p.itemId), p.itemId).toBeDefined();
    }
  });

  // De hora em hora não é preciso: a manhã, o meio-dia, a tarde e a noite cobrem os casos do sol.
  for (const hora of [0, 6, 7, 9, 12, 15, 17.5, 18, 21]) {
    it(`feito na ordem, nada queima às ${hora} h`, () => {
      entrar(hora);
      fazerOTutorial();
    });
  }

  it('o realce dos passos de ligar aponta o que clicar', () => {
    entrar(12);
    const pecas = fazerOTutorial();
    const passo = (id: string) => ROTEIRO_TUTORIAL.passos.find((p) => p.id === id)!;
    expect(passo('fechar-fusivel').onde!(estado.projeto, CATALOGO)).toEqual([{ tipo: 'cabo', uid: pecas.positivo }]);
    expect(passo('fechar-controlador').onde!(estado.projeto, CATALOGO)).toEqual([{ tipo: 'cabo', uid: pecas.doControlador }]);
    expect(passo('ligar-inversor').onde!(estado.projeto, CATALOGO)).toEqual([{ tipo: 'terminal', disp: pecas.inv, terminal: 'caSaida' }]);
    expect(passo('ligar-aparelho').onde!(estado.projeto, CATALOGO)).toEqual([{ tipo: 'terminal', disp: pecas.vent, terminal: 'plug' }]);
  });

  it('de noite, o passo da placa diz que a corrente aparece com sol; de dia, não diz nada', () => {
    const passo = ROTEIRO_TUTORIAL.passos.find((p) => p.id === 'cabos-da-placa')!;
    expect(passo.agora!(estado.projeto, CATALOGO, { solNoCeu: false, horaLocal: 21, bateriaCheia: false })).toContain('quando o sol nascer');
    expect(passo.agora!(estado.projeto, CATALOGO, { solNoCeu: true, horaLocal: 12, bateriaCheia: false })).toBeNull();
  });

  it('a placa ligada antes de pôr o fusível do controlador queima o controlador de dia (é por isso que ela vem por último)', () => {
    entrar(12);
    const placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-quartinho'));
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    const doControlador = liga(bat, 'pos', ctl, 'batPos');
    liga(bat, 'neg', ctl, 'batNeg');
    acoes.instalarProtecao(doControlador, 'prot-disjuntor-cc-80');
    liga(placa, 'pos', ctl, 'pvPos');
    liga(placa, 'neg', ctl, 'pvNeg');
    expect(estado.projeto.dispositivos.find((d) => d.uid === ctl)?.queimado?.codigo).toBe('controlador-sem-bateria');
  });
});

describe('experimente errar', () => {
  let pecas: Pecas;
  let inicio = 0;
  const contexto = (): ContextoDoErro => ({ eventos: estado.simulacao.eventos.slice(inicio), tutorialEmDia: passoDaVez() === null });
  const erro = (id: string) => ERROS_GUIADOS.find((e) => e.id === id)!;
  /** Índice do primeiro passo do erro que ainda não está feito (os passos andam em ordem). */
  const passoDoErro = (id: string, desde = 0): string | null => {
    const passos = erro(id).passos;
    let i = desde;
    while (i < passos.length && passos[i]!.feito(estado.projeto, CATALOGO, contexto())) i += 1;
    return passos[i]?.id ?? null;
  };

  beforeEach(() => {
    entrar(12);
    pecas = fazerOTutorial();
    inicio = estado.simulacao.eventos.length;
  });

  it('os três erros, com o que vai acontecer, o porquê e o de verdade', () => {
    expect(ERROS_GUIADOS.map((e) => e.id)).toEqual(['placas-antes-da-bateria', 'aparelho-grande', 'bateria-invertida']);
    for (const e of ERROS_GUIADOS) {
      for (const t of [e.oQueVaiAcontecer, e.porQue, e.deVerdade, e.licao]) expect(t.length).toBeGreaterThan(20);
      expect(e.passos.length).toBeGreaterThan(1);
    }
    expect(erro('aparelho-grande').oQueVaiAcontecer).toContain('micro-ondas de 1.300 W num inversor de 500 W');
  });

  it('placa sem a bateria: abrir o disjuntor do controlador ao meio-dia queima; fechar e consertar resolve', () => {
    expect(passoDoErro('placas-antes-da-bateria')).toBe('abrir');
    acoes.alternarProtecao(pecas.doControlador, 0);
    expect(estado.simulacao.eventos.slice(inicio).map((e) => e.codigo)).toEqual(['controlador-sem-bateria']);
    expect(passoDoErro('placas-antes-da-bateria')).toBe('consertar');
    // Consertar com o disjuntor aberto e sol: queima de novo.
    acoes.consertar({ tipo: 'dispositivo', uid: pecas.ctl });
    expect(estado.projeto.dispositivos.find((d) => d.uid === pecas.ctl)?.queimado).toBeDefined();
    // Na ordem do texto: fecha o disjuntor, depois conserta.
    acoes.alternarProtecao(pecas.doControlador, 0);
    acoes.consertar({ tipo: 'dispositivo', uid: pecas.ctl });
    expect(estado.projeto.dispositivos.find((d) => d.uid === pecas.ctl)?.queimado).toBeUndefined();
    expect(passoDoErro('placas-antes-da-bateria')).toBeNull();
  });

  it('placa sem a bateria, de noite: só apaga, e queima quando o relógio vai ao meio-dia', () => {
    acoes.definirTempo(MEIA_NOITE + 22 * MS_HORA);
    inicio = estado.simulacao.eventos.length;
    acoes.alternarProtecao(pecas.doControlador, 0);
    expect(estado.simulacao.eventos.length).toBe(inicio);
    acoes.definirTempo(MEIA_NOITE + 12 * MS_HORA);
    expect(estado.simulacao.eventos.slice(inicio).map((e) => e.codigo)).toEqual(['controlador-sem-bateria']);
  });

  it('aparelho grande: o micro-ondas no horário de uso põe o inversor em falha; desligar e religar resolve', () => {
    expect(passoDoErro('aparelho-grande')).toBe('por-aparelho');
    const mo = acoes.adicionarDispositivo('ap-microondas', em('piso-quartinho', 0.2));
    liga(mo, 'plug', pecas.inv, 'caSaida');
    expect(passoDoErro('aparelho-grande')).toBe('ligar');
    // Às 12 h o micro-ondas está no horário dele (das 12 às 13 h).
    acoes.definirLigado(mo, true);
    expect(estado.simulacao.eventos.slice(inicio).map((e) => e.codigo)).toEqual(['sobrecarga']);
    expect(passoDoErro('aparelho-grande', 1)).toBe('religar');
    // Religar com o micro-ondas ligado: cai de novo.
    acoes.definirLigado(pecas.inv, true);
    expect(estado.projeto.dispositivos.find((d) => d.uid === pecas.inv)?.falha).toBe('sobrecarga');
    acoes.definirLigado(mo, false);
    acoes.definirLigado(pecas.inv, true);
    expect(passoDoErro('aparelho-grande', 1)).toBeNull();
  });

  it('aparelho grande fora do horário: ligado, não pede nada; com o uso o dia inteiro, entra em falha', () => {
    acoes.definirTempo(MEIA_NOITE + 15 * MS_HORA);
    inicio = estado.simulacao.eventos.length;
    const mo = acoes.adicionarDispositivo('ap-microondas', em('piso-quartinho', 0.2));
    liga(mo, 'plug', pecas.inv, 'caSaida');
    acoes.definirLigado(mo, true);
    expect(estado.simulacao.eventos.length).toBe(inicio);
    acoes.definirUso(mo, { inicio: 0, fim: 24 });
    expect(estado.simulacao.eventos.slice(inicio).map((e) => e.codigo)).toEqual(['sobrecarga']);
  });

  it('bateria invertida: desligar, trocar os cabos, fechar o fusível queima o inversor; desfazer, consertar e ligar resolve', () => {
    const id = 'bateria-invertida';
    expect(passoDoErro(id)).toBe('desligar');
    acoes.definirLigado(pecas.vent, false);
    acoes.definirLigado(pecas.inv, false);
    acoes.alternarProtecao(pecas.positivo, 0);
    expect(passoDoErro(id)).toBe('apagar');
    for (const c of estado.projeto.cabos.filter((x) => [x.de.disp, x.para.disp].includes(pecas.inv) && [x.de.disp, x.para.disp].includes(pecas.bat))) acoes.removerCabo(c.uid);
    expect(passoDoErro(id, 1)).toBe('cruzar-positivo');
    const trocadoPos = liga(pecas.bat, 'pos', pecas.inv, 'batNeg');
    acoes.instalarProtecao(trocadoPos, 'prot-fusivel-anl-100');
    expect(passoDoErro(id, 2)).toBe('cruzar-negativo');
    const trocadoNeg = liga(pecas.bat, 'neg', pecas.inv, 'batPos');
    expect(estado.simulacao.eventos.length).toBe(inicio);
    expect(passoDoErro(id, 3)).toBe('fechar');
    acoes.alternarProtecao(trocadoPos, 0);
    expect(estado.simulacao.eventos.slice(inicio).map((e) => e.codigo)).toEqual(['bateria-invertida']);
    expect(estado.projeto.dispositivos.find((d) => d.uid === pecas.inv)?.queimado?.codigo).toBe('bateria-invertida');
    expect(estado.projeto.cabos.find((c) => c.uid === trocadoPos)?.estados).toEqual(['queimada']);
    expect(passoDoErro(id, 4)).toBe('desfazer');
    acoes.removerCabo(trocadoPos);
    acoes.removerCabo(trocadoNeg);
    const positivo = liga(pecas.bat, 'pos', pecas.inv, 'batPos');
    liga(pecas.bat, 'neg', pecas.inv, 'batNeg');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-100');
    expect(passoDoErro(id, 5)).toBe('consertar');
    acoes.consertar({ tipo: 'dispositivo', uid: pecas.inv });
    acoes.alternarProtecao(positivo, 0);
    acoes.definirLigado(pecas.inv, true);
    acoes.definirLigado(pecas.vent, true);
    expect(estado.simulacao.eventos.length).toBe(inicio + 1);
    expect(passoDoErro(id, 5)).toBeNull();
  });
});
