// Os dois roteiros da casa ("Meu primeiro sistema (12 V)" e "O plano da casa (24 V)") feitos com as ações do estado,
// como o usuário faria pela tela, no molde de tutorial.test.ts. O que se confere: cada passo, feito como o texto manda,
// fica feito, o painel anda para o seguinte e nada queima, em qualquer hora do dia simulado; e a ordem antiga do
// roteiro de 12 V (placa ligada antes de a bateria chegar ao controlador) queima o controlador de dia.

import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { acoes, emTutorial, estado, recalcularAgora } from '../estado';
import { ROTEIRO_12V, ROTEIRO_24V, ROTEIROS, type Roteiro } from './roteiros';

const MS_HORA = 3_600_000;
/** 21/06/2026, 0:00 no Rio (UTC − 3). */
const MEIA_NOITE = Date.UTC(2026, 5, 21, 3, 0, 0);
/** Placa deitada, de face para o céu: recebe sol em qualquer hora com o sol acima do horizonte. */
const PARA_CIMA: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

const em = (superficie: string, x = 0, quat: [number, number, number, number] = [0, 0, 0, 1]) => ({
  pos: [x, 0.5, 0] as [number, number, number],
  quat,
  superficie,
  giro: 0,
});
const liga = (a: string, ta: string, b: string, tb: string): string => acoes.adicionarCabo({ disp: a, terminal: ta }, { disp: b, terminal: tb }, 1)!;

function passoDaVez(roteiro: Roteiro): string | null {
  recalcularAgora();
  const p = roteiro.passos.find((x) => !x.feito(estado.projeto, estado.derivados, CATALOGO));
  return p?.id ?? null;
}

const nadaQueimou = (): boolean =>
  estado.simulacao.eventos.length === 0 &&
  estado.projeto.dispositivos.every((d) => d.queimado === undefined && d.falha === undefined) &&
  estado.projeto.cabos.every((c) => c.queimado === undefined && (c.estados ?? []).every((s) => s !== 'queimada'));

/** Como o painel começa um roteiro da casa: a mesma casa, sem peças nem cabos; o de 24 V mantém a tomada da rede. */
function comecar(roteiro: Roteiro, hora: number): void {
  if (emTutorial()) acoes.sairDoTutorial();
  acoes.novoProjeto();
  const base = structuredClone(estado.projeto);
  const precisaDaRede = roteiro.passos.some((p) => p.itemId === 'rede-tomada');
  acoes.carregarProjeto({
    ...base,
    dispositivos: precisaDaRede ? base.dispositivos.filter((d) => CATALOGO.get(d.itemId)?.categoria === 'rede') : [],
    cabos: [],
  });
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  acoes.definirTempo(MEIA_NOITE + hora * MS_HORA);
  recalcularAgora();
}

/** Faz os passos na ordem dada, conferindo a cada um o passo da vez e que nada queimou. */
function fazer(roteiro: Roteiro, ordem: [string, () => void][]): void {
  expect(ordem.map(([id]) => id)).toEqual(roteiro.passos.map((p) => p.id));
  for (const [id, acao] of ordem) {
    // A conferência do consultor não tem ação: sem erro na montagem, ela já está feita e o painel passa direto.
    if (id === 'sem-erros') {
      const sugestoes = estado.derivados.sugestoes.filter((s) => s.nivel === 'erro').map((s) => s.titulo);
      expect(passoDaVez(roteiro), `a montagem certa não deveria ter erro no consultor: ${JSON.stringify(sugestoes)}`).not.toBe('sem-erros');
      continue;
    }
    expect(passoDaVez(roteiro), `antes de ${id}`).toBe(id);
    acao();
    expect(nadaQueimou(), `depois de ${id}: ${JSON.stringify(estado.simulacao.eventos)}`).toBe(true);
  }
  expect(passoDaVez(roteiro)).toBeNull();
}

interface Pecas12 {
  placa: string;
  bat: string;
  inv: string;
  ctl: string;
  lampada: string;
  positivo: string;
  doControlador: string;
}

