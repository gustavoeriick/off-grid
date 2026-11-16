# Modo tutorial

Fase 7 do plano. Pedido do Gustavo em 15/11/2026: um modo em que só existe o quartinho de ferramentas. Ele põe a placa no telhado do quartinho, depois as peças lá dentro, com a explicação de cada coisa; no fim liga um aparelho e vê quanto tempo a bateria segura.

## 1. Decisões

| Decisão | Motivo |
|---|---|
| Sistema de 12 V da linha simples: `placa-resun-100`, `bat-moura-12mn105`, `inv-aiker-500-12v-110`, `ctl-pwm-30a`, `prot-fusivel-anl-100` | São as peças mais baratas e as do roteiro "Meu primeiro sistema (12 V)" |
| O tutorial é um projeto à parte | Entrar não apaga a casa montada; sair devolve a casa como estava |
| O fim é um "teste de autonomia", não uma queda de luz | Um quartinho isolado com inversor pequeno não tem rede da rua para cair |
| A placa é posta no telhado no primeiro passo e ligada só no 12º | Placa gera tensão sempre que há luz: ela entra por último no circuito, depois de a bateria chegar ao controlador (seção 4.1) |
| ~~Não existe passo "ligar o inversor"~~ | ~~O simulador não tem chave de inversor~~. Revogada na fase 8: o inversor tem botão e nasce desligado; o passo 13 é ligá-lo ([operar.md](operar.md), seção 2) |
| Duas partes: montar com tudo desligado, depois ligar uma chave por passo | Pedido do Gustavo na fase 8 ([operar.md](operar.md), seção 9): "não tive que ligar nenhum disjuntor, não liguei o ventilador, não vi os números do carregamento" |
| "Experimente errar" é opcional e vem depois do teste | O erro guiado desfaz passos de propósito; o teste de autonomia precisa do sistema inteiro funcionando |

## 2. Contrato

Em `src/nucleo/tipos.ts`:

```ts
interface CasaConfig {
  // ...
  /** Só o quartinho existe: sem corpo da casa, varandas, paredes internas nem cômodos. Usado pelo tutorial. */
  soQuartinho?: boolean;
}

/** O que a cena deve realçar para guiar o passo da vez. */
type Destaque =
  | { tipo: 'superficie'; id: string }
  | { tipo: 'terminal'; disp: string; terminal: string }
  | { tipo: 'cabo'; uid: string };
```

Com `soQuartinho`, as medidas do corpo da casa continuam no projeto, mas não valem nada: não há superfícies da casa, a casa não faz sombra e os cômodos não existem.

Em `src/nucleo/cenarios.ts`, `cenarioTutorial()`: nome "Tutorial: o quartinho", `casa` igual à `CASA_INICIAL` com `soQuartinho: true`, `varandas`, `paredesInternas` e `comodos` vazios, `quartinho: { x: 0, z: 0, largura: 3, profundidade: 2.5, altura: 2.4, giro: 0 }` e `orientacaoGraus: 180`, sem dispositivos, cabos nem obstáculos. Clima `tipico`, local do Rio, 127 V. O telhado do quartinho cai para os fundos; com a frente virada para o sul, a água do telhado fica virada para o norte, que é o lado do sol no Rio.

Em `src/estado.ts`:

- `estado.destaques: Destaque[]`, ação `definirDestaques(lista)` e evento `'destaques'`. A lista não entra no projeto nem no histórico.
- `emTutorial(): boolean`: `estado.projeto.casa.soQuartinho === true`.
- `acoes.entrarNoTutorial()`: fora do tutorial, grava o projeto atual em `offgrid.projeto.casa` e abre `cenarioTutorial()`. Zera a simulação e o histórico de desfazer. Dentro do tutorial, recomeça o tutorial sem mexer na casa guardada.
- `acoes.sairDoTutorial()`: abre o projeto guardado em `offgrid.projeto.casa` (ou o "plano no papel", se não houver) e apaga a chave. Zera a simulação, o histórico e os destaques.
- `acoes.novoProjeto()` dentro do tutorial recomeça o tutorial.
- O projeto do tutorial é gravado na chave normal, como qualquer projeto: recarregar a página continua o tutorial.

## 3. Cena

Com `soQuartinho`:

