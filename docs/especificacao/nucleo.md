# Especificação do núcleo de cálculo

Vale para `src/nucleo/`. As convenções gerais estão em [especificacao.md](../especificacao.md). Todas as fórmulas daqui estão implementadas, de forma mínima, em [scripts/referencia/valores-de-referencia.mjs](../../scripts/referencia/valores-de-referencia.mjs), que gerou os números dos [casos de teste](casos-de-teste.md).

## 1. Sol (`sol.ts`)

`posicaoSol(msUtc, lat, lon)` devolve `{ azimute, elevacao }` em graus, pelo algoritmo da calculadora solar da NOAA. Use exatamente a função `posicaoSol` do script de referência: ela já foi validada contra o PVGIS com erro médio de 0,13°. Latitude negativa no hemisfério sul, longitude negativa a oeste de Greenwich.

`direcaoSol(azimute, elevacao)` devolve o vetor unitário que aponta da cena para o sol:

```
x =  sen(azimute) × cos(elevacao)      leste
y =  sen(elevacao)                     cima
z = −cos(azimute) × cos(elevacao)      sul
```

`normalDoPlano(inclinacao, azimute)` devolve a normal de um plano inclinado `inclinacao` graus em relação ao chão e voltado para `azimute`:

```
x =  sen(inclinacao) × sen(azimute)
y =  cos(inclinacao)
z = −sen(inclinacao) × cos(azimute)
```

## 2. Irradiação (`irradiancia.ts`)

### Locais

`LOCAIS` começa só com o Rio de Janeiro. Outras cidades entram na fase 5.

| Campo | Valor |
|---|---|
| `id`, `nome` | `rio`, Rio de Janeiro |
| `lat`, `lon`, `fuso` | −22,9; −43,2; −3 |
| `ghiMensal` (kWh/m²/dia, jan a dez) | 5,78; 5,97; 5,14; 4,52; 3,68; 3,46; 3,64; 4,26; 4,57; 5,00; 5,05; 5,56 |
| `tempMensal` (°C, jan a dez) | 25,7; 25,8; 25,4; 24,3; 22,3; 21,5; 21,0; 21,3; 22,0; 22,9; 23,4; 24,7 |

Fonte: climatologia da NASA POWER para a coordenada acima.

### Irradiância em um instante

`irradiancia(local, msUtc, clima)` devolve `{ ghi, dni, dhi, tAmb, azimute, elevacao }`, com as irradiâncias em W/m².

```
dia          = dia do ano pela data local (1 a 366)
mes          = mês pela data local (0 a 11)
hora         = hora local decimal
tAmb         = tempMensal[mes] + 4 × cos(2π × (hora − 15) / 24)

ghiClaro     = 1098 × sen(el) × exp(−0,057 / sen(el))        se el > 0, senão 0     (Haurwitz)
g0h          = 1367 × (1 + 0,033 × cos(2π × dia / 365)) × sen(el)   se el > 0, senão 0

fator do clima:
  limpo      = 1
  nublado    = 0,35
  chuvoso    = 0,15
  tipico     = mín(1,05; ghiMensal[mes] × 1000 / energiaClaraDoDia)

ghi          = fator × ghiClaro
kt           = mín(1; ghi / g0h)     (0 se g0h < 1)
kd (Erbs)    = 1 − 0,09 × kt                                                      se kt ≤ 0,22
             = 0,9511 − 0,1604 kt + 4,388 kt² − 16,638 kt³ + 12,336 kt⁴           se 0,22 < kt ≤ 0,80
             = 0,165                                                              se kt > 0,80
dhi          = kd × ghi
dni          = mín(1100; (ghi − dhi) / sen(el))     se el > 3°
             = 0, e dhi = ghi                        se el ≤ 3°
```

`energiaClaraDoDia` é a soma de `ghiClaro` ao longo do dia local do instante, em Wh/m², com passo de 5 minutos avaliado no meio de cada passo (288 passos de 1/12 de hora). Guarde o valor em cache por local e dia.

