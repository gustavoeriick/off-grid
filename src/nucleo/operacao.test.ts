import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Catalogo, Item, Protecao } from '../catalogo/tipos';
import { cenarioPlanoCorrigido, CASA_INICIAL } from './cenarios';
import { analisarCircuito } from './circuito';
import { estadoInicial, estadoPlaca, infoBanco, passoSimulacao, RENDIMENTO_MPPT } from './eletrica';
import {
  analiseSoDoControlador, aplicarConsequencias, aplicarManobras, arcoNoConector, arcoNoDisjuntorCa, avaliarOperacao,
  bateriaPresente, caboInterrompido, consertar, correntesDeOperacao, estadoDaProtecao, inversaoNaMontagem, inversorOperando,
  passoDeOperacao, planoDeDesenergizar, polosTrocados, projetoVivo, sequenciaDeDesenergizar, sequenciaDeEnergizar,
  type Consequencia,
} from './operacao';
import type { Cabo, CondicaoPlaca, Dano, EstadoProtecao, EstadoSim, Projeto, SaidaPasso } from './tipos';

// ---------------------------------------------------------------- Montagem dos casos

type Ligacao = [de: string, para: string, protecoes?: string[], caboId?: string];

/** Monta um projeto: `pecas` mapeia `uid` para `id` do catálogo; cada ligação é um par `uid.terminal`. */
function montar(pecas: Record<string, string>, ligacoes: Ligacao[], ligados: Record<string, boolean> = {}): Projeto {
  const cabos: Cabo[] = ligacoes.map(([de, para, protecoes = [], caboId = 'cabo-bat-25'], i) => {
    const [dDe, tDe] = de.split('.');
    const [dPara, tPara] = para.split('.');
    return {
      uid: `c${i + 1}`, de: { disp: dDe, terminal: tDe }, para: { disp: dPara, terminal: tPara },
      caboId, comprimento: 1, protecoes, quadro: null,
    };
  });
  return {
    versao: 2, nome: 'teste', casa: structuredClone(CASA_INICIAL), localId: 'rio', clima: 'tipico', tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: ligados[uid] ?? true, uso: null,
    })),
    cabos,
  };
}

const FUSIVEL = 'prot-fusivel-anl-100';
const DISJ_CC_32 = 'prot-disjuntor-cc-32';
const DISJ_CC_125 = 'prot-disjuntor-cc-125';
const DISJ_CA = 'prot-disjuntor-ca-16';
const DPS = 'prot-dps-cc-600';

/**
 * O sistema do tutorial: placa, bateria, controlador PWM e inversor de 12 V, com um ventilador na saída.
 * c1 e c2: bateria no inversor (fusível no positivo). c3 e c4: bateria no controlador (fusível no positivo).
 * c5 e c6: placa no controlador. c7: saída do inversor no ventilador.
 */
function tutorial(opcoes: { fusiveis?: boolean } = {}): Projeto {
  const fusivel = opcoes.fusiveis === false ? [] : [FUSIVEL];
  return montar(
    { p1: 'placa-resun-100', b1: 'bat-moura-12mn105', inv: 'inv-aiker-500-12v-110', ctl: 'ctl-pwm-30a', vent: 'ap-ventilador' },
    [
      ['b1.pos', 'inv.batPos', fusivel], ['b1.neg', 'inv.batNeg'],
      ['ctl.batPos', 'b1.pos', fusivel], ['ctl.batNeg', 'b1.neg'],
      ['p1.pos', 'ctl.pvPos', [], 'cabo-solar-6'], ['p1.neg', 'ctl.pvNeg', [], 'cabo-solar-6'],
      ['inv.caSaida', 'vent.plug', [], 'cabo-ca-2p5'],
    ],
  );
}

const SOL: ReadonlyMap<string, CondicaoPlaca> = new Map([['p1', { g: 800, tAmb: 25 }]]);
const ESCURO: ReadonlyMap<string, CondicaoPlaca> = new Map([['p1', { g: 0, tAmb: 25 }]]);
const MS = 1_700_000_000_000;

interface Situacao { saida: SaidaPasso; consequencias: Consequencia[] }

/** O que a operação diz do projeto neste instante: análise viva, passo de 5 minutos e consequências. */
function situacao(projeto: Projeto, placas = SOL, catalogo: Catalogo = CATALOGO): Situacao {
  const vivo = projetoVivo(projeto, catalogo);
  const analise = analisarCircuito(vivo, catalogo);
  const inv = projeto.dispositivos.find((d) => catalogo.get(d.itemId)?.categoria === 'inversor');
  const saida = passoSimulacao(vivo, catalogo, analise, estadoInicial(), {
    dtHoras: 1 / 12, redeDisponivel: false, horaLocal: null, placas, inversorLigado: inv ? inversorOperando(inv) : true,
  });
  return { saida, consequencias: avaliarOperacao(projeto, catalogo, analise, saida, placas, MS) };
}

const codigos = (s: Situacao): string[] => s.consequencias.map((c) => c.codigo);

function com(projeto: Projeto, mudar: (p: Projeto) => void): Projeto {
  const copia = structuredClone(projeto);
  mudar(copia);
  return copia;
}
const estados = (p: Projeto, cabo: string, ...e: EstadoProtecao[]): void => {
  p.cabos.find((c) => c.uid === cabo)!.estados = e;
};
const dano: Dano = { codigo: 'curto-na-bateria', msUtc: 1 };

/** Catálogo com um fusível pequeno e um disjuntor pequeno, para provocar `fusivel-queimou` e `desarme`. */
function catalogoComProtecoesPequenas(): Catalogo {
  const base = CATALOGO.get(FUSIVEL) as Protecao;
  const disj = CATALOGO.get(DISJ_CC_32) as Protecao;
  return new Map<string, Item>(CATALOGO)
    .set('teste-fusivel-5', { ...base, id: 'teste-fusivel-5', correnteA: 5 })
    .set('teste-disjuntor-5', { ...disj, id: 'teste-disjuntor-5', correnteA: 5 });
}

// ---------------------------------------------------------------- Chaves e peças vivas

