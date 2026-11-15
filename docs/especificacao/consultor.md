# Especificação do consultor

O consultor é a parte do simulador que olha a montagem e diz o que está errado, o que é arriscado e o que pode melhorar. Vale para `src/nucleo/consultor.ts` e para o painel do consultor.

## 1. Como funciona

`analisarConsultor(projeto, catalogo, analise, estimativas)` devolve uma lista de sugestões. Cada sugestão tem:

- **`regra`**: o identificador da regra, da tabela abaixo.
- **`nivel`**: `erro` (não funciona ou é perigoso), `alerta` (funciona, mas mal ou com risco) ou `dica` (melhoria).
- **`titulo`** e **`texto`**: o que aparece na tela, em linguagem de iniciante. O título diz o problema; o texto diz o motivo e o que fazer.
- **`alvos`**: os `uid` dos dispositivos e cabos envolvidos, para a cena destacar.
- **`acao`**, quando existe: o conserto de um clique.

Ordem da lista: primeiro os erros, depois os alertas, depois as dicas; dentro de cada nível, a ordem das tabelas. Sem `analise.sistema`, só vale a regra `sem-inversor`.

Nos textos, o que está entre chaves é calculado. Os números seguem as convenções de tela: vírgula decimal, tensão e corrente com uma casa.

## 2. Regras de ligação

| Regra | Nível | Quando | Título | Texto |
|---|---|---|---|---|
| `sem-inversor` | dica | Problema `sem-inversor` | Falta o inversor | O inversor transforma a energia da bateria na energia das tomadas. Arraste um para a parede do quartinho. |
| `varios-inversores` | alerta | Problema `varios-inversores` | Há mais de um inversor | A simulação usa só o primeiro. Remova os outros ou deixe-os sem cabos. |
| `sem-bateria` | erro | Problema `sem-bateria` | O inversor está sem bateria | Ligue o positivo da bateria no terminal BAT+ do inversor e o negativo no BAT−. Sem bateria, o inversor não liga. |
| `curto-bateria` | erro | Problema `curto-bateria` | Curto-circuito na bateria | O positivo e o negativo da bateria estão ligados entre si. Em uma bateria de verdade isso derrete o cabo em segundos. Desfaça essa ligação. |
| `bateria-invertida` | erro | Problema `bateria-invertida` | Bateria ligada ao contrário | O positivo da bateria vai no BAT+ e o negativo no BAT−. Invertida, ela queima o inversor na hora. |
| `bateria-solta` | alerta | Problema `bateria-solta` | Bateria sem circuito fechado | Esta bateria tem cabo em um polo só. Ligue os dois polos para ela entrar no banco. |
| `ramos-desiguais` | erro | Problema `ramos-desiguais` | Baterias em paralelo com tensões diferentes | Só se liga em paralelo o que tem a mesma tensão. Confira quantas baterias há em cada série. |
| `baterias-misturadas` | alerta | Problema `baterias-misturadas` | Baterias de modelos diferentes | Baterias do mesmo banco devem ser do mesmo modelo e da mesma idade. Misturadas, a mais fraca trabalha demais e estraga antes. |
| `curto-placas` | erro | Problema `curto-placas` | Curto-circuito nas placas | O positivo e o negativo das placas estão ligados entre si. A placa não queima, mas não gera nada. Desfaça essa ligação. |
| `placa-invertida` | erro | Problema `placa-invertida` | Placa ligada ao contrário | O positivo da fileira vai no PV+ e o negativo no PV−. |
| `placa-solta` | alerta | Problema `placa-solta` | Placa sem circuito fechado | Esta placa não está gerando: falta ligar um dos polos. |
| `fileiras-desiguais` | erro | Problema `fileiras-desiguais` | Fileiras com número diferente de placas | Fileiras em paralelo precisam ter a mesma quantidade de placas. A fileira menor derruba a tensão das outras. |
| `placas-misturadas` | alerta | Problema `placas-misturadas` | Placas de modelos diferentes | Em série, a placa de menor corrente limita as outras. Use o mesmo modelo no arranjo. |
| `saida-na-rede` | erro | Problema `saida-na-rede` | A saída do inversor está ligada na rede da casa | Nunca ligue a saída do inversor em uma tomada da rede. Na queda de luz você manda energia para a rua, onde pode haver alguém trabalhando no fio, e quando a luz volta as duas fontes se chocam. A saída vai só para os aparelhos. |
| `peca-repetida` | erro | Problema `peca-repetida` | Série e paralelo misturados | Esta peça está em dois caminhos ao mesmo tempo. Monte cada série completa, com a mesma quantidade de peças, e só então junte as séries em paralelo pelas pontas. Os números da tela contam só o primeiro caminho. |
| `placas-no-banco` | erro | Problema `placas-no-banco` | Placas e bateria ligadas direto | O circuito das placas e o da bateria só se encontram dentro do inversor ou do controlador de carga. Ligados direto, a placa sobrecarrega a bateria ou a bateria descarrega na entrada das placas. Placa vai em PV+ e PV−; bateria vai em BAT+ e BAT−. |

