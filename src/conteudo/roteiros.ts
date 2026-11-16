// Roteiros do modo passo a passo. Tarefa 4.1. Só dados e funções puras: nada de DOM.
// Cada passo diz o que fazer e por quê, e traz `feito`, que olha o projeto e a análise e responde se o passo foi cumprido.
// Os passos seguem a ordem segura de montagem (bateria primeiro, depois placas, depois a saída CA)
// e não contradizem os avisos de src/conteudo/seguranca.ts.

import type { Aparelho, Catalogo, Categoria, Item, Protecao, TipoProtecao } from '../catalogo/tipos';
import type { AnaliseCircuito, Cabo, Destaque, Dispositivo, EstadoProtecao, Projeto, Sugestao } from '../nucleo/tipos';
import { CATALOGO } from '../catalogo';
import { emUso, usoDe } from '../nucleo/uso';

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
  /** Parte do roteiro a que o passo pertence (o tutorial tem "Montar" e "Ligar"). */
  parte?: string;
  /** Frase a mais que depende do momento (noite, aparelho fora do horário, peça queimada). Nula quando não há o que dizer. */
  agora?: (projeto: Projeto, catalogo: Catalogo, momento: Momento) => string | null;
}

/** O que o painel sabe do relógio do simulador para as frases de `agora`. */
export interface Momento {
  /** O sol está acima do horizonte no relógio do simulador. */
  solNoCeu: boolean;
  /** Hora local, de 0 a 24. */
  horaLocal: number;
  /** A bateria está cheia: o controlador não tem para onde mandar a energia da placa. */
  bateriaCheia: boolean;
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
// Duas partes (docs/especificacao/operar.md, seção 9). "Montar": as peças nascem desligadas (fusível fora do
// porta-fusível, disjuntor aberto, inversor e aparelho desligados). "Ligar": uma manobra por passo, na ordem da
// seção 6: bateria, placa, inversor, aparelho. A placa só é ligada ao controlador depois de a bateria chegar a ele:
// de dia, placa ligada a controlador sem bateria queima o controlador.

const superficie = (id: string): Destaque => ({ tipo: 'superficie', id });
const terminal = (disp: string, t: string): Destaque => ({ tipo: 'terminal', disp, terminal: t });
const realceDoCabo = (uid: string): Destaque => ({ tipo: 'cabo', uid });

/** Os dois terminais de cada ligação que ainda não tem cabo. */
function ligacoesQueFaltam(projeto: Projeto, ligacoes: [string, string, string, string][]): Destaque[] {
  return ligacoes.flatMap(([a, ta, b, tb]) => (caboEntre(projeto, a, ta, b, tb) ? [] : [terminal(a, ta), terminal(b, tb)]));
}

const primeiro = (projeto: Projeto, catalogo: Catalogo, teste: (item: Item) => boolean): Dispositivo | undefined =>
  dispositivosQue(projeto, catalogo, teste)[0];

const BAT = { pos: 'batPos', neg: 'batNeg' };

/** Estado da chave de índice `i` do cabo. Campo ausente vale fechada (projeto antigo). */
const estadoDe = (cabo: Cabo, i: number): EstadoProtecao => cabo.estados?.[i] ?? 'fechada';

/** Índices das proteções de corrente do cabo: fusível e disjuntor CC. */
function chavesDeCorrente(cabo: Cabo, catalogo: Catalogo): number[] {
  return cabo.protecoes.flatMap((id, i) => {
    const p = catalogo.get(id);
    return p?.categoria === 'protecao' && (p.tipo === 'fusivel' || p.tipo === 'disjuntorCC') ? [i] : [];
  });
}

/** O cabo tem fusível ou disjuntor CC, e todos estão fechados. */
function protegidoEFechado(cabo: Cabo, catalogo: Catalogo): boolean {
  const chaves = chavesDeCorrente(cabo, catalogo);
  return chaves.length > 0 && chaves.every((i) => estadoDe(cabo, i) === 'fechada');
}

const algumaFechada = (cabo: Cabo, catalogo: Catalogo): boolean => chavesDeCorrente(cabo, catalogo).some((i) => estadoDe(cabo, i) === 'fechada');
const algumaQueimada = (cabo: Cabo, catalogo: Catalogo): boolean => chavesDeCorrente(cabo, catalogo).some((i) => estadoDe(cabo, i) === 'queimada');

/** Cabos do positivo da bateria ao BAT+ do inversor, com ou sem o cabo negativo ao lado (passos 4 e 5 da montagem). */
function cabosPositivosAoInversor(p: Projeto, c: Catalogo): Cabo[] {
  const baterias = dispositivosQue(p, c, (i) => i.categoria === 'bateria');
  const inversores = dispositivosQue(p, c, ehInversorDeVerdade);
  return baterias.flatMap((b) => inversores.flatMap((i) => caboEntre(p, b.uid, 'pos', i.uid, 'batPos') ?? []));
}

/** Cabos positivos da bateria ao inversor (só os pares completos, positivo com positivo). */
const positivosDoInversor = (p: Projeto, c: Catalogo): Cabo[] => cabosDoBanco(p, c, ehInversorDeVerdade, BAT).map((par) => par.pos);
/** Cabos positivos da bateria ao controlador. */
const positivosDoControlador = (p: Projeto, c: Catalogo): Cabo[] => cabosDoBanco(p, c, controladorPwm, BAT).map((par) => par.pos);

/** Aparelhos com o plugue na saída de algum inversor. */
function aparelhosNaSaida(projeto: Projeto, catalogo: Catalogo): Dispositivo[] {
  const lista: Dispositivo[] = [];
  for (const cabo of cabosDaSaida(projeto, catalogo)) {
    if (!aparelhoNaSaida(projeto, catalogo, cabo)) continue;
    const outra = cabo.de.terminal === 'caSaida' ? cabo.para : cabo.de;
    const d = projeto.dispositivos.find((x) => x.uid === outra.disp);
    if (d && !lista.includes(d)) lista.push(d);
  }
  return lista;
}

/** Inversor que pode funcionar: ligado, sem falha e sem estar queimado. */
const inversorFuncionando = (d: Dispositivo): boolean => d.ligado && d.falha === undefined && d.queimado === undefined;

const inteiro = (n: number): string => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);

