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

const POLOS = 'Confira as cores: vermelho no positivo (+) e preto no negativo (−). Corrija a ligação antes de consertar e de ligar de novo.';

export const TEXTOS_DE_OPERACAO: Record<ChaveDeTexto, TextoDeOperacao> = {
  'controlador-sem-bateria': {
    titulo: 'O controlador de carga queimou',
    oQueHouve: 'As placas estavam recebendo sol e foram ligadas ao controlador sem a bateria ligada a ele. O controlador queimou.',
    porQue:
      'O controlador de carga precisa da bateria para saber a tensão do sistema e para ter para onde mandar a energia das placas. Os manuais de controlador (Epever e Victron) mandam ligar a bateria primeiro e as placas por último, e desligar na ordem inversa. O plano de backup do projeto segue a mesma ordem: bateria, placas, saída.',
    simplificacao: 'Simplificação do simulador: alguns controladores só leem a tensão errada e outros aceitam trabalhar sem bateria. Aqui vale o pior caso.',
    oQueFazer: 'Feche primeiro a proteção da bateria (o controlador acende) e só depois ligue as placas. Para desligar, tire as placas antes e a bateria por último.',
    antesDeConsertar: 'Ligue a bateria ao controlador primeiro (feche o fusível ou o disjuntor da bateria) e deixe as placas por último.',
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
      'Num curto a corrente sobe muito e o metal esquenta em brasa. É para isso que existem o fusível e o disjuntor: cortam antes de o cabo esquentar. Os avisos de segurança do simulador e o manual do inversor Axpert tratam o curto na bateria como o pior risco. De verdade, a bateria também pode se estragar e pegar fogo.',
    oQueFazer: 'Desfaça a ligação que une o positivo ao negativo. Depois troque o fusível ou feche o disjuntor de novo.',
    antesDeConsertar: 'Desfaça primeiro a ligação que une o positivo ao negativo da bateria.',
    estraga: true,
  },
  'curto-na-bateria-sem-protecao': {
    titulo: 'Curto na bateria: os cabos queimaram',
    oQueHouve: 'O positivo e o negativo da bateria foram unidos sem nenhum aparelho no meio (um curto-circuito) e não havia fusível nem disjuntor para cortar. Os cabos do caminho queimaram.',
    porQue:
      'Num curto a corrente sobe muito e o metal esquenta em brasa. Sem fusível ou disjuntor, quem cede é o cabo. Os avisos de segurança do simulador e o manual do inversor Axpert pedem proteção perto da bateria. De verdade, a bateria também pode se estragar e pegar fogo.',
    oQueFazer: 'Desfaça a ligação do curto e ponha um fusível ou disjuntor de corrente contínua no cabo do positivo da bateria.',
    antesDeConsertar: 'Desfaça primeiro a ligação que une o positivo ao negativo da bateria.',
    estraga: true,
  },
  'arco-no-conector': {
    titulo: 'Arco no conector: a placa queimou',
    oQueHouve:
      'Um cabo das placas (ou a própria placa) foi desligado com corrente passando. Abriu um arco no conector e a placa queimou. Arco elétrico é uma faísca contínua que se forma quando se interrompe uma corrente.',
    porQue:
      'O conector das placas não foi feito para ser aberto com corrente passando, e com sol as placas dão tensão o tempo todo. Na corrente contínua o arco não se apaga sozinho. Os avisos de segurança do simulador mandam abrir a proteção das placas antes de soltar o conector.',
    oQueFazer: 'Antes de soltar um cabo das placas ou apagar uma placa, abra o disjuntor das placas (ou tire o fusível) e confira que a corrente parou.',
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
    porQue: 'O manual do inversor (Voltronic Axpert) chama isso de falha de sobrecarga e, de fábrica, ele não religa sozinho: é preciso desligar e ligar de novo.',
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
    oQueFazer: 'Tire a causa (desligue algum aparelho, por exemplo), troque o fusível e ponha no porta-fusível. Se ele queimar sempre, o fusível é pequeno demais ou o circuito está carregado demais.',
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