function fazer12V(): Pecas12 {
  const x = {} as Pecas12;
  fazer(ROTEIRO_12V, [
    ['bateria', () => (x.bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5)))],
    ['inversor', () => (x.inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5)))],
    // Cabo positivo, fusível nele e só então o negativo (seguranca.ts, `bateria-fusivel-no-positivo`).
    ['cabo-positivo', () => (x.positivo = liga(x.bat, 'pos', x.inv, 'batPos'))],
    ['fusivel', () => acoes.instalarProtecao(x.positivo, 'prot-fusivel-anl-100')],
    ['cabo-negativo', () => liga(x.bat, 'neg', x.inv, 'batNeg')],
    ['controlador', () => {
      x.ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
      x.doControlador = liga(x.bat, 'pos', x.ctl, 'batPos');
      acoes.instalarProtecao(x.doControlador, 'prot-disjuntor-cc-80');
      liga(x.bat, 'neg', x.ctl, 'batNeg');
    }],
    ['placa', () => (x.placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-varanda-frente', 0, PARA_CIMA)))],
    ['aparelho', () => {
      x.lampada = acoes.adicionarDispositivo('ap-lampada', em('parede-sala', 1));
      liga(x.lampada, 'plug', x.inv, 'caSaida');
    }],
    ['sem-erros', () => undefined],
    ['fechar-fusivel', () => acoes.alternarProtecao(x.positivo, 0)],
    ['fechar-controlador', () => acoes.alternarProtecao(x.doControlador, 0)],
    ['cabos-da-placa', () => {
      liga(x.placa, 'pos', x.ctl, 'pvPos');
      liga(x.placa, 'neg', x.ctl, 'pvNeg');
    }],
    ['ligar-inversor', () => acoes.definirLigado(x.inv, true)],
    ['ligar-aparelho', () => acoes.definirLigado(x.lampada, true)],
  ]);
  return x;
}

interface Pecas24 {
  bat: string;
  inv: string;
  placa1: string;
  placa2: string;
  positivo: string;
  dasPlacas: string;
  aparelhos: string[];
  saidas: string[];
}

