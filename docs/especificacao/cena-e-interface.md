# Especificação da cena 3D e da interface

Vale para `src/cena/`, `src/ui/`, `src/estado.ts` e `scripts/verificar.mjs`. As convenções de eixos e de coordenadas da casa estão em [especificacao.md](../especificacao.md).

## 1. Tela

Janela mínima de 1200 × 700. A cena 3D ocupa o centro, com quatro áreas em volta:

| Área | Conteúdo |
|---|---|
| Topo | Nome do projeto; botões Novo, Cenário do plano, Exportar, Importar; modo de visão; ajuda |
| Esquerda (280 px) | Catálogo |
| Direita (340 px) | Abas Consultor, Orçamento e Sistema |
| Base | Barra de tempo e controles da casa |

Sobre a cena ficam os mostradores (sol, consumo, bateria, rede), o painel do item selecionado e a dica do que está sob o ponteiro.

## 2. Cena base

- **Câmera.** Perspectiva de 45°, começando em (−14, 11, −16) e olhando para (0, 2,5, 0): com a orientação inicial, é a vista da frente da casa, com a varanda e o quartinho à mostra. Órbita com o botão esquerdo, deslocamento com o direito, zoom na roda. Distância de 4 a 60 m. A câmera não desce abaixo do chão.
- **Chão.** Plano de 80 × 80 m, gramado (`#7fae6b`).
- **Rosa dos ventos.** Letras N, L, S e O a 12 m do centro e uma seta para o norte. Fica presa ao mundo: não gira com a casa.
- **Luz.** Uma luz direcional (o sol), com sombra, e uma luz de hemisfério para o ambiente.

## 3. Casa

A casa é um grupo da cena. A rotação dele em Y é `π − orientacao`, em radianos, de modo que a frente (+Z local) aponte para o azimute `orientacaoGraus`. Equipamentos e cabos são filhos desse grupo.

Valores iniciais de `CasaConfig`: largura 8; profundidade 7; 2 andares; pé-direito 2,8; inclinação do telhado 35%; beiral 0,5; varanda na frente, com 3 m de profundidade e inclinação de 30%; quartinho em x = 6,5 e z = −2,0, com 2,4 × 2,0 m e 2,3 m de altura; orientação 0 (frente para o norte).

Geometria, em coordenadas da casa:

- **Paredes.** Espessura de 0,15. Em cada andar, quatro paredes formando a caixa, com o lado de fora no limite da planta.
- **Pisos.** Laje do térreo de y = 0 a 0,05 (`piso-terreo`). Com 2 andares, laje superior de y = pé-direito − 0,12 a pé-direito (`piso-superior`).
- **Telhado principal.** Duas águas, com a cumeeira paralela à frente. Com `hTopo = andares × peDireito` e `s = inclinacao / 100`: a cumeeira fica em z = 0 e y = `hTopo + (profundidade / 2) × s`; cada água desce até z = ±(profundidade / 2 + beiral) e y = `hTopo − beiral × s`, e vai de x = −(largura / 2 + beiral) a +(largura / 2 + beiral). Espessura de 0,08. Superfícies `telhado-frente` e `telhado-fundos`.
- **Oitões.** Triângulos que fecham as laterais entre `hTopo` e o telhado.
- **Varanda.** Encostada na fachada do lado escolhido, na largura inteira da fachada. O telhado encontra a parede em y = `peDireito + 0,25` com 2 andares, ou `peDireito − 0,10` com 1 andar, e desce para fora com a inclinação da varanda. Espessura de 0,07. Superfície `telhado-varanda`. Pilares de 0,12 × 0,12 na borda de fora, nas duas pontas e, se a fachada passar de 5 m, um no meio. Piso `piso-varanda`.
- **Quartinho.** Piso (`piso-quartinho`), parede dos fundos (`parede-quartinho-fundo`) e duas laterais, com 0,10 de espessura. A frente é aberta e, com giro 0, fica voltada para +Z. Telhado de uma água, com 15% de inclinação caindo para os fundos e beiral de 0,2 (`telhado-quartinho`).

Cores: paredes `#f2efe6`, telha `#b5532d`, piso do térreo `#cfc8b8`, piso superior `#b08d62`, pilares `#e8e2d2`, quartinho `#e6dfcf`.

Marcações nas malhas:

- `userData.superficie = { id, tipo }`, com `tipo` em `telhado`, `parede` ou `piso`, em toda malha que aceita equipamento.
- `userData.sombra = true` em toda malha sólida da casa, da varanda e do quartinho. Essas malhas tapam o sol no cálculo mesmo quando o modo de visão as esconde.

Modos de visão:

| Modo | Esconde |
|---|---|
| `completa` | Nada |
| `sem-telhado` | As duas águas, os oitões e os equipamentos encaixados nelas |
| `terreo` | O mesmo, mais as paredes e o piso do andar superior e os equipamentos encaixados nele |

