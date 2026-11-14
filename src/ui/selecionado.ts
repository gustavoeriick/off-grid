// Painel do item selecionado (coluna direita, acima das abas). Tarefa 2.3, parte de interface.

import { CATALOGO, grupoDoItem } from '../catalogo';
import type { Item, TipoCabo, Uso } from '../catalogo/tipos';
import { acoes, assinar, estado } from '../estado';
import { correntesDeProjeto, quedasDeTensao } from '../nucleo/cabos';
import { comodoDe } from '../nucleo/comodos';
import type { Cabo, Circuito, Dispositivo } from '../nucleo/tipos';
import { avisosDoItem, blocoDePreco, brl, el, h, mostrarMensagem, num, substituir } from './formato';

const NOME_CIRCUITO: Record<Circuito, string> = {
  placas: 'Placas',
  bateria: 'Bateria',
  saida: 'Saída para o aparelho',
  entrada: 'Entrada da rede',
};

function botao(texto: string, aoClicar: () => void, extra: Record<string, string | boolean | undefined> = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', ...extra }, texto);
  b.addEventListener('click', aoClicar);
  return b;
}

function nomeDoDispositivo(uid: string): string {
  const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
  return (d && CATALOGO.get(d.itemId)?.nome) ?? uid;
}

function hora(n: number): string {
  return `${n} h`;
}

function seletorDeHora(rotulo: string, valor: number, de: number, ate: number, aoMudar: () => void): HTMLLabelElement {
  const s = h('select', { 'data-uso': rotulo === 'Começa' ? 'inicio' : 'fim' });
  for (let n = de; n <= ate; n++) s.append(new Option(hora(n), String(n), false, n === valor));
  s.addEventListener('change', aoMudar);
  return h('label', null, rotulo, s);
}

/** "Modelo:" com a lista dos modelos do mesmo tipo. Com um só, mostra o nome sem lista. */
function modeloDoItem(d: Dispositivo, item: Item, modelos: Item[], redesenhar: () => void): Node[] {
  if (modelos.length <= 1) return [h('span', { class: 'rotulo-modelo' }, 'Modelo: '), h('strong', null, item.nome)];
  const lista = h('select', { 'aria-label': 'Modelo', 'data-modelo': '' });
  for (const m of modelos) lista.append(new Option(m.preco > 0 ? `${m.nome} (${brl(m.preco)})` : m.nome, m.id, false, m.id === item.id));
  lista.addEventListener('change', () => {
    if (!acoes.trocarModelo(d.uid, lista.value)) {
      mostrarMensagem('Esse modelo não tem as mesmas ligações. Nada mudou.', true);
      redesenhar();
    }
  });
  return [h('label', { class: 'campo' }, 'Modelo:', lista)];
}

function painelDispositivo(d: Dispositivo, redesenhar: () => void): Node[] | null {
  const item = CATALOGO.get(d.itemId);
  if (!item) return null;
  const comodo = comodoDe(estado.projeto.casa, d);
  const grupo = grupoDoItem(CATALOGO, item.id);
  const nos: Node[] = [
    h('h3', null, grupo?.nome ?? item.nome),
    h('div', { class: 'modelo-do-item' }, ...modeloDoItem(d, item, grupo?.itens ?? [item], redesenhar)),
    h('p', { class: 'detalhe' }, item.detalhe),
    blocoDePreco(item),
    ...avisosDoItem(item),
    h('p', { class: 'comodo' }, `Cômodo: ${comodo ? comodo.nome : 'nenhum'}`),
  ].filter((n): n is HTMLElement => n !== null);

  const linha = h('div', { class: 'acoes-item' });
  linha.append(botao('Girar', () => window.dispatchEvent(new CustomEvent('offgrid:girar-selecionado')), { title: 'Gira a peça em 90° sobre a superfície' }));
  linha.append(botao('Apagar', () => acoes.removerDispositivo(d.uid), { class: 'perigo' }));
  nos.push(linha);

  if (item.categoria === 'aparelho') {
    const uso: Uso = d.uso ?? item.usoPadrao;
    nos.push(
      h(
        'div',
        { class: 'acoes-item' },
        h('span', { class: d.ligado ? 'estado-ligado' : 'estado-desligado' }, d.ligado ? 'Ligado' : 'Desligado'),
        botao(d.ligado ? 'Desligar' : 'Ligar', () => acoes.definirLigado(d.uid, !d.ligado), { 'data-acao': 'ligar' }),
      ),
    );
    const aoMudarHorario = (): void => {
      const caixa = document.querySelector<HTMLElement>('#item-selecionado');
      const inicio = Number(caixa?.querySelector<HTMLSelectElement>('[data-uso="inicio"]')?.value);
      const fim = Number(caixa?.querySelector<HTMLSelectElement>('[data-uso="fim"]')?.value);
      // Começar e terminar na mesma hora não é um horário: volta ao que estava.
      if (inicio === fim) return redesenhar();
      acoes.definirUso(d.uid, { inicio, fim });
    };
    nos.push(
      h('p', { class: 'rotulo-secao' }, d.uso ? 'Horário de uso (escolhido por você)' : 'Horário de uso (o típico deste aparelho)'),
      h('div', { class: 'horario' }, seletorDeHora('Começa', uso.inicio, 0, 23, aoMudarHorario), seletorDeHora('Termina', uso.fim, 1, 24, aoMudarHorario)),
      h(
        'div',
        { class: 'acoes-item' },
        botao('O dia inteiro', () => acoes.definirUso(d.uid, { inicio: 0, fim: 24 }), { 'data-acao': 'dia-inteiro' }),
        botao('Voltar ao típico', () => acoes.definirUso(d.uid, null), { disabled: d.uso === null, 'data-acao': 'tipico' }),
      ),
    );
  }
  return nos;
}

