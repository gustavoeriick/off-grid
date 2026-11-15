# Especificação da fase 2: montagem com clique e arraste

Esta parte detalha o que as seções 5 a 8, 10, 12 e 13 de [cena-e-interface.md](cena-e-interface.md) deixaram em aberto para a fase 2: os modelos fiéis, o quadro de energia, os cômodos, as várias varandas e a edição da casa com o mouse. Onde este arquivo e aquele divergem, vale este.

Estado: aguardando a aprovação do Gustavo. Nenhum código da fase 2 começa antes dela.

## 1. Mudanças de contrato (tarefa 2.0, do coordenador)

O projeto passa para `versao: 2`. Ao abrir um projeto salvo na versão 1, o aplicativo o converte.

### 1.1 Varandas

`CasaConfig.varanda` dá lugar a `CasaConfig.varandas`, uma lista com no máximo uma varanda por lado:

```ts
interface Varanda {
  lado: LadoCasa;
  profundidade: number;
  inclinacaoPct: number;
  /** Largura ao longo da fachada, em metros. Nulo ocupa a fachada inteira. */
  largura: number | null;
  /** Posição do centro da varanda ao longo da fachada, em metros a partir do centro da fachada. Positivo vai para a direita de quem olha a fachada de fora. Ignorado com largura nula. */
  deslocamento: number;
}
```

- Superfícies: `telhado-varanda-{lado}` e `piso-varanda-{lado}`, no lugar de `telhado-varanda` e `piso-varanda`.
- A varanda nunca passa da ponta da fachada: `largura` e `deslocamento` são cortados para caber. Assim duas varandas em lados vizinhos não se cruzam no canto.
- Pilares nas duas pontas e, a cada vão maior que 5 m, mais um no meio.
- **Altura mínima da beira.** A beira do telhado da varanda fica em `yParede − profundidade × inclinação`. O formulário e o arraste não deixam esse valor ficar abaixo de 2,0 m: ao aumentar a profundidade, a inclinação máxima aceita diminui, e o contrário. Resolve a pendência da fase 1 em que o telhado entrava no chão.
- Conversão da versão 1: `varanda` não nula vira a lista de um item, com `largura: null` e `deslocamento: 0`; nula vira lista vazia. Dispositivos em `telhado-varanda` ou `piso-varanda` passam para a superfície do lado correspondente.

### 1.2 Cômodos

```ts
interface ParedeInterna {
  uid: string;
  andar: 0 | 1;
  /** Pontas da parede no plano do piso, em coordenadas da casa. A parede é sempre paralela a X ou a Z. */
  de: [x: number, z: number];
  para: [x: number, z: number];
  /** Passagens sem folha de porta: distância do centro da passagem até a ponta `de`, em metros. Cada passagem tem 0,8 m de largura e 2,1 m de altura. */
  passagens: number[];
}

interface Comodo {
  uid: string;
  andar: 0 | 1;
  nome: string;
  /** Um ponto dentro do cômodo. O cômodo é a área fechada, por paredes, que contém este ponto. */
  ponto: [x: number, z: number];
}
```

`CasaConfig` ganha `paredesInternas: ParedeInterna[]` e `comodos: Comodo[]`.

- Medidas presas a uma grade de 0,1 m. Parede interna com 0,10 de espessura, do piso ao teto do andar. Comprimento mínimo de 0,5 m.
- Cada parede interna é superfície de parede, nas duas faces, com id `parede-interna-{uid}`. Os vãos das passagens não aceitam encaixe.
- **Área de um cômodo.** Em uma grade de 0,1 m sobre a planta do andar, partindo do `ponto`, a área se espalha pelas células vizinhas sem atravessar parede externa nem parede interna. As passagens contam como parede fechada para essa conta: a porta não junta dois cômodos. O vão da escada pertence ao cômodo que o contém.
- **Cômodo de um dispositivo.** `comodoDe(casa, dispositivo)`, função nova do núcleo (`src/nucleo/comodos.ts`), devolve o cômodo cuja área contém a posição do dispositivo no andar da superfície dele, ou nulo. Dois nomes prontos sem cadastro: "Varanda" para as superfícies de varanda e "Quartinho" para as do quartinho. Peça no telhado não tem cômodo.
- Área sem `ponto` de nenhum cômodo aparece como "Sem nome".
- Casa inicial: as três paredes internas fixas da fase 1 viram `paredesInternas`, com as mesmas posições e passagens, e os cômodos recebem os nomes Sala e Cozinha no térreo e Quarto 1, Quarto 2 e Corredor em cima. Com 1 andar, as paredes e os cômodos do andar 1 são ignorados.
- Mudar a largura ou a profundidade da casa corta as paredes internas que passarem do novo limite e remove as que ficarem com menos de 0,5 m.
- O cálculo elétrico não usa cômodos. Eles entram em: o painel do item selecionado ("Cômodo: Cozinha"), a descrição das linhas de aparelho no painel Sistema e os textos do consultor que citam um aparelho ("{Geladeira} (Cozinha)").