- Não se constroem o corpo da casa, o telhado principal, as varandas, as paredes internas, os pisos e os rótulos dos cômodos. Ficam o terreno, o quartinho, a rosa dos ventos e os obstáculos.
- A sombra considera só o quartinho, os obstáculos e as peças.
- "Vista inicial" e a câmera de abertura enquadram o quartinho, de modo que se vejam a porta aberta e o telhado.
- As alças de "Editar casa" que dependem do corpo da casa não aparecem. O quartinho não é arrastável no tutorial.
- Os modos de visão continuam: "Sem telhado" e "Só térreo" abrem o quartinho.

Destaques (`estado.destaques`), redesenhados no evento `'destaques'` e quando o projeto muda:

| Tipo | Realce |
|---|---|
| `superficie` | Contorno e véu verde-claro pulsando sobre a superfície; some enquanto uma peça é arrastada sobre ela, para não brigar com o fantasma |
| `terminal` | Anel pulsando em volta do conector do terminal, visível através das paredes |
| `cabo` | Brilho pulsando ao longo do cabo |

O realce não responde ao ponteiro, não faz sombra e não entra nas capturas de sombra. O pulso tem período de 1,2 s. Destaque que aponta para algo que não existe é ignorado.

## 4. Roteiro

`ROTEIRO_TUTORIAL` em `src/conteudo/roteiros.ts`, com `id: 'tutorial-quartinho'`. Não entra na lista `ROTEIROS` dos roteiros da casa; `roteiroPorId` o acha. `Passo` ganha `onde?: (projeto, catalogo) => Destaque[]` e `Roteiro` ganha `fim?: 'teste-de-autonomia'`. Na fase 8, `Passo` ganha também `parte?: string` (o painel mostra "Parte 1: montar" ou "Parte 2: ligar" ao lado da contagem) e `agora?: (projeto, catalogo, momento) => string | null`, uma frase a mais que depende do relógio (`Momento`: sol no céu, hora local, bateria cheia) ou de peça queimada.

Os passos são conferidos pelo estado do projeto, como nos outros roteiros: o passo da vez é o primeiro que ainda não está feito.

As peças postas pelo usuário nascem desligadas ([operar.md](operar.md), seção 2): o fusível fora do porta-fusível, o disjuntor aberto, o inversor e o aparelho desligados. "Fechada" abaixo é o estado `'fechada'` de todas as proteções de corrente (fusível e disjuntor CC) do cabo.

| # | Passo | Parte | Peça em destaque no catálogo | Feito quando | Realce na cena |
|---|---|---|---|---|---|
| 1 | `placa` | Montar | `placa-resun-100` | Há placa de até 160 W em `telhado-quartinho` | `telhado-quartinho` |
| 2 | `bateria` | Montar | `bat-moura-12mn105` | Há bateria de chumbo de 12 V | `piso-quartinho` |
| 3 | `inversor` | Montar | `inv-aiker-500-12v-110` | Há inversor de 12 V de onda pura | `piso-quartinho` |
| 4 | `cabo-positivo` | Montar | categoria cabo | Cabo do `pos` da bateria ao `batPos` do inversor | Os dois terminais, enquanto falta o cabo |
| 5 | `fusivel` | Montar | `prot-fusivel-anl-100` | Fusível ou disjuntor CC no cabo do `pos` da bateria ao `batPos` do inversor, em qualquer estado (não pede o cabo negativo) | O cabo positivo |
| 6 | `cabo-negativo` | Montar | categoria cabo | Par de cabos bateria–inversor (`pos`–`batPos`, `neg`–`batNeg`) | Os dois terminais do negativo, enquanto falta o cabo |
| 7 | `controlador` | Montar | `ctl-pwm-30a` | Há controlador PWM com o par de cabos até a bateria e fusível ou disjuntor CC no positivo, em qualquer estado | Sem controlador: `parede-quartinho-fundo`. Com ele, na ordem: os terminais do positivo; com o positivo sem proteção, esse cabo; depois, os terminais do negativo |
| 8 | `aparelho` | Montar | `ap-ventilador` | Há aparelho com o plugue em `caSaida` do inversor (ligado ou não) | Sem aparelho: `piso-quartinho`. Com ele: o plugue e `caSaida` |
| 9 | `sem-erros` | Montar | nenhuma | Sem problema de ligação e sem sugestão de nível erro (é o passo 1 da seção 6 de operar.md: conferir antes de fechar) | nenhum |
| 10 | `fechar-fusivel` | Ligar | nenhuma | A proteção do cabo positivo bateria–inversor está fechada | O cabo positivo |
| 11 | `fechar-controlador` | Ligar | nenhuma | A proteção do cabo positivo bateria–controlador está fechada | Esse cabo |
| 12 | `cabos-da-placa` | Ligar | categoria cabo | `pos` da placa em `pvPos` e `neg` em `pvNeg` do controlador | Os terminais que faltam ligar |
| 13 | `ligar-inversor` | Ligar | nenhuma | O inversor está ligado, sem falha e sem estar queimado | O terminal `caSaida` do inversor (ver 4.2) |
| 14 | `ligar-aparelho` | Ligar | nenhuma | Há aparelho na saída do inversor e ligado | O terminal `plug` do aparelho (ver 4.2) |