function painelCabo(c: Cabo): Node[] | null {
  const tipo = CATALOGO.get(c.caboId);
  if (tipo?.categoria !== 'cabo') return null;
  const analise = estado.derivados.analise;
  const corrente = correntesDeProjeto(estado.projeto, CATALOGO, analise).get(c.uid);
  const quedas = quedasDeTensao(estado.projeto, CATALOGO, analise).filter((q) => q.cabos.includes(c.uid));

  const opcoes = [...CATALOGO.values()].filter((i): i is TipoCabo => i.categoria === 'cabo' && i.uso === tipo.uso);
  const lista = h('select', { 'aria-label': 'Tipo de cabo', 'data-cabo-tipo': '' });
  opcoes.forEach((o) => lista.append(new Option(o.nome, o.id, false, o.id === c.caboId)));
  lista.addEventListener('change', () => acoes.trocarTipoDeCabo(c.uid, lista.value));

  const quadro = c.quadro ? nomeDoDispositivo(c.quadro) : null;
  const protecoes = c.protecoes.length
    ? h(
        'ul',
        { class: 'lista-protecoes' },
        ...c.protecoes.map((id, i) =>
          h('li', null, h('span', null, CATALOGO.get(id)?.nome ?? id), botao('Remover', () => acoes.removerProtecao(c.uid, i), { 'data-acao': 'remover-protecao' })),
        ),
      )
    : h('p', { class: 'vazio' }, 'Nenhuma proteção. Arraste uma do catálogo para cima deste cabo.');

  const nos: Node[] = [
    h('h3', null, 'Cabo'),
    h('p', { class: 'detalhe' }, `Liga ${nomeDoDispositivo(c.de.disp)} a ${nomeDoDispositivo(c.para.disp)}.`),
    h('label', { class: 'campo' }, 'Tipo', lista),
    h('p', { class: 'detalhe' }, `${tipo.detalhe}. Aguenta ${num(tipo.ampacidade)} A.`),
    h('p', null, `Comprimento: ${num(c.comprimento, 1)} m`),
    h('p', null, corrente === undefined ? 'Corrente de projeto: sem circuito ligado' : `Corrente de projeto: ${num(corrente, 1)} A`),
    ...(quedas.length
      ? quedas.map((q) =>
          h(
            'p',
            { class: q.fracao > q.limite ? 'queda queda-alta' : 'queda' },
            `Queda de tensão (${NOME_CIRCUITO[q.circuito]}${q.alvo ? `: ${nomeDoDispositivo(q.alvo)}` : ''}): ${num(q.volts, 2)} V, ${num(q.fracao * 100, 1)} % (limite ${num(q.limite * 100, 1)} %)`,
          ),
        )
      : [h('p', { class: 'queda' }, 'Queda de tensão: sem circuito ligado')]),
    h('p', { class: 'rotulo-secao' }, 'Proteções instaladas'),
    protecoes,
    h('p', null, `Quadro: ${quadro ?? 'nenhum'}`),
    h('div', { class: 'acoes-item' }, botao('Apagar cabo', () => acoes.removerCabo(c.uid), { class: 'perigo' })),
  ];
  return nos;
}

export function montarSelecionado(): void {
  const raiz = el<HTMLElement>('#item-selecionado');
  const desenhar = (): void => {
    const s = estado.selecao;
    let nos: Node[] | null = null;
    if (s?.tipo === 'dispositivo') {
      const d = estado.projeto.dispositivos.find((x) => x.uid === s.uid);
      if (d) nos = painelDispositivo(d, forcar);
    } else if (s?.tipo === 'cabo') {
      const c = estado.projeto.cabos.find((x) => x.uid === s.uid);
      if (c) nos = painelCabo(c);
    }
    raiz.hidden = nos === null;
    if (nos === null) {
      raiz.replaceChildren();
      delete raiz.dataset.assinatura;
      return;
    }
    raiz.dataset.tipo = s?.tipo ?? '';
    substituir(raiz, nos);
  };
  const forcar = (): void => {
    delete raiz.dataset.assinatura;
    desenhar();
  };
  assinar('selecao', desenhar);
  assinar('projeto', desenhar);
  assinar('derivados', desenhar);
  desenhar();
}
