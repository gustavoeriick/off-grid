# Especificação técnica do simulador off-grid 3D

**Estado:** proposta para aprovação do Gustavo (fase 0 do [plano de desenvolvimento](plano-de-desenvolvimento.md)). Escrita em 14/11/2026.

**Para o Gustavo:** as partes que pedem a sua leitura são [as regras do consultor](especificacao/consultor.md) e [os casos de teste](especificacao/casos-de-teste.md). Elas definem o que o simulador vai dizer a você e com que números. O restante é referência para os agentes.

**Para os agentes:** leia esta página inteira e depois só a parte da sua tarefa. Onde a especificação e o código de `tipos.ts` divergirem, vale o código, e a divergência deve ser avisada ao coordenador.

| Parte | Conteúdo | Quem usa |
|---|---|---|
| Esta página | Convenções, arquitetura, modelo de dados, interface do núcleo | Todos |
| [Núcleo de cálculo](especificacao/nucleo.md) | Sol, irradiação, placas, bateria, inversor, cabos, circuito, orçamento | `nucleo` |
| [Consultor](especificacao/consultor.md) | Regras, textos e ações das sugestões | `nucleo`, `interface` |
| [Catálogo](especificacao/catalogo.md) | Importador, itens escolhidos, valores típicos | `catalogo` |
| [Cena e interface](especificacao/cena-e-interface.md) | Casa 3D, equipamentos, arraste, cabos, painéis | `cena3d`, `interface` |
| [Fase 2](especificacao/fase-2.md) | Modelos fiéis, quadro de energia, cômodos, várias varandas, edição da casa com o mouse | `cena3d`, `interface`, `nucleo` |
| [Casos de teste](especificacao/casos-de-teste.md) | Números esperados de cada tarefa | Todos, `revisor` |

## 1. Convenções

- **Idioma.** Interface, textos e comentários em português do Brasil. Nomes de domínio no código em português sem acento: `placa`, `bateria`, `inversor`, `cabo`, `fileira`.
- **Unidades.** Metros, watts, volts, ampères, horas, graus Celsius. Energia em Wh no cálculo e em kWh na tela. Dinheiro em reais, com duas casas.
- **Ângulos.** Graus nas interfaces públicas e nos dados; radianos só dentro das funções.
- **Eixos da cena.** X aponta para leste, Y para cima, Z para sul. O norte é −Z.
- **Azimute.** Em graus a partir do norte, no sentido horário: 0 norte, 90 leste, 180 sul, 270 oeste.
- **Tempo.** Instantes em milissegundos UTC (`msUtc`). A hora local é `msUtc + fuso × 3.600.000`, com `fuso = −3` no Rio. Não usar o fuso do computador.
- **Coordenadas da casa.** Origem no centro da planta, no chão. A frente da casa fica em +Z local e a direita de quem olha a frente pela rua fica em +X local. A orientação da casa é o azimute para onde a frente aponta.
- **Identificadores.** `uid` de dispositivo e de cabo: texto curto único no projeto, por exemplo `d1`, `c7`. `id` de item de catálogo: texto fixo, por exemplo `placa-renepv-585`.
- **Números na tela.** Vírgula decimal. Potência sem casas, tensão e corrente com uma casa, energia em kWh com duas, horas com uma.

## 2. Arquitetura

```
src/
  catalogo/   dados dos produtos (tipos e lista)          não importa de ninguém
  nucleo/     cálculo puro, sem Three.js e sem DOM        importa só de catalogo/
  cena/       Three.js: casa, sol, equipamentos, arraste  importa de nucleo/ e catalogo/
  ui/         painéis em HTML                             importa de nucleo/, catalogo/ e cena/
  estado.ts   estado do aplicativo e ações (coordenador)
  main.ts     ponto de entrada (coordenador)
scripts/      importador da pesquisa, verificação, referência
pesquisa/     coletas de preço e prompt de coleta
docs/         plano, especificação e plano elétrico do Gustavo
```

Regras:

- O núcleo é determinístico: mesma entrada, mesma saída. Não lê relógio, não usa `Math.random`, não acessa rede nem `localStorage`.
- A cena nunca calcula eletricidade. Ela informa geometria ao núcleo (normal de cada placa, sombra, comprimento dos cabos) e desenha o que o núcleo devolve.
- A interface nunca altera o projeto direto. Ela chama ações de `estado.ts`.
- Todo arquivo do núcleo tem teste ao lado, com o sufixo `.test.ts`.

Ferramentas: Vite 8, TypeScript 7, Three.js 0.187, Vitest 5. São versões recentes; em caso de dúvida sobre uma API, consulte a documentação e os tipos instalados em `node_modules`, não a memória.

Comandos:

| Comando | Faz |
|---|---|
| `npm run dev` | Abre o simulador em modo de desenvolvimento |
| `npm run typecheck` | Confere os tipos |
| `npm test` | Roda os testes do núcleo |
| `npm run build` | Confere os tipos e gera o site em `dist/` |
| `node scripts/referencia/valores-de-referencia.mjs` | Recalcula os números esperados dos casos de teste |

