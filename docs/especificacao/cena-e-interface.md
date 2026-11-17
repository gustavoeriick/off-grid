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
- **Chão.** Plano de 80 × 80 m, gramado (`#7fae6b`) com textura e manchas, e o mesmo verde liso até o horizonte. Calçada de 0,8 m em volta da casa, das varandas e do canto entre duas varandas, e caminho até o quartinho. Plano distante da câmera em 2000.
- **Rosa dos ventos.** Anel com marcas, letras N, L, S e O em discos a 12 m do centro e uma seta para o norte. Fica presa ao mundo: não gira com a casa.
- **Luz.** Uma luz direcional (o sol), com sombra, e uma luz de hemisfério para o ambiente.

## 3. Casa

A casa é um grupo da cena. A rotação dele em Y é `π − orientacao`, em radianos, de modo que a frente (+Z local) aponte para o azimute `orientacaoGraus`. Equipamentos e cabos são filhos desse grupo.

Valores iniciais de `CasaConfig`: largura 8; profundidade 7; 2 andares; pé-direito 2,8; inclinação do telhado 35%; beiral 0,5; varanda na frente, com 3 m de profundidade e inclinação de 30%; quartinho em x = 6,5 e z = −2,0, com 2,4 × 2,0 m e 2,3 m de altura; orientação 0 (frente para o norte).

Geometria, em coordenadas da casa:

- **Paredes.** Espessura de 0,15. Em cada andar, quatro paredes formando a caixa, com o lado de fora no limite da planta.
- **Pisos.** Laje do térreo de y = 0 a 0,05 (`piso-terreo`). Com 2 andares, laje superior de y = pé-direito − 0,12 a pé-direito (`piso-superior`).
- **Telhado principal.** Duas águas, com a cumeeira paralela à frente. Com `hTopo = andares × peDireito` e `s = inclinacao / 100`: a cumeeira fica em z = 0 e y = `hTopo + (profundidade / 2) × s`; cada água desce até z = ±(profundidade / 2 + beiral) e y = `hTopo − beiral × s`, e vai de x = −(largura / 2 + beiral) a +(largura / 2 + beiral). O plano descrito é o da crista das telhas, e é nele que fica a malha de encaixe. A pilha de telha, ripa e caibro ocupa 0,19 m abaixo dele, medidos na normal. Superfícies `telhado-frente` e `telhado-fundos`. Em casa térrea, o telhado principal perde o beiral só no trecho de cada varanda, até a junta de telhas mais próxima (varanda a menos de 0,3 m do canto leva junto o beiral do canto), para as duas pilhas não se atravessarem; na frente e nos fundos, um rufo de argamassa fecha o encontro das duas águas.
- **Oitões.** Triângulos que fecham as laterais entre `hTopo` e o telhado.
- **Varandas.** De zero a quatro, no máximo uma por lado (`casa.varandas`; detalhes em [fase-2.md](fase-2.md), seção 1.1). Cada uma fica encostada na fachada do seu lado, na largura inteira ou em um trecho (`largura` e `deslocamento`, cortados para caber). O `deslocamento` positivo vai para a direita de quem olha a fachada de fora: +X na frente, −X nos fundos, −Z na direita, +Z na esquerda. No desenho, a inclinação é limitada a `(yParede − 2,0) / profundidade`, e viga e pilares só aparecem com pelo menos 0,3 m livres acima do piso. O telhado encontra a parede em y = `peDireito + 0,25` com 2 andares, ou `peDireito − 0,10` com 1 andar, e desce para fora com a inclinação da varanda. Superfície `telhado-varanda-{lado}`. Pilares de 0,12 × 0,12 na borda de fora, nas duas pontas e mais um no meio de cada vão maior que 5 m. Piso `piso-varanda-{lado}`. A porta de entrada fica na frente, no vão mais próximo do centro da varanda da frente, ou no vão do meio sem ela.
- **Canto entre duas varandas** (pedido do Gustavo em 17/11/2026). Quando dois lados vizinhos têm varanda e a ponta de cada uma encosta na quina da casa que elas dividem (a menos de 0,02 m dela; a varanda de fachada inteira sempre encosta), as duas se juntam: o retângulo que vai da quina da casa até a profundidade de cada uma é preenchido. O canto não é gravado no projeto: é derivado das duas varandas por `cantosDasVarandas` (`src/cena/regrasDaCasa.ts`) e se refaz quando uma delas muda.
  - *Sempre:* piso no mesmo nível e material (malha `piso-canto-varanda`), calçada contornando o conjunto, e um pilar só, na quina de fora, no lugar dos dois pilares de ponta. A viga da borda de cada varanda segue até esse pilar, que sobe até a viga mais alta.
  - *Varandas iguais* (mesma profundidade e mesma inclinação de desenho): o telhado fecha em espigão, a aresta diagonal da quina da casa à quina de fora. Cada varanda ganha um triângulo de água com as mesmas fiadas de telha, cortadas no plano vertical do espigão, ripas, caibros e testeira; sobre a aresta vai uma fiada de telhas de cumeeira e, debaixo dela, uma peça de madeira da quina da casa ao pilar.
  - *Varandas diferentes:* o canto fica só com piso, pilar e as duas vigas, sem telhado.
  - O canto é desenho e sombra, não superfície de encaixe: as placas continuam só em `telhado-varanda-{lado}` e as peças de piso só em `piso-varanda-{lado}`. Os triângulos de água têm laje só de sombra (`userData.sombra` e `userData.soSombra`), como as outras águas, e o piso, o pilar e a madeira do espigão são malhas sólidas. O chão do canto conta como ocupado: peça no terreno, obstáculo e quartinho não entram nele.
