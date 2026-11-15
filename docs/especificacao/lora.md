# Especificação do simulador de rádio LoRa

Fase L0 de [plano-lora.md](../plano-lora.md). Estado em 15/11/2026: escrita, aguardando a aprovação do Gustavo para a fase L1.

Decisões do Gustavo em 15/11/2026: relevo por blocos de mapa, que só revelam a região; biblioteca MapLibre aprovada; Meshtastic como referência; mapa 2D primeiro; as casas são marcadas por ele no mapa e ficam só no navegador.

Os números esperados dos casos de teste saem de `node scripts/referencia/lora-referencia.mjs`, uma implementação independente da do núcleo.

## 1. Separação dos ambientes

- Código em `src/lora/`, nas camadas `nucleo` (conta pura: sem DOM, sem rede, sem MapLibre), `dados` (relevo), `mapa` (MapLibre e desenho) e `ui` (painéis). `src/lora/estado.ts` e `src/lora/main.ts` são do coordenador.
- `src/lora/` não importa de `src/cena`, `src/ui`, `src/estado.ts` nem `src/conteudo`. Pode importar de `src/nucleo` só o cálculo de autonomia, na tarefa L3.3. O ambiente solar não importa nada de `src/lora/`.
- Página própria, `lora.html`, com `src/lora/main.ts`. O Vite gera as duas páginas. No alto de cada uma, um seletor "Energia solar | Rádio LoRa" leva à outra.
- Projetos de LoRa em chaves próprias do navegador: `offgrid.lora.projetos` e `offgrid.lora.projetos.<id>`, com a mesma mecânica de `src/biblioteca.ts`.
- Interface e comentários em português do Brasil; nomes de domínio no código em português sem acento.

## 2. Constantes e as fontes

| Constante | Valor | Fonte |
|---|---|---|
| Raio médio da Terra | 6.371,0088 km | IUGG |
| Fator de raio efetivo `k` | 4/3 | Atmosfera padrão; a ITU-R P.526 sugere raio efetivo de 8.500 km quando não há outro dado |
| Raio efetivo | `k × 6.371,0088` = 8.494,7 km | derivado |
| Velocidade da luz | 299.792.458 m/s | definição |
| Fração da zona de Fresnel que precisa estar livre | 60% | regra clássica de enlace; a P.526 dá `hreq = 0,552·√(d1·d2·λ/d)`, que é 57% do raio |
| Potência padrão do rádio | 22 dBm | suposição da tabela de orçamento do Meshtastic |
| Ganho padrão da antena | 0 dBi | suposição da mesma tabela |
| Limite de saltos | 3 por padrão, 7 no máximo | documentação do Meshtastic, configuração LoRa |

Regiões (documentação do Meshtastic, configuração LoRa):

| Região | Faixa | Frequência de cálculo | Potência máxima no firmware |
|---|---|---|---|
| `ANZ` (padrão; é a da comunidade brasileira) | 915 a 928 MHz | 921,5 MHz | 30 dBm |
| `BR_902` | 902 a 907,5 MHz | 904,75 MHz | 30 dBm |

A frequência de cálculo é o meio da faixa. A diferença entre as duas faixas na perda é de 0,2 dB.

Modos do rádio (tabela oficial do Meshtastic, "radio settings"). A sensibilidade é derivada: `22 dBm − orçamento`.

| Modo | Banda | Fator de espalhamento | Taxa | Orçamento | Sensibilidade |
|---|---|---|---|---|---|
| Short Turbo | 500 kHz | 7 | 21,88 kbps | 140 dB | −118 dBm |
| Short Fast | 250 kHz | 7 | 10,94 kbps | 143 dB | −121 dBm |
| Short Slow | 250 kHz | 8 | 6,25 kbps | 145,5 dB | −123,5 dBm |
| Medium Turbo | 500 kHz | 9 | 7,03 kbps | 145 dB | −123 dBm |
| Medium Fast | 250 kHz | 9 | 3,52 kbps | 148 dB | −126 dBm |
| Medium Slow | 250 kHz | 10 | 1,95 kbps | 150,5 dB | −128,5 dBm |
| Long Turbo | 500 kHz | 11 | 1,34 kbps | 150 dB | −128 dBm |
| Long Fast (padrão) | 250 kHz | 11 | 1,07 kbps | 153 dB | −131 dBm |
| Long Moderate | 125 kHz | 11 | 0,34 kbps | 156 dB | −134 dBm |

O planejador do Meshtastic usa −130 dBm para o Long Fast; a diferença de 1 dB é aceita.

## 3. Regra da Anatel

Fonte: Ato nº 14.448/2017, item 10, lido em uma cópia do texto com data de 06/08/2018. O ato foi alterado depois (Atos 4776/2020 e 1306/2021) e o site da Anatel estava em manutenção em 15/11/2026: **falta conferir o texto vigente** (tarefa L0.2, em aberto).