O telhado da varanda e o quartinho ficam sempre visíveis. O que está escondido não recebe clique.

## 4. Sol na cena

A cada mudança de tempo, a posição vem de `posicaoSol` e `direcaoSol`.

- A luz direcional fica a 50 m na direção do sol. Mapa de sombra de 2048, cobrindo ±18 m em volta da casa. Intensidade de 3,5 × `máx(0; sen(elevação))`.
- A luz de hemisfério vai de 0,12 à noite a 2,2 de dia, para as paredes em sombra continuarem claras (cerca de `#aeb0a1` ao meio-dia).
- A cor do fundo vai de `#0b1026` (noite) a `#9fd0f5` (dia), conforme a elevação entre −6° e +6°.
- Uma esfera representa o sol a 45 m, e uma linha mostra o arco do sol no dia.

## 5. Equipamentos

Modelos fiéis aos produtos, com as medidas de `dimensoes` do catálogo (largura, altura, profundidade). A descrição abaixo é o mínimo; o detalhamento de cada modelo e do quadro de energia entra na especificação no início da fase 2. A placa usa `largura × altura × 0,035`. A origem da malha fica no centro da caixa.

| Peça | Forma | Encaixa em |
|---|---|---|
| Placa | Lâmina azul-escura com moldura clara e linhas de células | `telhado` |
| Inversor de parede, controlador | Caixa cinza-claro com um visor | `parede` |
| Tomada da rede | Placa de 0,12 × 0,12 × 0,03 | `parede` |
| Bateria | Caixa: lítio azul-acinzentado, chumbo preto com tampa colorida | `piso` |
| Inversor de piso, estação portátil | Caixa baixa; a estação tem alça | `piso` |
| Aparelho | Conforme `forma`: geladeira, ventilador, TV, PC, notebook, roteador, micro-ondas, lâmpada, chuveiro ou caixa | `piso` |

Orientação no encaixe, com `n` a normal da superfície:

- **Telhado.** O eixo Z da peça é `n`; o Y é a direção de subida do telhado (a vertical projetada no plano); o X é `Y × Z`.
- **Parede.** Z é `n`, Y é a vertical.
- **Piso.** Y é a vertical; a frente fica em +Z da casa.
- `giro` (0, 90, 180 ou 270) gira a peça em torno da normal. Na placa, 90 a deixa deitada.
- A posição é o centro da peça: o ponto tocado mais `n` vezes metade da espessura, ou metade da altura no piso.

Terminais: esferas de 0,045 de raio, vermelhas (`cc+`, `#e53935`), cinza-escuras com aro claro (`cc-`, `#263238`) ou azuis (`ca`, `#1e88e5`). Cada terminal tem uma esfera invisível de 0,10 de raio para facilitar o clique.

| Peça | Posição dos terminais, em coordenadas da peça |
|---|---|
| Placa | `pos` em (−0,15; altura / 2 − 0,10; 0,03) e `neg` em (+0,15; altura / 2 − 0,10; 0,03) |
| Bateria | No topo: `pos` na ponta esquerda, `neg` na direita, a 0,07 das bordas |
| Inversor de parede, controlador | Na borda de baixo, da esquerda para a direita, na ordem da tabela de terminais |
| Inversor de piso, estação | Corrente contínua atrás, corrente alternada na frente |
| Aparelho | `plug` no topo, junto à borda de trás |
| Tomada da rede | `tomada` no centro da frente |

## 6. Arrastar do catálogo

1. Apertar o botão sobre um cartão do catálogo começa o arraste.
2. Sobre a cena, um fantasma da peça segue o ponteiro, encaixado na superfície sob ele. Verde em superfície válida, vermelho em inválida.
3. Soltar em superfície válida cria o dispositivo. Soltar em outro lugar cancela.

Proteções são arrastadas para cima de um cabo: o cabo sob o ponteiro acende e, ao soltar, a proteção é instalada nele. Tipos de cabo e acessórios não são arrastados: o cabo é escolhido ao ligar e trocado no painel do cabo; os acessórios entram só no orçamento.

## 7. Selecionar, mover, girar, apagar

- Clique em dispositivo ou cabo seleciona e destaca. Clique no vazio desfaz a seleção.
- Arrastar um dispositivo (mais de 4 px) o move pelas superfícies válidas para ele; os cabos acompanham.
- Teclas: `Delete` ou `Backspace` apaga o selecionado (um dispositivo leva junto os cabos dele); `R` gira 90°; `Esc` cancela o arraste ou desfaz a seleção.
- Enquanto um dispositivo ou cabo está sendo arrastado, a órbita da câmera fica desligada.

## 8. Cabos