Ordem dos cabos da bateria (achado da revisão da fase 8): o aviso `bateria-fusivel-no-positivo` manda instalar o fusível antes de ligar o cabo no inversor. Por isso o cabo positivo, o fusível e o cabo negativo são três passos, nessa ordem; o fusível entra fora do porta-fusível, e o circuito só fecha no passo 10. Quem liga os dois cabos antes do fusível não fica preso: o passo 6 já aparece feito e o painel pede o fusível. O passo do controlador segue a mesma ordem dentro dele (cabo positivo, disjuntor, cabo negativo), sem virar três passos.

Frases de `agora`:

| Passo | Quando | Frase |
|---|---|---|
| `fechar-fusivel` | O fusível do cabo está queimado | Desligar o inversor, trocar o fusível pelo painel do cabo e depois pô-lo no lugar |
| `fechar-fusivel` | O inversor está ligado | Desligá-lo antes de pôr o fusível: o fusível só se põe e só se tira sem corrente passando |
| `cabos-da-placa` | Sol abaixo do horizonte | O visor mostra "sem sol" e a corrente de carga aparece quando o sol nascer. O passo não trava |
| `cabos-da-placa` | Bateria cheia (`soc ≥ 0,995`) | O visor mostra "bateria cheia" e a corrente fica em zero até a bateria gastar um pouco |
| `ligar-inversor` | Inversor queimado ou em falha | Consertar, ou desligar algum aparelho e religar |
| `ligar-aparelho` | O relógio está fora do horário de uso do aparelho | Ligado, ele só consome no horário; no teste da bateria funciona o tempo todo |

Os textos de cada passo dizem o que é a peça, por que ela entra nessa ordem e o cuidado de segurança. Não contradizem `src/conteudo/seguranca.ts` nem `src/ui/textosDeOperacao.ts`.

### 4.1 Por que esta ordem

Nenhum passo feito como o texto manda queima nada, em qualquer hora do dia simulado (conferido em `src/conteudo/tutorial.test.ts`, às 0, 6, 7, 9, 12, 15, 17,5, 18 e 21 h):

- O passo 4 liga o cabo positivo da bateria ao inversor sem proteção por um instante, e o passo 7 faz o mesmo com o do controlador; o inversor está desligado, não há cabo negativo e não há placa ligada, então nada da tabela da seção 5 de operar.md vale. Os passos 5 e 7 põem a proteção, que nasce aberta, antes do cabo negativo (passos 6 e 7).
- O passo 8 liga o ventilador desligado num inversor desligado.
- Os passos 10 e 11 fecham as duas proteções da bateria antes de qualquer placa: o controlador passa a ter bateria presente. O passo 10 põe o fusível com o inversor desligado: o fusível só se põe e só se tira sem corrente passando.
- Só então o passo 12 liga a placa. Se a placa entrasse antes do passo 11, de dia, o controlador queimaria (`controlador-sem-bateria`): é o que o teste "a placa ligada antes de pôr o fusível do controlador queima o controlador de dia" confere.
- Os passos 13 e 14 seguem a seção 6 de operar.md: inversor depois da bateria e das placas, aparelhos por último.

O visor do controlador acende no passo 11, e não no 10: no quartinho o controlador tem o próprio cabo até a bateria, com o disjuntor de 80 A, e o fusível do passo 10 fica só no cabo do inversor.

### 4.2 Lacuna: realce de peça

`Destaque` não tem um tipo para a peça inteira. Nos passos 13 e 14, e nos passos de ligar e desligar do "Experimente errar", o realce usa o anel de um terminal da peça (`caSaida` do inversor, `plug` do aparelho) para marcar onde clicar. Um `{ tipo: 'dispositivo'; uid }` seria mais claro; fica para o coordenador decidir (contrato em `src/nucleo/tipos.ts` e desenho em `src/cena/destaques.ts`).

