import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Catalogo, Item, Protecao } from '../catalogo/tipos';
import { cenarioPlanoCorrigido, CASA_INICIAL } from './cenarios';
import { analisarCircuito } from './circuito';
import { estadoInicial, passoSimulacao } from './eletrica';
import {
  aplicarConsequencias, arcoNoConector, arcoNoDisjuntorCa, avaliarOperacao, bateriaPresente, caboInterrompido, consertar,
  correntesDeOperacao, estadoDaProtecao, inversorOperando, polosTrocados, projetoVivo, sequenciaDeDesenergizar,
  sequenciaDeEnergizar, type Consequencia,
} from './operacao';
import type { Cabo, CondicaoPlaca, Dano, EstadoProtecao, Projeto, SaidaPasso } from './tipos';

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

  it('apagar a placa com corrente: ela queima', () => {
    const { p, correntes } = funcionando();
    expect(arcoNoConector(p, CATALOGO, { tipo: 'apagar-dispositivo', uid: 'p1' }, correntes, MS)!.mudancas).toHaveLength(1);
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
