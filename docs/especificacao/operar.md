# Operar o sistema

Fase 8 do plano, aprovada pelo Gustavo em 15/11/2026. Pedido dele depois de concluir o tutorial: "Eu não tive que ligar nenhum disjuntor, não liguei o ventilador, não vi os números do carregamento na controladora. Então eu não sei o que poderia acontecer de errado se tentasse ligar o disjuntor fora da hora. Ainda está engessado."

Decisões dele: (1) o erro estraga a peça, que fica marcada como queimada, com a explicação e conserto em um clique; (2) as chaves e os visores valem na casa inteira, em qualquer projeto.

Até aqui o simulador ensinava a montar. Esta fase ensina a operar: cada proteção vira uma chave, o inversor ganha o botão de ligar, as peças mostram números e a manobra errada tem consequência.

## 1. Fontes

Nada nesta fase é número inventado. As consequências são qualitativas (não liga, desarma, queima, abre arco) e vêm de:

| Sigla | Fonte | O que foi lido (16/11/2026) |
|---|---|---|
| AX | Manual do inversor Voltronic Axpert 3KP/5KP 24 V (https://voltronicpower.com/content/download/Manual/Axpert-3KP-5KP-24V_manual.pdf). É o projeto de que derivam os inversores híbridos de 24 V do catálogo | Proteção e seccionador entre bateria e inversor; "antes de fechar o disjuntor CC, confira positivo com positivo"; disjuntor CC entre as placas e o inversor; liga-se pela chave "depois de as baterias estarem bem ligadas"; falha 07 "sobrecarga, tempo esgotado", com religamento automático desligado de fábrica (programa 06); "sem resposta ao ligar: polaridade da bateria invertida"; falha 56 "bateria mal ligada ou fusível queimado"; lista do que o visor mostra |
| EP | Manual do controlador Epever Tracer AN G3, V2.2 (https://www.epever.com/wp-content/uploads/2024/08/Tracer-AN-G3-Manual-EN-V2.2.pdf) | "Ligue na ordem bateria, carga, placas, e desligue na ordem inversa"; "não feche o disjuntor nem ponha o fusível durante a fiação"; ligar: primeiro o fusível da bateria, conferir a luz, depois as placas; placa invertida: "pode não se danificar e volta a funcionar depois de corrigir"; "o controlador se danifica quando a ligação das placas está certa e a da bateria está invertida"; placas em curto fora da carga não danificam |
| VI | Manuais Victron SmartSolar MPPT (https://www.victronenergy.com/media/pg/Manual_SmartSolar_MPPT_100-30__100-50/en/installation.html) | Bateria primeiro, para o controlador reconhecer a tensão do sistema; placa invertida: o controlador esquenta e não carrega |
| PL | `docs/plano-backup-off-grid.md`, do Gustavo | "ligar primeiro a bateria, depois as placas, depois a saída CA" |
| SE | `src/conteudo/seguranca.ts` e `docs/especificacao/consultor.md` | Bateria invertida queima o inversor; soltar conector com corrente abre arco; curto na bateria põe o metal em brasa; disjuntor de corrente alternada não apaga o arco da corrente contínua |

Onde os manuais divergem ou o simulador escolhe o pior caso, a tabela da seção 5 marca **simplificação**, e o texto da tela diz isso.

## 2. Chaves

| Peça | Chave | Estados | Nasce |
|---|---|---|---|
| Fusível (no cabo) | Colocar e tirar o fusível do porta-fusível | fechado, aberto, queimado | aberto (fora do porta-fusível) |
| Disjuntor CC e disjuntor CA (no cabo) | Alavanca | fechado, aberto | aberto |
| DPS | Não tem chave | — | — |
| Inversor | Botão liga e desliga | ligado, desligado, em falha (sobrecarga) | desligado |
| Aparelho | Botão liga e desliga (já existia) | ligado, desligado | desligado |
| Controlador de carga | Não tem chave: liga sozinho quando recebe bateria (EP) | — | — |
| Placa e bateria | Não têm chave | — | — |

"Nasce" vale para peça posta pelo usuário, em qualquer projeto (EP: não fechar disjuntor nem pôr fusível durante a fiação). Os cenários prontos do menu ("Completa", "Plano no papel" e os demais) e os projetos gravados antes desta fase vêm com tudo fechado e ligado: campo ausente vale fechado e ligado. Por isso, projeto antigo com erro de ligação (bateria invertida, curto) abre já com a consequência aplicada, porque campo ausente vale fechado.

Um disjuntor que desarma fica aberto; religar é fechar de novo. Um fusível que queima só volta com "Trocar o fusível".

## 3. Contrato

Em `src/nucleo/tipos.ts`:

```ts
type EstadoProtecao = 'fechada' | 'aberta' | 'queimada';

interface Cabo {
  // ...
  /** Estado de cada proteção de `protecoes`, na mesma ordem. Ausente: todas fechadas. */
  estados?: EstadoProtecao[];
  /** Cabo queimado por curto sem proteção. Queimado, não conduz. */
  queimado?: Dano;
}

interface Dispositivo {
  // ...
  /** Aparelho e inversor: ligado ou desligado. Nas demais peças, sempre verdadeiro. */
  ligado: boolean;
  /** Peça queimada. Queimada, não funciona e os cabos dela não conduzem. */
  queimado?: Dano;
  /** Inversor desligado sozinho por sobrecarga, esperando ser religado. */
  falha?: 'sobrecarga';
}

type CodigoDano =
  | 'controlador-sem-bateria'
  | 'bateria-invertida'
  | 'curto-na-bateria'
  | 'arco-no-conector'
  | 'arco-no-disjuntor-ca';

interface Dano {
  codigo: CodigoDano;
  /** Instante simulado em que aconteceu. */
  msUtc: number;
}

type Acao =
  // ... as ações que já existiam
  /** Conserta a peça, o cabo ou a proteção queimada (seção 5). */
  | { tipo: 'consertar'; rotulo: string; alvo: { tipo: 'dispositivo'; uid: string } | { tipo: 'cabo'; uid: string } | { tipo: 'protecao'; cabo: string; indice: number } }
  /** Fecha as proteções e liga o inversor na ordem certa (seção 6). */
  | { tipo: 'energizar'; rotulo: string };
```

As duas ações novas de `Acao` são as das sugestões `peca-queimada` e `sistema-desligado` do consultor. `acoes.aplicarAcao` as executa com `acoes.consertar` e `acoes.energizar`.

`ligado` do inversor passa a valer. A migração de projeto antigo não muda nada: os campos novos ficam ausentes.

## 4. O que está vivo (`src/nucleo/operacao.ts`)

A análise de projeto (`analisarCircuito`, o consultor, os cabos, o orçamento e as estimativas) continua olhando a montagem inteira, como se tudo estivesse fechado: ela responde "está bem montado?". A operação responde "o que está energizado agora?".

- **Cabo interrompido:** tem alguma proteção `aberta` ou `queimada`, ou está `queimado`, ou uma das pontas é de peça `queimada`.
- `projetoVivo(projeto)`: o projeto sem os cabos interrompidos.
- `analiseViva = analisarCircuito(projetoVivo(projeto), catalogo)`. Os problemas dela não vão ao consultor.
- A simulação (`passoSimulacao`) passa a receber a `analiseViva` e, em `EntradaPasso`, `inversorLigado: boolean` (`ligado`, sem `falha` e sem `queimado`).
- **Inversor desligado, em falha ou queimado:** nenhum aparelho é atendido, a rede não é usada, o consumo do próprio inversor é zero. Se a entrada solar em uso é a do próprio inversor, as placas não carregam (**simplificação:** alguns híbridos carregam em espera). Se é a de um controlador externo, as placas continuam carregando a bateria.
- Sem banco na análise viva (proteção da bateria do inversor aberta): nada é atendido, como hoje no aviso `'sem-bateria'`.
- **Só o controlador com bateria:** quando a análise viva não tem banco no inversor, mas um controlador externo tem bateria presente e fileira viva (a proteção da bateria do inversor aberta e a do controlador fechada), as placas continuam carregando a bateria. `analiseSoDoControlador` monta a análise desse estado: o banco é o que a cadeia de baterias do controlador alcança, a entrada solar e as fileiras são as dele, sem aparelhos e sem rede. `passoDeOperacao` é o passo que o estado chama: fora desse estado é o próprio `passoSimulacao` com a análise viva; nele, é `passoSimulacao` com a análise "só do controlador" e `inversorLigado: false` (nenhum aparelho atendido, consumo do inversor zero). A saída mantém o aviso `'sem-bateria'` e a carga pedida, que continuam valendo para o inversor. As correntes de operação e o `arco-no-conector` valem nesse estado. Com mais de um controlador nessa situação, vale o primeiro (**simplificação**).

Estimativas (geração, consumo, autonomia) continuam sendo de projeto: não mudam com as proteções nem com o botão do inversor. Só o botão do aparelho conta, como já contava.

### Corrente de operação

`correntesDeOperacao(projeto, catalogo, analiseViva, saida, horaLocal, placas)`: o mesmo método de `correntesDeProjeto` (nucleo.md, seção 9), com as injeções do instante:

| Rede | Injeção |
|---|---|
| Placas | A corrente total do lado das placas (`pvW / tensaoCarga` no PWM; `pvW / 0,97 / pvTensao` no MPPT; zero se as placas não estão sendo aproveitadas), repartida entre as fileiras na proporção da corrente que cada uma entrega no instante (a de `estadoFileira`, com a luz de cada placa em `placas`) |
| Banco | Com sinal. Bateria: `−bateriaW / tensaoRef / ramos` (descarregando injeta; carregando absorve). Controlador externo: `+pvW / tensaoCarga` |
| Saída CA | Plugue de cada aparelho atendido: `potenciaW / tensaoRede` (a potência nominal, a mesma da regra de sobrecarga) |
| Entrada CA | `redeW / tensaoRede` |

No barramento do banco, a bateria carregando **recebe** corrente: ela não é fonte. As injeções entram com sinal no método da árvore (sorvedouro no `batPos` e no `batNeg` do inversor) e a corrente de cada cabo é o valor absoluto da soma. Assim o cabo entre a bateria e o inversor leva o que o inversor consome, e o cabo da bateria leva `abs(bateriaW) / tensaoRef`. Somar as duas em valor absoluto contava duas vezes a corrente de carga e desarmava o disjuntor da bateria com um ventilador ligado.

No estado "só o controlador com bateria", o sorvedouro do banco é o `batPos` e o `batNeg` do controlador, e a única injeção é a da bateria.

Sem o parâmetro `placas` (a luz em cada placa), a corrente das placas é dividida em partes iguais entre as fileiras (**simplificação**). O estado sempre passa `placas`.

## 5. Consequências

Conferidas depois de cada ação do usuário e a cada passo do relógio, sobre o estado do momento (não sobre a ordem dos cliques): assim o erro armado à noite acontece quando o sol nasce.

"Com sol" quer dizer que alguma placa da fileira recebe luz (`g > 0`). "Bateria presente" em um aparelho quer dizer que os dois terminais de bateria dele alcançam um ramo completo do banco por cabos não interrompidos.

| Código | Situação | O que acontece | Dano | Fonte |
|---|---|---|---|---|
| `controlador-sem-bateria` | Controlador externo com fileira completa viva, com sol, e sem bateria presente. Vale para ligar as placas antes da bateria e para abrir a proteção da bateria com as placas gerando | O controlador queima | Controlador `queimado` | EP, VI, PL. **Simplificação, pior caso:** os manuais mandam bateria primeiro e placas por último; alguns controladores só leem a tensão errada, outros (o próprio Tracer AN G3) aceitam trabalhar sem bateria |
| `bateria-invertida` no inversor | Os terminais de bateria do inversor alcançam o banco com os polos trocados, por cabos não interrompidos | O inversor queima na hora. Fusível ou disjuntor no caminho também abre, mas não salva o inversor | Inversor `queimado`; primeira proteção de corrente do caminho `queimada` (fusível) ou `aberta` (disjuntor) | SE, AX ("antes de fechar o disjuntor CC, confira a polaridade") |
| `bateria-invertida` no controlador | Idem, nos terminais de bateria do controlador, com fileira viva e com sol | O controlador queima | Controlador `queimado` | EP |
| (sem dano) | Idem, sem sol ou sem placas ligadas | O controlador não liga; corrigindo a ligação, volta | — | EP |
| `curto-na-bateria` | A análise viva acusa `curto-bateria` | Com fusível ou disjuntor CC fechado no laço: a de menor corrente abre (fusível queima, disjuntor desarma). Sem proteção no laço: os cabos do laço queimam | Proteção ou cabos | SE (`bateria-ferramenta-metalica`), AX (itens 8 e 12 de segurança). O texto diz que, de verdade, a bateria também pode se estragar e pegar fogo |
| `curto-na-bateria` | Laço de baterias: baterias em série fechadas sobre si mesmas por cabos não interrompidos. O caso comum é o paralelo com uma invertida (o positivo de uma no negativo da outra, nos dois polos). Não depende do inversor nem de chave dele | O laço são os cabos entre uma bateria e a seguinte. Com fusível ou disjuntor CC fechado no laço: o de menor corrente abre. Sem proteção no laço: os cabos do laço queimam | Proteção ou cabos | SE (`bateria-ferramenta-metalica`): as tensões se somam em um laço sem carga nenhuma |
| (sem dano) | Curto nas placas (`curto-placas` na análise viva) | Não gera; nada queima | — | EP (placas em curto fora da carga não danificam) |
| (sem dano) | Placa invertida (`placa-invertida`) | Não carrega; corrigindo, volta | — | EP, VI. O texto cita que arranjo grande invertido pode danificar (EP: 1,5 vez a potência do controlador) |
| `arco-no-conector` | Apagar um cabo das placas, ou a placa, com corrente passando nele (corrente de operação maior que zero) | Abre arco no conector | Placa da ponta do cabo `queimada` (o conector dela) | SE (`placas-tensao-com-luz`) |
| `arco-no-disjuntor-ca` | Abrir um disjuntor CA instalado em cabo de corrente contínua, com corrente passando | O arco não apaga e o disjuntor queima | Proteção `queimada` | SE (consultor: disjuntor CA não apaga o arco da corrente contínua) |
| `sobrecarga` | A simulação devolve o aviso `'sobrecarga'` | O inversor desliga a saída e fica em falha até ser religado (desligar e ligar) | Nenhum; `falha: 'sobrecarga'` | AX (falha 07; religamento automático desligado de fábrica) |
| `desarme` | Corrente de operação de um cabo maior que a corrente nominal de um disjuntor fechado nele | O disjuntor desarma (`aberta`) | Nenhum | Função do disjuntor. **Simplificação:** desarma na hora; o de verdade tem curva de tempo |
| `fusivel-queimou` | Idem, com fusível | O fusível queima | Proteção `queimada` | Função do fusível. Mesma simplificação |
| (sem dano) | Inversor ligado sem bateria presente | Não liga: visor apagado | — | AX (falha 56; "sem resposta ao ligar") |
| (sem dano) | Abrir a proteção da bateria com o inversor atendendo aparelhos | A saída cai e os aparelhos desligam | — | AX (falha 56) |

Regras:

- **Laço do curto:** o caminho com menos cabos entre o `pos` e o `neg` da bateria, andando só por cabos não interrompidos, sem atravessar peças. No laço de baterias: a união dos caminhos com menos cabos do `neg` de cada bateria ao `pos` da seguinte.
- **Caminho da bateria invertida:** o caminho com menos cabos do terminal do aparelho até o polo da bateria.
- O dano é gravado no projeto no mesmo passo do desfazer da ação que o causou: desfazer a manobra desfaz o dano. Dano que acontece com o relógio (o sol nasceu) é um passo próprio.
- Peça queimada não queima de novo. Cada dano gera um **evento** (`{ codigo, uids, msUtc }`) em `estado.simulacao.eventos`, com os 20 últimos, que a cena e os painéis mostram. Os eventos não entram no projeto.
- **Desfazer e refazer não repetem evento:** quando a peça queima de novo, sem passo novo, logo depois de um desfazer ou refazer (o sol continua lá), não é gravado evento novo se um dos últimos eventos tem o mesmo código e os mesmos `uids`.
- **Sobrecarga dentro de um avanço longo do relógio:** `avancarTempo` anda em subpassos de até 5 minutos. Se qualquer subpasso devolve o aviso `'sobrecarga'`, a falha do inversor é aplicada naquele subpasso (o evento leva o instante dele) e os subpassos seguintes correm com o inversor em falha. As demais consequências são conferidas uma vez por chamada, com a saída do último subpasso.
- **Arco no atalho:** `energizar` e `desenergizar` aplicam `arco-no-disjuntor-ca` a cada manobra de abrir, como o clique na chave. A corrente é a do momento da manobra, com as manobras anteriores da sequência já feitas: na ordem certa, o inversor já saiu quando a proteção da bateria abre.
- **Consertar:** `acoes.consertar(alvo)` tira o `queimado` de uma peça ou de um cabo, ou troca o fusível (`queimada` vira `aberta`). É um passo do desfazer. `acoes.consertarVarios(alvos)` conserta vários alvos (a peça, o cabo e a proteção de um mesmo acidente) em um passo só. O conserto não corrige a causa: se a ligação continua errada, a peça queima de novo quando for energizada, e o painel avisa disso antes.

## 6. Ordem certa

Ligar (PL, EP, AX):

1. Conferir a ligação: sem erro de polaridade nem de curto no consultor (na vida real, com o multímetro).
2. Fechar a proteção da bateria. O controlador acende.
3. Fechar o disjuntor das placas (ou, sem disjuntor, ligar o cabo das placas por último).
4. Ligar o inversor.
5. Fechar o disjuntor da saída.
6. Ligar os aparelhos, um de cada vez.

Desligar: a ordem inversa. As placas saem antes da bateria; a bateria sai por último.

`acoes.energizar()` faz os passos 2 a 5 nessa ordem, um passo do desfazer. Recusa, sem fazer manobra nenhuma, e devolve `{ codigo, uids, texto }`:

- se o passo 1 falha: problema `bateria-invertida`, `placa-invertida`, `curto-bateria` ou `curto-placas` na análise de projeto, ou os polos da bateria trocados nos terminais de bateria de um controlador ou do inversor, olhando a montagem inteira (como se tudo estivesse fechado). O código é o do problema;
- se, feita a etapa da bateria, o controlador das placas continua sem bateria presente e há chave das placas a fechar (a proteção da bateria dele está queimada e, por isso, fica de fora das manobras): fechar a chave das placas queimaria o controlador. Código `controlador-sem-bateria`; o texto diz o que trocar ou consertar primeiro: "O fusível da bateria do controlador de carga está queimado ({nome}). Troque o fusível antes de ligar o sistema: com as placas ligadas e sem bateria, o controlador queima." Para outra proteção queimada: "A proteção da bateria do controlador de carga está queimada ({nome}). Conserte-a antes de ligar o sistema: …". Para cabo queimado: "O cabo entre a bateria e o controlador de carga está queimado. Conserte o cabo antes de ligar o sistema: …".

`acoes.desenergizar()` faz o inverso (`planoDeDesenergizar`), com uma exceção: **controlador com as placas ligadas direto, sem chave nenhuma para abri-las, não fica sem bateria.** Depois da etapa das placas, o controlador que ainda tem fileira viva e bateria presente segura a manobra da bateria que o deixaria sem ela: essa proteção continua fechada. O resto desliga (a saída, o inversor e a proteção da bateria do inversor, quando abri-la não deixa o controlador sem bateria). A regra vale de dia e de noite, porque o sol nasce depois. Nesse caso a ação devolve o aviso `{ codigo: 'placas-sem-chave', uids, texto }`, com o texto "O controlador ficou ligado à bateria: as placas dele não têm disjuntor. Para desligar tudo, solte ou cubra as placas antes."; quando desliga tudo, devolve nulo.

São o atalho de quem só quer dimensionar: botão "Ligar o sistema" no alto, e a dica `sistema-desligado` no consultor quando há sistema montado, resta manobra de ligar a fazer, a ligação não é recusada e não há erro nenhum (consultor.md). Os aparelhos não entram no atalho.

## 7. Visores

Números ao vivo sobre a peça, lidos da `SaidaPasso` e da corrente de operação. O visor da bateria mostra a porcentagem e, a pedido do Gustavo em 16/11/2026, também os volts, que são a tensão de repouso aproximada da seção 7.1 (**simplificação**, dita na tela).

| Peça | Mostra | Apagado quando |
|---|---|---|
| Controlador | Tensão das placas (`pvTensao`), corrente de carga em A, e a situação: "carregando", "sem sol", "bateria cheia" | Sem bateria presente, ou queimado |
| Inversor | Situação ("ligado", "falha: sobrecarga"), de onde vem a energia (rede, bateria, placas), consumo em W e em % da potência do inversor. Com solar embutido, também a tensão das placas e a corrente de carga (AX) | Desligado, sem bateria presente, ou queimado |
| Bateria | Carga em %, a tensão de repouso aproximada ("≈ 12,4 V") e a potência entrando ou saindo, em W | Nunca (é ajuda do simulador; bateria de chumbo não tem visor) |
| Disjuntor e fusível | Posição da alavanca; fusível fora, colocado ou queimado | — |
| Peça queimada | Marca de queimado, fumaça por alguns segundos | — |

### 7.1 Volts da bateria

O simulador calcula a carga da bateria, não a tensão. Os volts do visor saem da carga, por uma tabela de fabricante de tensão em repouso (bateria parada, sem carregar nem descarregar). Moura e Freedom, as marcas de chumbo do catálogo, só publicam essa relação em gráfico, sem números; nenhuma marca de lítio do catálogo publica tabela. Por decisão do Gustavo (caminho 1, 16/11/2026), valem tabelas de outros fabricantes, e a tela diz isso.

| Química | Fonte | Condição |
|---|---|---|
| `chumbo` e `automotiva` | Trojan Battery, "User's Guide" (2018), Table 7, bateria ventilada de 12 V (https://s1.solacity.com/docs/Trojan/TrojanBattery_UsersGuide.pdf, p. 22) | Circuito aberto, parada há pelo menos 6 horas |
| `lifepo4` | LiTime, manual da bateria de 12 V 50 Ah, seção 4.6 (https://au.litime.com/pages/litime-12v-50ah-lifepo4-battery-use-manual) | Circuito aberto, parada há 3 horas ou mais |

Chumbo, 12 V: 100 % 12,73 V; 90 % 12,62; 80 % 12,50; 70 % 12,37; 60 % 12,24; 50 % 12,10; 40 % 11,96; 30 % 11,81; 20 % 11,66; 10 % 11,51. A tabela não tem 0 %.

Lítio, 12 V: 100 % 13,33 V; 75 % 13,2 a 13,3; 50 % 13,1 a 13,2; 25 % 13,0 a 13,1. A linha de 0 % da tabela é a faixa de 10 a 12 V e fica de fora. Vale o meio de cada faixa: 13,25; 13,15; 13,05.

Regras (`src/nucleo/tensaoDeRepouso.ts`):

- Entre dois pontos, uma reta (escolha do simulador). Abaixo do último ponto (10 % no chumbo, 25 % no lítio) não há extrapolação: o visor mostra "< 11,5 V" ou "< 13,1 V".
- 24 V e 48 V são a tabela de 12 V multiplicada por 2 e por 4. Em um banco, o visor de cada bateria mostra os volts dela, pela tensão nominal dela.
- O visor escreve "≈" na frente. O número é o da bateria parada: carregando, a tensão de verdade fica acima; alimentando aparelhos, abaixo. O simulador não calcula esse desvio.
- A conferência cruzada disponível: o manual Moura VRLA MVA (V5, 2024) dá em texto 12,84 V com 100 % e 12,24 V com 50 % para a selada, próximo da tabela usada.
- O painel da bateria e o glossário dizem de onde vêm os números e que, no lítio, a tensão quase não muda entre 25 % e 100 % (os fabricantes Battle Born e LiTime dizem que tensão não é bom indicador de carga no lítio; por isso bateria de lítio usa medidor próprio).

## 8. Tela

- **Clique** em uma proteção no cabo abre ou fecha; clique no botão do inversor e no aparelho liga ou desliga. O painel do item selecionado tem os mesmos comandos, para quem não acerta o clique.
- **Evento:** faixa sobre a cena e cartão no painel com o que houve, por quê (com a fonte em palavras: "o manual manda…") e o que fazer. Para peça queimada, o botão "Consertar" e, se a causa continua lá, o aviso "Se ligar de novo assim, queima de novo".
- **Consultor:** erro `peca-queimada` para cada peça ou cabo queimado, com a ação de consertar; dica `sistema-desligado`.
- **Orçamento:** não muda. O conserto é de graça no simulador; o texto do evento lembra que, de verdade, é uma peça nova.

## 9. Tutorial

Duas partes, no mesmo roteiro:

1. **Montar,** como hoje, com dois ajustes: o passo do fusível passa a ser "ponha o fusível no cabo e deixe aberto", e o passo do aparelho deixa de exigir o aparelho ligado.
2. **Ligar,** com um passo por manobra da seção 6: fechar o fusível da bateria (e ver o controlador acender), fechar a proteção do controlador, ligar o cabo das placas por último e ver a corrente de carga no visor, ligar o inversor, ligar o ventilador. Cada passo diz o que olhar no visor.

Depois do teste de autonomia, a parte opcional **"Experimente errar"**: três erros guiados, cada um com o conserto: ligar as placas antes da bateria, ligar um aparelho maior que o inversor, e inverter a bateria. O painel diz antes o que vai acontecer e por quê.

A ordem do tutorial precisa mudar em um ponto: hoje o cabo das placas é ligado com a bateria já presente, o que continua certo; mas com o fusível nascendo aberto, ligar as placas antes de fechar o fusível queima o controlador de dia. O passo de fechar o fusível vem antes do passo dos cabos da placa.

## 10. Testes

Casos do núcleo, sem número novo: cada linha da tabela da seção 5 é um caso (situação montada com as peças do tutorial e do cenário "Completa"), mais: campo ausente vale fechado; `projetoVivo` tira só os cabos interrompidos; inversor desligado com controlador externo continua carregando; `energizar` fecha na ordem e recusa com bateria invertida; consertar sem corrigir a causa queima de novo; desfazer a manobra desfaz o dano.

Casos da revisão da fase: desligar com as placas sem chave (não abre a proteção da bateria do controlador e avisa); ligar com a proteção da bateria do controlador queimada (recusa); bateria invertida no controlador (recusa e erro no consultor); corrente com sinal (12 V, controlador de 40 A, duas placas de 585 W, disjuntor CC de 80 A no cabo do inversor, só o ventilador: não desarma); controlador carregando com o inversor sem bateria; baterias em paralelo com uma invertida; arco do disjuntor CA no atalho; consertar vários alvos em um passo; evento não repetido ao desfazer; sobrecarga no meio de um avanço longo; corrente por fileira.

Verificação com o mouse: fechar o fusível e ver o visor do controlador acender; ligar o inversor e o aparelho pelo clique na cena; sobrecarga e religar; um dano com a captura da peça queimada e o conserto; "Ligar o sistema" na casa completa.

## 11. Lacunas conhecidas

O que o simulador ainda não faz, para não ser lido como regra:

- **Tirar o fusível com corrente passando não tem consequência.** Porta-fusível não é chave: de verdade, tirar o fusível com carga abre arco. Os textos mandam abrir o disjuntor (ou desligar o inversor) antes.
- **`removerParede` e `removerVaranda` não avaliam arco.** Apagar a parede ou a varanda leva junto as placas encaixadas nela e os cabos delas, sem o `arco-no-conector` que apagar o cabo ou a placa provoca.
- **O disjuntor CA queimado por arco interrompe o cabo no simulador.** De verdade, o arco que não apaga continua conduzindo (e esquentando) até alguma outra coisa abrir o circuito.
- **Cada bateria de um banco mostra a potência do banco inteiro** no visor, não a parte dela.