## 5. Painel

- **Entrada.** O cartão "Por onde começar" ganha o botão "Fazer o tutorial", que é o botão principal. A janela "Passo a passo" mostra o tutorial como primeira opção. Entrar não pede confirmação: a casa fica guardada.
- **Durante o tutorial.** O painel do passo a passo mostra o passo da vez, como nos outros roteiros, com "Sair do tutorial" no lugar de "Sair do passo a passo". A cada redesenho, o painel grava em `estado.destaques` o que `onde` do passo da vez devolve; fora do tutorial e no resumo, a lista fica vazia.
- **Recarregar a página** com o projeto do tutorial aberto continua o tutorial, mesmo em sessão nova do navegador.
- **Mostradores.** Fora do tutorial, quando nada é atendido porque a proteção da bateria ou da saída está aberta ou porque o inversor está desligado, a linha "Sem energia nos aparelhos" traz o botão "Ligar o sistema" (`#m-ligar-sistema`), com a mesma ação e a mesma recusa do botão do menu Projeto. No tutorial ele não aparece: lá a pessoa liga cada chave com a mão.
- **Topo.** No tutorial ficam escondidos "Medidas da casa", "Editar casa" e, no menu Projeto, "Novo", "Abrir" e os cenários. Aparece o rótulo "Tutorial" ao lado do nome do simulador.
- **Sair** devolve a casa e fecha o painel.

### Teste de autonomia

Quando todos os passos estão feitos, o painel mostra "Montagem concluída", a autonomia estimada, o orçamento e o botão "Testar a bateria".

O teste, feito com as ações que já existem:

1. Põe os aparelhos ligados na saída do inversor em uso "o dia inteiro" (fora do horário típico eles não consumiriam, e o resultado sairia falso), põe o relógio às 18:00 do dia que está na tela, enche a bateria, começa a contagem sem rede (`alternarQuedaDeLuz`) e acelera para 60 min/s.
2. Termina quando a bateria esvazia ou quando passam 24 horas simuladas. Ao terminar, pausa o tempo e encerra a contagem.
3. Mostra o resultado no painel, com os aparelhos ligados e a soma do consumo médio deles (`mediaW`, o que a simulação gasta):
   - Esvaziou: "A bateria segurou {8 h 42 min}: das 18:00 às {02:42}. O simulador para a conta em {50} %, o limite saudável desta bateria. Na vida real, confira no manual em que tensão o seu inversor desliga." A duração é a diferença dos dois horários, com os minutos cortados.
   - Passou de 24 horas: "A bateria passou de 24 horas. O ponto mais baixo foi {78} %, às {05:50}." e a conclusão pela carga do fim: com 99 % ou mais, "De dia a placa repôs tudo o que foi gasto à noite."; abaixo disso, "Ao fim das 24 horas ela estava em {83} %: a placa não repôs tudo. Mais placa ou menos consumo fecham a conta."
   - Os aparelhos não funcionaram (pedem energia e não recebem, sem a bateria ter esvaziado): "Os aparelhos não funcionaram: {a proteção da bateria cortou, porque os aparelhos pedem mais corrente do que ela pode dar}. Veja o aviso nos mostradores e as sugestões do consultor, troque o aparelho ou a peça e teste de novo."
4. Botões: "Testar de novo", "Experimente errar", "Sair do tutorial". Um texto curto convida a trocar o aparelho e testar de novo, e avisa que micro-ondas e chuveiro passam do que o inversor de 500 W aguenta. Os textos do resultado são curtos de propósito: o painel não pode cobrir o quartinho. (A geladeira do catálogo cabe no inversor de 500 W.)

O teste não liga nem fecha nada: ele só começa com os 14 passos feitos, ou seja, com as proteções fechadas, o inversor e o aparelho ligados pela pessoa. Se algo é desligado ou queima no meio, um passo deixa de estar feito, o teste é cancelado e o painel volta ao passo que diz o que falta (com a frase de `agora`, se for peça queimada ou falha).

O teste é cancelado, com um aviso no painel, se o relógio ou a data saltarem ou se "Bateria cheia" for usada no meio dele: `estado.simulacao.intervencoes` cresce nesses casos, e o teste compara com o valor do começo.

Durante o teste do tutorial, a faixa sobre a cena não usa o texto "sem luz": o resultado aparece só no painel. O mostrador "Rede", sem tomada da rede no projeto, continua dizendo "não ligada".

