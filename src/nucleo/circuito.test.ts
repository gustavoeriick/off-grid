import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Controlador } from '../catalogo/tipos';
import { CASA_INICIAL, cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { analisarCircuito } from './circuito';
import type { AnaliseCircuito, Cabo, CodigoProblema, Projeto } from './tipos';

/** Monta um projeto pequeno: `pecas` mapeia `uid` para `id` do catálogo; cada ligação é um par `uid.terminal`. */
function montar(pecas: Record<string, string>, ligacoes: [string, string][]): Projeto {
  const cabos: Cabo[] = ligacoes.map(([de, para], i) => {
    const [dDe, tDe] = de.split('.');
    const [dPara, tPara] = para.split('.');
    return {
      uid: `c${i + 1}`,
      de: { disp: dDe, terminal: tDe },
      para: { disp: dPara, terminal: tPara },
      caboId: 'cabo-solar-6',
      comprimento: 1,
      protecoes: [],
    };
  });
  return {
    versao: 1,
    nome: 'teste',
    casa: structuredClone(CASA_INICIAL),
    localId: 'rio',
    clima: 'tipico',
    tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null,
    })),
    cabos,
  };
}

const analisar = (p: Projeto) => analisarCircuito(p, CATALOGO);
const codigos = (a: AnaliseCircuito): CodigoProblema[] => a.problemas.map((p) => p.codigo);

const ANENJI = 'inv-anenji-3kw-24v-127';
const RENEPV = 'placa-renepv-585';
const ALFX = 'bat-alfx-24v-100';

/** Anenji com uma bateria Alfx ligada, para os casos de placas. */
const comBateria = { inv: ANENJI, bat: ALFX };
const ligaBateria: [string, string][] = [['bat.pos', 'inv.batPos'], ['bat.neg', 'inv.batNeg']];

describe('analisarCircuito: cenários', () => {
  it('"plano no papel"', () => {
    const a = analisar(cenarioPlanoNoPapel());
    expect(a.problemas).toEqual([]);
    expect(a.naRede).toEqual([]);
    const s = a.sistema!;
    expect(s.inversor).toBe('inversor');
    expect(s.controlador).toBeNull();
    expect(s.entradaSolar).toEqual((CATALOGO.get(ANENJI) as { solar: unknown }).solar);
    expect(s.fileiras).toEqual([['placa1']]);
    expect(s.banco).toEqual([['bateria1']]);
    expect(s.cargas).toEqual(['ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv']);
    expect(s.redeLigada).toBe(true);
  });

  it('"plano corrigido"', () => {
    const a = analisar(cenarioPlanoCorrigido());
    expect(a.problemas).toEqual([]);
    expect(a.sistema!.fileiras).toEqual([['placa1', 'placa2']]);
  });

  it('"plano no papel" sem o cabo da rede: rede desligada', () => {
    const p = cenarioPlanoNoPapel();
    p.cabos = p.cabos.filter((c) => c.uid !== 'c5');
    expect(analisar(p).sistema!.redeLigada).toBe(false);
  });
});