- **Quartinho.** Piso (`piso-quartinho`), parede dos fundos (`parede-quartinho-fundo`) e duas laterais, com 0,10 de espessura. A frente é aberta e, com giro 0, fica voltada para +Z. Telhado de uma água, com 15% de inclinação caindo para os fundos e beiral de 0,2 (`telhado-quartinho`).

Detalhes da casa fiel (tarefa 1.15):

- **Telhas.** Capas e canais de telha colonial em malhas instanciadas, cumeeira com telhas próprias, ripas, caibros e testeira à vista sob o beiral e sob a varanda, rufo onde a varanda encosta na parede. O relevo é só desenho: não é superfície de encaixe e não entra na sombra.
- **Encaixe e sombra do telhado.** Cada água tem uma malha plana invisível com `userData.superficie` (`userData.soEncaixe`) e, logo abaixo, uma laje invisível que tapa o sol (`userData.sombra` e `userData.soSombra`).
- **Paredes.** As do último andar param em `hTopo − 0,19 × √(1 + s²) − 0,02`; o respaldo, os oitões e o forro pertencem ao telhado e somem com ele. Barrado de 0,6 m por fora e rodapé por dentro. A malha da parede, com os vãos recortados, é a superfície de encaixe: não se encaixa equipamento sobre janela ou porta.
- **Portas e janelas.** Vãos distribuídos a cada 2,7 m, mais ou menos. Janelas com caixilho, vidro e peitoril; a porta de entrada fica sob a varanda (na frente, se não houver varanda) e a da cozinha nos fundos, do lado do quartinho. O vidro deixa o sol passar, na tela e no cálculo.
- **Interior.** Cerâmica no térreo, tábuas em cima, forro. Escada na parede da direita, com vão no `piso-superior` e mureta; some em casa térrea ou pequena. As paredes internas vêm de `casa.paredesInternas` (fase-2.md, seção 1.2): 0,10 de espessura, cortadas na face interna da parede externa e interrompidas onde cruzam a escada ou o vão dela. Uma parede interrompida vira duas malhas com o mesmo id `parede-interna-{uid}`. Os nomes de `casa.comodos` ficam escritos no piso, no `ponto`, com letras de cerca de 0,35 m, girando para ficar de pé na tela; aparecem só nos modos "sem telhado" e "só térreo", e não são superfície nem fazem sombra.
- **Quartinho.** As paredes sobem até a face de baixo das ripas, com os caibros embutidos (a dos fundos fica com cerca de 2,22 m). A frente tem ombreiras, verga e porta de duas folhas aberta.

Cores: paredes `#f2efe6`, telha `#b5532d`, piso do térreo `#cfc8b8`, piso superior `#b08d62`, pilares `#e8e2d2`, quartinho `#e6dfcf`.

Marcações nas malhas:

- `userData.superficie = { id, tipo }`, com `tipo` em `telhado`, `parede` ou `piso`, em toda malha que aceita equipamento.
- `userData.sombra = true` em toda malha sólida da casa, da varanda e do quartinho. Essas malhas tapam o sol no cálculo mesmo quando o modo de visão as esconde. Telhas, madeiramento, vidros, calçada e caminho não têm essa marca.
- `userData.escondido = true` no que o modo de visão esconde. O escondido vai para a camada 1 (só sombra): a luz ainda o enxerga e projeta a sombra dele, e um `Raycaster` comum, que só vê a camada 0, não o alcança. O raio do cálculo de sombra (seção 9) usa `raycaster.layers.enableAll()`.

Modos de visão:

| Modo | Esconde |
|---|---|
| `completa` | Nada |
| `sem-telhado` | As duas águas, os oitões, o telhado do quartinho (`telhado-quartinho`) e os equipamentos encaixados nesses telhados |
| `terreo` | O mesmo, mais as paredes e o piso do andar superior e os equipamentos encaixados nele |

O telhado da varanda e as paredes do quartinho ficam sempre visíveis. O telhado do quartinho some com o da casa para dar vista e clique no inversor, na bateria e nos quadros lá dentro; escondido, continua projetando sombra na tela e tapando o sol no cálculo. O que está escondido não recebe clique.

## 4. Sol na cena

A cada mudança de tempo, a posição vem de `posicaoSol` e `direcaoSol`.

- A luz direcional fica a 50 m na direção do sol. O mapa de sombra enquadra a casa, o quartinho e a sombra deles no chão (até 16 m), a cada mudança de casa ou de sol: 2048, ou 4096 quando o lado coberto passa de 36 m. Intensidade de 3,5 × a transmissão do ar para a elevação do sol (massa de ar de Kasten e Young), zero abaixo do horizonte. Vale só para o desenho; o cálculo de geração não usa esse número. Com o seno, a sombra da manhã quase sumia no gramado.
- A luz de hemisfério vai de 0,85 azulado à noite, para a casa continuar legível, a 2,2 de dia, para as paredes em sombra continuarem claras (cerca de `#aeb0a1` ao meio-dia).
- O fundo é um domo com gradiente, de `#070c22` e `#141c3d` (noite) a `#3f86d8` no alto e `#b4daf6` no horizonte (dia), conforme a elevação entre −6° e +6°, com clarão do lado do sol, estrelas à noite e neblina no horizonte. A cor do sol e do ambiente esquenta perto do horizonte. Tons de saída `NeutralToneMapping`, exposição 1.
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
3. Soltar em superfície válida cria o dispositivo e o seleciona. Soltar em outro lugar ou apertar `Esc` cancela.
4. Uma dica em texto acompanha o ponteiro e diz o que vai acontecer ao soltar, ou por que o lugar não serve. `R` gira o fantasma. Peça de piso apontada para uma parede vai para o piso ao pé dela, encostada.

Proteções são arrastadas para cima de um cabo: o cabo sob o ponteiro acende e, ao soltar, a proteção é instalada nele. Tipos de cabo e acessórios não são arrastados: o cabo é escolhido ao ligar e trocado no painel do cabo; os acessórios entram só no orçamento.

## 7. Selecionar, mover, girar, apagar

- Clique em dispositivo ou cabo seleciona e destaca. Clique no vazio desfaz a seleção.
- Arrastar um dispositivo (mais de 4 px) o move pelas superfícies válidas para ele; os cabos acompanham.
- Teclas: `Delete` ou `Backspace` apaga o selecionado (um dispositivo leva junto os cabos dele); `R` gira 90°; `Esc` cancela o arraste ou desfaz a seleção.
- Enquanto um dispositivo ou cabo está sendo arrastado, a órbita da câmera fica desligada.
- Fora da puxada de cabo, o terminal responde a até 12 px do ponteiro (no máximo 0,10 m), para peças pequenas poderem ser agarradas; clicar em um terminal sem arrastar seleciona a peça.
- A peça movida fica no último lugar válido; o fantasma vermelho mostra o lugar inválido.
- Quando a casa muda, cada peça é reassentada na superfície dela, à mesma distância do meio (em parede, à mesma altura), cortada para caber. Se a superfície sumiu, vai para a alternativa da colocação inicial. Placa que não cabe mais deita ou muda de água.

## 8. Cabos

