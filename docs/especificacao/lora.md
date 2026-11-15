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
- A tela mostra um aviso, sem bloquear, quando `potência > 30 − máx(0; ganho − 6)`, e outro quando a potência passa do limite estimado pela densidade espectral: `mín(30; 8 + 10·log(banda em kHz / 3))`, que dá 24,2 dBm em 125 kHz, 27,2 dBm em 250 kHz e 30 dBm em 500 kHz (a fórmula daria 30,2; vale o teto de 1 W). Esse segundo limite supõe espectro plano e é uma estimativa; o texto do aviso diz isso.
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

Esta é só a parte de Bullington, `difracaoDeBullington`. Sozinha, ela subestima a perda em caminho liso: mar, baía, planície. O enlace usa o método completo, a seguir.

### 4.5.1 Método completo (tarefa L1.4)

ITU-R P.526-16, § 4.5.2 (equações 58 a 66) e § 3.2 com § 3.1.1.2 (equações 13 a 18 e 21 a 25), lidas nas páginas da norma em 15/11/2026. Função `difracaoCompleta(perfil, alturaInicioM, alturaFimM, mhz): Difracao`.

```
Lba = Bullington do perfil de verdade, com hts = h1 + altura da antena e hrs = hn + altura da antena

Superfície lisa ajustada ao perfil (h em m, d em km; i de 2 a n):
  v1 = Σ (di − di−1)·(hi + hi−1)
  v2 = Σ (di − di−1)·[hi·(2·di + di−1) + hi−1·(di + 2·di−1)]
  hstip = (2·v1·d − v2) / d²
  hsrip = (v2 − v1·d) / d²

Obstrução acima da reta entre as antenas (i de 2 a n − 1):
  hobi  = hi − [hts·(d − di) + hrs·di] / d
  hobs  = máx(hobi)      αobt = máx(hobi / di)      αobr = máx(hobi / (d − di))
  Se hobs ≤ 0:  hstp = hstip                         hsrp = hsrip
  Senão:        hstp = hstip − hobs·αobt/(αobt + αobr)    hsrp = hsrip − hobs·αobr/(αobt + αobr)
  hst = mín(hstp; h1)     hsr = mín(hsrp; hn)
  h'ts = hts − hst        h'rs = hrs − hsr

Lbs  = Bullington de um perfil com as mesmas distâncias e todas as alturas zero, com antenas a h'ts e h'rs
Lsph = Terra esférica (abaixo), com a distância d e as alturas h1 = h'ts e h2 = h'rs
Perda = Lba + máx(Lsph − Lbs; 0)
```

Terra esférica, § 3.2. Unidades consistentes: aqui `h1`, `h2` e `λ` entram em km; `ae` é o raio efetivo, em km.

```
dlos = √(2·ae)·(√h1 + √h2)
Se d ≥ dlos:  Lsph = máx(0; A(ae))
Senão:
  c = (h1 − h2)/(h1 + h2)        m = d² / (4·ae·(h1 + h2))
  b = 2·√((m + 1)/(3·m))·cos( π/3 + (1/3)·arccos( (3·c/2)·√(3·m/(m + 1)³) ) )
  d1 = (d/2)·(1 + b)             d2 = d − d1
  h    = [ (h1 − d1²/(2·ae))·d2 + (h2 − d2²/(2·ae))·d1 ] / d
  hreq = 0,552·√(d1·d2·λ/d)
  Se h > hreq:  Lsph = 0
  Senão:
    aem = 0,5·( d / (√h1 + √h2) )²
    Ah  = A(aem)
    Lsph = 0 se Ah < 0; senão (1 − h/hreq)·Ah
```

`A(a)` é a perda além do horizonte do § 3.1.1.2, com `β = 1` (vale acima de 20 MHz em terra e de 300 MHz no mar), `d` em km, `a` em km, `f` em MHz e as alturas em m:

```
X = 2,188·f^(1/3)·a^(−2/3)·d
Y = 9,575×10⁻³·f^(2/3)·a^(−1/3)·h          (um Y para cada antena)
F(X) = 11 + 10·log(X) − 17,6·X             para X ≥ 1,6;   senão −20·log(X) − 5,6488·X^1,425
G(Y) = 17,6·√(Y − 1,1) − 5·log(Y − 1,1) − 8   para Y > 2;  senão 20·log(Y + 0,1·Y³)
A = −( F(X) + G(Y1) + G(Y2) )
```

O piso de `G(Y)` da norma (`2 + 20·log K`) não é aplicado: com `β = 1` o `K` é muito pequeno, e antena de 1 m ou mais fica sempre acima dele. O `máx(0; …)` do caso além do horizonte é um resguardo do projeto, não da norma.