## 3. Regras de compatibilidade

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `tensao-do-banco` | erro | Tensão do banco diferente de `inversor.tensaoBateria` | Bateria de {12} V em inversor de {24} V | Banco menor: "O inversor precisa de {24} V. Ligue {2} baterias de {12} V em série, o negativo de uma no positivo da outra, ou troque por uma bateria de {24} V." Banco maior: "A tensão do banco é maior que a do inversor e pode queimá-lo. Refaça a ligação." | |
| `tensao-do-controlador` | erro | Controlador com `batPos` em `P` e `batNeg` em `N` cujo `tensoesBateria` não inclui a tensão nominal do banco | Controlador de {12/24} V em banco de {48} V | Este controlador não foi feito para a tensão deste banco e queima. Use um controlador que aceite {48} V. | Ver controladores |
| `tensao-de-saida` | erro | `inversor.saidaV` diferente de `projeto.tensaoRede` | Inversor de {220} V em casa de {127} V | Inversor de 220 V: "Aparelho de 127 V queima em 220 V. Use um inversor com saída de 110 a 127 V." Inversor de 127 V em casa de 220 V: "Aparelho de 220 V não funciona direito em 127 V. Use um inversor com saída de 220 V." | Ver inversores |
| `aparelho-tensao` | erro | Aparelho ligado na saída, não bivolt, com tensão diferente de `inversor.saidaV` | {Geladeira} é de {127} V e o inversor entrega {220} V | Ligar um aparelho na tensão errada queima o aparelho ou o deixa sem força. | |
| `onda-modificada` | alerta | Inversor de onda modificada com carga ligada que é eletrônica ou tem motor | Inversor de onda modificada com {PC de trabalho} | Onda modificada esquenta motores e pode travar ou danificar fontes de computador e nobreaks. Para esses aparelhos use inversor de onda senoidal pura. | Ver inversores |
| `bateria-automotiva` | alerta | Banco com bateria de química `automotiva` | Bateria de carro não serve para este uso | Ela foi feita para dar partida, com descargas curtas. Descarregada a fundo algumas dezenas de vezes, perde a capacidade. Use bateria estacionária ou de lítio. | Ver baterias |
| `item-nao-recomendado` | alerta | Dispositivo ou cabo cujo item tem `naoRecomendado` | {nome do item}: não recomendado | O texto de `naoRecomendado` do item. | Em cabo: trocar pelo cabo de cobre de mesma seção |

## 4. Regras das placas e da entrada solar

Só valem quando há fileira completa, menos `placa-na-sombra`, que vale para qualquer placa do projeto: o aviso é útil antes de puxar o cabo. `n` é o número de placas por fileira e `f` o número de fileiras.