describe('analisarCircuito: placas', () => {
  it('três placas, cada uma direto em pvPos e pvNeg: três fileiras de uma placa', () => {
    const a = analisar(montar({ ...comBateria, p1: RENEPV, p2: RENEPV, p3: RENEPV }, [
      ...ligaBateria,
      ['p1.pos', 'inv.pvPos'], ['p1.neg', 'inv.pvNeg'],
      ['p2.pos', 'inv.pvPos'], ['p2.neg', 'inv.pvNeg'],
      ['p3.pos', 'inv.pvPos'], ['p3.neg', 'inv.pvNeg'],
    ]));
    expect(a.sistema!.fileiras).toEqual([['p1'], ['p2'], ['p3']]);
    expect(a.problemas).toEqual([]);
  });

  it('duas fileiras de duas placas', () => {
    const a = analisar(montar({ ...comBateria, a: RENEPV, b: RENEPV, c: RENEPV, d: RENEPV }, [
      ...ligaBateria,
      ['a.pos', 'inv.pvPos'], ['a.neg', 'b.pos'], ['b.neg', 'inv.pvNeg'],
      ['c.pos', 'inv.pvPos'], ['c.neg', 'd.pos'], ['d.neg', 'inv.pvNeg'],
    ]));
    expect(a.sistema!.fileiras).toEqual([['a', 'b'], ['c', 'd']]);
    expect(a.problemas).toEqual([]);
  });

  it('uma fileira de duas e outra de uma, em paralelo: fileiras-desiguais', () => {
    const a = analisar(montar({ ...comBateria, a: RENEPV, b: RENEPV, c: RENEPV }, [
      ...ligaBateria,
      ['a.pos', 'inv.pvPos'], ['a.neg', 'b.pos'], ['b.neg', 'inv.pvNeg'],
      ['c.pos', 'inv.pvPos'], ['c.neg', 'inv.pvNeg'],
    ]));
    expect(a.sistema!.fileiras).toEqual([['a', 'b'], ['c']]);
    expect(codigos(a)).toEqual(['fileiras-desiguais']);
    expect(a.problemas[0].dispositivos).toEqual(['a', 'b', 'c']);
  });

  it('placa invertida: nenhuma fileira e placa-invertida, sem placa-solta', () => {
    const a = analisar(montar({ ...comBateria, p: RENEPV }, [
      ...ligaBateria,
      ['p.pos', 'inv.pvNeg'], ['p.neg', 'inv.pvPos'],
    ]));
    expect(a.sistema!.fileiras).toEqual([]);
    expect(a.sistema!.entradaSolar).not.toBeNull();
    expect(a.problemas).toEqual([{ codigo: 'placa-invertida', dispositivos: ['p'], cabos: ['c3', 'c4'] }]);
  });

  it('um cabo de pvPos a pvNeg: curto-placas', () => {
    const a = analisar(montar(comBateria, [...ligaBateria, ['inv.pvPos', 'inv.pvNeg']]));
    expect(a.problemas).toEqual([{ codigo: 'curto-placas', dispositivos: ['inv'], cabos: ['c3'] }]);
  });

  it('placa com pos e neg no mesmo ponto: curto-placas', () => {
    const a = analisar(montar({ ...comBateria, p: RENEPV }, [...ligaBateria, ['p.pos', 'p.neg']]));
    expect(a.problemas).toEqual([{ codigo: 'curto-placas', dispositivos: ['p'], cabos: ['c3'] }]);
  });

  it('placa só com o pos ligado: placa-solta', () => {
    const a = analisar(montar({ ...comBateria, p: RENEPV }, [...ligaBateria, ['p.pos', 'inv.pvPos']]));
    expect(a.sistema!.fileiras).toEqual([]);
    expect(a.problemas).toEqual([{ codigo: 'placa-solta', dispositivos: ['p'], cabos: ['c3'] }]);
  });

  it('placa sem nenhum cabo não é problema', () => {
    const a = analisar(montar({ ...comBateria, p: RENEPV }, ligaBateria));
    expect(a.problemas).toEqual([]);
  });

  it('placas de dois modelos na mesma fileira: placas-misturadas', () => {
    const a = analisar(montar({ ...comBateria, a: RENEPV, b: 'placa-ronma-585' }, [
      ...ligaBateria,
      ['a.pos', 'inv.pvPos'], ['a.neg', 'b.pos'], ['b.neg', 'inv.pvNeg'],
    ]));
    expect(a.sistema!.fileiras).toEqual([['a', 'b']]);
    expect(codigos(a)).toEqual(['placas-misturadas']);
  });
});

