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
