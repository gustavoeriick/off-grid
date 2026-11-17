// Filtro de linha: aparelhos ligam nele e um cabo só sai dele. Consultor: filtro-sobrecarregado e filtro-sem-tomada.

import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { CASA_INICIAL } from './cenarios';
import { correntesDeProjeto } from './cabos';
import { analisarCircuito } from './circuito';
import { analisarConsultor } from './consultor';
import { estimar } from './estimativas';
import { ambienteSemSombra } from './irradiancia';
import { normalDoPlano } from './sol';
import type { Cabo, Projeto, Sugestao } from './tipos';

const ANENJI = 'inv-anenji-3kw-24v-127';
const FILTRO = 'acc-filtro-linha-5';
const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
// Meio-dia local (UTC−3) de 21/06/2026.
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);

/** `pecas` mapeia uid para id do catálogo; cada ligação é `uid.terminal`, `uid.terminal`, com o cabo opcional. */
function montar(pecas: Record<string, string>, ligacoes: [string, string, string?][]): Projeto {
  const cabos: Cabo[] = ligacoes.map(([de, para, caboId], i) => {
    const [dDe, tDe] = de.split('.');
    const [dPara, tPara] = para.split('.');
    return { uid: `k${i + 1}`, de: { disp: dDe, terminal: tDe }, para: { disp: dPara, terminal: tPara }, caboId: caboId ?? 'cabo-ca-2p5', comprimento: 1, protecoes: [], quadro: null };
  });
  return {
    versao: 2, nome: 'teste', casa: structuredClone(CASA_INICIAL), localId: 'rio', clima: 'tipico', tensaoRede: 127, prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null,
    })),
    cabos,
  };
}

const BANCO: [string, string, string?][] = [['inv.batPos', 'b.pos', 'cabo-bat-35'], ['inv.batNeg', 'b.neg', 'cabo-bat-35']];

function consultar(projeto: Projeto, catalogo = CATALOGO): Sugestao[] {
  const analise = analisarCircuito(projeto, catalogo);
  const estimativas = estimar(projeto, catalogo, analise, AMBIENTE, MS_21_JUN);
  return analisarConsultor(projeto, catalogo, analise, estimativas);
}

/** Inversor com bateria, um filtro na saída e os aparelhos dados no filtro (cabos k3 do filtro, k4... dos aparelhos). */
function comFiltro(aparelhos: string[]): Projeto {
  const pecas: Record<string, string> = { inv: ANENJI, b: 'bat-alfx-24v-100', f: FILTRO };
  const ligacoes: [string, string, string?][] = [...BANCO, ['inv.caSaida', 'f.tomadas']];
  aparelhos.forEach((id, i) => {
    pecas[`a${i + 1}`] = id;
    ligacoes.push([`a${i + 1}.plug`, 'f.tomadas']);
  });
  return montar(pecas, ligacoes);
}

describe('filtro de linha no circuito', () => {
  const projeto = comFiltro(['ap-modem', 'ap-roteador', 'ap-mini-pc']);

  it('os três aparelhos ligados no filtro entram nas cargas do sistema', () => {
    const analise = analisarCircuito(projeto, CATALOGO);
    expect(analise.sistema?.cargas).toEqual(['a1', 'a2', 'a3']);
    expect(analise.naRede).toEqual([]);
  });

  it('o cabo do inversor ao filtro leva a soma dos três: 40 W / 127 V', () => {
    const analise = analisarCircuito(projeto, CATALOGO);
    const correntes = correntesDeProjeto(projeto, CATALOGO, analise);
    expect(correntes.get('k3')).toBeCloseTo(40 / 127, 6);
    expect(correntes.get('k4')).toBeCloseTo(10 / 127, 6);
    expect(correntes.get('k5')).toBeCloseTo(10 / 127, 6);
    expect(correntes.get('k6')).toBeCloseTo(20 / 127, 6);
  });

  it('com o cabo do filtro na tomada da rede, os aparelhos ficam na rede, não no inversor', () => {
    const p = montar({ inv: ANENJI, b: 'bat-alfx-24v-100', f: FILTRO, r: 'rede-tomada', a1: 'ap-modem' }, [
      ...BANCO, ['f.tomadas', 'r.tomada'], ['a1.plug', 'f.tomadas'],
    ]);
    const analise = analisarCircuito(p, CATALOGO);
    expect(analise.sistema?.cargas).toEqual([]);
    expect(analise.naRede).toEqual(['a1']);
  });
});