describe('analisarCircuito: baterias', () => {
  it('duas bat-moura-12mn105 em série', () => {
    const a = analisar(montar({ inv: ANENJI, b1: 'bat-moura-12mn105', b2: 'bat-moura-12mn105' }, [
      ['b1.pos', 'inv.batPos'], ['b1.neg', 'b2.pos'], ['b2.neg', 'inv.batNeg'],
    ]));
    expect(a.sistema!.banco).toEqual([['b1', 'b2']]);
    expect(a.problemas).toEqual([]);
  });

  it('duas bat-alfx-24v-100 em paralelo', () => {
    const a = analisar(montar({ inv: ANENJI, b1: ALFX, b2: ALFX }, [
      ['b1.pos', 'inv.batPos'], ['b1.neg', 'inv.batNeg'],
      ['b2.pos', 'inv.batPos'], ['b2.neg', 'inv.batNeg'],
    ]));
    expect(a.sistema!.banco).toEqual([['b1'], ['b2']]);
    expect(a.problemas).toEqual([]);
  });

  it('uma bateria de 12 V e uma de 24 V em paralelo: ramos-desiguais', () => {
    const a = analisar(montar({ inv: ANENJI, b1: 'bat-belifou-12v-100', b2: ALFX }, [
      ['b1.pos', 'inv.batPos'], ['b1.neg', 'inv.batNeg'],
      ['b2.pos', 'inv.batPos'], ['b2.neg', 'inv.batNeg'],
    ]));
    expect(a.sistema!.banco).toEqual([['b1'], ['b2']]);
    expect(codigos(a)).toContain('ramos-desiguais');
    expect(codigos(a)).toContain('baterias-misturadas');
  });

  it('bateria invertida', () => {
    const a = analisar(montar({ inv: ANENJI, b: ALFX }, [['b.pos', 'inv.batNeg'], ['b.neg', 'inv.batPos']]));
    expect(a.sistema!.banco).toEqual([]);
    expect(codigos(a)).toContain('bateria-invertida');
    expect(codigos(a)).not.toContain('bateria-solta');
    expect(a.problemas.find((p) => p.codigo === 'bateria-invertida')).toEqual({ codigo: 'bateria-invertida', dispositivos: ['b'], cabos: ['c1', 'c2'] });
  });

  it('inversor sem bateria ligada: sem-bateria', () => {
    const a = analisar(montar({ inv: ANENJI }, []));
    expect(a.sistema!.banco).toEqual([]);
    expect(a.problemas).toEqual([{ codigo: 'sem-bateria', dispositivos: ['inv'], cabos: [] }]);
  });

  it('bateria com um polo só: bateria-solta', () => {
    const a = analisar(montar({ inv: ANENJI, b: ALFX }, [['b.pos', 'inv.batPos']]));
    expect(codigos(a)).toEqual(['sem-bateria', 'bateria-solta']);
  });

  it('cabo de batPos a batNeg: curto-bateria', () => {
    const a = analisar(montar(comBateria, [...ligaBateria, ['inv.batPos', 'inv.batNeg']]));
    expect(a.sistema!.banco).toEqual([]);
    expect(a.problemas).toContainEqual({ codigo: 'curto-bateria', dispositivos: ['inv'], cabos: ['c1', 'c2', 'c3'] });
  });

  it('bateria com pos e neg ligados entre si: curto-bateria', () => {
    const a = analisar(montar({ inv: ANENJI, b1: ALFX, b2: ALFX }, [
      ['b1.pos', 'inv.batPos'], ['b1.neg', 'inv.batNeg'], ['b2.pos', 'b2.neg'],
    ]));
    expect(a.sistema!.banco).toEqual([['b1']]);
    expect(a.problemas).toEqual([{ codigo: 'curto-bateria', dispositivos: ['b2'], cabos: ['c3'] }]);
  });
});

describe('analisarCircuito: inversor', () => {
  it('só uma placa no projeto: sistema nulo e sem-inversor', () => {
    const a = analisar(montar({ p: RENEPV }, []));
    expect(a.sistema).toBeNull();
    expect(codigos(a)).toEqual(['sem-inversor']);
  });

  it('projeto vazio: sistema nulo e nenhum problema', () => {
    const a = analisar(montar({}, []));
    expect(a.sistema).toBeNull();
    expect(a.problemas).toEqual([]);
    expect(a.naRede).toEqual([]);
  });

  it('dois inversores: varios-inversores e o primeiro é o simulado', () => {
    const a = analisar(montar({ inv: ANENJI, bat: ALFX, inv2: 'inv-aiker-500-12v-110' }, ligaBateria));
    expect(a.sistema!.inversor).toBe('inv');
    expect(a.problemas).toEqual([{ codigo: 'varios-inversores', dispositivos: ['inv', 'inv2'], cabos: [] }]);
  });

  it('inversor simples de 12 V, bateria de 12 V e ctl-pwm-30a no barramento com uma placa', () => {
    const a = analisar(montar({ inv: 'inv-aiker-500-12v-110', bat: 'bat-belifou-12v-100', ctl: 'ctl-pwm-30a', p: 'placa-resun-100' }, [
      ...ligaBateria,
      ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
      ['p.pos', 'ctl.pvPos'], ['p.neg', 'ctl.pvNeg'],
    ]));
    const s = a.sistema!;
    expect(s.controlador).toBe('ctl');
    expect(s.entradaSolar).toEqual((CATALOGO.get('ctl-pwm-30a') as Controlador).solar);
    expect(s.fileiras).toEqual([['p']]);
    expect(s.banco).toEqual([['bat']]);
    expect(s.redeLigada).toBe(false);
    expect(a.problemas).toEqual([]);
  });

  it('inversor simples sem controlador: sem entrada solar', () => {
    const a = analisar(montar({ inv: 'inv-aiker-500-12v-110', bat: 'bat-belifou-12v-100' }, ligaBateria));
    expect(a.sistema!.entradaSolar).toBeNull();
    expect(a.sistema!.controlador).toBeNull();
    expect(a.sistema!.fileiras).toEqual([]);
  });

  it('controlador fora do barramento não é candidato', () => {
    const a = analisar(montar({ inv: 'inv-aiker-500-12v-110', bat: 'bat-belifou-12v-100', ctl: 'ctl-pwm-30a', p: 'placa-resun-100' }, [
      ...ligaBateria,
      ['p.pos', 'ctl.pvPos'], ['p.neg', 'ctl.pvNeg'],
    ]));
    expect(a.sistema!.entradaSolar).toBeNull();
    expect(a.sistema!.controlador).toBeNull();
    expect(codigos(a)).toEqual(['placa-solta']);
  });

  it('híbrido sem placas e controlador com placa no barramento: fica o controlador', () => {
    const a = analisar(montar({ ...comBateria, ctl: 'ctl-epever-xtra4210n', p: RENEPV }, [
      ...ligaBateria,
      ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
      ['p.pos', 'ctl.pvPos'], ['p.neg', 'ctl.pvNeg'],
    ]));
    expect(a.sistema!.controlador).toBe('ctl');
    expect(a.sistema!.fileiras).toEqual([['p']]);
  });

  it('híbrido sem placas e controlador sem placas: fica a entrada do inversor, sem fileiras', () => {
    const a = analisar(montar({ ...comBateria, ctl: 'ctl-epever-xtra4210n' }, [
      ...ligaBateria,
      ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
    ]));
    expect(a.sistema!.controlador).toBeNull();
    expect(a.sistema!.entradaSolar).toEqual((CATALOGO.get(ANENJI) as { solar: unknown }).solar);
    expect(a.sistema!.fileiras).toEqual([]);
  });
});

