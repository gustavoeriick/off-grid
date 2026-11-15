// Painel "Lugares para um repetidor": o andamento da busca, a lista de sugestões e o erro de relevo.
// Especificação: docs/especificacao/lora.md, seção 4.9. O estado da busca fica em ./busca.

import { assinarLora, estadoLora, PONTO_PADRAO } from '../estado';
import { assinarBusca, buscaAtual, destacarSugestao, fecharBusca, porRepetidorNaSugestao, procurarRepetidor, sugestaoEmDestaque, type Busca } from './busca';
import { botaoPorQue } from './aprender';
import { h, num } from './dom';
import { AVISO_DA_SUGESTAO, TEXTO_DA_BUSCA, textoDoVeredito, textoSemSugestaoQueFecha, trechoDaSugestaoTexto, vereditoEmDestaque } from './textos';

const nomeDoPonto = (id: string): string => estadoLora.projeto.pontos.find((p) => p.id === id)?.nome ?? '?';

/** Monta o painel. Ele fica escondido enquanto não há busca. */
export function montarPainelDaBusca(): HTMLElement {
  const caixa = h('section', { class: 'lora-painel lora-busca', id: 'lora-busca', 'aria-label': 'Lugares para um repetidor', hidden: true });
  /** O que está desenhado: se a busca e os nomes são os mesmos, só o destaque muda e a lista não é refeita. */
  let desenhada: Busca | null = null;
  let nomes = '';
  let itens: HTMLElement[] = [];

  const botaoFechar = (rotulo: string, dica: string): HTMLButtonElement => {
    const b = h('button', { type: 'button', id: 'lora-busca-fechar', title: dica }, rotulo);
    b.addEventListener('click', () => fecharBusca());
    return b;
  };

  function montar(busca: Exclude<Busca, { estado: 'parada' }>): void {
    const a = nomeDoPonto(busca.de);
    const b = nomeDoPonto(busca.para);
    itens = [];
    caixa.replaceChildren(h('h2', null, 'Lugares para um repetidor'), h('p', { class: 'lora-busca-entre' }, 'Entre ', h('strong', null, a), ' e ', h('strong', null, b), '.'));

    if (busca.estado === 'buscando') {
      const barra = h('progress', { id: 'lora-busca-andamento', max: '1', 'aria-label': 'Andamento da busca' });
      // Sem valor, a barra fica "indo e voltando": é o tempo de baixar o relevo, que não dá para medir.
      if (busca.fracao > 0) barra.value = busca.fracao;
      const etapa = busca.fracao > 0 ? `Calculando os dois trechos de cada lugar alto: ${num(busca.fracao * 100, 0)}%.` : 'Baixando o relevo…';
      caixa.append(
        h('p', { class: 'lora-busca-texto', role: 'status' }, TEXTO_DA_BUSCA),
        barra,
        h('p', { class: 'detalhe', id: 'lora-busca-etapa' }, etapa),
        h('div', { class: 'lora-acoes' }, botaoFechar('Cancelar a busca', 'Para a busca. Nada muda no projeto.')),
      );
      return;
    }

    if (busca.estado === 'erro') {
      const tentar = h('button', { type: 'button', id: 'lora-busca-tentar', title: 'Baixa o relevo e procura de novo entre os mesmos pontos' }, 'Tentar de novo');
      tentar.addEventListener('click', () => procurarRepetidor(busca.de, busca.para));
      caixa.append(
        h('p', { class: 'lora-aviso lora-erro', role: 'alert' }, `A busca não pôde ser feita. ${busca.mensagem}`),
        h('div', { class: 'lora-acoes' }, tentar, ' ', botaoFechar('Fechar', 'Fecha este painel. Nada muda no projeto.')),
      );
      return;
    }

    const { sugestoes } = busca;
    if (sugestoes.length === 0) {
      caixa.append(h('p', { class: 'lora-aviso', role: 'note' }, 'A busca não achou nenhum lugar para avaliar entre estes pontos.'));
    } else {
      caixa.append(
        h(
          'p',
          { class: 'detalhe' },
          'São só lugares para avaliar: nenhum rádio foi posto ainda. Aparecem no mapa com o mesmo número e contorno tracejado. O repetidor não amplifica o sinal: recebe a mensagem inteira e transmite de novo; por isso precisa fechar enlace com as duas pontas.',
        ),
      );
      const nenhumaFecha = sugestoes.every((s) => s.veredito === 'nao-fecha');
      const semSaida = nenhumaFecha ? textoSemSugestaoQueFecha(sugestoes[0], a, b) : null;
      if (semSaida) caixa.append(h('p', { class: 'lora-aviso', id: 'lora-busca-sem-saida', role: 'note' }, semSaida, ' ', botaoPorQue('sugestao-nao-fecha')));

      const lista = h('ol', { class: 'lora-sugestoes' });
      sugestoes.forEach((s, i) => {
        const por = h('button', { type: 'button', class: 'lora-sugestao-por', title: `Cria um repetidor neste lugar e liga a ${a} e a ${b}. Dá para desfazer com Ctrl+Z.` }, 'Pôr um repetidor aqui');
        por.addEventListener('click', () => porRepetidorNaSugestao(i));
        const trecho = (ponta: string, t: typeof s.trechoA): HTMLElement =>
          h('li', null, trechoDaSugestaoTexto(ponta, t), ' ', h('span', { class: `lora-selo ${t.veredito}` }, textoDoVeredito(t.veredito)));
        const item = h(
          'li',
          { class: 'lora-sugestao-item', 'data-indice': String(i), tabindex: '0' },
          h(
            'div',
            { class: 'lora-sugestao-topo' },
            h('span', { class: 'lora-sugestao-numero', 'aria-hidden': 'true' }, String(i + 1)),
            h('strong', null, `Lugar ${i + 1}: `, h('span', { class: `lora-sugestao-veredito ${s.veredito}` }, vereditoEmDestaque(s.veredito))),
            h('span', { class: 'detalhe' }, `terreno a ${num(s.altM, 0)} m de altitude`),
            s.veredito === 'nao-fecha' ? botaoPorQue('sugestao-nao-fecha') : null,
          ),
          h('ul', { class: 'lora-sugestao-trechos' }, trecho(a, s.trechoA), trecho(b, s.trechoB)),
          por,
        );
        item.addEventListener('mouseenter', () => destacarSugestao(i, 'lista'));
        item.addEventListener('mouseleave', () => destacarSugestao(null));
        item.addEventListener('focusin', () => destacarSugestao(i, 'lista'));
        item.addEventListener('focusout', () => destacarSugestao(null));
        itens.push(item);
        lista.append(h('li', { class: 'lora-sugestao-casca' }, item));
      });
      caixa.append(lista, h('p', { class: 'detalhe' }, `O veredito de cada lugar é o do pior dos dois trechos. O repetidor da conta é um rádio como o de um ponto novo: antena a ${num(PONTO_PADRAO.alturaDaAntenaM)} m do chão, ${num(PONTO_PADRAO.potenciaDbm)} dBm e ${num(PONTO_PADRAO.ganhoDbi)} dBi.`));
    }
    caixa.append(
      h('p', { class: 'lora-aviso fixo', id: 'lora-busca-aviso', role: 'note' }, AVISO_DA_SUGESTAO),
      h('div', { class: 'lora-acoes' }, botaoFechar('Fechar sugestões', 'Tira as sugestões do mapa. Nada muda no projeto.')),
    );
  }

  function atualizar(): void {
    const busca = buscaAtual();
    if (busca.estado === 'parada') {
      caixa.hidden = true;
      caixa.replaceChildren();
      desenhada = null;
      itens = [];
      return;
    }
    const nomesAgora = `${nomeDoPonto(busca.de)}|${nomeDoPonto(busca.para)}`;
    if (busca !== desenhada || nomesAgora !== nomes) {
      // Quando a busca começa, termina ou falha, o painel vai para a vista: o botão que a pediu pode estar lá embaixo, no painel do enlace.
      const mudouDeFase = busca.estado !== desenhada?.estado;
      desenhada = busca;
      nomes = nomesAgora;
      montar(busca);
      caixa.hidden = false;
      if (mudouDeFase) caixa.scrollIntoView({ block: 'start' });
    }
    const destaque = sugestaoEmDestaque();
    itens.forEach((item, i) => {
      const ativo = destaque?.indice === i;
      if (ativo && !item.classList.contains('destaque') && destaque?.origem === 'mapa') item.scrollIntoView({ block: 'nearest' });
      item.classList.toggle('destaque', ativo);
    });
  }

  assinarBusca(atualizar);
  assinarLora('projeto', atualizar);
  atualizar();
  return caixa;
}
