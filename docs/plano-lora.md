# Plano do simulador de rádio LoRa

**Estado em 15/11/2026:** proposta, aguardando a aprovação do Gustavo. Nenhum código foi escrito.

**Pedido:** separar a simulação de painel solar da de LoRa, em dois ambientes de simulação. No ambiente de LoRa, testar comunicação à distância e saber se no meio do caminho é preciso uma antena ou algo semelhante. A pergunta concreta: dá para falar com os pais, a 20 km, e com o sogro, a 40 km?

## 1. O que a pesquisa mostrou

### 1.1 O que é e o que dá para fazer

LoRa é um rádio de longo alcance e baixo consumo. Ele troca velocidade por alcance: manda mensagens de texto curtas e posição, não voz nem internet. O firmware (o programa que roda no rádio) mais usado para conversar entre pessoas é o Meshtastic, que forma uma rede em malha: cada rádio repassa a mensagem dos outros.

### 1.2 A conta da potência fecha com folga; o problema é o que está no caminho

A conta de um enlace (a ligação de rádio entre dois pontos) soma o que o transmissor entrega e desconta o que se perde no ar:

| Distância | Perda no ar livre em 915 MHz | Orçamento do Meshtastic no modo padrão | Folga |
|---|---|---|---|
| 20 km | 117,7 dB | 153 dB | cerca de 35 dB |
| 40 km | 123,7 dB | 153 dB | cerca de 29 dB |

O orçamento de 153 dB é o da tabela oficial do Meshtastic para o modo "Long Fast", com 22 dBm de potência e antena sem ganho. A perda no ar livre é a fórmula padrão: `32,45 + 20·log(MHz) + 20·log(km)`.

Ou seja: **com os dois rádios se enxergando, 40 km é fácil.** O recorde de solo do Meshtastic é de 331 km, de montanha a montanha. O que derruba o enlace é obstáculo: morro, prédio, árvore e a própria curva da Terra.

### 1.3 Quanto os dois pontos precisam "se enxergar"

Não basta uma linha reta livre entre as antenas. O sinal ocupa um volume em forma de charuto em volta dessa linha, a zona de Fresnel, e pelo menos 60% dela precisa estar livre. Somando a curva da Terra, em terreno plano as duas antenas precisariam estar a esta altura:

| Distância | Curva da Terra no meio | 60% da zona de Fresnel no meio | Altura das duas antenas em terreno plano |
|---|---|---|---|
| 20 km | 5,9 m | 24,3 m | cerca de 30 m |
| 40 km | 23,5 m | 34,4 m | cerca de 58 m |

Contas: a curva é `d1·d2 / (2·k·R)`, com `k = 4/3` e `R = 6.371 km`; o raio da zona de Fresnel é `17,32·√(d1·d2 / (GHz·d))`, em metros com distâncias em km.

Antena no telhado de um sobrado fica a 6 ou 8 m. Então, **em terreno plano, nem os 20 km fecham direto de telhado a telhado**. A folga de 30 dB da tabela anterior ajuda a atravessar um obstáculo raso, mas não um bairro inteiro de prédios e árvores.

### 1.4 A resposta honesta à pergunta, por enquanto

Sem saber onde ficam as três casas e o relevo entre elas, não dá para afirmar. O que a pesquisa permite dizer:

- **Pais, 20 km:** direto, só se uma das pontas estiver em lugar alto com vista para a outra. O mais provável é precisar de **um repetidor** em um ponto alto que enxergue as duas casas.
- **Sogro, 40 km:** quase certamente **um ou dois repetidores** em pontos altos.
- **O relevo do Rio joga dos dois lados:** um maciço entre as casas bloqueia tudo; um morro com vista para as duas resolve com um repetidor só. É exatamente isso que o simulador tem de mostrar.
- **O limite de saltos não atrapalha:** o Meshtastic repassa a mensagem por 3 rádios por padrão, e por até 7.

Relatos de uso real, de fóruns e guias (qualidade variável): 1 a 3 km em cidade sem visada, 10 a 20 km com visada e antena comum, 10 a 50 km com repetidor em morro.

