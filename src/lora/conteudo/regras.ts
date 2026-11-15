// Página "Regras da Anatel" do ambiente de LoRa. Tarefa L4.1.
// Diz só o que está na seção 3 de docs/especificacao/lora.md e na seção 1.5 de docs/plano-lora.md.
// Quando a tarefa L0.2 (conferir o texto vigente) fechar, esta página precisa ser revista junto.

export interface BlocoDeRegra {
  titulo: string;
  texto: string;
}

export const REGRAS_DA_ANATEL: BlocoDeRegra[] = [
  {
    titulo: 'Em uma frase',
    texto:
      'LoRa nas faixas de 902 a 907,5 MHz e de 915 a 928 MHz é equipamento de radiação restrita: não precisa de licença para operar, mas o rádio precisa ser homologado pela Anatel, a potência e a antena precisam ficar dentro do limite, e não há proteção contra interferência.',
  },
  {
    titulo: 'O que foi lido, e de onde',
    texto:
      'A regra está no Ato nº 14.448/2017 da Anatel, item 10. O simulador leu uma cópia desse ato com data de 06/08/2018. Para "sequência direta ou outras técnicas de modulação digital" nas duas faixas, a cópia diz: potência de pico na saída do transmissor de até 1 W, ou 30 dBm (item 10.3.2); densidade de potência de até 8 dBm em qualquer pedaço de 3 kHz da faixa (item 10.3.3); e, com antena de ganho acima de 6 dBi, a potência cai o mesmo tanto, em dB, que o ganho passar de 6 dBi (item 10.5). A cópia pede ainda largura de faixa de pelo menos 500 kHz, com dispensa para o equipamento avaliado pela potência média conduzida (itens 10.3.1 e 10.3.4.4). O simulador não faz conta com esse item.',
  },
  {
    titulo: 'O que não foi conferido',
    texto:
      'O ato foi alterado depois, pelos Atos nº 4776/2020 e nº 1306/2021, e o texto vigente não foi lido: o site da Anatel estava em manutenção quando a pesquisa foi feita, em 15/11/2026. Os limites acima podem ter mudado. Por isso o simulador não afirma limite de potência, e todo aviso de regra termina com "Confira a regra vigente na Anatel. O rádio precisa ser homologado."',
  },
  {
    titulo: 'Os dois avisos da tela',
    texto:
      'O primeiro aparece quando a potência passa de 30 dBm menos o tanto que o ganho da antena passa de 6 dBi: com antena de 9 dBi, por exemplo, o limite fica em 27 dBm. O segundo é uma estimativa a partir do limite de 8 dBm em cada 3 kHz, supondo o sinal espalhado por igual na banda do modo: dá cerca de 24,2 dBm na banda de 125 kHz, 27,2 dBm na de 250 kHz e 30 dBm na de 500 kHz. O padrão do simulador, 22 dBm com antena de 0 dBi, fica abaixo dos dois.',
  },
  {
    titulo: 'O que isso quer dizer para quem vai comprar',
    texto:
      'Compre rádio homologado pela Anatel e confira o número de homologação no site da Anatel antes de pagar. Um rádio comum transmite com 22 dBm (cerca de 0,16 W) e usa antena de 3 a 6 dBi, bem abaixo do limite lido. Antena de mais de 6 dBi pede potência menor. E como não há proteção contra interferência, se outro aparelho da mesma faixa atrapalhar, a regra não garante o seu uso.',
  },
  {
    titulo: 'O simulador avisa, não bloqueia',
    texto:
      'O campo de potência aceita de 0 a 30 dBm, e o de ganho aceita antenas acima de 6 dBi. Quando um valor passa do limite lido, a tela mostra o aviso e faz a conta mesmo assim, para você ver o efeito. A decisão e a conferência na Anatel ficam com você.',
  },
];
