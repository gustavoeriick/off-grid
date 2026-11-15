// Roteiros do modo passo a passo. Tarefa 4.1. Só dados e funções puras: nada de DOM.
// Cada passo diz o que fazer e por quê, e traz `feito`, que olha o projeto e a análise e responde se o passo foi cumprido.
// Os passos seguem a ordem segura de montagem (bateria primeiro, depois placas, depois a saída CA)
// e não contradizem os avisos de src/conteudo/seguranca.ts.

import type { Catalogo, Categoria, Item, Protecao, TipoProtecao } from '../catalogo/tipos';
import type { AnaliseCircuito, Cabo, Dispositivo, Projeto, Sugestao } from '../nucleo/tipos';

/** O que um passo precisa saber da análise: `estado.derivados` serve como está. */
export interface DerivadosDoPasso {
  analise: AnaliseCircuito;
  sugestoes: Sugestao[];
}

export interface Passo {
  id: string;
  titulo: string;
  /** O que fazer e por quê, em 2 a 4 frases. */
  texto: string;
  dica?: string;
  /** Item do catálogo a destacar. */
  itemId?: string;
  /** Categoria do catálogo a abrir, quando não há um item só. */
  categoria?: Categoria;
  feito: (projeto: Projeto, derivados: DerivadosDoPasso, catalogo: Catalogo) => boolean;
}

export interface Roteiro {
  id: string;
  titulo: string;
  paraQuem: string;
  passos: Passo[];
}

// ---------------------------------------------------------------- Auxiliares

function itemDe(catalogo: Catalogo, d: Dispositivo): Item | undefined {
  return catalogo.get(d.itemId);
}

/** Dispositivos do projeto cujo item passa no teste. */
function dispositivosQue(projeto: Projeto, catalogo: Catalogo, teste: (item: Item) => boolean): Dispositivo[] {
  return projeto.dispositivos.filter((d) => {
    const item = itemDe(catalogo, d);
    return item !== undefined && teste(item);
  });
}

/** Cabo que liga os dois terminais, em qualquer sentido. */
function caboEntre(projeto: Projeto, uidA: string, terminalA: string, uidB: string, terminalB: string): Cabo | undefined {
  return projeto.cabos.find(
    (c) =>
      (c.de.disp === uidA && c.de.terminal === terminalA && c.para.disp === uidB && c.para.terminal === terminalB) ||
      (c.de.disp === uidB && c.de.terminal === terminalB && c.para.disp === uidA && c.para.terminal === terminalA),
  );
}

function protecoesDoCabo(cabo: Cabo, catalogo: Catalogo): Protecao[] {
  return cabo.protecoes.map((id) => catalogo.get(id)).filter((i): i is Protecao => i?.categoria === 'protecao');
}

function temProtecao(cabo: Cabo, catalogo: Catalogo, tipo: TipoProtecao): boolean {
  return protecoesDoCabo(cabo, catalogo).some((p) => p.tipo === tipo);
}

/** Pares de cabos (positivo e negativo) ligando uma bateria a um inversor, ou a um controlador. */
function cabosDoBanco(
  projeto: Projeto,
  catalogo: Catalogo,
  destino: (item: Item) => boolean,
  terminais: { pos: string; neg: string },
): { pos: Cabo; neg: Cabo }[] {
  const baterias = dispositivosQue(projeto, catalogo, (i) => i.categoria === 'bateria');
  const destinos = dispositivosQue(projeto, catalogo, destino);
  const pares: { pos: Cabo; neg: Cabo }[] = [];
  for (const b of baterias) {
    for (const d of destinos) {
      const pos = caboEntre(projeto, b.uid, 'pos', d.uid, terminais.pos);
      const neg = caboEntre(projeto, b.uid, 'neg', d.uid, terminais.neg);
      if (pos && neg) pares.push({ pos, neg });
    }
  }
  return pares;
}

const ehInversorDeVerdade = (i: Item): boolean => i.categoria === 'inversor' && i.bateriaInternaWh === undefined;
const ehInversor = (i: Item): boolean => i.categoria === 'inversor';