/** Os passos da parte "Montar" (1 a 9) e da parte "Ligar" (10 a 14). */
const MONTAR = 'Parte 1: montar';
const LIGAR = 'Parte 2: ligar';

export const ROTEIRO_TUTORIAL: Roteiro = {
  id: 'tutorial-quartinho',
  titulo: 'Tutorial: energia solar no quartinho',
  paraQuem:
    'Para começar do zero: só o quartinho de ferramentas, uma placa no telhado e as peças lá dentro. Primeiro você monta, com tudo desligado; depois liga, uma chave de cada vez, olhando os visores. No fim você testa quanto tempo a bateria segura um aparelho e, se quiser, erra de propósito para ver o que acontece. A sua casa fica guardada e volta quando você sair.',
  fim: 'teste-de-autonomia',
  passos: [
    {
      id: 'placa',
      parte: MONTAR,
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
      parte: MONTAR,
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
      parte: MONTAR,
      titulo: 'Ponha o inversor perto da bateria',
      texto:
        'Os aparelhos da casa usam corrente alternada (CA) de 127 V, a da tomada. O inversor transforma os 12 V da bateria nesses 127 V. Este é de 500 W e de onda pura, que serve para qualquer aparelho dentro dessa potência. Arraste-o para o piso, perto da bateria: quanto mais curto o cabo entre os dois, melhor. Ele chega desligado.',
      dica: 'Em 12 V a corrente é alta: 500 W puxam perto de 47 A da bateria. Por isso o cabo da bateria é grosso e curto.',
      itemId: 'inv-aiker-500-12v-110',
      feito: (p, _d, c) => dispositivosQue(p, c, inversor12DeOndaPura).length > 0,
      onde: () => [superficie('piso-quartinho')],
    },
    {
      id: 'cabo-positivo',
      parte: MONTAR,
      titulo: 'Ligue o cabo positivo da bateria ao inversor',
      texto:
        'Puxe um cabo do positivo (+) da bateria até o BAT+ do inversor: clique em um terminal e arraste até o outro. É o primeiro dos dois cabos da bateria: o fusível entra nele antes de o cabo negativo ser ligado. Positivo com positivo; invertido, o inversor queima.',
      dica: 'Na vida real, use ferramenta isolada, aperte um terminal de cada vez e nunca deixe metal encostar nos dois polos da bateria: ela entrega centenas de ampères em um curto.',
      categoria: 'cabo',
      feito: (p, _d, c) => cabosPositivosAoInversor(p, c).length > 0,
      onde: (p, c) => {
        const b = primeiro(p, c, bateriaDeChumbo12);
        const i = primeiro(p, c, inversor12DeOndaPura);
        return b && i ? ligacoesQueFaltam(p, [[b.uid, 'pos', i.uid, 'batPos']]) : [];
      },
    },
    {
      id: 'fusivel',
      parte: MONTAR,
      titulo: 'Ponha o fusível no cabo positivo, ainda fora do lugar',
      texto:
        'O fusível é o ponto fraco de propósito: ele queima quando passa corrente demais, antes de o cabo esquentar e pegar fogo. Fica no cabo positivo, o mais perto possível da bateria. Arraste o fusível do catálogo e solte em cima do cabo positivo. Ele entra fora do porta-fusível (a base em que o fusível encaixa): assim a corrente ainda não passa. Ele vai para o lugar só na hora de ligar, com o inversor desligado.',
      dica: 'Na vida real, o fusível vai no cabo antes de o cabo ser apertado no inversor. Aqui o cabo vem antes porque o fusível é solto em cima dele; fora do porta-fusível, é como se o cabo ainda não chegasse ao inversor. O manual do controlador manda não pôr o fusível no lugar enquanto se faz a fiação. Ele precisa ser menor do que o cabo aguenta; se não for, o consultor avisa. Este anúncio vem sem o porta-fusível, que é comprado à parte.',
      itemId: 'prot-fusivel-anl-100',
      feito: (p, _d, c) => cabosPositivosAoInversor(p, c).some((cabo) => temProtecao(cabo, c, 'fusivel') || temProtecao(cabo, c, 'disjuntorCC')),
      onde: (p, c) => cabosPositivosAoInversor(p, c).map((cabo) => realceDoCabo(cabo.uid)),
    },
    {
      id: 'cabo-negativo',
      parte: MONTAR,
      titulo: 'Ligue o cabo negativo da bateria ao inversor',
      texto:
        'Agora puxe o segundo cabo, do negativo (−) da bateria até o BAT− do inversor. Negativo com negativo. Com o fusível fora do lugar, a corrente ainda não passa: o circuito da bateria só fecha na parte de ligar.',
      dica: 'Na vida real, este é o último terminal: antes de apertá-lo, confira a polaridade com o multímetro. A cor do cabo ajuda, mas não garante. Ferramenta isolada e um polo de cada vez.',
      categoria: 'cabo',
      feito: (p, _d, c) => cabosDoBanco(p, c, ehInversorDeVerdade, BAT).length > 0,
      onde: (p, c) => {
        const b = primeiro(p, c, bateriaDeChumbo12);
        const i = primeiro(p, c, inversor12DeOndaPura);
        return b && i ? ligacoesQueFaltam(p, [[b.uid, 'neg', i.uid, 'batNeg']]) : [];
      },
    },
    {
      id: 'controlador',
      parte: MONTAR,
      titulo: 'Instale o controlador de carga e ligue na bateria',
      texto:
        'A placa não pode ser ligada direto na bateria: sem controle, ela sobrecarrega a bateria e a estraga. O controlador de carga fica entre as duas e corta a carga na hora certa. Arraste-o para a parede do fundo e ligue o BAT+ dele no + da bateria. Proteja esse cabo positivo antes de ligar o segundo: arraste o disjuntor CC de 80 A, da aba Proteções, para cima dele. Só então ligue o BAT− no −. O disjuntor é uma chave que desliga sozinha com corrente demais e se liga de novo pela alavanca; ele entra aberto, sem deixar a corrente passar.',
      dica: 'O controlador é ligado primeiro na bateria e só depois na placa: é pela bateria que ele descobre se o sistema é de 12 ou de 24 V. Todo cabo que sai do polo positivo da bateria precisa de proteção própria, perto dela. O controlador carrega com até 30 A, e a proteção fica acima disso com folga: no catálogo, a menor que serve é a de 80 A, que ainda protege este cabo de 35 mm² (ele aguenta 155 A). Na compra, um disjuntor CC de 40 A, se o manual do controlador indicar, faz o mesmo papel.',
      itemId: 'ctl-pwm-30a',
      feito: (p, _d, c) =>
        cabosDoBanco(p, c, controladorPwm, BAT).some((par) => temProtecao(par.pos, c, 'fusivel') || temProtecao(par.pos, c, 'disjuntorCC')),
      onde: (p, c) => {
        const ctl = primeiro(p, c, controladorPwm);
        const b = primeiro(p, c, bateriaDeChumbo12);
        if (!ctl) return [superficie('parede-quartinho-fundo')];
        if (!b) return [];
        // Na ordem: cabo positivo, disjuntor nele, cabo negativo.
        const positivo = caboEntre(p, b.uid, 'pos', ctl.uid, 'batPos');
        if (!positivo) return ligacoesQueFaltam(p, [[b.uid, 'pos', ctl.uid, 'batPos']]);
        if (chavesDeCorrente(positivo, c).length === 0) return [realceDoCabo(positivo.uid)];
        return ligacoesQueFaltam(p, [[b.uid, 'neg', ctl.uid, 'batNeg']]);
      },
    },
    {
      id: 'aparelho',
      parte: MONTAR,
      titulo: 'Ligue o ventilador na saída do inversor',
      texto:
        'Falta alguém para usar a energia. Arraste um ventilador para o piso do quartinho e ligue o plugue dele em "Saída para os aparelhos" do inversor. Deixe-o desligado por enquanto: os aparelhos são os últimos a ligar.',
      dica: 'A soma da potência dos aparelhos precisa caber nos 500 W do inversor. A lâmpada também serve, mas ela vai para o alto da parede: para puxar o cabo dela, use a visão "Sem telhado".',
      itemId: 'ap-ventilador',
      feito: (p, _d, c) => aparelhosNaSaida(p, c).length > 0,
      onde: (p, c) => {
        const aparelho = primeiro(p, c, (i) => i.categoria === 'aparelho');
        const inv = primeiro(p, c, inversor12DeOndaPura);
        if (!aparelho) return [superficie('piso-quartinho')];
        return inv ? ligacoesQueFaltam(p, [[aparelho.uid, 'plug', inv.uid, 'caSaida']]) : [];
      },
    },
    {
      id: 'sem-erros',
      parte: MONTAR,
      titulo: 'Confira a montagem antes de ligar',
      texto:
        'Antes de ligar qualquer coisa, confira a montagem. Abra a aba Consultor, à direita. Os erros (em vermelho) precisam sumir, como positivo e negativo trocados; os alertas e as dicas são conselhos para melhorar. Sem erro, começa a parte de ligar.',
      dica: 'Na vida real, esta conferência é feita com o multímetro, antes de pôr o fusível no lugar. O simulador ajuda a aprender e a planejar, mas não substitui um eletricista habilitado: mostre o plano a um antes de comprar e instalar.',
      feito: semErrosNoConsultor,
    },
    {
      id: 'fechar-fusivel',
      parte: LIGAR,
      titulo: 'Ponha o fusível da bateria no lugar',
      texto:
        'Agora é ligar, sempre nesta ordem: bateria primeiro, depois a placa, o inversor e, por último, o aparelho. O inversor está desligado, e é assim que o fusível vai para o lugar: ele só se põe e só se tira sem corrente passando. Clique no fusível, no cabo positivo entre a bateria e o inversor, para pô-lo no porta-fusível (ou clique no cabo e use "Pôr o fusível"). O inversor continua apagado: o botão dele ainda está desligado.',
      dica: 'Na vida real, ao fechar o circuito da bateria pode saltar uma faísca pequena no último contato: é o inversor se carregando por dentro, e é normal. Faísca grande, estalo forte ou cheiro de queimado não são: desligue e confira a polaridade.',
      feito: (p, _d, c) => positivosDoInversor(p, c).some((cabo) => protegidoEFechado(cabo, c)),
      onde: (p, c) => positivosDoInversor(p, c).map((cabo) => realceDoCabo(cabo.uid)),
      agora: (p, c) => {
        if (positivosDoInversor(p, c).some((cabo) => algumaQueimada(cabo, c)))
          return 'O fusível está queimado. Desligue o inversor, clique no cabo e use "Trocar o fusível": o novo entra fora do porta-fusível, e aí você o põe no lugar.';
        if (dispositivosQue(p, c, inversor12DeOndaPura).some((d) => d.ligado)) return 'O inversor está ligado: desligue-o pelo botão de ligar antes de pôr o fusível.';
        return null;
      },
    },
    {
      id: 'fechar-controlador',
      parte: LIGAR,
      titulo: 'Feche o disjuntor do controlador',
      texto:
        'Clique no disjuntor do cabo positivo entre a bateria e o controlador para fechá-lo (ou clique no cabo e use "Fechar"). O visor do controlador, a telinha com números, acende: é o sinal de que ele achou a bateria. Ainda sem a placa, ele mostra "sem placas ligadas".',
      dica: 'O manual do controlador manda nesta ordem: primeiro a bateria, conferir que ele acendeu, e só depois a placa.',
      feito: (p, _d, c) => positivosDoControlador(p, c).some((cabo) => protegidoEFechado(cabo, c)),
      onde: (p, c) => positivosDoControlador(p, c).map((cabo) => realceDoCabo(cabo.uid)),
    },
    {
      id: 'cabos-da-placa',
      parte: LIGAR,
      titulo: 'Ligue a placa ao controlador, por último',
      texto:
        'Com a bateria já ligada ao controlador, a placa pode entrar. Puxe um cabo do + da placa, no telhado, até o PV+ do controlador, e outro do − até o PV−. Olhe o visor do controlador: ele mostra a tensão da placa, em volts (V), e a corrente de carga, em ampères (A), que é a corrente entrando na bateria.',
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
      agora: (_p, _c, m) => {
        if (!m.solNoCeu) return 'Agora é noite no relógio do simulador: o visor mostra "sem sol", e a corrente de carga aparece quando o sol nascer. Pode seguir.';
        if (m.bateriaCheia) return 'A bateria está cheia: o visor mostra "bateria cheia" e a corrente de carga fica em zero, porque não há para onde mandar a energia. Ela aparece quando a bateria gastar um pouco. Pode seguir.';
        return null;
      },
    },
    {
      id: 'ligar-inversor',
      parte: LIGAR,
      titulo: 'Ligue o inversor',
      texto:
        'Clique no botão redondo de ligar, ao lado do inversor (ou clique no inversor e use "Ligar o inversor"). O visor do inversor acende e mostra a situação, de onde vem a energia e o consumo, que ainda é zero.',
      dica: 'O inversor só liga com a bateria ligada a ele: sem ela, o visor fica apagado. Ele entra depois da bateria e da placa, e antes dos aparelhos.',
      feito: (p, _d, c) => dispositivosQue(p, c, inversor12DeOndaPura).some(inversorFuncionando),
      // Não há realce de peça: o terminal da saída marca o inversor.
      onde: (p, c) => {
        const inv = primeiro(p, c, inversor12DeOndaPura);
        return inv ? [terminal(inv.uid, 'caSaida')] : [];
      },
      agora: (p, c) => {
        const inv = primeiro(p, c, inversor12DeOndaPura);
        if (inv?.queimado !== undefined) return 'O inversor está queimado. Confira a ligação da bateria no consultor, clique no inversor e use "Consertar".';
        if (inv?.falha !== undefined) return 'O inversor está em falha por sobrecarga (os aparelhos pediram mais do que ele aguenta). Desligue algum aparelho e use "Religar o inversor".';
        return null;
      },
    },
    {
      id: 'ligar-aparelho',
      parte: LIGAR,
      titulo: 'Ligue o ventilador',
      texto:
        'Por último, os aparelhos, um de cada vez. Clique no botão redondo de ligar, ao lado do ventilador (ou clique no ventilador e use "Ligar"). No visor do inversor, o consumo sobe; nos mostradores à direita, a energia vem da placa ou da bateria.',
      dica: 'A soma da potência dos aparelhos ligados ao mesmo tempo precisa caber nos 500 W do inversor.',
      feito: (p, _d, c) => aparelhosNaSaida(p, c).some((d) => d.ligado),
      onde: (p, c) => aparelhosNaSaida(p, c).slice(0, 1).map((d) => terminal(d.uid, 'plug')),
      agora: (p, c, m) => {
        const d = aparelhosNaSaida(p, c)[0];
        const item = d ? c.get(d.itemId) : undefined;
        if (!d || item?.categoria !== 'aparelho') return null;
        const uso = usoDe(d, item);
        if (emUso(uso, m.horaLocal)) return null;
        return `O relógio está fora do horário de uso deste aparelho (das ${uso.inicio} às ${uso.fim} h): ligado, ele só consome dentro desse horário. No teste da bateria, a seguir, ele funciona o tempo todo.`;
      },
    },
  ],
};

