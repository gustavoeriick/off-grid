# Especificação do catálogo

Vale para `src/catalogo/`, `scripts/importar-pesquisa.mjs` e `pesquisa/`. Os tipos estão em [src/catalogo/tipos.ts](../../src/catalogo/tipos.ts).

O catálogo é uma lista curada: poucos produtos por categoria, cada um ligado a um anúncio da pesquisa. Preço, título e link vêm do arquivo da pesquisa; as características que o anúncio não traz são preenchidas com valor típico e marcadas.

## 1. Importador (tarefa 1.1)

`scripts/importar-pesquisa.mjs` lê `pesquisa/precos-mercado-livre-AAAA-MM-DD.md` e grava `pesquisa/precos-mercado-livre-AAAA-MM-DD.json`. Sem dependências além do Node.

Regras de leitura:

- A primeira linha traz a data da coleta: `# Preços Mercado Livre - coleta em AAAA-MM-DD`.
- Cada seção começa com `## A1 - título`. A seção `## Observações` é ignorada pelo importador.
- Linhas de tabela começam com `| `. A linha de cabeçalho começa com `| Busca` e é ignorada. As colunas são as doze do cabeçalho, na ordem.
- Preço: `3.750,00` vira `3750.00`. O número é o que vem antes de qualquer parêntese: `1.286 (listagem, que omite os centavos)` vira `1286.00`, e `114,98 (na listagem aparecia 121,03)` vira `114.98`. O texto entre parênteses vai para `notaPreco`.
- `não informado` e `-` viram `null`.
- Código do anúncio, tirado do link: `/p/MLB62243910` dá `MLB62243910`; `/up/MLBU5844565353` dá `MLBU5844565353`; `produto.mercadolivre.com.br/MLB-4079433561-...` dá `MLB4079433561`.

Formato de cada registro:

```json
{
  "secao": "A1",
  "tituloSecao": "Bateria LiFePO4 24 V 100 Ah",
  "busca": "bateria lifepo4 24v 100ah",
  "titulo": "Bateria Solar Alfx Lítio Lfp 100ah 24v Lifepo4",
  "marcaModelo": "Enershare Lfp 100Ah (ficha); Alfx (título)",
  "especificacoes": "BMS: não informado; descarga contínua 100 A; ...",
  "preco": 3750.00,
  "notaPreco": null,
  "precoPix": null,
  "precoRiscado": null,
  "frete": "grátis",
  "vendedor": "LEE ENERGY ENERGIA SOLAR",
  "lojaOficial": true,
  "vendidosNota": "+50 vendidos; 5.0 (1)",
  "link": "https://www.mercadolivre.com.br/bateria-solar-alfx-litio-lfp-100ah-24v-lifepo4/p/MLB2073543374",
  "codigo": "MLB2073543374"
}
```

O arquivo final é `{ "coletadoEm": "2026-11-14", "registros": [...] }`.

Contagem esperada na coleta de 14/11/2026, 157 registros: A1 5, A2 5, A3 6, A4 5, A5 14, A6 8, A7 9, A8 15, B1 3, B2 3, B3 3, B4 5, B5 8, B6 8, B7 9, B8 6, C1 6, C2 6, C3 12, C4 3, C5 9, C6 3, C7 6.

## 2. Regras de curadoria (tarefa 1.2)

- Cada item da seção 3 aponta para um registro pelo código. `preco`, `url` e `coletadoEm` vêm do registro. Um teste confere que o `preco` do item é igual ao do registro.
- `precoMax` é o da tabela, quando há.
- Campo que não está no anúncio recebe o valor típico da tabela e entra na lista `tipico` do item. Nas tabelas, esses campos estão na coluna "Valores típicos".
- Item sem anúncio (seção 4) tem `tipico` contendo `'preco'` e não tem `url`. A exceção é `inv-powmr-ps3k-110`: o preço dele está nas observações da coleta, então o item tem `coletadoEm`, não tem `url` e não leva `'preco'` em `tipico`.
- `naoRecomendado` e `obs` são os textos das tabelas.
- `linha`: `simples` para 12 V, chumbo e PWM; `plano` para o sistema de 24 V do Gustavo; `avancada` fica vazia até a coleta da linha de 48 V.
- Fica fora do catálogo o que a pesquisa não deixa confirmar: Serrana Solar 1000 W (tensão de bateria não informada), inversores Joyfox e "Genérica" (dados do MPPT só no título), string box Lukma (10 A, menos que a corrente das placas) e Sibratec (16 A, abaixo de 1,25 vez a corrente das placas), disjuntores automotivos de 150 A.