/** Cabos que saem da saída CA de algum inversor. */
function cabosDaSaida(projeto: Projeto, catalogo: Catalogo): Cabo[] {
  const inversores = new Set(dispositivosQue(projeto, catalogo, ehInversor).map((d) => d.uid));
  return projeto.cabos.filter(
    (c) => (inversores.has(c.de.disp) && c.de.terminal === 'caSaida') || (inversores.has(c.para.disp) && c.para.terminal === 'caSaida'),
  );
}

function aparelhoNaSaida(projeto: Projeto, catalogo: Catalogo, cabo: Cabo): boolean {
  const outra = cabo.de.terminal === 'caSaida' ? cabo.para : cabo.de;
  const d = projeto.dispositivos.find((x) => x.uid === outra.disp);
  return d !== undefined && itemDe(catalogo, d)?.categoria === 'aparelho' && outra.terminal === 'plug';
}

/** Sem problema de ligação, com banco, com aparelho na saída e sem nenhuma sugestão de nível erro. */
function semErrosNoConsultor(_projeto: Projeto, derivados: DerivadosDoPasso): boolean {
  const sistema = derivados.analise.sistema;
  if (!sistema || sistema.banco.length === 0 || sistema.cargas.length === 0) return false;
  if (derivados.analise.problemas.length > 0) return false;
  return !derivados.sugestoes.some((s) => s.nivel === 'erro');
}

const PASSO_SEM_ERROS = (textoFinal: string): Passo => ({
  id: 'sem-erros',
  titulo: 'Confira o consultor',
  texto:
    'Abra a aba Consultor, à direita. Os erros (em vermelho) são problemas que precisam sumir; os alertas e as dicas são conselhos para melhorar. ' +
    textoFinal,
  dica: 'O simulador ajuda a aprender e a planejar, mas não substitui um eletricista habilitado: mostre o plano a um antes de comprar e instalar.',
  feito: semErrosNoConsultor,
});

// ---------------------------------------------------------------- Meu primeiro sistema (12 V)

const bateriaDeChumbo12 = (i: Item): boolean => i.categoria === 'bateria' && i.quimica === 'chumbo' && i.tensao === 12;
const inversor12DeOndaPura = (i: Item): boolean => ehInversorDeVerdade(i) && i.categoria === 'inversor' && i.tensaoBateria === 12 && i.onda === 'pura';
const controladorPwm = (i: Item): boolean => i.categoria === 'controlador' && i.solar.tipo === 'pwm';
const placaPequena = (i: Item): boolean => i.categoria === 'placa' && i.wp <= 160;

