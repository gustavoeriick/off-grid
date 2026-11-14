# Casos de teste

Os números desta página dizem quando uma tarefa está pronta. Eles saíram de [scripts/referencia/valores-de-referencia.mjs](../../scripts/referencia/valores-de-referencia.mjs), que implementa as fórmulas da especificação de forma mínima. Para recalcular: `node scripts/referencia/valores-de-referencia.mjs`.

Tolerância, salvo indicação: 0,5% do valor esperado, ou 0,01 nos valores pequenos. Um teste que não passa é relatado com a conta; a tolerância não é alterada.

## 1. Cenários

Os dois cenários ficam em `src/nucleo/cenarios.ts` e servem aos testes, ao relatório em texto e à tela inicial. No núcleo, as posições são zero; a cena as define.

### "Plano no papel"

É o plano elétrico do Gustavo como foi escrito: uma placa, uma bateria, cabo de 25 mm² com fusível de 150 A.

Projeto: local `rio`, clima `tipico`, `tensaoRede` 127, prioridade `rede`, casa com os valores iniciais.

| `uid` | Item | Ligado |
|---|---|---|
| `placa1` | `placa-renepv-585` | |
| `inversor` | `inv-anenji-3kw-24v-127` | |
| `bateria1` | `bat-alfx-24v-100` | |
| `rede` | `rede-tomada` | |
| `ap-rede` | `ap-rede` | sim |
| `ap-pc-24h` | `ap-pc-24h` | sim |
| `ap-pc-trabalho` | `ap-pc-trabalho` | sim |
| `ap-geladeira` | `ap-geladeira` | sim |
| `ap-ventilador` | `ap-ventilador` | sim |
| `ap-tv` | `ap-tv` | sim |

| `uid` | De | Para | Cabo | Metros | Proteções |
|---|---|---|---|---|---|
| `c1` | `placa1.pos` | `inversor.pvPos` | `cabo-solar-6` | 12 | `prot-disjuntor-cc-32` |
| `c2` | `placa1.neg` | `inversor.pvNeg` | `cabo-solar-6` | 12 | |
| `c3` | `bateria1.pos` | `inversor.batPos` | `cabo-bat-25` | 1 | `prot-fusivel-anl-150` |
| `c4` | `bateria1.neg` | `inversor.batNeg` | `cabo-bat-25` | 1 | |
| `c5` | `inversor.caEntrada` | `rede.tomada` | `cabo-ca-2p5` | 2 | |
| `c6` | `inversor.caSaida` | `ap-rede.plug` | `cabo-ca-2p5` | 14 | |
| `c7` | `inversor.caSaida` | `ap-pc-24h.plug` | `cabo-ca-2p5` | 14 | |
| `c8` | `inversor.caSaida` | `ap-pc-trabalho.plug` | `cabo-ca-2p5` | 15 | |
| `c9` | `inversor.caSaida` | `ap-geladeira.plug` | `cabo-ca-2p5` | 12 | |
| `c10` | `inversor.caSaida` | `ap-ventilador.plug` | `cabo-ca-2p5` | 10 | |
| `c11` | `inversor.caSaida` | `ap-tv.plug` | `cabo-ca-2p5` | 10 | |

### "Plano corrigido"

É o cenário anterior depois das correções que o consultor propõe:

- Mais uma placa, `placa2`, em série: `c2` passa a ligar `placa2.neg` a `inversor.pvNeg` (12 m) e entra `c12`, de `placa1.neg` a `placa2.pos`, com `cabo-solar-6` e 1,5 m.
- `c3` e `c4` passam a `cabo-bat-35`.
- `c1` ganha `prot-dps-cc-600`, além do disjuntor.
- `c6` a `c11` ganham `prot-disjuntor-ca-16`.

Nos testes do núcleo que precisam de sol, as placas ficam a 17° voltadas para o norte, sem sombra: `ambienteSemSombra(normalDoPlano(17, 0))`.

## 2. Sol (tarefa 1.3)

Tolerância de 0,05° contra a tabela. A hora local do Rio é UTC − 3.