### 1.3 Quadro de energia

- O item `acc-quadro-8` (quadro de sobrepor para 8 disjuntores, R$ 41,70 na pesquisa) passa a ser arrastável para parede. Ele ganha `dimensoes` de 0,20 × 0,25 × 0,09 m e `modulos: 8`. As medidas não constam do anúncio e entram como valor típico, só para o desenho.
- `Cabo` ganha `quadro: string | null`: o `uid` do quadro por onde o cabo passa.
- Ocupação, em módulos de 18 mm de trilho: disjuntor CA 1; disjuntor CC 2; DPS 2; fusível com porta-fusível 2. O fusível ANL da bateria não vai no trilho: tem porta-fusível próprio, desenhado no cabo, a 0,2 m do terminal positivo da bateria.
- **Instalar proteção.** Ao soltar uma proteção de trilho em um cabo: se o cabo já passa por um quadro com módulos livres, ela vai para esse quadro; senão, para o quadro com módulos livres mais próximo do ponto médio do cabo, e o cabo passa a ter esse `quadro`; sem quadro disponível, a proteção fica desenhada no próprio cabo, como na fase 1 da especificação, e o consultor dá a dica `sem-quadro`.
- **Comprimento do cabo com quadro.** A soma dos dois trechos, terminal A ao quadro e quadro ao terminal B, cada um pela fórmula da seção 8 de cena-e-interface.md.
- Regras novas do consultor:

| Regra | Nível | Quando | Título | Texto | Ação |
|---|---|---|---|---|---|
| `sem-quadro` | dica | Há proteção de trilho instalada em cabo sem `quadro` | Ponha as proteções em um quadro | Disjuntor e DPS são feitos para ficar presos em um trilho, dentro de uma caixa fechada. Soltos no cabo, ficam expostos a toque, poeira e umidade. Arraste um quadro para a parede do quartinho. | Ver instalação |
| `quadro-cheio` | alerta | Soma dos módulos das proteções de um quadro maior que `modulos` | O quadro está cheio | Este quadro tem lugar para {8} módulos e as proteções ocupam {10}. Use um segundo quadro. | |

Detalhes da implementação:

- Proteção "de trilho" é disjuntor CA, disjuntor CC e DPS. Os fusíveis do catálogo (ANL e mega) têm porta-fusível próprio e não ocupam módulo.
- `sem-quadro` tem como alvos os cabos com proteção de trilho sem quadro, e a ação abre a aba Instalação do catálogo. `quadro-cheio` gera uma sugestão por quadro.
- Um quadro posto na cena entra no orçamento, no grupo instalação, uma unidade por quadro.

Efeito nos cenários de referência:

- **Plano no papel.** O plano do Gustavo não tem quadro, então ganha a dica `sem-quadro`: 7 sugestões no lugar de 6. O total continua R$ 8.668,19.
- **Plano corrigido.** As proteções somam 10 módulos (disjuntor CC e DPS das placas, 4; seis disjuntores de 16 A da saída, 6), mais que os 8 de um quadro. O cenário ganha dois quadros: um para as placas e um para a saída. As 3 sugestões continuam as mesmas e o total passa a R$ 9.797,62 (R$ 9.714,22 mais 2 × R$ 41,70).

Paredes internas da casa inicial: nos dados elas vão até o limite da planta, para a área dos cômodos fechar; no desenho, a parede para na face interna da parede externa e é interrompida onde cruza a escada.

### 1.4 Ação de proteger cabos