Com placas de modelos diferentes, `vocFrio`, `vmpQuente` e `n × vmp` de uma fileira são a soma dos valores de cada placa dela, e as regras usam a pior fileira (a maior para os limites de cima, a menor para a tensão mínima). Sem banco, `tensaoCarga` é `inversor.tensaoBateria × 1,17`.

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `placas-abaixo-da-tensao` | erro | MPPT: `vmpQuente(placa, n) < máx(vMin; tensaoCarga + 2)`. PWM: `vmpQuente(placa, n) < tensaoCarga + 1` | As placas não alcançam a tensão mínima da entrada | "{Uma placa entrega} cerca de {37,9} V no calor, e esta entrada só trabalha a partir de {60} V. Com {2} placas em série a tensão sobe para {75,8} V." Se o número necessário de placas passar de `vocMax`: "Esta entrada não combina com esta placa. Escolha outro inversor ou controlador." | Acrescentar placa em série, ou ver inversores |
| `placas-acima-do-limite` | erro | `vocFrio(placa, n) > vocMax` | Tensão das placas acima do limite da entrada | Em manhã fria esta fileira chega a {162,3} V e a entrada aguenta {150} V. Isso queima o equipamento. Use menos placas em série. | |
| `placas-acima-da-faixa` | alerta | `n × vmp > vMax`, sem a regra anterior | Tensão das placas acima da faixa de trabalho | A fileira trabalha em {131,5} V e a entrada aproveita até {115} V. Parte da geração se perde. Use menos placas em série. | |
| `corrente-das-placas` | erro | `correnteEntradaMaxA` definida e `f × isc` maior que ela | Corrente das placas acima do que a entrada aceita | {2} fileiras em paralelo somam {28,4} A e a entrada aceita {18} A. Ligue as placas em série: a corrente fica a de uma placa e a tensão soma. | |
| `potencia-das-placas` | alerta | Soma de `wp` maior que `potenciaMaxW` | Placas além da potência da entrada | São {4.680} W de placas para uma entrada de {4.000} W. Funciona, mas o que passar disso é desperdiçado. | |
| `pwm-desperdica` | alerta | PWM e `1 − tensaoCarga / (n × vmp × 0,90)` maior que 0,15 | O controlador PWM desperdiça cerca de {29}% desta placa | O PWM prende a placa na tensão da bateria, {28,1} V, e esta placa rende mais perto de {39} V. Um controlador MPPT aproveita essa diferença. | Ver controladores |
| `placa-na-sombra` | alerta | `perdaSombra` da placa maior que 0,20 | Esta placa perde {31}% da geração para a sombra. Com mais de uma placa sombreada sai uma só sugestão, com todas em `alvos`: "{N} placas perdem geração para a sombra" | A sombra da casa ou do que está em volta dela cobre a placa em parte do dia. Mude a placa de lugar ou gire a casa para testar outra posição do telhado. Com mais de uma placa: "A mais afetada perde {71}%. A sombra da casa ou do que está em volta dela cobre essas placas em parte do dia. Mude as placas de lugar ou gire a casa para testar outra posição." | |
| `sem-placas` | dica | Entrada solar sem fileira e nenhum problema de placa | Sem placas, a bateria só recarrega pela rede | Arraste uma placa para o telhado e ligue o positivo no PV+ e o negativo no PV−. | Ver placas |

## 5. Regras das cargas e do inversor

"Cargas ligadas" são os aparelhos com cabo na saída do inversor e com o botão em ligado.

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `sobrecarga` | erro | Soma de `potenciaW` das cargas ligadas maior que `inversor.potenciaW` | Aparelhos demais para o inversor | O que está ligado soma {5.960} W e o inversor entrega {3.000} W. Ele desarma. Desligue algo ou use um inversor maior. | Desligar o aparelho de maior potência |
| `pico-de-partida` | alerta | Para alguma carga ligada com motor: soma de `potenciaW` das outras mais o `picoW` dela é maior que `inversor.picoW` | O inversor pode não aguentar a partida de {Geladeira} | Motor puxa várias vezes a potência normal no instante em que liga. Aqui a partida chega a {1.275} W e o inversor aguenta {1.000} W de pico. | |
| `corrente-da-bateria` | alerta | `(soma de potenciaW / rendimento + consumoVazioW) / tensaoRef` maior que `descargaMaxA` do banco | A bateria desliga com esta carga | Os aparelhos ligados puxam {112,4} A da bateria, e a proteção interna dela corta em {100} A. Acrescente uma bateria em paralelo ou desligue algo. | Acrescentar bateria |