**Puxar.** Apertar o botão sobre um terminal começa um cabo. Uma linha elástica segue o ponteiro; os terminais compatíveis acendem. Soltar sobre um terminal compatível cria o cabo. Não se cria cabo de um terminal para ele mesmo nem um segundo cabo entre os mesmos dois terminais.

**Tipo inicial.** Se uma das pontas é de placa ou é `pvPos` ou `pvNeg`: `cabo-solar-6`. Senão, em corrente contínua: `cabo-bat-35`. Em corrente alternada: `cabo-ca-2p5`.

**Comprimento.** `(|dx| + |dy| + |dz|) × 1,1` entre os dois terminais, em coordenadas da casa, com mínimo de 0,3 m e arredondado a 0,1 m. É recalculado sempre que uma ponta se move.

**Desenho.** Tubo sobre uma curva suave pelos pontos: terminal A; A mais 0,12 na direção de saída do terminal; ponto médio rebaixado em `mín(0,6; distância × 0,12)`; B mais 0,12 na saída; terminal B. Raio de 0,012 (solar), 0,022 (bateria) ou 0,015 (CA).

**Cores.** Vermelho se as duas pontas são `cc+`; cinza-escuro (`#37474f`) se as duas são `cc-`; laranja (`#fb8c00`) se liga `cc+` com `cc-`; cinza-claro (`#90a4ae`) em `ca`.

**Proteções no cabo.** Cubos de 0,07 ao longo do cabo, a partir de 25% do comprimento: fusível amarelo, disjuntor branco, DPS verde.

## 9. Sombra para o cálculo (`cena/sombra.ts`)

A cena implementa `AmbientePlacas`:

- `normal(uid)`: a normal da face da placa, em coordenadas do mundo.
- `sombra(uid, direcaoSol)`: grade de 5 × 3 pontos sobre 90% da área da placa, cada um afastado 0,02 da face. Lança um raio de cada ponto na direção do sol contra as malhas com `userData.sombra`. Devolve a fração de pontos tapados.
- `ceuTapado(uid)`: de três pontos da linha central da placa, lança 40 × 40 direções distribuídas com peso de cosseno em torno da normal. Conta só as direções que apontam para cima. Devolve a fração tapada. O valor fica em cache e é refeito quando a placa se move ou a casa muda.

Outras placas e equipamentos não entram como obstáculo nesta versão.

## 10. Estado e ações (`src/estado.ts`)

O coordenador escreve este arquivo. O estado guarda: o projeto, a seleção, o tempo (`msUtc` e a velocidade em minutos simulados por segundo), a queda de luz (ativa e início), o estado da simulação, a última saída do passo, o histórico e o modo de visão.

Ações: adicionar, mover, girar e remover dispositivo; ligar e desligar aparelho; definir o horário de uso de um aparelho; adicionar e remover cabo; trocar o tipo de um cabo; instalar e remover proteção; alterar a casa; alterar clima, prioridade e tensão da rede; selecionar; definir tempo e velocidade; alternar a queda de luz; recarregar a bateria; definir o modo de visão; carregar, exportar e criar projeto; aplicar uma ação do consultor.

Depois de cada mudança no projeto, com espera de 150 ms, o estado recalcula `analisarCircuito`, `estimar`, `analisarConsultor` e `calcularOrcamento` e avisa os painéis.

## 11. Laço de simulação

A cada quadro:

1. Minutos simulados = velocidade × segundos reais do quadro, com o quadro limitado a 0,1 s.
2. O intervalo é dividido em passos de até 5 minutos. Em cada passo: `irradianciaNasPlacas`, depois `passoSimulacao`, com `redeDisponivel` falso durante a queda de luz e `horaLocal` igual à hora simulada, para cada aparelho consumir só no horário dele.
3. A cada 10 minutos simulados entra um ponto no histórico (hora, carga da bateria, geração, consumo), guardando as últimas 48 horas.
4. Com a simulação pausada, calcula-se um passo de duração zero, só para os mostradores.

Velocidades: pausa, 1, 10 e 60 minutos por segundo. O botão "Queda de luz" liga e desliga a rede; quando a bateria esvazia, a tela mostra o horário em que apagou. O botão "Bateria cheia" volta a carga para 100%.

## 12. Painéis