Teste de consistência (`catalogo.test.ts`):

- `id` único; `preco ≥ 0`; `precoMax ≥ preco` quando existe.
- Todo item com `url` tem `coletadoEm`, e o código do link existe no JSON da pesquisa com o mesmo preço.
- Placa: `voc > vmp > 0`, `isc ≥ imp > 0`, e `vmp × imp` entre 95% e 105% de `wp`.
- Bateria: `tensao` em 12, 24 ou 48; `ah`, `descargaMaxA` e `cargaMaxA` maiores que zero.
- Entrada solar: `vocMax ≥ vMax > vMin ≥ 0`.
- Cabo: `ampacidade > 0`, `secao > 0`.
- Os itens usados pelos cenários e pelas ações do consultor existem: `placa-renepv-585`, `inv-anenji-3kw-24v-127`, `bat-alfx-24v-100`, `rede-tomada`, `cabo-solar-6`, `cabo-bat-25`, `cabo-bat-35`, `cabo-ca-2p5`, `prot-fusivel-anl-150`, `prot-disjuntor-cc-32`, `prot-dps-cc-600`, `prot-disjuntor-ca-16`, `acc-ganchos-8`, `acc-trilhos`, `acc-mc4-10`, `acc-haste` e os seis aparelhos do plano.

## 3. Itens com anúncio

Medidas em metros. Em placas, `imp` é `wp / vmp`, arredondado a duas casas.

### Placas

| `id` | Nome | Linha | Código | `precoMax` | Do anúncio | Valores típicos |
|---|---|---|---|---|---|---|
| `placa-renepv-585` | Renepv 585 W bifacial | plano | MLB62243910 | 849,00 | `wp` 585; `voc` 52,01; `vmp` 43,83 | `isc` 14,2; `imp` 13,35; `largura` 1,134; `altura` 2,278 |
| `placa-ronma-585` | RonMa 585 W bifacial | plano | MLBU5844565353 | | 585; 51,50; 43,27 | `isc` 14,3; `imp` 13,52; 1,134 × 2,278 |
| `placa-helius-610` | Helius 610 W bifacial | plano | MLB49277146 | | 610; 48,10; 39,74 | `isc` 16,3; `imp` 15,35; 1,134 × 2,382 |
| `placa-dasolar-550` | DA Solar 550 W | plano | MLBU2861006457 | | 550; 49,84; 41,99 | `isc` 13,9; `imp` 13,10; 1,134 × 2,279 |
| `placa-jinko-550` | Jinko 550 W | plano | MLBU1740217066 | | 550; 49,62; 40,90 | `isc` 14,03; `imp` 13,45; 1,134 × 2,278 |
| `placa-resun-100` | Resun 100 W policristalina | simples | MLB23885816 | | 100; 21,58; 17,40 | `isc` 6,1; `imp` 5,75; 0,67 × 1,01 |
| `placa-solarborn-150` | SolarBorn 150 W | simples | MLB53292909 | | 150; 23,90; 20,10 | `isc` 7,9; `imp` 7,46; 0,67 × 1,48 |
| `placa-resun-155` | Resun 155 W | simples | MLBU729540779 | | 155; 24,46; 20,64 | `isc` 7,95; `imp` 7,51; 0,67 × 1,48 |

