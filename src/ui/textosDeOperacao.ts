// Textos dos acontecimentos de operar o sistema: o que houve, por quê (com a fonte em palavras) e o que fazer.
// Especificação: docs/especificacao/operar.md, seções 1, 5 e 8. Tarefa 8.4.
// Arquivo puro: sem DOM e sem estado. Nenhum número aparece nos textos (a especificação não dá corrente de curto nem tempo).

import type { CodigoDeConsequencia } from '../nucleo/operacao';

/** Um texto para cada situação da tabela da seção 5. Dois códigos têm duas versões. */
export type ChaveDeTexto =
  | 'controlador-sem-bateria'
  | 'bateria-invertida-inversor'
  | 'bateria-invertida-controlador'
  | 'curto-na-bateria-com-protecao'
  | 'curto-na-bateria-sem-protecao'
  | 'arco-no-conector'
  | 'arco-no-disjuntor-ca'
  | 'sobrecarga'
  | 'desarme'
  | 'fusivel-queimou';

export interface TextoDeOperacao {
  titulo: string;
  /** O que aconteceu. */
  oQueHouve: string;
  /** Por que, com a fonte em palavras. */
  porQue: string;
  /** Onde a especificação marca simplificação: uma frase dizendo isso. */
  simplificacao?: string;
  /** O que fazer para não repetir. */
  oQueFazer: string;
  /** O que corrigir primeiro, para o aviso "Se ligar de novo assim, queima de novo". Só onde há uma causa de ligação a corrigir. */
  antesDeConsertar?: string;
  /** Verdadeiro quando há peça estragada: o texto lembra que o conserto do simulador é de graça. */
  estraga: boolean;
}

/** Frase que acompanha todo texto de peça estragada. */
export const CONSERTO_DE_GRACA = 'No simulador, consertar é de graça. De verdade, seria uma peça nova.';

/** Aviso antes de consertar quando a causa continua lá. */
export const SE_LIGAR_DE_NOVO = 'Se ligar de novo assim, queima de novo.';

const POLOS =
  'Confira as cores: vermelho no positivo (+) e preto no negativo (−). A cor do cabo ajuda, mas não garante: antes de apertar o último terminal, meça com o multímetro (com a ponta vermelha no cabo do positivo, sinal de menos no visor dele quer dizer invertido). Corrija a ligação antes de consertar e de ligar de novo.';

