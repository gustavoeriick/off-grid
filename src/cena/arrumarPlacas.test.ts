// "Arrumar as placas": a frase da tela e a segurança da fase 8. Mover placa não solta cabo nem conector, então
// arrumar placas ligadas e gerando não pode provocar arco, queimar peça nem desarmar proteção.
// A conta das posições é conferida em gradeDasPlacas.test.ts.

import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import { acoes, type Encaixe, emTutorial, estado, recalcularAgora } from '../estado';
import { type AguaArrumada, mensagemDaArrumacao, nomeDoTelhado } from './arrumarPlacas';
import { arrumarPlacas, type PlacaNaAgua } from './gradeDasPlacas';

describe('a frase da tela', () => {
  const agua = (superficie: string, movidas: number, motivo: string | null = null): AguaArrumada => ({ superficie, nome: nomeDoTelhado(superficie), placas: 3, movidas, motivo });

  it('nome de cada água', () => {
    expect(nomeDoTelhado('telhado-quartinho')).toBe('telhado do quartinho');
    expect(nomeDoTelhado('telhado-varanda-frente')).toBe('telhado da varanda da frente');
    expect(nomeDoTelhado('telhado-varanda-fundos')).toBe('telhado da varanda dos fundos');
    expect(nomeDoTelhado('telhado-frente')).toBe('telhado da casa, lado da frente');
    expect(nomeDoTelhado('telhado-fundos')).toBe('telhado da casa, lado dos fundos');
  });

  it('diz quantas placas e em que telhado, que já estava arrumado, ou por que não deu', () => {
    expect(mensagemDaArrumacao([])).toBe('Não há placas em telhado para arrumar.');
    expect(mensagemDaArrumacao([agua('telhado-quartinho', 3)])).toBe('3 placas arrumadas no telhado do quartinho.');
    expect(mensagemDaArrumacao([agua('telhado-quartinho', 1)])).toBe('1 placa arrumada no telhado do quartinho.');
    expect(mensagemDaArrumacao([agua('telhado-quartinho', 0)])).toBe('As placas já estão arrumadas.');
    expect(mensagemDaArrumacao([agua('telhado-quartinho', 2), agua('telhado-frente', 0), agua('telhado-varanda-frente', 3)])).toBe('5 placas arrumadas em 2 telhados.');
    expect(mensagemDaArrumacao([agua('telhado-quartinho', 0, 'Faltam 3 cm.')])).toBe('Não deu para arrumar as placas do telhado do quartinho: nada foi mexido nele. Faltam 3 cm.');
    expect(mensagemDaArrumacao([agua('telhado-frente', 2), agua('telhado-quartinho', 0, 'Faltam 3 cm.')])).toBe(
      '2 placas arrumadas no telhado da casa, lado da frente. Não deu para arrumar as placas do telhado do quartinho: nada foi mexido nele. Faltam 3 cm.',
    );
  });
});

