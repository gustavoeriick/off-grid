// Avisos de segurança por tema. Tarefa 4.3.
// `quando` diz em palavras o momento do simulador em que o aviso deve aparecer;
// quem mostra na tela decide como ligar isso aos eventos da cena.

export type TemaSeguranca = 'bateria' | 'placas' | 'corrente-alternada' | 'telhado' | 'geral';

export interface AvisoDeSeguranca {
  id: string;
  tema: TemaSeguranca;
  titulo: string;
  texto: string;
  quando: string;
}

export const AVISOS_DE_SEGURANCA: AvisoDeSeguranca[] = [
  // ------------------------------------------------------------ Bateria

  {
    id: 'bateria-ferramenta-metalica',
    tema: 'bateria',
    titulo: 'Ferramenta de metal pode fechar um curto na bateria',
    texto:
      'Os 24 V da bateria quase não dão choque, mas uma chave de boca que encoste nos dois polos, ou num polo e na carcaça do inversor, fecha um curto de centenas de ampères: o metal fica em brasa e pode soldar, espirrar e queimar. Tire anel, relógio e pulseira. Use ferramenta com cabo isolado, cubra o polo que não está mexendo e aperte um terminal de cada vez.',
    quando: 'ao ligar o primeiro cabo em uma bateria',
  },
  {
    id: 'bateria-fusivel-no-positivo',
    tema: 'bateria',
    titulo: 'O fusível vai junto ao positivo da bateria',
    texto:
      'Tudo o que fica entre a bateria e o fusível está sem proteção. Deixe esse trecho o mais curto possível e instale o fusível antes de ligar o cabo no inversor. Siga a ordem de ligação do manual do inversor. Ao fechar o circuito da bateria pode saltar uma faísca pequena no último contato: é o inversor carregando os capacitores dele, e é normal. Faísca grande, estalo forte ou cheiro de queimado não são: desligue e confira a polaridade.',
    quando: 'ao ligar um cabo no positivo da bateria',
  },
  {
    id: 'bateria-polaridade',
    tema: 'bateria',
    titulo: 'Confira positivo e negativo com o multímetro',
    texto:
      'Bateria invertida no inversor queima peças dele em uma fração de segundo. A cor do cabo ajuda, mas não garante. Antes de apertar o último terminal, meça: ponta vermelha no cabo que vai ao BAT+, preta no que vai ao BAT−. Se o visor mostrar sinal de menos, está invertido. Siga a ordem do seu plano: bateria primeiro, depois placas, depois a saída CA.',
    quando: 'ao ligar um cabo entre a bateria e os terminais BAT+ ou BAT− do inversor',
  },
  {
    id: 'bateria-local-e-ventilacao',
    tema: 'bateria',
    titulo: 'Onde pôr a bateria e o inversor',
    texto:
      'O inversor esquenta e precisa de ar em volta: respeite o espaço livre que o manual pede. A bateria de lítio não solta gás no uso normal, mas não gosta de calor: longe do sol, da chuva, de fogão e de material que pegue fogo, em lugar firme e fora do alcance de crianças. Bateria de chumbo, se usar, pode soltar hidrogênio na carga: só em local ventilado e sem faísca por perto.',
    quando: 'ao colocar a primeira bateria ou o inversor na cena',
  },

  // ------------------------------------------------------------ Placas

  {
    id: 'placas-tensao-com-luz',
    tema: 'placas',
    titulo: 'Placa tem tensão sempre que há luz',
    texto:
      'A placa não tem botão de desligar: com qualquer luz, mesmo em dia nublado, já há tensão nos fios. Abrir o disjuntor CC corta a corrente e desliga o lado do inversor, mas do disjuntor até as placas o fio continua com tensão enquanto houver luz. Para zerar, cubra as placas com um pano grosso e escuro. Nunca solte um conector MC4 com corrente passando: abre um arco que queima o conector e a mão. Abra o disjuntor primeiro.',
    quando: 'ao arrastar a primeira placa para o telhado',
  },
  {
    id: 'placas-tensao-em-serie',
    tema: 'placas',
    titulo: 'Duas placas em série passam de 100 V',
    texto:
      'Em série as tensões somam: duas placas de 585 W dão 2 × 52,01 = 104 V em corrente contínua, e numa manhã fria uns 108 V. Nessa tensão o choque é perigoso, principalmente com mão suada ou molhada. Com luz, essa tensão está nos conectores mesmo com tudo desligado. Faça as emendas com as placas cobertas ou antes do amanhecer, encaixe os MC4 até o clique e nunca toque no metal de um conector solto.',
    quando: 'ao ligar a segunda placa em série em uma fileira',
  },

  // ------------------------------------------------------------ Corrente alternada

  {
    id: 'ca-saida-nunca-na-rede',
    tema: 'corrente-alternada',
    titulo: 'A saída do inversor nunca vai na rede da casa',
    texto:
      'Saída do inversor ligada numa tomada ou no quadro da casa manda energia para a rua na queda de luz, onde um eletricista pode estar mexendo no fio achando que está desligado. Quando a luz volta, rede e inversor se chocam e podem queimar o inversor e a fiação. Nada de "benjamim macho-macho" nem ligação no quadro: as tomadas do off-grid são só do off-grid.',
    quando: 'ao ligar a entrada CA do inversor na tomada da rede e ao ligar qualquer cabo na saída CA',
  },
  {
    id: 'ca-127-v-choca',
    tema: 'corrente-alternada',
    titulo: 'Os 127 V do inversor chocam igual aos da rua',
    texto:
      'Depois do inversor, a tensão é a mesma da tomada da rua e o choque pode matar. E ela continua lá na queda de luz: desligar o disjuntor geral da casa não desliga as tomadas do off-grid. Antes de mexer nelas, desligue o disjuntor da saída do inversor e o próprio inversor, e confira com o multímetro.',
    quando: 'ao ligar o primeiro cabo na saída CA do inversor',
  },
  {
    id: 'ca-aterramento',
    tema: 'corrente-alternada',
    titulo: 'Aterre a carcaça do inversor e a estrutura das placas',
    texto:
      'Se um fio com tensão encosta numa carcaça de metal sem aterramento, a carcaça fica energizada e o choque vem de quem encostar nela. O fio terra dá outro caminho à corrente e é por onde o DPS desvia os surtos. Como o terra e o neutro da saída se ligam varia de inversor para inversor, e o eletricista deve conferir isso no manual, junto com a necessidade de um DR.',
    quando: 'ao instalar o DPS ou ao ligar o primeiro aparelho na saída CA',
  },

  // ------------------------------------------------------------ Telhado

  {
    id: 'telhado-colonial',
    tema: 'telhado',
    titulo: 'Telhado de telha colonial: queda é o maior risco',
    texto:
      'Telha colonial quebra com o peso de uma pessoa fora do apoio, e por baixo não há piso. Não suba sozinho, nem com telha molhada, vento ou calor forte. Use cinto de segurança tipo paraquedista preso a uma linha de vida ancorada em ponto firme, e apoie o peso em tábuas ou escada de telhado sobre a estrutura, nunca no meio da telha. Se não tiver esse equipamento, contrate quem tenha: o trabalho profissional em altura segue a NR 35.',
    quando: 'ao arrastar a primeira placa para o telhado e ao abrir o orçamento com placas',
  },

  // ------------------------------------------------------------ Geral

  {
    id: 'geral-desligar-antes-de-mexer',
    tema: 'geral',
    titulo: 'Desligue e confira antes de mexer',
    texto:
      'O sistema tem três fontes que podem estar vivas ao mesmo tempo: a bateria, as placas e a rede. Antes de mexer, abra o disjuntor das placas, desligue o inversor, abra o fusível da bateria e tire a entrada da rede. Depois meça com o multímetro no ponto em que vai mexer: só toque quando ele mostrar zero. Dois lugares nunca zeram: os polos da bateria e os fios do lado das placas enquanto houver luz. Neles, trabalhe um polo de cada vez, com ferramenta isolada.',
    quando: 'ao apagar ou mover um cabo ou um equipamento já ligado',
  },
  {
    id: 'geral-limite-do-simulador',
    tema: 'geral',
    titulo: 'O simulador ajuda a entender, não substitui o eletricista',
    texto:
      'O simulador serve para entender o sistema, comparar peças e dimensionar a compra. A instalação definitiva, principalmente a parte de corrente alternada e o trabalho no telhado, deve ser feita ou conferida por um eletricista. No Brasil, a NBR 5410 trata das instalações elétricas de baixa tensão e a NBR 16690 trata dos arranjos fotovoltaicos; peça que a instalação siga as duas.',
    quando: 'na primeira abertura do simulador e ao abrir o orçamento ou o relatório',
  },
];
