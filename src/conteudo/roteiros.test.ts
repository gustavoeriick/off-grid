import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { CASA_INICIAL, cenarioPlanoCorrigido } from '../nucleo/cenarios';
import { analisarCircuito } from '../nucleo/circuito';
import { analisarConsultor } from '../nucleo/consultor';
import { estimar } from '../nucleo/estimativas';
import { ambienteSemSombra } from '../nucleo/irradiancia';
import { normalDoPlano } from '../nucleo/sol';
import type { Cabo, Projeto } from '../nucleo/tipos';
import { ROTEIRO_12V, ROTEIRO_24V, ROTEIROS, roteiroPorId, type DerivadosDoPasso, type Roteiro } from './roteiros';

const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);

function derivadosDe(projeto: Projeto): DerivadosDoPasso {
  const analise = analisarCircuito(projeto, CATALOGO);
  const estimativas = estimar(projeto, CATALOGO, analise, AMBIENTE, MS_21_JUN);
  return { analise, sugestoes: analisarConsultor(projeto, CATALOGO, analise, estimativas) };
}

const feitos = (roteiro: Roteiro, projeto: Projeto): boolean[] => {
  const d = derivadosDe(projeto);
  return roteiro.passos.map((p) => p.feito(projeto, d, CATALOGO));
};

const ids = (roteiro: Roteiro): string[] => roteiro.passos.map((p) => p.id);

/** Os passos que não estão feitos, pelo id. */
const naoFeitos = (roteiro: Roteiro, projeto: Projeto): string[] => {
  const f = feitos(roteiro, projeto);
  return roteiro.passos.filter((_, i) => !f[i]).map((p) => p.id);
};

const feito = (roteiro: Roteiro, projeto: Projeto, id: string): boolean => !naoFeitos(roteiro, projeto).includes(id);

const doMontar = (roteiro: Roteiro): string[] => roteiro.passos.filter((p) => p.parte === 'Parte 1: montar').map((p) => p.id);

function cabo(uid: string, de: string, para: string, caboId: string, protecoes: string[] = [], comprimento = 1): Cabo {
  const [dDe, tDe] = de.split('.');
  const [dPara, tPara] = para.split('.');
  return { uid, de: { disp: dDe!, terminal: tDe! }, para: { disp: dPara!, terminal: tPara! }, caboId, comprimento, protecoes, quadro: null };
}

/** O sistema mínimo de 12 V que o roteiro pede, passo a passo, com tudo fechado e ligado. */
function projeto12V(): Projeto {
  const pecas: Record<string, string> = {
    bateria: 'bat-moura-12mn105',
    inversor: 'inv-aiker-500-12v-110',
    ctl: 'ctl-pwm-30a',
    placa: 'placa-resun-100',
    lampada: 'ap-lampada',
  };
  return {
    versao: 2,
    nome: 'teste 12 V',
    casa: structuredClone(CASA_INICIAL),
    localId: 'rio',
    clima: 'tipico',
    tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null,
    })),
    cabos: [
      cabo('c1', 'bateria.pos', 'inversor.batPos', 'cabo-bat-35', ['prot-fusivel-anl-100']),
      cabo('c2', 'bateria.neg', 'inversor.batNeg', 'cabo-bat-35'),
      cabo('c3', 'ctl.batPos', 'bateria.pos', 'cabo-bat-35', ['prot-disjuntor-cc-80']),
      cabo('c4', 'ctl.batNeg', 'bateria.neg', 'cabo-bat-35'),
      cabo('c5', 'placa.pos', 'ctl.pvPos', 'cabo-solar-6'),
      cabo('c6', 'placa.neg', 'ctl.pvNeg', 'cabo-solar-6'),
      cabo('c7', 'inversor.caSaida', 'lampada.plug', 'cabo-ca-2p5'),
    ],
  };
}

/** Como a peça posta pelo usuário nasce: proteções abertas (o DPS não tem chave), inversor e aparelhos desligados. */
function tudoDesligado(p: Projeto): Projeto {
  for (const c of p.cabos) c.estados = c.protecoes.map((id) => (id === 'prot-dps-cc-600' ? 'fechada' : 'aberta'));
  for (const d of p.dispositivos) {
    const categoria = CATALOGO.get(d.itemId)?.categoria;
    if (categoria === 'inversor' || categoria === 'aparelho') d.ligado = false;
  }
  return p;
}