| Lugar e instante local | Azimute | Elevação |
|---|---|---|
| Rio (−22,9; −43,2), 21/06/2026 12:00 | 358,30 | 43,64 |
| Rio, 21/06/2026 08:00 | 54,83 | 16,55 |
| Rio, 21/06/2026 16:00 | 303,74 | 14,52 |
| Rio, 21/12/2026 12:00 | 255,08 | 87,85 |
| Rio, 21/12/2026 07:00 | 106,55 | 23,95 |
| Rio, 20/03/2026 12:00 | 0,13 | 67,09 |
| Rio, 21/06/2026 00:00 | 66,52 | −88,64 |
| Fortaleza (−3,73; −38,52), 21/12/2026 12:00 | 198,19 | 69,18 |
| Porto Alegre (−30,03; −51,23), 21/06/2026 12:00 | 7,61 | 36,15 |

Mais dois testes de sentido físico: no Rio, ao meio-dia de 21/06, `direcaoSol` tem `z` negativo (o sol está ao norte); `normalDoPlano(17, 0)` é (0; 0,9563; −0,2924).

## 3. Irradiação (tarefa 1.3)

Rio, dia 15 de cada mês de 2026, clima típico, passo de 5 minutos. "No plano" é a irradiação diária em um plano a 17° voltado para o norte, sem sombra.

| Mês | Fator do clima | GHI do dia (kWh/m²) | No plano (kWh/m²) | PVGIS no plano | Desvio |
|---|---|---|---|---|---|
| 1 | 0,689 | 5,78 | 5,54 | 5,78 | −4,2% |
| 2 | 0,750 | 5,97 | 5,83 | 6,24 | −6,5% |
| 3 | 0,713 | 5,14 | 5,18 | 5,71 | −9,2% |
| 4 | 0,741 | 4,52 | 4,77 | 5,19 | −8,0% |
| 5 | 0,721 | 3,68 | 4,01 | 4,46 | −10,2% |
| 6 | 0,754 | 3,46 | 3,90 | 4,20 | −7,1% |
| 7 | 0,756 | 3,64 | 4,07 | 4,43 | −8,0% |
| 8 | 0,751 | 4,26 | 4,60 | 4,76 | −3,4% |
| 9 | 0,674 | 4,57 | 4,66 | 4,86 | −4,2% |
| 10 | 0,649 | 5,00 | 4,94 | 4,90 | +0,8% |
| 11 | 0,610 | 5,05 | 4,90 | 5,07 | −3,4% |
| 12 | 0,656 | 5,56 | 5,32 | 5,52 | −3,6% |

Critérios:

- O GHI do dia é igual ao `ghiMensal` do mês, com tolerância de 0,5%.
- A coluna "No plano" bate com a tabela, com tolerância de 1%.
- O desvio contra o PVGIS fica dentro de ±12% em todos os meses. O PVGIS é a base europeia de referência; a diferença vem de a NASA medir um pouco menos sol e de o dia típico ter mais luz difusa.

Céu limpo, perto do meio-dia solar, tolerância de 1%:

| Instante local no Rio | Elevação | GHI | DNI | DHI | No plano | `tAmb` |
|---|---|---|---|---|---|---|
| 21/06/2026 11:55 | 43,66 | 698 | 836 | 121 | 845 | 24,3 |
| 21/12/2026 11:51 | 89,46 | 1037 | 832 | 205 | 997 | 27,4 |

À noite todas as irradiâncias são zero. Climas `nublado` e `chuvoso` dão 35% e 15% do GHI de céu limpo no mesmo instante.

## 4. Placa (tarefa 1.5)

`placa-renepv-585`: 585 W, `voc` 52,01, `vmp` 43,83.

| Irradiância | Ambiente | Célula | Potência | Tensão | Corrente |
|---|---|---|---|---|---|
| 1000 W/m² | 25 °C | 58,8 °C | 479,8 W | 39,39 V | 12,18 A |
| 800 W/m² | 20 °C | 47,0 °C | 401,7 W | 40,94 V | 9,81 A |
| 500 W/m² | 30 °C | 46,9 °C | 251,2 W | 40,95 V | 6,13 A |
| 200 W/m² | 25 °C | 31,8 °C | 106,2 W | 42,94 V | 2,47 A |
| 10 W/m² | 25 °C | 25,0 °C | 0 | 0 | 0 |