**Para ter uma primeira resposta ainda hoje, sem esperar o simulador:** o Meshtastic tem um planejador gratuito em `site.meshtastic.org`. Ele desenha no mapa onde o sinal de um ponto chega, considerando o relevo. Tudo roda no navegador.

### 1.5 Regras no Brasil

- LoRa em 902 a 907,5 MHz e 915 a 928 MHz é equipamento de **radiação restrita**: não precisa de licença de operação, mas o aparelho precisa ser **homologado pela Anatel**, e não tem proteção contra interferência.
- A regra está no Ato nº 14.448/2017 da Anatel, alterado pelos Atos 4776/2020 e 1306/2021.
- **Potência:** até 1 W na saída do transmissor, com redução quando a antena tem ganho alto. As fontes divergem sobre a partir de quanto ganho (2 dBi em uma cópia antiga do ato, 6 dBi em fontes mais recentes). **Não consegui ler o texto oficial vigente:** o site da Anatel estava em manutenção. Esse número tem de ser conferido antes de o simulador afirmar qualquer limite.
- Um rádio comum transmite com 22 dBm (0,16 W) e antena de 3 a 6 dBi, bem abaixo do limite.
- **Região no Meshtastic:** a tabela oficial tem `BR_902` (902 a 907,5 MHz) e `ANZ` (915 a 928 MHz), as duas com 30 dBm e sem limite de tempo de transmissão. A comunidade brasileira (MeshBrasil) padronizou a `ANZ`. Rádios em regiões diferentes não se falam.

### 1.6 Peças envolvidas

- **Rádio:** placas com o chip SX1262, na versão de 915 MHz: Heltec V3/V4, LilyGO T-Beam, RAK WisBlock (RAK4631).
- **Antena:** é o que mais muda o resultado, junto com a altura.
- **Repetidor solar:** um rádio de baixo consumo, bateria e uma placa pequena, em caixa à prova de chuva. O consumo de um RAK4631 como repetidor é estimado em 5 a 40 mA (estimativa de um guia, sem medição publicada). **Aqui os dois simuladores se encontram:** dimensionar a placa e a bateria do repetidor é a mesma conta de autonomia do simulador solar.
- **Alternativa de firmware:** o MeshCore usa os mesmos rádios, mas só repetidores dedicados repassam mensagens, e aceita até 64 saltos. No papel, serve melhor a enlaces fixos planejados. É menos maduro, e as duas redes não se falam.

### 1.7 Como outros simuladores fazem

O planejador do Meshtastic usa o modelo ITM (Longley-Rice), dados de relevo SRTM de 90 m (30 m até 30 km) baixados da AWS, e roda no navegador. Ele considera só o relevo: prédios e árvores ficam de fora. A licença dele é GPL-3.0, o que impede copiar o código para este projeto sem adotar a mesma licença.

## 2. O que vamos construir

Um segundo ambiente dentro do mesmo projeto, separado do solar: **"Rádio LoRa"**. Na abertura, a pessoa escolhe entre "Energia solar" e "Rádio LoRa". Cada ambiente tem os próprios projetos gravados, a própria tela e o próprio código.

O que o ambiente de LoRa faz:

1. **Mapa.** Marcar os pontos no mapa: minha casa, casa dos pais, casa do sogro. Cada ponto tem nome, altura da antena e o rádio usado.
2. **Enlace entre dois pontos.** Um corte do terreno de um ponto ao outro, com a linha entre as antenas, a curva da Terra, a zona de Fresnel e onde o relevo atrapalha. E a conta da potência: quanto chega, quanto o rádio precisa, e a folga.
3. **Veredito em palavras:** "fecha com folga", "fecha no limite" ou "não fecha", com o motivo ("o morro a 7,2 km do início corta a linha em 40 m").
4. **Repetidor.** Pôr um repetidor no mapa e ver os dois trechos. E um botão **"Sugerir ponto de repetidor"**, que procura pontos altos que enxergam as duas pontas.
5. **Rede com vários saltos.** Casa, repetidor A, repetidor B, sogro: quantos saltos, qual o trecho mais fraco, se cabe no limite de saltos.
6. **O que mudar para fechar:** subir a antena, trocar a antena, mudar o modo do rádio (mais lento alcança mais), com o efeito de cada um na folga.
7. **Aprender:** explicação de cada termo na primeira vez, como no solar, e as regras da Anatel.
8. **Nó repetidor solar:** quanto de placa e bateria o repetidor precisa para atravessar dias nublados, reaproveitando a conta do simulador solar.

