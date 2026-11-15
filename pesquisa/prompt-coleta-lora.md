# Prompt de coleta de preços de rádio LoRa no Mercado Livre

Pedido do Gustavo em 15/11/2026: o simulador de rádio LoRa deve sugerir aparelhos para cada papel (aparelho de mão, rádio fixo no telhado, repetidor solar). Para isso ele precisa de um catálogo com preço, e o Mercado Livre bloqueia acesso automatizado; a coleta é feita pelo Claude in Chrome, no navegador do Gustavo.

Como usar:

1. Abra o Claude in Chrome e cole o bloco abaixo inteiro.
2. Salve a resposta em `pesquisa/precos-lora-AAAA-MM-DD.md`, com a data da coleta.
3. Avise o Claude Code: ele importa a coleta para o catálogo do ambiente de LoRa.

Se o site mostrar uma verificação de segurança, peça para continuar em ritmo mais lento.

A parte E (homologação na Anatel) é opcional: o Gustavo decidiu em 15/11/2026 que a homologação entra no simulador só como informação, sem impedir nem filtrar nenhum aparelho. Ela é a mais trabalhosa; pode ficar de fora da primeira coleta, ou rodar depois sozinha, colando o início do prompt até "PARTE A", a parte E e o formato.

```text
Preciso de uma pesquisa de preços no Mercado Livre (mercadolivre.com.br) para um projeto pessoal.

CONTEXTO
Quero montar no Brasil uma rede pequena de rádio LoRa com o firmware Meshtastic, na faixa de 915 MHz: um aparelho de mão, um rádio fixo no telhado com antena externa e, talvez, um repetidor alimentado por placa solar. Os preços e os dados que você levantar vão alimentar o catálogo de um simulador, e a sua resposta será convertida em arquivo de dados por um programa. Por isso duas coisas importam mais que tudo: seguir o formato pedido e nunca completar um dado que não esteja na página.

COMO PESQUISAR
- Para cada busca da lista, abra https://lista.mercadolivre.com.br/ seguido dos termos separados por hífen (exemplo: https://lista.mercadolivre.com.br/heltec-lora-32-v3-915mhz), ou digite os termos na busca do site. Use só a primeira página, na ordenação padrão.
- Registre os primeiros anúncios que servem, até a quantidade indicada em cada parte. Serve o anúncio de produto novo, de vendedor no Brasil (ignore "Compra Internacional") e que bate com a especificação pedida. Pule os demais e informe quantos pulou e por quê.
- FREQUÊNCIA: no Brasil só serve a versão de 915 MHz (às vezes anunciada como 902-928 MHz ou 863-928 MHz). Anúncio de 433 MHz ou de 868 MHz não serve: pule e conte entre os pulados. Se o anúncio não disser a frequência, registre e escreva "frequência não informada".
- Abra o anúncio individual sempre que faltar na listagem um dado marcado como OBRIGATÓRIO. Nos rádios e nas antenas isso quase sempre será necessário: os dados ficam na ficha técnica ou na descrição.
- Preço: copie o preço principal do anúncio. Se houver um preço menor no Pix, anote os dois. Anote também o preço riscado, se houver.
- Se um dado não estiver na página, escreva "não informado". Não complete com o que você sabe do produto e não estime: esses números viram orçamento e conta de alcance, e um campo vazio me serve mais do que um valor provável.
- Só leitura: não faça login, não adicione nada ao carrinho, não envie perguntas a vendedores. Se aparecer captcha ou tela de login, pare e me avise.

PARTE A - rádios (até 4 anúncios por busca)
A1. Placa com tela, para usar como aparelho de mão. Buscas: heltec wifi lora 32 v3 915mhz | heltec v4 lora 915mhz | lilygo t-beam 915mhz | lilygo t-echo 915mhz | lilygo t-deck 915mhz
A2. Placa de baixo consumo, para rádio fixo ou repetidor. Buscas: rak wisblock rak4631 | rak19007 rak4631 kit | heltec t114 915mhz | seeed xiao nrf52840 sx1262
A3. Aparelho pronto, com caixa e bateria. Buscas: sensecap t1000-e | rak wismesh pocket | meshtastic 915mhz | radio lora meshtastic
    OBRIGATÓRIO em A1, A2 e A3: marca e modelo exatos; frequência; chip de rádio (SX1262, SX1276 ou outro); potência de transmissão em dBm ou em mW, se constar; vem com antena? qual o ganho dela em dBi, se constar; conector da antena (SMA, IPEX/U.FL ou outro); vem com bateria? de quantos mAh; tem GPS; vem com caixa; o anúncio cita homologação da Anatel? Se citar, copie o número.

PARTE B - antenas de 915 MHz (até 3 anúncios por busca)
B1. Antena curta para o aparelho de mão. Buscas: antena 915mhz sma | antena lora 915mhz 3dbi
B2. Antena externa para telhado ou mastro. Buscas: antena omni 915mhz fibra de vidro | antena lora 915mhz 6dbi externa | antena lora 915mhz 8dbi | antena colinear 900mhz
    OBRIGATÓRIO em B1 e B2: marca e modelo; faixa de frequência; ganho em dBi; conector e se é macho ou fêmea (SMA, RP-SMA, N); comprimento da antena; serve para uso externo (à prova de chuva)? vem com suporte de fixação? vem com cabo, e de quantos metros?

PARTE C - cabos e conectores (até 3 anúncios por busca)
C1. Cabo coaxial de baixa perda, com conectores. Buscas: cabo coaxial lmr400 n macho | cabo rgc213 n macho 10 metros | cabo lmr240 sma n | cabo rg58 sma macho 5 metros
    OBRIGATÓRIO: tipo do cabo (LMR400, RGC213, LMR240, RG58...); comprimento; conector de cada ponta e se é macho ou fêmea; preço por metro calculado; perda em dB por metro na faixa de 900 MHz, se o anúncio informar.
C2. Adaptadores e rabichos. Buscas: pigtail ipex sma femea | adaptador n femea sma macho | pigtail n femea sma macho
    OBRIGATÓRIO: conector de cada ponta; comprimento.
C3. Proteção contra raio para a antena. Busca: centelhador coaxial n 900mhz
    OBRIGATÓRIO: conectores; faixa de frequência.

PARTE D - repetidor solar (até 3 anúncios por busca)
D1. Repetidor pronto. Buscas: repetidor meshtastic solar | rak wismesh repeater | sensecap solar node p1
    OBRIGATÓRIO: os mesmos de A, mais a potência da placa solar (W) e a capacidade da bateria (mAh ou Wh).
D2. Placa solar pequena. Buscas: painel solar 6v 6w | painel solar 5v 10w usb | mini painel solar 6v 3w
    OBRIGATÓRIO: tensão (V); potência (W); medidas; saída (fio, USB).
D3. Bateria e carregador. Buscas: bateria 18650 3000mah | bateria lifepo4 3.2v 6000mah | modulo carregador solar litio mppt cn3791 | suporte bateria 18650 4 celulas
    OBRIGATÓRIO: tensão (V); capacidade (mAh); marca; se a célula tem proteção (BMS).
D4. Caixa para ficar ao tempo. Buscas: caixa hermetica ip65 pequena | caixa patola ip65 antena
    OBRIGATÓRIO: medidas internas; grau de proteção (IP).

PARTE E - homologação na Anatel (para cada marca e modelo de rádio registrado nas partes A e D1)
No Brasil, rádio que transmite precisa ser homologado pela Anatel. Para cada modelo de rádio que você registrou:
- Procure o sistema público de consulta de produtos homologados da Anatel (busque "Anatel consulta produtos homologados" e use só a página oficial, em anatel.gov.br ou sistemas.anatel.gov.br). Pesquise pelo modelo e pelo fabricante.
- Registre: se achou; o número de homologação; o nome do fabricante e do modelo como aparecem lá; a data de validade, se constar; e o endereço da página de onde tirou.
- Se o sistema pedir login, tiver captcha, estiver fora do ar ou não achar o modelo, escreva exatamente isso. "Não achei" é uma resposta útil; não deduza que o produto é ou não é homologado.

FORMATO DA RESPOSTA
Entregue tudo em um único bloco de código, em Markdown:
- Primeira linha: # Preços de rádio LoRa no Mercado Livre - coleta em AAAA-MM-DD
- Para cada item (A1, A2, ...), um título no formato "## A1 - Placa com tela" e uma tabela com estas colunas, nesta ordem:
  | Busca | Título do anúncio | Marca e modelo | Especificações | Preço (R$) | Preço no Pix (R$) | Preço riscado (R$) | Frete | Vendedor | Loja oficial? | Vendidos e nota | Link |
- "Especificações" traz os dados OBRIGATÓRIOS do item, separados por ponto e vírgula, cada um no formato "nome: valor" (exemplo: "frequência: 915 MHz; chip: SX1262; potência: 22 dBm; antena: sim, ganho não informado").
- "Link" é o endereço do anúncio sem os parâmetros de rastreio (corte tudo a partir de "?" ou "#").
- Abaixo de cada tabela, uma linha "Pulados: N (motivos)".
- Para a parte E, um título "## E - Homologação na Anatel" e uma tabela:
  | Marca e modelo | Achou? | Número de homologação | Fabricante e modelo no sistema | Validade | Endereço consultado |
- No final, uma seção "## Observações" com o que parecer estranho: preço muito abaixo dos demais, título que contradiz a ficha técnica, anúncio de 915 MHz cuja descrição fala em 433 ou 868 MHz, ganho de antena que parece impossível para o tamanho dela.

Se não der para terminar tudo, entregue o que já coletou no mesmo formato e liste as buscas que faltaram.
```
