// Obstáculos que fazem sombra (muro, vizinho, árvore) e placa no chão: a barra "Acrescentar" de "Editar casa",
// o painel do obstáculo selecionado e os campos "Inclinação" e "Direção" da placa sobre suporte. Tarefas 5.2 e 5.3.

import type { Item } from '../catalogo/tipos';
import { LIMITES_OBSTACULO, limitarObstaculo, NOME_DO_OBSTACULO, novoObstaculo, obstaculoLivre } from '../cena/regrasDosObstaculos';
import { azimuteDoGiro, azimutePadrao, inclinacaoPadrao, LIMITES_PLACA_NO_CHAO, placaNoChao } from '../cena/terreno';
import { acoes, assinar, estado } from '../estado';
import type { Dispositivo, Obstaculo, TipoObstaculo } from '../nucleo/tipos';
import { h, mostrarMensagem, num } from './formato';

interface Faixa {
  min: number;
  max: number;
  passo: number;
}

/** Campo numérico: valor fora da faixa é cortado para o limite; campo vazio ou sem número não muda nada. */
function campoNumero(rotulo: string, chave: string, valor: number, faixa: Faixa, aoMudar: (v: number) => void, redesenhar: () => void): HTMLLabelElement {
  const campo = h('input', { type: 'number', 'data-campo': chave, min: String(faixa.min), max: String(faixa.max), step: String(faixa.passo), value: String(valor) });
  campo.addEventListener('change', () => {
    const v = campo.value.trim() === '' ? NaN : Number(campo.value.replace(',', '.'));
    if (Number.isFinite(v)) aoMudar(Math.min(faixa.max, Math.max(faixa.min, v)));
    redesenhar();
  });
  return h('label', { class: 'campo-casa' }, rotulo, campo);
}

function botao(texto: string, aoClicar: () => void, extra: Record<string, string | boolean | undefined> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', ...extra }, texto);
  b.addEventListener('click', aoClicar);
  return b;
}

const EXPLICACAO: Record<TipoObstaculo, string> = {
  muro: 'Muro de divisa. Faz sombra nas placas que estiverem baixas e perto dele.',
  vizinho: 'A casa ou o prédio do vizinho. Até 9 m de altura é desenhado com telhado; acima disso, como prédio de laje.',
  arvore: 'A copa conta como um bloco fechado: tapa todo o sol que passa por ela. Uma árvore de verdade deixa passar um pouco de luz, e cresce.',
};

/** Painel do obstáculo selecionado em "Editar casa": posição, medidas, giro e Remover. */
export function painelObstaculo(o: Obstaculo, redesenhar: () => void): Node[] {
  const L = LIMITES_OBSTACULO;
  const aplicar = (mudanca: Partial<Omit<Obstaculo, 'uid' | 'tipo'>>): void => {
    const novo = limitarObstaculo({ ...o, ...mudanca });
    if (JSON.stringify(novo) === JSON.stringify(o)) return;
    if (!obstaculoLivre(estado.projeto.casa, novo)) {
      mostrarMensagem('Assim ele ficaria em cima da casa, de uma varanda ou do quartinho. Nada mudou.', true);
      return;
    }
    const { x, z, largura, profundidade, altura, giro } = novo;
    acoes.alterarObstaculo(o.uid, { x, z, largura, profundidade, altura, giro });
  };
  const campo = (rotulo: string, chave: 'x' | 'z' | 'largura' | 'profundidade' | 'altura' | 'giro', faixa: Faixa): HTMLLabelElement =>
    campoNumero(rotulo, chave, o[chave], faixa, (v) => aplicar({ [chave]: v }), redesenhar);
  const posicao: Faixa = { min: -L.posicaoMax, max: L.posicaoMax, passo: L.passo };
  const medida: Faixa = { min: L.medidaMin, max: L.medidaMax, passo: 0.1 };
  const arvore = o.tipo === 'arvore';
  const acoesDoPainel = h('div', { class: 'acoes-item' });
  if (!arvore) acoesDoPainel.append(botao('Girar 90°', () => aplicar({ giro: o.giro + 90 }), { 'data-acao': 'girar-obstaculo', title: 'Tecla R' }));
  acoesDoPainel.append(botao('Remover', () => window.dispatchEvent(new CustomEvent('offgrid:apagar-da-casa')), { class: 'perigo', 'data-acao': 'remover-obstaculo', title: 'Tecla Delete' }));
  return [
    h('h3', null, NOME_DO_OBSTACULO[o.tipo]),
    h('p', { class: 'detalhe' }, `${EXPLICACAO[o.tipo]} Arraste na cena para mudar de lugar, ou mude os números.`),
    h(
      'div',
      { class: 'campos-casa' },
      campo('Posição x (m)', 'x', posicao),
      campo('Posição z (m)', 'z', posicao),
      campo(arvore ? 'Largura da copa (m)' : o.tipo === 'muro' ? 'Comprimento (m)' : 'Largura (m)', 'largura', medida),
      arvore ? null : campo(o.tipo === 'muro' ? 'Espessura (m)' : 'Profundidade (m)', 'profundidade', medida),
      campo('Altura (m)', 'altura', { min: L.alturaMin, max: L.alturaMax, passo: 0.1 }),
      arvore ? null : campo('Giro (°)', 'giro', { min: -180, max: 180, passo: 5 }),
    ),
    h('p', { class: 'detalhe' }, 'A posição é contada do meio da casa: x para os lados, z para a frente (positivo) e para os fundos (negativo). O obstáculo gira junto quando a casa é girada.'),
    acoesDoPainel,
  ];
}

