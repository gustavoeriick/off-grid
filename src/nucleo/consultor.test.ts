import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Aparelho, Catalogo } from '../catalogo/tipos';
import { CASA_INICIAL, cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { analisarCircuito } from './circuito';
import { analisarConsultor, planejarMaisPlaca } from './consultor';
import { estimar } from './estimativas';
import { ambienteSemSombra } from './irradiancia';
import { normalDoPlano } from './sol';
import type { Acao, Cabo, Estimativas, Projeto, Sugestao } from './tipos';

const AMBIENTE = ambienteSemSombra(normalDoPlano(17, 0));
// Meio-dia local (UTC−3) de 21/06/2026.
const MS_21_JUN = Date.UTC(2026, 5, 21, 15);

function analisar(projeto: Projeto, catalogo: Catalogo = CATALOGO) {
  const analise = analisarCircuito(projeto, catalogo);
  const estimativas = estimar(projeto, catalogo, analise, AMBIENTE, MS_21_JUN);
  return { analise, estimativas };
}

/** Sugestões do consultor, com as estimativas do dia 21/06/2026 (ou as dadas). */
function consultar(projeto: Projeto, estimativas?: Estimativas, catalogo: Catalogo = CATALOGO): Sugestao[] {
  const r = analisar(projeto, catalogo);
  return analisarConsultor(projeto, catalogo, r.analise, estimativas ?? r.estimativas);
}

const regras = (s: Sugestao[]): string[] => s.map((x) => x.regra);
const da = (s: Sugestao[], regra: string): Sugestao => {
  const achada = s.find((x) => x.regra === regra);
  if (!achada) throw new Error(`regra ausente: ${regra}; há ${regras(s).join(', ')}`);
  return achada;
};

/** Projeto pequeno: `pecas` mapeia `uid` para `id` do catálogo; cada ligação é um par `uid.terminal`, com um cabo opcional. */
function montar(
  pecas: Record<string, string>,
  ligacoes: [string, string, string?, number?][],
  tensaoRede: 127 | 220 = 127,
): Projeto {
  const cabos: Cabo[] = ligacoes.map(([de, para, caboId, comprimento], i) => {
    const [dDe, tDe] = de.split('.');
    const [dPara, tPara] = para.split('.');
    return {
      uid: `k${i + 1}`,
      de: { disp: dDe, terminal: tDe },
      para: { disp: dPara, terminal: tPara },
      caboId: caboId ?? 'cabo-bat-35',
      comprimento: comprimento ?? 1,
      protecoes: [],
      quadro: null,
    };
  });
  return {
    versao: 2,
    nome: 'teste',
    casa: structuredClone(CASA_INICIAL),
    localId: 'rio',
    clima: 'tipico',
    tensaoRede,
    prioridade: 'rede',
    dispositivos: Object.entries(pecas).map(([uid, itemId]) => ({
      uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null,
    })),
    cabos,
  };
}

const ANENJI = 'inv-anenji-3kw-24v-127';
const AIKER = 'inv-aiker-500-12v-110';
const ALFX = 'bat-alfx-24v-100';
const BELIFOU = 'bat-belifou-12v-100';
const RENEPV = 'placa-renepv-585';
const EPEVER = 'ctl-epever-xtra4210n';
const PWM = 'ctl-pwm-30a';

const ligaBanco = (inv: string, bat: string): [string, string][] => [[`${inv}.batPos`, `${bat}.pos`], [`${inv}.batNeg`, `${bat}.neg`]];

// ---------------------------------------------------------------- Ações aplicadas ao projeto

/** Aplica ao projeto as ações que o aplicativo executaria: `proteger-cabos`, `trocar-cabos` e `mais-placa` (em série). */
function aplicar(projeto: Projeto, acao: Acao): void {
  if (acao.tipo === 'proteger-cabos') {
    for (const { cabo, protecaoId } of acao.itens) projeto.cabos.find((c) => c.uid === cabo)!.protecoes.push(protecaoId);
  } else if (acao.tipo === 'trocar-cabos') {
    for (const c of projeto.cabos) if (acao.cabos.includes(c.uid)) c.caboId = acao.caboId;
  } else if (acao.tipo === 'mais-placa') {
    // Como no "plano corrigido": `placa2` em série depois de `placa1`.
    const { analise } = analisar(projeto);
    const ultima = analise.sistema!.fileiras[0].at(-1)!;
    const posDaUltima = projeto.dispositivos.findIndex((d) => d.uid === ultima);
    projeto.dispositivos.splice(posDaUltima + 1, 0, { ...projeto.dispositivos[posDaUltima], uid: 'placa2' });
    const paraONegativo = projeto.cabos.find((c) => c.de.disp === ultima && c.de.terminal === 'neg')!;
    paraONegativo.de = { disp: 'placa2', terminal: 'neg' };
    projeto.cabos.push({
      uid: 'c12',
      de: { disp: ultima, terminal: 'neg' },
      para: { disp: 'placa2', terminal: 'pos' },
      caboId: 'cabo-solar-6',
      comprimento: 1.5,
      protecoes: [],
      quadro: null,
    });
  } else {
    throw new Error(`ação não aplicada no teste: ${acao.tipo}`);
  }
}

// ---------------------------------------------------------------- Seção 9: os dois cenários

describe('consultor: "plano no papel"', () => {
  const sugestoes = consultar(cenarioPlanoNoPapel());

  it('as sugestões, nesta ordem', () => {
    expect(sugestoes.map((s) => [s.regra, s.nivel])).toEqual([
      ['placas-abaixo-da-tensao', 'erro'],
      ['protecao-maior-que-o-cabo', 'erro'],
      ['autonomia-curta', 'alerta'],
      ['carga-acima-da-bateria', 'dica'],
      ['sem-dps-nas-placas', 'dica'],
      ['sem-disjuntor-na-saida', 'dica'],
      ['sem-quadro', 'dica'],
    ]);
  });

  it('placas-abaixo-da-tensao', () => {
    const s = da(sugestoes, 'placas-abaixo-da-tensao');
    expect(s.titulo).toBe('As placas não alcançam a tensão mínima da entrada');
    expect(s.texto).toBe(
      'Uma placa entrega cerca de 37,9 V no calor, e esta entrada só trabalha a partir de 60 V. ' +
        'Com 2 placas em série a tensão sobe para 75,8 V.',
    );
    expect(s.acao?.tipo).toBe('mais-placa');
  });

  it('protecao-maior-que-o-cabo', () => {
    const s = da(sugestoes, 'protecao-maior-que-o-cabo');
    expect(s.titulo).toBe('Fusível de 150 A em cabo que aguenta 125 A');
    expect(s.alvos).toEqual(['c3', 'c4']);
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', cabos: ['c3', 'c4'], caboId: 'cabo-bat-35' });
  });

  it('autonomia-curta', () => {
    const s = da(sugestoes, 'autonomia-curta');
    expect(s.titulo).toBe('Com o que está ligado, a bateria dura 4,1 horas');
    expect(s.texto).toContain('a autonomia vai para 8,2 horas');
    expect(s.texto).toContain('Desligar PC de trabalho do plano (RX 580) sozinho leva a 5,6 horas.');
    expect(s.texto.endsWith(' Essa conta supõe tudo ligado ao mesmo tempo; em uma queda de luz de verdade costuma durar mais, porque nem tudo fica ligado o tempo todo.')).toBe(true);
    expect(s.acao?.tipo).toBe('mais-bateria');
  });

  it('carga-acima-da-bateria', () => {
    const s = da(sugestoes, 'carga-acima-da-bateria');
    expect(s.texto).toContain('a 120 A');
    expect(s.texto).toContain('aceita 50 A');
  });

  it('sem-dps-nas-placas', () => {
    expect(da(sugestoes, 'sem-dps-nas-placas').acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'c1', protecaoId: 'prot-dps-cc-600' }] });
  });

  it('sem-disjuntor-na-saida', () => {
    expect(da(sugestoes, 'sem-disjuntor-na-saida').acao).toMatchObject({
      tipo: 'proteger-cabos',
      itens: ['c6', 'c7', 'c8', 'c9', 'c10', 'c11'].map((cabo) => ({ cabo, protecaoId: 'prot-disjuntor-ca-16' })),
    });
  });

  it('não aparece cabo-fino para a bateria', () => {
    expect(regras(sugestoes)).not.toContain('cabo-fino');
  });
});