**Puxar.** Apertar o botão sobre um terminal começa um cabo. Uma linha elástica segue o ponteiro; os terminais compatíveis acendem. Soltar sobre um terminal compatível cria o cabo. Não se cria cabo de um terminal para ele mesmo nem um segundo cabo entre os mesmos dois terminais.

**Tipo inicial.** Se uma das pontas é de placa ou é `pvPos` ou `pvNeg`: `cabo-solar-6`. Senão, em corrente contínua: `cabo-bat-35`. Em corrente alternada: `cabo-ca-2p5`.

**Comprimento.** `(|dx| + |dy| + |dz|) × 1,1` entre os dois terminais, em coordenadas da casa, com mínimo de 0,3 m e arredondado a 0,1 m. É recalculado sempre que uma ponta se move.

**Desenho.** Tubo sobre uma curva suave pelos pontos: terminal A; A mais 0,12 na direção de saída do terminal; ponto médio rebaixado em `mín(0,6; distância × 0,12)`; B mais 0,12 na saída; terminal B. Raio de 0,006 (solar), 0,011 (bateria) ou 0,007 (CA), com um tubo invisível de 0,03 para o clique.

**Cores.** Vermelho se as duas pontas são `cc+`; cinza-escuro (`#37474f`) se as duas são `cc-`; laranja (`#fb8c00`) se liga `cc+` com `cc-`; cinza-claro (`#90a4ae`) em `ca`.

**Grampo de parede.** `acc-grampo`, acessório de tipo `grampo`, sem preço (não entra no orçamento) por decisão do Gustavo em 15/11/2026: serve para organizar os cabos; preço e mais opções ficam para depois. É um dispositivo como os outros (pode ser movido, apagado e desfeito) e encaixa em qualquer parede, piso ou telhado.

- Cada grampo prende um cabo só. `Cabo.grampos` guarda os `uid` na ordem de `de` para `para`.
- Ao soltar um grampo do catálogo, ele prende o cabo selecionado, se houver um; senão, o cabo desenhado mais próximo do ponto. Sem cabo no projeto, o grampo é recusado com a mensagem "Puxe um cabo antes de pôr o grampo."
- A posição do grampo novo na ordem é a que menos alonga o caminho do cabo.
- O cabo é desenhado em trechos: do terminal ao primeiro grampo, de grampo em grampo, e do último grampo ao outro terminal. Entre grampos da mesma superfície o trecho corre reto e rente a ela; os trechos das pontas mantêm a curva do cabo solto.
- O comprimento passa a ser a soma de `(|dx| + |dy| + |dz|) × 1,1` de cada trecho, com o mesmo mínimo e o mesmo arredondamento.
- Apagar o cabo apaga os grampos dele; apagar um grampo solta o cabo naquele ponto. Quem cuida disso é o estado.

**Arrumar os cabos.** Pedido do Gustavo em 15/11/2026: os cabos soltos e pendurados ficam feios. O botão "Arrumar os cabos", na barra do alto, põe os grampos sozinho; o botão "Soltar os cabos" tira todos. Cada um é um passo só de desfazer (`acoes.definirGramposDosCabos`).

**Placas no telhado e "Arrumar as placas".** Pedidos do Gustavo em 16/11/2026.

- Entre placas valem 2 cm de folga. Sem placa de mesma medida na água, a grade é a fileira centrada que comporta o maior número de placas daquela medida, na largura e na queda; com vizinha de mesma medida, vale a grade dela. Com Shift apertado, a placa anda solta da grade (a borda e a folga continuam valendo).
- Quando a casa da grade passa da borda, o fantasma fica na casa e o aviso é "Não cabe: faltam X cm até a borda do telhado", com X arredondado para cima. Quando caberia mais uma se as outras fossem para o lado, o aviso manda usar "Arrumar as placas" (ou arrastar com Shift).
- "Arrumar as placas" (item do menu "Cabos", para todas as águas com placa) e "Arrumar as placas deste telhado" (no painel da placa selecionada) realinham as placas em fileiras, por medida e giro, mantendo a ordem. É um passo só do desfazer; os cabos acompanham e são remedidos; os grampos não acompanham. Se as fileiras não cabem, nada é mexido naquela água e a mensagem diz o motivo. Mover placa não solta conector: não gera evento de operação.
- As contas puras ficam em `src/cena/gradeDasPlacas.ts`.