| Fileira | `vocFrio` | `vmpQuente` |
|---|---|---|
| 1 placa | 54,12 V | 37,91 V |
| 2 em série | 108,23 V | 75,83 V |
| 3 em série | 162,35 V | 113,74 V |

## 5. Fileiras e entrada solar (tarefa 1.5)

Placas Renepv a 25 °C de ambiente. Bateria de 24 V: `tensaoCarga` 28,08 V.

| Caso | Entrada | Esperado |
|---|---|---|
| 1 placa a 1000 W/m² | Anenji (MPPT, 60 a 450 V) | `p` 0; aviso `placas-tensao-baixa` |
| 2 em série a 1000 W/m² | Anenji | Fileira com 959,6 W, 78,78 V e 12,18 A; `p` 930,8 W; sem aviso |
| 2 em série, uma a 1000 e outra a 200 W/m² | Anenji | Fileira com 479,8 W em 39,39 V (a placa sombreada é desviada; sem desvio seriam 203,7 W); `p` 0; aviso `placas-tensao-baixa` |
| 2 fileiras de 1 placa, em paralelo, a 1000 W/m² | Anenji | `p` 0; aviso `placas-tensao-baixa` |
| 1 placa a 1000 W/m² | `ctl-epever-xtra4210n` (MPPT, até 92 V) | `p` 465,4 W |
| 1 placa a 1000 W/m² | `ctl-pwm-30a` (PWM) | `p` 342,0 W; o PWM entrega 26,5% menos que o MPPT |
| 3 em série a 1000 W/m² | `ctl-epever-xtra4210n` | `p` 0; aviso `placas-tensao-alta` (118,2 V acima de 92 V) |
| Sem fileiras | Qualquer | `p` 0; sem aviso |

## 6. Bateria e passo de simulação (tarefa 1.5)

`infoBanco` do cenário "plano no papel": `tensao` 24; `tensaoRef` 25,60; `tensaoCarga` 28,08; `ah` 100; `wh` 2.560; `whUtil` 2.304; `socMin` 0,10; `descargaMaxA` 100; `cargaMaxA` 50.

Duas `bat-moura-12mn105` em série: `tensao` 24; `tensaoRef` 24; `ah` 105; `wh` 2.520; `whUtil` 1.260; `socMin` 0,50. Duas `bat-alfx-24v-100` em paralelo: `ah` 200; `descargaMaxA` 200.

Autonomia de 1 bateria Alfx no Anenji (rendimento 0,92; consumo sem carga 45 W):

| Carga em CA | Potência na bateria | Corrente | Autonomia |
|---|---|---|---|
| 465 W (tudo ligado) | 550,4 W | 21,5 A | 4,08 h |
| 300 W | 371,1 W | 14,5 A | 6,05 h |
| 200 W | 262,4 W | 10,2 A | 8,56 h |
| 110 W | 164,6 W | 6,4 A | 13,65 h |
| 40 W | 88,5 W | 3,5 A | 25,39 h |

Passos, sempre sobre o "plano no papel", com `dtHoras` de 1/12, sem sol e com `horaLocal` nulo (horários ignorados), salvo indicação:

| Caso | Entrada | Esperado |
|---|---|---|
| Queda de luz | `redeDisponivel` falso, começando em `soc` 1 | `cargaAtendidaW` 465; `bateriaW` −550,4; `origem` `bateria`; `soc` cai 0,018377 por passo: 0,7795 após 12 passos, 0,5590 após 24, 0,1179 após 48 |
| Bateria vazia | Continuação do caso anterior | No 49º passo (4,08 h): aviso `bateria-vazia`, `cortado` verdadeiro, `soc` 0,10, cerca de 97,5% da carga atendida. No 50º: `cargaAtendidaW` 0 |
| Rede presente | `redeDisponivel` verdadeiro, `soc` 0,5 | `origem` `rede`; `cargaAtendidaW` 465; a bateria carrega a 561,6 W; `soc` sobe 0,017824; `redeW` 1.071,6 |
| Rede presente, bateria cheia | `soc` 1 | `bateriaW` 0; `redeW` 510 |
| Sobrecarga | Queda de luz, com um aparelho de teste de 3.200 W ligado | Aviso `sobrecarga`; `cargaAtendidaW` 0 |
| Limite da bateria | Queda de luz, só um aparelho de teste de 2.400 W ligado | Aviso `bms` (103,7 A, acima de 100 A); `cargaAtendidaW` 0; `soc` não muda |
| Sol sobrando | "Plano corrigido", queda de luz, placas a 1000 W/m² e 25 °C, `soc` 0,5 | `pvW` 930,8; cargas atendidas; `bateriaW` +380,4; `origem` `solar` |
| Religamento | Depois de vazia, com sol e sem carga ligada | `cortado` volta a falso quando `soc` chega a 0,15 |
| Sem sistema | Projeto vazio | Tudo zero; `origem` `nenhuma` |
| Horário de uso às 20:00 | Queda de luz, `horaLocal` 20 | `cargaPedidaW` 330: o PC de trabalho (8 às 18) está fora do horário; `bateriaW` −403,7 |
| Horário de uso às 23:30 | Queda de luz, `horaLocal` 23,5 | `cargaPedidaW` 200: ficam modem, PC 24 h e geladeira; `bateriaW` −262,4 |
| Horário definido pelo usuário | Como o anterior, com `uso` da TV trocado para 20 às 2 | `cargaPedidaW` 280 |
| Desligado manda mais | `horaLocal` 20, TV com `ligado` falso | `cargaPedidaW` 250 |

## 7. Circuito (tarefa 1.4)

| Caso | Esperado |
|---|---|
| "Plano no papel" | `inversor` é `inversor`; `fileiras` `[[placa1]]`; `banco` `[[bateria1]]`; `cargas` com os seis aparelhos; `redeLigada` verdadeiro; `naRede` vazio; nenhum problema |
| "Plano corrigido" | `fileiras` `[[placa1, placa2]]`; nenhum problema |
| Três placas, cada uma ligada direto em `pvPos` e `pvNeg` | Três fileiras de uma placa |
| Duas fileiras de duas placas | `[[a, b], [c, d]]` |
| Uma fileira de duas e outra de uma, em paralelo | Problema `fileiras-desiguais` |
| Placa com `pos` em `pvNeg` e `neg` em `pvPos` | Nenhuma fileira; problema `placa-invertida` |
| Um cabo de `pvPos` a `pvNeg` | Problema `curto-placas` |
| Placa só com o `pos` ligado | Problema `placa-solta` |
| Placas de dois modelos na mesma fileira | Problema `placas-misturadas` |
| Duas `bat-moura-12mn105` em série | `banco` `[[b1, b2]]` |
| Duas `bat-alfx-24v-100` em paralelo | `banco` `[[b1], [b2]]` |
| Uma bateria de 12 V e uma de 24 V em paralelo | Problema `ramos-desiguais` |
| Bateria invertida | Problema `bateria-invertida` |
| Inversor sem bateria ligada | Problema `sem-bateria` |
| Só uma placa no projeto | `sistema` nulo; problema `sem-inversor` |
| Projeto vazio | `sistema` nulo; nenhum problema |
| Inversor simples de 12 V, bateria de 12 V, `ctl-pwm-30a` no barramento e uma placa no controlador | `controlador` preenchido; `entradaSolar` é a do controlador; uma fileira |
| `inversor.caSaida` ligada em `rede.tomada` | Problema `saida-na-rede` |
| Aparelho ligado só em `rede.tomada` | Aparece em `naRede`, não em `cargas` |
| Estação portátil com um aparelho | `banco` vazio; nenhum problema `sem-bateria` |

## 8. Cabos (tarefa 1.6)

Corrente de projeto no "plano no papel":

| Cabo | Corrente de projeto |
|---|---|
| `c1`, `c2` | 17,75 A (1,25 × 14,2) |
| `c3`, `c4` | 127,4 A |
| `c9` (geladeira) | 1,18 A (150 W em 127 V) |
| `c5` (entrada CA) | 8,56 A ((525 + 20 × 28,08) / 127) |

No "plano corrigido", `c1`, `c2` e `c12` ficam com 17,75 A.