describe('consultor: "plano corrigido"', () => {
  const projeto = cenarioPlanoCorrigido();
  const sugestoes = consultar(projeto);

  it('as sugestões, nesta ordem', () => {
    expect(sugestoes.map((s) => [s.regra, s.nivel])).toEqual([
      ['autonomia-curta', 'alerta'],
      ['geracao-menor-que-o-consumo', 'alerta'],
      ['carga-acima-da-bateria', 'dica'],
    ]);
  });

  it('autonomia-curta e carga-acima-da-bateria', () => {
    expect(da(sugestoes, 'autonomia-curta').titulo).toBe('Com o que está ligado, a bateria dura 4,1 horas');
    expect(da(sugestoes, 'carga-acima-da-bateria').texto).toContain('120 A');
  });

  it('geracao-menor-que-o-consumo: 44%, 3,91 kWh, 8,85 kWh e 3 placas', () => {
    const s = da(sugestoes, 'geracao-menor-que-o-consumo');
    expect(s.titulo).toBe('As placas repõem 44% do que os aparelhos gastam em um dia');
    const geracao = Number(/Geração do dia: (\d+,\d\d) kWh/.exec(s.texto)![1].replace(',', '.'));
    expect(Math.abs(geracao - 3.91)).toBeLessThanOrEqual(3.91 * 0.02);
    expect(s.texto).toContain('Consumo: 8,85 kWh');
    expect(s.texto).toContain('faltam cerca de 3 placas');
    expect(s.acao?.tipo).toBe('mais-placa');
  });

  it('planejarMaisPlaca devolve série', () => {
    expect(planejarMaisPlaca(projeto, CATALOGO, analisarCircuito(projeto, CATALOGO))).toEqual({ modo: 'serie' });
  });
});

describe('consultor: equivalência', () => {
  it('aplicar as ações do "plano no papel" e acrescentar os dois quadros leva às sugestões do "plano corrigido"', () => {
    const projeto = cenarioPlanoNoPapel();
    const sugestoes = consultar(projeto);
    for (const regra of ['placas-abaixo-da-tensao', 'protecao-maior-que-o-cabo', 'sem-dps-nas-placas', 'sem-disjuntor-na-saida']) {
      aplicar(projeto, da(sugestoes, regra).acao!);
    }
    // O corrigido também tem os dois quadros, com os cabos associados.
    projeto.dispositivos.push(
      { ...projeto.dispositivos[0], uid: 'quadro-cc', itemId: 'acc-quadro-8' },
      { ...projeto.dispositivos[0], uid: 'quadro-ca', itemId: 'acc-quadro-8' },
    );
    for (const c of projeto.cabos) c.quadro = c.uid === 'c1' ? 'quadro-cc' : c.de.terminal === 'caSaida' ? 'quadro-ca' : null;
    const depois = consultar(projeto);
    const corrigido = consultar(cenarioPlanoCorrigido());
    expect(depois.map((s) => [s.regra, s.nivel, s.titulo])).toEqual(corrigido.map((s) => [s.regra, s.nivel, s.titulo]));
    expect(regras(depois)).toEqual(['autonomia-curta', 'geracao-menor-que-o-consumo', 'carga-acima-da-bateria']);
  });
});

// ---------------------------------------------------------------- Regras isoladas

