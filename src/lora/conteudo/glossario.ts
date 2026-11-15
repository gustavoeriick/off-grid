// Glossário do ambiente de rádio LoRa. Tarefa L4.1.
// `curto` cabe em uma dica ao passar o ponteiro; `texto` é o parágrafo do painel do termo.
// Fonte dos fatos: docs/plano-lora.md (seção 1, a pesquisa) e docs/especificacao/lora.md.
// Números: só os da especificação e do plano, ou contas simples a partir deles, mostradas no texto.
// Onde a tela já tem uma dica curta (GLOSSARIO de src/lora/ui/textos.ts), o `curto` diz a mesma coisa.

export interface Termo {
  id: string;
  termo: string;
  /** Uma frase. */
  curto: string;
  /** Um parágrafo, de 3 a 6 frases. */
  texto: string;
  /** Ids de outros termos relacionados. */
  veja?: string[];
}

export const GLOSSARIO_LORA: Termo[] = [
  // ------------------------------------------------------------ O que é

  {
    id: 'lora',
    termo: 'LoRa',
    curto: 'Um tipo de rádio digital que alcança longe gastando pouca energia, em troca de mandar devagar.',
    texto:
      'LoRa vem do inglês long range, longo alcance. É um jeito de transmitir que troca velocidade por alcance: mandando devagar, o rádio consegue entender um sinal muito fraco. Por isso ele serve para mensagens de texto curtas e para posição, não para voz nem internet. No Brasil, o LoRa usa as faixas de 902 a 907,5 MHz e de 915 a 928 MHz, sem licença de operação, mas o aparelho precisa ser homologado pela Anatel.',
    veja: ['meshtastic', 'modo', 'frequencia', 'radiacao-restrita'],
  },
  {
    id: 'meshtastic',
    termo: 'Meshtastic',
    curto: 'O firmware (o programa que roda dentro do rádio) mais usado para conversar entre pessoas por LoRa.',
    texto:
      'Firmware é o programa que vem gravado dentro do aparelho. O Meshtastic é o firmware de LoRa mais usado para conversa entre pessoas, e é o da comunidade brasileira. Ele forma uma rede em malha: cada rádio repassa as mensagens dos outros. O simulador usa a tabela de modos e o limite de saltos do Meshtastic. Existe outro firmware para os mesmos rádios, o MeshCore, mas as duas redes não se falam.',
    veja: ['rede-em-malha', 'modo', 'salto', 'regiao'],
  },
  {
    id: 'radio',
    termo: 'Rádio (o aparelho)',
    curto: 'A plaquinha que transmite e recebe as mensagens; cada ponto do mapa é um rádio.',
    texto:
      'Neste simulador, rádio é o aparelho de LoRa: uma placa pequena com o chip de rádio, na versão de 915 MHz, e um conector para a antena. Ele pode ser de mão, ficar fixo no telhado ou servir de repetidor em um lugar alto. Na compra, confira a faixa (915 MHz) e a homologação da Anatel. Nunca ligue o rádio sem a antena conectada: transmitir sem antena pode queimar o transmissor.',
    veja: ['antena', 'conector', 'homologacao', 'repetidor'],
  },

  // ------------------------------------------------------------ Frequência e configuração

  {
    id: 'frequencia',
    termo: 'Frequência e faixa de 915 MHz',
    curto: 'Quantas vezes por segundo a onda de rádio oscila; o LoRa no Brasil fica perto de 915 milhões de vezes por segundo.',
    texto:
      'Frequência é quantas vezes por segundo a onda oscila, medida em hertz (Hz); 1 MHz é um milhão de hertz. Faixa é o trecho de frequências em que o rádio pode trabalhar. Para LoRa no Brasil há duas: de 902 a 907,5 MHz e de 915 a 928 MHz. A frequência entra na perda no ar livre, mas entre as duas faixas a diferença é de só 0,2 dB. O simulador faz a conta no meio da faixa escolhida: 921,5 MHz ou 904,75 MHz.',
    veja: ['regiao', 'perda-no-ar-livre', 'radiacao-restrita'],
  },
  {
    id: 'regiao',
    termo: 'Região do rádio (ANZ e BR_902)',
    curto: 'A configuração do Meshtastic que escolhe a faixa de frequência; rádios em regiões diferentes não se falam.',
    texto:
      'No Meshtastic, a região diz em que faixa o rádio trabalha. Para o Brasil servem duas: ANZ, de 915 a 928 MHz, e BR_902, de 902 a 907,5 MHz, as duas com até 30 dBm no firmware. A comunidade brasileira (MeshBrasil) padronizou a ANZ, e ela é o padrão do simulador. Rádios em regiões diferentes não se falam: combine a mesma região em todos os rádios da sua rede.',
    veja: ['frequencia', 'meshtastic', 'potencia'],
  },
  {
    id: 'modo',
    termo: 'Modo do rádio (Long Fast e os outros)',
    curto: 'A configuração que troca velocidade por alcance: modo mais lento entende sinal mais fraco.',
    texto:
      'O Meshtastic tem modos prontos, do Short Turbo ao Long Moderate. O padrão é o Long Fast: manda 1,07 kbps (mil bits por segundo) e entende sinais de até −131 dBm. O Long Moderate manda 0,34 kbps, cerca de três vezes mais devagar, e entende até −134 dBm: 3 dB a mais na folga. O Short Turbo é o mais rápido, 21,88 kbps, e só entende até −118 dBm. Mensagem mais lenta ocupa o ar por mais tempo, e todos os rádios da rede precisam estar no mesmo modo para se entenderem.',
    veja: ['sensibilidade', 'folga', 'orcamento'],
  },

  // ------------------------------------------------------------ Potência e decibel

  {
    id: 'decibel',
    termo: 'Decibel (dB)',
    curto: 'Uma unidade de proporção em que somar dB é multiplicar a potência: +3 dB dobra, +10 dB multiplica por dez.',
    texto:
      'O decibel não mede uma quantidade, e sim quantas vezes uma coisa é maior que outra. Cada 3 dB a mais dobra a potência e cada 10 dB a mais multiplica por dez; −3 dB é a metade. Com isso, a conta do enlace vira só somas e subtrações, mesmo quando o sinal enfraquece bilhões de vezes no caminho. Exemplo: 30 dB de folga quer dizer que chega mil vezes o mínimo que o rádio entende. As variantes dizem a referência: dBm compara com 1 milésimo de watt, e dBi compara com uma antena ideal.',
    veja: ['potencia', 'ganho', 'folga'],
  },
  {
    id: 'potencia',
    termo: 'Potência (dBm)',
    curto: 'Potência do rádio, em dBm (decibel-miliwatt). 22 dBm são cerca de 160 milésimos de watt. A regra da Anatel limita o máximo.',
    texto:
      'O dBm conta a potência em decibéis acima de 1 milésimo de watt (1 mW). A tabela para guardar de cabeça: 0 dBm é 1 mW; cada 3 dBm a mais dobra; cada 10 dBm a mais multiplica por dez. Assim, 10 dBm são 10 mW, 20 dBm são 100 mW, 22 dBm são cerca de 160 mW e 30 dBm são 1 W. Os rádios comuns de LoRa transmitem com 22 dBm, o padrão do simulador. A regra da Anatel, ainda não conferida no texto vigente, fala em até 1 W na saída do transmissor.',
    veja: ['decibel', 'sensibilidade', 'regiao', 'radiacao-restrita'],
  },

  // ------------------------------------------------------------ Antena e cabo

  {
    id: 'antena',
    termo: 'Antena',
    curto: 'A peça que lança o sinal no ar e o recolhe; junto com a altura, é o que mais muda o resultado.',
    texto:
      'A antena transforma o sinal elétrico do rádio em onda no ar, e o contrário na recepção. Junto com a altura em que fica, é a peça que mais muda o resultado de um enlace. Um aparelho de mão usa uma antena curta presa nele; um rádio fixo pode usar uma antena externa no telhado ou em um mastro, ligada por cabo. A altura da antena, no simulador, é contada a partir do terreno embaixo dela. Nunca ligue o rádio sem a antena conectada: pode queimar o transmissor.',
    veja: ['ganho', 'cabo-coaxial', 'conector', 'visada'],
  },
  {
    id: 'ganho',
    termo: 'Ganho da antena (dBi)',
    curto: 'Ganho da antena, em dBi: o quanto ela concentra o sinal na direção certa. Antena maior costuma ter ganho maior.',
    texto:
      'Antena não cria potência: o ganho vem de concentrar o sinal em algumas direções e tirar das outras. O dBi compara com uma antena ideal, que espalharia o sinal igual para todo lado. Antenas comuns de LoRa têm de 3 a 6 dBi; o simulador começa com 0 dBi, a suposição da tabela do Meshtastic. Como a mesma antena transmite e recebe, um ganho maior em uma ponta melhora o enlace nos dois sentidos. Acima de 6 dBi, a regra da Anatel lida pede baixar a potência o mesmo tanto.',
    veja: ['antena', 'decibel', 'radiacao-restrita'],
  },
  {
    id: 'cabo-coaxial',
    termo: 'Cabo coaxial e perda no cabo',
    curto: 'Perda no cabo, em dB (decibel): o que o cabo entre o rádio e a antena consome do sinal. Cabo longo ou fino perde mais.',
    texto:
      'Cabo coaxial é o cabo de antena: um fio no centro, uma camada isolante e uma malha em volta. Ele leva o sinal do rádio até uma antena que fica longe, como no alto de um mastro. Todo cabo consome parte do sinal, mais quanto mais longo e mais fino ele for, e essa perda vale na transmissão e na recepção. O simulador não calcula a perda: você digita, em dB, o valor do cabo que vai usar, a partir do que o fabricante informa. Subir a antena com um cabo muito longo pode devolver ao cabo parte do que a altura ganhou.',
    veja: ['antena', 'conector', 'decibel'],
  },
  {
    id: 'conector',
    termo: 'Conector',
    curto: 'A peça na ponta do cabo ou da antena que encaixa no rádio; os dois lados precisam ser do mesmo tipo.',
    texto:
      'Rádio, cabo e antena se ligam por conectores, e cada lado precisa casar com o outro: mesmo tipo e o par certo de macho e fêmea. Os nomes que aparecem nos anúncios são SMA, RP-SMA, N e o pequeno IPEX (ou U.FL), que fica dentro da placa. SMA e RP-SMA têm a mesma rosca e parecem iguais, mas o pino do centro fica do lado oposto e a ligação não funciona. Confira o conector do rádio e o da antena antes de comprar, e não ligue o rádio enquanto a antena não estiver encaixada.',
    veja: ['cabo-coaxial', 'antena', 'radio'],
  },

  // ------------------------------------------------------------ O enlace e o caminho

  {
    id: 'enlace',
    termo: 'Enlace',
    curto: 'Enlace: a ligação de rádio entre dois pontos.',
    texto:
      'Enlace é a ligação de rádio entre dois pontos, sem nada no meio. A conta do enlace parte da potência do transmissor, soma os ganhos das antenas, desconta as perdas (cabos, ar livre, relevo e a margem do ambiente) e compara o que chega com o mínimo que o rádio entende. A diferença é a folga, e dela sai o veredito. No mapa, cada linha entre dois pontos é um enlace, colorido pelo veredito.',
    veja: ['folga', 'veredito', 'orcamento', 'perda-no-ar-livre'],
  },
  {
    id: 'orcamento',
    termo: 'Orçamento do enlace',
    curto: 'Quanto de perda o sinal aguenta entre um rádio e o outro antes de o receptor deixar de entender.',
    texto:
      'O orçamento é a diferença entre a potência que sai do transmissor e o sinal mais fraco que o receptor entende. No modo padrão, Long Fast, com 22 dBm e antena sem ganho, a tabela oficial do Meshtastic dá 153 dB. Toda perda no caminho sai desse orçamento, e o que sobra é a folga. Em 20 km sem nada no caminho, o ar livre come 117,7 dB e sobram cerca de 35 dB; em 40 km, sobram cerca de 29 dB. É por isso que o problema do LoRa quase nunca é a potência, e sim o que está no caminho.',
    veja: ['perda-no-ar-livre', 'folga', 'sensibilidade', 'modo'],
  },
  {
    id: 'visada',
    termo: 'Visada',
    curto: 'Quando a linha reta entre as duas antenas passa livre, sem morro nem curva da Terra no meio.',
    texto:
      'Ter visada quer dizer que uma antena "enxerga" a outra: a linha reta entre elas não bate em nada. Visada é necessária para o sinal chegar forte, mas não basta, porque o sinal ocupa um volume em volta da linha, a zona de Fresnel. Sem visada o sinal ainda pode chegar, contornando o obstáculo, mas perde força. Relatos de uso real, de fóruns e guias, falam em 10 a 20 km com visada e antena comum, contra 1 a 3 km na cidade sem visada.',
    veja: ['zona-de-fresnel', 'difracao', 'curva-da-terra'],
  },
  {
    id: 'perda-no-ar-livre',
    termo: 'Perda no ar livre',
    curto: 'O quanto o sinal enfraquece só por se espalhar com a distância, mesmo sem nada no caminho.',
    texto:
      'Mesmo no vazio, o sinal se espalha como a luz de uma lâmpada e fica mais fraco longe dela. A conta padrão é 32,45 + 20·log(MHz) + 20·log(km). Em 915 MHz, 20 km dão 117,7 dB e 40 km dão 123,7 dB. Repare: dobrar a distância custa só 6 dB a mais. É uma perda que sempre existe; o relevo e os prédios vêm por cima dela.',
    veja: ['decibel', 'orcamento', 'frequencia', 'difracao'],
  },
  {
    id: 'relevo',
    termo: 'Relevo',
    curto: 'A altura do terreno ao longo do caminho: morros, serras, vales; é o que o simulador enxerga.',
    texto:
      'Relevo é o desenho do terreno: morros, serras, vales e planícies. O simulador lê a altitude de um mapa de relevo público, com um ponto a cada 70 m, mais ou menos. Por isso ele não enxerga um morro muito estreito, e não enxerga prédios nem árvores. Um maciço entre dois pontos pode bloquear tudo; um morro com vista para os dois pode ser o lugar ideal para um repetidor.',
    veja: ['corte-do-terreno', 'difracao', 'margem-do-ambiente', 'repetidor'],
  },
  {
    id: 'corte-do-terreno',
    termo: 'Corte do terreno',
    curto: 'O gráfico que mostra o terreno de lado, de uma antena à outra, com a linha entre elas e a zona de sinal.',
    texto:
      'O corte do terreno é como se o chão fosse fatiado ao longo do enlace e visto de lado. A parte cheia é o terreno, já com a curva da Terra somada. A reta é a linha entre as duas antenas, e a faixa em volta dela é a zona de Fresnel, com a parte mais escura (60%) que precisa ficar livre. O pior ponto fica marcado, e passar o ponteiro mostra a distância, a altitude e a folga em metros em cada lugar.',
    veja: ['relevo', 'zona-de-fresnel', 'curva-da-terra', 'folga'],
  },
  {
    id: 'curva-da-terra',
    termo: 'Curva da Terra',
    curto: 'Em enlace longo, a Terra redonda levanta o chão no meio do caminho e chega a tapar a linha entre as antenas.',
    texto:
      'Como a Terra é redonda, o meio do caminho fica "mais alto" que a linha reta entre as pontas. O ar desvia um pouco o sinal para baixo e ajuda, e por isso a conta usa um raio da Terra maior que o real, com o fator 4/3. No meio de 20 km, o chão sobe 5,9 m; no meio de 40 km, 23,5 m: dobrar a distância quadruplica a altura. No corte do terreno, a curva já vem somada ao terreno.',
    veja: ['corte-do-terreno', 'caminho-liso', 'zona-de-fresnel'],
  },
  {
    id: 'zona-de-fresnel',
    termo: 'Zona de Fresnel',
    curto: 'Zona de Fresnel: um espaço em forma de charuto em volta da linha reta entre as antenas. Se algo entra nela, o sinal enfraquece mesmo sem tapar a linha.',
    texto:
      'O sinal de rádio não viaja só pela linha reta: ele ocupa um volume em forma de charuto em volta dela, mais gordo no meio. Pela regra clássica, pelo menos 60% desse raio precisa estar sem obstáculo. Em 915 MHz, no meio de 20 km, o raio é de 40,5 m e os 60% dão 24,3 m; no meio de 40 km, 57,3 m e 34,4 m. Somando a curva da Terra, em terreno plano as duas antenas precisariam de uns 30 m para 20 km e uns 58 m para 40 km. A tela também chama esse espaço de zona de sinal.',
    veja: ['visada', 'folga-em-metros', 'difracao', 'corte-do-terreno'],
  },
  {
    id: 'folga-em-metros',
    termo: 'Folga do caminho (em metros)',
    curto: 'Quantos metros a linha entre as antenas passa acima do terreno em cada ponto; negativa quando o terreno corta a linha.',
    texto:
      'No corte do terreno, a folga de um ponto é a altura da linha entre as antenas menos a altura do terreno com a curva da Terra. Quando ela é negativa, o terreno corta a linha. Quando é positiva mas menor que 60% do raio da zona de Fresnel, o caminho está raspando. O pior ponto é o de menor sobra em relação a esses 60%, e é ele que o texto do veredito aponta. Não confunda com a folga do sinal, que é em dB.',
    veja: ['zona-de-fresnel', 'corte-do-terreno', 'folga'],
  },
  {
    id: 'difracao',
    termo: 'Difração',
    curto: 'O sinal contorna a borda de um obstáculo e chega do outro lado, mas mais fraco.',
    texto:
      'Difração é o sinal "dobrando" na crista de um morro ou na curva da Terra e chegando ao outro lado, mais fraco. Por isso caminho sem zona livre não é caminho fechado: perde-se força, e a conta diz quanto. O simulador usa o método da norma ITU-R P.526, da União Internacional de Telecomunicações. Exemplo dos testes: um morro de 100 m no meio de 20 km, com antenas a 10 m, tira cerca de 34 dB.',
    veja: ['zona-de-fresnel', 'relevo', 'caminho-liso', 'visada'],
  },
  {
    id: 'caminho-liso',
    termo: 'Caminho liso',
    curto: 'Mar, baía ou planície: sem morro no caminho, quem atrapalha é a curva da Terra.',
    texto:
      'Parece o melhor caso, mas em caminho liso a curva da Terra fica inteira no meio do caminho e a perda é maior do que parece. Com antenas a 8 m, sobre o mar, ela tira 23 dB em 20 km e 40 dB em 40 km. No modo padrão, com 22 dBm e sem ganho, sobram 12 dB em 20 km e faltam 10 dB em 40 km. Ou seja: de telhado a telhado sobre a água, 20 km fecham e 40 km não.',
    veja: ['curva-da-terra', 'difracao', 'folga'],
  },

  // ------------------------------------------------------------ O resultado

  {
    id: 'sensibilidade',
    termo: 'Sensibilidade',
    curto: 'Sensibilidade: o sinal mais fraco, em dBm, que o rádio ainda consegue entender neste modo.',
    texto:
      'A sensibilidade é o piso: abaixo dela o rádio não entende a mensagem. Ela é um número negativo em dBm, e quanto mais negativo, melhor. No Long Fast é −131 dBm, que vem da tabela do Meshtastic (22 dBm menos os 153 dB do orçamento). Modos mais lentos entendem sinais mais fracos: o Long Moderate chega a −134 dBm.',
    veja: ['modo', 'folga', 'potencia'],
  },
  {
    id: 'folga',
    termo: 'Folga do sinal (em dB)',
    curto: 'Folga: o quanto o sinal que chega passa do mínimo que o rádio entende, em dB. Quanto maior, mais seguro.',
    texto:
      'A folga é o que chega ao receptor menos a sensibilidade do rádio. Abaixo de zero, a mensagem não é entendida. O sinal real varia com o tempo e com o que se mexe no caminho, e a folga é a reserva para essas variações. O simulador pede 10 dB para dizer "fecha com folga"; esse número é uma escolha do projeto, não de norma. Quando os dois rádios são diferentes, vale a menor folga entre os dois sentidos.',
    veja: ['sensibilidade', 'veredito', 'decibel', 'margem-do-ambiente'],
  },
  {
    id: 'veredito',
    termo: 'Veredito',
    curto: 'A resposta do simulador em palavras: fecha com folga, fecha no limite ou não fecha.',
    texto:
      '"Fecha com folga" quer dizer folga de 10 dB ou mais e zona de Fresnel livre: vale a pena testar em campo com boa chance. "Fecha no limite" quer dizer que a conta passa, mas sem sobra ou com o caminho raspando: pode funcionar em um dia e falhar em outro. "Não fecha" quer dizer que o sinal chega abaixo do que o rádio entende. O texto do veredito sempre diz o motivo, e nenhum dos três substitui o teste de campo.',
    veja: ['folga', 'zona-de-fresnel', 'teste-de-campo'],
  },
  {
    id: 'margem-do-ambiente',
    termo: 'Margem do ambiente',
    curto: 'Uma perda que você escolhe, de 0 a 40 dB, para o que o relevo não mostra: prédios, árvores e paredes.',
    texto:
      'O simulador enxerga o relevo, mas não prédios, árvores, paredes nem o telhado da própria casa. A margem do ambiente é um desconto que você põe na conta para representar isso, de 0 a 40 dB, e vale para todos os enlaces do projeto. Ela começa em zero, e o simulador não sugere um número: escolha pelo que existe entre os pontos. Um jeito honesto de usar é perguntar "quanto de margem o enlace aguenta e ainda fecha?" e comparar com o que o teste de campo mostrar.',
    veja: ['relevo', 'folga', 'teste-de-campo'],
  },

  // ------------------------------------------------------------ Rede

  {
    id: 'repetidor',
    termo: 'Repetidor',
    curto: 'Repetidor: um rádio igual aos outros, posto por você em um lugar alto, que recebe a mensagem inteira e a transmite de novo. Ele não amplifica o sinal.',
    texto:
      'O repetidor não aumenta o sinal: ele recebe a mensagem inteira, e só depois a transmite de novo, com a potência dele. Por isso cada trecho, da casa ao repetidor e do repetidor à outra casa, precisa fechar sozinho. Ele serve quando o caminho direto tem um morro no meio e existe um lugar alto que enxerga as duas pontas. No Meshtastic, qualquer rádio da rede repassa mensagens; chamar de repetidor é dizer para que ele foi posto ali.',
    veja: ['salto', 'rota', 'repetidor-solar', 'rede-em-malha'],
  },
  {
    id: 'salto',
    termo: 'Salto e limite de saltos',
    curto: 'Um salto é uma repetição da mensagem por outro rádio da rede; o limite diz quantas repetições a mensagem aguenta.',
    texto:
      'Cada rádio no meio do caminho que recebe a mensagem e a transmite de novo conta um salto. Para a mensagem não ficar rodando para sempre, o Meshtastic limita os saltos: 3 por padrão e 7 no máximo. No simulador, uma rota com mais rádios no meio do que o limite do projeto não serve: a mensagem pararia antes de chegar. Mais saltos levam a mensagem mais longe, mas ocupam mais o ar.',
    veja: ['rota', 'repetidor', 'meshtastic'],
  },
  {
    id: 'rota',
    termo: 'Rota',
    curto: 'O caminho que a mensagem faz de uma casa à outra, de rádio em rádio.',
    texto:
      'A rota é a sequência de enlaces que a mensagem percorre, por exemplo casa, repetidor e a outra casa. Ela vale o que vale o trecho mais fraco: se um trecho não fecha, a rota não fecha. O simulador escolhe, entre as rotas que cabem no limite de saltos, a de melhor veredito, e no empate a de maior folga. A tela mostra a rota de cada par de pontos do tipo casa.',
    veja: ['salto', 'enlace', 'veredito'],
  },
  {
    id: 'rede-em-malha',
    termo: 'Rede em malha',
    curto: 'Uma rede em que cada rádio repassa as mensagens dos outros, sem central.',
    texto:
      'Em uma rede em malha não há antena central nem operadora: cada rádio recebe e repassa as mensagens que ouve. Assim a mensagem pode ir de uma casa a outra por caminhos diferentes, conforme os rádios que estão ligados. Rádio de vizinho que esteja na mesma rede também ajuda a levar a mensagem. É isso que deixa um repetidor em lugar alto servir a várias casas ao mesmo tempo.',
    veja: ['meshtastic', 'repetidor', 'rota'],
  },

  // ------------------------------------------------------------ Regras e prática

  {
    id: 'homologacao',
    termo: 'Homologação da Anatel',
    curto: 'A aprovação da Anatel que o aparelho de rádio precisa ter para ser usado no Brasil.',
    texto:
      'Homologação é a certificação da Anatel de que um modelo de aparelho atende às regras brasileiras. Para LoRa não é preciso licença para operar, mas o rádio precisa ser homologado. O simulador não diz se um aparelho é homologado; isso se confere na Anatel, pelo número de homologação, antes de comprar. Antena e potência também precisam ficar dentro do limite da regra.',
    veja: ['radiacao-restrita', 'potencia', 'radio'],
  },
  {
    id: 'radiacao-restrita',
    termo: 'Radiação restrita',
    curto: 'A categoria da Anatel dos rádios de baixa potência, como o LoRa: sem licença, mas com aparelho homologado e sem proteção contra interferência.',
    texto:
      'Radiação restrita é a categoria da Anatel em que entram aparelhos de baixa potência, como o LoRa nas faixas de 902 a 907,5 MHz e 915 a 928 MHz. Não é preciso licença de operação, mas o aparelho precisa ser homologado e seguir os limites de potência e de antena. Esses aparelhos também não têm proteção contra interferência: se outro equipamento da mesma faixa atrapalhar, a regra não garante o seu uso. A regra está no Ato nº 14.448/2017, e o texto vigente ainda não foi conferido pelo simulador.',
    veja: ['homologacao', 'potencia', 'ganho', 'frequencia'],
  },
  {
    id: 'repetidor-solar',
    termo: 'Repetidor solar',
    curto: 'Um repetidor que se alimenta de uma placa solar pequena e uma bateria, para ficar sozinho em um lugar alto.',
    texto:
      'Lugar alto costuma ficar longe de tomada, por isso o repetidor leva uma placa solar pequena, uma bateria e uma caixa à prova de chuva. O simulador faz a mesma conta de autonomia do simulador solar: quanto o rádio gasta por dia, quanto de placa repõe isso no pior mês e quanto de bateria segura os dias sem sol. Com 5 a 40 mA de consumo e 3 dias sem sol, dá placa de 0,14 a 1,13 W e bateria de 1,48 a 11,84 Wh. São mínimos: placa e bateria de verdade levam folga.',
    veja: ['repetidor', 'teste-de-campo'],
  },
  {
    id: 'teste-de-campo',
    termo: 'Teste de campo',
    curto: 'Levar dois rádios aos lugares de verdade e ver se a mensagem passa, antes de comprar e instalar o resto.',
    texto:
      'O simulador prevê o relevo, não a cidade; só o teste de campo diz o que acontece de verdade. O teste mais simples é com dois rádios na mão: um fica parado em um ponto e o outro vai ao outro ponto, ou ao lugar do repetidor, mandando mensagens. O Meshtastic mostra a força do sinal recebido, que dá para comparar com o previsto. Faça isso antes de instalar qualquer coisa em telhado ou morro. Em lugar alto, vá acompanhado, evite dia de tempestade e não suba em telhado sem segurança.',
    veja: ['veredito', 'margem-do-ambiente', 'repetidor'],
  },
];

const PORID = new Map(GLOSSARIO_LORA.map((t) => [t.id, t]));

/** O termo pelo `id`, ou `undefined` se não existe. */
export function termoLora(id: string): Termo | undefined {
  return PORID.get(id);
}
