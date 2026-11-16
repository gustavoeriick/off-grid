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

"Nasce" vale para peça posta pelo usuário, em qualquer projeto (EP: não fechar disjuntor nem pôr fusível durante a fiação). Os cenários prontos do menu ("Completa", "Plano no papel" e os demais) e os projetos gravados antes desta fase vêm com tudo fechado e ligado: campo ausente vale fechado e ligado.

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
```

`ligado` do inversor passa a valer. A migração de projeto antigo não muda nada: os campos novos ficam ausentes.

## 4. O que está vivo (`src/nucleo/operacao.ts`)

A análise de projeto (`analisarCircuito`, o consultor, os cabos, o orçamento e as estimativas) continua olhando a montagem inteira, como se tudo estivesse fechado: ela responde "está bem montado?". A operação responde "o que está energizado agora?".

- **Cabo interrompido:** tem alguma proteção `aberta` ou `queimada`, ou está `queimado`, ou uma das pontas é de peça `queimada`.
- `projetoVivo(projeto)`: o projeto sem os cabos interrompidos.
- `analiseViva = analisarCircuito(projetoVivo(projeto), catalogo)`. Os problemas dela não vão ao consultor.
- A simulação (`passoSimulacao`) passa a receber a `analiseViva` e, em `EntradaPasso`, `inversorLigado: boolean` (`ligado`, sem `falha` e sem `queimado`).
- **Inversor desligado, em falha ou queimado:** nenhum aparelho é atendido, a rede não é usada, o consumo do próprio inversor é zero. Se a entrada solar em uso é a do próprio inversor, as placas não carregam (**simplificação:** alguns híbridos carregam em espera). Se é a de um controlador externo, as placas continuam carregando a bateria.
- Sem banco na análise viva (proteção da bateria aberta): nada é atendido, como hoje no aviso `'sem-bateria'`.

Estimativas (geração, consumo, autonomia) continuam sendo de projeto: não mudam com as proteções nem com o botão do inversor. Só o botão do aparelho conta, como já contava.

### Corrente de operação

`correntesDeOperacao(projeto, catalogo, analiseViva, saida)`: o mesmo método de `correntesDeProjeto` (nucleo.md, seção 9), com as injeções do instante:

| Rede | Injeção |
|---|---|
| Placas | Por fileira: a corrente que a fileira entrega no passo (`saidaArranjo`), zero se as placas não estão sendo aproveitadas |
| Banco | Bateria: `abs(bateriaW) / tensaoRef / ramos`. Controlador externo: `pvW / tensaoCarga` |
| Saída CA | Plugue de cada aparelho atendido: `potenciaW / tensaoRede` (a potência nominal, a mesma da regra de sobrecarga) |
| Entrada CA | `redeW / tensaoRede` |

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

- **Laço do curto:** o caminho com menos cabos entre o `pos` e o `neg` da bateria, andando só por cabos não interrompidos, sem atravessar peças.
- **Caminho da bateria invertida:** o caminho com menos cabos do terminal do aparelho até o polo da bateria.
- O dano é gravado no projeto no mesmo passo do desfazer da ação que o causou: desfazer a manobra desfaz o dano. Dano que acontece com o relógio (o sol nasceu) é um passo próprio.
- Peça queimada não queima de novo. Cada dano gera um **evento** (`{ codigo, uids, msUtc }`) em `estado.simulacao.eventos`, com os 20 últimos, que a cena e os painéis mostram. Os eventos não entram no projeto.
- **Consertar:** `acoes.consertar(alvo)` tira o `queimado` de uma peça ou de um cabo, ou troca o fusível (`queimada` vira `aberta`). É um passo do desfazer. O conserto não corrige a causa: se a ligação continua errada, a peça queima de novo quando for energizada, e o painel avisa disso antes.

## 6. Ordem certa

Ligar (PL, EP, AX):

1. Conferir a ligação: sem erro de polaridade nem de curto no consultor (na vida real, com o multímetro).
2. Fechar a proteção da bateria. O controlador acende.
3. Fechar o disjuntor das placas (ou, sem disjuntor, ligar o cabo das placas por último).
4. Ligar o inversor.
5. Fechar o disjuntor da saída.
6. Ligar os aparelhos, um de cada vez.

Desligar: a ordem inversa. As placas saem antes da bateria; a bateria sai por último.

`acoes.energizar()` faz os passos 2 a 5 nessa ordem, um passo do desfazer, e recusa com explicação se o passo 1 falha. `acoes.desenergizar()` faz o inverso. São o atalho de quem só quer dimensionar: botão "Ligar o sistema" no alto, e a dica `sistema-desligado` no consultor quando há sistema montado e nada energizado. Os aparelhos não entram no atalho.

## 7. Visores

Números ao vivo sobre a peça, lidos da `SaidaPasso` e da corrente de operação. O simulador não tem modelo da tensão da bateria conforme a carga; por isso o visor da bateria mostra a porcentagem, não volts (**simplificação**, dita no "Por quê?").

| Peça | Mostra | Apagado quando |
|---|---|---|
| Controlador | Tensão das placas (`pvTensao`), corrente de carga em A, e a situação: "carregando", "sem sol", "bateria cheia" | Sem bateria presente, ou queimado |
| Inversor | Situação ("ligado", "falha: sobrecarga"), de onde vem a energia (rede, bateria, placas), consumo em W e em % da potência do inversor. Com solar embutido, também a tensão das placas e a corrente de carga (AX) | Desligado, sem bateria presente, ou queimado |
| Bateria | Carga em % e a potência entrando ou saindo, em W | Nunca (é ajuda do simulador; bateria de chumbo não tem visor) |
| Disjuntor e fusível | Posição da alavanca; fusível fora, colocado ou queimado | — |
| Peça queimada | Marca de queimado, fumaça por alguns segundos | — |

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

Verificação com o mouse: fechar o fusível e ver o visor do controlador acender; ligar o inversor e o aparelho pelo clique na cena; sobrecarga e religar; um dano com a captura da peça queimada e o conserto; "Ligar o sistema" na casa completa.