Se o projeto muda durante o teste de um jeito que desfaz um passo, o teste é cancelado e o painel volta ao passo da vez.

### Experimente errar

Parte opcional, depois do teste ([operar.md](operar.md), seção 9). O botão "Experimente errar" aparece no resultado do teste e, depois do primeiro teste, também no resumo. Conteúdo em `src/conteudo/roteiros.ts` (`EXPERIMENTE_ERRAR` e `ERROS_GUIADOS`); painel em `src/ui/passoAPasso.ts`.

- **Lista.** O que é, que é opcional, e o custo de verdade: "No simulador, o conserto é de graça. De verdade, peça queimada é peça nova, e peça elétrica que queima pode pegar fogo." Um botão curto por erro ("1. Placa sem bateria", "2. Aparelho grande", "3. Bateria invertida"), com ✓ nos já feitos, "Voltar ao teste" e "Sair do tutorial".
- **Antes de cada erro, duas telas curtas** (o painel não pode cobrir o quartinho): a primeira diz "O que vai acontecer" e o custo de verdade, com o botão "Por quê?"; a segunda diz "Por quê" (com a fonte em palavras e, no erro (a), a simplificação) e só ela tem "Começar". Assim ninguém começa sem ter lido as duas. "Começar" só vale com os 14 passos feitos; se falta algo, o painel diz o quê.
- **Passos.** Cada erro tem passos conferidos pelo projeto e pelos eventos de `estado.simulacao.eventos` que surgiram depois do "Começar". Os passos andam em ordem e não voltam: o erro desfaz passos do tutorial de propósito, e o painel segue os passos do erro, não os do tutorial. Cada passo tem realce na cena (`onde`). O último passo de cada erro só fica feito com os 14 passos do tutorial feitos de novo: o sistema volta a funcionar.
- **Fim.** A lição do erro, "Outro erro", "Voltar ao teste" e "Sair do tutorial".
- "Sair do tutorial" está em todas as telas.

| Erro | Passos e "feito quando" | Ajuda do painel |
|---|---|---|
| (a) `placas-antes-da-bateria`: placa ligada sem a bateria | `abrir`: abrir o disjuntor bateria–controlador; feito com o evento `controlador-sem-bateria`. `consertar`: fechar o disjuntor e só depois consertar o controlador; feito com o controlador inteiro e o tutorial em dia | No primeiro passo, sem luz na placa (sol abaixo do horizonte ou `pvDisponivelW` zero), o painel diz que nada queimaria e oferece "Pôr o relógio ao meio-dia" (meio-dia local do dia da tela) |
| (b) `aparelho-grande`: aparelho maior que o inversor | `por-aparelho`: micro-ondas (`ap-microondas`, 1.300 W) com o plugue na saída do inversor de 500 W. `ligar`: feito com o evento `sobrecarga`. `religar`: micro-ondas desligado, inversor religado e tutorial em dia | Fora do horário de uso do micro-ondas (12 às 13 h), ligado ele não pede energia: o painel diz isso e oferece "Usar o micro-ondas o dia inteiro" (`definirUso`, à vista) |
| (c) `bateria-invertida`: bateria ligada ao contrário | `desligar`: aparelhos, inversor e fusível desligados, nessa ordem no texto. `apagar`: nenhum cabo entre a bateria e o BAT+/BAT− do inversor. `cruzar-positivo`: cabo do + da bateria ao BAT−, com fusível (nasce aberto). `cruzar-negativo`: cabo do − da bateria ao BAT+. `fechar`: feito com o evento `bateria-invertida` (inversor e fusível queimam). `desfazer`: sem cabos trocados e com o par certo, fusível no positivo; o texto pede a ordem da montagem (cabo positivo, fusível, cabo negativo) e o realce segue essa ordem. `consertar`: inversor inteiro e tutorial em dia (fusível no lugar com o inversor ainda desligado, depois inversor e aparelho ligados) | O passo `desligar` explica por que aqui o controlador e a placa ficam como estão: no quartinho o controlador tem cabo e disjuntor próprios até a bateria, e tirar o fusível do inversor não o deixa sem bateria; se ele passasse pelo mesmo fusível, a placa teria de sair antes |

O simulador não tem ação de trocar a ponta de um cabo; "trocar os dois cabos de lugar" é apagar e puxar de novo.

## 6. Verificação

O roteiro `scripts/verificar.mjs` tem um trecho que, com o mouse:

1. Abre o tutorial pelo cartão de boas-vindas e confere que a casa sumiu e que o projeto da casa ficou guardado.
2. Cumpre os 14 passos, conferindo a cada um o passo da vez e o realce na cena. Os cabos da bateria entram na ordem cabo positivo, proteção, cabo negativo, no inversor e no controlador. O fusível e o disjuntor nascem abertos; o ventilador nasce desligado. No passo 10 os mostradores dizem por que não há energia, sem o botão "Ligar o sistema". O fusível e o disjuntor são fechados com um clique na proteção desenhada na cena (`telaDaProtecao`); o visor do controlador está apagado antes do disjuntor e diz "sem placas ligadas" depois (`textoDoVisor`); com a placa, mostra a tensão e a corrente de carga. O inversor e o ventilador ligam pelo botão ⏻ na cena (`telaDoBotao`), e o visor do inversor acende. Nada queima.
3. Roda o teste de autonomia com o ventilador (esvazia) e com a lâmpada (passa de 24 horas), e confere os dois textos.
4. "Experimente errar": os três erros. (a) Ao meio-dia (o painel oferece o meio-dia se for noite), o visor do controlador mostra a corrente de carga; abrir o disjuntor com um clique na cena queima o controlador (evento, selo na cena, cartão); fechar e consertar pelo painel do controlador. (b) Micro-ondas na saída, ligado pelo ⏻: falha de sobrecarga no visor do inversor; desligar pelo ⏻ e "Religar o inversor". (c) Desligar pelos ⏻ e pelo clique no fusível, apagar os cabos, ligá-los trocados com o fusível, fechar o fusível: inversor e fusível queimados; refazer certo (cabo positivo, fusível, cabo negativo), consertar, fechar o fusível e ligar. Mede que o painel não cobre o quartinho em 1280 × 720 e 1440 × 900.
5. Sai do tutorial e confere que a casa voltou igual.
6. Na casa: "Desligar o sistema" e o botão "Ligar o sistema" da linha dos mostradores religa; desfazer devolve a casa igual.

Capturas: tutorial aberto (83), realce de superfície (84), de terminal (85), o fusível no cabo positivo antes do negativo (85b), o realce do negativo no passo 6 (85c), o disjuntor do controlador antes do cabo negativo dele (85d), o passo 10 com o fusível aberto (86a), o visor do controlador aceso (86b), o resumo (86), o teste rodando (87), os dois resultados (88, 89), o painel nas duas resoluções (90), a lista de erros (90a; 90b nas duas resoluções), o erro (a) antes de começar e o porquê nas duas resoluções (90c, 90d), de noite com a oferta do meio-dia (90e), o visor do controlador carregando (90f), o controlador queimado (90g) e consertado (90h), a sobrecarga (90i), o inversor queimado (90j), o fim do erro (c) (90k), a casa de volta (91) e a casa desligada com o botão (91b).

## 7. Guarda da casa (achados da revisão)

- Abrir, estando na casa, um arquivo exportado de dentro do tutorial guarda a casa antes, como `entrarNoTutorial`.
- `sairDoTutorial` grava a casa na chave normal antes de apagar a chave de guarda, para a casa não se perder se a página fechar logo depois.
- `entrarNoTutorial` para o relógio.
- Lacuna conhecida do consultor: o cabo positivo da bateria ao controlador de carga não é cobrado de ter fusível próprio. O passo 7 avisa disso em texto.

## 8. Roteiros da casa

Os dois roteiros da janela "Passo a passo" que montam na casa, `ROTEIRO_12V` (`primeiro-sistema-12v`, "Meu primeiro sistema (12 V)") e `ROTEIRO_24V` (`plano-da-casa-24v`, "O plano da casa (24 V)"), em `src/conteudo/roteiros.ts`. Eram da fase 4 (tarefa 4.1) e foram postos em acordo com a fase 8 em 16/11/2026, a pedido do Gustavo ("Sobre o passo a passo, corrige"): o de 12 V mandava ligar os dois cabos da bateria e só depois pôr o fusível, contra o aviso `bateria-fusivel-no-positivo`, e ligava a placa ao controlador com as proteções da bateria ainda abertas, o que de dia queima o controlador (`controlador-sem-bateria`). Os dois terminavam com o sistema montado e desligado.