export const TEXTOS_DE_OPERACAO: Record<ChaveDeTexto, TextoDeOperacao> = {
  'controlador-sem-bateria': {
    titulo: 'O controlador de carga queimou',
    oQueHouve:
      'As placas ficaram ligadas ao controlador, com sol, sem a bateria ligada a ele (porque foram ligadas antes dela ou porque a bateria foi desligada com as placas gerando). O controlador queimou.',
    porQue:
      'O controlador de carga precisa da bateria para saber a tensão do sistema e para ter para onde mandar a energia das placas. Os manuais de controlador (Epever e Victron) mandam ligar a bateria primeiro e as placas por último; o da Epever manda desligar na ordem inversa. O plano de backup do projeto segue a mesma ordem: bateria, placas, saída.',
    simplificacao: 'Simplificação do simulador: alguns controladores só leem a tensão errada e outros aceitam trabalhar sem bateria. Aqui vale o pior caso.',
    oQueFazer:
      'Feche primeiro a proteção da bateria (o controlador acende) e só depois ligue as placas. Para desligar, as placas saem antes (abra o disjuntor delas; sem disjuntor, cubra as placas ou espere a noite) e a bateria por último.',
    antesDeConsertar: 'Ligue a bateria ao controlador primeiro (ponha o fusível ou feche o disjuntor da bateria) e deixe as placas por último.',
    estraga: true,
  },
  'bateria-invertida-inversor': {
    titulo: 'O inversor queimou: bateria ligada ao contrário',
    oQueHouve:
      'A bateria foi ligada ao inversor com os polos trocados (o positivo no negativo). O inversor queimou na hora. O fusível ou disjuntor do caminho, se houver, também abriu, mas isso não salva o inversor.',
    porQue:
      'Com os polos trocados, a corrente entra ao contrário nos circuitos do inversor. O manual do inversor (Voltronic Axpert) manda conferir positivo com positivo antes de fechar o disjuntor da bateria, e os avisos de segurança do simulador dizem que bateria invertida queima o inversor.',
    oQueFazer: POLOS,
    antesDeConsertar: 'Troque os cabos da bateria de lugar: positivo com positivo e negativo com negativo.',
    estraga: true,
  },
  'bateria-invertida-controlador': {
    titulo: 'O controlador queimou: bateria ligada ao contrário',
    oQueHouve: 'A bateria foi ligada ao controlador com os polos trocados, com as placas recebendo sol. O controlador queimou.',
    porQue:
      'O manual do controlador (Epever) diz que ele se danifica quando as placas estão ligadas certo e a bateria está invertida. Sem sol ou sem placas ligadas, ele só não liga, e volta a funcionar quando a ligação é corrigida.',
    oQueFazer: POLOS,
    antesDeConsertar: 'Troque os cabos da bateria de lugar: positivo com positivo e negativo com negativo.',
    estraga: true,
  },
  'curto-na-bateria-com-protecao': {
    titulo: 'Curto na bateria: a proteção abriu',
    oQueHouve:
      'O positivo e o negativo da bateria foram unidos sem nenhum aparelho no meio (um curto-circuito). A proteção de menor corrente do caminho abriu: o fusível queimou ou o disjuntor desarmou (a alavanca cai sozinha e corta a corrente).',
    porQue:
      'Num curto a corrente sobe muito e o metal esquenta em brasa. É para isso que existem o fusível e o disjuntor: cortam antes de o cabo esquentar. Os avisos de segurança do simulador alertam para a ferramenta de metal que fecha um curto na bateria, e o manual do inversor (Voltronic Axpert) manda nunca pôr em curto a saída e a entrada de bateria e avisa do perigo de ferramenta de metal perto da bateria. De verdade, a bateria também pode se estragar e pegar fogo.',
    oQueFazer:
      'Com ferramenta isolada e um polo de cada vez, desfaça a ligação que une o positivo ao negativo. Depois, com o inversor e os aparelhos desligados, troque o fusível ou feche o disjuntor de novo.',
    antesDeConsertar: 'Desfaça primeiro a ligação que une o positivo ao negativo da bateria.',
    estraga: true,
  },
  'curto-na-bateria-sem-protecao': {
    titulo: 'Curto na bateria: os cabos queimaram',
    oQueHouve: 'O positivo e o negativo da bateria foram unidos sem nenhum aparelho no meio (um curto-circuito) e não havia fusível nem disjuntor para cortar. Os cabos do caminho queimaram.',
    porQue:
      'Num curto a corrente sobe muito e o metal esquenta em brasa. Sem fusível ou disjuntor, quem cede é o cabo. Os avisos de segurança do simulador e o manual do inversor Axpert pedem proteção perto da bateria. De verdade, a bateria também pode se estragar e pegar fogo.',
    oQueFazer:
      'Se houver fumaça ou fogo, afaste-se e chame os bombeiros. Não mexa em cabo quente: espere esfriar. Depois, com ferramenta isolada e um polo de cada vez, desfaça a ligação do curto e ponha um fusível ou disjuntor de corrente contínua no cabo do positivo da bateria.',
    antesDeConsertar: 'Desfaça primeiro a ligação que une o positivo ao negativo da bateria.',
    estraga: true,
  },
  'arco-no-conector': {
    titulo: 'Arco no conector: o conector da placa queimou',
    oQueHouve:
      'Um cabo das placas (ou a própria placa) foi desligado com corrente passando. Abriu um arco no conector e o conector da placa queimou: o simulador marca a placa como queimada. De verdade, esse arco também queima a mão de quem segura o conector. Arco elétrico é uma faísca contínua que se forma quando se interrompe uma corrente.',
    porQue:
      'O conector das placas não foi feito para ser aberto com corrente passando, e com sol as placas dão tensão o tempo todo. Na corrente contínua o arco não se apaga sozinho. Os avisos de segurança do simulador dizem que esse arco queima o conector e a mão, e mandam abrir o disjuntor das placas antes de soltar o conector.',
    oQueFazer:
      'Antes de soltar um cabo das placas ou apagar uma placa, abra o disjuntor de corrente contínua das placas e confira que a corrente parou. Sem disjuntor, cubra as placas ou espere a noite. O fusível não serve de chave: ele só se tira e só se põe com o circuito sem corrente (inversor e aparelhos desligados).',
    estraga: true,
  },
  'arco-no-disjuntor-ca': {
    titulo: 'O disjuntor queimou: era de corrente alternada',
    oQueHouve: 'Um disjuntor de corrente alternada (CA) foi aberto em um circuito de corrente contínua (CC) com corrente passando. O arco não apagou e o disjuntor queimou.',
    porQue:
      'Na corrente alternada, a corrente passa por zero várias vezes por segundo e o arco se apaga sozinho. Na contínua isso não acontece. Por isso o consultor do simulador avisa que disjuntor CA não apaga o arco da corrente contínua.',
    oQueFazer: 'Use disjuntor de corrente contínua (CC) no circuito da bateria e no das placas.',
    antesDeConsertar: 'Troque este disjuntor por um de corrente contínua (CC).',
    estraga: true,
  },
  sobrecarga: {
    titulo: 'Sobrecarga: o inversor desligou a saída',
    oQueHouve: 'Os aparelhos ligados juntos pedem mais potência do que o inversor aguenta. Ele cortou a saída e ficou em falha, esperando ser religado.',
    porQue:
      'O manual de um inversor híbrido (Voltronic Axpert) chama isso de falha de sobrecarga. No simulador, o inversor fica em falha até ser religado (desligar e ligar de novo), como esse manual descreve para o inversor saído de fábrica. O seu pode religar sozinho: confira no manual.',
    oQueFazer: 'Desligue algum aparelho e religue o inversor (botão "Religar o inversor"). Se a soma continuar alta demais, ele cai de novo.',
    estraga: false,
  },
  desarme: {
    titulo: 'O disjuntor desarmou',
    oQueHouve: 'Passou mais corrente do que o disjuntor aguenta e ele desarmou: a alavanca desceu sozinha e cortou o circuito. Nada queimou.',
    porQue: 'É a função do disjuntor: cortar antes de o cabo esquentar demais.',
    simplificacao: 'Simplificação do simulador: ele desarma na hora. O de verdade tem uma curva de tempo e aguenta um pouco acima do limite por um instante.',
    oQueFazer: 'Tire a causa (desligue algum aparelho, por exemplo) e feche o disjuntor de novo. Se ele desarmar sempre, o disjuntor é pequeno demais para esse circuito ou o circuito está carregado demais.',
    estraga: false,
  },
  'fusivel-queimou': {
    titulo: 'O fusível queimou',
    oQueHouve: 'Passou mais corrente do que o fusível aguenta e ele queimou. Fusível queimado corta o circuito e só volta com um novo.',
    porQue: 'É a função do fusível: ser o ponto fraco de propósito, para queimar antes do cabo.',
    simplificacao: 'Simplificação do simulador: ele queima na hora. O de verdade tem uma curva de tempo e aguenta um pouco acima do limite por um instante.',
    oQueFazer:
      'Tire a causa (desligue algum aparelho, por exemplo) e desligue o inversor. Troque o fusível e ponha o novo no porta-fusível com o circuito sem corrente; depois religue o inversor e os aparelhos, um de cada vez. Se ele queimar sempre, o fusível é pequeno demais ou o circuito está carregado demais.',
    estraga: true,
  },
};

