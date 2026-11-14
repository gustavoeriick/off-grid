# Prompt de coleta de preços no Mercado Livre

O Mercado Livre bloqueia acesso automatizado, então a coleta é feita pelo Claude in Chrome, no navegador do Gustavo. Este arquivo guarda o prompt para repetir a coleta.

Como usar:

1. Abra o Claude in Chrome e cole o bloco abaixo inteiro.
2. Salve a resposta em `pesquisa/precos-mercado-livre-AAAA-MM-DD.md`, com a data da coleta.
3. Rode o importador (tarefa 1.1 do plano) para atualizar o catálogo.

A coleta de 14/11/2026 cobriu as partes A, B, C e D. A parte E, pedida pelo Gustavo em 14/11/2026, amplia a variedade de potências e capacidades do catálogo e ainda não foi coletada; ela pode rodar sozinha, colando o início do prompt até "PARTE A" e depois só a parte E e o formato.

Se o site mostrar uma verificação de segurança, peça para continuar em ritmo mais lento. Foi o que resolveu na primeira coleta.

```text
Preciso de uma pesquisa de preços no Mercado Livre (mercadolivre.com.br) para um projeto pessoal.

CONTEXTO
Vou montar em casa, no Rio de Janeiro, um sistema de backup de energia solar off-grid de 24 V: começa com 1 ou 2 placas e 1 bateria e cresce até 3 de cada. As tomadas da casa são 127 V. Os preços que você levantar vão alimentar o catálogo de um simulador e o orçamento da compra, e a sua resposta será convertida em arquivo de dados por um programa. Por isso duas coisas importam mais que tudo: os números têm de ser exatamente os da página, e o formato da resposta tem de ser seguido à risca.

COMO PESQUISAR
- Para cada busca da lista, abra https://lista.mercadolivre.com.br/ seguido dos termos separados por hífen (exemplo: https://lista.mercadolivre.com.br/bateria-lifepo4-24v-100ah), ou digite os termos na busca do site. Use só a primeira página, na ordenação padrão.
- Registre os primeiros anúncios que servem, até a quantidade indicada em cada parte. Serve o anúncio de produto novo, de vendedor no Brasil (ignore "Compra Internacional"), de unidade avulsa (não kit, salvo quando a busca pede kit) e que bate com a especificação pedida. Pule os demais e informe quantos pulou e por quê.
- Abra o anúncio individual apenas quando faltar na listagem um dado marcado como OBRIGATÓRIO. Nos inversores isso sempre será necessário: os dados ficam na ficha técnica ou na descrição.
- Preço: copie o preço principal do anúncio. Se houver um preço menor no Pix, anote os dois. Anote também o preço riscado, se houver.
- Se um dado não estiver na página, escreva "não informado". Não complete com o que você sabe do produto e não estime: esses números viram orçamento, e um campo vazio me serve mais do que um valor provável.
- Só leitura: não faça login, não adicione nada ao carrinho, não envie perguntas a vendedores. Se aparecer captcha ou tela de login, pare e me avise.

PARTE A - equipamento principal (até 5 anúncios por busca)
A1. Bateria LiFePO4 24 V 100 Ah. Busca: bateria lifepo4 24v 100ah
    OBRIGATÓRIO: tem BMS embutido? corrente máxima de descarga (A); o anúncio diz que aceita ligação em paralelo? ciclos; garantia.
A2. Bateria LiFePO4 12 V 100 Ah. Busca: bateria lifepo4 12v 100ah
    OBRIGATÓRIO: os mesmos de A1.
A3. Inversor híbrido off-grid 24 V, 2 a 3 kW, onda senoidal pura, com carregador pela rede e MPPT, saída 110, 120 ou 127 V. Buscas: inversor hibrido off grid 24v 127v 3000w | inversor hibrido 24v 110v 3000w mppt
    OBRIGATÓRIO: marca e modelo exatos; tensão de saída CA; corrente do MPPT (A); faixa de tensão do MPPT (mínima e máxima, em V); tensão máxima de circuito aberto dos painéis (Voc máx); potência máxima de painéis (W); corrente máxima do carregador pela rede (A); consumo sem carga (W).
A4. O mesmo tipo de inversor com saída 220 V, para comparação. Busca: inversor hibrido off grid 24v 220v 3000w
    OBRIGATÓRIO: os mesmos de A3.
A5. Painel solar. Buscas: painel solar 550w | painel solar 585w | painel solar 610w
    OBRIGATÓRIO: marca e modelo; confirma que é 1 unidade; Voc e Vmp (V), se constarem; frete grátis ou não.
A6. Controlador de carga MPPT avulso. Buscas: epever tracer 3210an | epever tracer 4210an
A7. Bateria estacionária de chumbo. Buscas: bateria estacionaria moura 12mf220 | bateria estacionaria freedom df2000
A8. Estação de energia portátil. Buscas: ecoflow river 2 | ecoflow delta 2 | bluetti ac70
    OBRIGATÓRIO: capacidade (Wh); potência (W); tensão de saída.

PARTE B - material de instalação (até 3 anúncios por busca)
B1. Estrutura de fixação para telha colonial (cerâmica). Busca: suporte painel solar telha colonial
    OBRIGATÓRIO: para quantos painéis; o que vem no kit (ganchos, trilhos, grampos).
B2. Cabo solar. Busca: cabo solar 6mm
    OBRIGATÓRIO: metragem do anúncio; se é o par preto e vermelho; preço por metro calculado.
B3. Conector. Busca: conector mc4 par
B4. Cabo de bateria. Buscas: cabo flexivel 35mm metro | cabo flexivel 25mm metro
    OBRIGATÓRIO: preço por metro.
B5. Proteção da bateria. Buscas: fusivel anl 150a porta fusivel | disjuntor cc 125a | disjuntor cc 150a
B6. Proteção dos painéis. Buscas: string box cc 1 entrada 1 saida | disjuntor cc 2p 32a | dps cc 600v
B7. Lado CA e aterramento. Buscas: disjuntor 16a din | cabo flexivel 2,5mm 100m | haste de aterramento cobreada
B8. Medição. Buscas: medidor de consumo de energia tomada wattimetro | multimetro digital

PARTE C - linha simples e barata, em 12 V (até 3 anúncios por busca)
C1. Placa solar pequena. Buscas: painel solar 100w 12v | painel solar 150w 12v
    OBRIGATÓRIO: marca e modelo; potência (W); mono ou policristalino; Voc e Vmp (V), se constarem.
C2. Controlador de carga PWM. Buscas: controlador de carga pwm 30a | controlador de carga pwm 20a
    OBRIGATÓRIO: marca e modelo; confirmar na descrição que é PWM (há anúncios com MPPT no título que são PWM); tensões de bateria aceitas.
C3. Bateria de chumbo estacionária ou selada, tamanhos menores. Buscas: bateria estacionaria moura 12mf105 | bateria estacionaria freedom df1000 | bateria estacionaria 12v 60ah | bateria gel 12v 100ah
    OBRIGATÓRIO: tipo (chumbo-ácido estacionária, AGM ou gel); capacidade (Ah) e o regime em que foi medida (C20, C100), se constar; garantia.
C4. Bateria automotiva comum, só para comparação. Busca: bateria automotiva 60ah
    OBRIGATÓRIO: marca e modelo; capacidade (Ah); garantia.
C5. Inversor 12 V simples. Buscas: inversor senoidal pura 500w 12v | inversor senoidal pura 1000w 12v | inversor onda modificada 1000w 12v
    OBRIGATÓRIO: potência contínua (não a de pico); tensão de saída (110, 127 ou 220 V); tipo de onda.
C6. Inversor híbrido pequeno, tudo em um. Busca: inversor hibrido off grid 12v 1000w
    OBRIGATÓRIO: os mesmos de A3, mais a tensão de bateria.
C7. Kit pronto pequeno (aqui o kit é o que interessa, ao contrário das outras buscas). Buscas: kit energia solar off grid 12v | kit painel solar 150w controlador inversor
    OBRIGATÓRIO: tudo o que vem no kit: potência da placa, tipo e corrente do controlador, potência do inversor e se inclui bateria.

PARTE D - complementos (até 3 anúncios por busca)
D1. Inversor híbrido 24 V com saída 110, 120 ou 127 V e MPPT de faixa baixa, que funcione com uma placa só (cerca de 42 V). Buscas: growatt spf 3000tl lvm 24p | srne hf2430u60-100 | inversor hibrido 24v 110v mppt 60a
    OBRIGATÓRIO: os mesmos de A3. O dado que mais importa é a tensão mínima do MPPT.
D2. Cabo flexível 100% cobre. Buscas: cabo flexivel 2,5mm 100m cobre | cabo flexivel 4mm 100m cobre | cabo flexivel 25mm cobre metro
    OBRIGATÓRIO: material do condutor conforme a ficha (cobre, alucobre, CCA ou CCAM); norma citada, se houver; preço por metro.
D3. Trilhos e grampos da estrutura das placas. Buscas: trilho aluminio painel solar | grampo intermediario painel solar | grampo final painel solar
    OBRIGATÓRIO: comprimento do trilho; quantidade no anúncio; espessura de moldura atendida (30 ou 35 mm).
D4. Fusíveis de bateria. Buscas: fusivel anl 100a | fusivel anl 125a | fusivel mega 125a
    OBRIGATÓRIO: corrente; tensão máxima em corrente contínua, se constar.
D5. Linha de 48 V. Buscas: inversor hibrido off grid 48v 127v 5000w | inversor hibrido off grid 48v 220v 5000w | bateria lifepo4 48v 100ah
    OBRIGATÓRIO: nos inversores, os mesmos de A3; nas baterias, os mesmos de A1.
D6. Acabamento. Buscas: tomada de sobrepor 2p+t 10a | terminal olhal 35mm | caixa de sobrepor para disjuntor din
    OBRIGATÓRIO: quantidade no anúncio.

PARTE E - variedade de potências e capacidades (até 2 anúncios por busca; o objetivo é ter um preço de referência para cada tamanho, não comparar marcas)
E1. Painel solar, tamanhos intermediários. Buscas: painel solar 280w | painel solar 330w | painel solar 400w | painel solar 450w | painel solar 700w
    OBRIGATÓRIO: marca e modelo; confirma que é 1 unidade; potência (W); Voc, Vmp, Isc e Imp, se constarem; medidas (largura e altura); frete grátis ou não.
E2. Bateria LiFePO4, outras capacidades. Buscas: bateria lifepo4 12v 50ah | bateria lifepo4 12v 200ah | bateria lifepo4 24v 50ah | bateria lifepo4 24v 200ah | bateria lifepo4 48v 50ah | bateria lifepo4 48v 200ah
    OBRIGATÓRIO: tem BMS embutido? corrente máxima de descarga (A); corrente máxima de carga (A); o anúncio diz que aceita ligação em paralelo? ciclos; medidas; garantia.
E3. Bateria estacionária de chumbo, outras capacidades. Buscas: bateria estacionaria 12v 45ah | bateria estacionaria 12v 150ah | bateria estacionaria 12v 240ah
    OBRIGATÓRIO: marca e modelo; capacidade (Ah) e em que regime (C20, C100); medidas; garantia.
E4. Inversor híbrido off-grid com MPPT, outras potências, saída 110, 120 ou 127 V. Buscas: inversor hibrido off grid 12v 127v 1500w | inversor hibrido off grid 24v 127v 1500w | inversor hibrido off grid 24v 127v 2000w | inversor hibrido off grid 24v 127v 4000w | inversor hibrido off grid 24v 127v 5000w | inversor hibrido off grid 48v 127v 3000w | inversor hibrido off grid 48v 127v 8000w
    OBRIGATÓRIO: os mesmos de A3, mais potência de pico (W) e medidas.
E5. Inversor senoidal puro sem carregador, saída 110 ou 127 V. Buscas: inversor senoidal pura 300w 12v 127v | inversor senoidal pura 1500w 12v 127v | inversor senoidal pura 2000w 12v 127v | inversor senoidal pura 2000w 24v 127v | inversor senoidal pura 3000w 24v 127v
    OBRIGATÓRIO: marca e modelo; tensão de entrada e de saída; potência contínua e de pico (W); consumo sem carga (W); confirma "senoidal pura" na ficha, não só no título.
E6. Controlador de carga MPPT, outras correntes. Buscas: controlador de carga mppt 10a | controlador de carga mppt 20a | controlador de carga mppt 60a | controlador de carga mppt 100a
    OBRIGATÓRIO: marca e modelo; corrente (A); tensões de bateria aceitas; tensão máxima de entrada das placas (Voc máx); potência máxima de placas por tensão de bateria; confirma MPPT na ficha (muitos anúncios chamam PWM de MPPT).
E7. Controlador de carga PWM, outras correntes. Buscas: controlador de carga pwm 10a | controlador de carga pwm 60a
    OBRIGATÓRIO: corrente (A); tensões de bateria aceitas; tensão máxima de entrada.
E8. Disjuntores e fusíveis, outras correntes. Buscas: disjuntor cc 2p 16a | disjuntor cc 2p 20a | disjuntor cc 2p 63a | disjuntor 10a din | disjuntor 20a din | disjuntor 25a din | disjuntor 32a din | fusivel anl 60a | fusivel anl 200a | fusivel anl 250a | dps ca 275v
    OBRIGATÓRIO: corrente (A); tensão máxima (V) e se é corrente contínua ou alternada; número de polos; marca.
E9. Quadro maior. Buscas: quadro de distribuicao sobrepor 12 disjuntores din | quadro de distribuicao sobrepor 16 disjuntores din
    OBRIGATÓRIO: número de disjuntores; medidas (largura, altura, profundidade); com ou sem barramento.
E10. Estação de energia portátil, outros tamanhos. Buscas: estacao de energia portatil 300wh | estacao de energia portatil 2000wh
    OBRIGATÓRIO: capacidade (Wh); potência de saída (W) e de pico; tensão de saída; entrada solar (W, faixa de tensão em V, corrente em A); química da bateria.

FORMATO DA RESPOSTA
Entregue tudo em um único bloco de código, em Markdown:
- Primeira linha: # Preços Mercado Livre - coleta em AAAA-MM-DD
- Para cada item (A1, A2, ...), um título no formato "## A1 - Bateria LiFePO4 24 V 100 Ah" e uma tabela com estas colunas, nesta ordem:
  | Busca | Título do anúncio | Marca e modelo | Especificações | Preço (R$) | Preço no Pix (R$) | Preço riscado (R$) | Frete | Vendedor | Loja oficial? | Vendidos e nota | Link |
- "Especificações" traz os dados OBRIGATÓRIOS do item, separados por ponto e vírgula.
- "Link" é o endereço do anúncio sem os parâmetros de rastreio (corte tudo a partir de "?" ou "#").
- Abaixo de cada tabela, uma linha "Pulados: N (motivos)".
- No final, uma seção "## Observações" com o que parecer estranho: preço muito abaixo dos demais, título que contradiz a ficha técnica, especificação que parece impossível.

Se não der para terminar tudo, entregue o que já coletou no mesmo formato e liste as buscas que faltaram.
```