O clima "típico" representa um dia médio do mês: a energia do dia bate com a média da NASA, mas com mais luz difusa do que um dia de céu aberto. Dias reais entram na fase 5.

### Irradiância no plano de uma placa

`irradianciaNoPlano(irr, sol, normal, fSombra = 0, fCeuTapado = 0)` devolve W/m²:

```
cosInc    = máx(0; sol · normal)
iam       = máx(0; 1 − 0,05 × (1 / máx(cosInc; 0,05) − 1))      se cosInc > 0, senão 0
direta    = dni × cosInc × iam × (1 − fSombra)
difusa    = dhi × (1 + normal.y) / 2 × (1 − fCeuTapado)
refletida = ghi × 0,2 × (1 − normal.y) / 2
total     = direta + difusa + refletida          (0 se ghi ≤ 0)
```

`fSombra` é a fração da placa sem sol direto e `fCeuTapado` é a fração do céu difuso tapada por obstáculos. Os dois vêm da cena, pela interface `AmbientePlacas`. A luz refletida por paredes é ignorada, o que deixa o resultado um pouco pessimista perto de paredes claras.

`irradianciaNasPlacas(projeto, catalogo, local, msUtc, ambiente)` calcula `irradiancia` uma vez e devolve, para cada placa do projeto, `{ g, tAmb }`. Só consulta `ambiente.sombra` quando `dni > 0`.

`ambienteSemSombra(normal)` devolve um `AmbientePlacas` em que todas as placas têm a mesma normal, sem sombra e sem céu tapado. Serve aos testes e ao relatório em texto.

## 3. Placa (`eletrica.ts`)

Constantes:

| Nome | Valor | Significado |
|---|---|---|
| `NOCT` | 47 °C | Temperatura da célula a 800 W/m² e 20 °C, em telhado com pouca ventilação |
| `COEF_PMAX` | −0,0035 por °C | Queda de potência com a temperatura |
| `COEF_VMP` | −0,0030 por °C | Queda da tensão de trabalho |
| `COEF_VOC` | −0,0027 por °C | Queda da tensão de circuito aberto |
| `PERDAS_PLACA` | 0,07 | Sujeira, envelhecimento e diferença entre placas |
| `T_FRIO` | 10 °C | Célula mais fria considerada no Rio |
| `T_QUENTE` | 70 °C | Célula mais quente considerada |

`estadoPlaca(placa, g, tAmb)` devolve `{ p, v, i, tCel }`:

```
se g < 20:  p = 0, v = 0, i = 0, tCel = tAmb
tCel = tAmb + (NOCT − 20) × g / 800
p    = wp × (g / 1000) × (1 + COEF_PMAX × (tCel − 25)) × (1 − PERDAS_PLACA)
v    = vmp × (1 + COEF_VMP × (tCel − 25))
i    = p / v
```

Valores de projeto, usados pelo consultor:

```
vocFrio(placa, n)   = n × voc × (1 + COEF_VOC × (T_FRIO − 25))       = n × voc × 1,0405
vmpQuente(placa, n) = n × vmp × (1 + COEF_VMP × (T_QUENTE − 25))     = n × vmp × 0,865
```

## 4. Fileiras e arranjo

Uma fileira são placas em série. Um arranjo são fileiras em paralelo.

Fileira, com diodo de desvio: a corrente é a mesma em todas as placas, então a mais fraca limita as outras, a não ser que seja desviada. Dadas as placas com correntes `i_k` e tensões `v_k`:

```
para cada placa j:
  ativas = placas com i_k ≥ i_j
  P_j    = i_j × soma(v_k das ativas)
escolha o j de maior P_j
fileira: p = P_j, i = i_j, v = soma(v_k das ativas)
```

Arranjo: `pBruta = soma(p das fileiras)`, `i = soma(i das fileiras)`, `v = maior v entre as fileiras`.

## 5. Entrada solar: MPPT e PWM

`saidaArranjo(fileiras, solar, tensaoCarga)` recebe os estados das placas agrupados por fileira, a entrada solar em uso e a tensão de carga do banco. Devolve `{ p, v, i, avisos }`, em que `p` é a potência entregue ao barramento da bateria.