Com três placas em paralelo, cada uma com o próprio par de cabos até o inversor: 17,75 A em cada cabo. Com as três emendadas em um ponto e um só par de cabos até o inversor: 53,25 A nesse par.

Queda de tensão, com a corrente de trabalho:

| Trecho | Queda |
|---|---|
| 1 placa, `cabo-solar-6`, 12 m + 12 m | 1,01 V, 2,31% |
| 2 em série, `cabo-solar-6`, 12 m + 12 m, sem contar a emenda | 1,01 V, 1,16% |
| "Plano corrigido" (os mesmos cabos mais a emenda de 1,5 m) | 1,08 V, 1,23% |
| 3 em paralelo em um só par de `cabo-solar-6`, 12 m + 12 m | 3,04 V, 6,94% |
| O mesmo com `cabo-solar-10` | 1,83 V, 4,17% |
| Bateria, `cabo-bat-35`, 1 m + 1 m | 0,14 V, 0,54% |
| Geladeira, `cabo-ca-2p5`, 15 m (caso avulso) | 0,27 V, 0,21% |
| Geladeira no "plano no papel" (`c9`, 12 m) | 0,22 V, 0,17% |

`resistencia`: 12 m de `cabo-solar-6` dão 0,0380 Ω; 10 m de `cabo-bat-25-alucobre` dão 0,01216 Ω.

## 9. Consultor (tarefa 1.7)

Estimativas calculadas em 21/06/2026 ao meio-dia local, com o ambiente da seção 1.

"Plano no papel": exatamente estas sugestões, nesta ordem.

| Regra | Nível | O que conferir |
|---|---|---|
| `placas-abaixo-da-tensao` | erro | Texto com 37,9 V, 60 V e "2 placas"; ação `mais-placa` |
| `protecao-maior-que-o-cabo` | erro | Título "Fusível de 150 A em cabo que aguenta 125 A"; alvos `c3` e `c4`; ação troca os dois por `cabo-bat-35` |
| `autonomia-curta` | alerta | 4,1 horas; 8,2 horas com mais uma bateria; 5,6 horas sem o PC de trabalho; ação `mais-bateria` |
| `carga-acima-da-bateria` | dica | 120 A contra 50 A |
| `sem-dps-nas-placas` | dica | Ação instala `prot-dps-cc-600` em `c1` |
| `sem-disjuntor-na-saida` | dica | Ação instala `prot-disjuntor-ca-16` em `c6` a `c11` |

Não aparece `cabo-fino` para a bateria: o circuito já está coberto por `protecao-maior-que-o-cabo`.

"Plano corrigido": exatamente estas.

| Regra | Nível | O que conferir |
|---|---|---|
| `autonomia-curta` | alerta | 4,1 horas |
| `geracao-menor-que-o-consumo` | alerta | 44%; geração de 3,91 kWh; consumo de 8,85 kWh; faltam 3 placas; `planejarMaisPlaca` devolve `serie` |
| `carga-acima-da-bateria` | dica | 120 A contra 50 A |

Aplicar ao "plano no papel" as ações de `placas-abaixo-da-tensao`, `protecao-maior-que-o-cabo`, `sem-dps-nas-placas` e `sem-disjuntor-na-saida` leva às mesmas sugestões do "plano corrigido".

Regras isoladas, cada uma com um projeto mínimo que a dispara:

| Regra | Montagem |
|---|---|
| `tensao-do-banco` | `bat-belifou-12v-100` sozinha no Anenji; o texto propõe 2 baterias em série |
| `tensao-de-saida` | `inv-jesudom-3k2-24v-220` em projeto de 127 V |
| `aparelho-tensao` | Geladeira no `inv-jesudom-3k2-24v-220` |
| `onda-modificada` | `inv-vedo-1000-mod` com `ap-pc-24h` |
| `bateria-automotiva` e `item-nao-recomendado` | `bat-automotiva-60` no banco |
| `item-nao-recomendado` | `cabo-bat-25-alucobre` em um cabo; a ação troca por `cabo-bat-25` |
| `placas-acima-do-limite` | 3 Renepv em série no `ctl-epever-xtra4210n` (162,3 V contra 100 V) |
| `corrente-das-placas` | 2 fileiras de 2 Renepv no Anenji (28,4 A contra 18 A) |
| `pwm-desperdica` | 1 Renepv no `ctl-pwm-30a` com banco de 24 V: 29% |
| `pwm-desperdica` não aparece | 1 `placa-resun-100` no `ctl-pwm-30a` com bateria de 12 V |
| `sobrecarga` | "Plano no papel" com `ap-chuveiro` ligado na saída: 6.025 W contra 3.000 W; a ação desliga o chuveiro |
| `pico-de-partida` | Geladeira no `inv-aiker-500-12v-110`: partida de 900 W contra 1.000 W não dispara; com `ap-pc-trabalho` junto, 1.035 W dispara |
| `corrente-da-bateria` | "Plano no papel" com um aparelho de teste de 2.400 W |
| `sem-protecao-da-bateria` | "Plano no papel" sem o fusível em `c3`; a ação instala `prot-fusivel-anl-150` |
| `cabo-fino` | 3 Renepv em paralelo em um só par de `cabo-solar-4` no `ctl-epever-xtra4210n`: 53,3 A contra 42 A |
| `protecao-pequena` | `prot-disjuntor-cc-100` em `c3`, com `cabo-bat-35` |
| `queda-de-tensao` | 3 `placa-resun-155` em paralelo em um só par de `cabo-solar-6`, 20 m + 20 m, no `ctl-pwm-30a` |
| `placa-na-sombra` | `estimativas.perdaSombra` de 0,31 em uma placa |
| `rede-desligada` | "Plano no papel" sem `c5` |
| `sem-placas` | "Plano no papel" sem `placa1`, `c1` e `c2` |
| `saida-na-rede` | Cabo de `inversor.caSaida` a `rede.tomada` |

## 10. Estimativas (tarefa 1.7)

Com o ambiente da seção 1:

| Cenário e data | `geracaoDiaKwh` | `consumoDiaKwh` | `autonomiaHoras` |
|---|---|---|---|
| "Plano no papel", 21/06/2026 | 0 | 8,85 | 4,08 |
| "Plano corrigido", 21/06/2026 | 3,91 | 8,85 | 4,08 |
| "Plano corrigido", 21/12/2026 | 5,23 | 8,85 | 4,08 |

O consumo do dia vem de 7,15 kWh em CA, com os horários típicos: modem 40 W e PC 70 W o dia inteiro, PC de trabalho 135 W das 8 às 18, geladeira 90 W o dia inteiro, ventilador 50 W das 10 às 22 e TV 80 W das 18 às 23. Trocando o `uso` do PC de trabalho para o dia inteiro, o consumo sobe para 10,91 kWh. Tolerância de 2% na geração. `perdaSombra` é zero para todas as placas com `ambienteSemSombra`.

## 11. Orçamento (tarefa 1.8)

"Plano no papel":

| Linha | Quantidade | Unitário | Total |
|---|---|---|---|
| Renepv 585 W | 1 | 819,00 | 819,00 |
| Anenji 3 kW | 1 | 2.309,00 | 2.309,00 |
| Alfx 24 V 100 Ah | 1 | 3.750,00 | 3.750,00 |
| `cabo-solar-6` | 24 m | 8,50 | 204,00 |
| `cabo-bat-25` | 2 m | 55,00 | 110,00 |
| `cabo-ca-2p5` | 77 m | 8,82 | 679,14 |
| `prot-disjuntor-cc-32` | 1 | 47,90 | 47,90 |
| `prot-fusivel-anl-150` | 1 | 35,78 | 35,78 |
| `acc-ganchos-8` | 1 | 251,79 | 251,79 |
| `acc-trilhos` | 1 | 357,93 | 357,93 |
| `acc-mc4-10` | 1 | 58,68 | 58,68 |
| `acc-haste` | 1 | 44,97 | 44,97 |
| **Total** | | | **8.668,19** |

`totalTipico`: 110,00 (só o cabo de bateria de 25 mm², que continua sem anúncio).

