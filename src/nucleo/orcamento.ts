// Orçamento do que está montado. Especificação: docs/especificacao/nucleo.md, seção 11. Tarefa 1.8.

import type { Catalogo, Item } from '../catalogo/tipos';
import type { GrupoOrcamento, LinhaOrcamento, Orcamento, Projeto } from './tipos';

/** Arredonda a centavos. */
function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function criarLinha(
  grupo: GrupoOrcamento,
  item: Item,
  quantidade: number,
  unidade: 'un' | 'm',
): LinhaOrcamento {
  const linha: LinhaOrcamento = {
    grupo,
    itemId: item.id,
    descricao: item.nome,
    quantidade,
    unidade,
    unitario: item.preco,
    total: centavos(quantidade * item.preco),
    tipico: item.tipico?.includes('preco') ?? false,
  };
  if (item.url !== undefined) linha.url = item.url;
  return linha;
}

/** Soma `valor` à chave, mantendo a ordem em que as chaves apareceram. */
function acumular(mapa: Map<string, number>, chave: string, valor: number): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + valor);
}

/** Linhas de equipamentos, cabos, proteções e instalação, com o total. */
export function calcularOrcamento(projeto: Projeto, catalogo: Catalogo): Orcamento {
  const linhas: LinhaOrcamento[] = [];

  // Equipamentos: um item de catálogo com preço maior que zero por linha; aparelhos da casa custam zero.
  const contagem = new Map<string, number>();
  let placas = 0;
  let inversores = 0;
  for (const d of projeto.dispositivos) {
    const item = catalogo.get(d.itemId);
    if (!item) continue;
    if (item.categoria === 'placa') placas += 1;
    if (item.categoria === 'inversor') inversores += 1;
    if (item.preco > 0) acumular(contagem, item.id, 1);
  }
  for (const [id, quantidade] of contagem) {
    linhas.push(criarLinha('equipamentos', catalogo.get(id)!, quantidade, 'un'));
  }

  // Cabos: metros por tipo de cabo.
  const metros = new Map<string, number>();
  const protecoes = new Map<string, number>();
  for (const c of projeto.cabos) {
    if (catalogo.has(c.caboId)) acumular(metros, c.caboId, c.comprimento);
    for (const idProtecao of c.protecoes) {
      if (catalogo.has(idProtecao)) acumular(protecoes, idProtecao, 1);
    }
  }
  for (const [id, quantidade] of metros) {
    linhas.push(criarLinha('cabos', catalogo.get(id)!, quantidade, 'm'));
  }

  // Proteções instaladas em cabos.
  for (const [id, quantidade] of protecoes) {
    linhas.push(criarLinha('protecoes', catalogo.get(id)!, quantidade, 'un'));
  }

  // Instalação: acessórios automáticos.
  const kitsParaDuasPlacas = Math.ceil(placas / 2);
  const automaticos: [string, number][] = [
    ['acc-ganchos-8', kitsParaDuasPlacas],
    ['acc-trilhos', kitsParaDuasPlacas],
    ['acc-mc4-10', placas > 0 ? 1 : 0],
    ['acc-haste', inversores > 0 ? 1 : 0],
  ];
  for (const [id, quantidade] of automaticos) {
    const item = catalogo.get(id);
    if (item && quantidade > 0) linhas.push(criarLinha('instalacao', item, quantidade, 'un'));
  }

  const total = centavos(linhas.reduce((soma, l) => soma + l.total, 0));
  const totalTipico = centavos(linhas.filter((l) => l.tipico).reduce((soma, l) => soma + l.total, 0));
  return { linhas, total, totalTipico };
}