MPPT (`solar.tipo === 'mppt'`), com `RENDIMENTO_MPPT = 0,97`:

```
vMinEfetivo = máx(solar.vMin; tensaoCarga + 2)
se v < vMinEfetivo:  p = 0, aviso 'placas-tensao-baixa'
se v > solar.vMax:   p = 0, aviso 'placas-tensao-alta'
senão:
  p = pBruta × 0,97
  se solar.correnteEntradaMaxA existe e i > ela:  p = p × correnteEntradaMaxA / i, aviso 'placas-limitadas'
  se p > solar.potenciaMaxW:                       p = solar.potenciaMaxW,        aviso 'placas-limitadas'
```

PWM (`solar.tipo === 'pwm'`): a placa fica presa à tensão da bateria.

```
se v < tensaoCarga + 1:  p = 0, aviso 'placas-tensao-baixa'
senão:
  iUtil = mín(i; solar.correnteCargaA)          aviso 'placas-limitadas' se i > correnteCargaA
  p     = iUtil × tensaoCarga
```

Sem fileiras ou com `pBruta = 0`, `p = 0` e não há aviso.

## 6. Banco de baterias

Parâmetros por química:

| Química | `socMin` | Rendimento de carga e de descarga | Fator da tensão de referência |
|---|---|---|---|
| `lifepo4` | 0,10 | 0,975 | 1,0667 |
| `chumbo` | 0,50 | 0,894 | 1 |
| `automotiva` | 0,70 | 0,866 | 1 |

`infoBanco(sistema, projeto, catalogo)` devolve `null` se não houver banco. Para um banco de baterias externas, em que cada ramo é uma lista de baterias em série:

```
tensao       = soma das tensões nominais do primeiro ramo
ah           = soma, entre os ramos, do menor ah de cada ramo
quimica      = a da primeira bateria
tensaoRef    = tensao × fator da química          (24 V de lítio vale 25,6 V)
tensaoCarga  = tensao × 1,17
wh           = ah × tensaoRef
whUtil       = wh × (1 − socMin)
descargaMaxA = soma, entre os ramos, do menor descargaMaxA de cada ramo
cargaMaxA    = soma, entre os ramos, do menor cargaMaxA de cada ramo
```

Para uma estação portátil (`inversor.bateriaInternaWh`): `wh = bateriaInternaWh`, química `lifepo4`, `tensao = inversor.tensaoBateria`, `descargaMaxA` e `cargaMaxA` infinitos.

Quanto a bateria aceita de carga, em W, em um passo de `dt` horas:

```
aceita = mín(cargaMaxA × tensaoCarga; (1 − soc) × wh / (rendCarga × dt))
chumbo e automotiva com soc > 0,8:  aceita = aceita × máx(0,1; (1 − soc) / 0,2)
```

## 7. Inversor, cargas e passo de simulação

`passoSimulacao(projeto, catalogo, analise, estado, entrada)` avança `entrada.dtHoras` e devolve a `SaidaPasso`, que traz o novo estado. Quem chama usa `dt` de até 5 minutos.

Horário de uso: cada aparelho da casa tem um horário, com início e fim em horas locais. Vale o que o usuário definiu no aparelho (`dispositivo.uso`) ou, na falta, o `usoPadrao` do catálogo. As funções estão em `uso.ts`. O botão ligado ou desligado manda mais que o horário: aparelho desligado não consome em hora nenhuma.

Estado: `soc` (0 a 1 da capacidade nominal), `cortado` (inversor desligado por bateria vazia) e `emRede` (inversor usando a rede no modo "solar primeiro"). `estadoInicial()` devolve `{ soc: 1, cortado: false, emRede: false }`.

Passos:

1. Sem `analise.sistema`: devolve tudo zero, `origem: 'nenhuma'`, estado igual.
2. `b = infoBanco(...)`. Se `null`: aviso `'sem-bateria'`, nada é alimentado.
3. Placas: `estadoPlaca` de cada placa com o `g` e o `tAmb` de `entrada.placas` (placa ausente no mapa vale `g = 0`), depois `saidaArranjo`. `pvDisp` é o `p` devolvido.
4. Cargas ligadas: aparelhos de `sistema.cargas` com `ligado === true` e, quando `entrada.horaLocal` não é nulo, dentro do horário de uso (`emUso(usoDe(dispositivo, item), horaLocal)`). Com `horaLocal` nulo, os horários são ignorados. `pedidaW` é a soma de `mediaW`; `nominalW` é a soma de `potenciaW`. Se `nominalW > inversor.potenciaW`: aviso `'sobrecarga'` e nenhuma carga é atendida neste passo.
5. Modo "solar primeiro" (`projeto.prioridade === 'solar'`), com rede disponível e ligada: se `!emRede` e `soc ≤ socMin + 0,10`, `emRede = true`; se `emRede` e `soc ≥ 0,90`, `emRede = false`. No modo "rede primeiro", `emRede = false`.
6. `usaRede = entrada.redeDisponivel && sistema.redeLigada && (prioridade === 'rede' || emRede)`.
7. Com `usaRede`: as cargas são atendidas pela rede, a não ser que tenha havido sobrecarga. A bateria carrega primeiro pelas placas, limitada por `solar.correnteCargaA × tensaoCarga`, e o que faltar pela rede, limitada por `mín(carregadorRedeA; 20) × tensaoCarga`. `soc` sobe `carga × rendCarga × dt / wh`. `redeW = cargaAtendidaW + consumoVazioW + carga pela rede`. `origem: 'rede'`, `cortado = false`.
8. Sem `usaRede`:
   - Se `cortado` e `soc ≥ socMin + 0,05`: `cortado = false`.
   - `pCc`: se `cortado`, 0; se houve sobrecarga ou `pedidaW = 0`, `consumoVazioW`; senão `pedidaW / rendimento + consumoVazioW`.
   - `liquido = pvDisp − pCc`.
   - `liquido ≥ 0`: a sobra carrega a bateria, limitada por `aceita` e por `solar.correnteCargaA × tensaoCarga`. `pvW = pCc + carga`. Cargas atendidas. `origem: 'solar'` se `pedidaW > 0`.
   - `liquido < 0`: `falta = −liquido`. Se `falta / tensaoRef > descargaMaxA`: aviso `'bms'`, nenhuma carga atendida, bateria parada. Senão, a energia disponível é `(soc − socMin) × wh × rendDescarga`. Se ela cobre `falta × dt`, `soc` desce `falta × dt / (wh × rendDescarga)` e as cargas são atendidas. Se não cobre, a bateria vai a `socMin`, `cortado = true`, aviso `'bateria-vazia'`, e as cargas são atendidas só na fração coberta. `origem: 'bateria'`.
9. `soc` fica entre 0 e 1.

Na `SaidaPasso`, `bateriaW` é positivo quando carrega e negativo quando descarrega.

## 8. Circuito (`circuito.ts`)

`analisarCircuito(projeto, catalogo)` lê os cabos e descobre como as peças estão ligadas.