export const ROTEIRO_12V: Roteiro = {
  id: 'primeiro-sistema-12v',
  titulo: 'Meu primeiro sistema (12 V)',
  paraQuem:
    'Para quem nunca montou nada: um sistema pequeno, de 12 V, com uma placa, uma bateria e uma lâmpada. Serve para aprender a ordem de montagem e o que cada peça faz.',
  passos: [
    {
      id: 'bateria',
      titulo: 'Escolha a bateria',
      texto:
        'A bateria guarda a energia para quando não há sol. Use uma bateria estacionária de chumbo de 12 V: ela é feita para descarregar devagar, muitas vezes, ao contrário da bateria de carro. Arraste-a do catálogo para o piso do quartinho.',
      dica: 'Os "Ah" (ampère-hora) dizem quanta carga a bateria guarda: quanto maior, mais tempo ela sustenta os aparelhos.',
      itemId: 'bat-moura-12mn105',
      feito: (p, _d, c) => dispositivosQue(p, c, bateriaDeChumbo12).length > 0,
    },
    {
      id: 'inversor',
      titulo: 'Instale o inversor',
      texto:
        'O inversor transforma a corrente contínua (CC) da bateria, de 12 V, na corrente alternada (CA) de 127 V das tomadas. Escolha um de onda pura: a forma de onda é parecida com a da rede e serve para mais aparelhos. Arraste-o para o piso, perto da bateria.',
      dica: 'Inversor de onda modificada é mais barato, mas pode dar problema em aparelhos com motor ou eletrônica sensível.',
      itemId: 'inv-aiker-500-12v-110',
      feito: (p, _d, c) => dispositivosQue(p, c, inversor12DeOndaPura).length > 0,
    },
    {
      id: 'cabos-da-bateria',
      titulo: 'Ligue a bateria ao inversor',
      texto:
        'Arraste de um terminal até o outro: do positivo (+) da bateria até o BAT+ do inversor, e do negativo (−) até o BAT−. Positivo com positivo e negativo com negativo: ao inverter, o inversor pode queimar. Antes de apertar o último terminal, confira com o multímetro.',
      dica: 'A bateria pode entregar uma corrente muito alta. Ferramenta de metal encostando nos dois polos faz curto-circuito.',
      categoria: 'cabo',
      feito: (p, _d, c) => cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).length > 0,
    },
    {
      id: 'fusivel',
      titulo: 'Coloque o fusível no cabo positivo',
      texto:
        'O fusível é uma peça que queima de propósito quando passa corrente demais, antes que o cabo esquente. Numa falha, a bateria entrega muita corrente, por isso o fusível vai no cabo positivo, perto dela. Arraste o fusível do catálogo para esse cabo.',
      dica: 'O fusível precisa ser menor do que o cabo aguenta. O consultor avisa se for maior.',
      itemId: 'prot-fusivel-anl-100',
      feito: (p, _d, c) => cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).some((par) => temProtecao(par.pos, c, 'fusivel')),
    },
    {
      id: 'controlador',
      titulo: 'Ligue um controlador de carga na bateria',
      texto:
        'O controlador de carga fica entre a placa e a bateria e cuida da carga para não estragar a bateria. O PWM é o tipo mais simples e barato. Ligue-o primeiro na bateria (BAT+ no +, BAT− no −) e só depois na placa: os manuais pedem essa ordem.',
      dica: 'O PWM serve bem para placas de 12 V, como a deste roteiro. O MPPT aproveita mais as placas maiores, mas custa mais.',
      itemId: 'ctl-pwm-30a',
      feito: (p, _d, c) => dispositivosQue(p, c, controladorPwm).length > 0 && cabosDoBanco(p, c, controladorPwm, { pos: 'batPos', neg: 'batNeg' }).length > 0,
    },
    {
      id: 'placa',
      titulo: 'Instale a placa e ligue no controlador',
      texto:
        'A placa transforma a luz do sol em corrente contínua. Uma placa pequena de 12 V, de 100 ou 155 W, combina com o controlador PWM. Arraste-a para o telhado da varanda e ligue o + dela no PV+ do controlador e o − no PV−.',
      dica: 'A placa gera tensão sempre que há luz. Por isso ela entra por último no lado das placas: só mexa nos terminais com a placa coberta ou desligada.',
      itemId: 'placa-resun-100',
      feito: (p, _d, c) => {
        const controladores = dispositivosQue(p, c, controladorPwm);
        return dispositivosQue(p, c, placaPequena).some((placa) =>
          controladores.some((ctl) => caboEntre(p, placa.uid, 'pos', ctl.uid, 'pvPos') && caboEntre(p, placa.uid, 'neg', ctl.uid, 'pvNeg')),
        );
      },
    },
    {
      id: 'aparelho',
      titulo: 'Ligue um aparelho na saída do inversor',
      texto:
        'A saída do inversor (127 V) é onde entram os aparelhos. Comece com algo pequeno, como uma lâmpada, para ver o sistema funcionando. Arraste o aparelho para a casa e ligue o plugue dele em "Saída para os aparelhos" do inversor.',
      dica: 'A soma da potência dos aparelhos precisa caber na potência do inversor.',
      itemId: 'ap-lampada',
      feito: (p, _d, c) => cabosDaSaida(p, c).some((cabo) => aparelhoNaSaida(p, c, cabo)),
    },
    PASSO_SEM_ERROS('Quando não houver mais erros, o sistema está montado no simulador.'),
  ],
};