`Acao` do tipo `proteger-cabos` troca `cabos` e `protecaoId` por `itens: { cabo: string; protecaoId: string }[]`. Com isso `sem-disjuntor-na-saida` escolhe um disjuntor para cada cabo, como a seção 6 do consultor já pedia.

## 2. Modelos dos equipamentos (tarefa 2.1)

Todos procedurais, com as medidas de `dimensoes` do catálogo. Cada modelo é um grupo com `userData.dispositivo = uid` e uma caixa invisível do tamanho de `dimensoes` para o clique. Rótulo com o nome curto aparece ao passar o ponteiro.

| Peça | Modelo |
|---|---|
| Placa | Moldura de alumínio anodizado de 35 mm; vidro escuro com leve reflexo; células em grade (meia-célula: 2 blocos de 6 colunas, com as linhas finas dos barramentos); fundo branco entre células; atrás, a caixa de junção com dois cabos curtos terminando em conectores MC4 |
| Inversor híbrido de parede | Gabinete branco ou cinza-claro com frente em dois tons, visor LCD aceso com 3 luzes de estado, botões, aletas de ventilação nas laterais, régua de bornes embaixo com tampa, logotipo genérico (sem marca) |
| Controlador de carga | Caixa menor, dissipador aletado atrás, visor (MPPT) ou três luzes (PWM), bornes embaixo |
| Bateria de lítio | Caixa metálica azul-acinzentada ou preta, alças laterais, dois bornes no topo com capa vermelha e preta, visor pequeno de carga |
| Bateria de chumbo | Caixa preta com tampa colorida, respiros, dois polos de chumbo no topo, etiqueta |
| Inversor de piso | Caixa baixa de alumínio aletado, ventoinha, tomadas na frente, bornes atrás |
| Estação portátil | Caixa com alça, visor, tomadas na frente |
| Tomada da rede | Espelho 4 × 2 com tomada padrão brasileiro |
| Quadro de energia | Caixa branca de sobrepor com tampa transparente fumê aberta, trilho DIN, barramentos; cada proteção instalada aparece no trilho: disjuntor com alavanca, DPS com janela de estado verde, porta-fusível |
| Geladeira | Uma ou duas portas conforme o item, puxadores, pés; frigobar baixo |
| Ventilador | Base, haste, grade e hélice; a hélice gira quando o aparelho está ligado e a simulação corre |
| TV | Tela fina com pé, sobre um rack baixo; a tela acende quando ligada |
| PC | Gabinete, monitor, teclado e mouse sobre uma mesa; o gamer tem lateral de vidro com luz |
| Notebook | Aberto sobre uma mesa |
| Roteador, micro-ondas, lâmpada, chuveiro | Formas próprias reconhecíveis; lâmpada e chuveiro encaixam em parede a 2,1 m |
| Demais | Caixa com rótulo |

Terminais:

- Mantêm os ids e as posições da seção 5 de cena-e-interface.md, agora com forma real: MC4 na placa, borne com parafuso em bateria e inversor, plugue no aparelho.
- Cada terminal tem um anel colorido (vermelho `cc+`, cinza-escuro `cc-`, azul `ca`) e a esfera invisível de 0,10 para o clique. Ao passar o ponteiro, o rótulo (`PV+`, `BAT−`, `Tomada`) aparece.

Limite: no máximo 3.000 triângulos por peça e geometria compartilhada entre peças do mesmo item.

## 2.1 Catálogo por tipo de equipamento (pedido do Gustavo em 14/11/2026)

O painel do catálogo mostra tipos de equipamento, não anúncios. Um cartão por tipo ("Placa solar de 585 W", "Bateria de lítio 24 V 100 Ah", "Inversor híbrido 3.000 W 24 V"), e as marcas e os anúncios do Mercado Livre ficam no detalhe do cartão.

`gruposDoCatalogo(catalogo)`, em `src/catalogo/grupos.ts`, junta os itens em tipos:

| Categoria | Itens do mesmo tipo quando têm iguais |
|---|---|
| Placa | Potência (`wp`), com tolerância de 4% |
| Bateria | Química, tensão e capacidade (`ah`), com tolerância de 4% |
| Inversor | Espécie (híbrido com MPPT, híbrido com PWM, sem entrada solar, estação portátil), onda, tensão de bateria, tensão de saída e potência |
| Controlador | MPPT ou PWM e corrente de carga |
| Proteção | Tipo e corrente |
| Cabo | Uso, seção e cobre ou alucobre |
| Aparelho, tomada, acessório | Cada item é um tipo |