// ---------------------------------------------------------------- Experimente errar (operar.md, seção 9)

/** O que o passo de um erro guiado sabe além do projeto. */
export interface ContextoDoErro {
  /** Acontecimentos da operação (`estado.simulacao.eventos`) desde que o erro começou. */
  eventos: readonly { codigo: string; uids: readonly string[] }[];
  /** Todos os passos do tutorial estão feitos: o sistema voltou a funcionar. */
  tutorialEmDia: boolean;
}

export interface PassoDoErro {
  id: string;
  titulo: string;
  texto: string;
  dica?: string;
  itemId?: string;
  categoria?: Categoria;
  /** O passo foi cumprido. Os passos de um erro andam em ordem: o painel não volta a um passo já cumprido. */
  feito: (projeto: Projeto, catalogo: Catalogo, contexto: ContextoDoErro) => boolean;
  onde?: (projeto: Projeto, catalogo: Catalogo) => Destaque[];
}

export interface ErroGuiado {
  id: 'placas-antes-da-bateria' | 'aparelho-grande' | 'bateria-invertida';
  titulo: string;
  /** Rótulo curto, para o botão da lista. */
  curto: string;
  /** Dito antes de começar. */
  oQueVaiAcontecer: string;
  porQue: string;
  /** No simulador é de graça; de verdade, o que custa. */
  deVerdade: string;
  /** Dito no fim. */
  licao: string;
  /** Só acontece com sol na placa: de noite, o painel oferece pôr o relógio ao meio-dia. */
  precisaDeSol?: boolean;
  /** Aparelho grande do erro: fora do horário de uso ele não pede energia, e o painel oferece usá-lo o dia inteiro. */
  aparelhoId?: string;
  passos: PassoDoErro[];
}

