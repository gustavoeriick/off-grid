# Simulador off-grid 3D

Simulador no navegador para aprender a montar um sistema de energia solar off-grid e dimensionar o da casa do Gustavo: Rio de Janeiro, sobrado, tomadas em 127 V. A experiência é em 3D, com clique e arraste: montar a casa, arrastar equipamentos, puxar cabos, receber sugestões, simular queda de luz e ver o orçamento.

O Gustavo é iniciante em elétrica e vai tomar decisões de compra e de segurança com o que o simulador disser. Um número errado aqui custa dinheiro ou segurança a ele.

## Onde está cada coisa

- **Plano:** [docs/plano-de-desenvolvimento.md](docs/plano-de-desenvolvimento.md). Diz a fase atual, as tarefas, o agente e o modelo de cada uma. As caixas marcadas são as tarefas prontas.
- **Especificação:** [docs/especificacao.md](docs/especificacao.md) e as partes em `docs/especificacao/`. Tem as fórmulas, as regras do consultor, o catálogo e os números esperados dos testes.
- **Insumos:** o plano elétrico do Gustavo em `docs/plano-backup-off-grid.md` e as coletas de preço em `pesquisa/`.

## Como trabalhar

- Fale com o Gustavo em português do Brasil e explique os termos de elétrica na primeira vez que aparecerem.
- Antes de codar, confira no plano o que está aprovado. Não comece uma fase sem o Gustavo ter aprovado a anterior, e não troque a ordem das fases por conta própria.
- Quem coordena uma fase lê o plano, chama os agentes de `.claude/agents/` nas tarefas deles, passa cada entrega pelo `verificador`, chama o `revisor` no fim e só então marca a tarefa no plano.
- Um commit por tarefa aprovada, no ramo `dev`. Não faça push sem o Gustavo pedir: o repositório no GitHub é público.

## Comandos

| Comando | Faz |
|---|---|
| `npm run dev` | Abre o simulador em modo de desenvolvimento |
| `npm run typecheck` | Confere os tipos |
| `npm test` | Roda os testes |
| `npm run build` | Confere os tipos e gera o site em `dist/` |
| `node scripts/referencia/valores-de-referencia.mjs` | Recalcula os números esperados dos casos de teste |

## Regras do código

- Camadas: `src/catalogo` não importa de ninguém; `src/nucleo` importa só do catálogo e não usa Three.js nem DOM; `src/cena` usa Three.js; `src/ui` monta os painéis. `src/estado.ts` e `src/main.ts` são do coordenador.
- `src/nucleo/tipos.ts` e `src/catalogo/tipos.ts` são contrato. Mudança neles passa pelo coordenador.
- Interface e comentários em português do Brasil. Nomes de domínio no código em português sem acento.
- Não invente números. Constantes e valores esperados vêm da especificação; preços vêm de `pesquisa/`. O que falta se pergunta.
- Não mude a tolerância de um teste para ele passar.
- Não acrescente dependência sem o coordenador aprovar. A exceção já prevista é `playwright-core`, para a verificação visual.
- As ferramentas são recentes (Vite 8, TypeScript 7, Three.js 0.187, Vitest 5). Em dúvida sobre uma API, leia os tipos e a documentação em `node_modules`.