- **Catálogo.** Abas Placas, Baterias, Inversores, Controladores, Proteções, Aparelhos e Instalação. Filtro por linha. Cada cartão mostra nome, detalhe, preço, a faixa quando há `precoMax`, a marca "valor típico" quando o preço é típico, o link "ver anúncio" e um aviso quando há `obs` ou `naoRecomendado`.
- **Consultor.** Lista de sugestões, com cor por nível: erro `#c62828`, alerta `#ef6c00`, dica `#1565c0`. Clicar em uma sugestão destaca os alvos na cena. O botão da ação a executa. Sem sugestões, mostra "Nada a corrigir" em verde.
- **Orçamento.** Linhas por grupo, total, quanto do total é valor típico e a data dos preços. Cada linha com `url` tem o link do anúncio.
- **Sistema.** Geração agora, consumo, carga da bateria, autonomia, tensão das placas e de onde vem a energia. Estimativas do dia. Gráfico da bateria ao longo do tempo.
- **Item selecionado.** Nome, dados e preço. Dispositivo: girar e apagar; aparelho: ligar e desligar, e o horário de uso, com início e fim de hora em hora e os atalhos "o dia inteiro" e "voltar ao típico". Cabo: tipo (lista dos cabos do mesmo uso), comprimento, proteções instaladas, corrente de projeto e queda de tensão.
- **Barra de tempo.** Data, hora (0 a 24 h), velocidade, botão "Queda de luz", clima, rotação da casa (0 a 359°, com as letras N, L, S, O) e o botão "Casa", que abre o formulário de `CasaConfig`.
- **Mostradores.** Sol (W), consumo (W), bateria (% e barra) e rede (ligada ou em queda).

Limites do formulário da casa (mínimo, máximo, passo). Valor digitado fora da faixa é cortado para o limite mais próximo.

| Campo | Mín | Máx | Passo |
|---|---|---|---|
| Largura e profundidade da casa (m) | 4 | 20 | 0,5 |
| Andares | 1 | 2 | lista |
| Pé-direito (m) | 2,2 | 4 | 0,1 |
| Inclinação do telhado e da varanda (%) | 10 | 100 | 1 |
| Beiral (m) | 0 | 1,5 | 0,1 |
| Varanda, profundidade (m) | 1 | 6 | 0,5 |
| Quartinho, posição x e z (m) | −15 | 15 | 0,5 |
| Quartinho, largura e profundidade (m) | 1 | 6 | 0,1 |
| Quartinho, altura (m) | 2 | 3,5 | 0,1 |
| Quartinho, giro (°) | −180 | 180 | 5 |

## 13. Salvar e cenário inicial

- O projeto é salvo em `localStorage['offgrid.projeto.v1']`, 500 ms depois de cada mudança.
- Ao abrir: carrega o projeto salvo; se não houver, carrega o cenário "plano no papel".
- Exportar baixa o projeto em JSON; Importar lê um arquivo desses.

`cenarioPlanoNoPapel()` vem do núcleo sem posições. A cena coloca as peças:

| Peça | Onde |
|---|---|
| Placa | Centro do `telhado-varanda` |
| Inversor | `parede-quartinho-fundo`, do lado de dentro, centralizado, a 1,3 m do chão |
| Tomada da rede | Mesma parede, 0,6 m à direita do inversor, a 1,2 m do chão |
| Bateria | `piso-quartinho`, abaixo do inversor, encostada na parede |
| Geladeira, TV, ventilador | `piso-terreo`, em (−0,35 L; −0,35 P), (0,25 L; 0,30 P) e (0,05 L; 0,20 P) |
| Modem, PC 24 h, PC de trabalho | `piso-superior`, em (−0,30 L; −0,30 P), (−0,10 L; −0,30 P) e (0,25 L; −0,25 P) |

`L` é a largura e `P` a profundidade da casa. Com 1 andar, tudo vai para o `piso-terreo`. Depois de posicionar, os comprimentos dos cabos são recalculados.

## 14. Verificação visual (`scripts/verificar.mjs`)

Usa `playwright-core` com o Chrome já instalado (`channel: 'chrome'`, ou `'msedge'` se não houver), sem interface gráfica, com `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Não baixa navegador.

- Sobe `vite preview` em uma porta livre, abre a página em 1440 × 900 e espera `window.__offgrid.pronto === true`.
- Qualquer erro de console ou de página faz o roteiro falhar com código de saída 1.
- As capturas vão para `verificacao/`, que não entra no git.

Para o roteiro conduzir o simulador com o ponteiro de verdade, o aplicativo expõe `window.__offgrid`:

| Membro | Para quê |
|---|---|
| `pronto` | Verdadeiro quando a cena terminou de montar |
| `estado()` | O estado atual, para conferência |
| `acoes` | As ações de `estado.ts` |
| `telaDe(uid)` | Posição na tela, em pixels, do centro de um dispositivo |
| `telaDoTerminal(uid, terminal)` | Posição na tela de um terminal |
| `telaDoCartao(itemId)` | Posição na tela do cartão de um item no catálogo |

## 15. Desempenho e estilo

- 60 quadros por segundo com 12 placas e 40 cabos em vídeo integrado. A sombra das placas é recalculada no máximo a cada 100 ms de tempo real.
- Painéis claros, cantos de 8 px, fonte do sistema. Textos curtos, sem jargão que não esteja explicado.
- A cena busca fidelidade visual: materiais, relevo e proporções reais. O limite é manter os 60 quadros por segundo.