describe('estadoDaProtecao, caboInterrompido e projetoVivo', () => {
  it('campo ausente vale fechada', () => {
    const p = tutorial();
    expect(p.cabos[0].estados).toBeUndefined();
    expect(estadoDaProtecao(p.cabos[0], 0)).toBe('fechada');
    expect(p.cabos.some((c) => caboInterrompido(c, p))).toBe(false);
    expect(projetoVivo(p, CATALOGO).cabos).toHaveLength(p.cabos.length);
  });

  it('lê o estado de cada proteção pelo índice', () => {
    const p = com(tutorial(), (x) => estados(x, 'c1', 'aberta'));
    expect(estadoDaProtecao(p.cabos[0], 0)).toBe('aberta');
    expect(estadoDaProtecao(p.cabos[0], 1)).toBe('fechada');
  });

  it('proteção aberta, proteção queimada, cabo queimado e ponta em peça queimada interrompem', () => {
    const p = com(tutorial(), (x) => {
      estados(x, 'c1', 'aberta');
      estados(x, 'c3', 'queimada');
      x.cabos.find((c) => c.uid === 'c2')!.queimado = dano;
      x.dispositivos.find((d) => d.uid === 'p1')!.queimado = dano;
    });
    const interrompidos = p.cabos.filter((c) => caboInterrompido(c, p, CATALOGO)).map((c) => c.uid);
    expect(interrompidos).toEqual(['c1', 'c2', 'c3', 'c5', 'c6']);
  });

  it('projetoVivo tira só os cabos interrompidos', () => {
    const p = com(tutorial(), (x) => estados(x, 'c1', 'aberta'));
    const vivo = projetoVivo(p, CATALOGO);
    expect(vivo.cabos.map((c) => c.uid)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    expect(vivo.dispositivos).toBe(p.dispositivos);
    expect(p.cabos).toHaveLength(7);
  });

  it('DPS não tem chave: nunca interrompe', () => {
    const p = com(tutorial(), (x) => {
      x.cabos[4].protecoes = [DPS];
      estados(x, 'c5', 'aberta');
    });
    expect(caboInterrompido(p.cabos[4], p, CATALOGO)).toBe(false);
  });
});

describe('inversorOperando', () => {
  const inv = tutorial().dispositivos.find((d) => d.uid === 'inv')!;
  it('exige ligado, sem falha e sem queimado', () => {
    expect(inversorOperando(inv)).toBe(true);
    expect(inversorOperando({ ...inv, ligado: false })).toBe(false);
    expect(inversorOperando({ ...inv, falha: 'sobrecarga' })).toBe(false);
    expect(inversorOperando({ ...inv, queimado: dano })).toBe(false);
  });
});

describe('bateriaPresente e polosTrocados', () => {
  it('bateria ligada: presente no inversor e no controlador, polos certos', () => {
    const p = tutorial();
    expect(bateriaPresente(p, CATALOGO, 'inv')).toBe(true);
    expect(bateriaPresente(p, CATALOGO, 'ctl')).toBe(true);
    expect(polosTrocados(p, CATALOGO, 'inv')).toBe(false);
  });

  it('proteção da bateria aberta tira a bateria do aparelho dela, não dos outros', () => {
    const p = com(tutorial(), (x) => estados(x, 'c3', 'aberta'));
    expect(bateriaPresente(p, CATALOGO, 'ctl')).toBe(false);
    expect(bateriaPresente(p, CATALOGO, 'inv')).toBe(true);
  });

  it('polos trocados nos terminais do inversor', () => {
    const p = com(tutorial(), (x) => {
      x.cabos[0].para = { disp: 'inv', terminal: 'batNeg' };
      x.cabos[1].para = { disp: 'inv', terminal: 'batPos' };
    });
    expect(polosTrocados(p, CATALOGO, 'inv')).toBe(true);
    expect(bateriaPresente(p, CATALOGO, 'inv')).toBe(false);
  });

  it('peça que não é inversor nem controlador não tem bateria presente', () => {
    expect(bateriaPresente(tutorial(), CATALOGO, 'p1')).toBe(false);
  });
});

// ---------------------------------------------------------------- Consequências da tabela

describe('avaliarOperacao: tudo certo', () => {
  it('o sistema do tutorial, com tudo fechado e com sol, não gera nada', () => {
    expect(codigos(situacao(tutorial()))).toEqual([]);
  });

  it('o cenário pronto (campos ausentes) não gera nada, com e sem sol', () => {
    const p = cenarioPlanoCorrigido();
    const sol = new Map<string, CondicaoPlaca>([['placa1', { g: 800, tAmb: 25 }], ['placa2', { g: 800, tAmb: 25 }]]);
    expect(codigos(situacao(p, sol))).toEqual([]);
    expect(codigos(situacao(p, new Map()))).toEqual([]);
  });

  it('inversor ligado sem bateria presente: não liga, e nada se estraga', () => {
    const p = com(tutorial(), (x) => estados(x, 'c1', 'aberta'));
    p.cabos = p.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4' && c.uid !== 'c5' && c.uid !== 'c6');
    const s = situacao(p);
    expect(s.saida.avisos).toContain('sem-bateria');
    expect(s.saida.cargaAtendidaW).toBe(0);
    expect(s.consequencias).toEqual([]);
  });

  it('abrir a proteção da bateria do inversor com ele atendendo: a saída cai, sem dano', () => {
    const p = com(tutorial(), (x) => estados(x, 'c1', 'aberta'));
    const s = situacao(p, ESCURO);
    expect(s.saida.cargaAtendidaW).toBe(0);
    expect(s.consequencias).toEqual([]);
  });
});

describe('avaliarOperacao: controlador sem bateria', () => {
  const semBateria = (): Projeto =>
    com(tutorial(), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    });

  it('placas ligadas antes da bateria, com sol: o controlador queima', () => {
    const s = situacao(semBateria());
    expect(codigos(s)).toEqual(['controlador-sem-bateria']);
    expect(s.consequencias[0].uids).toEqual(['ctl']);
    expect(s.consequencias[0].mudancas).toEqual([{ tipo: 'peca-queimada', uid: 'ctl', dano: { codigo: 'controlador-sem-bateria', msUtc: MS } }]);
  });

  it('o erro armado à noite acontece quando o sol nasce', () => {
    expect(codigos(situacao(semBateria(), ESCURO))).toEqual([]);
    expect(codigos(situacao(semBateria(), SOL))).toEqual(['controlador-sem-bateria']);
  });

  it('abrir a proteção da bateria do controlador com as placas gerando também queima', () => {
    const p = com(tutorial(), (x) => estados(x, 'c3', 'aberta'));
    expect(codigos(situacao(p))).toEqual(['controlador-sem-bateria']);
  });

  it('proteção da bateria aberta e proteção das placas aberta: nada (fileira não está viva)', () => {
    const p = com(tutorial(), (x) => {
      estados(x, 'c3', 'aberta');
      x.cabos[4].protecoes = [DISJ_CC_32];
      estados(x, 'c5', 'aberta');
    });
    expect(codigos(situacao(p))).toEqual([]);
  });

  it('com a bateria presente e as placas gerando: nada', () => {
    expect(codigos(situacao(tutorial()))).toEqual([]);
  });
});

describe('avaliarOperacao: bateria invertida', () => {
  const inverter = (p: Projeto, aparelho: 'inv' | 'ctl'): Projeto =>
    com(p, (x) => {
      // Os cabos do inversor saem da bateria (`de`); os do controlador chegam nela (`para`).
      if (aparelho === 'inv') {
        x.cabos[0].de = { disp: 'b1', terminal: 'neg' };
        x.cabos[1].de = { disp: 'b1', terminal: 'pos' };
      } else {
        x.cabos[2].para = { disp: 'b1', terminal: 'neg' };
        x.cabos[3].para = { disp: 'b1', terminal: 'pos' };
      }
    });

  it('no inversor: queima na hora e o fusível do caminho também queima', () => {
    const p = com(tutorial(), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    });
    const s = situacao(inverter(p, 'inv'), ESCURO);
    expect(codigos(s)).toEqual(['bateria-invertida']);
    const mudancas = s.consequencias[0].mudancas;
    expect(mudancas).toContainEqual({ tipo: 'peca-queimada', uid: 'inv', dano: { codigo: 'bateria-invertida', msUtc: MS } });
    expect(mudancas).toContainEqual({ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' });
  });

  it('no inversor, com disjuntor CC no caminho: o disjuntor desarma', () => {
    const p = com(inverter(tutorial(), 'inv'), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
      x.cabos[0].protecoes = [DISJ_CC_125];
    });
    const s = situacao(p, ESCURO);
    expect(s.consequencias[0].mudancas).toContainEqual({ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'aberta' });
  });

  it('no inversor, sem proteção: queima só o inversor', () => {
    const p = com(inverter(tutorial({ fusiveis: false }), 'inv'), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    });
    expect(situacao(p, ESCURO).consequencias[0].mudancas).toHaveLength(1);
  });

  it('com o fusível do caminho fora (aberto), nada acontece até fechar', () => {
    const base = com(inverter(tutorial(), 'inv'), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
      estados(x, 'c1', 'aberta');
    });
    expect(codigos(situacao(base, ESCURO))).toEqual([]);
    estados(base, 'c1', 'fechada');
    expect(codigos(situacao(base, ESCURO))).toEqual(['bateria-invertida']);
  });

  it('no controlador, com sol: o controlador queima', () => {
    const p = inverter(tutorial(), 'ctl');
    const s = situacao(p);
    expect(codigos(s)).toEqual(['bateria-invertida']);
    expect(s.consequencias[0].uids).toEqual(['ctl']);
  });

  it('no controlador, sem sol: ele só não liga; corrigindo a ligação, volta', () => {
    const p = inverter(tutorial(), 'ctl');
    expect(codigos(situacao(p, ESCURO))).toEqual([]);
    expect(polosTrocados(p, CATALOGO, 'ctl')).toBe(true);
  });
});