| `rede-desligada` | dica | Inversor com `carregadorRedeA` e `redeLigada` falso | O inversor não está ligado na rede | Com a entrada CA ligada na rede, o inversor mantém a bateria cheia e passa a energia direto para os aparelhos. Na queda de luz ele assume sozinho. | |
| `carga-acima-da-bateria` | dica | `correnteCargaA` das placas (se há fileira) mais `mín(carregadorRedeA; 20)` (se a rede está ligada) maior que `cargaMaxA` do banco | Limite a corrente de carga no inversor | As placas e a rede juntas podem carregar a {120} A e esta bateria aceita {50} A. Ajuste o limite de carga no menu do inversor. | |
Em `corrente-da-bateria` e em `autonomia-curta`, quando cada ramo tem mais de uma bateria em série, o texto troca "uma bateria em paralelo" e "mais uma bateria igual em paralelo" por "mais um ramo igual, de {2} baterias em série, em paralelo", e a sugestão sai sem ação: a ação `mais-bateria` só existe para ramos de uma bateria. Com placas de modelos diferentes, `corrente-das-placas` soma a maior `isc` de cada fileira.

No problema `peca-repetida`, as peças que ficaram só no caminho descartado entram nos alvos e não geram `bateria-solta` nem `placa-solta`. Em `tensao-da-protecao` contam todas as proteções instaladas, inclusive o DPS.

## 6. Regras de proteção e de cabos

Circuitos: `bateria` (cabos das redes do banco e emendas entre baterias), `placas` (cabos das redes das placas e emendas entre placas), `saida` (cabos entre a saída CA e os aparelhos) e `entrada` (cabos entre a entrada CA e a tomada da rede). Para não repetir, cada regra gera uma sugestão por circuito, com todos os cabos envolvidos em `alvos`.