describe('analisarCircuito: corrente alternada', () => {
  it('saída do inversor ligada na tomada da rede: saida-na-rede', () => {
    const a = analisar(montar({ ...comBateria, rede: 'rede-tomada' }, [...ligaBateria, ['inv.caSaida', 'rede.tomada']]));
    expect(a.problemas).toEqual([{ codigo: 'saida-na-rede', dispositivos: ['inv', 'rede'], cabos: ['c3'] }]);
    expect(a.sistema!.redeLigada).toBe(false);
  });

  it('aparelho ligado só na tomada da rede: em naRede, não em cargas', () => {
    const a = analisar(montar({ ...comBateria, rede: 'rede-tomada', tv: 'ap-tv', gel: 'ap-geladeira' }, [
      ...ligaBateria,
      ['inv.caEntrada', 'rede.tomada'],
      ['tv.plug', 'rede.tomada'],
      ['gel.plug', 'inv.caSaida'],
    ]));
    expect(a.naRede).toEqual(['tv']);
    expect(a.sistema!.cargas).toEqual(['gel']);
    expect(a.sistema!.redeLigada).toBe(true);
    expect(a.problemas).toEqual([]);
  });

  it('naRede é preenchido mesmo sem inversor', () => {
    const a = analisar(montar({ rede: 'rede-tomada', tv: 'ap-tv' }, [['tv.plug', 'rede.tomada']]));
    expect(a.sistema).toBeNull();
    expect(a.naRede).toEqual(['tv']);
    expect(a.problemas).toEqual([]);
  });
});

describe('analisarCircuito: estação portátil', () => {
  it('estação com um aparelho: banco vazio e sem sem-bateria', () => {
    const a = analisar(montar({ est: 'est-ecoflow-river2', tv: 'ap-tv' }, [['tv.plug', 'est.caSaida']]));
    const s = a.sistema!;
    expect(s.inversor).toBe('est');
    expect(s.banco).toEqual([]);
    expect(s.cargas).toEqual(['tv']);
    expect(s.entradaSolar).toEqual((CATALOGO.get('est-ecoflow-river2') as { solar: unknown }).solar);
    expect(a.problemas).toEqual([]);
  });

  it('estação com placa na entrada solar', () => {
    const a = analisar(montar({ est: 'est-ecoflow-river2', p: 'placa-resun-100' }, [['p.pos', 'est.pvPos'], ['p.neg', 'est.pvNeg']]));
    expect(a.sistema!.fileiras).toEqual([['p']]);
    expect(a.problemas).toEqual([]);
  });
});