function fazer24V(): Pecas24 {
  const x = { aparelhos: [], saidas: [] } as unknown as Pecas24;
  const rede = estado.projeto.dispositivos.find((d) => CATALOGO.get(d.itemId)?.categoria === 'rede')!.uid;
  fazer(ROTEIRO_24V, [
    ['bateria', () => (x.bat = acoes.adicionarDispositivo('bat-alfx-24v-100', em('piso-quartinho', -0.5)))],
    ['inversor', () => (x.inv = acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', em('parede-quartinho-fundo', 0.5)))],
    ['cabo-positivo', () => (x.positivo = liga(x.bat, 'pos', x.inv, 'batPos'))],
    ['fusivel', () => acoes.instalarProtecao(x.positivo, 'prot-fusivel-anl-150')],
    ['cabo-negativo', () => liga(x.bat, 'neg', x.inv, 'batNeg')],
    ['placas', () => {
      x.placa1 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', -1, PARA_CIMA));
      x.placa2 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', 1, PARA_CIMA));
      liga(x.placa1, 'neg', x.placa2, 'pos');
    }],
    ['cabo-positivo-das-placas', () => (x.dasPlacas = liga(x.placa1, 'pos', x.inv, 'pvPos'))],
    ['protecoes-das-placas', () => {
      acoes.adicionarDispositivo('acc-quadro-8', em('parede-quartinho-fundo', -1));
      acoes.instalarProtecao(x.dasPlacas, 'prot-disjuntor-cc-32');
      acoes.instalarProtecao(x.dasPlacas, 'prot-dps-cc-600');
    }],
    ['cabo-negativo-das-placas', () => liga(x.placa2, 'neg', x.inv, 'pvNeg')],
    ['aparelhos-na-saida', () => {
      for (const [i, id] of ['ap-geladeira', 'ap-ventilador', 'ap-tv'].entries()) {
        const uid = acoes.adicionarDispositivo(id, em('piso-terreo', i));
        const cabo = liga(x.inv, 'caSaida', uid, 'plug');
        acoes.instalarProtecao(cabo, 'prot-disjuntor-ca-16');
        x.aparelhos.push(uid);
        x.saidas.push(cabo);
      }
    }],
    ['sem-erros', () => undefined],
    ['fechar-fusivel', () => acoes.alternarProtecao(x.positivo, 0)],
    ['fechar-placas', () => {
      const cabo = estado.projeto.cabos.find((c) => c.uid === x.dasPlacas)!;
      const i = cabo.protecoes.indexOf('prot-disjuntor-cc-32');
      acoes.alternarProtecao(x.dasPlacas, i);
    }],
    ['ligar-inversor', () => acoes.definirLigado(x.inv, true)],
    ['fechar-saida', () => {
      for (const cabo of x.saidas) acoes.alternarProtecao(cabo, 0);
    }],
    ['tomada-da-rede', () => liga(x.inv, 'caEntrada', rede, 'tomada')],
    ['ligar-aparelhos', () => {
      for (const uid of x.aparelhos) acoes.definirLigado(uid, true);
    }],
  ]);
  return x;
}

const HORAS = [0, 6, 7, 9, 12, 15, 17.5, 18, 21];

describe('roteiros da casa: as duas partes', () => {
  it('cada roteiro tem a parte de montar e depois a de ligar, e termina ligando os aparelhos', () => {
    for (const r of ROTEIROS) {
      const partes = r.passos.map((p) => p.parte);
      const primeiroLigar = partes.indexOf('Parte 2: ligar');
      expect(primeiroLigar, r.id).toBeGreaterThan(0);
      expect(partes.slice(0, primeiroLigar).every((x) => x === 'Parte 1: montar'), r.id).toBe(true);
      expect(partes.slice(primeiroLigar).every((x) => x === 'Parte 2: ligar'), r.id).toBe(true);
      expect(r.passos[primeiroLigar - 1]!.id).toBe('sem-erros');
      expect(r.passos[primeiroLigar]!.id).toBe('fechar-fusivel');
      expect(r.passos[primeiroLigar]!.texto).toContain('inversor está desligado');
    }
    expect(ROTEIRO_12V.passos.filter((p) => p.parte === 'Parte 2: ligar').map((p) => p.id)).toEqual([
      'fechar-fusivel', 'fechar-controlador', 'cabos-da-placa', 'ligar-inversor', 'ligar-aparelho',
    ]);
    expect(ROTEIRO_24V.passos.filter((p) => p.parte === 'Parte 2: ligar').map((p) => p.id)).toEqual([
      'fechar-fusivel', 'fechar-placas', 'ligar-inversor', 'fechar-saida', 'tomada-da-rede', 'ligar-aparelhos',
    ]);
  });
});

describe('roteiro de 12 V feito com as ações do estado', () => {
  for (const hora of HORAS) {
    it(`feito na ordem, nada queima às ${hora} h`, () => {
      comecar(ROTEIRO_12V, hora);
      fazer12V();
    });
  }

  it('com "Ligar o sistema" no lugar das manobras, os passos ficam feitos do mesmo jeito', () => {
    comecar(ROTEIRO_12V, 12);
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    acoes.instalarProtecao(liga(bat, 'pos', inv, 'batPos'), 'prot-fusivel-anl-100');
    liga(bat, 'neg', inv, 'batNeg');
    const ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    acoes.instalarProtecao(liga(bat, 'pos', ctl, 'batPos'), 'prot-disjuntor-cc-80');
    liga(bat, 'neg', ctl, 'batNeg');
    const placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-varanda-frente', 0, PARA_CIMA));
    const lampada = acoes.adicionarDispositivo('ap-lampada', em('parede-sala', 1));
    liga(lampada, 'plug', inv, 'caSaida');
    expect(passoDaVez(ROTEIRO_12V)).toBe('fechar-fusivel');
    expect(acoes.energizar()).toBeNull();
    // O atalho fecha as proteções e liga o inversor: falta ligar a placa e o aparelho, com a mão.
    expect(passoDaVez(ROTEIRO_12V)).toBe('cabos-da-placa');
    liga(placa, 'pos', ctl, 'pvPos');
    liga(placa, 'neg', ctl, 'pvNeg');
    expect(passoDaVez(ROTEIRO_12V)).toBe('ligar-aparelho');
    acoes.definirLigado(lampada, true);
    expect(passoDaVez(ROTEIRO_12V)).toBeNull();
    expect(nadaQueimou()).toBe(true);
  });

  it('quem liga os dois cabos da bateria antes do fusível não fica preso: o passo do negativo já aparece feito', () => {
    comecar(ROTEIRO_12V, 12);
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    const positivo = liga(bat, 'pos', inv, 'batPos');
    liga(bat, 'neg', inv, 'batNeg');
    expect(passoDaVez(ROTEIRO_12V)).toBe('fusivel');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-100');
    expect(passoDaVez(ROTEIRO_12V)).toBe('controlador');
  });

  it('a ordem antiga (placa ligada ao controlador antes de fechar a proteção da bateria) queima o controlador de dia', () => {
    comecar(ROTEIRO_12V, 12);
    const bat = acoes.adicionarDispositivo('bat-moura-12mn105', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-aiker-500-12v-110', em('piso-quartinho', 0.5));
    acoes.instalarProtecao(liga(bat, 'pos', inv, 'batPos'), 'prot-fusivel-anl-100');
    liga(bat, 'neg', inv, 'batNeg');
    const ctl = acoes.adicionarDispositivo('ctl-pwm-30a', em('parede-quartinho-fundo'));
    acoes.instalarProtecao(liga(bat, 'pos', ctl, 'batPos'), 'prot-disjuntor-cc-80');
    liga(bat, 'neg', ctl, 'batNeg');
    expect(nadaQueimou()).toBe(true);
    const placa = acoes.adicionarDispositivo('placa-resun-100', em('telhado-varanda-frente', 0, PARA_CIMA));
    liga(placa, 'pos', ctl, 'pvPos');
    liga(placa, 'neg', ctl, 'pvNeg');
    expect(estado.projeto.dispositivos.find((d) => d.uid === ctl)?.queimado?.codigo).toBe('controlador-sem-bateria');
  });

  it('o passo de pôr o fusível pede o inversor desligado', () => {
    comecar(ROTEIRO_12V, 12);
    const x = fazer12V();
    const passo = ROTEIRO_12V.passos.find((p) => p.id === 'fechar-fusivel')!;
    const momento = { solNoCeu: true, horaLocal: 12, bateriaCheia: false };
    acoes.definirLigado(x.lampada, false);
    acoes.alternarProtecao(x.positivo, 0);
    expect(passo.agora!(estado.projeto, CATALOGO, momento)).toContain('desligue-o');
    acoes.definirLigado(x.inv, false);
    expect(passo.agora!(estado.projeto, CATALOGO, momento)).toBeNull();
  });

  it('desligar o inversor depois do fim volta o painel ao passo de ligá-lo', () => {
    comecar(ROTEIRO_12V, 21);
    const x = fazer12V();
    acoes.definirLigado(x.inv, false);
    expect(passoDaVez(ROTEIRO_12V)).toBe('ligar-inversor');
  });
});

describe('roteiro de 24 V feito com as ações do estado', () => {
  for (const hora of HORAS) {
    it(`feito na ordem, nada queima às ${hora} h`, () => {
      comecar(ROTEIRO_24V, hora);
      fazer24V();
    });
  }

  it('ao meio-dia, com o inversor ligado, as placas carregam a bateria', () => {
    comecar(ROTEIRO_24V, 12);
    fazer24V();
    expect(estado.simulacao.saida.pvDisponivelW).toBeGreaterThan(0);
  });

  it('"Ligar o sistema" faz as manobras de ligar; a rede e os aparelhos ficam para a mão', () => {
    comecar(ROTEIRO_24V, 12);
    const rede = estado.projeto.dispositivos.find((d) => CATALOGO.get(d.itemId)?.categoria === 'rede')!.uid;
    const bat = acoes.adicionarDispositivo('bat-alfx-24v-100', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', em('parede-quartinho-fundo', 0.5));
    acoes.instalarProtecao(liga(bat, 'pos', inv, 'batPos'), 'prot-fusivel-anl-150');
    liga(bat, 'neg', inv, 'batNeg');
    const p1 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', -1, PARA_CIMA));
    const p2 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', 1, PARA_CIMA));
    liga(p1, 'neg', p2, 'pos');
    const dasPlacas = liga(p1, 'pos', inv, 'pvPos');
    acoes.adicionarDispositivo('acc-quadro-8', em('parede-quartinho-fundo', -1));
    acoes.instalarProtecao(dasPlacas, 'prot-disjuntor-cc-32');
    acoes.instalarProtecao(dasPlacas, 'prot-dps-cc-600');
    liga(p2, 'neg', inv, 'pvNeg');
    const geladeira = acoes.adicionarDispositivo('ap-geladeira', em('piso-terreo'));
    acoes.instalarProtecao(liga(inv, 'caSaida', geladeira, 'plug'), 'prot-disjuntor-ca-16');
    expect(passoDaVez(ROTEIRO_24V)).toBe('fechar-fusivel');
    expect(acoes.energizar()).toBeNull();
    expect(passoDaVez(ROTEIRO_24V)).toBe('tomada-da-rede');
    liga(inv, 'caEntrada', rede, 'tomada');
    expect(passoDaVez(ROTEIRO_24V)).toBe('ligar-aparelhos');
    acoes.definirLigado(geladeira, true);
    expect(passoDaVez(ROTEIRO_24V)).toBeNull();
    expect(nadaQueimou()).toBe(true);
  });

  it('quem liga os dois cabos da bateria antes do fusível não fica preso', () => {
    comecar(ROTEIRO_24V, 12);
    const bat = acoes.adicionarDispositivo('bat-alfx-24v-100', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', em('parede-quartinho-fundo', 0.5));
    const positivo = liga(bat, 'pos', inv, 'batPos');
    liga(bat, 'neg', inv, 'batNeg');
    expect(passoDaVez(ROTEIRO_24V)).toBe('fusivel');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-150');
    expect(passoDaVez(ROTEIRO_24V)).toBe('placas');
  });

  it('um aparelho desligado depois do fim volta o painel ao passo dos aparelhos', () => {
    comecar(ROTEIRO_24V, 9);
    const x = fazer24V();
    acoes.definirLigado(x.aparelhos[1]!, false);
    expect(passoDaVez(ROTEIRO_24V)).toBe('ligar-aparelhos');
  });
});