Fica para depois, se fizer sentido: mapa de cobertura (a mancha de onde o sinal de um ponto chega), relevo em 3D e catálogo de rádios com preço.

## 3. Como separar os dois ambientes

- **Código:** tudo de LoRa em `src/lora/`, com as mesmas camadas do solar: `nucleo` (conta pura, sem tela), `dados` (relevo), `mapa` (desenho) e `ui` (painéis). O ambiente solar não importa nada de `src/lora/`, e o de LoRa só usa do solar o cálculo de autonomia, para o repetidor.
- **Páginas:** duas páginas no mesmo site, `index.html` (solar) e `lora.html`, com um seletor no alto para trocar. O Vite gera as duas.
- **Projetos:** a lista "Meus projetos" de cada ambiente é separada. Um projeto de LoRa guarda os pontos, as antenas e os repetidores.
- **O solar não muda.** Nenhuma tarefa deste plano mexe no que já existe, fora o seletor do alto.

## 4. Decisões que preciso de você

| # | Decisão | Minha recomendação |
|---|---|---|
| 1 | **Privacidade do relevo.** Para saber a altura do terreno, o simulador precisa consultar um serviço de fora. Um serviço por pontos (Open-Meteo) recebe as coordenadas exatas do caminho entre as casas. Um serviço por blocos de mapa (os mesmos blocos da AWS que o planejador do Meshtastic usa) só revela a região, com dezenas de quilômetros de lado | Blocos de mapa. Preciso confirmar que o endereço deles ainda funciona antes de fechar |
| 2 | **Mapa de fundo.** Ruas e nomes vêm do OpenStreetMap. Desenhar o mapa pede uma biblioteca nova (Leaflet ou MapLibre), e o projeto hoje não aceita dependência nova sem a sua aprovação | Aprovar o MapLibre, que também serve ao relevo 3D depois |
| 3 | **Firmware de referência** para os modos do rádio e o limite de saltos | Meshtastic, por ser o da comunidade brasileira. MeshCore como opção depois |
| 4 | **Modelo de propagação** (a conta de quanto o relevo atrapalha) | Começar com ar livre mais difração em obstáculos (norma ITU-R P.526), que é aberta e explicável. Conferir os resultados contra o planejador do Meshtastic. O modelo ITM fica para depois |
| 5 | **Onde ficam as casas.** Não preciso nem devo saber os endereços | Você marca os pontos clicando no mapa; eles ficam gravados só no seu navegador |
| 6 | **2D primeiro ou 3D desde o começo** | Mapa 2D e corte do terreno primeiro, que respondem à sua pergunta. Relevo 3D como fase opcional |

## 5. Fases e tarefas

Segue o formato do plano principal: o Fable especifica, revisa e faz o que é visual; o Sonnet constrói o cálculo e os painéis contra testes; o Haiku roda as verificações.

### Fase L0: especificação

- [ ] **L0.1 Especificação do núcleo de rádio.** Fórmulas, constantes com a fonte de cada uma, tabela dos modos do Meshtastic e casos de teste com os números esperados. Fable.
- [ ] **L0.2 Conferir a regra da Anatel no texto oficial** e registrar o limite de potência e a regra do ganho de antena. Fable.
- [ ] **L0.3 Conferir os serviços de relevo e de mapa:** endereço, formato, limite de uso, se o navegador consegue acessar. Fable.
- [ ] **L0.4 Especificação da tela.** Fable.

### Fase L1: cálculo e relevo

- [ ] **L1.1 Núcleo de rádio:** perda no ar livre, curva da Terra, zona de Fresnel, difração em obstáculos, conta do enlace e veredito. `nucleo` (Sonnet).
- [ ] **L1.2 Relevo:** baixar e guardar os blocos, altura de um ponto e perfil entre dois pontos. `nucleo` (Sonnet).
- [ ] **L1.3 Página `lora.html`, seletor de ambiente e projetos de LoRa.** Coordenador.

### Fase L2: mapa e enlace (primeira versão utilizável)

