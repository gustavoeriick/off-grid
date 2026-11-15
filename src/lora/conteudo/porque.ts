// "Por quê?" de cada situação que a tela de LoRa mostra. Tarefa L4.1.
// Complementa a frase da tela (o veredito, o aviso, a melhoria) com o princípio por trás dela, sem repeti-la.
// Fonte dos fatos: docs/plano-lora.md (seção 1) e docs/especificacao/lora.md (seções 3, 4.7 a 4.10).

export interface PorQueLora {
  /** De 2 a 5 frases. */
  texto: string;
  /** Ids de GLOSSARIO_LORA relacionados. */
  termos: string[];
}

/** As situações da tela que têm "por quê?". */
export type SituacaoLora =
  | 'veredito-folga'
  | 'veredito-limite'
  | 'veredito-nao-fecha'
  | 'limite-com-caminho-raspando'
  | 'caminho-liso'
  | 'obstaculo-corta-a-linha'
  | 'zona-nao-livre'
  | 'mudar-subir-antena'
  | 'mudar-antena-de-mais-ganho'
  | 'mudar-modo-mais-lento'
  | 'rota-sem-ligacao'
  | 'rota-passa-do-limite'
  | 'sugestao-nao-fecha'
  | 'aviso-anatel-antena'
  | 'aviso-anatel-densidade'
  | 'predios-e-arvores'
  | 'consumo-em-faixa';