`obs`: Renepv e RonMa, "Loja oficial SGV. O frete não é grátis e o valor não aparece no anúncio."; DA Solar e Jinko, "Frete a consultar pelo CEP."; Resun 155, "O anúncio envia 150, 155 ou 160 W conforme o estoque."

### Baterias

`dimensoes` é largura, altura, profundidade. Em chumbo, `descargaMaxA` típico é metade do `ah` e `cargaMaxA` típico é 15% do `ah`.

| `id` | Nome | Linha | Código | `precoMax` | Do anúncio | Valores típicos |
|---|---|---|---|---|---|---|
| `bat-alfx-24v-100` | Alfx 24 V 100 Ah lítio | plano | MLB2073543374 | | `lifepo4`; 24 V; 100 Ah; descarga 100 A; 6.000 ciclos | carga 50 A; 0,52 × 0,22 × 0,24 |
| `bat-moura-24msl100` | Moura 24MSL100 lítio | plano | MLB2051879022 | | `lifepo4`; 24 V; 100 Ah; descarga 100 A; 6.000 ciclos | carga 50 A; 0,52 × 0,22 × 0,24 |
| `bat-epever-24v-100` | Epever 24 V 100 Ah lítio | plano | MLB48467675 | 5.750,00 | `lifepo4`; 24 V; 100 Ah; 5.000 ciclos | descarga 100 A; carga 50 A; 0,52 × 0,22 × 0,24 |
| `bat-belifou-12v-100` | Belifou 12 V 100 Ah lítio | simples | MLB75984919 | | `lifepo4`; 12 V; 100 Ah; descarga 100 A; 6.000 ciclos | carga 50 A; 0,33 × 0,22 × 0,17 |
| `bat-auxom-12v-100` | Auxom 12 V 100 Ah lítio | simples | MLB2084822100 | 2.139,90 | `lifepo4`; 12 V; 100 Ah; 6.000 ciclos | descarga 100 A; carga 50 A; 0,33 × 0,22 × 0,17 |
| `bat-moura-12mn220` | Moura 12MN220 chumbo | simples | MLB2066985564 | 2.149,99 | `chumbo`; 12 V; 220 Ah | descarga 110 A; carga 33 A; 500 ciclos; 0,52 × 0,24 × 0,27 |
| `bat-freedom-df2000` | Freedom DF2000 chumbo | simples | MLB37916775 | | `chumbo`; 12 V; 105 Ah (C20) | descarga 52 A; carga 16 A; 500 ciclos; 0,33 × 0,24 × 0,17 |
| `bat-moura-12mn105` | Moura 12MN105 chumbo | simples | MLBU1405378204 | 729,99 | `chumbo`; 12 V; 105 Ah (C20) | descarga 52 A; carga 16 A; 500 ciclos; 0,33 × 0,24 × 0,17 |
| `bat-freedom-df1000` | Freedom DF1000 chumbo | simples | MLBU1944357801 | | `chumbo`; 12 V | `ah` 60; descarga 30 A; carga 9 A; 500 ciclos; 0,24 × 0,20 × 0,175 |
| `bat-powertek-100` | PowerTek 100 Ah selada | simples | MLB2067485691 | 798,90 | `chumbo`; 12 V; 100 Ah; 300 ciclos | descarga 50 A; carga 15 A; 0,33 × 0,22 × 0,17 |
| `bat-automotiva-60` | Bateria de carro 60 Ah | simples | MLBU4907518725 | | `automotiva`; 12 V; 60 Ah | descarga 30 A; carga 6 A; 80 ciclos; 0,24 × 0,19 × 0,175 |

`obs`:

- `bat-alfx-24v-100`: "Garantia de 1 ano. O título diz Alfx e a ficha diz Enershare."
- `bat-moura-24msl100`: "Garantia de 5 anos. Aceita até 15 em paralelo. A descarga recomendada é de 20 A, cerca de 500 W."
- `bat-epever-24v-100`: "A ficha diz 5.000 ciclos e o título diz 6.000."
- `bat-auxom-12v-100`: "Garantia do vendedor de 60 dias."
- `bat-moura-12mn220`: "Há anúncio a R$ 1.469,99 com frete a combinar."
- `bat-freedom-df2000`: "115 Ah é a capacidade em 100 horas; em 20 horas são 105 Ah."
- `bat-freedom-df1000`: "O anúncio diz 70 Ah, medida em 100 horas; em 20 horas são cerca de 60 Ah."