O que a cópia diz para "sequência direta ou outras técnicas de modulação digital" nas faixas 902 a 907,5 MHz e 915 a 928 MHz:

- 10.3.2: potência de pico máxima na saída do transmissor de 1 W (30 dBm).
- 10.3.3: densidade espectral de potência de pico de até 8 dBm em qualquer faixa de 3 kHz.
- 10.3.1: largura de faixa a 6 dB de no mínimo 500 kHz, com dispensa para o equipamento avaliado pela potência média conduzida (10.3.4.4).
- 10.5: com antena de ganho acima de 6 dBi, a potência cai o mesmo tanto, em dB, que o ganho passar de 6 dBi.

Consequência para o simulador, enquanto a tarefa L0.2 não fecha:

- O campo de potência aceita de 0 a 30 dBm.
- A tela mostra um aviso, sem bloquear, quando `potência > 30 − máx(0; ganho − 6)`, e outro quando a potência passa do limite estimado pela densidade espectral: `8 + 10·log(banda em kHz / 3)`, que dá 24,2 dBm em 125 kHz, 27,2 dBm em 250 kHz e 30 dBm em 500 kHz. Esse segundo limite supõe espectro plano e é uma estimativa; o texto do aviso diz isso.
- Todo aviso de regra termina com: "Confira a regra vigente na Anatel. O rádio precisa ser homologado."

## 4. Núcleo de rádio (`src/lora/nucleo`)

Funções puras. Distâncias em km, alturas em m, frequência em MHz, potências em dBm, ganhos e perdas em dB.

### 4.1 Geografia

- `distanciaKm(a, b)`: fórmula do haversine com o raio médio.
- `pontoNoCaminho(a, b, t)`: ponto a uma fração `t` do círculo máximo entre `a` e `b`.
- `rumoGraus(a, b)`: rumo inicial, de 0 a 360, a partir do norte.

### 4.2 Perfil do terreno

`Perfil` é a lista de pontos `{ dKm, altM }` do começo ao fim, com a altitude do terreno. O primeiro e o último ponto são o terreno embaixo das antenas. Quem monta o perfil é a camada de dados (seção 5); o núcleo só recebe.

Espaçamento: um ponto a cada 0,1 km, com no mínimo 20 e no máximo 1.500 pontos. A norma pede espaçamento pequeno mesmo em trecho plano, porque a conta não interpola entre os pontos.

### 4.3 Geometria do enlace

Para cada ponto do perfil, com `d1` a distância até o começo e `d2` até o fim:

- **Curva da Terra:** `curvaM = d1·d2 / (2·raioEfetivo) × 1000`.
- **Linha entre as antenas:** reta da altitude da antena de um lado à do outro. Altitude da antena é a do terreno mais a altura da antena.
- **Folga:** `linha − (terreno + curva)`.
- **Raio da zona de Fresnel:** `17,32·√(d1·d2 / (GHz·d))`.
- **Zona livre:** verdadeiro quando a folga é de pelo menos 60% do raio em todos os pontos do meio.
- **Pior ponto:** o de menor `folga − 0,6·raio`. É o que a tela aponta: "o terreno a 7,2 km do começo corta a linha em 40 m".

### 4.4 Perda no ar livre

`32,45 + 20·log(MHz) + 20·log(km)`.

### 4.5 Perda por difração

Método de Bullington, ITU-R P.526-16, § 4.5.1, equações 49 a 57, conferidas no texto da norma. `Ce = 1 / raioEfetivo`, `λ` em metros, `hts` e `hrs` as altitudes das antenas, `hi` e `di` os pontos do meio do perfil.

```
alto(i) = hi + 500·Ce·di·(d − di)
Stim = máx[ (alto(i) − hts) / di ]
Str  = (hrs − hts) / d

Se Stim < Str (com visada):
  νmax = máx[ (alto(i) − (hts·(d − di) + hrs·di)/d) · √(0,002·d / (λ·di·(d − di))) ]
  Luc = J(νmax)
Senão (sem visada):
  Srim = máx[ (alto(i) − hrs) / (d − di) ]
  db   = (hrs − hts + Srim·d) / (Stim + Srim)
  νb   = (hts + Stim·db − (hts·(d − db) + hrs·db)/d) · √(0,002·d / (λ·db·(d − db)))
  Luc = J(νb)

J(ν) = 6,9 + 20·log(√((ν − 0,1)² + 1) + ν − 0,1)   para ν > −0,78; senão 0
Perda = Luc + (1 − e^(−Luc/6))·(10 + 0,02·d)
```