1. **Redes.** Cada ponta de cabo é um terminal, identificado por `uid:terminal`. Terminais ligados por cabos, direta ou indiretamente, formam uma rede. Use união de conjuntos. Terminal sem cabo é uma rede sozinha.
2. **Inversor.** O sistema usa o primeiro dispositivo de categoria `inversor` na ordem de `projeto.dispositivos`. Mais de um: problema `'varios-inversores'`. Nenhum: `sistema: null` e, se houver placa, bateria ou controlador no projeto, problema `'sem-inversor'`.
3. **Barramento.** `P` é a rede de `inversor.batPos` e `N` a de `inversor.batNeg`. Estação portátil não tem barramento.
4. **Ramos do banco.** Busca em profundidade a partir de `P`: para cada bateria com `pos` na rede atual, se o `neg` dela está em `N` o ramo fecha; senão a busca continua na rede do `neg`. Cada caminho completo é um ramo, do positivo para o negativo. Limite de 40 baterias por ramo.
5. **Entrada solar.** Candidatas, em ordem: a entrada do inversor (`inversor.solar`, entre `pvPos` e `pvNeg`) e a de cada controlador cujo `batPos` está em `P` e cujo `batNeg` está em `N`. Para cada candidata, as fileiras são os caminhos de placas entre a rede do `pvPos` e a do `pvNeg`, pela mesma busca. Fica em uso a primeira candidata que tiver fileira completa. Se nenhuma tiver, fica a primeira candidata, com `fileiras: []`. Sem candidata, `entradaSolar: null`.
6. **Cargas.** Aparelhos com o `plug` na rede de `inversor.caSaida`.
7. **Rede elétrica.** `redeLigada` é verdadeiro quando a rede de `inversor.caEntrada` contém a `tomada` de um dispositivo de categoria `rede`. `naRede` lista os aparelhos com o `plug` na rede de uma tomada e fora da saída do inversor.

Problemas, com os `uid` envolvidos:

| Código | Quando |
|---|---|
| `sem-inversor` | Há equipamento de energia e nenhum inversor |
| `varios-inversores` | Mais de um inversor; só o primeiro é simulado |
| `sem-bateria` | Inversor sem bateria interna e sem ramo completo |
| `curto-bateria` | `P` e `N` são a mesma rede, ou uma bateria tem `pos` e `neg` na mesma rede |
| `bateria-invertida` | Bateria fora de ramo completo com `neg` em `P` ou `pos` em `N` |
| `bateria-solta` | Bateria com algum cabo e fora de ramo completo, sem ser invertida |
| `ramos-desiguais` | Ramos com soma de tensão diferente |
| `baterias-misturadas` | Banco com mais de um modelo de bateria |
| `curto-placas` | Rede do `pvPos` igual à do `pvNeg`, ou placa com `pos` e `neg` na mesma rede |
| `placa-invertida` | Placa fora de fileira completa com `neg` na rede do `pvPos` ou `pos` na rede do `pvNeg` |
| `placa-solta` | Placa com algum cabo e fora de fileira completa, sem ser invertida |
| `fileiras-desiguais` | Fileiras em paralelo com número diferente de placas |
| `placas-misturadas` | Arranjo com mais de um modelo de placa |
| `saida-na-rede` | A rede de `inversor.caSaida` contém a `tomada` de um dispositivo `rede` |

Placa ou bateria sem nenhum cabo não é problema: está só guardada na cena.

## 9. Cabos (`cabos.ts`)

`resistencia(cabo, comprimento)`, em ohms: `rho × comprimento / secao`, com `rho = 0,019` para cobre e `0,0304` para alucobre (`cobre: false`).

### Corrente de projeto de cada cabo

`correntesDeProjeto(projeto, catalogo, analise)` devolve um mapa de `uid` do cabo para ampères. É a corrente que o cabo precisa aguentar, não a de um instante.

Método, por rede: escolha o terminal sorvedouro e as injeções; percorra a rede em largura a partir do sorvedouro, pelos cabos; a corrente de cada cabo da árvore é a soma das injeções dos terminais que ficam do lado oposto ao sorvedouro. Cabo que fecha laço fica com 0.

| Rede | Sorvedouro | Injeções |
|---|---|---|
| Positiva das placas | `pvPos` da entrada solar | `pos` da primeira placa de cada fileira: `1,25 × isc` |
| Negativa das placas | `pvNeg` da entrada solar | `neg` da última placa de cada fileira: `1,25 × isc` |
| Emenda entre placas em série | `pos` da placa seguinte | `neg` da placa anterior: `1,25 × isc` |
| `P` do banco | `inversor.batPos` | `pos` da primeira bateria de cada ramo: `iBateria / ramos`. `batPos` de cada controlador no barramento: `solar.correnteCargaA` |
| `N` do banco | `inversor.batNeg` | O mesmo, com `neg` da última bateria e `batNeg` do controlador |
| Emenda entre baterias em série | `pos` da bateria seguinte | `neg` da anterior: `iBateria / ramos` |
| Saída CA | `inversor.caSaida` | `plug` de cada aparelho: `potenciaW / tensaoRede` |
| Entrada CA | `tomada` da rede | `inversor.caEntrada`: `(soma de potenciaW das cargas + mín(carregadorRedeA; 20) × tensaoCarga) / tensaoRede` |

