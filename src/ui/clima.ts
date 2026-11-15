// Clima real na barra de tempo (tarefa 5.1): a opção "Real (medido)" e o texto com a situação dos dados.
// O download e o cálculo são do estado (`acoes.definirClima('real')`); aqui só se mostra o que aconteceu.

import { acoes, assinar, estado } from '../estado';
import { localDoProjeto } from '../nucleo/irradiancia';
import { dataBr, el, h } from './formato';

const MS_HORA = 3_600_000;

/** Data local (AAAA-MM-DD) do instante simulado, no fuso do local do projeto. */
function dataLocalSimulada(): string {
  const fuso = localDoProjeto(estado.projeto)?.fuso ?? -3;
  return new Date(estado.tempo.msUtc + fuso * MS_HORA).toISOString().slice(0, 10);
}

/** Texto da situação do clima real. Nulo quando o clima escolhido não é o real. */
export function textoDoClimaReal(): { texto: string; erro: boolean; podeTentar: boolean } | null {
  if (estado.projeto.clima !== 'real') return null;
  const c = estado.climaReal;
  if (c.situacao === 'erro') {
    return {
      texto: `${c.mensagem ?? 'Não consegui baixar o clima deste dia.'} Por enquanto o cálculo usa o clima típico.`,
      erro: true,
      podeTentar: true,
    };
  }
  if (c.situacao === 'pronto' && c.dataDosDados) {
    const fonte = c.fonte ? ` · ${c.fonte}` : '';
    const dia = dataLocalSimulada();
    // Dia futuro (ou recente demais): os dados são do mesmo dia e mês de um ano anterior.
    if (c.dataDosDados !== dia && c.dataDosDados.slice(5) === dia.slice(5)) {
      return { texto: `mesmo dia de ${c.dataDosDados.slice(0, 4)}: dados de ${dataBr(c.dataDosDados)}${fonte}`, erro: false, podeTentar: false };
    }
    return { texto: `dados de ${dataBr(c.dataDosDados)}${fonte}`, erro: false, podeTentar: false };
  }
  return { texto: 'baixando… (até chegar, o cálculo usa o clima típico)', erro: false, podeTentar: false };
}

/** Troca "Hora no Rio" pelo nome da cidade do projeto. Chamado pela barra de tempo a cada desenho. */
export function rotuloDaHora(saida: HTMLElement): void {
  const rotulo = saida.parentElement?.firstChild;
  if (!rotulo || rotulo.nodeType !== Node.TEXT_NODE) return;
  const nome = localDoProjeto(estado.projeto)?.nome ?? 'Rio de Janeiro';
  const texto = `Hora ${nome === 'Rio de Janeiro' ? 'no Rio' : `em ${nome}`} `;
  if (rotulo.textContent !== texto) rotulo.textContent = texto;
}

export function montarClima(): void {
  const seletor = el<HTMLSelectElement>('#clima');
  if (!seletor.querySelector('option[value="real"]')) seletor.append(new Option('Real (medido)', 'real'));

  const texto = h('span', { class: 'clima-situacao-texto' });
  const botao = h('button', { type: 'button', class: 'clima-tentar' }, 'Tentar de novo');
  botao.addEventListener('click', () => acoes.tentarClimaRealDeNovo());
  const caixa = h('p', { id: 'clima-situacao', class: 'clima-situacao', role: 'status', hidden: true }, texto, botao);
  seletor.closest('.grupo')?.append(caixa);

  const desenhar = (): void => {
    const s = textoDoClimaReal();
    caixa.hidden = s === null;
    if (!s) return;
    if (texto.textContent !== s.texto) texto.textContent = s.texto;
    caixa.classList.toggle('erro', s.erro);
    botao.hidden = !s.podeTentar;
  };
  assinar('clima', desenhar);
  assinar('projeto', desenhar);
  assinar('tempo', desenhar);
  desenhar();
}