"Plano corrigido": total de 9.797,62 (9.714,22 até a fase 1; a fase 2 acrescentou dois quadros `acc-quadro-8`, 83,40), com `totalTipico` zero. Mudam: 2 placas; 25,5 m de `cabo-solar-6`; 2 m de `cabo-bat-35` no lugar do `cabo-bat-25`; mais `prot-dps-cc-600` (63,30) e 6 `prot-disjuntor-ca-16` (18,00 cada). O kit de trilhos continua sendo um, porque atende 2 placas.

## 12. Catálogo (tarefas 1.1 e 1.2)

- O importador gera 201 registros, com a contagem por seção da [especificação do catálogo](catalogo.md).
- O registro `MLB2074314862` (Epever 3210CN) tem `preco` 1286.00 e `notaPreco` "listagem, que omite os centavos". O registro `MLB23503621` tem `preco` 114.98 e `notaPreco` "na listagem aparecia 121,03".
- Nenhum registro tem `preco` nulo.
- O teste de consistência do catálogo passa.

## 13. Sombra na cena (tarefa 3.1)

Casa de teste: largura 8, profundidade 8, 2 andares com pé-direito 3,1, beiral 0,5, varanda com 3 m de profundidade e 30% de inclinação. Uma `placa-renepv-585` em pé, com o centro no meio da largura da varanda e a 1,5 m da parede. A varanda fica na frente e a orientação da casa muda: 0 (norte), 90 (leste), 270 (oeste), 180 (sul).

Energia do dia 15 de cada mês de 2026, somada com o peso dos dias de cada mês, só com `estadoPlaca`:

| Varanda voltada para | Perda no ano, clima típico | Perda no ano, céu limpo | Junho, céu limpo |
|---|---|---|---|
| Norte | 14% | 7% | 3% |
| Leste | 23% | 24% | 23% |
| Oeste | 23% | 24% | 23% |
| Sul | 31% | 37% | 74% |

Critério: cada perda anual a até 5 pontos percentuais da tabela, e a perda de junho com céu limpo, no lado sul, acima de 60%. `ceuTapado` da placa entre 0,17 e 0,29 (referência: 0,23). A referência usou caixas simples para a casa; a casa da cena tem telhado de duas águas, e por isso a folga.

## 14. Cena e interface (fases 1 a 3)

Conferidos pelo roteiro `scripts/verificar.mjs`, com capturas de tela, e pelo `revisor`.

| Tarefa | Conferência |
|---|---|
| 1.10 | A cena abre sem erro de console; a rosa dos ventos mostra N, L, S, O; o N fica em −Z |
| 1.11 | Capturas dos três modos de visão, do sobrado e da casa térrea, e da varanda nos quatro lados; girar a casa não move a rosa dos ventos |
| 1.12 | Em 21/06/2026 ao meio-dia, com a frente para o norte, a sombra da casa cai para o sul; às 8 h cai para o oeste; à meia-noite a cena escurece |
| 1.13 | Mudar data, hora, velocidade, clima, rotação e os campos da casa muda a cena e o estado |
| 2.2 | Arrastar uma placa do catálogo para o telhado da varanda cria o dispositivo; soltá-la sobre o piso não cria |
| 2.3 | Mover um dispositivo atualiza `pos` e o comprimento dos cabos dele; `Delete` remove o dispositivo e os cabos |
| 2.4 | Puxar de `placa.pos` a `inversor.pvPos` cria um cabo vermelho; puxar de `ap-tv.plug` a `inversor.batPos` não cria; arrastar um fusível para um cabo o instala |
| 2.5 | Recarregar a página mantém a montagem; "Cenário do plano" recria o "plano no papel", com as seis sugestões da seção 9 |
| 3.2 | No "plano no papel", com queda de luz às 20:00 e velocidade de 60 minutos por segundo, a tela mostra a bateria vazia perto de 03:10 (entre 03:00 e 03:20), porque o ventilador para às 22 e a TV às 23. Com todos os aparelhos em "o dia inteiro", perto de 00:05 |
| 2.3 | Trocar o horário de uso de um aparelho no painel muda `uso` no estado e o consumo do dia na aba Sistema |
| 3.3 | Clicar na ação de `protecao-maior-que-o-cabo` troca os cabos, e a sugestão some |
| 3.4 | O total do painel é R$ 8.668,19 no "plano no papel" montado com os comprimentos da seção 1 |