describe('consultor: regras isoladas', () => {
  it('sem inversor: só `sem-inversor`', () => {
    const s = consultar(montar({ p: RENEPV, b: ALFX }, []));
    expect(regras(s)).toEqual(['sem-inversor']);
    expect(s[0]).toMatchObject({ nivel: 'dica', titulo: 'Falta o inversor' });
  });

  it('`saida-na-rede`', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.push({
      uid: 'c12', de: { disp: 'inversor', terminal: 'caSaida' }, para: { disp: 'rede', terminal: 'tomada' },
      caboId: 'cabo-ca-2p5', comprimento: 2, protecoes: [], quadro: null,
    });
    const s = da(consultar(projeto), 'saida-na-rede');
    expect(s).toMatchObject({ nivel: 'erro', titulo: 'A saída do inversor está ligada na rede da casa' });
    expect(consultar(projeto)[0].regra).toBe('saida-na-rede');
  });

  it('`tensao-do-banco`: bateria de 12 V no inversor de 24 V propõe 2 em série', () => {
    const s = da(consultar(montar({ inv: ANENJI, b: BELIFOU }, ligaBanco('inv', 'b'))), 'tensao-do-banco');
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe('Bateria de 12 V em inversor de 24 V');
    expect(s.texto).toContain('Ligue 2 baterias de 12 V em série');
    expect(s.texto).toContain('troque por uma bateria de 24 V');
  });

  it('`tensao-do-banco`: banco maior que o inversor', () => {
    const s = da(consultar(montar({ inv: AIKER, b: ALFX }, ligaBanco('inv', 'b'))), 'tensao-do-banco');
    expect(s.titulo).toBe('Bateria de 24 V em inversor de 12 V');
    expect(s.texto).toBe('A tensão do banco é maior que a do inversor e pode queimá-lo. Refaça a ligação.');
  });

  it('`tensao-de-saida`: inversor de 220 V em casa de 127 V', () => {
    const s = da(consultar(montar({ inv: 'inv-jesudom-3k2-24v-220', b: ALFX }, ligaBanco('inv', 'b'))), 'tensao-de-saida');
    expect(s.titulo).toBe('Inversor de 220 V em casa de 127 V');
    expect(s.texto).toBe('Aparelho de 127 V queima em 220 V. Use um inversor com saída de 110 a 127 V.');
    expect(s.acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'inversor' });
  });

  it('`tensao-de-saida`: inversor de 127 V em casa de 220 V', () => {
    const s = da(consultar(montar({ inv: ANENJI, b: ALFX }, ligaBanco('inv', 'b'), 220)), 'tensao-de-saida');
    expect(s.titulo).toBe('Inversor de 127 V em casa de 220 V');
    expect(s.texto).toBe('Aparelho de 220 V não funciona direito em 127 V. Use um inversor com saída de 220 V.');
  });

  it('`aparelho-tensao`: geladeira de 127 V no inversor de 220 V', () => {
    const projeto = montar({ inv: 'inv-jesudom-3k2-24v-220', b: ALFX, g: 'ap-geladeira' }, [...ligaBanco('inv', 'b'), ['inv.caSaida', 'g.plug', 'cabo-ca-2p5']]);
    const s = da(consultar(projeto), 'aparelho-tensao');
    expect(s.titulo).toBe('Geladeira grande é de 127 V e o inversor entrega 220 V');
    expect(s.alvos).toEqual(['g']);
  });

  it('`onda-modificada`: PC no inversor de onda modificada', () => {
    const projeto = montar({ inv: 'inv-vedo-1000-mod', b: BELIFOU, pc: 'ap-pc-24h' }, [...ligaBanco('inv', 'b'), ['inv.caSaida', 'pc.plug', 'cabo-ca-2p5']]);
    const s = da(consultar(projeto), 'onda-modificada');
    expect(s).toMatchObject({ nivel: 'alerta', titulo: 'Inversor de onda modificada com PC ligado 24 h' });
    expect(s.acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'inversor' });
  });

  it('`bateria-automotiva` e `item-nao-recomendado` para a bateria de carro', () => {
    const s = consultar(montar({ inv: AIKER, b: 'bat-automotiva-60' }, ligaBanco('inv', 'b')));
    expect(da(s, 'bateria-automotiva').titulo).toBe('Bateria de carro não serve para este uso');
    expect(da(s, 'bateria-automotiva').acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'bateria' });
    const naoRecomendado = da(s, 'item-nao-recomendado');
    expect(naoRecomendado.titulo).toBe('Bateria de carro 60 Ah: não recomendado');
    expect(naoRecomendado.texto).toBe(CATALOGO.get('bat-automotiva-60')!.naoRecomendado);
    expect(regras(s).indexOf('bateria-automotiva')).toBeLessThan(regras(s).indexOf('item-nao-recomendado'));
  });

  it('`item-nao-recomendado`: cabo de alucobre, a ação troca por cobre de mesma seção', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.find((c) => c.uid === 'c3')!.caboId = 'cabo-bat-25-alucobre';
    const s = da(consultar(projeto), 'item-nao-recomendado');
    expect(s.titulo).toBe('Cabo 25 mm² alucobre: não recomendado');
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', cabos: ['c3'], caboId: 'cabo-bat-25' });
  });

  /** Três Renepv em série em um controlador MPPT de 100 V, com banco de 24 V. */
  const emSerieNoEpever = (n: number): Projeto => {
    const pecas: Record<string, string> = { inv: AIKER, b: ALFX, ctl: EPEVER };
    const ligacoes: [string, string, string?][] = [['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'], ...ligaBanco('inv', 'b')];
    for (let i = 1; i <= n; i++) pecas[`p${i}`] = RENEPV;
    ligacoes.push(['p1.pos', 'ctl.pvPos', 'cabo-solar-6']);
    for (let i = 1; i < n; i++) ligacoes.push([`p${i}.neg`, `p${i + 1}.pos`, 'cabo-solar-6']);
    ligacoes.push([`p${n}.neg`, 'ctl.pvNeg', 'cabo-solar-6']);
    return montar(pecas, ligacoes);
  };

  it('`placas-acima-do-limite`: 3 Renepv em série no Epever', () => {
    const s = da(consultar(emSerieNoEpever(3)), 'placas-acima-do-limite');
    expect(s.nivel).toBe('erro');
    // 3 × 52,01 × 1,0405 = 162,349 V: arredondado a uma casa dá 162,3 (a especificação diz 162,4, que vem de arredondar 162,35).
    expect(s.texto).toContain('chega a 162,3 V');
    expect(s.texto).toContain('aguenta 100 V');
  });

  it('`corrente-das-placas`: duas fileiras de duas Renepv no Anenji', () => {
    const projeto = montar({ inv: ANENJI, b: ALFX, a: RENEPV, b2: RENEPV, c: RENEPV, d: RENEPV }, [
      ...ligaBanco('inv', 'b'),
      ['a.pos', 'inv.pvPos', 'cabo-solar-6'], ['a.neg', 'b2.pos', 'cabo-solar-6'], ['b2.neg', 'inv.pvNeg', 'cabo-solar-6'],
      ['c.pos', 'inv.pvPos', 'cabo-solar-6'], ['c.neg', 'd.pos', 'cabo-solar-6'], ['d.neg', 'inv.pvNeg', 'cabo-solar-6'],
    ]);
    const s = da(consultar(projeto), 'corrente-das-placas');
    expect(s.nivel).toBe('erro');
    expect(s.texto).toContain('2 fileiras em paralelo somam 28,4 A e a entrada aceita 18 A.');
  });

  it('`pwm-desperdica`: Renepv no PWM com banco de 24 V desperdiça 29%', () => {
    const projeto = montar({ inv: AIKER, b: ALFX, ctl: PWM, p: RENEPV }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'],
      ['p.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p.neg', 'ctl.pvNeg', 'cabo-solar-6'],
    ]);
    const s = da(consultar(projeto), 'pwm-desperdica');
    expect(s.titulo).toBe('O controlador PWM desperdiça cerca de 29% desta placa');
    expect(s.texto).toContain('na tensão da bateria, 28,1 V');
    expect(s.acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'controlador' });
  });

  it('`pwm-desperdica` não aparece com Resun de 100 W e bateria de 12 V', () => {
    const projeto = montar({ inv: AIKER, b: BELIFOU, ctl: PWM, p: 'placa-resun-100' }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'],
      ['p.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p.neg', 'ctl.pvNeg', 'cabo-solar-6'],
    ]);
    expect(regras(consultar(projeto))).not.toContain('pwm-desperdica');
  });

  it('`potencia-das-placas`: placas além da entrada', () => {
    const projeto = montar({ inv: AIKER, b: BELIFOU, ctl: PWM, a: 'placa-resun-155', c: 'placa-resun-155', d: 'placa-resun-155' }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'],
      ['a.pos', 'ctl.pvPos', 'cabo-solar-16'], ['a.neg', 'ctl.pvNeg', 'cabo-solar-16'],
      ['c.pos', 'ctl.pvPos', 'cabo-solar-16'], ['c.neg', 'ctl.pvNeg', 'cabo-solar-16'],
      ['d.pos', 'ctl.pvPos', 'cabo-solar-16'], ['d.neg', 'ctl.pvNeg', 'cabo-solar-16'],
    ]);
    expect(regras(consultar(projeto))).not.toContain('potencia-das-placas');
    const catalogo = new Map(CATALOGO);
    const pwm = CATALOGO.get(PWM)!;
    if (pwm.categoria !== 'controlador') throw new Error('catálogo');
    catalogo.set(PWM, { ...pwm, solar: { ...pwm.solar, potenciaMaxW: 400 } });
    const s = da(consultar(projeto, undefined, catalogo), 'potencia-das-placas');
    expect(s.texto).toContain('São 465 W de placas para uma entrada de 400 W.');
  });

  it('`sobrecarga`: chuveiro no "plano no papel"', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.dispositivos.push({ ...projeto.dispositivos.find((d) => d.uid === 'ap-tv')!, uid: 'ap-chuveiro', itemId: 'ap-chuveiro' });
    projeto.cabos.push({
      uid: 'c12', de: { disp: 'inversor', terminal: 'caSaida' }, para: { disp: 'ap-chuveiro', terminal: 'plug' },
      caboId: 'cabo-ca-4', comprimento: 5, protecoes: [], quadro: null,
    });
    const s = da(consultar(projeto), 'sobrecarga');
    expect(s.nivel).toBe('erro');
    expect(s.texto).toContain('soma 6.025 W e o inversor entrega 3.000 W');
    expect(s.acao).toMatchObject({ tipo: 'desligar', dispositivo: 'ap-chuveiro' });
  });

  it('`pico-de-partida`: a geladeira sozinha não dispara, com o PC de trabalho dispara', () => {
    const base = (pecas: Record<string, string>) =>
      montar({ inv: AIKER, b: BELIFOU, ...pecas }, [
        ...ligaBanco('inv', 'b'),
        ...Object.keys(pecas).map((uid): [string, string, string] => ['inv.caSaida', `${uid}.plug`, 'cabo-ca-2p5']),
      ]);
    expect(regras(consultar(base({ g: 'ap-geladeira' })))).not.toContain('pico-de-partida');
    const s = da(consultar(base({ g: 'ap-geladeira', pc: 'ap-pc-trabalho' })), 'pico-de-partida');
    expect(s.nivel).toBe('alerta');
    expect(s.titulo).toBe('O inversor pode não aguentar a partida de Geladeira grande');
    expect(s.texto).toContain('a partida chega a 1.035 W e o inversor aguenta 1.000 W de pico.');
  });

  it('`corrente-da-bateria`: aparelho de 2.400 W no "plano no papel"', () => {
    const teste: Aparelho = {
      ...(CATALOGO.get('ap-tv') as Aparelho), id: 'ap-teste', nome: 'Aparelho de teste', potenciaW: 2400, mediaW: 2400, picoW: 2400,
    };
    const catalogo: Catalogo = new Map([...CATALOGO, ['ap-teste', teste]]);
    const projeto = cenarioPlanoNoPapel();
    expect(regras(consultar(projeto, undefined, catalogo))).not.toContain('corrente-da-bateria');
    projeto.dispositivos.push({ ...projeto.dispositivos.find((d) => d.uid === 'ap-tv')!, uid: 'teste', itemId: 'ap-teste' });
    projeto.cabos.push({
      uid: 'c12', de: { disp: 'inversor', terminal: 'caSaida' }, para: { disp: 'teste', terminal: 'plug' },
      caboId: 'cabo-ca-4', comprimento: 3, protecoes: [], quadro: null,
    });
    const s = da(consultar(projeto, undefined, catalogo), 'corrente-da-bateria');
    expect(s.nivel).toBe('alerta');
    expect(s.texto).toContain('corta em 100 A');
    expect(s.acao?.tipo).toBe('mais-bateria');
  });

  it('`sem-protecao-da-bateria`: sem o fusível em c3', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.find((c) => c.uid === 'c3')!.protecoes = [];
    const s = da(consultar(projeto), 'sem-protecao-da-bateria');
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe('Falta fusível entre a bateria e o inversor');
    expect(s.acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'c3', protecaoId: 'prot-fusivel-anl-150' }] });
  });

  it('`cabo-fino`: 3 Renepv em paralelo em um só par de cabo-solar-4', () => {
    const projeto = montar({ inv: AIKER, b: ALFX, ctl: EPEVER, p1: RENEPV, p2: RENEPV, p3: RENEPV }, [
      ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'], ...ligaBanco('inv', 'b'),
      ['p1.pos', 'ctl.pvPos', 'cabo-solar-4'], ['p1.neg', 'ctl.pvNeg', 'cabo-solar-4'],
      ['p2.pos', 'p1.pos', 'cabo-solar-6'], ['p2.neg', 'p1.neg', 'cabo-solar-6'],
      ['p3.pos', 'p1.pos', 'cabo-solar-6'], ['p3.neg', 'p1.neg', 'cabo-solar-6'],
    ]);
    const s = da(consultar(projeto), 'cabo-fino');
    expect(s.nivel).toBe('erro');
    expect(s.texto).toBe('Por este cabo passam até 53,3 A e ele aguenta 42 A. Cabo sobrecarregado esquenta e derrete a capa.');
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', caboId: 'cabo-solar-6' });
  });

  it('`cabo-de-bateria-sobrando`: inversor de 500 W em 12 V, fusível de 100 A e cabo de 35 mm²', () => {
    const projeto = montar({ inv: AIKER, b: 'bat-moura-12mn105' }, [
      ['inv.batPos', 'b.pos', 'cabo-bat-35', 1], ['inv.batNeg', 'b.neg', 'cabo-bat-35', 1],
    ]);
    // Sem o fusível, a regra não fala: a proteção ainda vai definir o cabo.
    expect(regras(consultar(projeto))).toContain('sem-protecao-da-bateria');
    expect(regras(consultar(projeto))).not.toContain('cabo-de-bateria-sobrando');
    projeto.cabos[0]!.protecoes = ['prot-fusivel-anl-100'];
    const s = da(consultar(projeto), 'cabo-de-bateria-sobrando');
    expect(s.nivel).toBe('dica');
    // 16 mm² aguenta 90 A, menos que o fusível de 100 A; o de 25 mm² aguenta 125 A.
    expect(s.texto).toContain('precisam aguentar 100 A');
    expect(s.texto).toContain('O cabo de 25 mm² aguenta 125 A');
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', caboId: 'cabo-bat-25' });
    expect(s.alvos).toHaveLength(2);
    // Depois da troca não sobra sugestão de cabo.
    aplicar(projeto, s.acao!);
    const depois = regras(consultar(projeto));
    for (const r of ['cabo-de-bateria-sobrando', 'cabo-fino', 'protecao-maior-que-o-cabo', 'queda-de-tensao']) expect(depois).not.toContain(r);
  });

  it('`cabo-de-bateria-sobrando`: não aparece quando a perda passaria do limite, nem no plano corrigido', () => {
    const projeto = montar({ inv: AIKER, b: 'bat-moura-12mn105' }, [
      ['inv.batPos', 'b.pos', 'cabo-bat-35', 4], ['inv.batNeg', 'b.neg', 'cabo-bat-35', 4],
    ]);
    projeto.cabos[0]!.protecoes = ['prot-fusivel-anl-100'];
    const antes = consultar(projeto);
    expect(regras(antes)).not.toContain('queda-de-tensao');
    expect(regras(antes)).not.toContain('cabo-de-bateria-sobrando');
    expect(regras(consultar(cenarioPlanoCorrigido()))).not.toContain('cabo-de-bateria-sobrando');
  });

  it('`protecao-pequena`: disjuntor de 100 A em c3 com cabo de 35 mm²', () => {
    const projeto = cenarioPlanoNoPapel();
    for (const c of projeto.cabos) if (c.uid === 'c3' || c.uid === 'c4') c.caboId = 'cabo-bat-35';
    projeto.cabos.find((c) => c.uid === 'c3')!.protecoes = ['prot-disjuntor-cc-100'];
    const s = da(consultar(projeto), 'protecao-pequena');
    expect(s.nivel).toBe('alerta');
    expect(s.texto).toContain('passam 127,4 A por aqui, e esta proteção é de 100 A.');
    expect(regras(consultar(projeto))).not.toContain('protecao-maior-que-o-cabo');
  });

  it('`queda-de-tensao`: 3 Resun de 155 W em paralelo em um só par de cabo-solar-6 de 20 m', () => {
    const projeto = montar({ inv: AIKER, b: BELIFOU, ctl: PWM, p1: 'placa-resun-155', p2: 'placa-resun-155', p3: 'placa-resun-155' }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'],
      ['p1.pos', 'ctl.pvPos', 'cabo-solar-6', 20], ['p1.neg', 'ctl.pvNeg', 'cabo-solar-6', 20],
      ['p2.pos', 'p1.pos', 'cabo-solar-6', 0.5], ['p2.neg', 'p1.neg', 'cabo-solar-6', 0.5],
      ['p3.pos', 'p1.pos', 'cabo-solar-6', 0.5], ['p3.neg', 'p1.neg', 'cabo-solar-6', 0.5],
    ]);
    const s = da(consultar(projeto), 'queda-de-tensao');
    expect(s.nivel).toBe('alerta');
    expect(s.titulo).toBe('Perda alta no cabo das placas');
    expect(s.texto).toContain('o recomendado é até 3%.');
    expect(s.texto).toContain('Nas placas, ligar em série também resolve, porque a corrente cai.');
    expect(s.alvos).toContain('k5');
    // Nem o maior cabo resolve sozinho: a ação oferece o de maior seção, e o texto não diz que resolve.
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', caboId: 'cabo-solar-16' });
    expect(s.texto).not.toContain('resolve.');
  });

  it('`queda-de-tensao`: um cabo mais grosso resolve e o texto diz qual', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.find((c) => c.uid === 'c1')!.comprimento = 40;
    projeto.cabos.find((c) => c.uid === 'c2')!.comprimento = 40;
    const s = da(consultar(projeto), 'queda-de-tensao');
    expect(s.texto).toContain('Um cabo de 16 mm² resolve.');
    expect(s.acao).toMatchObject({ tipo: 'trocar-cabos', cabos: ['c1', 'c2'], caboId: 'cabo-solar-16' });
  });

  it('`placa-na-sombra`: perda de 31% em uma placa', () => {
    const projeto = cenarioPlanoNoPapel();
    const e = analisar(projeto).estimativas;
    const s = da(consultar(projeto, { ...e, perdaSombra: new Map([['placa1', 0.31]]) }), 'placa-na-sombra');
    expect(s.nivel).toBe('alerta');
    expect(s.titulo).toBe('Esta placa perde 31% da geração para a sombra');
    expect(s.alvos).toEqual(['placa1']);
    const aoLimite = consultar(projeto, { ...e, perdaSombra: new Map([['placa1', 0.2]]) });
    expect(regras(aoLimite)).not.toContain('placa-na-sombra');
  });

  it('`placa-na-sombra`: uma só sugestão para várias placas', () => {
    const projeto = cenarioPlanoCorrigido();
    const e = analisar(projeto).estimativas;
    const uids = projeto.dispositivos.filter((d) => CATALOGO.get(d.itemId)?.categoria === 'placa').map((d) => d.uid);
    expect(uids.length).toBeGreaterThan(1);
    const perdas = new Map(uids.map((u, i) => [u, i === 0 ? 0.71 : 0.4] as [string, number]));
    const lista = consultar(projeto, { ...e, perdaSombra: perdas }).filter((s) => s.regra === 'placa-na-sombra');
    expect(lista).toHaveLength(1);
    expect(lista[0].titulo).toBe(`${uids.length} placas perdem geração para a sombra`);
    expect(lista[0].texto).toBe(
      'A mais afetada perde 71%. A sombra da casa ou do que está em volta dela cobre essas placas em parte do dia. Mude as placas de lugar ou gire a casa para testar outra posição.',
    );
    expect([...lista[0].alvos].sort()).toEqual([...uids].sort());
  });

  it('`rede-desligada`: "plano no papel" sem c5', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos = projeto.cabos.filter((c) => c.uid !== 'c5');
    const s = da(consultar(projeto), 'rede-desligada');
    expect(s).toMatchObject({ nivel: 'dica', titulo: 'O inversor não está ligado na rede' });
  });

  it('`sem-placas`: "plano no papel" sem placa1, c1 e c2', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.dispositivos = projeto.dispositivos.filter((d) => d.uid !== 'placa1');
    projeto.cabos = projeto.cabos.filter((c) => c.uid !== 'c1' && c.uid !== 'c2');
    const s = da(consultar(projeto), 'sem-placas');
    expect(s).toMatchObject({ nivel: 'dica', titulo: 'Sem placas, a bateria só recarrega pela rede' });
    expect(s.acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'placa' });
  });

  it('`sem-disjuntor-nas-placas`: sem o disjuntor em c1', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.find((c) => c.uid === 'c1')!.protecoes = [];
    const s = da(consultar(projeto), 'sem-disjuntor-nas-placas');
    expect(s.acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'c1', protecaoId: 'prot-disjuntor-cc-32' }] });
  });
});

