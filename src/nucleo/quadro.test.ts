import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Catalogo, Item, Protecao } from '../catalogo/tipos';
import { correntesDeProjeto } from './cabos';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { analisarCircuito } from './circuito';
import { analisarConsultor, modulosDaProtecao } from './consultor';
import { estimar } from './estimativas';
import { ambienteSemSombra } from './irradiancia';
import { calcularOrcamento } from './orcamento';
import { normalDoPlano } from './sol';
import { terminaisDe } from './terminais';
import type { Dispositivo, Projeto, Sugestao } from './tipos';

const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);

function consultar(projeto: Projeto, catalogo: Catalogo = CATALOGO): Sugestao[] {
  const analise = analisarCircuito(projeto, catalogo);
  const estimativas = estimar(projeto, catalogo, analise, AMBIENTE, MS_21_JUN);
  return analisarConsultor(projeto, catalogo, analise, estimativas);
}

function quadro(uid: string): Dispositivo {
  return { uid, itemId: 'acc-quadro-8', pos: [0, 1.5, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null };
}

/** O plano corrigido sem os dois quadros dos cenários, para cada teste montar os seus. */
function semQuadros(): Projeto {
  const p = cenarioPlanoCorrigido();
  p.dispositivos = p.dispositivos.filter((d) => d.itemId !== 'acc-quadro-8');
  for (const c of p.cabos) c.quadro = null;
  return p;
}

const achar = (s: Sugestao[], regra: string): Sugestao | undefined => s.find((x) => x.regra === regra);

describe('item acc-quadro-8', () => {
  it('é um quadro de 8 módulos com medidas típicas', () => {
    const q = CATALOGO.get('acc-quadro-8');
    expect(q?.categoria).toBe('acessorio');
    if (q?.categoria !== 'acessorio') return;
    expect(q.tipo).toBe('quadro');
    expect(q.modulos).toBe(8);
    expect(q.dimensoes).toEqual([0.2, 0.25, 0.09]);
    expect(q.tipico).toContain('dimensoes');
  });

  it('não tem terminais', () => {
    expect(terminaisDe(CATALOGO.get('acc-quadro-8')!)).toEqual([]);
  });
});

describe('módulos das proteções', () => {
  const p = (id: string): Protecao => CATALOGO.get(id) as Protecao;
  it('disjuntor CA 1, disjuntor CC 2, DPS 2, fusível ANL ou Mega fora do trilho', () => {
    expect(modulosDaProtecao(p('prot-disjuntor-ca-16'))).toBe(1);
    expect(modulosDaProtecao(p('prot-disjuntor-cc-32'))).toBe(2);
    expect(modulosDaProtecao(p('prot-dps-cc-600'))).toBe(2);
    expect(modulosDaProtecao(p('prot-fusivel-anl-150'))).toBeNull();
    expect(modulosDaProtecao(p('prot-fusivel-mega-125'))).toBeNull();
  });
});

describe('sem-quadro', () => {
  it('dispara quando há disjuntor ou DPS em cabo sem quadro, com os cabos como alvos', () => {
    const projeto = semQuadros();
    const s = achar(consultar(projeto), 'sem-quadro')!;
    expect(s.nivel).toBe('dica');
    expect(s.titulo).toBe('Ponha as proteções em um quadro');
    expect(s.alvos).toEqual(['c1', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
    expect(s.acao).toEqual({ tipo: 'ver-catalogo', rotulo: 'Ver instalação', categoria: 'acessorio' });
  });

  it('o fusível ANL da bateria sozinho não dispara', () => {
    const projeto = semQuadros();
    for (const c of projeto.cabos) c.protecoes = c.protecoes.filter((id) => id === 'prot-fusivel-anl-150');
    projeto.cabos.find((c) => c.uid === 'c3')!.protecoes.push('prot-fusivel-anl-150');
    expect(achar(consultar(projeto), 'sem-quadro')).toBeUndefined();
  });

  it('some quando os cabos passam por um quadro', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'));
    for (const c of projeto.cabos) c.quadro = 'q1';
    expect(achar(consultar(projeto), 'sem-quadro')).toBeUndefined();
  });
});

describe('quadro-cheio', () => {
  it('alerta quando as proteções passam dos módulos do quadro', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'));
    // Disjuntor CC 2 + DPS 2 + seis disjuntores CA de 1 módulo: 10 módulos em um quadro de 8.
    for (const c of projeto.cabos) c.quadro = 'q1';
    const s = achar(consultar(projeto), 'quadro-cheio')!;
    expect(s.nivel).toBe('alerta');
    expect(s.titulo).toBe('O quadro está cheio');
    expect(s.texto).toBe('Este quadro tem lugar para 8 módulos e as proteções ocupam 10. Use um segundo quadro.');
    expect(s.alvos[0]).toBe('q1');
  });

  it('com dois quadros que cabem, não alerta', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'), quadro('q2'));
    for (const c of projeto.cabos) c.quadro = c.uid === 'c1' ? 'q1' : 'q2';
    expect(achar(consultar(projeto), 'quadro-cheio')).toBeUndefined();
  });

  it('exatamente 8 módulos cabem', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'));
    projeto.cabos.find((c) => c.uid === 'c1')!.quadro = 'q1';
    for (const c of projeto.cabos) if (c.de.terminal === 'caSaida' && ['c6', 'c7', 'c8', 'c9'].includes(c.uid)) c.quadro = 'q1';
    // 2 + 2 + 4 = 8.
    expect(achar(consultar(projeto), 'quadro-cheio')).toBeUndefined();
  });
});

