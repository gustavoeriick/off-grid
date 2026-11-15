// Roteiros do modo passo a passo. Tarefa 4.1. Só dados e funções puras: nada de DOM.
// Cada passo diz o que fazer e por quê, e traz `feito`, que olha o projeto e a análise e responde se o passo foi cumprido.
// Os passos seguem a ordem segura de montagem (bateria primeiro, depois placas, depois a saída CA)
// e não contradizem os avisos de src/conteudo/seguranca.ts.

import type { Catalogo, Categoria, Item, Protecao, TipoProtecao } from '../catalogo/tipos';
import type { AnaliseCircuito, Cabo, Destaque, Dispositivo, Projeto, Sugestao } from '../nucleo/tipos';

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
  /** O que a cena realça enquanto este é o passo da vez: onde soltar a peça ou onde o cabo deve chegar. */
  onde?: (projeto: Projeto, catalogo: Catalogo) => Destaque[];
}

export interface Roteiro {
  id: string;
  titulo: string;
  paraQuem: string;
  passos: Passo[];
  /** O que o painel oferece quando todos os passos estão feitos. Sem valor, a queda de luz. */
  fim?: 'teste-de-autonomia';
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
        'O controlador de carga fica entre a placa e a bateria e cuida da carga para não estragar a bateria. O PWM é o tipo mais simples e barato. Ligue-o primeiro na bateria (BAT+ no +, BAT− no −) e só depois na placa: os manuais pedem essa ordem. O cabo positivo dele também sai do polo da bateria e precisa de proteção própria: arraste o disjuntor CC de 80 A, da aba Proteções, para esse cabo.',
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
        'Arraste um quadro de sobrepor para uma parede do quartinho. Depois arraste o disjuntor CC de 32 A e o DPS para um cabo das placas, de preferência o positivo: eles vão para dentro do quadro. O disjuntor CC deixa desligar as placas para a manutenção, e o DPS (protetor contra surtos) ajuda a limitar picos de tensão.',
      dica: 'Use sempre um disjuntor feito para corrente contínua nas placas: o disjuntor comum da casa é para CA. O DPS não garante proteção contra um raio direto.',
      itemId: 'prot-disjuntor-cc-32',
      feito: (p, _d, c) => {
        // Vale qualquer cabo do circuito das placas: o que chega em PV+ ou PV−, ou o que sai de uma placa.
        const noQuadro = (tipo: 'disjuntorCC' | 'dps'): boolean =>
          p.cabos.some((cabo) => {
            const dasPlacas =
              [cabo.de.terminal, cabo.para.terminal].some((t) => t === 'pvPos' || t === 'pvNeg') ||
              [cabo.de.disp, cabo.para.disp].some((uid) => {
                const d = p.dispositivos.find((x) => x.uid === uid);
                return d !== undefined && itemDe(c, d)?.categoria === 'placa';
              });
            const quadro = cabo.quadro === null ? undefined : p.dispositivos.find((x) => x.uid === cabo.quadro);
            return dasPlacas && temProtecao(cabo, c, tipo) && quadro !== undefined;
          });
        return noQuadro('disjuntorCC') && noQuadro('dps');
      },
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

// ---------------------------------------------------------------- Tutorial: só o quartinho (docs/especificacao/tutorial.md)

const superficie = (id: string): Destaque => ({ tipo: 'superficie', id });
const terminal = (disp: string, t: string): Destaque => ({ tipo: 'terminal', disp, terminal: t });

/** Os dois terminais de cada ligação que ainda não tem cabo. */
function ligacoesQueFaltam(projeto: Projeto, ligacoes: [string, string, string, string][]): Destaque[] {
  return ligacoes.flatMap(([a, ta, b, tb]) => (caboEntre(projeto, a, ta, b, tb) ? [] : [terminal(a, ta), terminal(b, tb)]));
}

const primeiro = (projeto: Projeto, catalogo: Catalogo, teste: (item: Item) => boolean): Dispositivo | undefined =>
  dispositivosQue(projeto, catalogo, teste)[0];

export const ROTEIRO_TUTORIAL: Roteiro = {
  id: 'tutorial-quartinho',
  titulo: 'Tutorial: energia solar no quartinho',
  paraQuem:
    'Para começar do zero: só o quartinho de ferramentas, uma placa no telhado e as peças lá dentro. Cada passo explica o que a peça faz, e no fim você testa quanto tempo a bateria segura um aparelho. A sua casa fica guardada e volta quando você sair.',
  fim: 'teste-de-autonomia',
  passos: [
    {
      id: 'placa',
      titulo: 'Ponha a placa no telhado do quartinho',
      texto:
        'A placa solar transforma a luz do sol em eletricidade de corrente contínua (CC), a mesma de uma pilha: tem um polo positivo e um negativo. Arraste a placa de 100 W do catálogo para o telhado do quartinho, que está virado para o norte, o lado em que o sol passa no Rio. Por enquanto ela só fica no lugar: os cabos dela são os últimos a entrar.',
      dica: 'A placa gera tensão sempre que há luz, mesmo sem nada ligado. Por isso, na vida real, ela é ligada por último e fica coberta enquanto se mexe nos cabos.',
      itemId: 'placa-resun-100',
      feito: (p, _d, c) => dispositivosQue(p, c, placaPequena).some((d) => d.superficie === 'telhado-quartinho'),
      onde: () => [superficie('telhado-quartinho')],
    },
    {
      id: 'bateria',
      titulo: 'Ponha a bateria no piso',
      texto:
        'A bateria guarda a energia do dia para usar à noite. Esta é uma estacionária de chumbo de 12 V e 105 Ah: feita para descarregar devagar, muitas vezes, ao contrário da bateria de carro. Arraste-a para o piso do quartinho, em lugar arejado e longe de faísca.',
      dica: 'Volts (V) são a "pressão" da eletricidade; ampère-hora (Ah) é quanto a bateria guarda. 12 V × 105 Ah dão cerca de 1.260 Wh, e a de chumbo só deve gastar metade disso para durar.',
      itemId: 'bat-moura-12mn105',
      feito: (p, _d, c) => dispositivosQue(p, c, bateriaDeChumbo12).length > 0,
      onde: () => [superficie('piso-quartinho')],
    },
    {
      id: 'inversor',
      titulo: 'Ponha o inversor perto da bateria',
      texto:
        'Os aparelhos da casa usam corrente alternada (CA) de 127 V, a da tomada. O inversor transforma os 12 V da bateria nesses 127 V. Este é de 500 W e de onda pura, que serve para qualquer aparelho dentro dessa potência. Arraste-o para o piso, perto da bateria: quanto mais curto o cabo entre os dois, melhor.',
      dica: 'Em 12 V a corrente é alta: 500 W puxam perto de 47 A da bateria. Por isso o cabo da bateria é grosso e curto.',
      itemId: 'inv-aiker-500-12v-110',
      feito: (p, _d, c) => dispositivosQue(p, c, inversor12DeOndaPura).length > 0,
      onde: () => [superficie('piso-quartinho')],
    },
    {
      id: 'cabos-da-bateria',
      titulo: 'Ligue a bateria ao inversor',
      texto:
        'Puxe um cabo do positivo (+) da bateria até o BAT+ do inversor e outro do negativo (−) até o BAT−: clique em um terminal e arraste até o outro. Positivo com positivo, negativo com negativo; invertido, o inversor queima.',
      dica: 'Na vida real, confira a polaridade com o multímetro antes de apertar o último terminal, use ferramenta isolada e nunca deixe metal encostar nos dois polos da bateria: ela entrega centenas de ampères em um curto.',
      categoria: 'cabo',
      feito: (p, _d, c) => cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).length > 0,
      onde: (p, c) => {
        const b = primeiro(p, c, bateriaDeChumbo12);
        const i = primeiro(p, c, inversor12DeOndaPura);
        return b && i ? ligacoesQueFaltam(p, [[b.uid, 'pos', i.uid, 'batPos'], [b.uid, 'neg', i.uid, 'batNeg']]) : [];
      },
    },
    {
      id: 'fusivel',
      titulo: 'Ponha o fusível no cabo positivo',
      texto:
        'O fusível é o ponto fraco de propósito: ele queima quando passa corrente demais, antes de o cabo esquentar e pegar fogo. Fica no cabo positivo, o mais perto possível da bateria. Arraste o fusível do catálogo e solte em cima do cabo positivo.',
      dica: 'Na vida real, o fusível é instalado antes de o cabo ser ligado ao inversor. Ele precisa ser menor do que o cabo aguenta; se não for, o consultor avisa. Este anúncio vem sem o porta-fusível, que é comprado à parte.',
      itemId: 'prot-fusivel-anl-100',
      feito: (p, _d, c) =>
        cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).some(
          (par) => temProtecao(par.pos, c, 'fusivel') || temProtecao(par.pos, c, 'disjuntorCC'),
        ),
      onde: (p, c) => cabosDoBanco(p, c, ehInversorDeVerdade, { pos: 'batPos', neg: 'batNeg' }).map((par): Destaque => ({ tipo: 'cabo', uid: par.pos.uid })),
    },
    {
      id: 'controlador',
      titulo: 'Instale o controlador de carga e ligue na bateria',
      texto:
        'A placa não pode ser ligada direto na bateria: sem controle, ela sobrecarrega a bateria e a estraga. O controlador de carga fica entre as duas e corta a carga na hora certa. Arraste-o para a parede do fundo e ligue o BAT+ dele no + da bateria e o BAT− no −. Depois proteja esse cabo positivo: arraste o disjuntor CC de 80 A, da aba Proteções, para cima dele.',
      dica: 'O controlador é ligado primeiro na bateria e só depois na placa: é pela bateria que ele descobre se o sistema é de 12 ou de 24 V. Todo cabo que sai do polo positivo da bateria precisa de proteção própria, perto dela. O controlador carrega com até 30 A, e a proteção fica acima disso com folga: no catálogo, a menor que serve é a de 80 A, que ainda protege este cabo de 35 mm² (ele aguenta 155 A). Na compra, um disjuntor CC de 40 A, se o manual do controlador indicar, faz o mesmo papel.',
      itemId: 'ctl-pwm-30a',
      feito: (p, _d, c) =>
        cabosDoBanco(p, c, controladorPwm, { pos: 'batPos', neg: 'batNeg' }).some(
          (par) => temProtecao(par.pos, c, 'fusivel') || temProtecao(par.pos, c, 'disjuntorCC'),
        ),
      onde: (p, c) => {
        const ctl = primeiro(p, c, controladorPwm);
        const b = primeiro(p, c, bateriaDeChumbo12);
        if (!ctl) return [superficie('parede-quartinho-fundo')];
        if (!b) return [];
        const faltam = ligacoesQueFaltam(p, [[b.uid, 'pos', ctl.uid, 'batPos'], [b.uid, 'neg', ctl.uid, 'batNeg']]);
        if (faltam.length > 0) return faltam;
        // Cabos ligados: falta a proteção no positivo.
        const positivo = caboEntre(p, b.uid, 'pos', ctl.uid, 'batPos');
        return positivo ? [{ tipo: 'cabo', uid: positivo.uid }] : [];
      },
    },
    {
      id: 'cabos-da-placa',
      titulo: 'Ligue a placa ao controlador',
      texto:
        'Agora a placa entra no circuito. Puxe um cabo do + da placa, no telhado, até o PV+ do controlador, e outro do − até o PV−. Com sol, o controlador passa a carregar a bateria.',
      dica: 'No simulador, o cabo também sai com dois cliques: clique no terminal da placa, gire a câmera até ver o controlador pela porta e clique no terminal dele. Na vida real, cubra a placa com um pano escuro ou trabalhe sem sol ao fazer esta ligação, e nunca solte um conector da placa com o sistema funcionando.',
      categoria: 'cabo',
      feito: (p, _d, c) => {
        const controladores = dispositivosQue(p, c, controladorPwm);
        return dispositivosQue(p, c, placaPequena).some((placa) =>
          controladores.some((ctl) => caboEntre(p, placa.uid, 'pos', ctl.uid, 'pvPos') && caboEntre(p, placa.uid, 'neg', ctl.uid, 'pvNeg')),
        );
      },
      onde: (p, c) => {
        const placa = primeiro(p, c, placaPequena);
        const ctl = primeiro(p, c, controladorPwm);
        return placa && ctl ? ligacoesQueFaltam(p, [[placa.uid, 'pos', ctl.uid, 'pvPos'], [placa.uid, 'neg', ctl.uid, 'pvNeg']]) : [];
      },
    },
    {
      id: 'aparelho',
      titulo: 'Ligue um aparelho no inversor',
      texto:
        'Falta alguém para usar a energia. Arraste um ventilador para o piso do quartinho e ligue o plugue dele em "Saída para os aparelhos" do inversor. Se ele estiver desligado, clique nele e use o botão Ligar. Olhe os mostradores à direita: o consumo aparece, e a energia vem da placa ou da bateria.',
      dica: 'A soma da potência dos aparelhos precisa caber nos 500 W do inversor. A lâmpada também serve, mas ela vai para o alto da parede: para puxar o cabo dela, use a visão "Sem telhado".',
      itemId: 'ap-ventilador',
      feito: (p, _d, c) =>
        cabosDaSaida(p, c).some((cabo) => {
          if (!aparelhoNaSaida(p, c, cabo)) return false;
          const outra = cabo.de.terminal === 'caSaida' ? cabo.para : cabo.de;
          return p.dispositivos.find((d) => d.uid === outra.disp)?.ligado === true;
        }),
      onde: (p, c) => {
        const aparelho = primeiro(p, c, (i) => i.categoria === 'aparelho');
        const inv = primeiro(p, c, inversor12DeOndaPura);
        if (!aparelho) return [superficie('piso-quartinho')];
        return inv ? ligacoesQueFaltam(p, [[aparelho.uid, 'plug', inv.uid, 'caSaida']]) : [];
      },
    },
    PASSO_SEM_ERROS('Quando não houver mais erros, o sistema está montado e pronto para o teste da bateria.'),
  ],
};

export const ROTEIROS: Roteiro[] = [ROTEIRO_12V, ROTEIRO_24V];

export function roteiroPorId(id: string): Roteiro | undefined {
  return [ROTEIRO_TUTORIAL, ...ROTEIROS].find((r) => r.id === id);
}