Agora seguem o modelo do tutorial: duas partes, "Montar" com tudo desligado e "Ligar" com uma manobra por passo, na ordem da seção 6 de [operar.md](operar.md); os cabos da bateria na ordem cabo positivo, proteção (nasce aberta), cabo negativo. Os passos comuns com o tutorial vêm das mesmas funções (`passoCaboPositivo`, `passoFusivel`, `passoCaboNegativo`, `passoControlador`, `PASSO_CONFERIR`, `passoFecharFusivel`, `passoFecharControlador`, `passoCabosDaPlaca`, `passoLigarInversor`, `passoLigarAparelho`), com os mesmos "feito quando" das linhas 4 a 7 e 9 a 14 da tabela da seção 4. O realce na cena (`onde`) continua só no tutorial.

Como a casa serve também a quem só quer dimensionar, os passos de ligar que "Ligar o sistema" faz (proteções e inversor) citam o atalho na dica. O passo é conferido pelo estado: tanto faz ligar com a mão ou pelo botão. "Ligar o sistema" não liga o cabo das placas sem disjuntor, não liga a tomada da rede e não liga aparelhos: esses passos são sempre com a mão. Os roteiros da casa continuam com "Pular".

### 8.1 Meu primeiro sistema (12 V)

| # | Passo | Parte | Peça em destaque | Feito quando |
|---|---|---|---|---|
| 1 | `bateria` | Montar | `bat-moura-12mn105` | Há bateria de chumbo de 12 V |
| 2 | `inversor` | Montar | `inv-aiker-500-12v-110` | Há inversor de 12 V de onda pura |
| 3 | `cabo-positivo` | Montar | categoria cabo | Cabo do `pos` da bateria ao `batPos` do inversor |
| 4 | `fusivel` | Montar | `prot-fusivel-anl-100` | Fusível ou disjuntor CC nesse cabo, em qualquer estado |
| 5 | `cabo-negativo` | Montar | categoria cabo | Par de cabos bateria–inversor |
| 6 | `controlador` | Montar | `ctl-pwm-30a` | Controlador PWM com o par de cabos até a bateria e fusível ou disjuntor CC no positivo, em qualquer estado |
| 7 | `placa` | Montar | `placa-resun-100` | Há placa de até 160 W (o texto pede o telhado da varanda; os cabos dela entram no passo 12) |
| 8 | `aparelho` | Montar | `ap-lampada` | Há aparelho com o plugue em `caSaida` do inversor (ligado ou não) |
| 9 | `sem-erros` | Montar | nenhuma | Sem problema de ligação e sem sugestão de nível erro |
| 10 | `fechar-fusivel` | Ligar | nenhuma | A proteção do cabo positivo bateria–inversor está fechada |
| 11 | `fechar-controlador` | Ligar | nenhuma | A proteção do cabo positivo bateria–controlador está fechada |
| 12 | `cabos-da-placa` | Ligar | categoria cabo | `pos` da placa em `pvPos` e `neg` em `pvNeg` do controlador |
| 13 | `ligar-inversor` | Ligar | nenhuma | O inversor está ligado, sem falha e sem estar queimado |
| 14 | `ligar-aparelho` | Ligar | nenhuma | Há aparelho na saída do inversor e ligado |

A placa vai para o telhado depois do controlador, e não no começo como no tutorial, porque na casa a montagem começa pelo quartinho; o que importa é que os cabos dela só entram no passo 12, depois de a bateria chegar ao controlador (passo 11).

### 8.2 O plano da casa (24 V)

Inversor híbrido com a entrada das placas embutida: não há controlador. A ordem de ligar é a de `sequenciaDeEnergizar` e de `acoes.energizar` (bateria, placas, inversor, saída, entrada da rede), com os aparelhos por último.