describe('roteiros: dados', () => {
  it('há os dois roteiros, com ids diferentes e passos com texto', () => {
    expect(ROTEIROS.map((r) => r.id)).toEqual(['primeiro-sistema-12v', 'plano-da-casa-24v']);
    expect(roteiroPorId('plano-da-casa-24v')).toBe(ROTEIRO_24V);
    expect(roteiroPorId('nada')).toBeUndefined();
    expect(ids(ROTEIRO_12V)).toEqual([
      'bateria', 'inversor', 'cabo-positivo', 'fusivel', 'cabo-negativo', 'controlador', 'placa', 'aparelho', 'sem-erros',
      'fechar-fusivel', 'fechar-controlador', 'cabos-da-placa', 'ligar-inversor', 'ligar-aparelho',
    ]);
    expect(ids(ROTEIRO_24V)).toEqual([
      'bateria', 'inversor', 'cabo-positivo', 'fusivel', 'cabo-negativo', 'placas', 'cabo-positivo-das-placas', 'protecoes-das-placas',
      'cabo-negativo-das-placas', 'aparelhos-na-saida', 'sem-erros',
      'fechar-fusivel', 'fechar-placas', 'ligar-inversor', 'fechar-saida', 'tomada-da-rede', 'ligar-aparelhos',
    ]);
    for (const r of ROTEIROS) {
      expect(new Set(r.passos.map((p) => p.id)).size).toBe(r.passos.length);
      for (const p of r.passos) {
        expect(p.titulo.length).toBeGreaterThan(5);
        expect(p.texto.length).toBeGreaterThan(80);
      }
    }
  });

  it('todo itemId existe no catálogo', () => {
    for (const r of ROTEIROS) {
      for (const p of r.passos) {
        if (p.itemId === undefined) continue;
        expect(CATALOGO.get(p.itemId), `${r.id}/${p.id}: ${p.itemId}`).toBeDefined();
      }
    }
  });
});

describe('roteiro de 24 V', () => {
  it('no cenário "plano corrigido" (tudo fechado e ligado, como os cenários prontos) todos os passos estão feitos', () => {
    expect(naoFeitos(ROTEIRO_24V, cenarioPlanoCorrigido())).toEqual([]);
  });

  it('sem dispositivos nenhum passo está feito', () => {
    const vazio = cenarioPlanoCorrigido();
    vazio.dispositivos = [];
    vazio.cabos = [];
    expect(naoFeitos(ROTEIRO_24V, vazio)).toEqual(ids(ROTEIRO_24V));
  });

  it('tirar o fusível, o DPS, a segunda placa, a tomada ou um disjuntor desfaz o passo certo', () => {
    const semFusivel = cenarioPlanoCorrigido();
    semFusivel.cabos.find((c) => c.uid === 'c3')!.protecoes = [];
    expect(feito(ROTEIRO_24V, semFusivel, 'fusivel')).toBe(false);

    const semDps = cenarioPlanoCorrigido();
    semDps.cabos.find((c) => c.uid === 'c1')!.protecoes = ['prot-disjuntor-cc-32'];
    expect(feito(ROTEIRO_24V, semDps, 'protecoes-das-placas')).toBe(false);

    const umaPlaca = cenarioPlanoCorrigido();
    umaPlaca.dispositivos = umaPlaca.dispositivos.filter((d) => d.uid !== 'placa2');
    umaPlaca.cabos = umaPlaca.cabos.filter((c) => c.uid !== 'c12').map((c) => (c.uid === 'c2' ? { ...c, de: { disp: 'placa1', terminal: 'neg' } } : c));
    expect(feito(ROTEIRO_24V, umaPlaca, 'placas')).toBe(false);
    expect(feito(ROTEIRO_24V, umaPlaca, 'cabo-negativo-das-placas')).toBe(false);

    const semTomada = cenarioPlanoCorrigido();
    semTomada.cabos = semTomada.cabos.filter((c) => c.uid !== 'c5');
    expect(naoFeitos(ROTEIRO_24V, semTomada)).toEqual(['tomada-da-rede']);

    const semDisjuntor = cenarioPlanoCorrigido();
    semDisjuntor.cabos.find((c) => c.uid === 'c6')!.protecoes = [];
    expect(feito(ROTEIRO_24V, semDisjuntor, 'aparelhos-na-saida')).toBe(false);
  });

  it('os cabos da bateria precisam ser de 35 mm²', () => {
    const fino = cenarioPlanoCorrigido();
    fino.cabos.find((c) => c.uid === 'c4')!.caboId = 'cabo-bat-25';
    expect(feito(ROTEIRO_24V, fino, 'cabo-negativo')).toBe(false);
  });

  it('montado com tudo desligado: a montagem está feita e faltam só os passos de ligar, na ordem', () => {
    const p = tudoDesligado(cenarioPlanoCorrigido());
    expect(naoFeitos(ROTEIRO_24V, p).filter((id) => doMontar(ROTEIRO_24V).includes(id))).toEqual([]);
    // A rede já está ligada no cenário: o passo dela aparece feito.
    expect(naoFeitos(ROTEIRO_24V, p)).toEqual(['fechar-fusivel', 'fechar-placas', 'ligar-inversor', 'fechar-saida', 'ligar-aparelhos']);
  });
});