const PONTOS = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];

/** "norte", "nordeste"... para um azimute em graus. */
function nomeDaDirecao(azimute: number): string {
  return PONTOS[Math.round(azimute / 45) % 8]!;
}

/** Quanto da geração do dia a sombra tira desta placa, pelas estimativas. Nulo enquanto não há cálculo. */
export function linhaDaSombra(d: Dispositivo, item: Item): HTMLElement | null {
  if (item.categoria !== 'placa') return null;
  const perda = estado.derivados.estimativas.perdaSombra.get(d.uid);
  if (perda === undefined) return null;
  const texto = perda < 0.005 ? 'Sombra: quase nenhuma neste dia.' : `Sombra: tira ${num(perda * 100, 0)} % da geração desta placa neste dia.`;
  return h('p', { class: perda >= 0.1 ? 'sombra-da-placa sombra-alta' : 'sombra-da-placa', 'data-sombra': String(Math.round(perda * 1000) / 1000) }, texto);
}

/** Campos da placa posta no terreno, sobre suporte: inclinação e direção da face. Vazio para as outras peças. */
export function camposDaPlacaNoChao(d: Dispositivo, item: Item, redesenhar: () => void): Node[] {
  if (!placaNoChao(d, item)) return [];
  const L = LIMITES_PLACA_NO_CHAO;
  const pedir = (detalhe: { inclinacao?: number; azimute?: number }): boolean => window.dispatchEvent(new CustomEvent('offgrid:placa-no-chao', { detail: detalhe }));
  const azimute = Math.round(azimuteDoGiro(estado.projeto.casa.orientacaoGraus, d.giro)) % 360;
  const melhor = azimutePadrao(estado.projeto) === 0 ? 'norte' : 'sul';
  return [
    h('p', { class: 'rotulo-secao' }, 'Placa no chão, sobre suporte'),
    h(
      'div',
      { class: 'campos-casa' },
      campoNumero('Inclinação (°)', 'inclinacao', d.inclinacaoGraus ?? 0, { min: L.inclinacaoMin, max: L.inclinacaoMax, passo: 1 }, (v) => pedir({ inclinacao: v }), redesenhar),
      campoNumero('Direção (°)', 'direcao', azimute, { min: 0, max: 359, passo: L.passoDaDirecao }, (v) => pedir({ azimute: v }), redesenhar),
    ),
    h('p', { class: 'detalhe', 'data-direcao': '' }, `A face olha para o ${nomeDaDirecao(azimute)}. Direção: 0 é norte, 90 leste, 180 sul e 270 oeste. Inclinação: 0 é deitada.`),
    h('p', { class: 'detalhe' }, `Ponto de partida comum: face para o ${melhor} e inclinação igual à latitude do lugar (${num(inclinacaoPadrao(estado.projeto))}° aqui). Confira no painel Sistema o que cada mudança faz com a geração.`),
  ];
}

/** Barra "Acrescentar: Muro | Vizinho | Árvore", à mostra em "Editar casa". */
export function montarBarraDeObstaculos(): void {
  const barra = document.querySelector<HTMLElement>('#barra-obstaculos');
  if (!barra) return;
  barra.querySelectorAll<HTMLButtonElement>('button[data-obstaculo]').forEach((b) =>
    b.addEventListener('click', () => {
      const tipo = b.dataset.obstaculo as TipoObstaculo;
      const uid = acoes.adicionarObstaculo(novoObstaculo(tipo, estado.projeto));
      acoes.selecionar({ tipo: 'obstaculo', uid });
    }),
  );
  const desenhar = (): void => {
    barra.hidden = !estado.edicaoCasa.ativa;
  };
  assinar('edicao', desenhar);
  desenhar();
}
