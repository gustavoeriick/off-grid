# Modo tutorial

Fase 7 do plano. Pedido do Gustavo em 15/11/2026: um modo em que só existe o quartinho de ferramentas. Ele põe a placa no telhado do quartinho, depois as peças lá dentro, com a explicação de cada coisa; no fim liga um aparelho e vê quanto tempo a bateria segura.

## 1. Decisões

| Decisão | Motivo |
|---|---|
| Sistema de 12 V da linha simples: `placa-resun-100`, `bat-moura-12mn105`, `inv-aiker-500-12v-110`, `ctl-pwm-30a`, `prot-fusivel-anl-100` | São as peças mais baratas e as do roteiro "Meu primeiro sistema (12 V)" |
| O tutorial é um projeto à parte | Entrar não apaga a casa montada; sair devolve a casa como estava |
| O fim é um "teste de autonomia", não uma queda de luz | Um quartinho isolado com inversor pequeno não tem rede da rua para cair |
| A placa é posta no telhado no primeiro passo e ligada só no 11º | Placa gera tensão sempre que há luz: ela entra por último no circuito, depois de a bateria chegar ao controlador (seção 4.1) |
| ~~Não existe passo "ligar o inversor"~~ | ~~O simulador não tem chave de inversor~~. Revogada na fase 8: o inversor tem botão e nasce desligado; o passo 12 é ligá-lo ([operar.md](operar.md), seção 2) |
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
| 4 | `cabos-da-bateria` | Montar | categoria cabo | Par de cabos bateria–inversor (`pos`–`batPos`, `neg`–`batNeg`) | Os quatro terminais; some o par já ligado |
| 5 | `fusivel` | Montar | `prot-fusivel-anl-100` | Fusível ou disjuntor CC no cabo positivo da bateria ao inversor, em qualquer estado | O cabo positivo |
| 6 | `controlador` | Montar | `ctl-pwm-30a` | Há controlador PWM com o par de cabos até a bateria e fusível ou disjuntor CC no positivo, em qualquer estado | Sem controlador: `parede-quartinho-fundo`. Com ele: os terminais que faltam ligar; com os cabos, o cabo positivo |
| 7 | `aparelho` | Montar | `ap-ventilador` | Há aparelho com o plugue em `caSaida` do inversor (ligado ou não) | Sem aparelho: `piso-quartinho`. Com ele: o plugue e `caSaida` |
| 8 | `sem-erros` | Montar | nenhuma | Sem problema de ligação e sem sugestão de nível erro (é o passo 1 da seção 6 de operar.md: conferir antes de fechar) | nenhum |
| 9 | `fechar-fusivel` | Ligar | nenhuma | A proteção do cabo positivo bateria–inversor está fechada | O cabo positivo |
| 10 | `fechar-controlador` | Ligar | nenhuma | A proteção do cabo positivo bateria–controlador está fechada | Esse cabo |
| 11 | `cabos-da-placa` | Ligar | categoria cabo | `pos` da placa em `pvPos` e `neg` em `pvNeg` do controlador | Os terminais que faltam ligar |
| 12 | `ligar-inversor` | Ligar | nenhuma | O inversor está ligado, sem falha e sem estar queimado | O terminal `caSaida` do inversor (ver 4.2) |
| 13 | `ligar-aparelho` | Ligar | nenhuma | Há aparelho na saída do inversor e ligado | O terminal `plug` do aparelho (ver 4.2) |

Frases de `agora`:

| Passo | Quando | Frase |
|---|---|---|
| `fechar-fusivel` | O fusível do cabo está queimado | Trocar o fusível pelo painel do cabo e depois pô-lo no lugar |
| `cabos-da-placa` | Sol abaixo do horizonte | O visor mostra "sem sol" e a corrente de carga aparece quando o sol nascer. O passo não trava |
| `cabos-da-placa` | Bateria cheia (`soc ≥ 0,995`) | O visor mostra "bateria cheia" e a corrente fica em zero até a bateria gastar um pouco |
| `ligar-inversor` | Inversor queimado ou em falha | Consertar, ou desligar algum aparelho e religar |
| `ligar-aparelho` | O relógio está fora do horário de uso do aparelho | Ligado, ele só consome no horário; no teste da bateria funciona o tempo todo |

Os textos de cada passo dizem o que é a peça, por que ela entra nessa ordem e o cuidado de segurança. Não contradizem `src/conteudo/seguranca.ts` nem `src/ui/textosDeOperacao.ts`.

### 4.1 Por que esta ordem

Nenhum passo feito como o texto manda queima nada, em qualquer hora do dia simulado (conferido em `src/conteudo/tutorial.test.ts`, às 0, 6, 7, 9, 12, 15, 17,5, 18 e 21 h):

