// Relatório em texto de um cenário: sugestões do consultor, autonomia, energia do dia e orçamento. Tarefa 1.9.

import type { Catalogo } from '../catalogo/tipos';
import { analisarCircuito } from './circuito';
import { analisarConsultor } from './consultor';
import { estimar } from './estimativas';
import { ambienteSemSombra } from './irradiancia';
import { calcularOrcamento } from './orcamento';
import { normalDoPlano } from './sol';
import type { GrupoOrcamento, Projeto } from './tipos';

/** Meio-dia local (UTC−3) de 21/06/2026 e de 21/12/2026. */
const DIAS: { rotulo: string; ms: number }[] = [
  { rotulo: '21/06/2026', ms: Date.UTC(2026, 5, 21, 15) },
  { rotulo: '21/12/2026', ms: Date.UTC(2026, 11, 21, 15) },
];

const GRUPOS: [GrupoOrcamento, string][] = [
  ['equipamentos', 'Equipamentos'],
  ['cabos', 'Cabos'],
  ['protecoes', 'Proteções'],
  ['instalacao', 'Instalação'],
];

/** Número com vírgula decimal e ponto de milhar. */
function num(x: number, casas: number): string {
  const [inteiro, fracao] = x.toFixed(casas).split('.');
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fracao ? `,${fracao}` : '');
}
const reais = (x: number): string => `R$ ${num(x, 2)}`;
const quantidade = (x: number): string => num(x, 2).replace(/,?0+$/, '');

/** Texto com o que o simulador diria sobre o cenário: placas a 17° para o norte, sem sombra. */
export function relatorioDoCenario(projeto: Projeto, catalogo: Catalogo): string {
  const analise = analisarCircuito(projeto, catalogo);
  const ambiente = ambienteSemSombra(normalDoPlano(17, 0));
  const estimativas = DIAS.map((dia) => ({ dia, e: estimar(projeto, catalogo, analise, ambiente, dia.ms) }));
  const sugestoes = analisarConsultor(projeto, catalogo, analise, estimativas[0].e);
  const orcamento = calcularOrcamento(projeto, catalogo);

  const linhas: string[] = [`=== ${projeto.nome} ===`, ''];

  const autonomia = estimativas[0].e.autonomiaHoras;
  linhas.push(`Autonomia com o que está ligado: ${autonomia === null ? 'sem banco ou sem carga ligada' : `${num(autonomia, 1)} horas`}`);
  linhas.push('Energia do dia (placas a 17° para o norte, sem sombra):');
  for (const { dia, e } of estimativas) {
    linhas.push(`  ${dia.rotulo}: geração ${num(e.geracaoDiaKwh, 2)} kWh, consumo ${num(e.consumoDiaKwh, 2)} kWh`);
  }
  linhas.push('');

  linhas.push(`Sugestões do consultor (${sugestoes.length}):`);
  if (sugestoes.length === 0) linhas.push('  Nenhuma.');
  sugestoes.forEach((s, i) => {
    linhas.push(`  ${i + 1}. [${s.nivel}] ${s.regra}: ${s.titulo}`);
    linhas.push(`     ${s.texto}`);
    if (s.acao) linhas.push(`     Ação: ${s.acao.rotulo}`);
  });
  linhas.push('');

  linhas.push('Orçamento:');
  for (const [grupo, nome] of GRUPOS) {
    const doGrupo = orcamento.linhas.filter((l) => l.grupo === grupo);
    if (doGrupo.length === 0) continue;
    linhas.push(`  ${nome}`);
    for (const l of doGrupo) {
      const tipico = l.tipico ? ' (preço típico)' : '';
      linhas.push(`    ${l.descricao}: ${quantidade(l.quantidade)} ${l.unidade} × ${reais(l.unitario)} = ${reais(l.total)}${tipico}`);
    }
  }
  linhas.push(`  Total: ${reais(orcamento.total)}`);
  if (orcamento.totalTipico > 0) linhas.push(`  Parte do total em preços típicos: ${reais(orcamento.totalTipico)}`);

  return linhas.join('\n');
}