`naoRecomendado` de `bat-automotiva-60`: "Bateria de carro foi feita para dar partida. Em descarga funda dura poucas dezenas de ciclos. Está no catálogo só para comparação."

### Inversores e estações portáteis

Todos têm `tensaoBateria`, `saidaV`, `potenciaW`, `picoW`, `rendimento`, `consumoVazioW`, `montagem` e `dimensoes`. Saída anunciada como 110 ou 120 V entra como `saidaV: 127`. Nenhum anúncio informa rendimento nem consumo sem carga: os dois são sempre típicos.

| `id` | Nome | Linha | Código | `precoMax` | Do anúncio | Valores típicos |
|---|---|---|---|---|---|---|
| `inv-anenji-3kw-24v-127` | Anenji 3 kW 24 V 127 V | plano | MLB64151611 | 2.800,00 | pura; 3.000 W; 24 V; saída 127; MPPT: carga 100 A, 60 a 450 V, `vocMax` 500, 4.000 W, entrada 18 A; carregador 80 A | pico 6.000; rendimento 0,92; vazio 45 W; parede; 0,30 × 0,42 × 0,12 |
| `inv-jesudom-3k2-24v-220` | Jesudom 3,2 kVA 24 V 220 V | plano | MLB2095365216 | | pura; 24 V; saída 220; MPPT: carga 80 A, 55 a 450 V, 3.200 W | `potenciaW` 3.000; pico 6.000; `vocMax` 450; rendimento 0,92; vazio 45 W; parede; 0,30 × 0,42 × 0,12 |
| `inv-aiker-500-12v-110` | Aiker 500 W 12 V | simples | MLBU3881054827 | | pura; 500 W; 12 V; saída 127 | pico 1.000; rendimento 0,88; vazio 8 W; piso; 0,22 × 0,08 × 0,12 |
| `inv-knup-1000-12v-110` | Knup 1.000 W 12 V | simples | MLB35831781 | 417,59 | pura; 1.000 W; pico 2.000; 12 V; saída 127 | rendimento 0,88; vazio 12 W; piso; 0,28 × 0,09 × 0,15 |
| `inv-tataliken-1000-12v` | Tataliken "1000 W" 12 V | simples | MLB49678609 | | pura; 400 W contínuos; pico 1.000; 12 V; saída 127 | rendimento 0,85; vazio 8 W; piso; 0,22 × 0,08 × 0,12 |
| `inv-vedo-1000-mod` | Vedo 1.000 W onda modificada | simples | MLB43908872 | | modificada; 1.000 W; pico 2.000; 12 V; saída 127 | rendimento 0,85; vazio 8 W; piso; 0,22 × 0,08 × 0,12 |
| `est-ecoflow-river2` | EcoFlow River 2 | simples | MLBU3067384556 | 2.300,00 | 256 Wh; 300 W; pico 600; saída 127 | MPPT: carga 8 A, 11 a 30 V, `vocMax` 30, 110 W; rendimento 0,88; vazio 10 W; piso; 0,25 × 0,15 × 0,21 |
| `est-ecoflow-river2max` | EcoFlow River 2 Max | simples | MLBU5279465212 | 4.299,00 | 512 Wh; 500 W; pico 1.000; saída 127 | MPPT: carga 13 A, 11 a 50 V, `vocMax` 50, 220 W; rendimento 0,88; vazio 12 W; piso; 0,27 × 0,20 × 0,26 |
| `est-bluetti-ac70` | Bluetti AC70 | plano | MLB4079433561 | 5.224,87 | 768 Wh; 1.000 W; pico 2.000 | saída 127; MPPT: carga 10 A, 12 a 58 V, `vocMax` 58, 500 W; rendimento 0,88; vazio 15 W; piso; 0,31 × 0,26 × 0,21 |
| `est-ecoflow-delta2` | EcoFlow Delta 2 | plano | MLB35823233 | 8.547,29 | 1.024 Wh; 1.800 W; pico 2.400; saída 127 | MPPT: carga 15 A, 11 a 60 V, `vocMax` 60, 500 W; rendimento 0,88; vazio 20 W; piso; 0,40 × 0,28 × 0,21 |