// ---------------------------------------------------------------- Montagens perigosas que o consultor não pode calar

describe('consultor: regras de ligação de nível erro, com título e texto da especificação', () => {
  const comBanco = (pecas: Record<string, string>, ligacoes: [string, string, string?][]) =>
    montar({ inv: ANENJI, b: ALFX, ...pecas }, [...ligaBanco('inv', 'b'), ...ligacoes]);

  const casos: [string, Projeto, string, string][] = [
    ['sem-bateria', montar({ inv: ANENJI }, []), 'O inversor está sem bateria',
      'Ligue o positivo da bateria no terminal BAT+ do inversor e o negativo no BAT−. Sem bateria, o inversor não liga.'],
    ['curto-bateria', comBanco({}, [['inv.batPos', 'inv.batNeg']]), 'Curto-circuito na bateria',
      'O positivo e o negativo da bateria estão ligados entre si. Em uma bateria de verdade isso derrete o cabo em segundos. Desfaça essa ligação.'],
    ['bateria-invertida', montar({ inv: ANENJI, b: ALFX }, [['b.pos', 'inv.batNeg'], ['b.neg', 'inv.batPos']]), 'Bateria ligada ao contrário',
      'O positivo da bateria vai no BAT+ e o negativo no BAT−. Invertida, ela queima o inversor na hora.'],
    ['ramos-desiguais', comBanco({ b2: BELIFOU }, [['b2.pos', 'inv.batPos'], ['b2.neg', 'inv.batNeg']]), 'Baterias em paralelo com tensões diferentes',
      'Só se liga em paralelo o que tem a mesma tensão. Confira quantas baterias há em cada série.'],
    ['curto-placas', comBanco({}, [['inv.pvPos', 'inv.pvNeg', 'cabo-solar-6']]), 'Curto-circuito nas placas',
      'O positivo e o negativo das placas estão ligados entre si. A placa não queima, mas não gera nada. Desfaça essa ligação.'],
    ['placa-invertida', comBanco({ p: RENEPV }, [['p.pos', 'inv.pvNeg', 'cabo-solar-6'], ['p.neg', 'inv.pvPos', 'cabo-solar-6']]),
      'Placa ligada ao contrário', 'O positivo da fileira vai no PV+ e o negativo no PV−.'],
    ['fileiras-desiguais', comBanco({ p1: RENEPV, p2: RENEPV, p3: RENEPV }, [
      ['p1.pos', 'inv.pvPos', 'cabo-solar-6'], ['p1.neg', 'p2.pos', 'cabo-solar-6'], ['p2.neg', 'inv.pvNeg', 'cabo-solar-6'],
      ['p3.pos', 'inv.pvPos', 'cabo-solar-6'], ['p3.neg', 'inv.pvNeg', 'cabo-solar-6'],
    ]), 'Fileiras com número diferente de placas',
    'Fileiras em paralelo precisam ter a mesma quantidade de placas. A fileira menor derruba a tensão das outras.'],
    ['saida-na-rede', comBanco({ rede: 'rede-tomada' }, [['inv.caSaida', 'rede.tomada', 'cabo-ca-2p5']]),
      'A saída do inversor está ligada na rede da casa',
      'Nunca ligue a saída do inversor em uma tomada da rede. Na queda de luz você manda energia para a rua, onde pode haver alguém trabalhando no fio, e quando a luz volta as duas fontes se chocam. A saída vai só para os aparelhos.'],
    ['peca-repetida', montar({ inv: ANENJI, A: BELIFOU, B: BELIFOU, C: BELIFOU }, [
      ['A.pos', 'inv.batPos'], ['A.neg', 'B.pos'], ['B.neg', 'inv.batNeg'], ['A.neg', 'C.pos'], ['C.neg', 'inv.batNeg'],
    ]), 'Série e paralelo misturados',
    'Esta peça está em dois caminhos ao mesmo tempo. Monte cada série completa, com a mesma quantidade de peças, e só então junte as séries em paralelo pelas pontas. Os números da tela contam só o primeiro caminho.'],
    ['placas-no-banco', comBanco({ p: RENEPV }, [['p.pos', 'inv.batPos', 'cabo-solar-6'], ['p.neg', 'inv.batNeg', 'cabo-solar-6']]),
      'Placas e bateria ligadas direto',
      'O circuito das placas e o da bateria só se encontram dentro do inversor ou do controlador de carga. Ligados direto, a placa sobrecarrega a bateria ou a bateria descarrega na entrada das placas. Placa vai em PV+ e PV−; bateria vai em BAT+ e BAT−.'],
  ];

  it.each(casos)('`%s`', (regra, projeto, titulo, texto) => {
    const s = da(consultar(projeto), regra);
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe(titulo);
    expect(s.texto).toBe(texto);
  });

  it('`peca-repetida` aponta a peça repetida e a que ficou de fora', () => {
    const s = da(consultar(casos.find((c) => c[0] === 'peca-repetida')![1]), 'peca-repetida');
    expect(s.alvos.slice(0, 2)).toEqual(['A', 'C']);
  });

  it('placa em BAT+ e BAT− não vira `sem-placas`', () => {
    expect(regras(consultar(casos.find((c) => c[0] === 'placas-no-banco')![1]))).not.toContain('sem-placas');
  });
});