"Proteção de corrente" é fusível ou disjuntor. Em circuito de corrente contínua (`bateria` e `placas`) só contam `fusivel` e `disjuntorCC`: disjuntor de corrente alternada não apaga o arco da corrente contínua. A tensão de cada circuito, para conferir a proteção, é `tensaoCarga` na bateria, o `vocFrio` da pior fileira nas placas e `tensaoRede` na saída e na entrada. A capacidade exigida de um cabo é o maior valor entre a corrente de projeto dele e a corrente da proteção instalada nele.

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `sem-protecao-da-bateria` | erro | Banco externo e algum ramo sem `fusivel` nem `disjuntorCC` nos cabos do caminho entre o `pos` da primeira bateria do ramo e `inversor.batPos` (o caminho da árvore da rede `P`, seção 9 do núcleo). Proteção no cabo do controlador ou em outro ramo não conta | Falta fusível entre a bateria e o inversor | Em um curto, uma bateria de lítio entrega centenas de ampères. O fusível fica no cabo positivo, o mais perto possível da bateria, e é ele que abre antes de o cabo pegar fogo. | Instalar a proteção escolhida no cabo ligado ao positivo de cada ramo |
| `sem-protecao-do-controlador` | erro | Banco externo, controlador externo em uso com cabo em `batPos`, e nenhum cabo ligado ao `batPos` do controlador com `fusivel` ou `disjuntorCC`. Pedida pelo Gustavo em 15/11/2026, depois da revisão do tutorial | Falta proteção no cabo do controlador até a bateria | Todo cabo que sai do positivo da bateria precisa de fusível ou disjuntor próprio, perto dela: em um curto, é ele que abre antes de o cabo pegar fogo. Este controlador carrega com até {30} A: a proteção fica pelo menos 10% acima disso e abaixo do que o cabo aguenta. | Instalar no cabo do `batPos` do controlador a menor proteção de corrente com `correnteA ≥ 1,1 × correnteCargaA` do controlador (a mesma folga de `protecao-pequena`) e `tensaoMaxV ≥ tensaoCarga`. Para o `ctl-pwm-30a` o catálogo dá o `prot-disjuntor-cc-80`: não há proteção de corrente contínua entre 32 e 80 A |
| `protecao-de-ca-em-cc` | erro | Cabo dos circuitos `bateria` ou `placas` com `disjuntorCA` | Disjuntor de tomada em cabo de corrente contínua | O disjuntor comum de quadro de luz é feito para corrente alternada. Em corrente contínua ele pode não conseguir interromper o curto e pegar fogo. Use fusível ou disjuntor de corrente contínua. | |
| `tensao-da-protecao` | erro | Proteção com `tensaoMaxV` menor que a tensão do circuito do cabo, sem a regra anterior | Proteção de {32} V em circuito de {56,2} V | Acima da tensão para a qual foi feita, a proteção pode não interromper o curto. Use uma proteção para pelo menos {56,2} V. | |
| `protecao-maior-que-o-cabo` | erro | Cabo cuja capacidade é menor que a corrente da proteção instalada nele | Fusível de {150} A em cabo que aguenta {125} A | O fusível existe para abrir antes de o cabo esquentar. Aqui o cabo esquenta primeiro. Use um cabo mais grosso ou um fusível menor. | Trocar os cabos do circuito pelo menor cabo de cobre que atende |
| `cabo-fino` | erro | Cabo cuja capacidade é menor que a corrente de projeto, sem a regra anterior | Cabo fino para a corrente | Por este cabo passam até {40,1} A e ele aguenta {32} A. Cabo sobrecarregado esquenta e derrete a capa. | Trocar pelo menor cabo de cobre que atende |
| `protecao-pequena` | alerta | Bateria: proteção menor que `1,1 ×` a corrente de projeto. Demais circuitos: proteção menor que a corrente de projeto | A proteção vai abrir em uso normal | Com tudo na potência máxima passam {127,4} A por aqui, e esta proteção é de {100} A. Ela serve se o uso ficar abaixo disso. | |
| `queda-de-tensao` | alerta | Queda do circuito acima do limite: 3% nas placas, 2% na bateria, 4% nos aparelhos | Perda alta no cabo {das placas} | Este trecho perde {6,9}% da energia no caminho, e o recomendado é até {3}%. Um cabo de {16} mm² resolve. Nas placas, ligar em série também resolve, porque a corrente cai. | Trocar pelo menor cabo de cobre que fica dentro do limite |
| `cabo-de-bateria-sobrando` | dica | Circuito `bateria` com todos os ramos protegidos, sem `protecao-maior-que-o-cabo`, `cabo-fino` nem `queda-de-tensao`, só com cabos de cobre recomendados, e existe um cabo de `uso` bateria mais fino que atende. A capacidade exigida é a maior do circuito inteiro (corrente de projeto ou proteção de qualquer cabo dele), e a queda do circuito, refeita com a troca, tem de ficar dentro do limite | O cabo da bateria pode ser mais fino | Estes cabos precisam aguentar {100} A, que é o maior valor entre a corrente de uso e a proteção instalada. O cabo de {25} mm² aguenta {125} A e mantém a perda dentro do limite. Cabo mais grosso não faz mal, só custa mais. | Trocar os cabos de bateria mais grossos que ele pelo menor cabo de cobre que atende |
| `sem-dps-nas-placas` | dica | Há fileira e nenhum cabo das placas com DPS | Proteja a entrada das placas contra raios | Placa no telhado capta surtos de raios que caem por perto. O DPS de corrente contínua desvia o surto para o aterramento antes de ele chegar ao inversor. | Instalar DPS no cabo ligado ao PV+ |
| `sem-disjuntor-nas-placas` | dica | Há fileira e nenhum cabo das placas com disjuntor de corrente contínua | Ponha um disjuntor entre as placas e o inversor | Placa não tem botão de desligar: enquanto houver sol, há tensão no cabo. O disjuntor de corrente contínua deixa você desligar as placas para mexer no inversor com segurança. | Instalar disjuntor no cabo ligado ao PV+ |
| `sem-disjuntor-na-saida` | dica | Há carga e algum cabo ligado à saída CA sem disjuntor de corrente alternada | Ponha disjuntor nos circuitos de saída | Cada circuito que sai do inversor precisa de um disjuntor, como no quadro de luz da casa. Ele desliga o circuito se um aparelho entrar em curto. | Instalar disjuntor em cada cabo da saída |