`iBateria = inversor.potenciaW / (inversor.rendimento × tensaoRef)`. Para 3.000 W, rendimento 0,92 e lítio de 24 V: 127,4 A.

### Queda de tensão

`quedasDeTensao(projeto, catalogo, analise)` devolve, por circuito, a queda em volts, a mesma queda como fração da tensão do circuito (`fracao`, de 0 a 1), o limite recomendado e os cabos do trecho. Os limites abaixo estão em porcentagem: 3% é `0,03`.

- **Placas.** Para cada fileira, some `corrente × resistencia` dos cabos no caminho da fileira até a entrada solar, ida e volta, mais as emendas. Use a corrente de trabalho: a de projeto multiplicada por `imp / (1,25 × isc)`. Porcentagem sobre `n × vmp`. O circuito das placas fica com a maior queda entre as fileiras. Limite: 3%.
- **Bateria.** Para cada ramo, o caminho até o inversor, ida e volta, com a corrente de projeto. Porcentagem sobre `tensaoRef`. Limite: 2%.
- **Aparelhos.** Para cada aparelho, o caminho do `plug` até `caSaida`, com `potenciaW / tensaoRede`. Um cabo CA leva fase e neutro, então a resistência conta em dobro. Porcentagem sobre `tensaoRede`. Limite: 4%.

## 10. Estimativas (`estimativas.ts`)

`estimar(projeto, catalogo, analise, ambiente, msUtc)` devolve números do dia local de `msUtc`:

- `geracaoDiaKwh`: soma de `saidaArranjo(...).p` ao longo do dia, com passo de 10 minutos avaliado no meio do passo. É o que as placas conseguem entregar, sem depender do estado da bateria. Zero sem fileiras.
- `consumoDiaKwh`: o que a bateria ou as placas precisam entregar em um dia de uso normal. `soma(mediaW × horas de uso) / rendimento + consumoVazioW × 24`, em kWh, para as cargas ligadas, com as horas de `horasDeUso(usoDe(...))`.
- `autonomiaHoras`: `whUtil × rendDescarga / (soma(mediaW das cargas ligadas) / rendimento + consumoVazioW)`. `null` sem banco ou sem carga ligada. É o pior caso: todas as cargas ligadas funcionando ao mesmo tempo, sem olhar os horários.
- `perdaSombra`: para cada placa, `1 − energia do dia com sombra / energia do dia sem sombra`, usando só `estadoPlaca`. "Sem sombra" é a mesma normal com `fSombra = 0` e `fCeuTapado = 0`.

## 11. Orçamento (`orcamento.ts`)

`calcularOrcamento(projeto, catalogo)` devolve as linhas e os totais.

| Grupo | Linhas |
|---|---|
| `equipamentos` | Uma por item de catálogo com preço maior que zero entre os dispositivos; quantidade é a contagem |
| `cabos` | Uma por tipo de cabo; quantidade é a soma dos comprimentos, em metros; unitário é o preço por metro |
| `protecoes` | Uma por item de proteção instalado em cabos; quantidade é a contagem |
| `instalacao` | Automáticas: `acc-ganchos-8` (um kit a cada 2 placas, arredondando para cima), `acc-trilhos` (um por placa), `acc-mc4-10` (um kit se houver placa), `acc-haste` (uma se houver inversor) |

Cada linha traz `url` quando o item tem, e `tipico: true` quando o preço do item é valor típico (`tipico` contém `'preco'`). `total` é a soma de tudo e `totalTipico` é a soma das linhas típicas, para a tela dizer quanto do orçamento é estimativa.