describe('`filtro-sobrecarregado` e `filtro-sem-tomada`', () => {
  const regras = (s: Sugestao[]): string[] => s.map((x) => x.regra);

  it('modem, roteador e mini PC (40 W, 0,3 A) não disparam nenhuma das duas', () => {
    const r = regras(consultar(comFiltro(['ap-modem', 'ap-roteador', 'ap-mini-pc'])));
    expect(r).not.toContain('filtro-sobrecarregado');
    expect(r).not.toContain('filtro-sem-tomada');
  });

  it('o ar-condicionado portátil no filtro dispara: 1.450 / 127 = 11,4 A, mais que os 10 A', () => {
    const lista = consultar(comFiltro(['ap-ar-portatil']));
    const s = lista.find((x) => x.regra === 'filtro-sobrecarregado')!;
    expect(s).toBeDefined();
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe('O filtro de linha está sobrecarregado');
    expect(s.texto).toBe(
      'Os aparelhos ligados nele puxam 11,4 A e o filtro aguenta 10 A. Ele esquenta e o fusível dele queima. ' +
        'Passe ar-condicionado portátil de 12.000 BTU para uma tomada só dele.',
    );
    expect(s.alvos).toEqual(['f', 'a1', 'k4']);
  });

  it('aparelho desligado não puxa corrente', () => {
    const p = comFiltro(['ap-ar-portatil']);
    p.dispositivos.find((d) => d.uid === 'a1')!.ligado = false;
    expect(regras(consultar(p))).not.toContain('filtro-sobrecarregado');
  });

  it('o limite é 10 A: uma carga de 1.270 W não dispara, uma de 1.280 W dispara', () => {
    const catalogo = new Map(CATALOGO);
    const base = CATALOGO.get('ap-microondas')!;
    if (base.categoria !== 'aparelho') throw new Error('micro-ondas');
    catalogo.set('t-1270', { ...base, id: 't-1270', potenciaW: 1270 });
    catalogo.set('t-1280', { ...base, id: 't-1280', potenciaW: 1280 });
    expect(regras(consultar(comFiltro(['t-1270']), catalogo))).not.toContain('filtro-sobrecarregado');
    expect(regras(consultar(comFiltro(['t-1280']), catalogo))).toContain('filtro-sobrecarregado');
  });

  it('seis aparelhos em um filtro de cinco tomadas disparam `filtro-sem-tomada`; cinco não', () => {
    const cinco = consultar(comFiltro(Array(5).fill('ap-lampada')));
    expect(regras(cinco)).not.toContain('filtro-sem-tomada');
    const lista = consultar(comFiltro(Array(6).fill('ap-lampada')));
    const s = lista.find((x) => x.regra === 'filtro-sem-tomada')!;
    expect(s.nivel).toBe('alerta');
    expect(s.texto).toBe('Este filtro tem 5 tomadas e há 6 aparelhos ligados nele. Tire um ou use outro filtro.');
    expect(regras(lista)).not.toContain('filtro-sobrecarregado');
  });

  it('o filtro na tomada da rede, sem inversor, também é conferido', () => {
    const p = montar({ f: FILTRO, r: 'rede-tomada', a1: 'ap-ar-portatil' }, [['f.tomadas', 'r.tomada'], ['a1.plug', 'f.tomadas']]);
    expect(regras(consultar(p))).toContain('filtro-sobrecarregado');
  });
});