export const EXPERIMENTE_ERRAR = {
  titulo: 'Experimente errar',
  texto:
    'Três erros comuns, feitos de propósito, cada um com o conserto. Antes de cada um, o painel diz o que vai acontecer e por quê. É opcional: pode sair a qualquer hora.',
  deVerdade: 'No simulador, o conserto é de graça. De verdade, peça queimada é peça nova, e peça elétrica que queima pode pegar fogo.',
};

const MICROONDAS = 'ap-microondas';

const inversorDoTutorial = (p: Projeto, c: Catalogo): Dispositivo | undefined => primeiro(p, c, inversor12DeOndaPura);
const potenciaDoInversor = (p: Projeto, c: Catalogo): number => {
  const inv = inversorDoTutorial(p, c);
  const item = inv ? c.get(inv.itemId) : undefined;
  return item?.categoria === 'inversor' ? item.potenciaW : Infinity;
};

/** Aparelhos na saída que pedem mais do que o inversor aguenta sozinho. */
function aparelhosGrandes(p: Projeto, c: Catalogo): Dispositivo[] {
  const limite = potenciaDoInversor(p, c);
  return aparelhosNaSaida(p, c).filter((d) => {
    const item = c.get(d.itemId) as Aparelho | undefined;
    return item !== undefined && item.potenciaW > limite;
  });
}