Nas estações, `tensaoBateria` é 24 (não é usada), `bateriaInternaWh` é a capacidade e a entrada solar é toda típica.

`obs`:

- `inv-anenji-3kw-24v-127`: "A entrada das placas trabalha de 60 a 450 V: precisa de duas ou mais placas em série e não aceita fileiras em paralelo. Um dos anúncios fala em mínimo de 90 V. Confirme com o vendedor."
- `inv-jesudom-3k2-24v-220`: "Saída de 220 V. Está no catálogo para comparação."
- `inv-tataliken-1000-12v`: "O título diz 1000 W, mas a descrição diz 400 W contínuos."
- `inv-knup-1000-12v-110`: "O anúncio não usa a palavra contínua para os 1.000 W."
- `est-bluetti-ac70`: "A ficha diz 127 V e 220 V e a descrição diz 230 V. Confirme a versão antes de comprar."

### Controladores de carga

| `id` | Nome | Linha | Código | `precoMax` | Do anúncio | Valores típicos |
|---|---|---|---|---|---|---|
| `ctl-epever-xtra4210n` | Epever XTRA 4210N MPPT 40 A | simples | MLB45563377 | 1.149,94 | MPPT; 40 A; 12 e 24 V | `vMin` 0; `vMax` 92; `vocMax` 100; 1.560 W; 0,25 × 0,18 × 0,07 |
| `ctl-epever-tracer3210an` | Epever Tracer 3210AN MPPT 30 A | simples | MLB67566736 | 889,00 | MPPT; 30 A; 12 e 24 V | `vMin` 0; `vMax` 92; `vocMax` 100; 1.170 W; 0,23 × 0,17 × 0,07 |
| `ctl-pwm-30a` | Controlador PWM 30 A | simples | MLB2072621103 | 44,73 | PWM; 30 A; 12 e 24 V | `vMin` 0; `vMax` 50; `vocMax` 50; 900 W; 0,13 × 0,07 × 0,04 |
| `ctl-epever-ls2024eu` | Epever LS2024EU PWM 20 A | simples | MLB45561817 | | PWM; 20 A; 12 e 24 V | `vMin` 0; `vMax` 50; `vocMax` 50; 600 W; 0,14 × 0,08 × 0,04 |

### Proteções

| `id` | Nome | Código | Do anúncio | Valores típicos |
|---|---|---|---|---|
| `prot-fusivel-anl-150` | Fusível ANL 150 A com porta-fusível | MLB53767954 | fusível; 150 A | `tensaoMaxV` 32 |
| `prot-disjuntor-cc-80` | Disjuntor CC 80 A | MLBU3878288701 | disjuntor CC bipolar; 80 A; 500 V | |
| `prot-disjuntor-cc-100` | Disjuntor CC 100 A | MLBU3878288701 | 100 A; 500 V | |
| `prot-disjuntor-cc-125` | Disjuntor CC 125 A | MLBU3878288701 | 125 A; 500 V | |
| `prot-disjuntor-cc-32` | Disjuntor CC 32 A | MLB79328694 | disjuntor CC bipolar; 32 A; 1.000 V | |
| `prot-dps-cc-600` | DPS de corrente contínua 600 V | MLBU1096926941 | DPS; 600 V | `correnteA` 0 |
| `prot-disjuntor-ca-16` | Disjuntor 16 A | MLBU5120997993 | disjuntor CA; 16 A | `tensaoMaxV` 240 |

