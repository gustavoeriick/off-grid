// Abas da direita: Consultor, Orçamento e Sistema. Tarefa 2.3, parte de interface.
// Os títulos e textos das sugestões vêm do núcleo e entram como estão.

import { CATALOGO } from '../catalogo';
import { acoes, assinar, estado } from '../estado';
import { comodoDe } from '../nucleo/comodos';
import type { Acao, CasaConfig, Dispositivo, GrupoOrcamento, Nivel, Sugestao } from '../nucleo/tipos';
import { abrirCatalogo, destacarQuadroNoCatalogo } from './catalogo';
import { blocoPorQue } from './aprender';
import { rodapeDeLimite } from './avisos';
import { brl, dataBr, el, h, num, substituir } from './formato';

const NIVEIS: Record<Nivel, string> = { erro: 'Erro', alerta: 'Alerta', dica: 'Dica' };

/** Aba do painel da direita que mostra o painel de nome dado. */
export function abrirAbaDireita(nome: string): void {
  document.querySelector<HTMLButtonElement>(`[data-aba="${nome}"]`)?.click();
}

function executar(acao: Acao): void {
  if (acoes.aplicarAcao(acao)) return;
  if (acao.tipo === 'ver-catalogo') {
    // "Ver instalação" pede o quadro de energia: a lista dessa aba é longa, então o cartão dele é mostrado e destacado.
    if (acao.categoria === 'acessorio') destacarQuadroNoCatalogo();
    else abrirCatalogo(acao.categoria);
  }
  else if (acao.tipo === 'mais-placa' || acao.tipo === 'mais-bateria') window.dispatchEvent(new CustomEvent('offgrid:acao', { detail: acao }));
}

/** Seleciona o primeiro alvo da sugestão, que pode ser peça ou cabo. */
function selecionarAlvo(s: Sugestao): void {
  const uid = s.alvos[0];
  if (uid === undefined) return;
  if (estado.projeto.dispositivos.some((d) => d.uid === uid)) acoes.selecionar({ tipo: 'dispositivo', uid });
  else if (estado.projeto.cabos.some((c) => c.uid === uid)) acoes.selecionar({ tipo: 'cabo', uid });
}

function cartaoDeSugestao(s: Sugestao): HTMLElement {
  const c = h(
    'article',
    { class: `sugestao nivel-${s.nivel}`, 'data-regra': s.regra, tabindex: s.alvos.length ? '0' : undefined },
    h('p', { class: 'nivel' }, NIVEIS[s.nivel]),
    h('h4', null, s.titulo),
    h('p', null, s.texto),
  );
  if (s.alvos.length) {
    c.classList.add('com-alvo');
    c.title = 'Clique para ver na cena';
    c.addEventListener('click', () => selecionarAlvo(s));
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target === c) selecionarAlvo(s);
    });
  }
  if (s.acao) {
    const acao = s.acao;
    const b = h('button', { type: 'button', class: 'acao-sugestao' }, acao.rotulo);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      executar(acao);
    });
    c.append(b);
  }
  const porque = blocoPorQue(s.regra);
  if (porque) c.append(...porque);
  return c;
}

function desenharConsultor(): void {
  const sugestoes = estado.derivados.sugestoes;
  substituir(
    el('#painel-consultor'),
    sugestoes.length
      ? [h('p', { class: 'resumo' }, `${sugestoes.length} ${sugestoes.length === 1 ? 'sugestão' : 'sugestões'}`), ...sugestoes.map(cartaoDeSugestao)]
      : [h('p', { class: 'nada-a-corrigir' }, 'Nada a corrigir')],
  );
}

const GRUPOS: { id: GrupoOrcamento; rotulo: string }[] = [
  { id: 'equipamentos', rotulo: 'Equipamentos' },
  { id: 'cabos', rotulo: 'Cabos' },
  { id: 'protecoes', rotulo: 'Proteções' },
  { id: 'instalacao', rotulo: 'Instalação' },
];