- [ ] **L2.1 Mapa com os pontos:** criar, arrastar, nomear, altura da antena. Fable.
- [ ] **L2.2 Corte do terreno do enlace,** com a linha, a curva, a zona de Fresnel e os obstáculos. Fable.
- [ ] **L2.3 Painel do enlace:** a conta, a folga, o veredito e o que mudar para fechar. `interface` (Sonnet).
- [ ] **L2.4 Conferência contra o planejador do Meshtastic** em três enlaces de exemplo (em lugares públicos, não nas casas). `revisor` (Fable).

Ao fim desta fase você já responde à pergunta dos 20 km e dos 40 km.

### Fase L3: repetidores

- [ ] **L3.1 Repetidor no mapa e rede com vários saltos.** `nucleo` e `interface` (Sonnet).
- [ ] **L3.2 "Sugerir ponto de repetidor".** `nucleo` (Sonnet), com revisão do Fable.
- [ ] **L3.3 Nó repetidor solar:** placa e bateria, com a conta de autonomia do solar. `nucleo` (Sonnet).

### Fase L4: aprender

- [ ] **L4.1 Glossário, "por quê?" e regras da Anatel.** Texto por Opus; revisão do Fable.
- [ ] **L4.2 Tutorial "meu primeiro enlace".** `interface` (Sonnet).

### Fase L5: opcionais

- [ ] **L5.1 Mapa de cobertura de um ponto.**
- [ ] **L5.2 Relevo em 3D,** com o enlace e a zona de Fresnel desenhados no espaço.
- [ ] **L5.3 Catálogo de rádios, antenas e kits de repetidor,** com preço. Depende de coleta no Mercado Livre e de conferir a homologação de cada modelo.
- [ ] **L5.4 Registro de teste de campo:** anotar o sinal medido de verdade e comparar com o previsto.

## 6. Riscos e limites

- **O simulador prevê o relevo, não a cidade.** Prédios e árvores não entram na conta. Em área urbana, o resultado real costuma ser pior que o previsto. O simulador vai dizer isso na tela e deixar uma margem ajustável.
- **Relevo de 90 m de resolução** não enxerga um morro estreito nem um prédio. Serve para decidir onde vale a pena testar, não para garantir.
- **A previsão não substitui o teste de campo.** Antes de comprar e instalar um repetidor em um morro, o certo é testar com dois rádios na mão.
- **Repetidor em ponto alto precisa de lugar:** terreno de alguém, autorização, acesso para manutenção. O simulador acha o ponto; conseguir o lugar é outra história.
- **Regra da Anatel a confirmar** (tarefa L0.2). Até lá, o simulador não afirma limite de potência.
- **Dependência nova e serviços de fora** (decisões 1 e 2).

## 7. Fontes

- Meshtastic, modos do rádio e orçamento de enlace: https://meshtastic.org/docs/overview/radio-settings
- Meshtastic, regiões, potência e limite de saltos: https://meshtastic.org/docs/configuration/radio/lora
- Meshtastic, testes de alcance e recordes: https://meshtastic.org/docs/overview/range-tests/
- Planejador do Meshtastic: https://github.com/meshtastic/meshtastic-site-planner
- Anatel, Ato nº 14.448/2017: https://informacoes.anatel.gov.br/legislacao/atos-de-certificacao-de-produtos/2017/1139-ato-14448
- Anatel, Ato nº 4776/2020: https://informacoes.anatel.gov.br/legislacao/atos-de-certificacao-de-produtos/2020/1467-ato-4776
- MeshBrasil, frequência e região no Brasil: https://www.meshbrasil.com/meshtastic-frequencia-brasil.html
- MeshBrasil, grupos regionais: https://meshbrasil.com/grupos-regionais.html
- Open-Meteo, API de altitude: https://open-meteo.com/en/docs/elevation-api
- ITU-R P.526, propagação por difração: https://www.itu.int/dms_pubrec/itu-r/rec/p/r-rec-p.526-15-201910-i!!pdf-e.pdf
- Comparação Meshtastic e MeshCore: https://simeononsecurity.com/articles/meshcore-vs-meshtastic-comparison-guide/
- Guia de nó solar (consumo estimado): https://d-central.tech/solar-meshtastic-node-build/