describe('avaliarOperacao: curto na bateria', () => {
  const comJumper = (p: Projeto): Projeto =>
    com(p, (x) => {
      x.cabos.push({
        uid: 'c8', de: { disp: 'inv', terminal: 'batPos' }, para: { disp: 'inv', terminal: 'batNeg' },
        caboId: 'cabo-bat-25', comprimento: 1, protecoes: [], quadro: null,
      });
    });

  it('com fusível fechado no laço: o fusível queima', () => {
    const s = situacao(comJumper(tutorial()), ESCURO);
    const curto = s.consequencias.filter((c) => c.codigo === 'curto-na-bateria');
    expect(curto).toHaveLength(1);
    expect(curto[0].mudancas).toEqual([{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' }]);
  });

  it('com várias proteções no laço, a de menor corrente abre (o disjuntor desarma)', () => {
    const p = com(comJumper(tutorial()), (x) => {
      x.cabos[1].protecoes = [DISJ_CC_32];
    });
    const curto = situacao(p, ESCURO).consequencias.find((c) => c.codigo === 'curto-na-bateria')!;
    expect(curto.mudancas).toEqual([{ tipo: 'protecao', cabo: 'c2', indice: 0, estado: 'aberta' }]);
  });

  it('proteção aberta no laço não conta; sem nenhuma fechada, os cabos do laço queimam', () => {
    const p = comJumper(tutorial({ fusiveis: false }));
    const curto = situacao(p, ESCURO).consequencias.find((c) => c.codigo === 'curto-na-bateria')!;
    expect(curto.mudancas.map((m) => (m.tipo === 'cabo-queimado' ? m.uid : '?')).sort()).toEqual(['c1', 'c2', 'c8']);
  });

  it('curto direto nos terminais da bateria, sem proteção: o cabo do curto queima', () => {
    const p = com(tutorial({ fusiveis: false }), (x) => {
      x.cabos.push({
        uid: 'c8', de: { disp: 'b1', terminal: 'pos' }, para: { disp: 'b1', terminal: 'neg' },
        caboId: 'cabo-bat-25', comprimento: 1, protecoes: [], quadro: null,
      });
    });
    const curto = situacao(p, ESCURO).consequencias.find((c) => c.codigo === 'curto-na-bateria')!;
    expect(curto.mudancas).toEqual([{ tipo: 'cabo-queimado', uid: 'c8', dano: { codigo: 'curto-na-bateria', msUtc: MS } }]);
  });

  describe('banco em série, com o curto entre BAT+ e BAT−', () => {
    /** b1 e b2 em série (c1 a c3) e o jumper c4 entre os terminais de bateria do inversor. */
    const serie = (fusivel: string[]): Projeto =>
      montar(
        { b1: 'bat-moura-12mn105', b2: 'bat-moura-12mn105', inv: 'inv-aiker-500-12v-110' },
        [['b1.pos', 'inv.batPos', fusivel], ['b1.neg', 'b2.pos'], ['b2.neg', 'inv.batNeg'], ['inv.batPos', 'inv.batNeg']],
      );

    it('com fusível no laço: o fusível queima, uma vez', () => {
      const curto = situacao(serie([FUSIVEL]), ESCURO).consequencias.filter((c) => c.codigo === 'curto-na-bateria');
      expect(curto).toHaveLength(1);
      expect(curto[0].mudancas).toEqual([{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' }]);
    });

    it('sem proteção: queimam os cabos do laço (os dois da bateria e o do curto), não o da emenda entre as baterias', () => {
      const curto = situacao(serie([]), ESCURO).consequencias.find((c) => c.codigo === 'curto-na-bateria')!;
      expect(curto.mudancas.map((m) => (m.tipo === 'cabo-queimado' ? m.uid : '?')).sort()).toEqual(['c1', 'c3', 'c4']);
    });

    it('depois do fusível queimado, o laço some e nada acontece de novo', () => {
      const p = com(serie([FUSIVEL]), (x) => estados(x, 'c1', 'queimada'));
      expect(situacao(p, ESCURO).consequencias.filter((c) => c.codigo === 'curto-na-bateria')).toEqual([]);
    });
  });

  it('o curto desfeito com a proteção aberta: não gera de novo', () => {
    const p = com(comJumper(tutorial()), (x) => estados(x, 'c1', 'queimada'));
    expect(situacao(p, ESCURO).consequencias.filter((c) => c.codigo === 'curto-na-bateria')).toEqual([]);
  });
});

describe('avaliarOperacao: curto nas placas e placa invertida não geram nada', () => {
  it('curto nas placas', () => {
    const p = com(tutorial(), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c5' && c.uid !== 'c6');
      x.cabos.push({ uid: 'c8', de: { disp: 'ctl', terminal: 'pvPos' }, para: { disp: 'ctl', terminal: 'pvNeg' }, caboId: 'cabo-solar-6', comprimento: 1, protecoes: [], quadro: null });
    });
    expect(codigos(situacao(p))).toEqual([]);
  });

  it('placa invertida', () => {
    const p = com(tutorial(), (x) => {
      x.cabos[4].de = { disp: 'p1', terminal: 'neg' };
      x.cabos[5].de = { disp: 'p1', terminal: 'pos' };
    });
    expect(codigos(situacao(p))).toEqual([]);
  });
});

describe('avaliarOperacao: sobrecarga, desarme e fusível', () => {
  const comAparelho = (itemId: string): Projeto =>
    com(tutorial(), (x) => {
      x.dispositivos.find((d) => d.uid === 'vent')!.itemId = itemId;
    });

  it('aparelho maior que o inversor: o inversor fica em falha', () => {
    const s = situacao(comAparelho('ap-microondas'), ESCURO);
    expect(s.saida.avisos).toContain('sobrecarga');
    expect(s.consequencias).toEqual([
      { codigo: 'sobrecarga', uids: ['inv'], msUtc: MS, mudancas: [{ tipo: 'falha', uid: 'inv', falha: 'sobrecarga' }] },
    ]);
  });

  it('em falha o inversor não atende, não gera nova sobrecarga e volta ao ser religado', () => {
    const p = com(comAparelho('ap-microondas'), (x) => {
      x.dispositivos.find((d) => d.uid === 'inv')!.falha = 'sobrecarga';
    });
    const s = situacao(p, ESCURO);
    expect(s.saida.avisos).not.toContain('sobrecarga');
    expect(s.saida.cargaAtendidaW).toBe(0);
    expect(s.consequencias).toEqual([]);
    const religado = com(p, (x) => {
      delete x.dispositivos.find((d) => d.uid === 'inv')!.falha;
    });
    expect(situacao(religado, ESCURO).consequencias.map((c) => c.codigo)).toEqual(['sobrecarga']);
  });

  it('corrente de operação acima da nominal do disjuntor fechado: ele desarma', () => {
    const catalogo = catalogoComProtecoesPequenas();
    const p = com(tutorial(), (x) => {
      x.cabos[0].protecoes = ['teste-disjuntor-5'];
    });
    const s = situacao(p, ESCURO, catalogo);
    expect(s.consequencias).toEqual([
      { codigo: 'desarme', uids: ['c1'], msUtc: MS, mudancas: [{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'aberta' }] },
    ]);
    // Uma nominal maior que a corrente não desarma.
    expect(codigos(situacao(com(p, (x) => { x.cabos[0].protecoes = [DISJ_CC_125]; }), ESCURO, catalogo))).toEqual([]);
  });

  it('corrente de operação acima da nominal do fusível: ele queima', () => {
    const catalogo = catalogoComProtecoesPequenas();
    const p = com(tutorial(), (x) => {
      x.cabos[0].protecoes = ['teste-fusivel-5'];
    });
    const s = situacao(p, ESCURO, catalogo);
    expect(s.consequencias).toEqual([
      { codigo: 'fusivel-queimou', uids: ['c1'], msUtc: MS, mudancas: [{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' }] },
    ]);
  });

  it('proteção já aberta ou queimada não gera nada de novo', () => {
    const catalogo = catalogoComProtecoesPequenas();
    const p = com(tutorial(), (x) => {
      x.cabos[0].protecoes = ['teste-fusivel-5'];
      estados(x, 'c1', 'queimada');
    });
    expect(codigos(situacao(p, ESCURO, catalogo))).toEqual([]);
  });
});

describe('aplicarConsequencias', () => {
  it('devolve um projeto novo com as mudanças e não toca no original', () => {
    const original = tutorial();
    const antes = structuredClone(original);
    const consequencias = situacao(com(original, (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    })).consequencias;
    const depois = aplicarConsequencias(original, [
      ...consequencias,
      { codigo: 'curto-na-bateria', uids: ['c1'], msUtc: MS, mudancas: [{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' }, { tipo: 'cabo-queimado', uid: 'c2', dano }] },
      { codigo: 'sobrecarga', uids: ['inv'], msUtc: MS, mudancas: [{ tipo: 'falha', uid: 'inv', falha: 'sobrecarga' }] },
    ]);
    expect(original).toEqual(antes);
    expect(depois).not.toBe(original);
    expect(depois.dispositivos.find((d) => d.uid === 'ctl')!.queimado?.codigo).toBe('controlador-sem-bateria');
    expect(depois.dispositivos.find((d) => d.uid === 'inv')!.falha).toBe('sobrecarga');
    expect(depois.cabos.find((c) => c.uid === 'c1')!.estados).toEqual(['queimada']);
    expect(depois.cabos.find((c) => c.uid === 'c2')!.queimado).toEqual(dano);
  });

  it('peça já queimada não queima de novo; proteção queimada não vira aberta; peça queimada não gera nada novo', () => {
    const queimada = com(tutorial(), (x) => {
      x.dispositivos.find((d) => d.uid === 'ctl')!.queimado = dano;
      estados(x, 'c1', 'queimada');
    });
    const depois = aplicarConsequencias(queimada, [
      { codigo: 'bateria-invertida', uids: ['ctl'], msUtc: MS, mudancas: [{ tipo: 'peca-queimada', uid: 'ctl', dano: { codigo: 'bateria-invertida', msUtc: MS } }, { tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'aberta' }] },
    ]);
    expect(depois.dispositivos.find((d) => d.uid === 'ctl')!.queimado).toEqual(dano);
    expect(depois.cabos.find((c) => c.uid === 'c1')!.estados).toEqual(['queimada']);
  });

  it('sem consequências devolve o mesmo projeto', () => {
    const p = tutorial();
    expect(aplicarConsequencias(p, [])).toBe(p);
  });

  it('depois de aplicar, a peça queimada não gera nada de novo e o erro some do passo seguinte', () => {
    const p = com(tutorial(), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    });
    const queimado = aplicarConsequencias(p, situacao(p).consequencias);
    expect(codigos(situacao(queimado))).toEqual([]);
    expect(caboInterrompido(queimado.cabos.find((c) => c.uid === 'c5')!, queimado, CATALOGO)).toBe(true);
  });
});

// ---------------------------------------------------------------- Consertar

describe('consertar', () => {
  it('tira o queimado de peça e de cabo, limpa a falha e troca a proteção queimada por aberta', () => {
    const p = com(tutorial(), (x) => {
      const inv = x.dispositivos.find((d) => d.uid === 'inv')!;
      inv.queimado = dano;
      inv.falha = 'sobrecarga';
      x.cabos[1].queimado = dano;
      estados(x, 'c1', 'queimada');
    });
    const a = consertar(p, { tipo: 'dispositivo', uid: 'inv' });
    expect(a.dispositivos.find((d) => d.uid === 'inv')).not.toHaveProperty('queimado');
    expect(a.dispositivos.find((d) => d.uid === 'inv')).not.toHaveProperty('falha');
    const b = consertar(p, { tipo: 'cabo', uid: 'c2' });
    expect(b.cabos[1]).not.toHaveProperty('queimado');
    const c = consertar(p, { tipo: 'protecao', cabo: 'c1', indice: 0 });
    expect(c.cabos[0].estados).toEqual(['aberta']);
    expect(p.dispositivos.find((d) => d.uid === 'inv')!.queimado).toEqual(dano);
  });

  it('consertar sem corrigir a causa: queima de novo quando energizado', () => {
    const p = com(tutorial(), (x) => {
      x.cabos = x.cabos.filter((c) => c.uid !== 'c3' && c.uid !== 'c4');
    });
    const queimado = aplicarConsequencias(p, situacao(p).consequencias);
    expect(codigos(situacao(queimado))).toEqual([]);
    const consertado = consertar(queimado, { tipo: 'dispositivo', uid: 'ctl' });
    expect(codigos(situacao(consertado))).toEqual(['controlador-sem-bateria']);
  });
});

// ---------------------------------------------------------------- Correntes e arcos

describe('correntesDeOperacao', () => {
  it('sem fluxo nenhum, todos os cabos ficam com zero', () => {
    const p = tutorial();
    const s = situacao(p, ESCURO, CATALOGO);
    const analise = analisarCircuito(p, CATALOGO);
    const semFluxo = { ...s.saida, pvW: 0, bateriaW: 0, redeW: 0, cargaAtendidaW: 0 };
    const correntes = correntesDeOperacao(p, CATALOGO, analise, semFluxo);
    expect([...correntes.values()].every((i) => i === 0)).toBe(true);
    expect(correntes.size).toBe(p.cabos.length);
  });

  it('com sol e o ventilador atendido: há corrente nas placas, na bateria e na saída; cabo interrompido fica com zero', () => {
    const p = com(tutorial(), (x) => estados(x, 'c3', 'aberta'));
    const vivo = projetoVivo(p, CATALOGO);
    const analise = analisarCircuito(vivo, CATALOGO);
    const saida = passoSimulacao(vivo, CATALOGO, analise, estadoInicial(), { dtHoras: 1 / 12, redeDisponivel: false, horaLocal: null, placas: SOL });
    const correntes = correntesDeOperacao(p, CATALOGO, analise, saida);
    expect(saida.cargaAtendidaW).toBeGreaterThan(0);
    expect(correntes.get('c7')).toBeGreaterThan(0);
    expect(correntes.get('c1')).toBeGreaterThan(0);
    expect(correntes.get('c3')).toBe(0);
  });
});

describe('arcoNoConector', () => {
  const funcionando = (): { p: Projeto; correntes: Map<string, number> } => {
    const p = tutorial();
    const analise = analisarCircuito(p, CATALOGO);
    const saida = passoSimulacao(p, CATALOGO, analise, estadoInicial(), { dtHoras: 1 / 12, redeDisponivel: false, horaLocal: null, placas: SOL });
    return { p, correntes: correntesDeOperacao(p, CATALOGO, analise, saida) };
  };

  it('apagar o cabo das placas com corrente: a placa da ponta queima', () => {
    const { p, correntes } = funcionando();
    const c = arcoNoConector(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c5' }, correntes, MS)!;
    expect(c.codigo).toBe('arco-no-conector');
    expect(c.mudancas).toEqual([{ tipo: 'peca-queimada', uid: 'p1', dano: { codigo: 'arco-no-conector', msUtc: MS } }]);
  });

  it('apagar a placa com corrente, ligada a um controlador: fica só o evento, sem dano (a placa apagada some)', () => {
    const { p, correntes } = funcionando();
    const c = arcoNoConector(p, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'p1' }, correntes, MS)!;
    expect(c.codigo).toBe('arco-no-conector');
    expect(c.uids).toEqual(['p1']);
    expect(c.mudancas).toEqual([]);
  });

  describe('emenda entre duas placas em série', () => {
    const serie = (): { p: Projeto; correntes: Map<string, number> } => {
      const p = montar(
        { p1: 'placa-resun-100', p2: 'placa-resun-100', ctl: 'ctl-pwm-30a' },
        [['p1.pos', 'ctl.pvPos', [], 'cabo-solar-6'], ['p1.neg', 'p2.pos', [], 'cabo-solar-6'], ['p2.neg', 'ctl.pvNeg', [], 'cabo-solar-6']],
      );
      return { p, correntes: new Map(p.cabos.map((c) => [c.uid, 5])) };
    };

    it('apagar uma placa com corrente: queima a placa da outra ponta da emenda, não a apagada', () => {
      const { p, correntes } = serie();
      const c = arcoNoConector(p, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'p1' }, correntes, MS)!;
      expect(c.mudancas).toEqual([{ tipo: 'peca-queimada', uid: 'p2', dano: { codigo: 'arco-no-conector', msUtc: MS } }]);
      expect(c.uids).toEqual(['p1', 'p2']);
    });

    it('a outra placa já queimada não queima de novo', () => {
      const { p, correntes } = serie();
      const queimada = com(p, (x) => { x.dispositivos.find((d) => d.uid === 'p2')!.queimado = dano; });
      expect(arcoNoConector(queimada, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'p1' }, correntes, MS)!.mudancas).toEqual([]);
    });

    it('apagar um cabo continua queimando a placa da ponta (as duas, na emenda)', () => {
      const { p, correntes } = serie();
      const c = arcoNoConector(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c2' }, correntes, MS)!;
      expect(c.mudancas.map((m) => (m.tipo === 'peca-queimada' ? m.uid : '?')).sort()).toEqual(['p1', 'p2']);
    });
  });

  it('sem corrente (noite), cabo que não é das placas ou peça que não é placa: nada', () => {
    const { p, correntes } = funcionando();
    const noite = new Map([...correntes].map(([k]) => [k, 0]));
    expect(arcoNoConector(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c5' }, noite, MS)).toBeNull();
    expect(arcoNoConector(p, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'p1' }, noite, MS)).toBeNull();
    expect(arcoNoConector(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c1' }, correntes, MS)).toBeNull();
    expect(arcoNoConector(p, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'b1' }, correntes, MS)).toBeNull();
  });
});

describe('arcoNoDisjuntorCa', () => {
  const montagem = (protecoes: string[]): { p: Projeto; correntes: Map<string, number> } => {
    const p = com(tutorial(), (x) => {
      x.cabos[0].protecoes = protecoes;
      x.cabos[6].protecoes = [DISJ_CA];
    });
    const analise = analisarCircuito(p, CATALOGO);
    const saida = passoSimulacao(p, CATALOGO, analise, estadoInicial(), { dtHoras: 1 / 12, redeDisponivel: false, horaLocal: null, placas: ESCURO });
    return { p, correntes: correntesDeOperacao(p, CATALOGO, analise, saida) };
  };

  it('abrir disjuntor CA em cabo de corrente contínua com corrente: o disjuntor queima', () => {
    const { p, correntes } = montagem([DISJ_CA]);
    const c = arcoNoDisjuntorCa(p, CATALOGO, { tipo: 'abrir-protecao', cabo: 'c1', indice: 0 }, correntes, MS)!;
    expect(c.codigo).toBe('arco-no-disjuntor-ca');
    expect(c.mudancas).toEqual([{ tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'queimada' }]);
  });

  it('sem corrente, no circuito de corrente alternada, ou com outro tipo de proteção: nada', () => {
    const { p, correntes } = montagem([DISJ_CA]);
    const semCorrente = new Map([...correntes].map(([k]) => [k, 0]));
    expect(arcoNoDisjuntorCa(p, CATALOGO, { tipo: 'abrir-protecao', cabo: 'c1', indice: 0 }, semCorrente, MS)).toBeNull();
    expect(arcoNoDisjuntorCa(p, CATALOGO, { tipo: 'abrir-protecao', cabo: 'c7', indice: 0 }, correntes, MS)).toBeNull();
    const fusivel = montagem([FUSIVEL]);
    expect(arcoNoDisjuntorCa(fusivel.p, CATALOGO, { tipo: 'abrir-protecao', cabo: 'c1', indice: 0 }, fusivel.correntes, MS)).toBeNull();
    expect(arcoNoDisjuntorCa(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c1' }, correntes, MS)).toBeNull();
  });
});

// ---------------------------------------------------------------- Ordem de ligar e desligar

describe('sequenciaDeEnergizar e sequenciaDeDesenergizar', () => {
  /** Tutorial com proteção nas placas e tudo aberto e desligado, como uma peça posta pelo usuário. */
  const tudoAberto = (): Projeto =>
    com(tutorial(), (x) => {
      x.cabos[4].protecoes = [DISJ_CC_32, DPS];
      x.cabos[6].protecoes = [DISJ_CA];
      for (const c of x.cabos) if (c.protecoes.length > 0) c.estados = c.protecoes.map(() => 'aberta');
      x.dispositivos.find((d) => d.uid === 'inv')!.ligado = false;
    });
  const sequencia = (p: Projeto) => sequenciaDeEnergizar(p, CATALOGO, analisarCircuito(p, CATALOGO));

  it('fecha na ordem: bateria, placas, inversor, saída; DPS e aparelhos ficam de fora', () => {
    const { manobras, recusa } = sequencia(tudoAberto());
    expect(recusa).toBeNull();
    expect(manobras).toEqual([
      { tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'fechada' },
      { tipo: 'protecao', cabo: 'c3', indice: 0, estado: 'fechada' },
      { tipo: 'protecao', cabo: 'c5', indice: 0, estado: 'fechada' },
      { tipo: 'inversor', uid: 'inv', ligado: true },
      { tipo: 'protecao', cabo: 'c7', indice: 0, estado: 'fechada' },
    ]);
  });

  it('já energizado: não há o que fazer; inversor em falha entra para ser religado', () => {
    const p = tutorial();
    expect(sequencia(p).manobras).toEqual([]);
    const emFalha = com(p, (x) => { x.dispositivos.find((d) => d.uid === 'inv')!.falha = 'sobrecarga'; });
    expect(sequencia(emFalha).manobras).toEqual([{ tipo: 'inversor', uid: 'inv', ligado: true }]);
  });

  it('proteção queimada fica de fora', () => {
    const p = com(tudoAberto(), (x) => estados(x, 'c1', 'queimada'));
    expect(sequencia(p).manobras.some((m) => m.tipo === 'protecao' && m.cabo === 'c1')).toBe(false);
  });

  it('recusa com bateria invertida, com o motivo, e não manda manobra nenhuma', () => {
    const p = com(tudoAberto(), (x) => {
      x.cabos[0].de = { disp: 'b1', terminal: 'neg' };
      x.cabos[1].de = { disp: 'b1', terminal: 'pos' };
    });
    const { manobras, recusa } = sequencia(p);
    expect(manobras).toEqual([]);
    expect(recusa?.codigo).toBe('bateria-invertida');
    expect(recusa?.texto.length).toBeGreaterThan(0);
  });

  it('recusa com curto', () => {
    const p = com(tudoAberto(), (x) => {
      x.cabos.push({ uid: 'c8', de: { disp: 'inv', terminal: 'batPos' }, para: { disp: 'inv', terminal: 'batNeg' }, caboId: 'cabo-bat-25', comprimento: 1, protecoes: [], quadro: null });
    });
    expect(sequencia(p).recusa?.codigo).toBe('curto-bateria');
  });

  it('desenergizar é a ordem inversa: saída, inversor, placas, bateria', () => {
    const p = com(tutorial(), (x) => {
      x.cabos[4].protecoes = [DISJ_CC_32];
      x.cabos[6].protecoes = [DISJ_CA];
    });
    expect(sequenciaDeDesenergizar(p, CATALOGO, analisarCircuito(p, CATALOGO))).toEqual([
      { tipo: 'protecao', cabo: 'c7', indice: 0, estado: 'aberta' },
      { tipo: 'inversor', uid: 'inv', ligado: false },
      { tipo: 'protecao', cabo: 'c5', indice: 0, estado: 'aberta' },
      { tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'aberta' },
      { tipo: 'protecao', cabo: 'c3', indice: 0, estado: 'aberta' },
    ]);
  });

  it('o resultado da sequência, aplicado, deixa o sistema vivo e sem dano', () => {
    const p = tudoAberto();
    let atual = p;
    for (const m of sequencia(p).manobras) {
      atual = m.tipo === 'protecao'
        ? com(atual, (x) => {
            const c = x.cabos.find((k) => k.uid === m.cabo)!;
            const e = c.protecoes.map((_, i) => estadoDaProtecao(c, i));
            e[m.indice] = m.estado;
            c.estados = e;
          })
        : com(atual, (x) => { x.dispositivos.find((d) => d.uid === m.uid)!.ligado = m.ligado; });
      expect(codigos(situacao(atual)), JSON.stringify(m)).toEqual([]);
    }
    expect(atual.cabos.every((c) => !caboInterrompido(c, atual, CATALOGO))).toBe(true);
    expect(situacao(atual, ESCURO).saida.cargaAtendidaW).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- Correções da revisão da fase 8

describe('revisão da fase 8: desligar sem deixar o controlador sem bateria', () => {
  const plano = (p: Projeto) => planoDeDesenergizar(p, CATALOGO, analisarCircuito(p, CATALOGO));

  it('placas ligadas direto no controlador, sem chave: a proteção da bateria dele fica fechada, com aviso', () => {
    const p = tutorial();
    const { manobras, aviso } = plano(p);
    expect(manobras).toEqual([
      { tipo: 'inversor', uid: 'inv', ligado: false },
      { tipo: 'protecao', cabo: 'c1', indice: 0, estado: 'aberta' },
    ]);
    expect(aviso).toEqual({
      codigo: 'placas-sem-chave',
      uids: ['ctl', 'c3'],
      texto: 'O controlador ficou ligado à bateria: as placas dele não têm disjuntor. Para desligar tudo, solte ou cubra as placas antes.',
    });
    // Aplicado, com sol: nada queima. Com a sequência antiga (c3 também aberto), o controlador queimava.
    expect(codigos(situacao(aplicarManobras(p, manobras)))).toEqual([]);
    const antiga = aplicarManobras(p, [...manobras, { tipo: 'protecao', cabo: 'c3', indice: 0, estado: 'aberta' }]);
    expect(codigos(situacao(antiga))).toEqual(['controlador-sem-bateria']);
    expect(sequenciaDeDesenergizar(p, CATALOGO, analisarCircuito(p, CATALOGO))).toEqual(manobras);
  });

  it('vale também de noite (o sol nasce depois) e some com um disjuntor nas placas', () => {
    expect(codigos(situacao(tutorial(), ESCURO))).toEqual([]);
    expect(plano(tutorial()).aviso?.codigo).toBe('placas-sem-chave');
    const comDisjuntor = com(tutorial(), (x) => { x.cabos[4].protecoes = [DISJ_CC_32]; });
    expect(plano(comDisjuntor).aviso).toBeNull();
    expect(plano(comDisjuntor).manobras.map((m) => (m.tipo === 'protecao' ? m.cabo : m.uid))).toEqual(['inv', 'c5', 'c1', 'c3']);
  });

  it('a proteção da bateria do inversor também fica fechada quando o controlador depende dela', () => {
    // O controlador ligado nos terminais de bateria do inversor: a bateria só chega a ele pelo cabo c1.
    const p = com(tutorial(), (x) => {
      x.cabos[2].para = { disp: 'inv', terminal: 'batPos' };
      x.cabos[2].protecoes = [];
      x.cabos[3].para = { disp: 'inv', terminal: 'batNeg' };
    });
    const { manobras, aviso } = plano(p);
    expect(manobras).toEqual([{ tipo: 'inversor', uid: 'inv', ligado: false }]);
    expect(aviso?.uids).toEqual(['ctl', 'c1']);
  });

  it('controlador que já está sem bateria, ou sem placas ligadas, não segura nada', () => {
    const semPlacas = com(tutorial(), (x) => { x.cabos = x.cabos.filter((c) => c.uid !== 'c5' && c.uid !== 'c6'); });
    expect(plano(semPlacas).aviso).toBeNull();
    expect(plano(semPlacas).manobras.map((m) => (m.tipo === 'protecao' ? m.cabo : m.uid))).toEqual(['inv', 'c1', 'c3']);
  });
});

describe('revisão da fase 8: ligar não fecha as placas de um controlador sem bateria', () => {
  const tudoAberto = (): Projeto =>
    com(tutorial(), (x) => {
      x.cabos[4].protecoes = [DISJ_CC_32];
      for (const c of x.cabos) if (c.protecoes.length > 0) c.estados = c.protecoes.map(() => 'aberta');
      x.dispositivos.find((d) => d.uid === 'inv')!.ligado = false;
    });
  const sequencia = (p: Projeto) => sequenciaDeEnergizar(p, CATALOGO, analisarCircuito(p, CATALOGO));

  it('fusível da bateria do controlador queimado: recusa e diz o que trocar primeiro', () => {
    const p = com(tudoAberto(), (x) => estados(x, 'c3', 'queimada'));
    const { manobras, recusa } = sequencia(p);
    expect(manobras).toEqual([]);
    expect(recusa?.codigo).toBe('controlador-sem-bateria');
    expect(recusa?.uids).toEqual(['ctl', 'c3']);
    expect(recusa?.texto).toBe(
      `O fusível da bateria do controlador de carga está queimado (${CATALOGO.get(FUSIVEL)!.nome}). Troque o fusível antes de ligar o sistema: com as placas ligadas e sem bateria, o controlador queima.`,
    );
    // Era isto que a sequência antiga fazia: fechar c1 e c5, com c3 queimado. Com sol, o controlador queima.
    const antiga = com(p, (x) => { estados(x, 'c1', 'fechada'); estados(x, 'c5', 'fechada'); });
    expect(codigos(situacao(antiga))).toEqual(['controlador-sem-bateria']);
  });

  it('disjuntor queimado e cabo queimado no caminho também recusam, cada um com o seu texto', () => {
    const disjuntor = com(tudoAberto(), (x) => { x.cabos[2].protecoes = [DISJ_CA]; estados(x, 'c3', 'queimada'); });
    expect(sequencia(disjuntor).recusa?.texto).toContain(`A proteção da bateria do controlador de carga está queimada (${CATALOGO.get(DISJ_CA)!.nome})`);
    const cabo = com(tudoAberto(), (x) => { x.cabos[3].queimado = dano; });
    expect(sequencia(cabo).recusa).toMatchObject({ codigo: 'controlador-sem-bateria', uids: ['ctl', 'c4'] });
    expect(sequencia(cabo).recusa?.texto).toContain('O cabo entre a bateria e o controlador de carga está queimado');
  });

  it('trocado o fusível (volta aberto), a sequência liga tudo; sem chave nas placas não há o que recusar', () => {
    const trocado = consertar(com(tudoAberto(), (x) => estados(x, 'c3', 'queimada')), { tipo: 'protecao', cabo: 'c3', indice: 0 });
    const { manobras, recusa } = sequencia(trocado);
    expect(recusa).toBeNull();
    expect(manobras.map((m) => (m.tipo === 'protecao' ? m.cabo : m.uid))).toEqual(['c1', 'c3', 'c5', 'inv']);
    const semChave = com(tutorial(), (x) => { estados(x, 'c1', 'aberta'); estados(x, 'c3', 'queimada'); });
    expect(sequencia(semChave).recusa).toBeNull();
  });
});

describe('revisão da fase 8: bateria invertida no controlador', () => {
  /** A bateria certa no inversor e de polos trocados no controlador; tudo aberto, com disjuntor nas placas. */
  const invertida = (): Projeto =>
    com(tutorial(), (x) => {
      x.cabos[2].para = { disp: 'b1', terminal: 'neg' };
      x.cabos[3].para = { disp: 'b1', terminal: 'pos' };
      x.cabos[4].protecoes = [DISJ_CC_32];
      for (const c of x.cabos) if (c.protecoes.length > 0) c.estados = c.protecoes.map(() => 'aberta');
    });

  it('a análise de projeto não acusa, mas a montagem tem os polos trocados no controlador', () => {
    const p = invertida();
    expect(analisarCircuito(p, CATALOGO).problemas.map((x) => x.codigo)).not.toContain('bateria-invertida');
    // Com as chaves abertas, nada está vivo; olhando a montagem inteira, os polos estão trocados.
    expect(polosTrocados(p, CATALOGO, 'ctl')).toBe(false);
    expect(inversaoNaMontagem(p, CATALOGO, 'ctl')).toEqual(['b1']);
    expect(inversaoNaMontagem(p, CATALOGO, 'inv')).toBeNull();
    expect(inversaoNaMontagem(tutorial(), CATALOGO, 'ctl')).toBeNull();
  });

  it('`sequenciaDeEnergizar` recusa, em vez de fechar as chaves e queimar o controlador', () => {
    const p = invertida();
    const { manobras, recusa } = sequenciaDeEnergizar(p, CATALOGO, analisarCircuito(p, CATALOGO));
    expect(manobras).toEqual([]);
    expect(recusa?.codigo).toBe('bateria-invertida');
    expect(recusa?.uids).toEqual(['ctl', 'b1']);
    expect(recusa?.texto).toContain('polos trocados');
    // Fechando tudo à mão, com sol, é o controlador que queima.
    const fechado = com(p, (x) => { for (const c of x.cabos) delete c.estados; });
    expect(situacao(fechado).consequencias.map((c) => `${c.codigo}:${c.uids.join(',')}`)).toEqual(['bateria-invertida:ctl']);
  });
});

describe('revisão da fase 8: corrente de operação com sinal', () => {
  const MEIA_CARGA: EstadoSim = { soc: 0.5, cortado: false, emRede: false };
  /**
   * 12 V, bateria de lítio, controlador MPPT de 40 A com duas placas de 585 W em paralelo, disjuntor CC de 80 A no cabo
   * do inversor (c1) e no do controlador (c3), e só o ventilador. `noInversor`: o controlador ligado nos terminais de
   * bateria do inversor, em vez de nos polos da bateria.
   */
  const carregando = (noInversor = false): Projeto =>
    montar(
      { p1: 'placa-renepv-585', p2: 'placa-renepv-585', b1: 'bat-belifou-12v-100', inv: 'inv-aiker-500-12v-110', ctl: 'ctl-epever-xtra4210n', vent: 'ap-ventilador' },
      [
        ['b1.pos', 'inv.batPos', ['prot-disjuntor-cc-80']], ['b1.neg', 'inv.batNeg'],
        ['ctl.batPos', noInversor ? 'inv.batPos' : 'b1.pos', ['prot-disjuntor-cc-80']], ['ctl.batNeg', noInversor ? 'inv.batNeg' : 'b1.neg'],
        ['p1.pos', 'ctl.pvPos', [], 'cabo-solar-6'], ['p1.neg', 'ctl.pvNeg', [], 'cabo-solar-6'],
        ['p2.pos', 'ctl.pvPos', [], 'cabo-solar-6'], ['p2.neg', 'ctl.pvNeg', [], 'cabo-solar-6'],
        ['inv.caSaida', 'vent.plug', [], 'cabo-ca-2p5'],
      ],
    );
  const luz = (g1: number, g2 = g1): ReadonlyMap<string, CondicaoPlaca> => new Map([['p1', { g: g1, tAmb: 25 }], ['p2', { g: g2, tAmb: 25 }]]);
  const medir = (p: Projeto, placas: ReadonlyMap<string, CondicaoPlaca>, comPlacas = true) => {
    const viva = analisarCircuito(projetoVivo(p, CATALOGO), CATALOGO);
    const saida = passoSimulacao(p, CATALOGO, viva, MEIA_CARGA, { dtHoras: 0, redeDisponivel: false, horaLocal: null, placas, inversorLigado: true });
    const banco = infoBanco(viva.sistema!, p, CATALOGO)!;
    return {
      saida, banco,
      correntes: correntesDeOperacao(p, CATALOGO, viva, saida, null, comPlacas ? placas : undefined),
      consequencias: avaliarOperacao(p, CATALOGO, viva, saida, placas, MS),
    };
  };

  it('a bateria carregando recebe corrente: o cabo do inversor leva só o que ele consome, e o disjuntor de 80 A não desarma', () => {
    for (const g of [600, 800, 1000]) {
      const { saida, banco, correntes, consequencias } = medir(carregando(), luz(g));
      expect(saida.bateriaW).toBeGreaterThan(0);
      expect(saida.cargaAtendidaW).toBeGreaterThan(0);
      const doControlador = saida.pvW / banco.tensaoCarga;
      const daBateria = saida.bateriaW / banco.tensaoRef;
      expect(correntes.get('c3')).toBeCloseTo(doControlador, 9);
      // Árvore com o sorvedouro no BAT+ do inversor: inversor ← bateria ← controlador. No cabo c1 passa a soma com sinal.
      expect(correntes.get('c1')).toBeCloseTo(Math.abs(doControlador - daBateria), 9);
      // Antes, as duas correntes se somavam em c1 (mais de 80 A) e o disjuntor desarmava com um ventilador ligado.
      expect(doControlador + daBateria).toBeGreaterThan(80);
      expect(correntes.get('c1')!).toBeLessThan(80);
      expect(consequencias.map((c) => c.codigo)).toEqual([]);
    }
  });

  it('com o controlador no barramento do inversor, o cabo da bateria leva abs(bateriaW) / tensaoRef', () => {
    const { saida, banco, correntes, consequencias } = medir(carregando(true), luz(800));
    expect(saida.bateriaW).toBeGreaterThan(0);
    expect(correntes.get('c1')).toBeCloseTo(saida.bateriaW / banco.tensaoRef, 9);
    expect(correntes.get('c2')).toBeCloseTo(saida.bateriaW / banco.tensaoRef, 9);
    expect(correntes.get('c3')).toBeCloseTo(saida.pvW / banco.tensaoCarga, 9);
    expect(consequencias.map((c) => c.codigo)).toEqual([]);
  });

  it('descarregando, o cabo da bateria leva abs(bateriaW) / tensaoRef, como antes', () => {
    const { saida, banco, correntes } = medir(carregando(), luz(0));
    expect(saida.bateriaW).toBeLessThan(0);
    expect(correntes.get('c1')).toBeCloseTo(-saida.bateriaW / banco.tensaoRef, 9);
    expect(correntes.get('c3')).toBe(0);
  });

  it('corrente por fileira: cada fileira leva a parte que entrega; sem a luz de cada placa, partes iguais', () => {
    const p = carregando();
    const placa = CATALOGO.get('placa-renepv-585');
    if (placa?.categoria !== 'placa') throw new Error('placa fora do catálogo');
    const { saida, correntes } = medir(p, luz(800, 300));
    const total = saida.pvW / RENDIMENTO_MPPT / saida.pvTensao;
    const i1 = estadoPlaca(placa, 800, 25).i;
    const i2 = estadoPlaca(placa, 300, 25).i;
    expect(correntes.get('c5')).toBeCloseTo((total * i1) / (i1 + i2), 9);
    expect(correntes.get('c7')).toBeCloseTo((total * i2) / (i1 + i2), 9);
    expect(correntes.get('c5')!).toBeGreaterThan(correntes.get('c7')!);
    expect(correntes.get('c6')).toBeCloseTo(correntes.get('c5')!, 9);
    // Sem as condições das placas (simplificação): a divisão igual.
    const iguais = medir(p, luz(800, 300), false).correntes;
    expect(iguais.get('c5')).toBeCloseTo(total / 2, 9);
    expect(iguais.get('c7')).toBeCloseTo(total / 2, 9);
  });
});

describe('revisão da fase 8: controlador com bateria e sol, e o inversor sem bateria', () => {
  const SESSENTA: EstadoSim = { soc: 0.6, cortado: false, emRede: false };
  /** O tutorial com o fusível do inversor (c1) aberto: a bateria chega ao controlador, não ao inversor. */
  const soControlador = (): Projeto => com(tutorial(), (x) => estados(x, 'c1', 'aberta'));
  const entrada = (placas: ReadonlyMap<string, CondicaoPlaca>, dtHoras = 0) =>
    ({ dtHoras, redeDisponivel: false, horaLocal: null, placas, inversorLigado: true });

  it('a análise viva fica sem banco; a análise "só do controlador" acha o banco e a fileira dele', () => {
    const p = soControlador();
    const viva = analisarCircuito(projetoVivo(p, CATALOGO), CATALOGO);
    expect(viva.sistema?.banco).toEqual([]);
    expect(bateriaPresente(p, CATALOGO, 'ctl')).toBe(true);
    const so = analiseSoDoControlador(p, CATALOGO, viva);
    expect(so?.sistema).toMatchObject({ inversor: 'inv', controlador: 'ctl', banco: [['b1']], fileiras: [['p1']], cargas: [], redeLigada: false });
    // Com banco no inversor, ou com o controlador sem bateria ou sem fileira: não é o caso.
    const tudoFechado = tutorial();
    expect(analiseSoDoControlador(tudoFechado, CATALOGO, analisarCircuito(tudoFechado, CATALOGO))).toBeNull();
    const semBateria = com(p, (x) => estados(x, 'c3', 'aberta'));
    expect(analiseSoDoControlador(semBateria, CATALOGO, analisarCircuito(projetoVivo(semBateria, CATALOGO), CATALOGO))).toBeNull();
    const semPlaca = com(p, (x) => { x.cabos = x.cabos.filter((c) => c.uid !== 'c6'); });
    expect(analiseSoDoControlador(semPlaca, CATALOGO, analisarCircuito(projetoVivo(semPlaca, CATALOGO), CATALOGO))).toBeNull();
  });

  it('as placas carregam a bateria pelo controlador; nenhum aparelho é atendido e o inversor não consome', () => {
    const p = soControlador();
    const viva = analisarCircuito(projetoVivo(p, CATALOGO), CATALOGO);
    // O passo de antes, só com a análise viva: sem banco, nada acontece.
    const antes = passoSimulacao(p, CATALOGO, viva, SESSENTA, entrada(SOL, 1 / 12));
    expect(antes.pvW).toBe(0);
    expect(antes.estado.soc).toBe(0.6);
    const saida = passoDeOperacao(p, CATALOGO, viva, SESSENTA, entrada(SOL, 1 / 12));
    expect(saida.pvW).toBeGreaterThan(0);
    expect(saida.bateriaW).toBe(saida.pvW);
    expect(saida.estado.soc).toBeGreaterThan(0.6);
    expect(saida.cargaAtendidaW).toBe(0);
    expect(saida.redeW).toBe(0);
    expect(saida.origem).toBe('nenhuma');
    // Para o inversor continua valendo o aviso de sem bateria, e a carga pedida é a dos aparelhos ligados.
    expect(saida.avisos).toContain('sem-bateria');
    expect(saida.cargaPedidaW).toBe(antes.cargaPedidaW);
    // Sem sol, nada entra; e nada se estraga em nenhum dos dois casos.
    expect(passoDeOperacao(p, CATALOGO, viva, SESSENTA, entrada(ESCURO, 1 / 12)).bateriaW).toBe(0);
    expect(avaliarOperacao(p, CATALOGO, viva, saida, SOL, MS)).toEqual([]);
  });

  it('fora desse estado, `passoDeOperacao` é o próprio `passoSimulacao`', () => {
    const p = tutorial();
    const viva = analisarCircuito(p, CATALOGO);
    for (const placas of [SOL, ESCURO]) {
      expect(passoDeOperacao(p, CATALOGO, viva, SESSENTA, entrada(placas, 1 / 12))).toEqual(passoSimulacao(p, CATALOGO, viva, SESSENTA, entrada(placas, 1 / 12)));
    }
  });

  it('as correntes de operação e o arco no conector valem nesse estado', () => {
    const p = soControlador();
    const viva = analisarCircuito(projetoVivo(p, CATALOGO), CATALOGO);
    const saida = passoDeOperacao(p, CATALOGO, viva, SESSENTA, entrada(SOL));
    const correntes = correntesDeOperacao(p, CATALOGO, viva, saida, null, SOL);
    const banco = infoBanco(analiseSoDoControlador(p, CATALOGO, viva)!.sistema!, p, CATALOGO)!;
    // Controlador PWM: a corrente das placas é a de carga. O sorvedouro do banco é o controlador.
    expect(correntes.get('c5')).toBeCloseTo(saida.pvW / banco.tensaoCarga, 9);
    expect(correntes.get('c6')).toBeCloseTo(saida.pvW / banco.tensaoCarga, 9);
    expect(correntes.get('c3')).toBeCloseTo(saida.bateriaW / banco.tensaoRef, 9);
    expect(correntes.get('c4')).toBeCloseTo(saida.bateriaW / banco.tensaoRef, 9);
    expect(correntes.get('c1')).toBe(0);
    expect(correntes.get('c7')).toBe(0);
    const arco = arcoNoConector(p, CATALOGO, { tipo: 'apagar-cabo', cabo: 'c5' }, correntes, MS);
    expect(arco?.codigo).toBe('arco-no-conector');
    expect(arco?.mudancas).toEqual([{ tipo: 'peca-queimada', uid: 'p1', dano: { codigo: 'arco-no-conector', msUtc: MS } }]);
  });
});

describe('revisão da fase 8: baterias em paralelo com uma invertida', () => {
  /** b1 no inversor (fusível em c1) e b2 de ponta-cabeça sobre b1: c3 liga b1.pos em b2.neg, c4 liga b1.neg em b2.pos. */
  const invertida = (noLaco: string[] = [], comInversor = true): Projeto =>
    montar(
      { b1: 'bat-moura-12mn105', b2: 'bat-moura-12mn105', ...(comInversor ? { inv: 'inv-aiker-500-12v-110' } : {}) },
      [
        ...(comInversor ? ([['b1.pos', 'inv.batPos', [FUSIVEL]], ['b1.neg', 'inv.batNeg']] as Ligacao[]) : []),
        ['b1.pos', 'b2.neg', noLaco], ['b1.neg', 'b2.pos'],
      ],
    );
  const doCurto = (p: Projeto) => situacao(p, ESCURO).consequencias.filter((c) => c.codigo === 'curto-na-bateria');

  it('sem proteção no laço: queimam os dois cabos entre as baterias, e não o cabo do inversor', () => {
    const curto = doCurto(invertida());
    expect(curto).toHaveLength(1);
    expect(curto[0].mudancas.map((m) => (m.tipo === 'cabo-queimado' ? m.uid : '?')).sort()).toEqual(['c3', 'c4']);
    // Os cabos na ordem do laço (do negativo de cada bateria ao positivo da seguinte), depois as baterias.
    expect(curto[0].uids).toEqual(['c4', 'c3', 'b1', 'b2']);
    expect(curto[0].mudancas.every((m) => m.tipo === 'cabo-queimado' && m.dano.codigo === 'curto-na-bateria')).toBe(true);
  });

  it('com proteção de corrente contínua fechada no laço: ela abre (o fusível queima, o disjuntor desarma)', () => {
    expect(doCurto(invertida([FUSIVEL]))[0].mudancas).toEqual([{ tipo: 'protecao', cabo: 'c3', indice: 0, estado: 'queimada' }]);
    expect(doCurto(invertida([DISJ_CC_125]))[0].mudancas).toEqual([{ tipo: 'protecao', cabo: 'c3', indice: 0, estado: 'aberta' }]);
    // Disjuntor de corrente alternada não conta como proteção do laço.
    expect(doCurto(invertida([DISJ_CA]))[0].mudancas.map((m) => m.tipo)).toEqual(['cabo-queimado', 'cabo-queimado']);
  });

  it('não depende do inversor nem do botão dele', () => {
    const desligado = com(invertida(), (x) => { x.dispositivos.find((d) => d.uid === 'inv')!.ligado = false; });
    expect(doCurto(desligado)).toHaveLength(1);
    // Só as duas baterias, sem inversor nenhum no projeto (c1 e c2 são os cabos entre elas).
    const curto = doCurto(invertida([], false));
    expect(curto).toHaveLength(1);
    expect(curto[0].mudancas.map((m) => (m.tipo === 'cabo-queimado' ? m.uid : '?')).sort()).toEqual(['c1', 'c2']);
  });

  it('com a proteção do laço aberta nada acontece; aplicado o dano, o laço some', () => {
    expect(doCurto(com(invertida([FUSIVEL]), (x) => estados(x, 'c3', 'aberta')))).toEqual([]);
    const p = invertida();
    expect(doCurto(aplicarConsequencias(p, doCurto(p)))).toEqual([]);
  });

  it('paralelo certo e série certa não são laço', () => {
    const paralelo = montar(
      { b1: 'bat-moura-12mn105', b2: 'bat-moura-12mn105', inv: 'inv-aiker-500-12v-110' },
      [['b1.pos', 'inv.batPos'], ['b1.neg', 'inv.batNeg'], ['b1.pos', 'b2.pos'], ['b1.neg', 'b2.neg']],
    );
    expect(doCurto(paralelo)).toEqual([]);
    const serie = montar(
      { b1: 'bat-moura-12mn105', b2: 'bat-moura-12mn105', inv: 'inv-anenji-3kw-24v-127' },
      [['b1.pos', 'inv.batPos'], ['b1.neg', 'b2.pos'], ['b2.neg', 'inv.batNeg']],
    );
    expect(doCurto(serie)).toEqual([]);
  });
});