// ---------------------------------------------------------------- O plano da casa (24 V)

const bateriaDeLitio24 = (i: Item): boolean => i.categoria === 'bateria' && i.quimica === 'lifepo4' && i.tensao === 24;
const inversorHibrido3kw = (i: Item): boolean =>
  i.categoria === 'inversor' && ehInversorDeVerdade(i) && i.tensaoBateria === 24 && i.potenciaW >= 3000 && i.solar !== undefined;

export const ROTEIRO_24V: Roteiro = {
  id: 'plano-da-casa-24v',
  titulo: 'O plano da casa (24 V)',
  paraQuem:
    'Para o sistema do sobrado do Gustavo no Rio: bateria de lítio de 24 V, inversor híbrido de 3.000 W e duas placas de 585 W, com as proteções que o consultor pede.',
  passos: [
    {
      id: 'bateria',
      titulo: 'Escolha a bateria de lítio de 24 V',
      texto:
        'A bateria guarda a energia para a noite e para a queda de luz. A de lítio (LiFePO4) de 24 V e 100 Ah guarda cerca de 2,4 kWh, é mais leve e aguenta muito mais ciclos de carga e descarga do que a de chumbo. Arraste-a para o piso do quartinho.',
      dica: 'kWh é a unidade de energia da conta de luz. Quanto mais kWh na bateria, mais tempo a casa aguenta sem sol e sem rede.',
      itemId: 'bat-alfx-24v-100',
      feito: (p, _d, c) => dispositivosQue(p, c, bateriaDeLitio24).length > 0,
    },
    {
      id: 'inversor',
      titulo: 'Instale o inversor híbrido de 3.000 W',
      texto:
        'O inversor híbrido faz três trabalhos em um aparelho: transforma a CC da bateria em CA de 127 V, carrega a bateria com as placas e pode usar a rede da rua. Este é de 24 V e 3.000 W, o que o plano pede. Arraste-o para a parede do quartinho.',
      dica: 'Ele precisa ser da mesma tensão da bateria (24 V) e da mesma tensão das tomadas da casa (127 V).',
      itemId: 'inv-anenji-3kw-24v-127',
      feito: (p, _d, c) => dispositivosQue(p, c, inversorHibrido3kw).length > 0,
    },
    {
      id: 'cabos-e-fusivel',
      titulo: 'Cabos de bateria de 35 mm² e fusível',
      texto:
        'Ligue o + da bateria ao BAT+ do inversor e o − ao BAT−, com cabo de bateria de 35 mm² (a seção é a "grossura" do cobre: quanto mais grosso, mais corrente o cabo aguenta). Arraste o fusível de 150 A para o cabo positivo, perto da bateria. Instale o fusível antes de ligar o cabo no inversor.',
      dica: 'Tudo o que fica entre a bateria e o fusível está sem proteção. Deixe esse trecho o mais curto possível.',
      itemId: 'prot-fusivel-anl-150',
      feito: (p, _d, c) =>
        cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).some(
          (par) => par.pos.caboId === 'cabo-bat-35' && par.neg.caboId === 'cabo-bat-35' && temProtecao(par.pos, c, 'fusivel'),
        ),
    },
    {
      id: 'placas-em-serie',
      titulo: 'Duas placas de 585 W em série no telhado da varanda',
      texto:
        'Arraste duas placas para o telhado da varanda e ligue-as em série: o + da primeira no PV+ do inversor, o − da primeira no + da segunda e o − da segunda no PV−. Por que duas? A entrada das placas deste inversor só trabalha a partir de 60 V, e uma placa sozinha entrega cerca de 38 V no calor. Em série as tensões se somam, e as duas juntas passam dos 60 V.',
      dica: 'Em série, as tensões se somam e a corrente continua a mesma. Em paralelo, as correntes se somam e a tensão continua a mesma.',
      itemId: 'placa-renepv-585',
      feito: (p, d, c) => {
        const s = d.analise.sistema;
        if (!s) return false;
        const placas = new Set(dispositivosQue(p, c, (i) => i.categoria === 'placa' && i.wp >= 500).map((x) => x.uid));
        return s.fileiras.some((fila) => fila.length >= 2 && fila.every((uid) => placas.has(uid)));
      },
    },
    {
      id: 'protecoes-das-placas',
      titulo: 'Disjuntor CC e DPS nas placas, em um quadro',
      texto:
        'Arraste um quadro de sobrepor para uma parede do quartinho. Depois arraste o disjuntor CC de 32 A e o DPS para o cabo positivo das placas: eles vão para dentro do quadro. O disjuntor CC deixa desligar as placas para a manutenção, e o DPS (protetor contra surtos) ajuda a limitar picos de tensão.',
      dica: 'Use sempre um disjuntor feito para corrente contínua nas placas: o disjuntor comum da casa é para CA. O DPS não garante proteção contra um raio direto.',
      itemId: 'prot-disjuntor-cc-32',
      feito: (p, _d, c) =>
        p.cabos.some((cabo) => {
          const dasPlacas =
            cabo.de.terminal === 'pvPos' || cabo.para.terminal === 'pvPos' || [cabo.de.disp, cabo.para.disp].some((uid) => {
              const d = p.dispositivos.find((x) => x.uid === uid);
              return d !== undefined && itemDe(c, d)?.categoria === 'placa';
            });
          const quadro = cabo.quadro === null ? undefined : p.dispositivos.find((x) => x.uid === cabo.quadro);
          return dasPlacas && temProtecao(cabo, c, 'disjuntorCC') && temProtecao(cabo, c, 'dps') && quadro !== undefined;
        }),
    },
    {
      id: 'tomada-da-rede',
      titulo: 'Ligue a tomada da rede na entrada CA',
      texto:
        'Ligue a "Entrada da rede" do inversor a uma tomada da rede da casa. Com a rede ligada, o inversor pode carregar a bateria e alimentar a casa quando as placas e a bateria não bastam. Se a tomada não estiver na cena, arraste-a da aba Aparelhos.',
      dica: 'Na queda de luz o inversor para de usar a rede e vive só da bateria e das placas.',
      itemId: 'rede-tomada',
      feito: (p, _d, c) => {
        const inversores = dispositivosQue(p, c, ehInversor);
        const tomadas = dispositivosQue(p, c, (i) => i.categoria === 'rede');
        return inversores.some((i) => tomadas.some((t) => caboEntre(p, i.uid, 'caEntrada', t.uid, 'tomada') !== undefined));
      },
    },
    {
      id: 'aparelhos-na-saida',
      titulo: 'Os aparelhos na saída, com disjuntor',
      texto:
        'Arraste os aparelhos da casa e ligue o plugue de cada um em "Saída para os aparelhos" do inversor. Em cada cabo de saída, coloque um disjuntor de 16 A: ele desarma se o circuito esquentar ou entrar em curto, antes que o fio da casa sofra.',
      dica: 'A soma da potência dos aparelhos precisa caber nos 3.000 W do inversor. Aparelhos com motor, como a geladeira, puxam mais na partida.',
      itemId: 'prot-disjuntor-ca-16',
      feito: (p, d, c) => {
        const saidas = cabosDaSaida(p, c).filter((cabo) => aparelhoNaSaida(p, c, cabo));
        return d.analise.sistema !== null && saidas.length > 0 && saidas.every((cabo) => temProtecao(cabo, c, 'disjuntorCA'));
      },
    },
    PASSO_SEM_ERROS('Quando não houver mais erros, o plano está montado no simulador e dá para simular uma queda de luz.'),
  ],
};

export const ROTEIROS: Roteiro[] = [ROTEIRO_12V, ROTEIRO_24V];

export function roteiroPorId(id: string): Roteiro | undefined {
  return ROTEIROS.find((r) => r.id === id);
}