/** Quais textos cada código de consequência pode usar. Todo código tem ao menos um. */
export const TEXTOS_POR_CODIGO: Record<CodigoDeConsequencia, ChaveDeTexto[]> = {
  'controlador-sem-bateria': ['controlador-sem-bateria'],
  'bateria-invertida': ['bateria-invertida-inversor', 'bateria-invertida-controlador'],
  'curto-na-bateria': ['curto-na-bateria-com-protecao', 'curto-na-bateria-sem-protecao'],
  'arco-no-conector': ['arco-no-conector'],
  'arco-no-disjuntor-ca': ['arco-no-disjuntor-ca'],
  sobrecarga: ['sobrecarga'],
  desarme: ['desarme'],
  'fusivel-queimou': ['fusivel-queimou'],
};

export interface ContextoDoTexto {
  /** `bateria-invertida`: a peça queimada é o inversor (e não o controlador). */
  inversor?: boolean;
  /** `curto-na-bateria`: uma proteção abriu (e os cabos não queimaram). */
  comProtecao?: boolean;
}

/** O texto de um código, escolhendo a versão pelo contexto. */
export function chaveDoTexto(codigo: CodigoDeConsequencia, contexto: ContextoDoTexto = {}): ChaveDeTexto {
  if (codigo === 'bateria-invertida') return contexto.inversor === false ? 'bateria-invertida-controlador' : 'bateria-invertida-inversor';
  if (codigo === 'curto-na-bateria') return contexto.comProtecao === false ? 'curto-na-bateria-sem-protecao' : 'curto-na-bateria-com-protecao';
  return TEXTOS_POR_CODIGO[codigo][0];
}

export function textoDoEvento(codigo: CodigoDeConsequencia, contexto: ContextoDoTexto = {}): TextoDeOperacao {
  return TEXTOS_DE_OPERACAO[chaveDoTexto(codigo, contexto)];
}

/** Para o fusível queimado quando não se sabe a causa: a regra geral. */
export const TEXTO_GERAL_DE_FUSIVEL_QUEIMADO =
  'O fusível queimou: ele corta o circuito quando passa corrente demais (por sobrecarga, curto ou ligação errada) e só volta com um novo. Descubra a causa antes de trocar.';