- Cada cabo passa a correr rente às superfícies, em trechos retos: desce ou sobe pela parede na vertical, corre na horizontal, e muda de superfície pela quina (parede com piso, parede com parede). Nada de diagonal em parede.
- Cabos que seguem o mesmo trajeto correm lado a lado, com um espaço pequeno entre eles, sem se cruzar à toa; o par positivo e negativo de uma mesma ligação fica junto.
- O cabo não atravessa peça, porta nem janela, e não passa por dentro de parede: para ir de um cômodo a outro ou de dentro para fora, usa a porta ou contorna. Quando não há caminho razoável pelas superfícies (da casa ao quartinho, do telhado ao chão), o cabo fica preso nas duas pontas do vão e cruza o vão em linha reta.
- Os grampos ficam nas mudanças de direção e, em trecho reto longo, a cada 1,5 m no máximo.
- Arrumar de novo depois de mover uma peça refaz o trajeto. Grampo posto à mão em um cabo é trocado pelo trajeto novo.
- O comprimento de cada cabo é remedido pelo trajeto, como com os grampos postos à mão.
- Cabo novo nasce solto; arruma-se depois, com o botão.

**Proteções no cabo.** Cubos de 0,07 ao longo do cabo, a partir de 25% do comprimento: fusível amarelo, disjuntor branco, DPS verde.

## 9. Sombra para o cálculo (`cena/sombra.ts`)

A cena implementa `AmbientePlacas`:

- `normal(uid)`: a normal da face da placa, em coordenadas do mundo.
- `sombra(uid, direcaoSol)`: grade de 5 × 3 pontos sobre 90% da área da placa, cada um afastado 0,02 da face. Lança um raio de cada ponto na direção do sol contra as malhas com `userData.sombra`. Devolve a fração de pontos tapados.
- `ceuTapado(uid)`: de três pontos da linha central da placa, lança 40 × 40 direções distribuídas com peso de cosseno em torno da normal. Conta só as direções que apontam para cima. Devolve a fração tapada. O valor fica em cache e é refeito quando a placa se move ou a casa muda.

Outras placas e equipamentos não entram como obstáculo nesta versão.

Como foi implementado (tarefa 3.1):

- Os triângulos das malhas com `userData.sombra`, inclusive as lajes só de sombra e o que o modo de visão escondeu, vão para uma árvore de caixas envolventes em coordenadas da casa; o raio para no primeiro toque e as duas faces tapam. Girar a casa não refaz a árvore. O resultado é igual ao de um `Raycaster` com todas as camadas e filtro por `userData.sombra`.
- A grade de 5 × 3 pontos cobre 90% de cada lado da placa, centrada.
- A direção do sol é arredondada a 1/4 de grau, e o resultado fica em cache por placa e direção. O cache de uma placa é refeito quando ela se move ou troca de modelo, ou quando as medidas da casa mudam.
- Os três pontos do céu tapado ficam a −45%, 0 e +45% da altura da placa.
- Medido na casa de teste (clima típico, ano): Norte 13,3%, Leste 21,2%, Oeste 21,2%, Sul 29,4%, contra 14%, 23%, 23% e 31% da referência.
- `window.__offgrid.ambiente()` devolve o ambiente, para conferência.

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
| `posicionarCamera(posicao, alvo)` | Põe a câmera em uma vista fixa, para as capturas |
| `superficies()` | Ids das superfícies de encaixe à vista no modo de visão atual |
| `medirQuadros(n, comSombra)` | Tempo médio de quadro, para conferir o desempenho |

## 15. Desempenho e estilo

- 60 quadros por segundo com 12 placas e 40 cabos em vídeo integrado. A sombra das placas é recalculada no máximo a cada 100 ms de tempo real.
- O mapa de sombra só é refeito quando algo muda (`pedirQuadro()`); mover a câmera não o refaz. Quem mexe em equipamento ou cabo chama `pedirQuadro()`.
- Modo econômico: se os quadros em movimento saem a menos de 25 por segundo, a cena desenha com metade da nitidez e refaz a sombra a cada 200 ms; ao parar, sai um quadro nítido.
- Painéis claros, cantos de 8 px, fonte do sistema. Textos curtos, sem jargão que não esteja explicado.
- A cena busca fidelidade visual: materiais, relevo e proporções reais. O limite é manter os 60 quadros por segundo.