- Os passos 4 e 6 ligam cabos de bateria sem proteção por um instante; o inversor está desligado e não há placa ligada, então nada da tabela da seção 5 de operar.md vale. Os passos 5 e 6 põem a proteção, que nasce aberta.
- O passo 7 liga o ventilador desligado num inversor desligado.
- Os passos 9 e 10 fecham as duas proteções da bateria antes de qualquer placa: o controlador passa a ter bateria presente.
- Só então o passo 11 liga a placa. Se a placa entrasse antes do passo 10, de dia, o controlador queimaria (`controlador-sem-bateria`): é o que o teste "a placa ligada antes de pôr o fusível do controlador queima o controlador de dia" confere.
- Os passos 12 e 13 seguem a seção 6 de operar.md: inversor depois da bateria e das placas, aparelhos por último.

O visor do controlador acende no passo 10, e não no 9: no quartinho o controlador tem o próprio cabo até a bateria, com o disjuntor de 80 A, e o fusível do passo 9 fica só no cabo do inversor.

### 4.2 Lacuna: realce de peça

`Destaque` não tem um tipo para a peça inteira. Nos passos 12 e 13, e nos passos de ligar e desligar do "Experimente errar", o realce usa o anel de um terminal da peça (`caSaida` do inversor, `plug` do aparelho) para marcar onde clicar. Um `{ tipo: 'dispositivo'; uid }` seria mais claro; fica para o coordenador decidir (contrato em `src/nucleo/tipos.ts` e desenho em `src/cena/destaques.ts`).

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

O teste não liga nem fecha nada: ele só começa com os 13 passos feitos, ou seja, com as proteções fechadas, o inversor e o aparelho ligados pela pessoa. Se algo é desligado ou queima no meio, um passo deixa de estar feito, o teste é cancelado e o painel volta ao passo que diz o que falta (com a frase de `agora`, se for peça queimada ou falha).

O teste é cancelado, com um aviso no painel, se o relógio ou a data saltarem ou se "Bateria cheia" for usada no meio dele: `estado.simulacao.intervencoes` cresce nesses casos, e o teste compara com o valor do começo.

Durante o teste do tutorial, a faixa sobre a cena não usa o texto "sem luz": o resultado aparece só no painel. O mostrador "Rede", sem tomada da rede no projeto, continua dizendo "não ligada".

Se o projeto muda durante o teste de um jeito que desfaz um passo, o teste é cancelado e o painel volta ao passo da vez.

### Experimente errar

Parte opcional, depois do teste ([operar.md](operar.md), seção 9). O botão "Experimente errar" aparece no resultado do teste e, depois do primeiro teste, também no resumo. Conteúdo em `src/conteudo/roteiros.ts` (`EXPERIMENTE_ERRAR` e `ERROS_GUIADOS`); painel em `src/ui/passoAPasso.ts`.

- **Lista.** O que é, que é opcional, e o custo de verdade: "No simulador, o conserto é de graça. De verdade, peça queimada é peça nova, e peça elétrica que queima pode pegar fogo." Um botão curto por erro ("1. Placa sem bateria", "2. Aparelho grande", "3. Bateria invertida"), com ✓ nos já feitos, "Voltar ao teste" e "Sair do tutorial".
- **Antes de cada erro, duas telas curtas** (o painel não pode cobrir o quartinho): a primeira diz "O que vai acontecer" e o custo de verdade, com o botão "Por quê?"; a segunda diz "Por quê" (com a fonte em palavras e, no erro (a), a simplificação) e só ela tem "Começar". Assim ninguém começa sem ter lido as duas. "Começar" só vale com os 13 passos feitos; se falta algo, o painel diz o quê.
- **Passos.** Cada erro tem passos conferidos pelo projeto e pelos eventos de `estado.simulacao.eventos` que surgiram depois do "Começar". Os passos andam em ordem e não voltam: o erro desfaz passos do tutorial de propósito, e o painel segue os passos do erro, não os do tutorial. Cada passo tem realce na cena (`onde`). O último passo de cada erro só fica feito com os 13 passos do tutorial feitos de novo: o sistema volta a funcionar.
- **Fim.** A lição do erro, "Outro erro", "Voltar ao teste" e "Sair do tutorial".
- "Sair do tutorial" está em todas as telas.

