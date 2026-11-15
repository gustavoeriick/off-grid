# Modo tutorial

Fase 7 do plano. Pedido do Gustavo em 15/11/2026: um modo em que só existe o quartinho de ferramentas. Ele põe a placa no telhado do quartinho, depois as peças lá dentro, com a explicação de cada coisa; no fim liga um aparelho e vê quanto tempo a bateria segura.

## 1. Decisões

| Decisão | Motivo |
|---|---|
| Sistema de 12 V da linha simples: `placa-resun-100`, `bat-moura-12mn105`, `inv-aiker-500-12v-110`, `ctl-pwm-30a`, `prot-fusivel-anl-100` | São as peças mais baratas e as do roteiro "Meu primeiro sistema (12 V)" |
| O tutorial é um projeto à parte | Entrar não apaga a casa montada; sair devolve a casa como estava |
| O fim é um "teste de autonomia", não uma queda de luz | Um quartinho isolado com inversor pequeno não tem rede da rua para cair |
| A placa é posta no telhado no primeiro passo e ligada só no sétimo | Placa gera tensão sempre que há luz: ela entra por último no circuito |
| Não existe passo "ligar o inversor" | O simulador não tem chave de inversor; o sistema ganha vida quando o aparelho é ligado |

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

`ROTEIRO_TUTORIAL` em `src/conteudo/roteiros.ts`, com `id: 'tutorial-quartinho'`. Não entra na lista `ROTEIROS` dos roteiros da casa; `roteiroPorId` o acha. `Passo` ganha `onde?: (projeto, catalogo) => Destaque[]` e `Roteiro` ganha `fim?: 'teste-de-autonomia'`.

Os passos são conferidos pelo estado do projeto, como nos outros roteiros: o passo da vez é o primeiro que ainda não está feito.

| Passo | Peça em destaque no catálogo | Feito quando | Realce na cena |
|---|---|---|---|
| `placa` | `placa-resun-100` | Há placa de até 160 W em `telhado-quartinho` | `telhado-quartinho` |
| `bateria` | `bat-moura-12mn105` | Há bateria de chumbo de 12 V | `piso-quartinho` |
| `inversor` | `inv-aiker-500-12v-110` | Há inversor de 12 V de onda pura | `piso-quartinho` |
| `cabos-da-bateria` | categoria cabo | Par de cabos bateria–inversor (`pos`–`batPos`, `neg`–`batNeg`) | Os quatro terminais; some o par já ligado |
| `fusivel` | `prot-fusivel-anl-100` | Fusível ou disjuntor CC no cabo positivo da bateria ao inversor | O cabo positivo |
| `controlador` | `ctl-pwm-30a` | Há controlador PWM com o par de cabos até a bateria | Sem controlador: `parede-quartinho-fundo`. Com ele: os terminais que faltam ligar |
| `cabos-da-placa` | categoria cabo | `pos` da placa em `pvPos` e `neg` em `pvNeg` do controlador | Os terminais que faltam ligar |
| `aparelho` | `ap-ventilador` | Há aparelho com o plugue em `caSaida` do inversor e ligado | Sem aparelho: `piso-quartinho`. Com ele: o plugue e `caSaida` |
| `sem-erros` | nenhuma | Sem problema de ligação e sem sugestão de nível erro | nenhum |

Os textos de cada passo dizem o que é a peça, por que ela entra nessa ordem e o cuidado de segurança. Não contradizem `src/conteudo/seguranca.ts`.

## 5. Painel

- **Entrada.** O cartão "Por onde começar" ganha o botão "Fazer o tutorial", que é o botão principal. A janela "Passo a passo" mostra o tutorial como primeira opção. Entrar não pede confirmação: a casa fica guardada.
- **Durante o tutorial.** O painel do passo a passo mostra o passo da vez, como nos outros roteiros, com "Sair do tutorial" no lugar de "Sair do passo a passo". A cada redesenho, o painel grava em `estado.destaques` o que `onde` do passo da vez devolve; fora do tutorial e no resumo, a lista fica vazia.
- **Recarregar a página** com o projeto do tutorial aberto continua o tutorial, mesmo em sessão nova do navegador.
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
4. Botões: "Testar de novo", "Sair do tutorial". Um texto curto convida a trocar o aparelho e testar de novo, e avisa que micro-ondas e chuveiro passam do que o inversor de 500 W aguenta. Os textos do resultado são curtos de propósito: o painel não pode cobrir o quartinho. (A geladeira do catálogo cabe no inversor de 500 W.)

O teste é cancelado, com um aviso no painel, se o relógio ou a data saltarem ou se "Bateria cheia" for usada no meio dele: `estado.simulacao.intervencoes` cresce nesses casos, e o teste compara com o valor do começo.

Durante o teste do tutorial, a faixa sobre a cena não usa o texto "sem luz": o resultado aparece só no painel. O mostrador "Rede", sem tomada da rede no projeto, continua dizendo "não ligada".

Se o projeto muda durante o teste de um jeito que desfaz um passo, o teste é cancelado e o painel volta ao passo da vez.

## 6. Verificação

O roteiro `scripts/verificar.mjs` ganha um trecho que, com o mouse:

1. Abre o tutorial pelo cartão de boas-vindas e confere que a casa sumiu e que o projeto da casa ficou guardado.
2. Cumpre os nove passos, conferindo a cada um o passo da vez e que há realce na cena.
3. Roda o teste de autonomia com a lâmpada (passa de 24 horas) e com o ventilador (esvazia), e confere os dois textos.
4. Sai do tutorial e confere que a casa voltou igual.

Capturas: tutorial aberto, um passo com realce de superfície, um com realce de terminal, o resumo e os dois resultados do teste.

## 7. Guarda da casa (achados da revisão)

- Abrir, estando na casa, um arquivo exportado de dentro do tutorial guarda a casa antes, como `entrarNoTutorial`.
- `sairDoTutorial` grava a casa na chave normal antes de apagar a chave de guarda, para a casa não se perder se a página fechar logo depois.
- `entrarNoTutorial` para o relógio.
- Lacuna conhecida do consultor: o cabo positivo da bateria ao controlador de carga não é cobrado de ter fusível próprio. O passo 6 avisa disso em texto.