**Limite conhecido:** esta é só a parte de Bullington. O método completo da norma (§ 4.5.2) soma uma correção de Terra esférica, que pesa em caminho liso: mar, baía, planície. Sem ela, a perda nesses caminhos fica subestimada. A correção é a tarefa L1.4; até lá, vale a regra do veredito da seção 4.7, que não deixa um caminho raspando ser dado como "com folga".

### 4.6 Conta do enlace

```
recebido = potência + ganhoTx − caboTx − (arLivre + difração + margemDoAmbiente) + ganhoRx − caboRx
folga    = recebido − sensibilidade do modo
```

`margemDoAmbiente` é um valor que a pessoa ajusta, de 0 a 40 dB, com padrão 0. Representa o que o relevo não mostra: prédios, árvores, paredes. O simulador não sugere um número para ela; a tela explica para que serve.

O enlace é calculado nos dois sentidos quando as potências ou os cabos das pontas são diferentes, e vale a menor folga.

### 4.7 Veredito

| Veredito | Quando |
|---|---|
| Fecha com folga | Folga de 10 dB ou mais **e** zona livre |
| Fecha no limite | Folga de 0 dB ou mais, nos outros casos |
| Não fecha | Folga abaixo de 0 dB |

Os 10 dB são a margem de desvanecimento escolhida para o projeto; é uma escolha, não um dado de norma, e fica em uma constante só. O texto do veredito sempre diz o motivo: a folga, se a zona está livre e, quando não está, o pior ponto. Em "fecha no limite" com folga calculada alta e caminho raspando, o texto avisa que a conta pode estar otimista e manda testar em campo.

### 4.8 O que mudar para fechar

Para um enlace que não fecha com folga, o núcleo calcula o efeito de cada mudança, uma por vez, e devolve a folga nova e o veredito novo:

- subir cada antena para 6, 10, 15 e 20 m;
- trocar o modo pelo seguinte mais lento, até o Long Moderate;
- antena de 3, 6 e 9 dBi em cada ponta (com o aviso da seção 3 quando passa de 6 dBi).

### 4.9 Rede (fase L3)

- Uma rota é uma sequência de pontos; cada trecho é um enlace. A folga da rota é a do pior trecho.
- A rota cabe se o número de repetidores no meio for menor ou igual ao limite de saltos (3 por padrão).
- "Sugerir ponto de repetidor": numa grade de 0,5 km dentro de um retângulo em volta dos dois pontos (margem de 30% da distância, no mínimo 3 km), calcula os dois trechos de cada candidato com antena de 6 m e ordena pela menor das duas folgas. Devolve os 5 melhores que fiquem a mais de 1 km um do outro. Os detalhes fecham na especificação da fase L3.

## 5. Relevo (`src/lora/dados`)

- **Fonte:** blocos "Terrarium" do conjunto público Terrain Tiles, na AWS: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Conferido em 15/11/2026: responde com `Access-Control-Allow-Origin: *`.
- **Altitude de um pixel:** `R·256 + G + B/256 − 32768`, em metros.
- **Zoom 11.** Cada bloco tem cerca de 18 km de lado na latitude do Rio, com um pixel de cerca de 70 m. O servidor fica sabendo só em que bloco de 18 km a pessoa está olhando.
- **Privacidade:** o simulador nunca manda coordenadas de pontos; só pede blocos. Ele pede o bloco de cada ponto do perfil e os oito vizinhos de cada bloco das pontas, para a região pedida não ter a casa no centro.
- **Bloco de um ponto:** projeção de Mercator da web: `x = (lon + 180)/360 · 2^z`, `y = (1 − ln(tan(lat) + 1/cos(lat))/π)/2 · 2^z`.
- **Altitude de um ponto:** interpolação bilinear entre os quatro pixels vizinhos, atravessando a borda do bloco quando preciso.
- **Guarda:** os blocos ficam na memória e no cache do navegador. Bloco que não baixa gera um erro com mensagem clara; o enlace não é calculado com relevo pela metade.
- **Atribuição** na tela: os dados dos blocos (Mapzen, SRTM e outros) e, no mapa, "© colaboradores do OpenStreetMap".

O mapa de fundo usa os blocos do OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), pelo MapLibre. **Limite de privacidade que não dá para evitar:** quem serve o mapa fica sabendo a área que está na tela, e com zoom alto essa área é pequena. A tela avisa disso uma vez. O projeto e os pontos nunca são enviados a lugar nenhum.

## 6. Projeto de LoRa

```ts
interface ProjetoLora {
  versao: 1;
  nome: string;
  regiao: 'ANZ' | 'BR_902';
  modo: string;              // id de um modo da tabela da seção 2
  margemDoAmbienteDb: number;
  limiteDeSaltos: number;    // de 1 a 7
  pontos: PontoLora[];
  /** Pares de pontos ligados. */
  enlaces: { de: string; para: string }[];
}

interface PontoLora {
  id: string;
  nome: string;
  tipo: 'casa' | 'repetidor';
  lat: number;
  lon: number;
  alturaDaAntenaM: number;   // acima do terreno; padrão 6
  potenciaDbm: number;       // padrão 22
  ganhoDbi: number;          // padrão 0
  perdaNoCaboDb: number;     // padrão 0
}
```

