# Plano de desenvolvimento do simulador off-grid 3D

**Estado em 15/11/2026:** fases 0 e 1 concluídas e aprovadas. Fases 2 a 5 construídas na noite de 14 para 15/11, com autorização do Gustavo para seguir e decidir as dúvidas, e gravadas no ramo `dev`; falta o teste dele. Não foi feita a publicação (5.4), que depende de ele pedir o envio ao GitHub, nem a nova coleta de preços (6.1). As decisões tomadas sem ele estão em [especificacao/fase-2.md](especificacao/fase-2.md), seção 8.

**Como usar este documento:** ele é a memória do projeto. Cada fase começa em uma sessão nova do Claude Code, que lê este plano e a especificação e não depende de conversas anteriores. Quem coordena uma fase marca aqui as tarefas concluídas.

## 1. O que vamos construir

Um simulador no navegador para aprender a montar um sistema solar off-grid e dimensionar o da casa do Gustavo: Rio de Janeiro, sobrado com telha colonial, placas no telhado da varanda do térreo, equipamentos no quartinho de ferramentas, tomadas em 127 V.

A experiência é inteira em 3D, com clique e arraste:

1. **Casa.** Montar a casa (térrea ou sobrado, telhado, varanda, quartinho) e girá-la até a posição real.
2. **Equipamentos.** Arrastar itens do catálogo para a casa: placas no telhado, inversor e bateria no quartinho, aparelhos nos cômodos.
3. **Cabos.** Puxar cabos de um terminal a outro: placa, bateria, inversor, geladeira, ventilador, computador, TV.
4. **Sugestões.** Receber avisos na hora: falta disjuntor, cabo fino, tensão errada, acrescente uma placa, acrescente uma bateria. Cada aviso explica o motivo e, quando dá, resolve com um clique.
5. **Queda de luz.** Simular um apagão com o tempo acelerado: o sol anda, a sombra passa pelas placas, a bateria desce.
6. **Orçamento.** Ver o custo do que está montado, com preços do Mercado Livre datados.

O catálogo tem três linhas: a simples (12 V, chumbo, PWM), a do plano (24 V, lítio) e a avançada (48 V).

A primeira versão utilizável é o fim da fase 3. Clima real por data, outras cidades, vizinhos e árvores e o modo passo a passo ficam para as fases 4 e 5.

## 2. Modelos: quem faz o quê

O princípio: o modelo mais caro decide e confere; os mais baratos constroem contra testes que já dizem o que é "pronto".

| Modelo | Preço por milhão de tokens (entrada / saída) | Papel neste projeto |
|---|---|---|
| Fable 5.2 | US$ 8 / US$ 40 | Escreve a especificação (física, regras do consultor, casos de teste), faz as revisões de aprovação e constrói toda a parte 3D e a simulação na tela: casa, placas, quadro de energia, equipamentos, arraste e cabos. |
| Opus 5.5 | US$ 4 / US$ 20 | Coordena as fases 1 a 3, faz a topologia do circuito e revisa entregas. |
| Sonnet 5.5 | US$ 2 / US$ 10 | Escreve o cálculo a partir da especificação, os painéis, o catálogo e os testes. |
| Haiku 5.5 | US$ 0,10 / US$ 0,50 | Roda verificações (tipos, testes, build, capturas de tela) e tarefas mecânicas. |

Os preços são os da API da Anthropic e servem aqui como régua de custo relativo. Conta aproximada: com o 3D no Fable, cerca de 45% dos tokens ficam nele, 10% no Opus, 40% no Sonnet e 5% no Haiku, e o custo fica perto de 60% do que seria com tudo no Fable. Em 15/11/2026 o Gustavo decidiu pagar essa diferença para ter a cena o mais fiel possível.

Regras:

- **Escalonamento.** Se uma tarefa falha nos critérios de pronto duas vezes, ela sobe um degrau (Sonnet, depois Opus, depois Fable) em vez de uma terceira tentativa no mesmo modelo.
- **Esforço.** Cada agente roda no esforço padrão do modelo. Só muda se o Gustavo pedir.
- **Sessões.** Uma sessão nova por fase, com contexto limpo. O coordenador da fase é a sessão principal (`/model opus` nas fases 1 a 3). A revisão de aprovação é o agente `revisor` chamado com o modelo Fable, sem trocar o modelo da sessão.

## 3. Agentes

Os agentes ficam definidos em `.claude/agents/` (criados na fase 0). O coordenador os chama, em paralelo quando as tarefas não dependem uma da outra, e pode trocar o modelo de uma tarefa específica na chamada.

| Agente | Modelo padrão | O que faz | Onde escreve |
|---|---|---|---|
| `nucleo` | Sonnet | Cálculo puro e testes, a partir da especificação | `src/nucleo/` |
| `catalogo` | Sonnet | Importa pesquisas de preço e cura o catálogo | `src/catalogo/`, `scripts/`, `pesquisa/` |
| `cena3d` | Fable | Casa, sol, modelos 3D fiéis, quadro de energia, interação | `src/cena/` |
| `interface` | Sonnet | Painéis, barra de tempo, textos | `src/ui/`, `index.html`, `src/estilo.css` |
| `revisor` | Opus (Fable nas aprovações) | Confere a entrega contra a especificação; só lê e roda testes | nada |
| `verificador` | Haiku | Roda tipos, testes, build e o roteiro de capturas; relata com evidência | nada |

Regras de convivência:

- Cada agente escreve só na sua pasta.
- Arquivos compartilhados (`src/main.ts`, `src/estado.ts`, os contratos de tipos) são do coordenador. Um agente que precise mudar um contrato pede ao coordenador.
- Toda entrega passa pelo `verificador` antes de ser dada como pronta.

## 4. Fases e tarefas

### Fase 0: fundação

Coordenação: Fable 5.2, na sessão em que este plano foi escrito, porque é ela que guarda o contexto da análise.

- [x] **0.1 Insumos no repositório.** Plano elétrico em `docs/plano-backup-off-grid.md`, pesquisa de preços em `pesquisa/precos-mercado-livre-2026-11-14.md`, prompt de coleta em `pesquisa/prompt-coleta.md`, prova de conceito da sombra em `scripts/poc/sombra-varanda.mjs`. Os dois primeiros são cópias dos arquivos originais do Gustavo.
- [x] **0.2 Especificação técnica** em `docs/especificacao.md` e nas partes de `docs/especificacao/`: convenções, modelo de dados, fórmulas e constantes, regras do consultor com texto e ação, catálogo, casos de teste com os números esperados. Os números saem de `scripts/referencia/valores-de-referencia.mjs`.
- [x] **0.3 Contratos em código.** Tipos do projeto e do catálogo, os arquivos do núcleo com as assinaturas, os terminais, os dois cenários de teste e o esqueleto da página. `npm run typecheck`, `npm test` e `npm run build` passam.
- [x] **0.4 Agentes e convenções.** Os seis arquivos em `.claude/agents/` e o `CLAUDE.md`.

**Aprovação:** o Gustavo lê a especificação, principalmente [as regras do consultor](especificacao/consultor.md) e [os casos de teste](especificacao/casos-de-teste.md), e aprova. Aprovada em 14/11/2026, com dois ajustes pedidos por ele e já incorporados: horário de uso definido em cada aparelho, e mais tipos de computador e de geladeira no catálogo.

### Fase 1: cálculo e casa, em paralelo

Coordenação: Opus 5.5. Os dois trilhos não dependem um do outro. Dentro do trilho A, o catálogo (1.1 e 1.2) vem antes das tarefas 1.4 a 1.9, que usam os itens dele nos testes; a 1.3 pode rodar junto com o catálogo.

Trilho A, o núcleo de cálculo:

| Nº | Tarefa | Agente (modelo) | Pronto quando |
|---|---|---|---|
| 1.1 | Importador da pesquisa: lê as tabelas do `.md` e gera JSON bruto | `catalogo` (Sonnet) | Todas as seções A1 a C7 viram registros; um teste confere a contagem por seção |
| 1.2 | Catálogo curado, com as três linhas, link, data e marcações | `catalogo` (Sonnet) | Teste de consistência passa; itens suspeitos marcados como manda a especificação |
| 1.3 | Sol e irradiação | `nucleo` (Sonnet) | Posição do sol igual à tabela de referência; irradiação diária no plano da placa, no Rio, a ±12% do PVGIS em todos os meses |
| 1.4 | Topologia do circuito a partir dos cabos: série, paralelo, erros de ligação | `nucleo` (Opus) | Passam os casos: plano fase 1, 2 placas em série, 3 em paralelo, polaridade invertida, curto, 2 baterias de 12 V em série |
| 1.5 | Modelo elétrico: placa, controlador MPPT e PWM, bateria, inversor, passo de simulação | `nucleo` (Sonnet) | Passam os casos: 1 bateria dura cerca de 4 h com 465 W e 6 h com 300 W; 1 placa em MPPT de 60 a 450 V gera zero; o PWM entrega 26,5% menos que o MPPT |
| 1.6 | Cabos e proteções: capacidade, queda de tensão, fusível contra cabo | `nucleo` (Sonnet) | Cabo de 25 mm² com fusível de 150 A reprova; 35 mm² aprova |
| 1.7 | Consultor: regras e ações | `nucleo` (Sonnet) | No cenário "plano no papel" aparecem exatamente as sugestões listadas na especificação |
| 1.8 | Orçamento | `nucleo` (Sonnet) | O total do cenário do plano bate com a conta manual da especificação |
| 1.9 | Relatório do cenário em texto (`npm run cenario`) | `nucleo` (Sonnet) | Imprime sugestões, autonomia, energia do dia e orçamento |

Trilho B, a casa em 3D:

| Nº | Tarefa | Agente (modelo) | Pronto quando |
|---|---|---|---|
| 1.10 | Cena base: câmera em órbita, chão, rosa dos ventos, luz | `cena3d` (Fable) | A cena abre sem erro no console |
| 1.11 | Casa paramétrica e modos de visão (completa, sem telhado, só térreo) | `cena3d` (Fable) | Sobrado e térrea, varanda nos quatro lados, quartinho; capturas dos três modos |
| 1.12 | Sol por data e hora, sombra visual, arco do dia | `cena3d` (Fable) | Ao meio-dia de 21/06 no Rio a sombra aponta para o sul |
| 1.13 | Barra de tempo e controles: data, hora, velocidade, clima, rotação, formulário da casa | `interface` (Sonnet) | Mudar cada controle muda a cena |
| 1.14 | Roteiro de verificação visual (`scripts/verificar.mjs`) | `interface` (Sonnet) escreve, `verificador` (Haiku) roda | Abre o app sem interface gráfica, tira capturas e falha se houver erro no console |

**Revisão:** `revisor` (Opus) nos dois trilhos; `revisor` com Fable confere o núcleo contra a especificação.

| 1.15 | Refazer a casa com fidelidade: telha colonial com relevo, paredes com portas e janelas, piso, varanda com madeiramento, quartinho com porta, terreno, céu e iluminação mais realistas, mantendo as marcações de superfície e de sombra | `cena3d` (Fable) | As capturas mostram uma casa reconhecível como sobrado brasileiro de telha colonial; os critérios das tarefas 1.10 a 1.12 continuam valendo |

**Fase 1 concluída em 14/11/2026:** tarefas 1.1 a 1.15 entregues, revisadas e gravadas no ramo `dev`; 312 testes passam. As revisões acrescentaram regras ao consultor (ver `especificacao/consultor.md`).

Pendências que a revisão deixou para a fase 2:

- Limitar no formulário a varanda cujo telhado desce abaixo de 2 m (hoje, com inclinação e profundidade altas, ele entra no chão) e avisar quando o quartinho cruza a casa ou a varanda. Entra na tarefa 2.7.
- `sem-disjuntor-na-saida` escolher um disjuntor por cabo: pede mudança no tipo `Acao`.
- Resolvido na tarefa 2.7a: acabamento da cena: rufo no encontro do telhado com a varanda em casa térrea; fresta de 6 cm no topo das paredes do quartinho; mapa de sombra de ±18 m não cobre o quartinho nos extremos; `destruir()` não libera materiais e texturas.
- Esconder os equipamentos junto com a superfície escondida; o raio de arraste mira só `superficies()`; o raio de sombra filtra por `userData.sombra`.
- Medir o tempo de quadro em vídeo integrado: só foi medido em placa dedicada (1,2 ms).

**O que o Gustavo vê:** o relatório do plano dele em texto, e a casa 3D que gira, com sol e sombra ao longo do dia.

### Fase 2: montagem com clique e arraste

Coordenação: Opus 5.5. É a fase de maior risco técnico.

| Nº | Tarefa | Agente (modelo) | Pronto quando |
|---|---|---|---|
| 2.1 | Modelos 3D fiéis dos equipamentos e aparelhos, com terminais, e o quadro de energia | `cena3d` (Fable) | Cada categoria do catálogo tem forma e terminais; captura de cada uma |
| 2.2 | Catálogo lateral e arraste para a cena: fantasma, superfícies válidas, soltar | `cena3d` (Fable) | Placa só encaixa em telhado, inversor em parede, bateria e aparelho em piso |
| 2.3 | Selecionar, mover, girar, apagar; painel do item selecionado | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro de verificação move e apaga um item |
| 2.4 | Puxar cabos entre terminais: elástico, encaixe, cores, compatibilidade; bitola e proteção no cabo | `cena3d` (Fable) | O roteiro liga placa, inversor e bateria; CA não liga em CC |
| 2.5 | Salvar, abrir e exportar o projeto; cenário inicial "plano no papel" | `interface` (Sonnet) | Recarregar a página mantém a montagem |
| 2.7 | Casa definida à mão: mais de uma varanda coberta (uma por lado da casa, cada uma com profundidade, inclinação, largura e posição na fachada próprias, todas aceitando placas no telhado) e quartinho arrastado com o mouse no terreno, além dos campos do formulário. Pedido do Gustavo em 14/11/2026. Muda o contrato `CasaConfig` (varanda vira lista), então passa pelo coordenador e pela especificação | `cena3d` (Fable), `interface` (Sonnet) | O roteiro cria varanda na frente e na lateral, encaixa placa em cada telhado, arrasta o quartinho e confere a posição no estado; a sombra de cada varanda entra no cálculo |
| 2.6 | Editor de cômodos: paredes internas por andar, nome de cada cômodo (cozinha, sala, quarto), aparelhos soltos dentro do cômodo; orçamento e consultor citam o cômodo. Pedido do Gustavo em 14/11/2026; o detalhe entra na especificação no início da fase 2. Não muda o cálculo elétrico | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro cria dois cômodos, nomeia, solta um aparelho em cada um, e o nome do cômodo aparece no painel do aparelho; recarregar mantém os cômodos |

**Revisão:** `revisor` (Opus).

**O que o Gustavo faz:** monta à mão o sistema do plano dele.

### Fase 3: simulação viva e consultor

Coordenação: Opus 5.5.

| Nº | Tarefa | Agente (modelo) | Pronto quando |
|---|---|---|---|
| 3.1 | Sombra por raios nas placas e céu visível, ligando a cena ao núcleo | `cena3d` (Fable) | Com a casa de teste da especificação, a perda anual por lado da varanda fica a até 5 pontos da referência (clima típico: Norte 14%, Leste e Oeste 23%, Sul 31%) |
| 3.2 | Laço de simulação: tempo acelerado, geração, consumo, bateria, queda de luz | coordenador (Opus) | No cenário do plano a bateria esvazia no horário previsto pelo núcleo |
| 3.3 | Painel do consultor com ações de um clique: fusível, bitola, mais bateria, mais placa, desligar aparelho | `interface` (Sonnet) | Cada ação muda a montagem e a sugestão some |
| 3.4 | Painel de orçamento, com link e data de cada preço | `interface` (Sonnet) | Total igual ao do núcleo |
| 3.5 | Mostradores e gráfico da bateria durante a queda | `interface` (Sonnet) | O gráfico acompanha a simulação |