function desenharOrcamento(): void {
  const o = estado.derivados.orcamento;
  const nos: Node[] = [];
  for (const g of GRUPOS) {
    const linhas = o.linhas.filter((l) => l.grupo === g.id);
    if (!linhas.length) continue;
    const subtotal = linhas.reduce((s, l) => s + l.total, 0);
    nos.push(
      h(
        'section',
        { class: 'grupo-orcamento', 'data-grupo': g.id },
        h('h4', null, h('span', null, g.rotulo), h('span', null, brl(subtotal))),
        ...linhas.map((l) =>
          h(
            'div',
            { class: 'linha-orcamento' },
            h('span', { class: 'desc' }, l.descricao),
            h('span', { class: 'conta' }, `${num(l.quantidade, l.unidade === 'm' ? 1 : 0)} ${l.unidade} × ${brl(l.unitario)}`),
            h('strong', { class: 'valor' }, brl(l.total)),
            l.tipico ? h('span', { class: 'marca-tipico', title: 'Preço estimado: não veio de um anúncio' }, 'valor típico') : null,
            l.url ? h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, 'ver anúncio') : null,
          ),
        ),
      ),
    );
  }
  if (!nos.length) nos.push(h('p', { class: 'vazio' }, 'Ainda não há nada no projeto para somar.'));

  const datas = o.linhas.map((l) => CATALOGO.get(l.itemId)?.coletadoEm).filter((d): d is string => d !== undefined).sort();
  const pctTipico = o.total > 0 ? (o.totalTipico / o.total) * 100 : 0;
  nos.push(
    h('p', { class: 'total', id: 'total-orcamento' }, h('span', null, 'Total'), h('strong', null, brl(o.total))),
    h(
      'p',
      { class: 'detalhe' },
      o.totalTipico > 0 ? `${brl(o.totalTipico)} (${num(pctTipico, 1)} %) vêm de valores típicos, não de anúncios.` : 'Todos os preços vêm de anúncios.',
    ),
    ...(datas.length
      ? [h('p', { class: 'detalhe' }, datas[0] === datas[datas.length - 1] ? `Preços coletados em ${dataBr(datas[0])}.` : `Preços coletados entre ${dataBr(datas[0])} e ${dataBr(datas[datas.length - 1])}.`)]
      : []),
    h('p', { class: 'detalhe' }, 'Preços mudam: confira o anúncio antes de comprar.'),
    rodapeDeLimite(),
  );
  substituir(el('#painel-orcamento'), nos);
}

/**
 * Cômodo de cada aparelho, guardado enquanto a planta (largura, profundidade, andares, paredes internas e cômodos) e o lugar
 * da peça são os mesmos. Achar o cômodo percorre a planta inteira, e a lista é refeita a cada recálculo: sem guardar,
 * isso custava mais que o próprio cálculo e travava os arrastes.
 */
let plantaDosComodos: readonly unknown[] = [];
const comodosGuardados = new Map<string, ReturnType<typeof comodoDe>>();

function comodoDoAparelho(d: Dispositivo): ReturnType<typeof comodoDe> {
  const casa: CasaConfig = estado.projeto.casa;
  const planta = [casa.largura, casa.profundidade, casa.andares, casa.paredesInternas, casa.comodos];
  if (planta.some((x, i) => x !== plantaDosComodos[i])) {
    plantaDosComodos = planta;
    comodosGuardados.clear();
  }
  const chave = `${d.uid}|${d.superficie}|${d.pos.join(',')}`;
  if (!comodosGuardados.has(chave)) comodosGuardados.set(chave, comodoDe(casa, d));
  return comodosGuardados.get(chave) ?? null;
}

function desenharSistema(): void {
  const e = estado.derivados.estimativas;
  const aparelhos = estado.projeto.dispositivos.filter((d) => CATALOGO.get(d.itemId)?.categoria === 'aparelho');
  const nos: Node[] = [
    h('h4', null, 'Estimativas do dia'),
    h(
      'dl',
      { class: 'estimativas' },
      h('dt', null, 'Geração das placas'),
      h('dd', null, `${num(e.geracaoDiaKwh, 2)} kWh`),
      h('dt', null, 'Consumo da casa'),
      h('dd', null, `${num(e.consumoDiaKwh, 2)} kWh`),
      h('dt', null, 'Autonomia da bateria'),
      h('dd', null, e.autonomiaHoras === null ? 'sem bateria ou sem carga' : `${num(e.autonomiaHoras, 1)} h`),
    ),
    h('p', { class: 'detalhe' }, 'kWh é a unidade de energia da conta de luz. Autonomia é quanto tempo a bateria sustenta a casa sem sol e sem rede.'),
    h('h4', null, 'Aparelhos'),
  ];
  if (!aparelhos.length) nos.push(h('p', { class: 'vazio' }, 'Nenhum aparelho na casa ainda.'));
  for (const d of aparelhos) {
    const item = CATALOGO.get(d.itemId);
    if (item?.categoria !== 'aparelho') continue;
    const comodo = comodoDoAparelho(d);
    nos.push(
      h(
        'div',
        { class: 'linha-aparelho' },
        h('strong', null, item.nome),
        h('span', null, `${num(item.potenciaW)} W${d.ligado ? '' : ' (desligado)'}`),
        h('span', { class: 'detalhe' }, `Cômodo: ${comodo ? comodo.nome : 'nenhum'}`),
      ),
    );
  }
  substituir(el('#sistema-estimativas'), nos);
}

export function montarPaineis(): void {
  const desenhar = (): void => {
    desenharConsultor();
    desenharOrcamento();
    desenharSistema();
  };
  assinar('derivados', desenhar);
  desenhar();
}