describe('consultor: compatibilidade do controlador e proteções', () => {
  const FELICITY_48 = 'inv-felicity-5kw-48v-127';
  const BAT_48 = 'bat-felicity-48v-100';

  it('`tensao-do-controlador`: Epever de 12/24 V em banco de 48 V', () => {
    const projeto = montar({ inv: FELICITY_48, b: BAT_48, ctl: EPEVER }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
    ]);
    const s = da(consultar(projeto), 'tensao-do-controlador');
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe('Controlador de 12/24 V em banco de 48 V');
    expect(s.texto).toBe('Este controlador não foi feito para a tensão deste banco e queima. Use um controlador que aceite 48 V.');
    expect(s.acao).toMatchObject({ tipo: 'ver-catalogo', categoria: 'controlador' });
    expect(s.alvos).toEqual(['ctl', 'b']);
  });

  it('`tensao-do-controlador` não aparece com o Epever em banco de 24 V', () => {
    const projeto = montar({ inv: ANENJI, b: ALFX, ctl: EPEVER }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
    ]);
    expect(regras(consultar(projeto))).not.toContain('tensao-do-controlador');
  });

  it('`tensao-da-protecao`: fusível de 32 V em banco de 48 V (48 × 1,17 = 56,2 V)', () => {
    const projeto = montar({ inv: FELICITY_48, b: BAT_48 }, ligaBanco('inv', 'b'));
    projeto.cabos[0].protecoes = ['prot-fusivel-anl-150'];
    const s = da(consultar(projeto), 'tensao-da-protecao');
    expect(s.nivel).toBe('erro');
    expect(s.titulo).toBe('Proteção de 32 V em circuito de 56,2 V');
    expect(s.texto).toBe('Acima da tensão para a qual foi feita, a proteção pode não interromper o curto. Use uma proteção para pelo menos 56,2 V.');
    expect(s.alvos).toEqual(['k1']);
    expect(regras(consultar(cenarioPlanoNoPapel()))).not.toContain('tensao-da-protecao');
  });

  it('`sem-protecao-da-bateria`: fusível só no cabo do controlador não protege a bateria', () => {
    const projeto = montar({ inv: ANENJI, b: ALFX, ctl: EPEVER }, [
      ...ligaBanco('inv', 'b'), ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
    ]);
    projeto.cabos[2].protecoes = ['prot-fusivel-anl-150'];
    const s = da(consultar(projeto), 'sem-protecao-da-bateria');
    expect(s.acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'k1', protecaoId: 'prot-fusivel-anl-150' }] });
  });

  it('`sem-protecao-da-bateria`: dois ramos em paralelo com fusível em um só', () => {
    const projeto = montar({ inv: ANENJI, b1: ALFX, b2: ALFX }, [
      ...ligaBanco('inv', 'b1'), ...ligaBanco('inv', 'b2'),
    ]);
    projeto.cabos[0].protecoes = ['prot-fusivel-anl-150'];
    const s = da(consultar(projeto), 'sem-protecao-da-bateria');
    // A ação vai só para o ramo que está sem: o cabo do positivo de b2.
    expect(s.acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'k3' }] });
    projeto.cabos[2].protecoes = ['prot-fusivel-anl-150'];
    expect(regras(consultar(projeto))).not.toContain('sem-protecao-da-bateria');
  });

  it('disjuntor de tomada no positivo da bateria: `sem-protecao-da-bateria` e `protecao-de-ca-em-cc`', () => {
    const projeto = cenarioPlanoNoPapel();
    projeto.cabos.find((c) => c.uid === 'c3')!.protecoes = ['prot-disjuntor-ca-16'];
    const s = consultar(projeto);
    expect(da(s, 'sem-protecao-da-bateria').acao).toMatchObject({ tipo: 'proteger-cabos', itens: [{ cabo: 'c3', protecaoId: 'prot-fusivel-anl-150' }] });
    const ca = da(s, 'protecao-de-ca-em-cc');
    expect(ca.nivel).toBe('erro');
    expect(ca.titulo).toBe('Disjuntor de tomada em cabo de corrente contínua');
    expect(ca.texto).toBe(
      'O disjuntor comum de quadro de luz é feito para corrente alternada. Em corrente contínua ele pode não conseguir interromper o curto e pegar fogo. Use fusível ou disjuntor de corrente contínua.',
    );
    expect(ca.alvos).toEqual(['c3']);
    // Ordem da tabela: sem-protecao-da-bateria, depois protecao-de-ca-em-cc.
    expect(regras(s).indexOf('sem-protecao-da-bateria')).toBeLessThan(regras(s).indexOf('protecao-de-ca-em-cc'));
    // O disjuntor de tomada não conta como proteção do cabo de corrente contínua, nem na tensão.
    expect(regras(s)).not.toContain('tensao-da-protecao');
    expect(regras(s)).not.toContain('protecao-pequena');
  });
});