/** Cabos entre um terminal da bateria e o BAT+ ou o BAT− do inversor, em qualquer combinação. */
function cabosBateriaInversor(p: Projeto, c: Catalogo): Cabo[] {
  const baterias = new Set(dispositivosQue(p, c, (i) => i.categoria === 'bateria').map((d) => d.uid));
  const inversores = new Set(dispositivosQue(p, c, ehInversorDeVerdade).map((d) => d.uid));
  const ehBat = (x: Cabo['de']): boolean => baterias.has(x.disp);
  const ehInv = (x: Cabo['de']): boolean => inversores.has(x.disp) && (x.terminal === 'batPos' || x.terminal === 'batNeg');
  return p.cabos.filter((cabo) => (ehBat(cabo.de) && ehInv(cabo.para)) || (ehBat(cabo.para) && ehInv(cabo.de)));
}

/** Os dois cabos trocados: + da bateria no BAT− e − da bateria no BAT+. */
function cabosTrocados(p: Projeto, c: Catalogo): { pos?: Cabo; neg?: Cabo } {
  const b = primeiro(p, c, bateriaDeChumbo12);
  const i = inversorDoTutorial(p, c);
  if (!b || !i) return {};
  return { pos: caboEntre(p, b.uid, 'pos', i.uid, 'batNeg'), neg: caboEntre(p, b.uid, 'neg', i.uid, 'batPos') };
}

