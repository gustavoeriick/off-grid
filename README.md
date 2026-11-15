# Simulador off-grid 3D

Simulador que roda no navegador para aprender a montar um sistema de energia solar off-grid (sem ligação com a rede da distribuidora) e para dimensionar um sistema real. Tudo é feito em 3D, com clique e arraste. O caso que motivou o projeto é uma casa no Rio de Janeiro, sobrado, com tomadas em 127 V.

Serve para quem é iniciante em elétrica e quer entender o que cada peça faz, o que falta no projeto e quanto custa, antes de comprar.

## O que dá para fazer

- Montar a casa: térrea ou sobrado, telhado, varandas cobertas (uma por lado, cada uma com medidas próprias) e quartinho de ferramentas, arrastado com o mouse no terreno. Girar a casa até a posição real em relação ao sol.
- Dividir a casa em cômodos, com paredes internas e nome para cada um.
- Arrastar equipamentos do catálogo: placas (no telhado, na varanda ou no chão, sobre suporte inclinado), controlador de carga, inversor, baterias, estações portáteis e aparelhos. O catálogo tem três linhas: simples (12 V, chumbo, PWM), do plano (24 V, lítio) e avançada (48 V).
- Puxar cabos de um terminal a outro e escolher bitola e proteções (fusíveis e disjuntores).
- Montar o quadro de energia, com as proteções no trilho.
- Receber do consultor avisos na hora (falta proteção, cabo fino, tensão errada, falta placa ou bateria), cada um com um "Por quê?" e, quando dá, uma ação de um clique para corrigir. Há também um glossário e avisos de segurança.
- Simular uma queda de luz com tempo acelerado: o sol anda, a sombra da casa passa pelas placas e a bateria desce, com mostradores e gráfico da carga da bateria.
- Acrescentar vizinho, muro e árvore, que fazem sombra nas placas.
- Ver o orçamento do que está montado, com preços coletados no Mercado Livre, link do anúncio e data da coleta.
- Seguir um passo a passo guiado: um roteiro para o primeiro sistema (12 V) e outro para o plano de 24 V.
- Escolher o clima: típico, limpo, nublado, chuvoso ou real, com as medições de um dia específico.
- Trocar a cidade (as 27 capitais) para ver como o sistema se comporta em outro lugar.
- Desfazer e refazer; o projeto fica gravado no navegador.

## Limites: leia antes de usar

> **Este é um simulador para entender e dimensionar. Ele não substitui o projeto nem a instalação feitos por um eletricista.** Parte CA (a da rede e a das tomadas), trabalho no telhado e baterias oferecem risco de choque, incêndio e queda. Os números do simulador são estimativas.
>
> **Os preços vêm de uma coleta feita em 14/11/2026** (arquivos em `pesquisa/`) e mudam. Antes de comprar, confira o preço e as especificações no anúncio.

## Como rodar

Requisitos: Node.js 20.19 ou mais recente (ou 22.12 ou mais recente), que é o que o Vite 8 exige. O projeto foi desenvolvido no Node 24. Não há `engines` no `package.json` nem `.nvmrc`.

```
npm install
npm run dev
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o simulador em modo de desenvolvimento |
| `npm run build` | Confere os tipos e gera o site em `dist/` |
| `npm run preview` | Serve o site gerado em `dist/` para conferir |
| `npm test` | Roda os testes (Vitest) |
| `npm run typecheck` | Confere os tipos com o TypeScript |
| `npm run verificar` | Faz o build, abre o site num Chrome ou Edge instalado e grava capturas de tela em `verificacao/`; qualquer erro de console faz o roteiro falhar |
| `npm run cenario` | Imprime em texto o relatório do "plano no papel" e do "plano corrigido" |

Nota: no Windows, com Git Bash e um caminho que contém `@`, `npm test` pode falhar com `reading 'config'`. Pelo PowerShell funciona.

## Como o código está organizado

Em `src/`, da camada mais básica para a mais externa:

- `catalogo/`: os equipamentos (placas, baterias, inversores, aparelhos, cabos, proteções) com especificações e preços. Não importa de nenhuma outra camada.
- `nucleo/`: o cálculo puro (circuito, cabos, consultor, irradiância, sol, simulação da bateria, orçamento). Importa só do catálogo. Não usa Three.js nem DOM.
- `dados/`: acesso às fontes externas de clima (Open-Meteo e NASA POWER) e lista das cidades.
- `conteudo/`: textos de aprendizado: "Por quê?", glossário, avisos de segurança e roteiros do passo a passo.
- `cena/`: a cena 3D com Three.js (casa, sol e sombra, modelos dos equipamentos, cabos, quadro, arraste).
- `ui/`: os painéis e controles ao redor da cena.
- `estado.ts` e `main.ts`: o estado do projeto, as ações, a simulação no tempo e a ligação entre as camadas.

Regra de importação: o catálogo não importa de ninguém; o núcleo importa só do catálogo; `dados` e `conteudo` importam do núcleo e do catálogo; `cena` e `ui` importam das camadas de baixo e do estado; só `cena` usa Three.js. Os arquivos `tipos.ts` do catálogo e do núcleo são o contrato entre as camadas.

## De onde vêm os números

- **Especificação:** as fórmulas, as regras do consultor, o catálogo e os casos de teste estão em `docs/especificacao.md` e nas partes em `docs/especificacao/`. O plano de trabalho está em `docs/plano-de-desenvolvimento.md`.
- **Testes:** os arquivos `*.test.ts` conferem o código contra valores de referência calculados à parte por `scripts/referencia/valores-de-referencia.mjs`. A tolerância de um teste não é afrouxada para ele passar.
- **Preços:** coletados no Mercado Livre e guardados em `pesquisa/` (um `.md` legível e um `.json` que o código importa). O prompt usado na coleta está em `pesquisa/prompt-coleta.md`.
- **Fontes externas, em tempo de execução:** o Open-Meteo fornece as medições do clima real de um dia, e a NASA POWER fornece as médias mensais de irradiação e temperatura das outras cidades. Nas duas consultas vão só a latitude e a longitude da cidade. Se a rede falhar, o cálculo usa o clima típico e a tela avisa.

## Estado do projeto

Pronto: casa, equipamentos, cabos, quadro de energia, consultor com explicações, simulação de queda de luz, sombras (casa, vizinho, muro e árvore), orçamento, passo a passo, clima real e outras cidades.

Ainda não está pronto:

- A publicação no GitHub Pages ainda não foi feita.
- As medidas de desempenho (quadros por segundo) só foram feitas em máquina com placa de vídeo dedicada; em outras máquinas o desempenho não foi medido.
- Uma nova coleta de preços (os preços atuais são de 14/11/2026).

## Licença

Licença ainda não definida.