## 3. Modelo de dados

A fonte da verdade são [src/nucleo/tipos.ts](../src/nucleo/tipos.ts) e [src/catalogo/tipos.ts](../src/catalogo/tipos.ts). Resumo:

- **Projeto.** Tudo o que o usuário montou: a casa (`CasaConfig`), o local, o clima, a tensão das tomadas (127 ou 220 V), a prioridade do inversor, a lista de dispositivos e a lista de cabos.
- **Dispositivo.** Uma peça colocada na casa: referência ao item do catálogo, posição e rotação em coordenadas da casa, superfície em que está encaixada e, nos aparelhos, se está ligada e o horário de uso (`uso`, com início e fim em horas; nulo usa o horário típico do catálogo).
- **Cabo.** Liga dois terminais. Tem o tipo de cabo do catálogo, o comprimento em metros e a lista de proteções instaladas nele.
- **Terminal.** Ponto de ligação de um dispositivo. São três tipos: positivo de corrente contínua (`cc+`), negativo (`cc-`) e corrente alternada (`ca`).
- **Item de catálogo.** Placa, bateria, inversor, controlador, proteção, tipo de cabo, aparelho, tomada da rede ou acessório. Todo item tem preço de referência, e os que vieram da pesquisa têm link e data.

Terminais de cada categoria:

| Categoria | Terminais (`id`, tipo) |
|---|---|
| Placa | `pos` (cc+), `neg` (cc-) |
| Bateria | `pos` (cc+), `neg` (cc-) |
| Inversor híbrido (tem entrada solar, bateria externa) | `pvPos` (cc+), `pvNeg` (cc-), `batPos` (cc+), `batNeg` (cc-), `caEntrada` (ca), `caSaida` (ca) |
| Inversor simples (sem entrada solar) | `batPos` (cc+), `batNeg` (cc-), `caSaida` (ca) |
| Estação portátil (bateria interna) | `pvPos` (cc+), `pvNeg` (cc-), `caEntrada` (ca), `caSaida` (ca) |
| Controlador de carga | `pvPos` (cc+), `pvNeg` (cc-), `batPos` (cc+), `batNeg` (cc-) |
| Aparelho | `plug` (ca) |
| Tomada da rede | `tomada` (ca) |

Regra de ligação: `ca` só liga em `ca`; `cc+` e `cc-` ligam entre si em qualquer combinação. Uma ligação errada em corrente contínua, como polaridade invertida ou curto, é permitida de propósito, para o consultor apontar o erro.

## 4. Interface pública do núcleo

Os arquivos já existem com as assinaturas e o corpo `throw new Error('não implementado')`. A assinatura é o contrato: quem implementa não muda nome, parâmetros nem tipo de retorno sem falar com o coordenador. `terminais.ts` e `cenarios.ts` já estão implementados e testados.

| Arquivo | Funções | Especificação |
|---|---|---|
| `sol.ts` | `posicaoSol`, `direcaoSol`, `normalDoPlano` | Núcleo, seção 1 |
| `irradiancia.ts` | `LOCAIS`, `localPorId`, `irradiancia`, `irradianciaNoPlano`, `irradianciaNasPlacas`, `ambienteSemSombra` | Núcleo, seção 2 |
| `terminais.ts` | `terminaisDe`, `podeLigar` | Esta página, seção 3 |
| `eletrica.ts` | `estadoPlaca`, `vocFrio`, `vmpQuente`, `saidaArranjo`, `infoBanco`, `estadoInicial`, `passoSimulacao` | Núcleo, seções 3 a 7 |
| `uso.ts` | `usoDe`, `horasDeUso`, `emUso` (já implementado) | Núcleo, seção 7 |
| `circuito.ts` | `analisarCircuito` | Núcleo, seção 8 |
| `cabos.ts` | `resistencia`, `correntesDeProjeto`, `quedasDeTensao` | Núcleo, seção 9 |
| `estimativas.ts` | `estimar` | Núcleo, seção 10 |
| `consultor.ts` | `analisarConsultor`, `planejarMaisPlaca` | Consultor |
| `orcamento.ts` | `calcularOrcamento` | Núcleo, seção 11 |
| `cenarios.ts` | `cenarioPlanoNoPapel`, `cenarioPlanoCorrigido` | Casos de teste, seção 1 |

O catálogo expõe `CATALOGO` (um `Map` de `id` para item) e `itemPorId` em `src/catalogo/index.ts`.

## 5. Regras para quem implementa

- Comece lendo a seção da sua tarefa e os casos de teste dela. Escreva os testes primeiro, com os números da especificação.
- Não invente constante. Se um número não está na especificação, pergunte ao coordenador.
- Não mude a tolerância de um teste para ele passar. Se o número esperado parecer errado, relate com a conta.
- Entregue dizendo o que foi feito, o que ficou de fora e o resultado de `npm run typecheck` e `npm test`.
- Escreva só na pasta do seu agente.
