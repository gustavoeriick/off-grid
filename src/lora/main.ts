// Entrada do ambiente de rádio LoRa (lora.html). Especificação: docs/especificacao/lora.md.
// Fase L1: a página, o seletor de ambiente e os projetos. O mapa e o enlace entram na fase L2.

import { acoesLora, assinarLora, estadoLora } from './estado';
import { el, h } from './ui/dom';
import { montarTopoLora } from './ui/topo';

montarTopoLora();

// Enquanto o mapa não existe, o centro explica o que este ambiente vai fazer e o que já está gravado no projeto.
const centro = el<HTMLElement>('#lora-centro');
const resumo = h('p', { id: 'lora-resumo' });
centro.append(
  h(
    'div',
    { class: 'lora-espera' },
    h('h2', null, 'Rádio LoRa'),
    h('p', null, 'Aqui você vai marcar pontos em um mapa e ver se um rádio LoRa consegue ligar um ao outro: o corte do terreno, a conta do sinal e onde pôr um repetidor.'),
    h('p', null, 'LoRa é um rádio de longo alcance e baixo consumo. Ele manda mensagens de texto curtas, não voz nem internet.'),
    h('p', { class: 'detalhe' }, 'O mapa e a conta do enlace ainda estão em construção. Os projetos já podem ser criados e trocados no menu Projeto.'),
    resumo,
  ),
);
const mostrarResumo = (): void => {
  const p = estadoLora.projeto;
  resumo.textContent = `Projeto "${p.nome}": ${p.pontos.length} ${p.pontos.length === 1 ? 'ponto' : 'pontos'} e ${p.enlaces.length} ${p.enlaces.length === 1 ? 'enlace' : 'enlaces'}.`;
};
assinarLora('projeto', mostrarResumo);
mostrarResumo();

// Para a verificação e para depuração no navegador.
(window as unknown as { __lora: unknown }).__lora = { pronto: true, estado: () => estadoLora, acoes: acoesLora };
