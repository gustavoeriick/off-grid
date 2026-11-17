// Glossário dos termos que aparecem na interface e nas sugestões do consultor.
// Tarefa 4.2. `curto` aparece ao passar o ponteiro; `texto` no painel do termo.
// Números: os do cenário do Gustavo (24 V, 127 V, Anenji 3.000 W, bateria de 24 V e 100 Ah,
// placa Renepv de 585 W) e contas simples a partir deles.

export interface TermoGlossario {
  id: string;
  termo: string;
  /** Uma frase. */
  curto: string;
  /** De 2 a 4 frases. */
  texto: string;
  /** Ids de outros termos relacionados. */
  veja?: string[];
}

export const GLOSSARIO: TermoGlossario[] = [
  // ------------------------------------------------------------ Grandezas

  {
    id: 'tensao',
    termo: 'Tensão (V)',
    curto: 'A "força" que empurra a corrente pelo fio, medida em volts.',
    texto:
      'Tensão é a diferença de "pressão" elétrica entre dois pontos, medida em volts (V). Lembra a pressão da água no cano: sem diferença de pressão, a água não anda. No seu sistema há três tensões: 24 V na bateria, uns 100 V ou mais nas placas em série e 127 V nas tomadas.',
    veja: ['corrente', 'potencia'],
  },
  {
    id: 'corrente',
    termo: 'Corrente (A)',
    curto: 'A quantidade de eletricidade passando pelo fio a cada segundo, medida em ampères.',
    texto:
      'Corrente é o fluxo de eletricidade, medido em ampères (A), como a vazão de água no cano. É a corrente que esquenta o cabo, e por isso é ela que decide a bitola e a proteção. A mesma potência em tensão baixa pede mais corrente: 3.000 W são 3.000 ÷ 24 = 125 A na bateria e 3.000 ÷ 127 = 23,6 A na tomada.',
    veja: ['tensao', 'bitola', 'fusivel'],
  },
  {
    id: 'potencia',
    termo: 'Potência (W)',
    curto: 'O quanto um aparelho puxa em cada instante, em watts: tensão vezes corrente.',
    texto:
      'Potência é o ritmo em que a energia é usada, medida em watts (W), e vale tensão × corrente. É como a velocidade de um carro: diz quão rápido, e não quanto. O inversor tem um limite de potência, 3.000 W no seu, e a soma dos aparelhos ligados ao mesmo tempo precisa ficar abaixo dele.',
    veja: ['energia', 'tensao', 'corrente'],
  },
  {
    id: 'energia',
    termo: 'Energia (Wh e kWh)',
    curto: 'Potência vezes tempo: o que a bateria guarda e a conta de luz cobra.',
    texto:
      'Energia é potência × tempo, medida em watt-hora (Wh); 1 kWh são 1.000 Wh. Se a potência é a velocidade, a energia é a distância percorrida. Um ventilador de 50 W ligado 10 horas gasta 50 × 10 = 500 Wh. A bateria de 24 V e 100 Ah guarda 24 × 100 = 2.400 Wh, ou 2,4 kWh.',
    veja: ['potencia', 'capacidade-ah', 'autonomia'],
  },
  {
    id: 'corrente-continua',
    termo: 'Corrente contínua (CC)',
    curto: 'Corrente que anda sempre no mesmo sentido, como a da bateria e a da placa.',
    texto:
      'Na corrente contínua, o positivo é sempre positivo e a corrente vai sempre para o mesmo lado. Bateria e placa solar trabalham assim. Por não passar por zero, ela é mais difícil de interromper: na hora de abrir o circuito, a faísca se mantém, e por isso pede fusíveis e disjuntores próprios.',
    veja: ['corrente-alternada', 'arco-eletrico', 'disjuntor-cc', 'polaridade'],
  },
  {
    id: 'corrente-alternada',
    termo: 'Corrente alternada (CA)',
    curto: 'Corrente que troca de sentido muitas vezes por segundo, como a das tomadas.',
    texto:
      'Na corrente alternada, a tensão sobe, desce, inverte e volta, num ciclo que no Brasil se repete 60 vezes por segundo (60 Hz). É a das tomadas da casa e a da saída do inversor. Os aparelhos de casa foram feitos para ela.',
    veja: ['corrente-continua', 'inversor', 'onda-senoidal-pura'],
  },
  {
    id: 'serie',
    termo: 'Ligação em série',
    curto: 'Uma peça depois da outra: as tensões somam e a corrente é a mesma.',
    texto:
      'Em série, o positivo de uma peça vai no negativo da seguinte, formando uma fila. As tensões somam e a mesma corrente passa por todas. Duas placas de 585 W em série: 2 × 43,83 = 87,7 V de trabalho, com a corrente de uma placa só. Se uma peça da fila para, a fila inteira para.',
    veja: ['paralelo', 'fileira'],
  },
  {
    id: 'paralelo',
    termo: 'Ligação em paralelo',
    curto: 'Peças lado a lado nas mesmas pontas: as correntes somam e a tensão é a mesma.',
    texto:
      'Em paralelo, os positivos se ligam entre si e os negativos também. A tensão fica a de uma peça e as correntes e capacidades somam. Duas baterias de 24 V e 100 Ah em paralelo continuam em 24 V, mas guardam 200 Ah. Só se liga em paralelo o que tem a mesma tensão.',
    veja: ['serie', 'banco-de-baterias'],
  },

  // ------------------------------------------------------------ Placas

  {
    id: 'placa-solar',
    termo: 'Placa solar',
    curto: 'Painel que transforma luz em corrente contínua.',
    texto:
      'A placa, ou módulo fotovoltaico, é feita de dezenas de células ligadas em série atrás de um vidro. Com luz, ela gera corrente contínua; quanto mais luz, mais corrente. A etiqueta atrás dela traz os números que importam: Wp, Voc, Vmp, Isc e Imp.',
    veja: ['wp', 'voc', 'vmp', 'isc', 'imp', 'fileira'],
  },
  {
    id: 'wp',
    termo: 'Wp (watt-pico)',
    curto: 'A potência da placa em condição de teste, com sol forte e célula a 25 °C.',
    texto:
      'O Wp é a potência que a placa dá na condição padrão de teste da fábrica: 1.000 W/m² de luz e célula a 25 °C. No telhado ela quase sempre dá menos, porque o sol varia e a célula esquenta. É o número para comparar placas, não para prometer geração.',
    veja: ['placa-solar', 'irradiacao'],
  },
  {
    id: 'voc',
    termo: 'Voc (tensão em aberto)',
    curto: 'A tensão da placa sem nada ligado: a mais alta que ela produz.',
    texto:
      'Voc é a tensão nos fios da placa ao sol sem nada ligado. É a maior tensão que ela chega a ter, e sobe no frio. Na sua placa de 585 W é 52,01 V, e o simulador considera uns 54,1 V numa manhã fria. É com ela que se confere o limite da entrada do inversor.',
    veja: ['vmp', 'placa-solar', 'serie'],
  },
  {
    id: 'vmp',
    termo: 'Vmp (tensão de máxima potência)',
    curto: 'A tensão em que a placa rende mais.',
    texto:
      'Vmp é a tensão em que a placa entrega a maior potência, menor que a Voc. Na sua placa de 585 W é 43,83 V, e cai no calor: com a célula a 70 °C, fica perto de 37,9 V. É com ela que se confere a tensão mínima da entrada do MPPT.',
    veja: ['voc', 'imp', 'mppt'],
  },
  {
    id: 'isc',
    termo: 'Isc (corrente de curto)',
    curto: 'A corrente da placa com o positivo ligado direto no negativo: a mais alta que ela dá.',
    texto:
      'Isc é a corrente da placa em curto-circuito, e é o teto de corrente dela: na sua placa de 585 W, 14,2 A. Por isso uma placa em curto não queima, ao contrário da bateria. É com a Isc que se confere a corrente máxima da entrada e se escolhem cabo e proteção das placas.',
    veja: ['imp', 'curto-circuito', 'placa-solar'],
  },
  {
    id: 'imp',
    termo: 'Imp (corrente de máxima potência)',
    curto: 'A corrente da placa quando ela rende mais.',
    texto:
      'Imp é a corrente no ponto de maior potência, um pouco abaixo da Isc: na sua placa de 585 W, 13,35 A. Vmp × Imp dá perto do Wp: 43,83 × 13,35 ≈ 585 W.',
    veja: ['isc', 'vmp', 'wp'],
  },
  {
    id: 'fileira',
    termo: 'Fileira (string)',
    curto: 'Um grupo de placas ligadas em série.',
    texto:
      'Fileira, ou string, é um conjunto de placas em série, com um positivo e um negativo nas pontas. As tensões das placas somam: duas placas de 585 W dão 2 × 52,01 = 104 V em aberto. Fileiras iguais podem ser ligadas em paralelo, se a entrada aceitar a corrente somada.',
    veja: ['serie', 'paralelo', 'placa-solar'],
  },
  {
    id: 'irradiacao',
    termo: 'Irradiação',
    curto: 'Quanta luz do sol chega a uma área, que decide quanto a placa gera.',
    texto:
      'Irradiância é a força da luz em um instante, em W/m²; irradiação é a soma dela ao longo do dia, em kWh/m². Costuma ser contada em "horas de sol pleno": as horas que daria se o sol ficasse em 1.000 W/m². O seu plano conta uns 4,5 horas de sol pleno por dia no Rio.',
    veja: ['wp', 'energia'],
  },
  {
    id: 'sombra-parcial',
    termo: 'Sombra parcial',
    curto: 'Sombra sobre só um pedaço da placa, que derruba a geração de bem mais que esse pedaço.',
    texto:
      'Como as células da placa estão em série, a célula sombreada limita a corrente das outras. Uma sombra de antena, galho ou parede sobre poucas células pode tirar um terço da placa ou mais. Os diodos de bypass reduzem o estrago, mas não o eliminam.',
    veja: ['diodo-de-bypass', 'serie'],
  },
  {
    id: 'diodo-de-bypass',
    termo: 'Diodo de bypass',
    curto: 'Desvio dentro da placa que pula o trecho sombreado.',
    texto:
      'Diodo é uma peça que deixa a corrente passar num sentido só. A placa tem alguns deles na caixa de ligação, atrás, cada um cuidando de um trecho de células. Quando um trecho fica na sombra, a corrente passa pelo diodo em vez de pelas células, e o resto da placa continua gerando.',
    veja: ['sombra-parcial', 'placa-solar'],
  },
  {
    id: 'mc4',
    termo: 'Conector MC4',
    curto: 'Conector de encaixe à prova de chuva usado nos cabos das placas.',
    texto:
      'O MC4 é o conector padrão das placas: um macho e uma fêmea que travam com um clique e vedam contra chuva. Ele não foi feito para ser desconectado com corrente passando: abrir com sol e circuito fechado forma arco. Desligue o disjuntor das placas antes de soltar.',
    veja: ['arco-eletrico', 'disjuntor-cc', 'placa-solar'],
  },
  {
    id: 'string-box',
    termo: 'String box',
    curto: 'Caixa com as proteções das placas: disjuntor CC, DPS e, às vezes, fusíveis.',
    texto:
      'String box é uma caixa de proteção que fica entre as placas e o inversor. Dentro dela ficam o disjuntor ou a chave de corrente contínua, o DPS e, com várias fileiras, um fusível por fileira. No simulador, o mesmo papel é feito pelas proteções das placas montadas em um quadro.',
    veja: ['disjuntor-cc', 'dps', 'quadro-de-energia'],
  },

  // ------------------------------------------------------------ Inversor e controlador

  {
    id: 'inversor',
    termo: 'Inversor',
    curto: 'Transforma a corrente contínua da bateria na corrente alternada das tomadas.',
    texto:
      'O inversor pega os 24 V contínuos da bateria e cria 127 V alternados, como os da rua. Ele tem um limite de potência contínua, 3.000 W no seu, e um de pico para partidas curtas, 6.000 W. Mesmo parado, gasta um pouco de energia só por estar ligado.',
    veja: ['inversor-hibrido', 'corrente-continua', 'corrente-alternada'],
  },
  {
    id: 'inversor-hibrido',
    termo: 'Inversor híbrido',
    curto: 'Inversor, carregador pela rede e controlador solar em um aparelho só.',
    texto:
      'O inversor híbrido off-grid junta três coisas: o inversor, um carregador que usa a rede para encher a bateria e um controlador MPPT para as placas. Com a rede presente, ele passa a energia da rua para os aparelhos; na queda, assume pela bateria sozinho. É o tipo do seu plano.',
    veja: ['inversor', 'mppt', 'rede-eletrica'],
  },
  {
    id: 'onda-senoidal-pura',
    termo: 'Onda senoidal pura',
    curto: 'Corrente alternada com a forma suave da rede da rua.',
    texto:
      'É a forma de onda que a rede entrega: sobe e desce em curva suave. Inversor de onda pura alimenta qualquer aparelho de casa como a rede faria, inclusive motores, nobreaks e fontes de computador. É o que o seu plano pede.',
    veja: ['onda-modificada', 'inversor'],
  },
  {
    id: 'onda-modificada',
    termo: 'Onda senoidal modificada',
    curto: 'Imitação da onda da rede em degraus; mais barata e pior para motores e eletrônicos.',
    texto:
      'O inversor de onda modificada liga e desliga a tensão em degraus, sem a curva suave. Lâmpadas e aquecedores aceitam; motores esquentam e fazem ruído, e nobreaks e fontes de computador podem apitar, desligar ou esquentar.',
    veja: ['onda-senoidal-pura', 'inversor'],
  },
  {
    id: 'controlador-de-carga',
    termo: 'Controlador de carga',
    curto: 'Fica entre as placas e a bateria e decide quanto carregar.',
    texto:
      'O controlador de carga recebe a energia das placas e carrega a bateria na tensão certa, reduzindo a carga quando ela enche. Pode ser um aparelho separado ou estar dentro do inversor híbrido. Há dois tipos: MPPT e PWM.',
    veja: ['mppt', 'pwm', 'inversor-hibrido'],
  },
  {
    id: 'mppt',
    termo: 'MPPT',
    curto: 'Controlador que acha sozinho o ponto em que as placas rendem mais.',
    texto:
      'MPPT quer dizer "rastreamento do ponto de máxima potência". Ele deixa a placa trabalhar na tensão em que rende mais e converte essa tensão alta em mais corrente do lado da bateria, como a marcha de uma bicicleta. Tem uma faixa de tensão de trabalho e um limite que não pode ser passado: no Anenji, 60 a 450 V, com limite de 500 V.',
    veja: ['pwm', 'vmp', 'voc', 'controlador-de-carga'],
  },
  {
    id: 'pwm',
    termo: 'PWM',
    curto: 'Controlador simples que liga a placa direto na bateria em pulsos.',
    texto:
      'O PWM é um controlador mais barato que liga e desliga a placa na bateria muito rápido. A placa fica presa na tensão da bateria e perde a diferença para a tensão em que renderia mais. Combina com placa de tensão próxima da bateria, não com placas grandes como a de 585 W em banco de 24 V.',
    veja: ['mppt', 'controlador-de-carga'],
  },
  {
    id: 'pico-de-partida',
    termo: 'Pico de partida',
    curto: 'A potência alta que um motor puxa por um instante ao ligar.',
    texto:
      'Motor parado puxa várias vezes a potência normal até ganhar rotação, por uma fração de segundo ou poucos segundos. O compressor da geladeira é o caso típico da casa. O inversor precisa aguentar esse pico somado ao que já está ligado.',
    veja: ['potencia', 'inversor'],
  },
  {
    id: 'visor',
    termo: 'Visor',
    curto: 'A telinha com números de uma peça: tensão, corrente, consumo ou carga.',
    texto:
      'O controlador de carga e o inversor de verdade têm visor: mostram a tensão das placas, a corrente de carga, o consumo. No simulador, a bateria também ganha um visor, que é só ajuda: mostra a carga em %, os volts aproximados (≈) e a potência entrando ou saindo. Os volts são os da bateria parada, tirados da carga por uma tabela de fabricante (Trojan para chumbo, LiTime para lítio), porque as marcas do catálogo não publicam a delas. No lítio a tensão quase não muda entre 25 % e 100 %: por isso bateria de lítio usa medidor próprio. Bateria de chumbo de verdade não tem visor.',
    veja: ['controlador-de-carga', 'inversor', 'tensao'],
  },

  // ------------------------------------------------------------ Baterias

  {
    id: 'bateria-de-litio',
    termo: 'Bateria de lítio (LiFePO4)',
    curto: 'Bateria de lítio-ferro-fosfato: muitos ciclos e quase toda a carga utilizável.',
    texto:
      'LiFePO4 é o lítio-ferro-fosfato, a química de lítio mais usada em energia solar por ser mais estável que a dos celulares. Aguenta milhares de ciclos e deixa usar quase toda a carga: o seu plano conta 2,2 kWh úteis de 2,4 kWh. Tem um BMS dentro e, em curto, entrega correntes enormes.',
    veja: ['bms', 'bateria-estacionaria', 'profundidade-de-descarga'],
  },
  {
    id: 'bateria-estacionaria',
    termo: 'Bateria estacionária de chumbo',
    curto: 'Bateria de chumbo-ácido feita para descargas longas.',
    texto:
      'É uma bateria de chumbo-ácido feita para ficar parada e ser descarregada aos poucos, ao contrário da bateria de carro. É mais barata, mais pesada e aguenta menos ciclos que a de lítio, e para durar não deve passar de uns 50% de descarga, a conta do seu plano. Pode soltar gás na carga e pede local ventilado.',
    veja: ['bateria-de-litio', 'profundidade-de-descarga'],
  },
  {
    id: 'bms',
    termo: 'BMS',
    curto: 'O sistema eletrônico dentro da bateria de lítio que a desliga para protegê-la.',
    texto:
      'BMS é o "sistema de gerenciamento da bateria": uma placa eletrônica que vigia cada célula e corta a bateria se a corrente, a tensão ou a temperatura saem do limite. Na bateria do plano, ele corta acima de 100 A de descarga. Ele protege as células, mas não substitui o fusível do cabo.',
    veja: ['bateria-de-litio', 'fusivel'],
  },
  {
    id: 'banco-de-baterias',
    termo: 'Banco de baterias',
    curto: 'O conjunto de baterias ligadas entre si que alimenta o inversor.',
    texto:
      'O banco é o conjunto das baterias do sistema. Em série, as tensões somam; em paralelo, as capacidades somam. O seu plano começa com uma bateria de 24 V e cresce com outras iguais em paralelo, sempre em 24 V.',
    veja: ['serie', 'paralelo', 'capacidade-ah'],
  },
  {
    id: 'capacidade-ah',
    termo: 'Capacidade (Ah)',
    curto: 'Quanta carga a bateria guarda, em ampère-hora.',
    texto:
      'Ampère-hora (Ah) diz quanta corrente a bateria dá por quanto tempo: 100 Ah são, em teoria, 10 A por 10 horas. Para virar energia, multiplique pela tensão: 24 V × 100 Ah = 2.400 Wh. Comparar Ah só faz sentido entre baterias da mesma tensão.',
    veja: ['energia', 'autonomia'],
  },
  {
    id: 'profundidade-de-descarga',
    termo: 'Profundidade de descarga',
    curto: 'Quanto da carga se usa antes de recarregar.',
    texto:
      'É a parte da carga usada, em porcentagem. Descarregar fundo gasta a bateria mais rápido, e cada química tem seu limite saudável. O seu plano conta uns 50% para a estacionária de chumbo e uns 2,2 de 2,4 kWh, cerca de 90%, para o lítio.',
    veja: ['bateria-de-litio', 'bateria-estacionaria', 'autonomia'],
  },
  {
    id: 'autonomia',
    termo: 'Autonomia',
    curto: 'Quantas horas a bateria segura o que está ligado.',
    texto:
      'Autonomia é a energia útil dividida pela potência que sai. Com 2,2 kWh úteis e 300 W à noite, 2.200 ÷ 300 ≈ 7 horas, antes de contar o consumo do próprio inversor. Mais bateria ou menos aparelhos ligados aumentam a autonomia.',
    veja: ['energia', 'capacidade-ah', 'profundidade-de-descarga'],
  },

  // ------------------------------------------------------------ Cabos

  {
    id: 'bitola',
    termo: 'Bitola (mm²)',
    curto: 'A espessura do cobre do cabo, medida em milímetros quadrados.',
    texto:
      'Bitola é a área do cobre do cabo, em mm², sem contar a capa. Cabo mais grosso aguenta mais corrente sem esquentar e perde menos tensão. O seu plano usa 25 mm² da bateria ao inversor, 4 ou 6 mm² nas placas e 2,5 mm² nas tomadas.',
    veja: ['corrente', 'queda-de-tensao', 'alucobre'],
  },
  {
    id: 'queda-de-tensao',
    termo: 'Queda de tensão',
    curto: 'A tensão que se perde no cabo, entre a fonte e o aparelho.',
    texto:
      'Todo cabo tem uma pequena resistência, e a corrente perde tensão ao passar por ela; essa perda vira calor. Ela cresce com a corrente e o comprimento e diminui com a bitola. Em 24 V, com correntes altas, é a razão de os cabos da bateria serem curtos e grossos.',
    veja: ['bitola', 'tensao'],
  },
  {
    id: 'alucobre',
    termo: 'Alucobre',
    curto: 'Cabo de alumínio com capa fina de cobre: parece cobre, conduz menos.',
    texto:
      'Alucobre é alumínio revestido de uma camada fina de cobre, mais barato que o cobre. Conduz cerca de 60% do que o cobre da mesma bitola conduz, então esquenta mais, e o alumínio cede com o tempo no terminal, afrouxando a conexão. O simulador não recomenda.',
    veja: ['bitola'],
  },

  // ------------------------------------------------------------ Proteções

  {
    id: 'curto-circuito',
    termo: 'Curto-circuito',
    curto: 'Ligação direta entre positivo e negativo, sem nada no meio para limitar a corrente.',
    texto:
      'No curto, a corrente só é limitada pela resistência dos fios e da fonte, que é quase nada. Em bateria de lítio isso dá centenas de ampères ou mais e derrete metal em segundos. É para isso que existem o fusível e o disjuntor.',
    veja: ['fusivel', 'disjuntor', 'bms'],
  },
  {
    id: 'polaridade',
    termo: 'Polaridade',
    curto: 'Qual lado é positivo e qual é negativo em corrente contínua.',
    texto:
      'Em corrente contínua, cada terminal tem um lado certo: positivo (+, em geral vermelho) e negativo (−, em geral preto). Ligar invertido pode queimar o inversor na hora. Confira com o multímetro antes de cada ligação: com a ponta vermelha no positivo, o número no visor não pode ter sinal de menos.',
    veja: ['corrente-continua'],
  },
  {
    id: 'arco-eletrico',
    termo: 'Arco elétrico',
    curto: 'Faísca que continua acesa no ar quando se abre um circuito com corrente.',
    texto:
      'Ao separar dois contatos com corrente passando, a eletricidade continua pulando pelo ar por um instante e forma uma faísca muito quente. Em corrente alternada ela se apaga sozinha; em corrente contínua pode se manter e derreter o metal. Por isso não se solta conector com carga.',
    veja: ['corrente-continua', 'disjuntor-cc', 'mc4'],
  },
  {
    id: 'fusivel',
    termo: 'Fusível',
    curto: 'Peça com um fio de metal que derrete e abre o circuito em excesso de corrente.',
    texto:
      'O fusível é o ponto fraco de propósito: com corrente demais, o elemento dele derrete antes de o cabo esquentar. Depois de queimar, precisa ser trocado. Ele tem duas medidas: a corrente em que abre e a tensão máxima que consegue interromper; as duas precisam servir para o circuito.',
    veja: ['disjuntor', 'curto-circuito', 'bitola', 'porta-fusivel'],
  },
  {
    id: 'porta-fusivel',
    termo: 'Porta-fusível',
    curto: 'A base em que o fusível encaixa: com o fusível fora dela, a corrente não passa.',
    texto:
      'O porta-fusível prende o fusível no cabo e deixa tirá-lo e pô-lo sem ferramenta especial. Com o fusível fora, o circuito fica cortado, mas o porta-fusível não é chave para usar com corrente passando: o fusível só se tira e só se põe com o circuito sem corrente (inversor e aparelhos desligados). Para cortar com corrente, use o disjuntor de corrente contínua. Na fiação o fusível fica fora e só vai para o lugar na hora de ligar, depois de conferida a polaridade. Muito anúncio de fusível vem sem o porta-fusível.',
    veja: ['fusivel', 'polaridade', 'disjuntor-cc'],
  },
  {
    id: 'disjuntor',
    termo: 'Disjuntor',
    curto: 'Interruptor automático que desarma com corrente demais e pode ser religado.',
    texto:
      'O disjuntor faz o papel do fusível, mas desarma em vez de queimar e pode ser religado. A alavanca dele é a chave: numa posição o disjuntor está fechado e a corrente passa; na outra, está aberto e a corrente não passa. Também serve de interruptor para desligar um circuito antes de mexer nele. Há disjuntores de corrente contínua e de corrente alternada, e um não substitui o outro.',
    veja: ['disjuntor-cc', 'disjuntor-ca', 'fusivel', 'desarmar'],
  },
  {
    id: 'desarmar',
    termo: 'Desarmar',
    curto: 'O disjuntor abre sozinho, porque passou corrente demais.',
    texto:
      'Quando passa mais corrente do que ele aguenta, o disjuntor desarma: a alavanca muda de posição sozinha e corta o circuito. Nada queima; para religar, tire a causa (um aparelho a mais, um curto) e feche a alavanca de novo. O disjuntor de verdade não desarma na hora: aguenta um pouco acima do limite por um instante, conforme a curva de tempo dele.',
    veja: ['disjuntor', 'sobrecarga', 'curto-circuito'],
  },
  {
    id: 'sobrecarga',
    termo: 'Sobrecarga',
    curto: 'Os aparelhos ligados juntos pedem mais potência do que o inversor ou o circuito aguentam.',
    texto:
      'Cada inversor tem um limite de potência. Se a soma dos aparelhos ligados ao mesmo tempo passa dele, o inversor corta a saída para se proteger e fica em falha até ser religado. Num cabo, sobrecarga é corrente acima do que ele aguenta: é o caso em que o disjuntor desarma ou o fusível queima. Desligue algum aparelho antes de religar.',
    veja: ['potencia', 'inversor', 'desarmar'],
  },
  {
    id: 'disjuntor-cc',
    termo: 'Disjuntor de corrente contínua',
    curto: 'Disjuntor feito para apagar o arco da corrente contínua.',
    texto:
      'O disjuntor CC tem construção própria para apagar o arco, que em corrente contínua não se apaga sozinho. Vem marcado com a tensão CC máxima, e muitos têm polaridade marcada que precisa ser seguida. Vai na bateria e nas placas.',
    veja: ['disjuntor', 'arco-eletrico', 'corrente-continua'],
  },
  {
    id: 'disjuntor-ca',
    termo: 'Disjuntor de corrente alternada',
    curto: 'O disjuntor comum do quadro de luz, para os circuitos de 127 V.',
    texto:
      'É o disjuntor dos quadros de casa, feito para corrente alternada. Vai nos circuitos que saem do inversor para as tomadas: o seu plano prevê um de 16 A. Em corrente contínua ele pode não conseguir abrir um curto.',
    veja: ['disjuntor', 'corrente-alternada'],
  },
  {
    id: 'dps',
    termo: 'DPS',
    curto: 'Dispositivo de proteção contra surtos: desvia picos de raio para a terra.',
    texto:
      'O DPS fica parado em tensão normal e, quando chega um pico, como o de um raio que caiu perto, conduz para o aterramento e poupa o inversor. Não protege contra raio direto e só funciona com aterramento ligado. O das placas precisa ser de corrente contínua.',
    veja: ['surto', 'aterramento'],
  },
  {
    id: 'surto',
    termo: 'Surto',
    curto: 'Pico de tensão muito curto e muito alto, como o induzido por um raio.',
    texto:
      'Surto é um pico de tensão que dura milésimos de segundo e passa muito do normal. Pode vir de um raio que caiu perto ou de manobras na rede. Cabos longos, como os que descem do telhado, captam surtos com facilidade.',
    veja: ['dps'],
  },
  {
    id: 'aterramento',
    termo: 'Aterramento',
    curto: 'Ligação das partes metálicas a uma haste enterrada no chão.',
    texto:
      'Aterrar é ligar carcaças e estruturas metálicas a uma haste enterrada, por um fio próprio, em geral verde ou verde e amarelo. Se um fio com tensão encosta na carcaça, a corrente tem um caminho que não é o seu corpo, e o DPS tem para onde desviar o surto. O seu plano prevê aterrar a carcaça do inversor e a estrutura das placas.',
    veja: ['dps', 'dr'],
  },
  {
    id: 'dr',
    termo: 'DR (interruptor diferencial)',
    curto: 'Proteção que desliga o circuito quando corrente escapa por onde não devia, como por uma pessoa.',
    texto:
      'O DR compara a corrente que vai pela fase com a que volta pelo neutro. Se falta uma parte, ela está escapando, por exemplo pelo corpo de alguém, e ele desliga em uma fração de segundo. O disjuntor comum não faz isso. Se e como usar um DR na saída do inversor depende do inversor; confira com o eletricista.',
    veja: ['aterramento', 'disjuntor-ca'],
  },
  {
    id: 'filtro-de-linha',
    termo: 'Filtro de linha',
    curto: 'Régua de tomadas com uma corrente máxima: vários aparelhos ligam nela e um cabo só sai dela.',
    texto:
      'O filtro de linha reparte uma tomada em várias, mas toda a corrente passa por um cabo só, e ele tem um limite escrito na etiqueta, como 10 A. Em 127 V, 10 A são 1.270 W somados. Aparelho forte, como o ar-condicionado, não deve dividir filtro com outros.',
    veja: ['corrente', 'sobrecarga'],
  },
  {
    id: 'quadro-de-energia',
    termo: 'Quadro de energia',
    curto: 'Caixa fechada onde ficam os disjuntores e o DPS, presos em um trilho.',
    texto:
      'O quadro guarda as proteções presas em um trilho, com só as alavancas para fora. Protege contra toque, poeira e umidade, e junta tudo em um lugar identificado. O espaço é contado em módulos: o quadro do catálogo tem lugar para 8.',
    veja: ['disjuntor', 'dps', 'string-box'],
  },

  // ------------------------------------------------------------ Sistema

  {
    id: 'off-grid',
    termo: 'Off-grid',
    curto: 'Sistema com bateria que funciona separado da rede da rua.',
    texto:
      'Off-grid quer dizer "fora da rede": as tomadas do sistema não dependem da rua, porque a energia vem da bateria. No seu plano, ele serve de backup: com a rede presente, recarrega por ela; na queda, assume sozinho. Ele não manda energia para a rua.',
    veja: ['rede-eletrica', 'inversor-hibrido'],
  },
  {
    id: 'rede-eletrica',
    termo: 'Rede elétrica',
    curto: 'A energia que chega da rua pela concessionária.',
    texto:
      'É a energia distribuída pela concessionária, que chega pelo medidor e alimenta o quadro da casa. No Rio, a tomada comum é de 127 V. No simulador, a rede entra no inversor pela entrada CA, e a saída do inversor nunca volta para ela.',
    veja: ['off-grid', 'corrente-alternada'],
  },
  {
    id: 'bivolt',
    termo: 'Bivolt',
    curto: 'Aparelho que funciona em 127 V e em 220 V.',
    texto:
      'Aparelho bivolt aceita as duas tensões, sozinho ou por uma chave seletora. O de chave precisa estar na posição certa antes de ligar. Quem diz se é bivolt é a etiqueta do aparelho.',
    veja: ['tensao'],
  },
];