`obs` dos três disjuntores de 80, 100 e 125 A: "O anúncio tem variação de corrente; o preço é o exibido sem escolher a variação." `obs` do fusível: "Fusível de som automotivo, para até 32 V. Serve em 12 e 24 V, não em 48 V."

### Cabos

`preco` é por metro. Cabo CA representa um circuito de três condutores (fase, neutro e terra): o preço por metro é três vezes o do condutor.

| `id` | Nome | Código | Do anúncio | Valores típicos |
|---|---|---|---|---|
| `cabo-solar-6` | Cabo solar 6 mm² | MLBU4365246482 | `uso` solar; 6 mm²; cobre; R$ 169,90 por 20 m, ou 8,50 por metro | `ampacidade` 54 |
| `cabo-bat-35` | Cabo de bateria 35 mm² | MLB4849524870 | `uso` bateria; 35 mm²; 100% cobre; 76,49 por metro | `ampacidade` 155 |
| `cabo-bat-25-alucobre` | Cabo 25 mm² alucobre | MLB26524841 | `uso` bateria; 25 mm²; alucobre; R$ 200,45 por 10 m, ou 20,05 por metro | `ampacidade` 75 |
| `cabo-ca-2p5-alucobre` | Cabo 2,5 mm² alucobre | MLBU5101262487 | `uso` ca; 2,5 mm²; alucobre; R$ 54,90 por 100 m, ou 1,65 por metro de circuito | `ampacidade` 14 |

`naoRecomendado` dos dois de alucobre: "Alucobre é alumínio com uma capa fina de cobre. Conduz cerca de 60% do que conduz o cobre da mesma bitola e não é aceito em instalação elétrica residencial."

### Acessórios

| `id` | Nome | Código | `tipo` | Observação |
|---|---|---|---|---|
| `acc-ganchos-8` | Kit de 8 ganchos para telha colonial | MLBU3342297951 | estrutura | "Vem sem trilhos e sem grampos." |
| `acc-mc4-10` | Kit de 10 pares de conector MC4 | MLBU2199270183 | conector | |
| `acc-haste` | Haste de aterramento com conector | MLBU4070087836 | aterramento | |
| `acc-multimetro` | Multímetro Minipa ET-1507B | MLB22546788 | medicao | |
| `acc-wattimetro` | Medidor de consumo de tomada | MLB24123784 | medicao | "Serve para medir o consumo real de cada aparelho antes de dimensionar." |
| `acc-kit-2x155-pwm` | Kit 2 placas de 155 W com PWM | MLBU1718449056 | kit | "Sem inversor e sem bateria." |

## 4. Itens sem anúncio

Entram com `tipico: ['preco', ...]` e sem `url`. Os preços são estimativas até a coleta complementar (parte D do prompt de coleta).

| `id` | Nome | Categoria | Dados |
|---|---|---|---|
| `inv-powmr-ps3k-110` | PowMr PS-3K 24 V 110 V (PWM) | inversor, linha plano | Preço 2.399,00; `precoMax` 2.499,00; pura; 2.400 W; pico 4.800; 24 V; saída 127; PWM: carga 50 A, `vMin` 0, `vMax` 80, `vocMax` 80, 1.200 W; rendimento 0,90; vazio 40 W; parede; 0,30 × 0,42 × 0,12. `tipico` não inclui `'preco'`: o preço está nas observações da coleta, sem link. `obs`: "O título diz híbrido de 3000 W, mas a descrição diz 2,4 kW e controlador PWM. Aceita uma placa só, com desperdício." |
| `cabo-solar-4` | Cabo solar 4 mm² | cabo solar | 6,00 por metro; `ampacidade` 42 |
| `cabo-solar-10` | Cabo solar 10 mm² | cabo solar | 14,00 por metro; `ampacidade` 75 |
| `cabo-solar-16` | Cabo solar 16 mm² | cabo solar | 22,00 por metro; `ampacidade` 100 |
| `cabo-bat-16` | Cabo de bateria 16 mm² | cabo bateria | 36,00 por metro; `ampacidade` 90 |
| `cabo-bat-25` | Cabo de bateria 25 mm² | cabo bateria | 55,00 por metro; `ampacidade` 125 |
| `cabo-bat-50` | Cabo de bateria 50 mm² | cabo bateria | 110,00 por metro; `ampacidade` 190 |
| `cabo-ca-1p5` | Circuito CA 1,5 mm² | cabo ca | 4,20 por metro; `ampacidade` 17,5 |
| `cabo-ca-2p5` | Circuito CA 2,5 mm² | cabo ca | 6,60 por metro; `ampacidade` 24 |
| `cabo-ca-4` | Circuito CA 4 mm² | cabo ca | 10,50 por metro; `ampacidade` 32 |
| `acc-trilhos` | Trilhos e grampos, por placa | acessório, estrutura | 150,00 |
| `rede-tomada` | Tomada da rede da casa | rede | Preço 0; não é típico |