describe('roteiro de 12 V', () => {
  it('um projeto mínimo, tudo fechado e ligado, cumpre todos os passos', () => {
    expect(naoFeitos(ROTEIRO_12V, projeto12V())).toEqual([]);
  });

  it('sem dispositivos nenhum passo está feito', () => {
    const vazio = projeto12V();
    vazio.dispositivos = [];
    vazio.cabos = [];
    expect(naoFeitos(ROTEIRO_12V, vazio)).toEqual(ids(ROTEIRO_12V));
  });

  it('tirar o fusível faz o passo do fusível voltar a falso', () => {
    const p = projeto12V();
    p.cabos.find((c) => c.uid === 'c1')!.protecoes = [];
    // Sem fusível o consultor também passa a apontar erro, e não há fusível a pôr no lugar: a conferência e o "pôr no lugar" voltam junto.
    expect(naoFeitos(ROTEIRO_12V, p)).toEqual(['fusivel', 'sem-erros', 'fechar-fusivel']);
  });

  it('bateria de carro, onda modificada e placa grande não contam', () => {
    const p = projeto12V();
    p.dispositivos.find((d) => d.uid === 'bateria')!.itemId = 'bat-automotiva-60';
    p.dispositivos.find((d) => d.uid === 'inversor')!.itemId = 'inv-vedo-1000-mod';
    p.dispositivos.find((d) => d.uid === 'placa')!.itemId = 'placa-renepv-585';
    const nao = naoFeitos(ROTEIRO_12V, p);
    expect(nao).toContain('bateria');
    expect(nao).toContain('inversor');
    expect(nao).toContain('placa');
  });

  it('ligar a bateria invertida não conta como cabo', () => {
    const p = projeto12V();
    p.cabos.find((c) => c.uid === 'c1')!.para.terminal = 'batNeg';
    p.cabos.find((c) => c.uid === 'c2')!.para.terminal = 'batPos';
    expect(feito(ROTEIRO_12V, p, 'cabo-positivo')).toBe(false);
    expect(feito(ROTEIRO_12V, p, 'cabo-negativo')).toBe(false);
  });

  it('o passo do aparelho não exige o aparelho ligado; o de ligar, sim', () => {
    const p = projeto12V();
    p.dispositivos.find((d) => d.uid === 'lampada')!.ligado = false;
    expect(naoFeitos(ROTEIRO_12V, p)).toEqual(['ligar-aparelho']);
  });

  it('montado com tudo desligado: a montagem está feita e faltam só os passos de ligar', () => {
    const p = tudoDesligado(projeto12V());
    expect(naoFeitos(ROTEIRO_12V, p)).toEqual(['fechar-fusivel', 'fechar-controlador', 'ligar-inversor', 'ligar-aparelho']);
  });
});
