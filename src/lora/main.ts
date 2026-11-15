// Entrada do ambiente de rádio LoRa (lora.html). Especificação: docs/especificacao/lora.md.
// Fase L2: o mapa com os pontos e os enlaces no centro, o corte do terreno embaixo dele e os painéis à direita.
// Fase L3: as rotas entre as casas e a busca de lugar para repetidor.

import { definirRelevo, rotaEntre, rotasEntreCasas, situacaoDoEnlace } from './calculo';
import { acoesLora, estadoLora } from './estado';
import { montarCorteLora } from './mapa/corte';
import { montarMapaLora } from './mapa/mapa';
import { buscaAtual, rotaEmDestaque } from './ui/busca';
import { el } from './ui/dom';
import { montarPaineisLora } from './ui/paineis';
import { montarTopoLora } from './ui/topo';

montarTopoLora();

const mapa = montarMapaLora(el<HTMLElement>('#lora-mapa-area'));
montarCorteLora(el<HTMLElement>('#lora-corte'), mapa);
montarPaineisLora(el<HTMLElement>('#lora-direita'));

// Para a verificação e para depuração no navegador.
(window as unknown as { __lora: unknown }).__lora = {
  pronto: true,
  estado: () => estadoLora,
  acoes: acoesLora,
  /** Posição de um ponto na janela, em pixels. */
  telaDoPonto: (id: string) => mapa.telaDoPonto(id),
  /** O mapa: centro, zoom, ir para um lugar e a posição de uma coordenada na janela. */
  mapa: { centro: () => mapa.centro(), zoom: () => mapa.zoom(), irPara: mapa.irPara, telaDe: mapa.telaDe },
  definirRelevo,
  situacaoDoEnlace,
  rotaEntre,
  rotasEntreCasas,
  /** A busca de lugar para repetidor (andamento e sugestões) e a rota destacada no mapa. */
  busca: buscaAtual,
  rotaEmDestaque,
};