describe('consultor: placas de modelos diferentes e sem banco', () => {
  it('`placas-acima-do-limite`: Resun 100 W mais duas Renepv em série no Epever', () => {
    // Soma por placa: (21,58 + 2 × 52,01) × (1 + 0,0027 × 15) = 125,60 × 1,0405 = 130,69 V, acima de 100 V.
    const projeto = montar({ inv: AIKER, b: ALFX, ctl: EPEVER, p1: 'placa-resun-100', p2: RENEPV, p3: RENEPV }, [
      ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'], ...ligaBanco('inv', 'b'),
      ['p1.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p1.neg', 'p2.pos', 'cabo-solar-6'],
      ['p2.neg', 'p3.pos', 'cabo-solar-6'], ['p3.neg', 'ctl.pvNeg', 'cabo-solar-6'],
    ]);
    const s = da(consultar(projeto), 'placas-acima-do-limite');
    expect(s.texto).toContain('chega a 130,7 V');
    expect(s.texto).toContain('aguenta 100 V');
  });

  /** Anenji sem bateria, com um controlador PWM no barramento e uma placa nele. */
  const pwmSemBanco = (placa: string): Projeto =>
    montar({ inv: ANENJI, ctl: PWM, p: placa }, [
      ['ctl.batPos', 'inv.batPos'], ['ctl.batNeg', 'inv.batNeg'],
      ['p.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p.neg', 'ctl.pvNeg', 'cabo-solar-6'],
    ]);

  it('`placas-abaixo-da-tensao` em PWM sem bateria usa 24 × 1,17 = 28,08 V', () => {
    // Resun 100 W: 17,4 × (1 − 0,003 × 45) = 15,05 V no calor, abaixo de 28,08 + 1 = 29,08 V; com 2 placas, 30,10 V.
    const s = da(consultar(pwmSemBanco('placa-resun-100')), 'placas-abaixo-da-tensao');
    expect(s.texto).toContain('Uma placa entrega cerca de 15,1 V no calor, e esta entrada só trabalha a partir de 29,1 V.');
    expect(s.texto).toContain('Com 2 placas em série a tensão sobe para 30,1 V.');
  });

  it('`pwm-desperdica` em PWM sem bateria: 1 − 28,08 / (43,83 × 0,9) = 29%', () => {
    const s = da(consultar(pwmSemBanco(RENEPV)), 'pwm-desperdica');
    expect(s.titulo).toBe('O controlador PWM desperdiça cerca de 29% desta placa');
    expect(s.texto).toContain('na tensão da bateria, 28,1 V');
  });

  it('`placas-acima-da-faixa`: 3 Renepv numa entrada de teste que aproveita até 115 V e aguenta 170 V', () => {
    // 3 × 43,83 = 131,49 V de trabalho; vocFrio de 162,35 V fica abaixo dos 170 V, então não é a regra do limite.
    const catalogo = new Map(CATALOGO);
    const epever = CATALOGO.get(EPEVER)!;
    if (epever.categoria !== 'controlador') throw new Error('catálogo');
    catalogo.set(EPEVER, { ...epever, solar: { ...epever.solar, vMax: 115, vocMax: 170 } });
    const projeto = montar({ inv: AIKER, b: ALFX, ctl: EPEVER, p1: RENEPV, p2: RENEPV, p3: RENEPV }, [
      ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'], ...ligaBanco('inv', 'b'),
      ['p1.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p1.neg', 'p2.pos', 'cabo-solar-6'],
      ['p2.neg', 'p3.pos', 'cabo-solar-6'], ['p3.neg', 'ctl.pvNeg', 'cabo-solar-6'],
    ]);
    const s = consultar(projeto, undefined, catalogo);
    expect(regras(s)).not.toContain('placas-acima-do-limite');
    const faixa = da(s, 'placas-acima-da-faixa');
    expect(faixa.nivel).toBe('alerta');
    expect(faixa.titulo).toBe('Tensão das placas acima da faixa de trabalho');
    expect(faixa.texto).toBe('A fileira trabalha em 131,5 V e a entrada aproveita até 115 V. Parte da geração se perde. Use menos placas em série.');
  });

  it('`placa-na-sombra` vale para placa ainda sem cabo', () => {
    const projeto = montar({ inv: ANENJI, b: ALFX, p: RENEPV }, ligaBanco('inv', 'b'));
    const e = analisar(projeto).estimativas;
    const s = da(consultar(projeto, { ...e, perdaSombra: new Map([['p', 0.31]]) }), 'placa-na-sombra');
    expect(s.alvos).toEqual(['p']);
  });
});