| # | Passo | Parte | Peça em destaque | Feito quando |
|---|---|---|---|---|
| 1 | `bateria` | Montar | `bat-alfx-24v-100` | Há bateria de lítio de 24 V |
| 2 | `inversor` | Montar | `inv-anenji-3kw-24v-127` | Há inversor de 24 V, de 3.000 W ou mais, com entrada para as placas |
| 3 | `cabo-positivo` | Montar | categoria cabo | Cabo do `pos` da bateria ao `batPos` do inversor |
| 4 | `fusivel` | Montar | `prot-fusivel-anl-150` | Fusível ou disjuntor CC nesse cabo, em qualquer estado |
| 5 | `cabo-negativo` | Montar | categoria cabo | Par de cabos bateria–inversor, os dois `cabo-bat-35` |
| 6 | `placas` | Montar | `placa-renepv-585` | Duas placas de 500 W ou mais, o `neg` de uma no `pos` da outra |
| 7 | `cabo-positivo-das-placas` | Montar | categoria cabo | Cabo do `pos` de uma dessas placas ao `pvPos` do inversor |
| 8 | `protecoes-das-placas` | Montar | `prot-disjuntor-cc-32` | Disjuntor CC e DPS em cabos do circuito das placas que passam por um quadro (o texto pede o quadro primeiro e o cabo positivo), em qualquer estado |
| 9 | `cabo-negativo-das-placas` | Montar | categoria cabo | Fileira completa de duas ou mais dessas placas |
| 10 | `aparelhos-na-saida` | Montar | `prot-disjuntor-ca-16` | Aparelho na saída e disjuntor CA em todo cabo de saída que vai a aparelho, em qualquer estado (aparelho ligado ou não) |
| 11 | `sem-erros` | Montar | nenhuma | Sem problema de ligação e sem sugestão de nível erro |
| 12 | `fechar-fusivel` | Ligar | nenhuma | A proteção do cabo positivo bateria–inversor está fechada |
| 13 | `fechar-placas` | Ligar | nenhuma | Há cabo das placas com fusível ou disjuntor CC, e todos estão fechados |
| 14 | `ligar-inversor` | Ligar | nenhuma | O inversor está ligado, sem falha e sem estar queimado |
| 15 | `fechar-saida` | Ligar | nenhuma | Há cabo de saída até aparelho, e os disjuntores CA deles estão todos fechados |
| 16 | `tomada-da-rede` | Ligar | `rede-tomada` | Cabo da `caEntrada` do inversor à `tomada` da rede |
| 17 | `ligar-aparelhos` | Ligar | nenhuma | Há aparelho na saída, e todos os aparelhos da saída estão ligados |

A tomada da rede passou da montagem para a parte de ligar: ela é uma fonte de 127 V, entra depois da saída (como no "Ligar o sistema", que fecha a entrada da rede por último) e é a primeira a sair ao desligar (`acoes.desenergizar` e o aviso `geral-desligar-antes-de-mexer`). O cabo dela não tem chave: ligar a entrada é puxar o cabo.

O passo 13 diz que, com o inversor ainda desligado, as placas não carregam a bateria, e que isso é **simplificação** (seção 4 de operar.md: alguns híbridos carregam em espera). O passo 14 tem frases de `agora` para a noite ("a corrente de carga das placas aparece no visor quando o sol nascer") e para a bateria cheia, além das do tutorial para inversor queimado ou em falha.

### 8.3 Resumo

Quando todos os passos estão feitos, o resumo é o de antes ("Montagem concluída", autonomia, orçamento, queda de luz). Com passo pulado e não feito, o título passa a "Fim do roteiro"; se algum pulado é da parte de ligar, o resumo avisa que o sistema pode estar desligado e aponta "Ligar o sistema" e os aparelhos.

### 8.4 Testes e verificação

`src/conteudo/roteirosDaCasa.test.ts` faz cada roteiro inteiro pelas ações do estado às 0, 6, 7, 9, 12, 15, 17,5, 18 e 21 h e confere, a cada passo, o passo da vez e que nada queimou; confere que "Ligar o sistema" no lugar das manobras deixa os passos feitos; que quem liga os dois cabos da bateria antes do fusível não fica preso; e que a ordem antiga do roteiro de 12 V (placa ligada ao controlador antes de fechar a proteção da bateria) queima o controlador ao meio-dia. `src/conteudo/roteiros.test.ts` confere os "feito quando" sobre projetos montados à mão.

`scripts/verificar.mjs`, no trecho do "Passo a passo": no roteiro de 12 V, ao meio-dia, a montagem entra com tudo desligado e a parte de ligar é feita com o mouse (o fusível e o disjuntor com um clique na cena, o inversor pelo ⏻, a lâmpada pelo painel do item), conferindo o visor do controlador e que nada queima; no de 24 V, depois do resumo do plano corrigido, "Desligar o sistema" e os aparelhos desligados levam o painel ao passo 12, e a parte de ligar é feita com o mouse (fusível, disjuntor CC das placas, ⏻ do inversor com a tensão das placas no visor, os disjuntores da saída pelo "Ligar o sistema" dos mostradores, os seis aparelhos pelo painel). Capturas 75a, 75b, 75c, 80a, 80b e 80c.