`Difracao.perdaDb` passa a ser a perda do método completo, e `Difracao.terraLisaDb` guarda a parcela `máx(Lsph − Lbs; 0)`, para a tela dizer quanto da perda vem do caminho liso. `calcularEnlace` usa `difracaoCompleta`.

**Efeito:** em caminho liso com antenas a 8 m, a perda sobe de 11,6 para 23,3 dB em 20 km e de 19,0 para 39,7 dB em 40 km. No Long Fast com 22 dBm e sem ganho, a folga fica em 12,0 dB em 20 km e em −10,4 dB em 40 km: sobre água, os 20 km fecham e os 40 km não.

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

### 4.9 Rede (fase L3, aprovada pelo Gustavo em 15/11/2026)

O repetidor não amplifica o sinal: ele recebe a mensagem inteira e a transmite de novo. No Meshtastic, qualquer rádio da rede repassa mensagens, não só os marcados como repetidor; por isso a rota pode passar por qualquer ponto.

**Rota** (`src/lora/nucleo/rede.ts`, função pura `melhorRota`):

- O grafo são os pontos do projeto; as arestas são os enlaces com resultado pronto, cada um com a folga e o veredito dele.
- Uma rota de A a B é um caminho sem repetir ponto. O número de **pontos no meio** não pode passar do limite de saltos do projeto (3 por padrão, 7 no máximo).
- A folga da rota é a do pior trecho. O veredito da rota é o pior veredito dos trechos.
- Entre as rotas que cabem no limite, vale a de melhor veredito; no empate, a de maior folga; no empate, a de menos pontos no meio.
- Resultado: os pontos da rota em ordem, os trechos (de, para, folga, veredito), o trecho mais fraco, a folga, o veredito e o número de pontos no meio. Sem caminho nenhum: nulo, com o motivo "não há ligação". Se só existe caminho com mais pontos no meio do que o limite: nulo, com o motivo "passa do limite de saltos" e quantos pontos no meio seriam precisos.
- A tela mostra a rota de cada par de pontos do tipo casa.

**Sugerir ponto de repetidor** (`sugerirRepetidores`, função pura sobre uma função de altitude):

- Entradas: os dois pontos, o rádio do repetidor (o padrão de um ponto novo: antena a 6 m, 22 dBm, 0 dBi, sem cabo), a função de altitude e o ambiente do projeto.
- Candidatos: uma grade de 0,5 km em um retângulo alinhado com o caminho, que se estende além das duas pontas e para os dois lados por uma margem de 30% da distância, com no mínimo 3 km. Ficam de fora os candidatos a menos de 1 km de qualquer uma das pontas.
- Para não calcular a grade inteira, entram na conta só os 300 candidatos de terreno mais alto.
- Para cada um, calcula os dois trechos (ponta A ao candidato e candidato à ponta B) com o mesmo cálculo do enlace.
- Ordem: melhor veredito do pior trecho; no empate, maior folga do pior trecho.
- Devolve até 5, cada um a mais de 1 km dos já escolhidos, com a posição, a altitude do terreno, a folga e o veredito de cada trecho e o veredito do conjunto.
- A lista pode vir só com candidatos que não fecham: a tela diz que um repetidor só não resolve e sugere repetir a busca entre o melhor candidato e a ponta que ficou sem ligação.
- A conta é feita em pedaços, sem travar a tela, com o andamento visível. Os números da grade (0,5 km, 30%, 3 km, 300, 1 km, 5) são escolhas do projeto para a busca ficar rápida; não são dados de norma.
- A busca baixa os blocos de relevo de todo o retângulo. Continua valendo a regra de privacidade: só blocos, nunca coordenadas.

**Limite do que a sugestão sabe:** ela procura terreno alto com boa ligação para os dois lados. Não sabe se o lugar tem acesso, dono, energia ou autorização. É um ponto de partida para olhar no mapa e visitar.

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

**Terra esférica (§ 3.2),** 915 MHz, alturas acima da superfície lisa: 20 km com antenas a 8 m: 23,31 dB. 20 km a 30 m: 0. 40 km a 8 m: 39,65 dB. 40 km a 60 m: 0. 40 km com 300 m e 10 m: 0. 80 km a 10 m: 68,57 dB.

**Método completo (§ 4.5.2),** 915 MHz, um ponto a cada 0,1 km:

| Caso | Bullington do caminho | Do caminho liso | Terra esférica | Perda |
|---|---|---|---|---|
| Plano ao nível do mar, 20 km, antenas a 8 m | 11,57 | 11,57 | 23,31 | 23,31 dB |
| Plano ao nível do mar, 20 km, antenas a 30 m | 0 | 0 | 0 | 0 |
| Plano ao nível do mar, 40 km, antenas a 8 m | 18,99 | 18,99 | 39,65 | 39,65 dB |
| Plano ao nível do mar, 40 km, antenas a 60 m | 0 | 0 | 0 | 0 |
| Planalto a 800 m, 20 km, antenas a 8 m | 11,57 | 11,57 | 23,31 | 23,31 dB |
| Morro de 100 m no meio (um ponto só), 20 km, antenas a 10 m | 33,55 | 0 | 0 | 33,55 dB |
| Serra de 300 m entre 8 e 12 km, 20 km, antenas a 10 m | 45,46 | 0 | 0 | 45,46 dB |
| Rampa de 0 a 400 m, 30 km, antenas a 6 m | 16,06 | 16,06 | 36,98 | 36,98 dB |
| Terreno a 300 m só no primeiro ponto e mar depois, 40 km, antenas a 6 m | 0 | 0 | 0 | 0 |

**Conta do enlace com o método completo,** Long Fast, 22 dBm, 0 dBi, sem cabo: plano ao nível do mar, 20 km, antenas a 8 m: folga de 11,99 dB e zona não livre: "fecha no limite". O mesmo com 40 km: folga de −10,37 dB: "não fecha".

**Conta do enlace,** Long Fast, 22 dBm, 0 dBi, sem cabo: 20 km no ar livre: chega −95,70 dBm, folga 35,30 dB. 40 km: chega −101,72 dBm, folga 29,28 dB. Morro de 100 m no meio de 20 km, antenas de 3 dBi e 1 dB de cabo no total: chega −124,24 dBm, folga 6,76 dB: "fecha no limite".

**Limite pela densidade espectral:** 125 kHz: 24,20 dBm. 250 kHz: 27,21 dBm. 500 kHz: 30,00 dBm.

**Relevo:** pixel (128; 0; 0): 0 m. (130; 110; 128): 622,50 m. (127; 255; 0): −1 m. No zoom 11: (0; 0) fica no bloco 1024/1024, pixel (0; 0). (−10; −50) fica no bloco 739/1081, pixel (142,2; 46,1). (45; 90) fica no bloco 1536/736, pixel (0; 183,5).

Os testes do núcleo e do relevo usam perfis e blocos feitos à mão, em lugares sem relação com o Gustavo. Nenhum teste nem captura de tela usa a região das casas.

## 9. Registros da construção

- **Antena de altura zero** não tem conta definida no § 3.1.1.2 da norma. O núcleo devolve perda de caminho liso zero nesse caso. Na prática ele não acontece: o estado não aceita antena abaixo de 1 m.
- **Frase do caminho liso no veredito.** Aparece quando a parcela `terraLisaDb` é de 3 dB ou mais. Se ela responde por 40% ou mais da perda no relevo, o texto diz "O caminho é liso (mar, baía ou planície) e a curva da Terra tira N dB do sinal."; senão, diz "Dessa perda, N dB vêm da curva da Terra.", porque há morro no caminho e ele não é liso. Os 40% são uma escolha de redação, não um dado de norma.
- **Teste com os serviços de verdade,** em 15/11/2026, na região da Chapada dos Veadeiros (Goiás), um lugar público sem relação com o Gustavo: o mapa do OpenStreetMap e o relevo da AWS carregaram, as altitudes vieram coerentes com a região (de 830 a 1.620 m) e a página só falou com esses dois serviços. A verificação automática continua usando blocos falsos, sem rede.
- **Delete com um enlace selecionado** apaga só o enlace; os pontos ficam. **"Ver todos"** enquadra os pontos no mapa.
- **Fase L3 na tela.** Com só dois pontos no projeto, "Sugerir ponto de repetidor" começa a busca direto entre eles. As sugestões somem quando muda a posição ou o rádio de uma das pontas, a região, o modo ou a margem do ambiente, e ao trocar de projeto. "Pôr um repetidor aqui" cria o repetidor e os dois enlaces em um passo só de desfazer (`acoesLora.porRepetidor`) e mantém o enlace direto, se havia. Quando algum enlace está em erro de relevo e não há rota, a tela diz "sem resultado", não "sem ligação".
- **Limite conhecido das rotas.** Quando existe um enlace direto que não fecha e um caminho bom que passa do limite de saltos, a tela mostra a rota direta "não fecha" e não menciona o limite: é o que `melhorRota` devolve.