describe('consultor: banco com mais de uma bateria por ramo', () => {
  /** Duas Belifou de 12 V em série no Anenji. */
  const duasEmSerie = (extra: Record<string, string> = {}, ligacoes: [string, string, string?][] = []): Projeto =>
    montar({ inv: ANENJI, b1: BELIFOU, b2: BELIFOU, ...extra }, [
      ['b1.pos', 'inv.batPos'], ['b1.neg', 'b2.pos'], ['b2.neg', 'inv.batNeg'], ...ligacoes,
    ]);

  it('`autonomia-curta` pede um ramo inteiro e sai sem ação', () => {
    const projeto = duasEmSerie();
    const e = analisar(projeto).estimativas;
    // Um ramo a mais soma 100 Ah aos 100 Ah do banco: a autonomia dobra, de 4,0 para 8,0 horas.
    const s = da(consultar(projeto, { ...e, autonomiaHoras: 4 }), 'autonomia-curta');
    expect(s.texto).toBe(
      'Para atravessar uma noite são umas 12 horas. Com mais um ramo igual, de 2 baterias em série, em paralelo, a autonomia vai para 8,0 horas.' +
        ' Essa conta supõe tudo ligado ao mesmo tempo; em uma queda de luz de verdade costuma durar mais, porque nem tudo fica ligado o tempo todo.',
    );
    expect(s.acao).toBeUndefined();
  });

  it('`corrente-da-bateria` pede um ramo inteiro e sai sem ação', () => {
    const teste: Aparelho = {
      ...(CATALOGO.get('ap-tv') as Aparelho), id: 'ap-teste', nome: 'Aparelho de teste', potenciaW: 2400, mediaW: 2400, picoW: 2400,
    };
    const catalogo: Catalogo = new Map([...CATALOGO, ['ap-teste', teste]]);
    // (2.400 / 0,92 + 45) / 25,6 = 103,7 A, acima dos 100 A da Belifou.
    const projeto = duasEmSerie({ t: 'ap-teste' }, [['inv.caSaida', 't.plug', 'cabo-ca-4']]);
    const s = da(consultar(projeto, undefined, catalogo), 'corrente-da-bateria');
    expect(s.texto).toContain('puxam 103,7 A da bateria');
    expect(s.texto).toContain('Acrescente mais um ramo igual, de 2 baterias em série, em paralelo ou desligue algo.');
    expect(s.acao).toBeUndefined();
  });
});