- Tolerância de 4%: com os itens em ordem crescente, um item entra no grupo se o valor dele passa no máximo 4% do primeiro do grupo. Assim 150 W e 155 W são um tipo; 550, 585 e 610 W são três.
- **Modelo de referência** do tipo: o item de menor preço sem `naoRecomendado`; se todos têm a marca, o de menor preço. É ele que é arrastado para a cena e que dá os números do cartão.
- **Cartão:** nome do tipo, montado dos dados (sem marca); as características principais do modelo de referência; "a partir de R$ X" (ou só o preço, com um modelo); "N modelos no mercado"; os avisos do modelo de referência. Aparelhos continuam sem preço.
- **Detalhe**, ao abrir o cartão: a lista dos modelos, cada um com marca e nome, preço, faixa, data da coleta, link "ver anúncio", `obs` e `naoRecomendado`. Escolher um modelo na lista faz dele o que será arrastado.
- **Peça já na cena:** o painel do item selecionado mostra o modelo atual, com o link do anúncio, e uma lista para trocar por outro modelo do mesmo tipo (`acoes.trocarModelo`), sem perder o lugar nem os cabos.
- Os cartões ficam em ordem crescente de potência ou capacidade. O filtro por linha continua valendo: um tipo aparece se algum modelo dele é da linha escolhida.
- A variedade de potências depende da pesquisa. A parte E de `pesquisa/prompt-coleta.md` pede os tamanhos que faltam (placas de 280 a 450 W e 700 W, baterias de 50 e 200 Ah, inversores de 1.500 a 8.000 W, controladores de 10 a 100 A, mais disjuntores e fusíveis). Enquanto ela não é coletada, o catálogo mostra só os tipos que já têm preço: não se inventa equipamento sem anúncio.

## 3. Arraste, seleção e cabos (tarefas 2.2 a 2.4)

Valem as seções 6, 7 e 8 de cena-e-interface.md, com estes acréscimos:

- O raio do arraste mira só as malhas de `superficies()`. Vão de janela, porta ou passagem não aceita encaixe.
- Peça encaixada em superfície que o modo de visão esconde some junto com ela e não recebe clique.
- Duas peças não ocupam o mesmo lugar: o fantasma fica vermelho quando a caixa dele cruza a de outra peça na mesma superfície.
- Placa: presa a uma grade alinhada à água do telhado, com 2 cm de folga entre placas vizinhas, e não passa da borda da água.
- Depois de mover peça, quartinho, parede ou varanda, os comprimentos dos cabos afetados são recalculados.
- Desfazer e refazer: `Ctrl+Z` e `Ctrl+Y`, com as últimas 50 mudanças do projeto.

## 4. Editar a casa com o mouse (tarefas 2.6 e 2.7)

O botão "Editar casa", na barra de cima, liga um modo em que a casa é editada e os equipamentos não respondem ao ponteiro. Fora dele, quartinho, paredes e varandas não se movem, para ninguém arrastar a casa sem querer.

No modo de edição:

- **Quartinho.** Arrastar move o quartinho pelo terreno, preso à grade de 0,5 m. Ele não entra na casa nem nas varandas: a posição inválida fica vermelha e, ao soltar, volta para a última válida. Os equipamentos encaixados nele vão junto.
- **Varandas.** Cada fachada mostra uma alça. Clicar na alça de uma fachada sem varanda cria uma, com 3 m e 30%. Com varanda: arrastar a borda de fora muda a profundidade; arrastar as pontas muda a largura e o deslocamento; o painel mostra a inclinação e o botão de remover. Remover uma varanda com placas pergunta antes e remove as placas e os cabos delas.
- **Paredes internas.** A visão passa para o andar escolhido, visto de cima, sem telhado. Arrastar no piso desenha uma parede, presa à grade e aos eixos. Arrastar uma parede a move; `Delete` a apaga, com os equipamentos encaixados nela, depois de perguntar. Clicar em uma parede selecionada põe ou tira uma passagem no ponto clicado.
- **Cômodos.** Clicar no piso de uma área abre um campo para o nome, com sugestões: Sala, Cozinha, Quarto, Banheiro, Escritório, Área de serviço, Corredor. O nome aparece escrito no piso, visível nos modos "sem telhado" e "só térreo".
- O formulário "Casa" continua valendo e ganha uma linha por varanda.