describe('sem-disjuntor-na-saida: um disjuntor por cabo', () => {
  it('cada cabo recebe o menor disjuntor que atende a 1,25 vez a corrente dele', () => {
    const catalogo = new Map<string, Item>(CATALOGO);
    const ca16 = CATALOGO.get('prot-disjuntor-ca-16') as Protecao;
    catalogo.set('prot-disjuntor-ca-6', { ...ca16, id: 'prot-disjuntor-ca-6', nome: 'Disjuntor 6 A', correnteA: 6 });
    catalogo.set('prot-disjuntor-ca-10', { ...ca16, id: 'prot-disjuntor-ca-10', nome: 'Disjuntor 10 A', correnteA: 10 });
    const projeto = cenarioPlanoNoPapel();
    const s = achar(consultar(projeto, catalogo), 'sem-disjuntor-na-saida')!;
    expect(s.acao?.tipo).toBe('proteger-cabos');
    if (s.acao?.tipo !== 'proteger-cabos') return;
    expect(s.acao.itens.map((i) => i.cabo)).toEqual(['c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
    const correntes = correntesDeProjeto(projeto, catalogo, analisarCircuito(projeto, catalogo));
    const disponiveis = [6, 10, 16];
    for (const { cabo, protecaoId } of s.acao.itens) {
      const escolhido = (catalogo.get(protecaoId) as Protecao).correnteA;
      const exigida = 1.25 * (correntes.get(cabo) ?? 0);
      // O menor disponível que atende; se nenhum atende, o maior.
      const esperado = disponiveis.find((n) => n >= exigida) ?? 16;
      expect(escolhido, cabo).toBe(esperado);
    }
    // Com os três tamanhos disponíveis, o cabo de menor corrente não leva o disjuntor maior.
    const menor = Math.min(...s.acao.itens.map((i) => correntes.get(i.cabo) ?? 0));
    const dele = s.acao.itens.find((i) => (correntes.get(i.cabo) ?? 0) === menor)!;
    expect((catalogo.get(dele.protecaoId) as Protecao).correnteA).toBeLessThan(16);
  });
});

describe('orçamento e núcleo com o quadro como dispositivo', () => {
  it('o quadro entra uma vez por dispositivo, como instalação', () => {
    const base = calcularOrcamento(semQuadros(), CATALOGO);
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'), quadro('q2'));
    const orc = calcularOrcamento(projeto, CATALOGO);
    const linha = orc.linhas.find((l) => l.itemId === 'acc-quadro-8')!;
    expect(linha.grupo).toBe('instalacao');
    expect(linha.quantidade).toBe(2);
    expect(linha.total).toBeCloseTo(2 * 41.7, 6);
    expect(orc.total).toBeCloseTo(base.total + 2 * 41.7, 6);
    expect(orc.linhas.filter((l) => l.itemId === 'acc-quadro-8')).toHaveLength(1);
  });

  it('um acessório que o orçamento já inclui sozinho não conta em dobro', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push({ ...quadro('h'), itemId: 'acc-haste' });
    const base = calcularOrcamento(semQuadros(), CATALOGO);
    expect(calcularOrcamento(projeto, CATALOGO).total).toBeCloseTo(base.total, 6);
  });

  it('o quadro não quebra a análise do circuito nem as estimativas', () => {
    const projeto = semQuadros();
    projeto.dispositivos.push(quadro('q1'));
    const a = analisarCircuito(projeto, CATALOGO);
    const e = estimar(projeto, CATALOGO, a, AMBIENTE, MS_21_JUN);
    const sem = semQuadros();
    const a0 = analisarCircuito(sem, CATALOGO);
    const e0 = estimar(sem, CATALOGO, a0, AMBIENTE, MS_21_JUN);
    expect(a.problemas).toEqual(a0.problemas);
    expect(e.autonomiaHoras).toEqual(e0.autonomiaHoras);
  });
});
