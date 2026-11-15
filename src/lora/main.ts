// Entrada do ambiente de rádio LoRa (lora.html). Especificação: docs/especificacao/lora.md.
// Fase L2: o mapa com os pontos e os enlaces no centro, o corte do terreno embaixo dele e os painéis à direita.

import { definirRelevo, situacaoDoEnlace } from './calculo';
import { acoesLora, estadoLora } from './estado';
import { montarCorteLora } from './mapa/corte';
import { montarMapaLora } from './mapa/mapa';
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
};