## 5. Salvar (tarefa 2.5)

Vale a seção 13 de cena-e-interface.md, com a chave `offgrid.projeto.v2`. Um projeto na chave `v1` é convertido e regravado na `v2`; a chave antiga fica intacta. Arquivo importado com `versao` desconhecida é recusado com mensagem.

## 6. Ordem, agentes e critérios de pronto

| Nº | Tarefa | Agente (modelo) | Pronto quando |
|---|---|---|---|
| 2.0 | Contratos: `CasaConfig` com varandas, paredes internas e cômodos; `Cabo.quadro`; `Acao`; conversão da versão 1; `comodoDe`; regras `sem-quadro` e `quadro-cheio`; cenários atualizados | Coordenador (Fable) nos tipos; `nucleo` (Sonnet) no resto | Os 312 testes continuam passando; testes novos para a conversão, para `comodoDe` (peça em cada cômodo da casa inicial, na varanda e no quartinho) e para as duas regras; os dois cenários do plano dão as mesmas sugestões e os mesmos totais |
| 2.7a | Cena com várias varandas e altura mínima da beira; consertos de acabamento pendentes da fase 1 | `cena3d` (Fable) | Capturas com varanda na frente inteira e meia varanda na lateral; nenhum telhado abaixo de 2 m; faixa branca e fresta do quartinho resolvidas |
| 2.1 | Modelos fiéis e quadro de energia | `cena3d` (Fable) | Captura de cada categoria e de cada forma de aparelho; o cenário inicial aparece montado nas posições da seção 13 |
| 2.2 | Catálogo lateral e arraste | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro arrasta placa para o telhado, inversor para a parede e geladeira para o piso; placa não encaixa em parede |
| 2.3 | Selecionar, mover, girar, apagar, desfazer; painel do item | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro move, gira, apaga e desfaz |
| 2.4 | Cabos e proteções no quadro | `cena3d` (Fable) | O roteiro liga placa, inversor, bateria e geladeira; CA não liga em CC; o disjuntor solto no cabo aparece no trilho do quadro |
| 2.6 | Editor de cômodos | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro desenha uma parede, nomeia dois cômodos, solta um aparelho em cada um e confere o nome no painel |
| 2.7b | Editar varandas e quartinho com o mouse | `cena3d` (Fable) e `interface` (Sonnet) | O roteiro cria uma varanda lateral pela alça, muda a profundidade e arrasta o quartinho; o estado confere |
| 2.5 | Salvar, abrir, exportar, importar | `interface` (Sonnet) | Recarregar a página mantém a montagem, os cômodos e as varandas; um projeto da versão 1 abre convertido |

Cada entrega passa pelo `verificador` e, ao fim da fase, pelo `revisor`. Desempenho: 60 quadros por segundo com 12 placas, 40 cabos e 20 aparelhos; medir também em vídeo integrado, se houver máquina para isso.

## 7. O que fica fora da fase 2

- Simulação na tela (bateria descendo, queda de luz) e painéis de consultor e orçamento: fase 3.
- Casas que não são retangulares, mais de dois andares, portas e janelas definidas à mão, duas varandas no mesmo lado.
- Cabo passando por eletroduto com trajeto desenhado: o comprimento continua pela fórmula da seção 8.

## 8. Decisões das fases 3 a 5 tomadas durante a construção

Registradas aqui porque foram decididas pelo coordenador na noite de 14 para 15/11/2026, com autorização do Gustavo para seguir e relatar depois.