describe('arrumar placas ligadas e gerando', () => {
  /** 21/06/2026, meio-dia no Rio (UTC − 3). */
  const MEIO_DIA = Date.UTC(2026, 5, 21, 15, 0, 0);
  /** Placa deitada, de face para o céu. */
  const PARA_CIMA: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const em = (superficie: string, x = 0, z = 0, quat: [number, number, number, number] = [0, 0, 0, 1]): Encaixe => ({ pos: [x, 0.5, z], quat, superficie, giro: 0 });
  const liga = (a: string, ta: string, b: string, tb: string): string => acoes.adicionarCabo({ disp: a, terminal: ta }, { disp: b, terminal: tb }, 1)!;

  it('nenhum evento, nada queimado, os cabos continuam ligados, e um desfazer devolve tudo', () => {
    if (emTutorial()) acoes.sairDoTutorial();
    acoes.novoProjeto();
    acoes.carregarProjeto({ ...structuredClone(estado.projeto), dispositivos: [], cabos: [] });
    if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
    acoes.definirTempo(MEIO_DIA);

    // O sistema de 24 V do roteiro da casa: bateria, fusível, inversor com controlador e duas placas em série, com disjuntor.
    const bat = acoes.adicionarDispositivo('bat-alfx-24v-100', em('piso-quartinho', -0.5));
    const inv = acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', em('parede-quartinho-fundo', 0.5));
    const positivo = liga(bat, 'pos', inv, 'batPos');
    acoes.instalarProtecao(positivo, 'prot-fusivel-anl-150');
    liga(bat, 'neg', inv, 'batNeg');
    const placa1 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', -1.3, 0.2, PARA_CIMA));
    const placa2 = acoes.adicionarDispositivo('placa-renepv-585', em('telhado-varanda-frente', 1.6, -0.1, PARA_CIMA));
    liga(placa1, 'neg', placa2, 'pos');
    const dasPlacas = liga(placa1, 'pos', inv, 'pvPos');
    acoes.instalarProtecao(dasPlacas, 'prot-disjuntor-cc-32');
    liga(placa2, 'neg', inv, 'pvNeg');
    acoes.alternarProtecao(positivo, 0);
    acoes.alternarProtecao(dasPlacas, 0);
    acoes.definirLigado(inv, true);
    recalcularAgora();
    acoes.avancarTempo(1);
    expect(estado.simulacao.eventos, 'a montagem certa não deveria provocar nada').toEqual([]);
    expect(estado.simulacao.saida.pvDisponivelW, 'as placas deveriam estar gerando').toBeGreaterThan(100);

    // A conta da arrumação, em uma água deitada de 8 m por 3 m: u é o x da casa e v é o z ao contrário.
    const item = CATALOGO.get('placa-renepv-585');
    if (item?.categoria !== 'placa') throw new Error('placa fora do catálogo');
    const placas = estado.projeto.dispositivos.filter((d) => d.uid === placa1 || d.uid === placa2);
    const naAgua: PlacaNaAgua[] = placas.map((d) => ({ uid: d.uid, u: d.pos[0], v: -d.pos[2], largura: item.largura, altura: item.altura }));
    const conta = arrumarPlacas({ u0: -4, u1: 4, v0: -1.5, v1: 1.5 }, naAgua);
    if (!conta.ok) throw new Error(conta.motivo);
    expect(conta.movidas).toBe(2);

    const antes = JSON.stringify(estado.projeto);
    const cabosAntes = JSON.stringify(estado.projeto.cabos);
    const geracaoAntes = estado.simulacao.saida.pvDisponivelW;
    const encaixes = new Map<string, Encaixe>(
      placas.map((d) => {
        const { u, v } = conta.posicoes.get(d.uid)!;
        return [d.uid, { pos: [u, d.pos[1], -v], quat: d.quat, superficie: d.superficie!, giro: d.giro }];
      }),
    );
    // O comando da cena aplica as posições com esta mesma ação, de uma vez.
    acoes.moverDispositivos(encaixes);
    recalcularAgora();
    acoes.avancarTempo(1);

    expect(estado.simulacao.eventos, 'arrumar as placas não deveria provocar arco nem queimar nada').toEqual([]);
    expect(estado.projeto.dispositivos.every((d) => d.queimado === undefined && d.falha === undefined)).toBe(true);
    expect(estado.projeto.cabos.every((c) => c.queimado === undefined && (c.estados ?? []).every((s) => s !== 'queimada'))).toBe(true);
    // Nenhum cabo foi solto, trocado de terminal ou teve a proteção aberta.
    expect(JSON.stringify(estado.projeto.cabos)).toBe(cabosAntes);
    expect(estado.projeto.dispositivos.find((d) => d.uid === placa1)!.pos[0]).not.toBe(-1.3);
    // Continuam gerando o mesmo (o sol andou um minuto entre as duas leituras).
    expect(Math.abs(estado.simulacao.saida.pvDisponivelW - geracaoAntes)).toBeLessThan(1);

    // Um passo só do desfazer.
    acoes.desfazer();
    expect(JSON.stringify(estado.projeto)).toBe(antes);
  });
});