O projeto novo começa sem pontos. Não há ponto pré-marcado em lugar nenhum.

## 7. Tela (fase L2)

- **Mapa** ocupando o centro, com os pontos arrastáveis e os enlaces como linhas coloridas pelo veredito: verde, amarelo e vermelho, sempre com o texto do veredito junto, não só a cor.
- **Ferramentas:** "Novo ponto" (clica no mapa), "Ligar dois pontos", e depois "Novo repetidor" e "Sugerir ponto de repetidor".
- **Painel do ponto:** nome, tipo, altura da antena, potência, ganho, perda no cabo e a altitude do terreno.
- **Painel do enlace:** o veredito em uma frase, a conta linha a linha (potência, ganhos, perda no ar, perda no relevo, margem do ambiente, o que chega, o que o rádio precisa, a folga) e a lista "o que mudar para fechar".
- **Corte do terreno:** gráfico com o terreno já somado à curva da Terra, a linha entre as antenas, a zona de Fresnel (60% e inteira) e o pior ponto marcado. Passar o ponteiro mostra a distância, a altitude e a folga.
- **Aviso fixo:** "O simulador considera o relevo, não prédios nem árvores. Na cidade, o resultado real costuma ser pior. Teste em campo antes de comprar e instalar."
- Cada termo de rádio é explicado na primeira vez em que aparece, como no simulador solar.

## 8. Casos de teste

Saída de `node scripts/referencia/lora-referencia.mjs`. Tolerância de 0,01 nas unidades de cada linha.

**Perda no ar livre:** 20 km em 915 MHz: 117,70 dB. 40 km em 915 MHz: 123,72 dB. 20 km em 921,5 MHz: 117,76 dB. 1 km em 904,75 MHz: 91,58 dB.

**Distância:** de (0; 0) a (0; 1): 111,195 km. De (−10; −50) a (−10,2; −50,3): 39,663 km.

**Curva e Fresnel, 915 MHz:** no meio de 20 km: curva 5,89 m, raio 40,49 m, 60% 24,29 m. No meio de 40 km: curva 23,54 m, raio 57,26 m, 60% 34,35 m. A 5 km de um enlace de 20 km: curva 4,41 m, raio 35,06 m.

**J(ν):** ν = −1: 0. ν = −0,78: 0. ν = 0: 6,03 dB. ν = 1: 13,93 dB. ν = 2,4: 20,54 dB.

**Difração de Bullington,** 915 MHz, terreno ao nível do mar, um ponto a cada 0,1 km:

| Caso | Visada | Luc | Perda |
|---|---|---|---|
| Plano, 20 km, antenas a 8 m | sim | 5,40 dB | 11,57 dB |
| Plano, 20 km, antenas a 30 m | sim | 0 | 0 |
| Plano, 40 km, antenas a 8 m | não | 10,17 dB | 18,99 dB |
| Plano, 40 km, antenas a 60 m | sim | 0 | 0 |
| Morro de 100 m no meio (um ponto só), 20 km, antenas a 10 m | não | 23,36 dB | 33,55 dB |
| Morros de 80 m aos 5 km e de 120 m aos 14 km, 20 km, antenas a 10 m | não | 28,25 dB | 38,56 dB |
| Uma ponta a 300 m e a outra a 10 m, plano, 40 km | sim | 0 | 0 |

**Conta do enlace,** Long Fast, 22 dBm, 0 dBi, sem cabo: 20 km no ar livre: chega −95,70 dBm, folga 35,30 dB. 40 km: chega −101,72 dBm, folga 29,28 dB. Morro de 100 m no meio de 20 km, antenas de 3 dBi e 1 dB de cabo no total: chega −124,24 dBm, folga 6,76 dB: "fecha no limite".

**Limite pela densidade espectral:** 125 kHz: 24,20 dBm. 250 kHz: 27,21 dBm. 500 kHz: 30,00 dBm.

**Relevo:** pixel (128; 0; 0): 0 m. (130; 110; 128): 622,50 m. (127; 255; 0): −1 m. No zoom 11: (0; 0) fica no bloco 1024/1024, pixel (0; 0). (−10; −50) fica no bloco 739/1081, pixel (142,2; 46,1). (45; 90) fica no bloco 1536/736, pixel (0; 183,5).

Os testes do núcleo e do relevo usam perfis e blocos feitos à mão, em lugares sem relação com o Gustavo. Nenhum teste nem captura de tela usa a região das casas.