- **Laço de simulação (3.2).** Fica em `src/estado.ts`: `acoes.avancarTempo(minutos)` simula em passos de até 5 minutos, avaliados no meio do passo; `definirTempo` salta sem gastar bateria; a queda de luz guarda o instante de início e o instante em que a bateria esvaziou; o histórico guarda um ponto a cada 10 minutos, por 48 horas.
- **Clima real (5.1).** O clima `real` usa medições horárias do Open-Meteo para o dia simulado. Data que já passou há cerca de uma semana usa as medições daquele dia; data futura ou recente usa o mesmo dia e mês do ano mais recente disponível, e a tela mostra de quando são os dados. Na requisição vão só a latitude e a longitude da cidade. Enquanto os dados não chegam, ou se a rede falha, o cálculo usa o clima típico e a tela avisa. Convenção: o carimbo é o fim da hora; a radiação é a média da hora e vale no meio dela; a temperatura é instantânea.
- **Outras cidades (5.1).** Lista das 27 capitais em `src/dados/cidades.ts`. Ao escolher uma, as médias mensais de irradiação e de temperatura vêm da NASA POWER e ficam guardadas no projeto (`localPersonalizado`).
- **Textos de aprender (4.2 e 4.3).** Em `src/conteudo/`: o "Por quê?" de cada regra, o glossário e os avisos de segurança, com teste que exige um "Por quê?" para toda regra do consultor. Revisão de segurança feita pelo Fable.
- **Obstáculos (5.2).** `Projeto.obstaculos`: muro, vizinho e árvore, em coordenadas da casa (giram com ela). Todos tapam o sol no cálculo e na tela; a copa da árvore conta como sólida. Criados e movidos no modo "Editar casa", pela barra "Acrescentar", presos à grade de 0,5 m; não entram na casa, nas varandas nem no quartinho. Medidas iniciais: muro de 6 × 0,15 × 2,2 m, vizinho de 8 × 8 × 6 m a 5 m da lateral, árvore de 6 m com copa de 4 m. Limites: altura de 0,5 a 30 m, medidas de 0,1 a 30 m, posição até ±30 m. Vizinho com mais de 9 m vira prédio de laje. `R` gira 90° e `Delete` remove. O gramado passou a 130 × 130 m.
- **Placa no chão (5.3).** Superfície `terreno` (tipo `piso`, regra por id), que aceita placa e estação portátil. A placa fica sobre suporte inclinado, com `inclinacaoGraus` de 0 a 60 (padrão: a latitude arredondada, 23° no Rio) e direção livre em passos de 15° (padrão: face para o norte; no hemisfério norte, para o sul). A borda de baixo fica a 0,30 m do chão. A normal vem do `quat`, como nas demais peças. Peça no terreno não acompanha a casa, a não ser que algo venha para cima dela. O painel de qualquer placa mostra quanto a sombra tira da geração dela no dia.
- **Estação portátil (5.3).** Conferida de ponta a ponta com placa no chão e aparelho na saída: o núcleo já tratava a bateria interna.

## 9. Meus projetos (pedido do Gustavo em 15/11/2026)

Vários projetos gravados no navegador ("Minha casa", "Casa dos pais"), cada um com a casa, a orientação, a cidade e a montagem dele.

- **Gravação** (`src/biblioteca.ts`): o índice fica em `offgrid.projetos` (`atual` e a lista com `id`, `nome` e `alteradoEm`) e cada projeto em `offgrid.projetos.<id>`. A chave de trabalho `offgrid.projeto.v2` continua igual: é o projeto da tela. Sem `localStorage`, tudo vale só na memória.
- **O projeto da tela sempre tem vaga na lista**, fora do tutorial. O projeto que já estava gravado no navegador vira o primeiro item, com o nome que tinha.
- **Ações do estado:** `listarProjetos`, `criarProjeto(nome, 'vazia' | 'copia')`, `abrirProjeto`, `renomearProjeto`, `duplicarProjeto`, `apagarProjeto`, `importarProjeto`, e o evento `'projetos'`.
- **Trocar de projeto** grava antes o da tela e zera o histórico de desfazer e a simulação.
- **"Casa vazia"** é a casa do cenário inicial só com a tomada da rede.
- **Importar um arquivo** cria um projeto novo na lista, sem tocar no que estava na tela. Nome repetido ganha número: "Casa (2)".
- **Apagar o projeto da tela** abre o alterado mais recentemente; se não sobra nenhum, abre uma casa vazia chamada "Minha casa". Apagar não tem desfazer: o painel pede confirmação.
- **Tutorial:** o projeto do tutorial não entra na lista, e de dentro dele a lista não pode ser mexida.
- **Painel:** no menu Projeto, "Meus projetos" abre a lista (nome, data da última alteração, marca no que está aberto) com Abrir, Renomear, Duplicar, Apagar e "Novo projeto" (nome e a escolha entre casa vazia e cópia do atual). O nome do projeto aberto aparece no alto. "Exportar" e "Importar" continuam.