Escolha da peça nas ações:

- **Proteção da bateria:** a menor proteção de corrente do catálogo com `correnteA ≥ 1,1 × iBateria` e `tensaoMaxV ≥ tensaoCarga`. Se nenhuma atende, a maior.
- **Disjuntor das placas:** o menor `disjuntorCC` com `correnteA ≥` corrente de projeto do cabo e `tensaoMaxV ≥ vocFrio` da fileira.
- **DPS das placas:** o menor `dps` com `tensaoMaxV ≥ vocFrio` da fileira.
- **Disjuntor da saída:** o menor `disjuntorCA` com `correnteA ≥ 1,25 ×` corrente do cabo.
- **Cabo:** entre os cabos do mesmo `uso`, de cobre e sem `naoRecomendado`, o de menor seção que atende. Se nenhum atende, o de maior seção.

## 7. Regras de autonomia e de energia

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `autonomia-curta` | alerta | `autonomiaHoras` menor que 8 | Com o que está ligado, a bateria dura {4,1} horas | Para atravessar uma noite são umas 12 horas. Com mais uma bateria igual em paralelo, a autonomia vai para {8,2} horas. Desligar {PC de trabalho} sozinho leva a {5,6} horas. Essa conta supõe tudo ligado ao mesmo tempo; em uma queda de luz de verdade costuma durar mais, porque nem tudo fica ligado o tempo todo. | Acrescentar bateria |
| `geracao-menor-que-o-consumo` | alerta | `geracaoDiaKwh` maior que zero e menor que `consumoDiaKwh` | As placas repõem {54}% do que os aparelhos gastam em um dia | Geração do dia: {4,74} kWh. Consumo: {8,85} kWh. A diferença sai da bateria e depois da rede. Para fechar a conta faltam cerca de {2} placas. | Acrescentar placa |

No texto de `autonomia-curta`, o aparelho citado é a carga ligada de maior `mediaW`. Em `geracao-menor-que-o-consumo`, as placas que faltam são `(consumo − geração) / (geração por placa)`, arredondado para cima.

## 8. Ações

O núcleo só descreve a ação; quem executa é o aplicativo, porque várias delas mexem na cena.

| Ação | O que faz |
|---|---|
| `proteger-cabos` | Acrescenta a proteção indicada em cada cabo listado |
| `trocar-cabos` | Troca o tipo de cada cabo listado pelo cabo indicado |
| `mais-placa` | Acrescenta uma placa do mesmo modelo ao lado da última e refaz os cabos, em série ou em paralelo, conforme `planejarMaisPlaca` |
| `mais-bateria` | Acrescenta uma bateria do mesmo modelo ao lado da última e a liga em paralelo, positivo com positivo e negativo com negativo, com o mesmo tipo de cabo do banco |
| `desligar` | Desliga o aparelho indicado |
| `ver-catalogo` | Abre o catálogo na categoria indicada |

`planejarMaisPlaca(projeto, catalogo, analise)` decide como a nova placa entra:

- Sem entrada solar: `null`.
- Sem fileira: `serie` (é a primeira placa).
- MPPT com uma fileira: `serie`, se `vocFrio(placa, n + 1) ≤ vocMax` e `(n + 1) × vmp ≤ vMax`.
- Senão, com `n = 1`: `paralelo`, se `correnteEntradaMaxA` não existe ou `(f + 1) × isc` cabe nela, e, em PWM, se `(f + 1) × imp ≤ correnteCargaA`.
- Senão: `null`. A ação `mais-placa` não é oferecida, e o texto da regra passa a terminar com "Esta entrada não aceita mais placas deste modelo."