const houve = (contexto: ContextoDoErro, codigo: string): boolean => contexto.eventos.some((e) => e.codigo === codigo);

const potenciaDoItem = (id: string): number => {
  const item = CATALOGO.get(id);
  return item?.categoria === 'aparelho' || item?.categoria === 'inversor' ? item.potenciaW : 0;
};

export const ERROS_GUIADOS: ErroGuiado[] = [
  {
    id: 'placas-antes-da-bateria',
    titulo: 'Placa ligada sem a bateria',
    curto: 'Placa sem bateria',
    precisaDeSol: true,
    oQueVaiAcontecer:
      'Você vai abrir o disjuntor entre a bateria e o controlador com sol na placa. É como ligar a placa antes da bateria: o controlador queima.',
    porQue:
      'O controlador precisa da bateria para saber a tensão do sistema e para ter para onde mandar a energia da placa. Os manuais de controlador (Epever e Victron) mandam ligar a bateria primeiro e a placa por último. Simplificação do simulador: alguns controladores aguentam ficar sem bateria; aqui vale o pior caso.',
    deVerdade: 'No simulador, consertar é de graça. De verdade, seria um controlador novo, e peça elétrica que queima pode pegar fogo.',
    licao:
      'Bateria primeiro, placa por último. Para desligar, a placa sai antes (pelo disjuntor dela; sem disjuntor, coberta ou sem sol) e a bateria por último.',
    passos: [
      {
        id: 'abrir',
        titulo: 'Abra o disjuntor do controlador',
        texto:
          'Clique no disjuntor do cabo positivo entre a bateria e o controlador (ou clique no cabo e use "Abrir"). Olhe o controlador: aparece a marca de queimado, e a faixa sobre a cena e o cartão à direita explicam o que houve.',
        feito: (_p, _c, x) => houve(x, 'controlador-sem-bateria'),
        onde: (p, c) => positivosDoControlador(p, c).map((cabo) => realceDoCabo(cabo.uid)),
      },
      {
        id: 'consertar',
        titulo: 'Conserte na ordem certa',
        texto:
          'Primeiro feche o disjuntor de novo: a bateria volta a chegar ao controlador. Só depois clique no controlador e use "Consertar". Se consertar com o disjuntor aberto e sol na placa, ele queima de novo.',
        dica: 'De verdade, o controlador novo seria ligado na mesma ordem: bateria primeiro, placa por último.',
        feito: (p, c, x) => x.tutorialEmDia && dispositivosQue(p, c, controladorPwm).every((d) => d.queimado === undefined),
        onde: (p, c) => positivosDoControlador(p, c).map((cabo) => realceDoCabo(cabo.uid)),
      },
    ],
  },
  {
    id: 'aparelho-grande',
    titulo: 'Aparelho maior que o inversor',
    curto: 'Aparelho grande',
    aparelhoId: MICROONDAS,
    oQueVaiAcontecer:
      `Você vai ligar um micro-ondas de ${inteiro(potenciaDoItem(MICROONDAS))} W num inversor de ${inteiro(potenciaDoItem('inv-aiker-500-12v-110'))} W. ` +
      'Ele corta a saída e fica em falha por sobrecarga (carga acima do que aguenta): os outros aparelhos param junto.',
    porQue:
      'Acima do limite de potência, o inversor corta a saída para não se estragar. No simulador, o inversor fica em falha até ser religado (desligar e ligar de novo), como o manual de um inversor híbrido (Voltronic Axpert) descreve para a falha de sobrecarga. O seu pode religar sozinho: confira no manual.',
    deVerdade: 'Este erro não queima nada: o inversor se protege sozinho. Mas a saída só volta quando ele é religado.',
    licao: 'A soma dos aparelhos ligados ao mesmo tempo precisa caber no inversor. Em sobrecarga, desligue algum aparelho e religue o inversor.',
    passos: [
      {
        id: 'por-aparelho',
        titulo: 'Ligue o micro-ondas na saída do inversor',
        texto:
          'Arraste o micro-ondas do catálogo para o piso do quartinho e ligue o plugue dele em "Saída para os aparelhos" do inversor, junto do aparelho que já está lá. Ele entra desligado.',
        itemId: MICROONDAS,
        feito: (p, c) => aparelhosGrandes(p, c).length > 0,
        onde: (p, c) => {
          const m = primeiro(p, c, (i) => i.id === MICROONDAS);
          const inv = inversorDoTutorial(p, c);
          if (!m) return [superficie('piso-quartinho')];
          return inv ? ligacoesQueFaltam(p, [[m.uid, 'plug', inv.uid, 'caSaida']]) : [];
        },
      },
      {
        id: 'ligar',
        titulo: 'Ligue o micro-ondas',
        texto:
          'Clique no botão redondo de ligar do micro-ondas (ou clique nele e use "Ligar"). Olhe o visor do inversor: ele mostra a falha de sobrecarga, e o outro aparelho para junto.',
        feito: (_p, _c, x) => houve(x, 'sobrecarga'),
        onde: (p, c) => aparelhosGrandes(p, c).slice(0, 1).map((d) => terminal(d.uid, 'plug')),
      },
      {
        id: 'religar',
        titulo: 'Desligue o micro-ondas e religue o inversor',
        texto:
          'Desligue o micro-ondas pelo botão de ligar dele. Depois clique no inversor e use "Religar o inversor" (ou aperte o botão de ligar dele). O outro aparelho volta a funcionar. Se religar com o micro-ondas ligado, o inversor cai de novo.',
        dica: 'Na hora de escolher o inversor, some a potência dos aparelhos que podem ficar ligados ao mesmo tempo. Aparelho com motor puxa mais na partida.',
        feito: (p, c, x) => x.tutorialEmDia && aparelhosGrandes(p, c).every((d) => !d.ligado),
        onde: (p, c) => {
          const ligados = aparelhosGrandes(p, c).filter((d) => d.ligado);
          if (ligados.length > 0) return ligados.map((d) => terminal(d.uid, 'plug'));
          const inv = inversorDoTutorial(p, c);
          return inv ? [terminal(inv.uid, 'caSaida')] : [];
        },
      },
    ],
  },
  {
    id: 'bateria-invertida',
    titulo: 'Bateria ligada ao contrário',
    curto: 'Bateria invertida',
    oQueVaiAcontecer:
      'Você vai trocar os cabos da bateria no inversor (+ no BAT− e − no BAT+) e fechar o fusível: o inversor queima na hora. O fusível queima junto, mas não salva o inversor.',
    porQue:
      'Com os polos trocados, a corrente entra ao contrário nos circuitos do inversor. O manual do inversor (Voltronic Axpert) manda conferir positivo com positivo antes de fechar a proteção da bateria. Por isso o consultor acusa o erro, e o "Ligar o sistema" se recusa a ligar assim.',
    deVerdade: 'No simulador, consertar é de graça. De verdade, seria um inversor novo, e peça elétrica que queima pode pegar fogo.',
    licao: 'Antes de fechar a proteção da bateria, confira positivo com positivo e negativo com negativo, com o multímetro.',
    passos: [
      {
        id: 'desligar',
        titulo: 'Desligue antes de mexer',
        texto:
          'Antes de mexer em cabo, desligue na ordem inversa da de ligar: o aparelho, depois o inversor (botão de ligar) e por último o fusível da bateria (clique nele), já sem corrente passando. O controlador e a placa ficam como estão: neste quartinho o controlador tem cabo e disjuntor próprios até a bateria, e tirar o fusível do inversor não o deixa sem bateria. Se o controlador passasse pelo mesmo fusível, a placa teria de sair antes.',
        dica: 'Na vida real, os polos da bateria nunca ficam sem tensão, e com a placa ligada há tensão nos fios dela mesmo com tudo desligado: um polo de cada vez, com ferramenta isolada.',
        feito: (p, c) => {
          const inv = inversorDoTutorial(p, c);
          return (
            aparelhosNaSaida(p, c).every((d) => !d.ligado) &&
            (inv === undefined || !inv.ligado || inv.queimado !== undefined) &&
            cabosBateriaInversor(p, c).every((cabo) => !algumaFechada(cabo, c))
          );
        },
        onde: (p, c) => {
          const ligados = aparelhosNaSaida(p, c).filter((d) => d.ligado);
          if (ligados.length > 0) return ligados.map((d) => terminal(d.uid, 'plug'));
          const inv = inversorDoTutorial(p, c);
          if (inv?.ligado) return [terminal(inv.uid, 'caSaida')];
          return positivosDoInversor(p, c).map((cabo) => realceDoCabo(cabo.uid));
        },
      },
      {
        id: 'apagar',
        titulo: 'Apague os dois cabos da bateria ao inversor',
        texto:
          'Clique em cada cabo entre a bateria e o inversor e use "Apagar cabo" no painel dele (ou a tecla Delete). O fusível sai junto com o cabo positivo.',
        feito: (p, c) => cabosBateriaInversor(p, c).length === 0,
        onde: (p, c) => cabosBateriaInversor(p, c).map((cabo) => realceDoCabo(cabo.uid)),
      },
      {
        id: 'cruzar-positivo',
        titulo: 'Ligue o + da bateria no BAT− e ponha o fusível',
        texto:
          'Este é o erro de propósito. Puxe um cabo do + da bateria até o BAT− do inversor. Depois arraste o fusível do catálogo para cima desse cabo; ele entra fora do porta-fusível.',
        itemId: 'prot-fusivel-anl-100',
        feito: (p, c) => {
          const { pos } = cabosTrocados(p, c);
          return pos !== undefined && chavesDeCorrente(pos, c).length > 0;
        },
        onde: (p, c) => {
          const b = primeiro(p, c, bateriaDeChumbo12);
          const i = inversorDoTutorial(p, c);
          const { pos } = cabosTrocados(p, c);
          if (pos) return [realceDoCabo(pos.uid)];
          return b && i ? [terminal(b.uid, 'pos'), terminal(i.uid, 'batNeg')] : [];
        },
      },
      {
        id: 'cruzar-negativo',
        titulo: 'Ligue o − da bateria no BAT+',
        texto:
          'Agora puxe o − da bateria até o BAT+ do inversor. Com o fusível fora do lugar, nada acontece ainda. O consultor já acusa a bateria invertida; na vida real, quem mostra é o multímetro.',
        feito: (p, c) => cabosTrocados(p, c).neg !== undefined,
        onde: (p, c) => {
          const b = primeiro(p, c, bateriaDeChumbo12);
          const i = inversorDoTutorial(p, c);
          return b && i ? [terminal(b.uid, 'neg'), terminal(i.uid, 'batPos')] : [];
        },
      },
      {
        id: 'fechar',
        titulo: 'Feche o fusível',
        texto: 'Clique no fusível para pô-lo no porta-fusível. Olhe o inversor: ele queima na hora, e o fusível queima junto.',
        dica: 'Na vida real, faísca grande, estalo forte ou cheiro de queimado ao fechar o fusível são sinal de bateria invertida ou de curto: desligue e confira a polaridade com o multímetro.',
        feito: (_p, _c, x) => houve(x, 'bateria-invertida'),
        onde: (p, c) => {
          const { pos } = cabosTrocados(p, c);
          return pos ? [realceDoCabo(pos.uid)] : [];
        },
      },
      {
        id: 'desfazer',
        titulo: 'Desfaça a inversão',
        texto:
          'Apague os dois cabos trocados. Depois ligue do jeito certo, na ordem da montagem: o cabo do + da bateria ao BAT+, o fusível nesse cabo (ele entra fora do porta-fusível) e, por último, o cabo do − ao BAT−.',
        itemId: 'prot-fusivel-anl-100',
        feito: (p, c) => {
          const { pos, neg } = cabosTrocados(p, c);
          return pos === undefined && neg === undefined && cabosDoBanco(p, c, ehInversorDeVerdade, BAT).some((par) => chavesDeCorrente(par.pos, c).length > 0);
        },
        onde: (p, c) => {
          const { pos, neg } = cabosTrocados(p, c);
          const trocados = [pos, neg].filter((x): x is Cabo => x !== undefined);
          if (trocados.length > 0) return trocados.map((cabo) => realceDoCabo(cabo.uid));
          const b = primeiro(p, c, bateriaDeChumbo12);
          const i = inversorDoTutorial(p, c);
          if (!b || !i) return [];
          // Na ordem: cabo positivo, fusível nele, cabo negativo.
          const positivo = caboEntre(p, b.uid, 'pos', i.uid, 'batPos');
          if (!positivo) return ligacoesQueFaltam(p, [[b.uid, 'pos', i.uid, 'batPos']]);
          if (chavesDeCorrente(positivo, c).length === 0) return [realceDoCabo(positivo.uid)];
          return ligacoesQueFaltam(p, [[b.uid, 'neg', i.uid, 'batNeg']]);
        },
      },
      {
        id: 'consertar',
        titulo: 'Conserte e ligue de novo',
        texto:
          'Clique no inversor e use "Consertar". Depois ligue na ordem: com o inversor ainda desligado, ponha o fusível no lugar; então ligue o inversor e, por último, o aparelho.',
        dica: 'O conserto não corrige a ligação: se a bateria continuasse invertida, o inversor queimaria de novo ao fechar o fusível.',
        feito: (p, c, x) => x.tutorialEmDia && dispositivosQue(p, c, inversor12DeOndaPura).every((d) => d.queimado === undefined),
        onde: (p, c) => {
          const inv = inversorDoTutorial(p, c);
          if (!inv) return [];
          if (inv.queimado !== undefined || !inv.ligado) {
            const fusivel = positivosDoInversor(p, c).filter((cabo) => !protegidoEFechado(cabo, c));
            return inv.queimado === undefined && fusivel.length > 0 ? fusivel.map((cabo) => realceDoCabo(cabo.uid)) : [terminal(inv.uid, 'caSaida')];
          }
          return aparelhosNaSaida(p, c).filter((d) => !d.ligado).slice(0, 1).map((d) => terminal(d.uid, 'plug'));
        },
      },
    ],
  },
];


export const ROTEIROS: Roteiro[] = [ROTEIRO_12V, ROTEIRO_24V];

export function roteiroPorId(id: string): Roteiro | undefined {
  return [ROTEIRO_TUTORIAL, ...ROTEIROS].find((r) => r.id === id);
}
