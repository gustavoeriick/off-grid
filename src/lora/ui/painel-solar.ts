// Seção "Repetidor solar" do painel do ponto do tipo repetidor: placa e bateria para o repetidor ficar sozinho em um lugar alto.
// Especificação: docs/especificacao/lora.md, seção 4.10. O consumo do rádio é uma estimativa; por isso o resultado sai como faixa.

import { acoesLora, ajustesDoRepetidorSolar } from '../estado';
import { CONSUMO_ESTIMADO_MA, dimensionarRepetidorSolar, SOL_DO_PIOR_MES, type AjustesDoRepetidorSolar } from '../nucleo';
import { h, num } from './dom';

/** "0,14" ou "1,1": duas casas abaixo de 1, uma acima. */
const curto = (n: number): string => (Number.isFinite(n) ? num(n, n < 1 ? 2 : 1) : '—');

/** Faixa em palavras: "de 0,14 a 1,1 W", ou um valor só quando os dois são iguais. */
export function faixa(min: number, max: number, unidade: string, formato: (n: number) => string = curto): string {
  return formato(min) === formato(max) ? `${formato(min)} ${unidade}` : `de ${formato(min)} a ${formato(max)} ${unidade}`;
}

export function montarRepetidorSolar(): { elemento: HTMLElement; atualizar: () => void } {
  const campos: { chave: keyof AjustesDoRepetidorSolar; rotulo: string; titulo: string; passo: string }[] = [
    { chave: 'consumoMinMa', rotulo: 'Consumo do rádio, no mínimo (mA)', titulo: 'mA (miliampère) mede a corrente que o rádio puxa da bateria, na média do dia.', passo: '1' },
    { chave: 'consumoMaxMa', rotulo: 'Consumo do rádio, no máximo (mA)', titulo: 'Com mais mensagens passando, o rádio transmite mais e gasta mais.', passo: '1' },
    { chave: 'diasSemSol', rotulo: 'Dias seguidos sem sol', titulo: 'Quantos dias nublados a bateria deve aguentar sozinha.', passo: '1' },
    { chave: 'solKwhM2Dia', rotulo: 'Sol do pior mês (kWh/m²/dia)', titulo: 'Energia do sol que chega por dia em uma placa deitada, no mês mais fraco do ano. É o mesmo que "horas de sol pleno".', passo: '0.1' },
  ];
  const entradas = new Map<keyof AjustesDoRepetidorSolar, HTMLInputElement>();
  const linhas = campos.map((c) => {
    const entrada = h('input', { type: 'number', step: c.passo, min: '0', 'data-solar': c.chave, title: c.titulo });
    entrada.addEventListener('change', () => {
      const v = Number(entrada.value.replace(',', '.'));
      if (entrada.value.trim() !== '' && Number.isFinite(v)) acoesLora.ajustarRepetidorSolar({ [c.chave]: v });
      atualizar(true);
    });
    entradas.set(c.chave, entrada);
    return h('div', { class: 'lora-campo' }, h('label', { title: c.titulo }, c.rotulo, entrada));
  });
  const resultado = h('div', { class: 'lora-solar-resultado', id: 'lora-solar-resultado', role: 'status' });
  const elemento = h(
    'div',
    { class: 'lora-solar', id: 'lora-solar', hidden: true },
    h('h3', null, 'Repetidor solar: placa e bateria'),
    h('p', { class: 'lora-ajuda' }, 'Um repetidor em lugar alto costuma ficar longe de tomada. Uma placa solar pequena e uma bateria mantêm o rádio ligado dia e noite.'),
    resultado,
    ...linhas,
    h(
      'p',
      { class: 'lora-nota' },
      `O consumo de ${num(CONSUMO_ESTIMADO_MA[0])} a ${num(CONSUMO_ESTIMADO_MA[1])} mA é uma estimativa de um guia de montagem para um rádio de baixo consumo (RAK4631), sem medição publicada. Por isso o resultado é uma faixa. Com o rádio na mão, meça com um medidor USB e ponha o seu número nos dois campos.`,
    ),
    h('p', { class: 'lora-ajuda' }, `O sol do pior mês vem do simulador solar: ${num(SOL_DO_PIOR_MES.kwhM2Dia, 2)} kWh/m²/dia em ${SOL_DO_PIOR_MES.mes} (${SOL_DO_PIOR_MES.local}).`),
    h(
      'p',
      { class: 'lora-ajuda' },
      'Estes números são o mínimo: a conta supõe a placa deitada, sem sombra, e não deixa sobra para recarregar a bateria depois de dias nublados. Na compra, escolha placa e bateria com folga, e uma caixa que aguente chuva.',
    ),
  );

  function atualizar(forcar = false): void {
    const ajustes = ajustesDoRepetidorSolar();
    for (const [chave, entrada] of entradas) {
      if (forcar || document.activeElement !== entrada) entrada.value = String(ajustes[chave]);
    }
    const { min, max } = dimensionarRepetidorSolar(ajustes);
    const mah = (n: number): string => num(Math.ceil(n / 10) * 10);
    resultado.replaceChildren(
      h('p', null, 'O rádio gasta ', h('strong', null, faixa(min.whPorDia, max.whPorDia, 'Wh por dia')), '.'),
      h('p', null, 'Placa solar: no mínimo ', h('strong', null, faixa(min.placaW, max.placaW, 'W')), '.'),
      h(
        'p',
        null,
        'Bateria: no mínimo ',
        h('strong', null, faixa(min.bateriaWh, max.bateriaWh, 'Wh')),
        ` (${faixa(min.bateriaMah, max.bateriaMah, 'mAh em 3,7 V', mah)}), para ${num(ajustes.diasSemSol)} ${ajustes.diasSemSol === 1 ? 'dia' : 'dias'} sem sol.`,
      ),
    );
  }

  atualizar();
  return { elemento, atualizar: () => atualizar() };
}