Todos os cabos desta tabela são de cobre. As capacidades são valores de referência da NBR 5410: cabo solar com isolação de 90 °C, cabo de bateria ao ar livre em trecho curto, circuito CA em eletroduto.

## 5. Aparelhos

Os aparelhos são os da casa, com preço zero e sem `tipico`. `potenciaW` é a potência com o aparelho funcionando, `mediaW` a média ao longo do tempo ligado, `picoW` o pico de partida e `horasDia` o uso típico por dia.

| `id` | Nome | `potenciaW` | `mediaW` | `picoW` | `horasDia` | `tensao` | Motor | Eletrônico | `forma` | `dimensoes` |
|---|---|---|---|---|---|---|---|---|---|---|
| `ap-rede` | Modem, roteador e mini PC | 40 | 40 | 60 | 24 | bivolt | não | sim | `roteador` | 0,35 × 0,20 × 0,20 |
| `ap-pc-24h` | PC ligado 24 h | 70 | 70 | 150 | 24 | bivolt | não | sim | `pc` | 0,20 × 0,45 × 0,45 |
| `ap-pc-trabalho` | PC de trabalho | 135 | 135 | 300 | 10 | bivolt | não | sim | `pc` | 0,20 × 0,45 × 0,45 |
| `ap-geladeira` | Geladeira | 150 | 90 | 900 | 24 | 127 | sim | não | `geladeira` | 0,70 × 1,75 × 0,70 |
| `ap-ventilador` | Ventilador | 50 | 50 | 100 | 12 | 127 | sim | não | `ventilador` | 0,45 × 1,30 × 0,45 |
| `ap-tv` | TV | 80 | 80 | 100 | 5 | bivolt | não | sim | `tv` | 1,10 × 0,70 × 0,25 |
| `ap-lampada` | Lâmpada LED | 9 | 9 | 9 | 6 | bivolt | não | não | `lampada` | 0,12 × 0,12 × 0,12 |
| `ap-notebook` | Notebook | 60 | 45 | 65 | 8 | bivolt | não | sim | `notebook` | 0,36 × 0,25 × 0,25 |
| `ap-microondas` | Micro-ondas | 1.300 | 1.300 | 1.500 | 0,3 | 127 | não | não | `microondas` | 0,50 × 0,30 × 0,40 |
| `ap-bomba` | Bomba d'água de 1/2 cv | 400 | 400 | 1.500 | 1 | 127 | sim | não | `caixa` | 0,30 × 0,25 × 0,20 |
| `ap-chuveiro` | Chuveiro elétrico | 5.500 | 5.500 | 5.500 | 0,5 | 127 | não | não | `chuveiro` | 0,25 × 0,25 × 0,25 |

Os seis primeiros são os do plano elétrico do Gustavo e somam 465 W de média. O micro-ondas, a bomba e o chuveiro estão no catálogo para o usuário ver o inversor recusar a carga.