| Erro | Passos e "feito quando" | Ajuda do painel |
|---|---|---|
| (a) `placas-antes-da-bateria`: placa ligada sem a bateria | `abrir`: abrir o disjuntor bateria–controlador; feito com o evento `controlador-sem-bateria`. `consertar`: fechar o disjuntor e só depois consertar o controlador; feito com o controlador inteiro e o tutorial em dia | No primeiro passo, sem luz na placa (sol abaixo do horizonte ou `pvDisponivelW` zero), o painel diz que nada queimaria e oferece "Pôr o relógio ao meio-dia" (meio-dia local do dia da tela) |
| (b) `aparelho-grande`: aparelho maior que o inversor | `por-aparelho`: micro-ondas (`ap-microondas`, 1.300 W) com o plugue na saída do inversor de 500 W. `ligar`: feito com o evento `sobrecarga`. `religar`: micro-ondas desligado, inversor religado e tutorial em dia | Fora do horário de uso do micro-ondas (12 às 13 h), ligado ele não pede energia: o painel diz isso e oferece "Usar o micro-ondas o dia inteiro" (`definirUso`, à vista) |
| (c) `bateria-invertida`: bateria ligada ao contrário | `desligar`: aparelhos, inversor e fusível desligados, nessa ordem no texto. `apagar`: nenhum cabo entre a bateria e o BAT+/BAT− do inversor. `cruzar-positivo`: cabo do + da bateria ao BAT−, com fusível (nasce aberto). `cruzar-negativo`: cabo do − da bateria ao BAT+. `fechar`: feito com o evento `bateria-invertida` (inversor e fusível queimam). `desfazer`: sem cabos trocados e com o par certo, fusível no positivo. `consertar`: inversor inteiro e tutorial em dia (fusível no lugar, inversor e aparelho ligados) | — |

O simulador não tem ação de trocar a ponta de um cabo; "trocar os dois cabos de lugar" é apagar e puxar de novo.

## 6. Verificação

O roteiro `scripts/verificar.mjs` tem um trecho que, com o mouse:

1. Abre o tutorial pelo cartão de boas-vindas e confere que a casa sumiu e que o projeto da casa ficou guardado.
2. Cumpre os 13 passos, conferindo a cada um o passo da vez e o realce na cena. O fusível e o disjuntor nascem abertos; o ventilador nasce desligado. No passo 9 os mostradores dizem por que não há energia, sem o botão "Ligar o sistema". O fusível e o disjuntor são fechados com um clique na proteção desenhada na cena (`telaDaProtecao`); o visor do controlador está apagado antes do disjuntor e diz "sem placas ligadas" depois (`textoDoVisor`); com a placa, mostra a tensão e a corrente de carga. O inversor e o ventilador ligam pelo botão ⏻ na cena (`telaDoBotao`), e o visor do inversor acende. Nada queima.
3. Roda o teste de autonomia com o ventilador (esvazia) e com a lâmpada (passa de 24 horas), e confere os dois textos.
4. "Experimente errar": os três erros. (a) Ao meio-dia (o painel oferece o meio-dia se for noite), o visor do controlador mostra a corrente de carga; abrir o disjuntor com um clique na cena queima o controlador (evento, selo na cena, cartão); fechar e consertar pelo painel do controlador. (b) Micro-ondas na saída, ligado pelo ⏻: falha de sobrecarga no visor do inversor; desligar pelo ⏻ e "Religar o inversor". (c) Desligar pelos ⏻ e pelo clique no fusível, apagar os cabos, ligá-los trocados com o fusível, fechar o fusível: inversor e fusível queimados; refazer certo, consertar, fechar o fusível e ligar. Mede que o painel não cobre o quartinho em 1280 × 720 e 1440 × 900.
5. Sai do tutorial e confere que a casa voltou igual.
6. Na casa: "Desligar o sistema" e o botão "Ligar o sistema" da linha dos mostradores religa; desfazer devolve a casa igual.

Capturas: tutorial aberto (83), realce de superfície (84), de terminal (85), o passo 9 com o fusível aberto (86a), o visor do controlador aceso (86b), o resumo (86), o teste rodando (87), os dois resultados (88, 89), o painel nas duas resoluções (90), a lista de erros (90a; 90b nas duas resoluções), o erro (a) antes de começar e o porquê nas duas resoluções (90c, 90d), de noite com a oferta do meio-dia (90e), o visor do controlador carregando (90f), o controlador queimado (90g) e consertado (90h), a sobrecarga (90i), o inversor queimado (90j), o fim do erro (c) (90k), a casa de volta (91) e a casa desligada com o botão (91b).

## 7. Guarda da casa (achados da revisão)

- Abrir, estando na casa, um arquivo exportado de dentro do tutorial guarda a casa antes, como `entrarNoTutorial`.
- `sairDoTutorial` grava a casa na chave normal antes de apagar a chave de guarda, para a casa não se perder se a página fechar logo depois.
- `entrarNoTutorial` para o relógio.
- Lacuna conhecida do consultor: o cabo positivo da bateria ao controlador de carga não é cobrado de ter fusível próprio. O passo 6 avisa disso em texto.