**Fases 2 e 3 construídas em 14 e 15/11/2026:** tarefas 2.0 a 2.7 e 3.1 a 3.5 entregues e gravadas no ramo `dev`, com revisão independente do estado e do núcleo e revisão final de ponta a ponta. O README (parte da 5.4) também está escrito.

**Aprovação da primeira versão:** `revisor` com Fable percorre o cenário de ponta a ponta; o Gustavo testa.

### Fase 4: aprender

Coordenação: Sonnet 5.5.

- [x] **4.1 Modo passo a passo.** Dois roteiros: o primeiro sistema (12 V, simples) e o plano (24 V). `interface` (Sonnet).
- [x] **4.2 "Por quê?" em cada sugestão e glossário.** Texto por Opus; revisão de segurança por Fable.
- [x] **4.3 Avisos de segurança** para a parte CA, o trabalho no telhado e as baterias. Revisão por Fable.

### Fase 5: dados reais e extras

Coordenação: Sonnet 5.5.

- [x] **5.1 Clima real por data** (Open-Meteo) e outras cidades (NASA POWER). `nucleo` e `interface`.
- [x] **5.2 Obstáculos:** vizinho, muro, árvore. `cena3d`.
- [x] **5.3 Estações portáteis e placas no chão.** `cena3d` e `nucleo`.
- [ ] **5.4 Publicação no GitHub Pages e README.** `verificador` (Haiku).

### Contínuo: preços

- [ ] **6.1 Nova coleta** com `pesquisa/prompt-coleta.md` no Claude in Chrome, importador da tarefa 1.1 e um relatório do que mudou de preço. `catalogo` (Sonnet).

### Fase 7: modo tutorial (aprovada pelo Gustavo em 15/11/2026)

Pedido do Gustavo: um modo em que só existe o quartinho de ferramentas. Ele põe a placa no telhado do quartinho, depois as peças lá dentro, com a explicação de cada coisa, até ligar o sistema; no fim liga um aparelho e vê quanto tempo a bateria segura.

Coordenação: Fable 5.2 (a maior parte é cena).

- [x] **7.1 Especificação do tutorial.** Passos, textos, critério de "feito" de cada passo, o teste de autonomia do fim e as mudanças de contrato. Fable. Sai em `docs/especificacao/tutorial.md`.
- [x] **7.2 Estado e contrato.** Projeto do tutorial separado do projeto da casa (gravado à parte, um não apaga o outro), entrar e sair do modo, casa escondida. Coordenador.
- [x] **7.3 Cena só com o quartinho.** Casa, varandas e cômodos fora da cena e da sombra; câmera enquadrada no quartinho; destaque do lugar onde a peça do passo deve ser solta e do terminal onde o cabo deve chegar. `cena3d` (Fable).
- [x] **7.4 Textos do tutorial.** O que é cada peça, por que ela entra nessa ordem e o cuidado de segurança do passo. Escritos pelo coordenador (Fable), junto com o roteiro.
- [x] **7.5 Painel do tutorial.** Passo atual, "Mostrar no catálogo", avanço automático quando o passo é cumprido, e o teste do fim: escolher o aparelho, acelerar o tempo e ler "a bateria segurou X h Y min". `interface` (Sonnet).
- [x] **7.6 Verificação com mouse e revisão.** O roteiro de capturas percorre o tutorial inteiro. `verificador` (Haiku) e `revisor` (Fable).

## 5. Como uma entrega é aceita