describe('planejarMaisPlaca', () => {
  const plano = (p: Projeto) => planejarMaisPlaca(p, CATALOGO, analisarCircuito(p, CATALOGO));

  it('sem entrada solar: nulo', () => {
    expect(plano(montar({ inv: AIKER, b: BELIFOU }, ligaBanco('inv', 'b')))).toBeNull();
  });

  it('sem sistema: nulo', () => {
    expect(plano(montar({ p: RENEPV }, []))).toBeNull();
  });

  it('sem fileira: série', () => {
    expect(plano(montar({ inv: ANENJI, b: ALFX }, ligaBanco('inv', 'b')))).toEqual({ modo: 'serie' });
  });

  it('MPPT com uma fileira que cabe: série', () => {
    expect(plano(cenarioPlanoNoPapel())).toEqual({ modo: 'serie' });
  });

  it('MPPT com uma placa que não cabe em série: paralelo', () => {
    expect(plano(emSerieNoEpever1())).toEqual({ modo: 'paralelo' });
  });

  it('entrada que não aceita mais placas: nulo, sem a ação e com a frase no texto', () => {
    const projeto = duasFileirasNoAnenji();
    expect(plano(projeto)).toBeNull();
    const e = analisar(projeto).estimativas;
    const s = da(consultar(projeto, { ...e, geracaoDiaKwh: 1, consumoDiaKwh: 8 }), 'geracao-menor-que-o-consumo');
    expect(s.acao).toBeUndefined();
    expect(s.texto.endsWith('Esta entrada não aceita mais placas deste modelo.')).toBe(true);
  });

  it('PWM com uma placa e corrente de carga que sobra: paralelo; sem sobra: nulo', () => {
    const montarPwm = (placa: string) =>
      montar({ inv: AIKER, b: BELIFOU, ctl: PWM, p: placa }, [
        ...ligaBanco('inv', 'b'), ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'],
        ['p.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p.neg', 'ctl.pvNeg', 'cabo-solar-6'],
      ]);
    expect(plano(montarPwm('placa-resun-100'))).toEqual({ modo: 'paralelo' });
    // Em PWM a conta é pelo imp: 2 × 13,35 A = 26,7 A cabe nos 30 A do controlador.
    expect(plano(montarPwm(RENEPV))).toEqual({ modo: 'paralelo' });
  });
});

function emSerieNoEpever1(): Projeto {
  return montar({ inv: AIKER, b: ALFX, ctl: EPEVER, p1: RENEPV }, [
    ['ctl.batPos', 'b.pos'], ['ctl.batNeg', 'b.neg'], ...ligaBanco('inv', 'b'),
    ['p1.pos', 'ctl.pvPos', 'cabo-solar-6'], ['p1.neg', 'ctl.pvNeg', 'cabo-solar-6'],
  ]);
}

function duasFileirasNoAnenji(): Projeto {
  return montar({ inv: ANENJI, b: ALFX, a: RENEPV, b2: RENEPV, c: RENEPV, d: RENEPV }, [
    ...ligaBanco('inv', 'b'),
    ['a.pos', 'inv.pvPos', 'cabo-solar-6'], ['a.neg', 'b2.pos', 'cabo-solar-6'], ['b2.neg', 'inv.pvNeg', 'cabo-solar-6'],
    ['c.pos', 'inv.pvPos', 'cabo-solar-6'], ['c.neg', 'd.pos', 'cabo-solar-6'], ['d.neg', 'inv.pvNeg', 'cabo-solar-6'],
  ]);
}

describe('consultor: cômodo do aparelho citado no texto', () => {
  const posicionar = (projeto: Projeto, uid: string, superficie: string | null, pos: [number, number, number]): Projeto => {
    const d = projeto.dispositivos.find((x) => x.uid === uid)!;
    d.superficie = superficie;
    d.pos = pos;
    return projeto;
  };
  const COZINHA: [string, [number, number, number]] = ['piso-terreo', [-2, 0, -2.5]];
  const SALA: [string, [number, number, number]] = ['piso-terreo', [1, 0, 2]];
  const VARANDA: [string, [number, number, number]] = ['piso-varanda-frente', [0, 0, 4]];

  const pico = (g: [string | null, [number, number, number]], pc: [string | null, [number, number, number]]): Projeto => {
    const projeto = montar({ inv: AIKER, b: BELIFOU, g: 'ap-geladeira', pc: 'ap-pc-trabalho' }, [
      ...ligaBanco('inv', 'b'),
      ['inv.caSaida', 'g.plug', 'cabo-ca-2p5'],
      ['inv.caSaida', 'pc.plug', 'cabo-ca-2p5'],
    ]);
    posicionar(projeto, 'g', g[0], g[1]);
    return posicionar(projeto, 'pc', pc[0], pc[1]);
  };

  it('`pico-de-partida` cita o cômodo da geladeira; sem superfície, o texto é o de antes', () => {
    const com = da(consultar(pico(COZINHA, SALA)), 'pico-de-partida');
    expect(com.titulo).toBe('O inversor pode não aguentar a partida de Geladeira grande (Cozinha)');
    const semPosicao = da(consultar(pico([null, [0, 0, 0]], [null, [0, 0, 0]])), 'pico-de-partida');
    expect(semPosicao.titulo).toBe('O inversor pode não aguentar a partida de Geladeira grande');
  });

  it('aparelho na varanda cita "Varanda"', () => {
    const projeto = montar({ inv: 'inv-jesudom-3k2-24v-220', b: ALFX, g: 'ap-geladeira' }, [...ligaBanco('inv', 'b'), ['inv.caSaida', 'g.plug', 'cabo-ca-2p5']]);
    posicionar(projeto, 'g', ...VARANDA);
    expect(da(consultar(projeto), 'aparelho-tensao').titulo).toBe('Geladeira grande (Varanda) é de 127 V e o inversor entrega 220 V');
  });

  it('`onda-modificada` cita o cômodo do PC', () => {
    const projeto = montar({ inv: 'inv-vedo-1000-mod', b: BELIFOU, pc: 'ap-pc-24h' }, [...ligaBanco('inv', 'b'), ['inv.caSaida', 'pc.plug', 'cabo-ca-2p5']]);
    posicionar(projeto, 'pc', ...SALA);
    expect(da(consultar(projeto), 'onda-modificada').titulo).toBe('Inversor de onda modificada com PC ligado 24 h (Sala)');
  });

  it('`autonomia-curta` cita o cômodo do aparelho que mais gasta', () => {
    const projeto = pico(COZINHA, SALA);
    const r = analisar(projeto);
    const semCasa = analisar(pico([null, [0, 0, 0]], [null, [0, 0, 0]]));
    const texto = (p: Projeto, e: Estimativas): string => da(analisarConsultor(p, CATALOGO, analisar(p).analise, { ...e, autonomiaHoras: 4 }), 'autonomia-curta').texto;
    const antes = texto(pico([null, [0, 0, 0]], [null, [0, 0, 0]]), semCasa.estimativas);
    const depois = texto(projeto, r.estimativas);
    expect(depois).toMatch(/Desligar .+ \((Cozinha|Sala)\) sozinho/);
    expect(depois.replace(/ \((Cozinha|Sala)\)/, '')).toBe(antes);
  });

  it('área sem nome não acrescenta nada', () => {
    const projeto = pico(COZINHA, SALA);
    projeto.casa.comodos = [];
    expect(da(consultar(projeto), 'pico-de-partida').titulo).toBe('O inversor pode não aguentar a partida de Geladeira grande');
  });
});
