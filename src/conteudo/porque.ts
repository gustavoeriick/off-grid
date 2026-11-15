// "Por quê?" de cada regra do consultor: o princípio por trás da sugestão.
// Tarefa 4.2. Complementa o texto da sugestão (src/nucleo/consultor.ts), sem repeti-lo.
// Números: os do cenário do Gustavo (24 V, Anenji 3.000 W, bateria de lítio de 24 V e 100 Ah,
// placa Renepv de 585 W) e contas simples a partir deles, mostradas no próprio texto.

export interface PorQue {
  /** De 2 a 5 frases. */
  texto: string;
  /** Ids do glossário relacionados. */
  termos: string[];
}

export const PORQUE: Record<string, PorQue> = {
  // ------------------------------------------------------------ Ligação

  'sem-inversor': {
    texto:
      'A bateria e as placas trabalham em corrente contínua, de 24 V no seu sistema. Geladeira, TV e nobreak foram feitos para corrente alternada de 127 V, que muda de sentido 120 vezes por segundo. O inversor faz essa conversão, e por isso toda a energia que vai para as tomadas passa por ele.',
    termos: ['inversor', 'corrente-continua', 'corrente-alternada'],
  },
  'varios-inversores': {
    texto:
      'Duas saídas de corrente alternada só podem ser ligadas juntas se os inversores forem feitos para isso, com um cabo de sincronismo entre eles. Sem sincronismo, as duas ondas ficam fora de compasso e uma empurra contra a outra, o que pode queimar os dois. Para crescer, o caminho simples é um inversor maior; o de 3.000 W do seu plano já sobra para as cargas listadas, de uns 500 W.',
    termos: ['inversor', 'corrente-alternada'],
  },
  'sem-bateria': {
    texto:
      'No off-grid, a bateria é o centro: o inversor tira dela a energia das tomadas e as placas guardam nela o que geram. A geração da placa muda a cada nuvem, e a bateria é o que deixa a tensão firme para o inversor. É também ela que segura a casa à noite, quando a placa não gera nada.',
    termos: ['bateria-de-litio', 'off-grid', 'inversor-hibrido'],
  },
  'curto-bateria': {
    texto:
      'Curto-circuito é um caminho quase sem resistência entre o positivo e o negativo. A bateria de lítio tem resistência interna muito baixa, então a corrente vai a centenas de ampères ou mais, muito além dos 100 A do uso normal. Essa energia vira calor no ponto do curto: o metal derrete, solta faíscas e queima a pele. O BMS pode cortar, mas não conte com ele: quem deve abrir é o fusível junto ao positivo.',
    termos: ['curto-circuito', 'bms', 'fusivel', 'bateria-de-litio'],
  },
  'bateria-invertida': {
    texto:
      'Os componentes de entrada do inversor só conduzem no sentido certo. Invertida, a corrente alta da bateria passa por eles no sentido errado e queima peças em uma fração de segundo. Alguns inversores têm um fusível interno para isso, mas a troca costuma exigir assistência técnica. Antes de apertar o segundo terminal, meça com o multímetro: ponta vermelha no cabo que vai ao BAT+, preta no BAT−, e o visor deve mostrar um número positivo, sem sinal de menos.',
    termos: ['polaridade', 'corrente-continua', 'inversor'],
  },
  'bateria-solta': {
    texto:
      'Corrente só passa em circuito fechado: ela sai por um polo, atravessa o aparelho e volta pelo outro. Com cabo em um polo só, a bateria fica parada, sem carregar e sem ajudar o banco. A ponta livre desse cabo continua ligada à bateria e, se encostar em algo ligado ao outro polo, fecha um curto. Isole a ponta com fita ou capa até ligar o outro lado.',
    termos: ['banco-de-baterias', 'curto-circuito', 'corrente'],
  },
  'ramos-desiguais': {
    texto:
      'Em paralelo, os ramos ficam presos nas mesmas duas pontas e são obrigados a ter a mesma tensão. Se um ramo tem 24 V e outro 12 V, o de 24 V descarrega no de 12 V com uma corrente limitada só pela resistência dos cabos, como em um curto. Isso esquenta os cabos e estraga as baterias. Cada ramo precisa ter a mesma quantidade de baterias iguais em série.',
    termos: ['paralelo', 'serie', 'banco-de-baterias', 'curto-circuito'],
  },
  'baterias-misturadas': {
    texto:
      'Em paralelo, cada bateria entrega uma parte da corrente de acordo com a resistência interna dela, e modelos diferentes têm resistências e capacidades diferentes. Uma delas acaba puxando mais carga do que a outra, esquenta mais e envelhece antes, e o banco perde capacidade junto. Por isso o seu plano manda anotar marca e modelo da primeira bateria, repetir nas próximas e igualar a tensão delas antes de ligar.',
    termos: ['paralelo', 'banco-de-baterias', 'capacidade-ah'],
  },
  'curto-placas': {
    texto:
      'A placa é diferente da bateria: a corrente dela tem um teto, a Isc, que na sua placa de 585 W é de 14,2 A. Em curto, ela entrega só isso e a tensão cai a zero, então a potência é zero. O risco está em desfazer: abrir corrente contínua com corrente passando pode formar um arco elétrico, que queima o conector e a mão. Desfaça com a placa coberta por um pano grosso e escuro, ou à noite.',
    termos: ['isc', 'arco-eletrico', 'curto-circuito', 'mc4'],
  },
  'placa-invertida': {
    texto:
      'A placa entrega corrente contínua, que tem sentido certo, e a entrada do inversor espera o positivo no PV+. Invertida, a entrada não gera e pode ser danificada, porque a tensão de uma fileira é alta: duas placas de 585 W em série dão 2 × 52,01 = 104 V. Meça a ponta dos cabos com o multímetro antes de encaixar o conector, com o disjuntor das placas aberto.',
    termos: ['polaridade', 'fileira', 'voc', 'mc4'],
  },
  'placa-solta': {
    texto:
      'Corrente precisa de ida e volta: uma placa com um polo só ligado não gera nada. Em série, a corrente passa por todas as placas, uma depois da outra, então uma placa aberta para a fileira inteira. E o conector solto no telhado continua com tensão sempre que há luz.',
    termos: ['serie', 'fileira', 'mc4'],
  },
  'fileiras-desiguais': {
    texto:
      'Fileiras em paralelo dividem as mesmas duas pontas e trabalham na mesma tensão. Uma fileira de 3 placas de 585 W rende melhor perto de 3 × 43,83 = 131,5 V; uma de 2 placas, perto de 2 × 43,83 = 87,7 V. Ligadas juntas, o MPPT só pode escolher uma tensão, e uma das fileiras fica longe do ponto em que rende mais. A fileira maior pode até empurrar corrente de volta pela menor.',
    termos: ['fileira', 'paralelo', 'vmp', 'mppt'],
  },
  'placas-misturadas': {
    texto:
      'Em série, a mesma corrente atravessa todas as placas, como carros em uma rua de mão única: a que dá menos corrente vira o gargalo. A mais forte fica presa à corrente da mais fraca, e o que ela daria a mais se perde. Até placas de mesma potência e marcas diferentes têm Imp diferente: a Renepv de 585 W tem 13,35 A e a RonMa de 585 W tem 13,52 A.',
    termos: ['serie', 'imp', 'fileira'],
  },
  'saida-na-rede': {
    texto:
      'A saída do inversor é uma fonte de 127 V tão perigosa quanto a da rua. Ligada em uma tomada da casa, na queda de luz ela alimenta a fiação da casa e, pelo medidor, a rede da rua; o transformador do poste pode elevar essa tensão para a da rede de alta, onde o eletricista da concessionária conta com o fio desligado. O seu plano já evita isso: tomadas só do off-grid, sem passar pelo quadro da casa.',
    termos: ['rede-eletrica', 'inversor', 'off-grid', 'corrente-alternada'],
  },
  'peca-repetida': {
    texto:
      'Em série, a corrente passa por uma peça depois da outra e as tensões somam; em paralelo, as peças ficam lado a lado nas mesmas pontas e as correntes somam. Uma peça ligada dos dois jeitos ao mesmo tempo cria um caminho que não é nem um nem outro. Em bateria, isso pode ligar pontos de tensões diferentes, com corrente alta circulando entre as próprias baterias. Pense no banco como ramos prontos, unidos só pelas duas pontas.',
    termos: ['serie', 'paralelo', 'banco-de-baterias'],
  },
  'placas-no-banco': {
    texto:
      'A placa não tem tensão fixa: sem carga, a sua de 585 W fica perto de 52 V ao sol, mais que o dobro dos 24 V do banco. Ligada direto, ela empurra corrente para a bateria sem ninguém decidir quando parar, e quem acaba cortando é o BMS. O controlador de carga, ou o MPPT dentro do inversor, fica entre os dois: lê a tensão da bateria, reduz a carga quando ela enche e aproveita a tensão mais alta da placa.',
    termos: ['controlador-de-carga', 'mppt', 'bms', 'voc'],
  },

  // ------------------------------------------------------------ Compatibilidade

  'tensao-do-banco': {
    texto:
      'O inversor é feito para uma tensão de bateria só; a do seu é 24 V. Com 12 V, ele lê o banco como bateria vazia e desliga; com 48 V, a tensão passa do que a entrada aguenta. A tensão do banco é escolha de projeto: em 24 V, os 3.000 W pedem 3.000 ÷ 24 = 125 A; em 12 V seriam 250 A, com cabos bem mais grossos. O seu plano prefere uma bateria de 24 V desde o início, em vez de duas de 12 V em série.',
    termos: ['tensao', 'banco-de-baterias', 'serie', 'corrente'],
  },
  'tensao-do-controlador': {
    texto:
      'O controlador carrega a bateria até uma tensão final que depende da tensão nominal do banco: a de um banco de 24 V é cerca do dobro da de um de 12 V. Ajustado para outra tensão, ele carrega errado: para menos, a bateria nunca enche; para mais, sobrecarrega. Se a tensão do banco passa do que a eletrônica aguenta, ela queima. Muitos controladores reconhecem a tensão ao ligar a bateria, e por isso a bateria se liga antes das placas.',
    termos: ['controlador-de-carga', 'tensao', 'banco-de-baterias'],
  },
  'tensao-de-saida': {
    texto:
      'Em uma resistência, como a de um aquecedor, a potência cresce com o quadrado da tensão. Um aparelho de 127 V em 220 V recebe cerca de três vezes a potência prevista (220 ÷ 127 = 1,73; 1,73 × 1,73 = 3,0) e queima. No sentido contrário, um aparelho de 220 V em 127 V fica fraco: a resistência rende um terço e o motor esquenta tentando partir.',
    termos: ['tensao', 'potencia', 'corrente-alternada'],
  },
  'aparelho-tensao': {
    texto:
      'A tensão de cada aparelho está na etiqueta, perto do cabo ou embaixo dele. Bivolt quer dizer que ele aceita 127 V e 220 V, sozinho ou por uma chave; com chave, ela precisa estar na posição certa antes de ligar. No Rio, a tomada comum é de 127 V, mas algumas casas têm circuitos de 220 V para chuveiro ou ar-condicionado, e um aparelho que veio de um deles pode ser de 220 V.',
    termos: ['bivolt', 'tensao'],
  },
  'onda-modificada': {
    texto:
      'A tomada da rua entrega uma onda senoidal, que sobe e desce suave. A onda modificada imita isso em degraus, com bordas bruscas. Motores, como o do compressor da geladeira e o do ventilador, transformam essa diferença em calor e ruído, e fontes de computador e nobreaks podem apitar, desligar ou esquentar. Com dois nobreaks, PCs e geladeira, a onda pura é a escolha; o Anenji de 3.000 W do plano já é de onda pura.',
    termos: ['onda-senoidal-pura', 'onda-modificada', 'inversor'],
  },
  'bateria-automotiva': {
    texto:
      'A bateria de carro tem placas internas finas, feitas para dar muita corrente por poucos segundos na partida e logo ser recarregada pelo alternador. No backup ela é descarregada por horas, e descargas fundas desgastam essas placas rápido. Ela é de chumbo-ácido e pode soltar gás hidrogênio na carga, o que pede local ventilado. A estacionária aguenta mais ciclos, e a de lítio ainda mais: o anúncio da bateria do plano fala em 6.000.',
    termos: ['bateria-estacionaria', 'bateria-de-litio', 'profundidade-de-descarga'],
  },
  'item-nao-recomendado': {
    texto:
      'Algumas peças estão no catálogo porque aparecem à venda e parecem economia, mas têm um problema conhecido, que a sugestão diz qual é. O caso mais comum é o cabo alucobre: alumínio com capa fina de cobre, que conduz menos que o cobre da mesma bitola e esquenta mais com a mesma corrente. O alumínio também cede com o tempo sob o aperto do terminal, e conexão frouxa esquenta.',
    termos: ['alucobre', 'bitola'],
  },

  // ------------------------------------------------------------ Placas e entrada solar

  'placas-abaixo-da-tensao': {
    texto:
      'O MPPT precisa de uma tensão mínima para trabalhar, e a tensão da placa cai quando ela esquenta. O simulador considera a célula a 70 °C, como num telhado do Rio no verão: a sua placa de 585 W cai de 43,8 V para uns 37,9 V. A entrada do Anenji só trabalha a partir de 60 V, então uma placa sozinha não basta; duas em série somam 2 × 37,9 = 75,8 V.',
    termos: ['mppt', 'vmp', 'serie', 'fileira'],
  },
  'placas-acima-do-limite': {
    texto:
      'A tensão da placa sobe quando ela esfria, e a mais alta aparece em manhã fria e clara, com a célula ainda gelada e o inversor sem puxar corrente. O simulador considera a célula a 10 °C: a sua placa vai de 52,01 V para uns 54,1 V. Passar do limite da entrada uma única vez pode queimar a eletrônica, que não tem como se defender. Por isso a conta usa a Voc no frio, e não a tensão de trabalho.',
    termos: ['voc', 'fileira', 'serie'],
  },
  'placas-acima-da-faixa': {
    texto:
      'Dentro da faixa de trabalho, o MPPT procura o ponto de maior potência da fileira. Acima dela, a entrada ainda não queima, porque não passou do limite, mas o MPPT não consegue seguir o melhor ponto e corta potência. No Anenji, a faixa vai de 60 a 450 V e o limite é de 500 V; o espaço entre os dois é a margem para as manhãs frias.',
    termos: ['mppt', 'vmp', 'voc'],
  },
  'corrente-das-placas': {
    texto:
      'Em paralelo, as correntes somam e a tensão fica a de uma fileira; em série, é o contrário. A conta usa a Isc, a maior corrente que a placa dá, para ter folga: a sua placa tem 14,2 A, e duas em paralelo dão 2 × 14,2 = 28,4 A. Em série, a corrente fica 14,2 A e a tensão vai a uns 104 V, longe dos 500 V do limite. Mesma potência, menos corrente: cabo mais fino e menos perda.',
    termos: ['serie', 'paralelo', 'isc', 'corrente'],
  },
  'potencia-das-placas': {
    texto:
      'O MPPT tem um teto de potência que consegue converter. Quando as placas poderiam dar mais, ele segura a potência no teto, sem dano, desde que a tensão e a corrente estejam dentro dos limites da entrada. Um pouco de placa acima do teto ajuda nas manhãs e nos dias nublados, quando nenhuma placa chega ao Wp, mas o exagero é dinheiro parado.',
    termos: ['mppt', 'wp', 'potencia'],
  },
  'pwm-desperdica': {
    texto:
      'O PWM liga a placa direto na bateria em pulsos rápidos, e a placa é obrigada a trabalhar na tensão da bateria em carga, uns 28,1 V no seu banco de 24 V. A corrente da placa quase não muda com a tensão, então a potência cai junto: a placa que rende perto de 39 V passa a render 28,1 ÷ 39 ≈ 72% do que poderia. O MPPT troca tensão alta por corrente maior do lado da bateria, como a marcha de uma bicicleta.',
    termos: ['pwm', 'mppt', 'vmp', 'imp'],
  },
  'placa-na-sombra': {
    texto:
      'Uma placa é feita de dezenas de células em série, e a corrente que passa por uma passa por todas. Uma sombra sobre poucas células, de uma antena, de um galho ou da própria casa, derruba a corrente de um trecho inteiro. Os diodos de bypass desviam esse trecho para o resto continuar, mas ele deixa de gerar. Por isso uma sombra pequena tira bem mais do que a área que cobre.',
    termos: ['sombra-parcial', 'diodo-de-bypass', 'serie'],
  },
  'sem-placas': {
    texto:
      'Sem placas, o sistema funciona como um nobreak grande: guarda a energia da rede e a devolve na queda de luz. Isso já cumpre o objetivo do seu plano, que é segurar a casa nas quedas, e não abater a conta. A placa entra para recarregar a bateria quando a queda passa de uma noite: o plano estima uns 1,8 kWh por dia de sol para uma placa de 550 W no Rio.',
    termos: ['off-grid', 'irradiacao', 'energia', 'rede-eletrica'],
  },

  // ------------------------------------------------------------ Cargas e inversor

  sobrecarga: {
    texto:
      'Potência é o quanto cada aparelho puxa naquele instante, e no inversor as potências somam. Acima do que ele entrega, ele desliga a saída para se proteger, e todas as tomadas do off-grid apagam juntas. Chuveiro, ferro e micro-ondas costumam passar de 1.000 W cada um; é por isso que o seu plano manda marcar as tomadas do off-grid com outra cor.',
    termos: ['potencia', 'inversor'],
  },
  'pico-de-partida': {
    texto:
      'Parado, um motor puxa muito mais corrente do que girando, até ganhar rotação. O compressor da geladeira faz isso toda vez que liga, várias vezes por dia. O inversor aguenta uma potência de pico só por instantes: no Anenji são 6.000 W, o dobro dos 3.000 W contínuos. Se a partida e o que já está ligado passam do pico, a saída desarma e tudo apaga junto.',
    termos: ['pico-de-partida', 'potencia', 'inversor'],
  },
  'corrente-da-bateria': {
    texto:
      'Do lado da bateria, a mesma potência vira muita corrente, porque a tensão é baixa: 3.000 W ÷ 24 V = 125 A, mais as perdas do inversor. A bateria do plano corta em 100 A, ou seja, uns 100 × 24 = 2.400 W tirados dela. Duas baterias iguais em paralelo dividem a corrente e dobram esse limite. O corte é o BMS protegendo as células, mas, quando ele corta, tudo apaga.',
    termos: ['corrente', 'bms', 'paralelo', 'potencia'],
  },
  'rede-desligada': {
    texto:
      'O inversor híbrido tem um carregador que usa a rede da rua para manter a bateria cheia. Com a rede presente, ele passa a energia da rua direto para os aparelhos e só usa a bateria na queda; com os nobreaks no meio, os PCs nem percebem a troca. Sem a rede, a bateria só recarrega pelas placas, e em dias nublados pode não encher. A entrada CA é só entrada: nada a ver com ligar a saída na rede, que é perigoso.',
    termos: ['inversor-hibrido', 'rede-eletrica', 'corrente-alternada'],
  },
  'carga-acima-da-bateria': {
    texto:
      'Cada bateria tem uma corrente máxima de carga; a do plano aceita 50 A. As placas e o carregador da rede somam as correntes, e o inversor não sabe que bateria está do outro lado se você não disser no menu. Carregar acima do limite esquenta as células e encurta a vida delas; antes disso o BMS corta, e a carga para por inteiro. Com duas baterias iguais em paralelo, o limite do banco vai para 100 A.',
    termos: ['bms', 'bateria-de-litio', 'inversor-hibrido', 'paralelo'],
  },

  // ------------------------------------------------------------ Proteção e cabos

  'sem-protecao-da-bateria': {
    texto:
      'O fusível protege o cabo, não o aparelho: ele é o ponto fraco de propósito. Por isso fica no começo do cabo, junto ao positivo: um curto em qualquer ponto depois dele faz a corrente passar por ele. O trecho entre a bateria e o fusível fica sem proteção, então precisa ser o mais curto possível. O seu plano prevê fusível ou disjuntor CC de 150 A junto ao positivo. Com esse fusível o cabo precisa aguentar 150 A: o de 25 mm² aguenta 125 A, e o simulador pede 35 mm².',
    termos: ['fusivel', 'disjuntor-cc', 'curto-circuito', 'bitola'],
  },
  'sem-protecao-do-controlador': {
    texto:
      'A bateria é a fonte mais perigosa do sistema: em um curto ela entrega centenas de ampères, e é isso que derrete o cabo. O fusível do inversor só protege o cabo do inversor. O cabo do controlador de carga é outro cabo saindo do mesmo polo positivo, em geral mais fino, e precisa da proteção dele, perto da bateria. O valor fica acima da corrente do controlador, com pelo menos 10% de folga para não abrir em uso normal, e sempre igual ou abaixo do que o cabo aguenta. O simulador escolhe a menor proteção do catálogo que atende; o manual do controlador costuma indicar o valor certo para ele.',
    termos: ['fusivel', 'disjuntor-cc', 'curto-circuito'],
  },
  'protecao-de-ca-em-cc': {
    texto:
      'Ao abrir um circuito com corrente, forma-se um arco elétrico entre os contatos. Em corrente alternada, a corrente passa por zero 120 vezes por segundo, e o arco se apaga sozinho em uma dessas passagens. Em corrente contínua ela nunca passa por zero, e o arco continua aceso se o disjuntor não foi feito para apagá-lo. O disjuntor CC é construído para isso e muitas vezes tem polaridade marcada, que precisa ser seguida.',
    termos: ['arco-eletrico', 'disjuntor-ca', 'disjuntor-cc', 'corrente-continua'],
  },
  'tensao-da-protecao': {
    texto:
      'A tensão escrita na proteção é a maior que ela consegue interromper: quanto mais alta a tensão, mais o arco resiste a apagar quando os contatos se abrem. Nas placas, a conta usa a Voc no frio: duas placas de 585 W em série chegam a 2 × 54,1 = 108,2 V numa manhã fria. Na bateria, usa a tensão de carga, uns 28,1 V no seu banco; por isso um fusível de 32 V serve na bateria e não serve nas placas.',
    termos: ['voc', 'fusivel', 'disjuntor-cc', 'arco-eletrico'],
  },
  'protecao-maior-que-o-cabo': {
    texto:
      'A proteção é escolhida pelo cabo, e não pelo aparelho. Cada cabo aguenta uma corrente sem esquentar demais, e a proteção precisa abrir antes disso. Se ela é maior que o cabo, uma corrente um pouco acima do normal por muito tempo esquenta o cabo e derrete a capa sem ela abrir. A ordem certa é cabo primeiro, proteção depois: igual ou menor que a capacidade do cabo, e acima da corrente de uso.',
    termos: ['fusivel', 'disjuntor', 'bitola'],
  },
  'cabo-fino': {
    texto:
      'O cobre tem uma resistência pequena, e a corrente que passa por ela vira calor; o calor cresce com o quadrado da corrente, então o dobro da corrente esquenta quatro vezes mais. Cabo mais grosso tem menos resistência e esquenta menos. Em 24 V as correntes são altas: os 3.000 W puxam cerca de 127 A da bateria, enquanto nas tomadas de 127 V bastam 2,5 mm². O plano previa 25 mm² da bateria ao inversor, que aguenta 125 A: fica no limite, e por isso o simulador aponta 35 mm².',
    termos: ['bitola', 'corrente', 'queda-de-tensao'],
  },
  'cabo-de-bateria-sobrando': {
    texto:
      'O cabo é escolhido pela corrente que precisa aguentar: a maior entre a corrente de uso e a da proteção instalada, porque a proteção tem de abrir antes de o cabo esquentar. Depois se confere a queda de tensão, que na bateria deve ficar em até 2%. Passando nas duas contas, um cabo mais grosso não deixa o sistema mais seguro, só mais caro e mais difícil de dobrar e de prensar no terminal. Se você pretende trocar o inversor por um maior no futuro, vale manter o cabo grosso.',
    termos: ['bitola', 'corrente', 'queda-de-tensao', 'fusivel'],
  },
  'protecao-pequena': {
    texto:
      'A proteção abre quando a corrente passa do valor dela por tempo suficiente. Se esse valor fica abaixo do que o circuito puxa no uso máximo, ela abre justo quando tudo está ligado. Na bateria, a conta pede 10% de folga acima da corrente de projeto, porque fusível trabalhando perto do limite esquenta e envelhece. O conserto é subir a proteção só até onde o cabo aguenta; se não couber, o cabo sobe também.',
    termos: ['fusivel', 'disjuntor', 'bitola'],
  },
  'queda-de-tensao': {
    texto:
      'Todo cabo perde um pouco de tensão no caminho: mais com mais corrente e mais comprimento, menos com mais seção. Em 24 V cada volt pesa: 2% de 24 V são só 0,48 V, enquanto 4% de 127 V são uns 5,1 V. Essa perda vira calor no cabo e, na bateria, faz o inversor ver uma tensão menor e desligar antes, como se ela estivesse vazia. Por isso o plano pede cabos de corrente contínua curtos, de até 1 m.',
    termos: ['queda-de-tensao', 'bitola', 'tensao'],
  },
  'sem-dps-nas-placas': {
    texto:
      'Um raio que cai perto, mesmo sem acertar a casa, induz nos cabos que descem do telhado um pico de tensão muito curto e muito acima do normal. O DPS fica parado em tensão normal e, no surto, conduz para o aterramento, desviando o pico antes do inversor. Ele não protege contra raio direto e só funciona ligado a um aterramento de verdade. Depois de um surto forte ele pode se sacrificar; muitos têm uma janela que muda de cor.',
    termos: ['dps', 'aterramento', 'surto'],
  },
  'sem-disjuntor-nas-placas': {
    texto:
      'Sem disjuntor, o único jeito de desligar as placas é soltar o conector MC4, e soltar com corrente passando abre um arco que queima o conector e pode queimar a mão. O disjuntor CC abre o circuito com segurança e mostra pela alavanca que o inversor está separado das placas. Do disjuntor para cima, até as placas, o fio continua com tensão enquanto houver luz. O seu plano prevê disjuntor CC ou chave seccionadora entre as placas e a entrada do MPPT.',
    termos: ['disjuntor-cc', 'mc4', 'arco-eletrico', 'string-box'],
  },
  'sem-disjuntor-na-saida': {
    texto:
      'A proteção interna do inversor cuida dele, não da fiação, e quando age apaga todas as tomadas de uma vez. Em 127 V, os 3.000 W do inversor são 3.000 ÷ 127 = 23,6 A, mais do que aguenta um cabo de 1,5 mm², de 17,5 A. O disjuntor de 16 A em cada circuito, como no seu plano, abre antes de o cabo esquentar e desliga só o circuito com defeito.',
    termos: ['disjuntor-ca', 'bitola', 'corrente-alternada'],
  },
  'sem-quadro': {
    texto:
      'Disjuntor e DPS têm partes com tensão a poucos milímetros da superfície e foram feitos para ficar dentro de uma caixa, com só a alavanca à mostra. No quadro, as ligações também ficam presas e não são puxadas quando alguém esbarra num cabo. E as proteções ficam juntas, em um lugar identificado, onde é fácil desligar tudo antes de mexer.',
    termos: ['quadro-de-energia', 'disjuntor', 'dps'],
  },
  'quadro-cheio': {
    texto:
      'Cada proteção de trilho ocupa uma largura padrão chamada módulo: um disjuntor de um polo ocupa um, e os de corrente contínua das placas, que têm dois polos, ocupam dois. Peças forçadas além do espaço deixam a tampa sem fechar, apertam os cabos e esquentam umas às outras. Dois quadros também ajudam a separar: um para a corrente contínua das placas, outro para os 127 V da saída.',
    termos: ['quadro-de-energia', 'disjuntor-cc', 'disjuntor-ca'],
  },

  // ------------------------------------------------------------ Autonomia e energia

  'autonomia-curta': {
    texto:
      'Autonomia é a energia guardada dividida pela potência que sai. A bateria de 24 V e 100 Ah guarda 24 × 100 = 2.400 Wh, e o seu plano conta uns 2,2 kWh úteis. Com 300 W à noite, 2.200 ÷ 300 ≈ 7 horas; o próprio inversor ligado ainda gasta uns 45 W. Cada bateria igual em paralelo soma outros 2,2 kWh.',
    termos: ['autonomia', 'capacidade-ah', 'energia', 'profundidade-de-descarga'],
  },
  'geracao-menor-que-o-consumo': {
    texto:
      'A conta do dia é em energia: o que as placas geram de manhã à tarde contra o que os aparelhos gastam em 24 horas. Uma placa de 585 W só dá 585 W em sol forte de teste; o seu plano conta uns 4,5 horas de sol pleno por dia no Rio. Quando o consumo passa da geração, a bateria amanhece um pouco mais vazia a cada dia, até a rede voltar ou o inversor desligar.',
    termos: ['energia', 'irradiacao', 'wp'],
  },
};