1. O agente entrega e diz o que fez e o que não fez.
2. O `verificador` roda `npm run typecheck`, `npm test`, `npm run build` e, se houver tela, o roteiro de capturas.
3. No fim da fase, o `revisor` compara o conjunto com a especificação.
4. O Gustavo testa o que a fase promete mostrar e aprova a seguinte.

## 6. Decisões já tomadas

Produto:

- A simulação inteira é em 3D, com clique e arraste.
- No lado das placas e baterias, positivo e negativo são cabos separados. Nas tomadas, um cabo por aparelho.
- Fusível, disjuntor e DPS são instalados em um cabo, arrastando a peça para cima dele.
- Os cabos grudam nos terminais; não há desenho livre de trajeto.
- Os modelos 3D são fiéis: a casa com telha colonial, esquadrias e acabamento reconhecíveis; as placas, o inversor, as baterias e os aparelhos com proporções, cores e detalhes dos produtos do catálogo. Decisão do Gustavo em 15/11/2026, no lugar das formas básicas previstas antes.
- A cena tem um quadro de energia: uma caixa na parede, com trilho, onde ficam os disjuntores, o DPS e o fusível. As proteções instaladas em um cabo aparecem no quadro.
- O cenário inicial é o plano do Gustavo "como está no papel", para o consultor mostrar o que precisa mudar.

Técnica:

- Vite 8, TypeScript 7, Three.js 0.187 e Vitest 5, sem framework de interface. Roda inteiro no navegador, sem servidor.
- Interface em português do Brasil. Nomes de domínio no código em português sem acento (placa, bateria, inversor, cabo).
- Três camadas: `src/nucleo` (lógica pura, sem Three.js nem DOM), `src/cena` (Three.js) e `src/ui` (painéis), mais `src/catalogo` (dados). O núcleo não importa das outras.
- Eixos: X para leste, Y para cima, Z para sul. Azimute do sol em graus a partir do norte, no sentido horário. Medidas em metros.
- A casa é um grupo que gira. Equipamentos e cabos são filhos dele e ficam em coordenadas da casa.
- Superfícies de encaixe: telhado para placas, parede para inversor e controlador, piso para baterias e aparelhos.
- Topologia a partir dos cabos: os terminais ligados formam redes; a busca encontra fileiras em série e ramos em paralelo; a corrente de cada cabo é a soma das fontes do lado dele.
- Posição do sol pelo algoritmo da NOAA, já validado contra o PVGIS (erro médio de 0,13°).
- Irradiação: céu limpo de Haurwitz, ajustado pela média mensal da NASA POWER; separação entre direta e difusa por Erbs; transposição isotrópica para o plano da placa. Climas: típico do mês, céu limpo, nublado, chuvoso.
- Sombra: 15 raios por placa em direção ao sol, contra a geometria da casa. Em série, a placa mais sombreada limita a fileira.
- Placa: potência pela irradiância e pela temperatura. Controlador MPPT com faixa de tensão, tensão máxima a frio, corrente e potência máximas; PWM com a placa presa à tensão da bateria.
- Bateria: LiFePO4 com 90% utilizável; chumbo estacionária com 50%; automotiva só para comparação. Limite de corrente do BMS e corte por bateria vazia.
- Inversor: rendimento mais consumo sem carga; sobrecarga e pico de partida; prioridade "rede primeiro", como no plano, ou "solar primeiro".
- Cabos: capacidade por seção e tipo; queda de tensão de até 3% nas placas, 2% na bateria e 4% em CA; fusível menor que a capacidade do cabo e maior que 1,25 vez a corrente esperada.
- Preços em arquivo, com link, data da coleta e marcação do que é valor típico. Sem consulta ao vivo, porque o Mercado Livre bloqueia acesso automatizado.
- Verificação visual com o Chrome instalado, sem interface gráfica, por `playwright-core`.

Catálogo, a partir da coleta de 14/11/2026:

- O único inversor híbrido de 127 V com MPPT encontrado é o Anenji ANJ-3KW-24V-LV-WIFI (a partir de R$ 2.309). A faixa do MPPT é de 60 a 450 V e a entrada aceita 18 A: exige duas ou mais placas em série e não aceita fileiras em paralelo.
- O PowMr PS-3K-110V é PWM (2,4 kW, até 80 V, até 1.200 W de placas). Entra como alternativa que aceita uma placa só.
- Bateria de 24 V e 100 Ah com BMS: de R$ 3.750 (Alfx, 1 ano de garantia) a R$ 4.749 (Moura 24MSL100, 5 anos) e R$ 5.528 (Epever).
- Melhor preço por watt em placas: 585 W bifacial por R$ 810 a 850 (loja SGV, frete à parte) e Helius 610 W por R$ 950.
- Cabos "alucobre" ou "CCAM" (os três rolos de 2,5 mm² e o de 25 mm² Rayantek) entram marcados como não recomendados.
- A string box Lukma é de 10 A, menos que a corrente das placas (14 A): entra marcada.
- Disjuntor CC de 150 A só apareceu em versão automotiva. As opções válidas são o fusível ANL de 150 A e o disjuntor CC de 125 A.
- Os ganchos para telha colonial vêm sem trilho.
- Títulos que enganam: Tataliken "1000 W" tem 400 W contínuos; "3000w 1500w" tem 1.500 W contínuos.
- Ficam fora do catálogo até confirmar a especificação: Serrana Solar 1000 W (tensão de bateria não informada) e os inversores com dados de MPPT só no título.
- Os anúncios trazem os modelos 12MN105 e 12MN220 da Moura; "12MF" não aparece.

## 7. Riscos

| Risco | Como o plano trata |
|---|---|
| Arraste e cabos em 3D são difíceis de acertar | Opus nessas tarefas, roteiro de verificação visual, escopo simples (cabo gruda em terminal) |
| Modelo barato errar a física | Especificação com casos numéricos, testes e revisão do Fable no núcleo |
| Agentes em paralelo se atropelarem | Pastas separadas, contratos fixados na fase 0, mudanças de contrato só pelo coordenador |
| Especificação de anúncio errada ou incompleta | Catálogo marca o que é valor típico; link e data em cada item |
| Irradiação é a de um dia médio | A fase 5 traz clima real por data |
| Verificação automática não enxerga tudo | O Gustavo testa ao fim de cada fase |
| Ferramentas recentes (Vite 8, TypeScript 7) | Os agentes consultam a documentação instalada em `node_modules`, não a memória |

## 8. Pendências

Estado do repositório em 14/11/2026: fase 0 entregue no ramo `dev`. Existem o plano, a especificação, os contratos do núcleo (assinaturas sem implementação), os cenários de teste, os agentes e o esqueleto da página. Nada foi enviado ao GitHub.

Decisões do Gustavo, tomadas em 14/11/2026:

1. Aprovada a ordem das fases e o corte da primeira versão no fim da fase 3.
2. Aprovada a divisão de modelos da seção 2.
3. Autorizado um commit por tarefa aprovada, em ramo separado de `master`. O ramo é o `dev`. Push só quando ele pedir: o repositório no GitHub é público.
4. Os dois arquivos `.md` foram trazidos para o repositório.

5. Aprovada a especificação, com os ajustes de horário de uso e de tipos de aparelho.

A coleta complementar (parte D) foi feita em 14/11/2026 e está no mesmo arquivo da pesquisa. Os itens dela estão na seção 5 da especificação do catálogo.

Ideias para depois, anotadas a pedido do Gustavo em 15/11/2026 (nada disso está planejado nem aprovado):

- **Segunda área do projeto sobre Lora.** Ele pediu só para anotar; o escopo está em aberto.
- **Acabamento da instalação:** preço e mais opções de grampo, canaleta ou eletroduto para os circuitos de tomada, e prateleira para bateria e inversor.

O objetivo do projeto, nas palavras dele em 15/11/2026: aprender sobre instalação solar off-grid e ter uma noção da autonomia do conjunto.