export const PORQUE_LORA: Record<SituacaoLora, PorQueLora> = {
  // ------------------------------------------------------------ Vereditos

  'veredito-folga': {
    texto:
      'O sinal chega pelo menos 10 dB acima do mínimo, ou seja, dez vezes mais forte que o necessário, e a zona de Fresnel está livre. Os 10 dB são a reserva para o sinal variar com o tempo; é uma escolha do projeto, não um número de norma. Mesmo assim, a conta só enxerga o relevo: se há prédios ou árvores no caminho, ponha a margem do ambiente e veja se continua fechando. É um bom sinal para ir testar em campo, não uma garantia.',
    termos: ['folga', 'zona-de-fresnel', 'margem-do-ambiente', 'teste-de-campo'],
  },
  'veredito-limite': {
    texto:
      'A conta passa, mas falta uma das duas coisas do "fecha com folga": 10 dB de sobra ou a zona de Fresnel livre. Com pouca sobra, uma variação do sinal derruba a mensagem; com o caminho raspando no terreno, a conta é menos confiável. Na prática, um enlace assim pode funcionar em um dia e falhar em outro. Veja na lista "o que mudar para fechar" o que traria a folga para cima, e teste em campo antes de comprar o resto.',
    termos: ['folga', 'zona-de-fresnel', 'veredito', 'teste-de-campo'],
  },
  'veredito-nao-fecha': {
    texto:
      'O sinal chega abaixo da sensibilidade, o mínimo que o rádio entende neste modo. A potência quase nunca é o problema: o orçamento do modo padrão é de 153 dB, e o ar livre come só 117,7 dB em 20 km. O que derruba o enlace é o que está no caminho: morro, a curva da Terra e, fora da conta, prédios e árvores. As saídas são levantar a antena, ganhar alguns dB com antena ou modo, ou desviar do obstáculo com um repetidor em lugar alto.',
    termos: ['sensibilidade', 'orcamento', 'difracao', 'repetidor'],
  },
  'limite-com-caminho-raspando': {
    texto:
      'A folga calculada é alta, mas o terreno entra na zona de Fresnel. Quando o caminho raspa em um morro, pequenas diferenças mudam muito o resultado: o mapa de relevo tem um ponto a cada 70 m, mais ou menos, e não vê árvores, casas nem prédios na crista. Uma fileira de árvores no alto do morro pode ser a diferença entre fechar e não fechar. Por isso a conta pode estar otimista, e só o teste de campo confirma.',
    termos: ['zona-de-fresnel', 'folga-em-metros', 'relevo', 'teste-de-campo'],
  },

  // ------------------------------------------------------------ O caminho

  'caminho-liso': {
    texto:
      'Em caminho liso (mar, baía, planície) não há morro, e por isso parece fácil. Mas a curva da Terra fica inteira no meio do caminho e o sinal precisa contorná-la. Com antenas a 8 m, essa perda chega a 23 dB em 20 km e a 40 dB em 40 km. Antena mais alta é o remédio: em terreno plano, com uns 30 m em 20 km e uns 58 m em 40 km, a zona de Fresnel fica livre.',
    termos: ['caminho-liso', 'curva-da-terra', 'difracao', 'zona-de-fresnel'],
  },
  'obstaculo-corta-a-linha': {
    texto:
      'O terreno passa acima da linha reta entre as antenas: não há visada. O sinal ainda chega por difração, contornando a crista, mas perde força, e a perda cresce quanto mais o morro entra na frente. Exemplo dos testes: um morro de 100 m no meio de 20 km, com antenas a 10 m, tira cerca de 34 dB. Subir a antena ajuda pouco quando o morro é muito mais alto que ela; aí a saída costuma ser um repetidor em cima do morro, que enxerga os dois lados.',
    termos: ['visada', 'difracao', 'corte-do-terreno', 'repetidor'],
  },
  'zona-nao-livre': {
    texto:
      'A linha reta entre as antenas passa livre, mas perto demais do terreno: menos de 60% da zona de Fresnel está desobstruída no pior ponto. O sinal ocupa um volume em volta da linha, e o que entra nesse volume tira força dele mesmo sem tapar a vista. Por isso o simulador não dá "fecha com folga" com a zona tomada, mesmo que a folga em dB seja alta. Antena mais alta em uma das pontas costuma resolver.',
    termos: ['zona-de-fresnel', 'folga-em-metros', 'visada'],
  },

  // ------------------------------------------------------------ O que mudar para fechar

  'mudar-subir-antena': {
    texto:
      'Antena mais alta levanta a linha entre as pontas, tira o terreno da zona de Fresnel e diminui a perda por difração. Costuma ser a mudança que mais rende quando o caminho raspa no terreno, e rende menos quando há um morro muito mais alto no meio. O custo: mastro, fixação e, em geral, cabo coaxial mais longo, que perde parte do sinal; ponha essa perda no campo "perda no cabo" e confira de novo. Trabalho em telhado e mastro é trabalho em altura: risco de queda, de raio e de encostar na rede elétrica. Mantenha a antena longe dos fios da rua.',
    termos: ['antena', 'zona-de-fresnel', 'cabo-coaxial', 'difracao'],
  },
  'mudar-antena-de-mais-ganho': {
    texto:
      'Antena de mais ganho soma dBi na conta, na transmissão e na recepção. Mas antena não cria potência: o ganho vem de concentrar o sinal. Uma antena vertical de ganho alto achata o sinal no horizonte, e as de ganho muito alto costumam ser direcionais, que precisam ficar apontadas para a outra ponta e não servem às outras direções. Acima de 6 dBi, a regra da Anatel lida pede baixar a potência o mesmo tanto, e o simulador avisa quando isso acontece.',
    termos: ['ganho', 'antena', 'radiacao-restrita'],
  },
  'mudar-modo-mais-lento': {
    texto:
      'Modo mais lento entende sinal mais fraco: trocar o Long Fast (−131 dBm) pelo Long Moderate (−134 dBm) dá 3 dB a mais de folga. O custo é o tempo: o Long Moderate manda 0,34 kbps contra 1,07 kbps, cerca de três vezes mais devagar, e cada mensagem ocupa o ar por mais tempo. E o modo vale para a rede inteira: todos os rádios precisam estar no mesmo modo para se entenderem. Por isso essa troca rende poucos dB e só compensa quando falta pouco.',
    termos: ['modo', 'sensibilidade', 'folga'],
  },

  // ------------------------------------------------------------ Rotas e repetidores

  'rota-sem-ligacao': {
    texto:
      'O simulador só conta as ligações que você desenhou: cada linha do mapa é um enlace direto, e não há rádio imaginário no meio. Sem uma sequência de linhas de uma casa à outra, não há rota. Ligue as duas casas, direto ou por um repetidor, para ver a conta.',
    termos: ['rota', 'enlace', 'repetidor'],
  },
  'rota-passa-do-limite': {
    texto:
      'Cada rádio no meio do caminho repete a mensagem uma vez, e o Meshtastic só deixa repetir até o limite configurado: 3 por padrão, 7 no máximo. A rota desenhada precisa de mais rádios no meio do que o limite deste projeto, e a mensagem pararia antes de chegar. Dá para subir o limite na configuração da rede, ou procurar um lugar mais alto que pule um dos trechos. Mais saltos também ocupam mais o ar para todos.',
    termos: ['salto', 'rota', 'meshtastic'],
  },
  'sugestao-nao-fecha': {
    texto:
      'O repetidor não amplifica: ele recebe a mensagem inteira e a transmite de novo. Para servir, ele precisa fechar sozinho com cada uma das pontas, e a busca não achou lugar que faça as duas coisas. As saídas são dois repetidores em sequência, procurando de novo entre o melhor lugar e a ponta que ficou sem ligação, ou antena mais alta nas pontas.',
    termos: ['repetidor', 'salto', 'relevo'],
  },

  // ------------------------------------------------------------ Regra da Anatel

  'aviso-anatel-antena': {
    texto:
      'Na cópia do Ato nº 14.448/2017 que o simulador leu, a potência na saída do transmissor vai até 1 W (30 dBm), e com antena de ganho acima de 6 dBi ela cai o mesmo tanto que o ganho passar de 6. Exemplo: com antena de 9 dBi, o limite fica em 27 dBm. O texto vigente ainda não foi conferido, e por isso o simulador avisa e não bloqueia.',
    termos: ['radiacao-restrita', 'potencia', 'ganho', 'homologacao'],
  },
  'aviso-anatel-densidade': {
    texto:
      'A mesma cópia do ato limita também a potência em cada pedacinho da faixa: 8 dBm em cada 3 kHz. Um sinal mais estreito concentra a potência em menos pedacinhos, e por isso o limite cai nos modos de banda estreita. Supondo o sinal espalhado por igual na banda, a conta dá cerca de 27,2 dBm em 250 kHz (Long Fast) e 24,2 dBm em 125 kHz (Long Moderate). É uma estimativa, e o texto vigente da regra ainda não foi conferido.',
    termos: ['radiacao-restrita', 'potencia', 'modo'],
  },

  // ------------------------------------------------------------ Limites do simulador

  'predios-e-arvores': {
    texto:
      'O simulador usa um mapa de relevo público, que só tem a altura do chão, com um ponto a cada 70 m, mais ou menos. Prédios, árvores, muros e o telhado do vizinho não estão nele, e na cidade o resultado real costuma ser pior que o previsto. Relatos de uso real, de fóruns e guias, falam em 1 a 3 km em cidade sem visada. A margem do ambiente serve para pôr esse desconto na conta: aumente até o enlace deixar de fechar e veja quanta reserva ele tem. O número certo só o teste de campo dá.',
    termos: ['margem-do-ambiente', 'relevo', 'teste-de-campo'],
  },
  'consumo-em-faixa': {
    texto:
      'Não há medição publicada do consumo de um rádio de baixo consumo funcionando como repetidor. O número vem de um guia de montagem: de 5 a 20 mA com pouco tráfego e de 15 a 40 mA com tráfego moderado, e o próprio guia diz que é estimativa. Por isso o simulador faz a conta nas duas pontas, de 5 e de 40 mA, e mostra uma faixa. Com o rádio na mão, meça o consumo e ponha o seu número nos dois campos.',
    termos: ['repetidor-solar', 'repetidor'],
  },
};
