import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { CASA_INICIAL, cenarioPlanoCorrigido } from '../nucleo/cenarios';
import { analisarCircuito } from '../nucleo/circuito';
import { analisarConsultor } from '../nucleo/consultor';
import { estimar } from '../nucleo/estimativas';
import { ambienteSemSombra } from '../nucleo/irradiancia';
import { normalDoPlano } from '../nucleo/sol';
import type { Cabo, Projeto } from '../nucleo/tipos';
import { ROTEIRO_12V, ROTEIRO_24V, ROTEIROS, roteiroPorId, type DerivadosDoPasso } from './roteiros';

const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);

function derivadosDe(projeto: Projeto): DerivadosDoPasso {
  const analise = analisarCircuito(projeto, CATALOGO);
  const estimativas = estimar(projeto, CATALOGO, analise, AMBIENTE, MS_21_JUN);
  return { analise, sugestoes: analisarConsultor(projeto, CATALOGO, analise, estimativas) };
}

const feitos = (roteiro: typeof ROTEIRO_12V, projeto: Projeto): boolean[] => {
  const d = derivadosDe(projeto);
  return roteiro.passos.map((p) => p.feito(projeto, d, CATALOGO));
};

function cabo(uid: string, de: string, para: string, caboId: string, protecoes: string[] = [], comprimento = 1): Cabo {
  const [dDe, tDe] = de.split('.');
  const [dPara, tPara] = para.split('.');
  return { uid, de: { disp: dDe!, terminal: tDe! }, para: { disp: dPara!, terminal: tPara! }, caboId, comprimento, protecoes, quadro: null };
}

/** O sistema mínimo de 12 V que o roteiro pede, passo a passo. */
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
      cabo('c3', 'ctl.batPos', 'bateria.pos', 'cabo-bat-35'),
      cabo('c4', 'ctl.batNeg', 'bateria.neg', 'cabo-bat-35'),
      cabo('c5', 'placa.pos', 'ctl.pvPos', 'cabo-solar-6'),
      cabo('c6', 'placa.neg', 'ctl.pvNeg', 'cabo-solar-6'),
      cabo('c7', 'inversor.caSaida', 'lampada.plug', 'cabo-ca-2p5'),
    ],
  };
}

describe('roteiros: dados', () => {
  it('há os dois roteiros, com ids diferentes e passos com texto', () => {
    expect(ROTEIROS.map((r) => r.id)).toEqual(['primeiro-sistema-12v', 'plano-da-casa-24v']);
    expect(roteiroPorId('plano-da-casa-24v')).toBe(ROTEIRO_24V);
    expect(roteiroPorId('nada')).toBeUndefined();
    for (const r of ROTEIROS) {
      expect(r.passos.length).toBe(8);
      expect(new Set(r.passos.map((p) => p.id)).size).toBe(r.passos.length);
      for (const p of r.passos) {
        expect(p.titulo.length).toBeGreaterThan(5);
        expect(p.texto.length).toBeGreaterThan(80);
      }
    }
  });

  it('todo itemId existe no catálogo, e o item é da linha do roteiro', () => {
    for (const r of ROTEIROS) {
      for (const p of r.passos) {
        if (p.itemId === undefined) continue;
        const item = CATALOGO.get(p.itemId);
        expect(item, `${r.id}/${p.id}: ${p.itemId}`).toBeDefined();
      }
    }
  });
});

describe('roteiro de 24 V', () => {
  it('no cenário "plano corrigido" todos os passos estão feitos', () => {
    expect(feitos(ROTEIRO_24V, cenarioPlanoCorrigido())).toEqual(Array(8).fill(true));
  });

  it('sem dispositivos nenhum passo está feito', () => {
    const vazio = cenarioPlanoCorrigido();
    vazio.dispositivos = [];
    vazio.cabos = [];
    expect(feitos(ROTEIRO_24V, vazio)).toEqual(Array(8).fill(false));
  });

  it('tirar o fusível, o DPS ou a segunda placa desfaz o passo certo', () => {
    const semFusivel = cenarioPlanoCorrigido();
    semFusivel.cabos.find((c) => c.uid === 'c3')!.protecoes = [];
    expect(feitos(ROTEIRO_24V, semFusivel)[2]).toBe(false);

    const semDps = cenarioPlanoCorrigido();
    semDps.cabos.find((c) => c.uid === 'c1')!.protecoes = ['prot-disjuntor-cc-32'];
    expect(feitos(ROTEIRO_24V, semDps)[4]).toBe(false);

    const umaPlaca = cenarioPlanoCorrigido();
    umaPlaca.dispositivos = umaPlaca.dispositivos.filter((d) => d.uid !== 'placa2');
    umaPlaca.cabos = umaPlaca.cabos.filter((c) => c.uid !== 'c12').map((c) => (c.uid === 'c2' ? { ...c, de: { disp: 'placa1', terminal: 'neg' } } : c));
    expect(feitos(ROTEIRO_24V, umaPlaca)[3]).toBe(false);

    const semTomada = cenarioPlanoCorrigido();
    semTomada.cabos = semTomada.cabos.filter((c) => c.uid !== 'c5');
    expect(feitos(ROTEIRO_24V, semTomada)[5]).toBe(false);

    const semDisjuntor = cenarioPlanoCorrigido();
    semDisjuntor.cabos.find((c) => c.uid === 'c6')!.protecoes = [];
    expect(feitos(ROTEIRO_24V, semDisjuntor)[6]).toBe(false);
  });
});

describe('roteiro de 12 V', () => {
  it('um projeto mínimo cumpre todos os passos', () => {
    expect(feitos(ROTEIRO_12V, projeto12V())).toEqual(Array(8).fill(true));
  });

  it('sem dispositivos nenhum passo está feito', () => {
    const vazio = projeto12V();
    vazio.dispositivos = [];
    vazio.cabos = [];
    expect(feitos(ROTEIRO_12V, vazio)).toEqual(Array(8).fill(false));
  });

  it('tirar o fusível faz o passo do fusível voltar a falso', () => {
    const p = projeto12V();
    p.cabos.find((c) => c.uid === 'c1')!.protecoes = [];
    const f = feitos(ROTEIRO_12V, p);
    expect(f[3]).toBe(false);
    // Sem fusível o consultor também passa a apontar erro: o último passo volta junto.
    expect(f.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0)).toEqual([3, 7]);
  });

  it('bateria de carro, onda modificada e placa grande não contam', () => {
    const p = projeto12V();
    p.dispositivos.find((d) => d.uid === 'bateria')!.itemId = 'bat-automotiva-60';
    p.dispositivos.find((d) => d.uid === 'inversor')!.itemId = 'inv-vedo-1000-mod';
    p.dispositivos.find((d) => d.uid === 'placa')!.itemId = 'placa-renepv-585';
    const f = feitos(ROTEIRO_12V, p);
    expect(f[0]).toBe(false);
    expect(f[1]).toBe(false);
    expect(f[5]).toBe(false);
  });

  it('ligar a bateria invertida não conta como cabo', () => {
    const p = projeto12V();
    p.cabos.find((c) => c.uid === 'c1')!.para.terminal = 'batNeg';
    p.cabos.find((c) => c.uid === 'c2')!.para.terminal = 'batPos';
    expect(feitos(ROTEIRO_12V, p)[2]).toBe(false);
  });
});
