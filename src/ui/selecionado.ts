// Painel do item selecionado (coluna direita, acima das abas). Tarefa 2.3, parte de interface.

import { CATALOGO, grupoDoItem } from '../catalogo';
import type { Item, TipoCabo, Uso } from '../catalogo/tipos';
import {
  alturaDaBeira, avisoDoQuartinho, comprimentoDaParede, deslocamentoMaximo, inclinacaoMaxima, LIMITES_QUARTINHO, LIMITES_VARANDA, limitarVaranda,
  medidaDaFachada, profundidadeMaxima,
} from '../cena/regrasDaCasa';
import { acoes, assinar, estado } from '../estado';
import { correntesDeProjeto, quedasDeTensao } from '../nucleo/cabos';
import { comodoDe } from '../nucleo/comodos';
import type { Cabo, CasaConfig, Circuito, Dispositivo, LadoCasa, ParedeInterna, Varanda } from '../nucleo/tipos';
import { bateriaPresente, estadoDaProtecao } from '../nucleo/operacao';
import { etiquetasDeTermos } from './aprender';
import { avisosDoItem, blocoDePreco, brl, el, h, mostrarMensagem, num, substituir } from './formato';
import { camposDaPlacaNoChao, linhaDaSombra, painelObstaculo } from './obstaculos';
import { chaveDaPecaQueimada, chaveDaProtecaoQueimada, chaveDoCaboQueimado, corpoDoTexto } from './operacao';
import { TEXTO_GERAL_DE_FUSIVEL_QUEIMADO, TEXTOS_DE_OPERACAO } from './textosDeOperacao';

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

/** Bloco "Queimado": o que houve, por quê, o aviso de que a causa continua e o botão "Consertar". */
function blocoDePecaQueimada(d: Dispositivo): HTMLElement | null {
  const chave = chaveDaPecaQueimada(d);
  if (chave === null) return null;
  const texto = TEXTOS_DE_OPERACAO[chave];
  return h(
    'div',
    { class: 'bloco-queimado', 'data-queimado': d.queimado?.codigo ?? '' },
    h('p', { class: 'rotulo-queimado' }, `Queimado: ${texto.titulo}`),
    ...corpoDoTexto(texto, { chave, alvos: [{ tipo: 'dispositivo', uid: d.uid }], uidDaPeca: d.uid, porQueAberto: true }),
  );
}

/** Botão de ligar e desligar do inversor, com a situação dele em palavras. Em falha, vira "Religar o inversor". */
function controlesDoInversor(d: Dispositivo): Node[] {
  if (d.queimado !== undefined) return [h('p', { class: 'detalhe' }, 'Queimado: não liga até ser consertado.')];
  const emFalha = d.falha !== undefined;
  const situacao = emFalha ? 'Em falha: sobrecarga' : d.ligado ? 'Ligado' : 'Desligado';
  const nos: Node[] = [
    h(
      'div',
      { class: 'acoes-item' },
      h('span', { class: d.ligado && !emFalha ? 'estado-ligado' : 'estado-desligado', 'data-estado-inversor': emFalha ? 'falha' : d.ligado ? 'ligado' : 'desligado' }, situacao),
      botao(
        emFalha ? 'Religar o inversor' : d.ligado ? 'Desligar o inversor' : 'Ligar o inversor',
        // Religar é desligar e ligar: o núcleo limpa a falha ao apertar o botão.
        () => acoes.definirLigado(d.uid, emFalha ? true : !d.ligado),
        { 'data-acao': emFalha ? 'religar-inversor' : d.ligado ? 'desligar-inversor' : 'ligar-inversor' },
      ),
    ),
  ];
  if (emFalha) nos.push(h('p', { class: 'detalhe' }, 'Os aparelhos ligados pedem mais do que o inversor aguenta. Ele cortou a saída e espera ser religado. Desligue algum aparelho antes de religar.'));
  else if (d.ligado && !bateriaPresente(estado.projeto, CATALOGO, d.uid)) nos.push(h('p', { class: 'detalhe' }, 'Sem a bateria ligada a ele, o inversor não liga (o visor fica apagado). Feche a proteção da bateria.'));
  else if (!d.ligado) nos.push(h('p', { class: 'detalhe' }, 'Ligue o inversor depois da bateria e das placas, e antes dos aparelhos.'));
  return nos;
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
    h('p', { class: 'comodo' }, d.superficie === 'terreno' ? 'Lugar: no terreno, fora da casa' : `Cômodo: ${comodo ? comodo.nome : 'nenhum'}`),
    linhaDaSombra(d, item),
  ].filter((n) => n !== null);

  const queimado = blocoDePecaQueimada(d);
  if (queimado) nos.splice(1, 0, queimado);
  if (item.categoria === 'inversor') nos.push(...controlesDoInversor(d));
  // operar.md, seção 7: o visor da bateria é ajuda do simulador (simplificação dita na tela).
  if (item.categoria === 'bateria') {
    nos.push(
      h(
        'p',
        { class: 'detalhe', 'data-nota': 'visor-da-bateria' },
        'O visor sobre a bateria é ajuda do simulador: mostra a carga em %, e não em volts, porque o simulador não calcula a tensão da bateria. Bateria de chumbo de verdade não tem visor.',
      ),
      h('p', { class: 'veja-tambem' }, ...etiquetasDeTermos(['visor'], 'etiqueta-termo')),
    );
  }

  // Grampo de parede: não gira (o desenho acompanha o cabo) e, apagado, só solta o cabo naquele ponto.
  const grampo = item.categoria === 'acessorio' && item.tipo === 'grampo';
  if (grampo) {
    const cabo = estado.projeto.cabos.find((c) => c.grampos?.includes(d.uid));
    if (cabo) nos.push(h('p', { class: 'detalhe' }, `Prende o cabo que liga ${nomeDoDispositivo(cabo.de.disp)} a ${nomeDoDispositivo(cabo.para.disp)}. Arraste o grampo na cena para mudar o caminho do cabo.`));
  }
  const linha = h('div', { class: 'acoes-item' });
  if (!grampo) linha.append(botao('Girar', () => window.dispatchEvent(new CustomEvent('offgrid:girar-selecionado')), { title: d.superficie === 'terreno' && item.categoria === 'placa' ? 'Vira a face da placa 15° no sentido dos ponteiros do relógio' : 'Gira a peça em 90° sobre a superfície' }));
  linha.append(
    botao(
      'Apagar',
      () => {
        // Os cabos da peça vão junto: a mensagem diz quantos foram e como voltar atrás.
        const cabos = estado.projeto.cabos.filter((c) => c.de.disp === d.uid || c.para.disp === d.uid).length;
        acoes.removerDispositivo(d.uid);
        if (cabos > 0) mostrarMensagem(`Apagou a peça e ${cabos === 1 ? 'o cabo ligado' : `os ${cabos} cabos ligados`} a ela. Ctrl+Z desfaz.`);
      },
      { class: 'perigo', title: grampo ? 'Tira o grampo: o cabo fica solto neste ponto (tecla Delete)' : 'Apaga a peça e os cabos ligados a ela (tecla Delete)' },
    ),
  );
  nos.push(linha);
  nos.push(...camposDaPlacaNoChao(d, item, redesenhar));

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

function tipoDaProtecao(c: Cabo, indice: number): 'fusivel' | 'disjuntorCC' | 'disjuntorCA' | 'dps' | undefined {
  const p = CATALOGO.get(c.protecoes[indice] ?? '');
  return p?.categoria === 'protecao' ? p.tipo : undefined;
}

/** A chave de uma proteção: o estado em palavras e o comando. O DPS não tem chave. */
function linhaDaChave(c: Cabo, indice: number): HTMLElement {
  const tipo = tipoDaProtecao(c, indice);
  const estadoAtual = estadoDaProtecao(c, indice);
  if (tipo === 'dps') return h('div', { class: 'protecao-estado' }, h('span', { class: 'detalhe' }, 'Sem chave: protege contra surtos e fica sempre ligado.'));
  const eFusivel = tipo === 'fusivel';
  const palavras: Record<typeof estadoAtual, string> = {
    fechada: eFusivel ? 'Colocado: a corrente passa' : 'Fechado: a corrente passa',
    aberta: eFusivel ? 'Fora do porta-fusível: a corrente não passa' : 'Aberto: a corrente não passa',
    queimada: 'Queimado: não passa corrente',
  };
  const comando =
    estadoAtual === 'queimada'
      ? botao(eFusivel ? 'Trocar o fusível' : 'Consertar', () => acoes.consertar({ tipo: 'protecao', cabo: c.uid, indice }), { 'data-acao': 'trocar-fusivel' })
      : botao(
          estadoAtual === 'fechada' ? (eFusivel ? 'Tirar o fusível' : 'Abrir') : eFusivel ? 'Pôr o fusível' : 'Fechar',
          () => acoes.alternarProtecao(c.uid, indice),
          { 'data-acao': 'alternar-protecao', title: eFusivel ? 'Só sem corrente passando: desligue antes o inversor e os aparelhos.' : undefined },
        );
  return h('div', { class: 'protecao-estado' }, h('span', { class: estadoAtual === 'fechada' ? 'estado-ligado' : 'estado-desligado', 'data-estado-protecao': estadoAtual }, palavras[estadoAtual]), comando);
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
          h(
            'li',
            { 'data-protecao': String(i) },
            h('div', { class: 'protecao-linha' }, h('span', null, CATALOGO.get(id)?.nome ?? id), botao('Remover', () => acoes.removerProtecao(c.uid, i), { 'data-acao': 'remover-protecao' })),
            linhaDaChave(c, i),
          ),
        ),
      )
    : h('p', { class: 'vazio' }, 'Nenhuma proteção. Arraste uma do catálogo para cima deste cabo.');
  const queimadas = c.protecoes.map((_, i) => i).filter((i) => estadoDaProtecao(c, i) === 'queimada');
  const tiposDeProtecao = new Set(c.protecoes.map((_, i) => tipoDaProtecao(c, i)));
  const explicacaoDasChaves: Node[] = [];
  if (tiposDeProtecao.has('disjuntorCC') || tiposDeProtecao.has('disjuntorCA')) {
    explicacaoDasChaves.push(h('p', { class: 'detalhe' }, 'Disjuntor: chave que também abre sozinha quando passa corrente demais. Isso é desarmar: a alavanca cai e o circuito para. Depois de resolver a causa, é só fechar de novo.'));
  }
  if (tiposDeProtecao.has('fusivel')) {
    explicacaoDasChaves.push(h('p', { class: 'detalhe' }, 'Fusível: peça que queima para cortar a corrente demais. Fora do porta-fusível, o circuito está cortado; queimado, só volta com um fusível novo. Ele não é chave de uso: tire e ponha o fusível só com o circuito sem corrente (inversor e aparelhos desligados). Para cortar com corrente, use um disjuntor de corrente contínua.'));
  }
  if (explicacaoDasChaves.length) explicacaoDasChaves.push(h('p', { class: 'veja-tambem' }, ...etiquetasDeTermos(['disjuntor', 'fusivel', 'arco-eletrico'], 'etiqueta-termo')));
  const explicacaoDeQueimadas = queimadas.map((i) => {
    const chave = chaveDaProtecaoQueimada(c.uid);
    const eFusivel = tipoDaProtecao(c, i) === 'fusivel';
    return h(
      'div',
      { class: 'bloco-queimado', 'data-queimado': 'protecao' },
      h('p', { class: 'rotulo-queimado' }, `Queimado: ${eFusivel ? 'o fusível' : 'a proteção'} deste cabo`),
      ...(chave
        ? corpoDoTexto(TEXTOS_DE_OPERACAO[chave], { chave, alvos: [{ tipo: 'protecao', cabo: c.uid, indice: i }], semBotao: true, porQueAberto: true })
        : [h('p', { class: 'op-houve' }, eFusivel ? TEXTO_GERAL_DE_FUSIVEL_QUEIMADO : 'Esta proteção queimou e não deixa mais a corrente passar: o circuito está cortado até ela ser trocada. Descubra a causa antes de trocar.')]),
    );
  });
  const chaveDoCabo = chaveDoCaboQueimado(c);
  const caboQueimado = chaveDoCabo
    ? h(
        'div',
        { class: 'bloco-queimado', 'data-queimado': 'cabo' },
        h('p', { class: 'rotulo-queimado' }, `Cabo queimado: ${TEXTOS_DE_OPERACAO[chaveDoCabo].titulo}`),
        ...corpoDoTexto(TEXTOS_DE_OPERACAO[chaveDoCabo], { chave: chaveDoCabo, alvos: [{ tipo: 'cabo', uid: c.uid }], rotuloDoBotao: 'Consertar este cabo', porQueAberto: true }),
      )
    : null;

  const nos: (Node | null)[] = [
    h('h3', null, 'Cabo'),
    caboQueimado,
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
    ...explicacaoDasChaves,
    ...explicacaoDeQueimadas,
    h('p', null, `Quadro: ${quadro ?? 'nenhum'}`),
    h('div', { class: 'acoes-item' }, botao('Apagar cabo', () => acoes.removerCabo(c.uid), { class: 'perigo' })),
  ];
  return nos.filter((n) => n !== null);
}

// ---------------------------------------------------------------- Casa: quartinho, varanda e parede interna ("Editar casa")

interface Faixa {
  min: number;
  max: number;
  passo: number;
}

/** Campo numérico de um painel. Valor fora da faixa é cortado para o limite; campo vazio ou sem número não muda nada. */
function campoNumero(rotulo: string, chave: string, valor: number, faixa: Faixa, aoMudar: (v: number) => void, redesenhar: () => void): HTMLLabelElement {
  const campo = h('input', { type: 'number', 'data-campo': chave, min: String(faixa.min), max: String(faixa.max), step: String(faixa.passo), value: String(valor) });
  campo.addEventListener('change', () => {
    const v = campo.value.trim() === '' ? NaN : Number(campo.value.replace(',', '.'));
    if (Number.isFinite(v)) aoMudar(Math.min(faixa.max, Math.max(faixa.min, v)));
    // Mostra o valor que ficou valendo, também quando ele foi cortado e o estado não mudou.
    redesenhar();
  });
  return h('label', { class: 'campo-casa' }, rotulo, campo);
}

const apagarDaCasa = (): boolean => window.dispatchEvent(new CustomEvent('offgrid:apagar-da-casa'));

function painelQuartinho(casa: CasaConfig, redesenhar: () => void): Node[] {
  const q = casa.quartinho;
  const L = LIMITES_QUARTINHO;
  const mudar = (chave: keyof CasaConfig['quartinho']) => (v: number): void => {
    if (v !== q[chave]) acoes.alterarCasa({ quartinho: { ...q, [chave]: v } });
  };
  const campo = (rotulo: string, chave: keyof CasaConfig['quartinho'], faixa: Faixa): HTMLLabelElement => campoNumero(rotulo, chave, q[chave], faixa, mudar(chave), redesenhar);
  const aviso = avisoDoQuartinho(casa);
  return [
    h('h3', null, 'Quartinho'),
    h('p', { class: 'detalhe' }, 'Arraste o quartinho na cena, ou mude os números. O que está dentro dele vai junto.'),
    h(
      'div',
      { class: 'campos-casa' },
      campo('Posição x (m)', 'x', { min: -L.posicaoMax, max: L.posicaoMax, passo: L.passo }),
      campo('Posição z (m)', 'z', { min: -L.posicaoMax, max: L.posicaoMax, passo: L.passo }),
      campo('Largura (m)', 'largura', { min: 1, max: 6, passo: 0.1 }),
      campo('Profundidade (m)', 'profundidade', { min: 1, max: 6, passo: 0.1 }),
      campo('Altura (m)', 'altura', { min: 2, max: 3.5, passo: 0.1 }),
      campo('Giro (°)', 'giro', { min: -180, max: 180, passo: 5 }),
    ),
    h('p', { class: 'detalhe' }, 'A posição é contada do meio da casa: x para os lados, z para a frente (positivo) e para os fundos (negativo).'),
    aviso ? h('p', { class: 'aviso-item nao-recomendado' }, aviso) : null,
  ].filter((n) => n !== null);
}

const NOME_DA_VARANDA: Record<LadoCasa, string> = { frente: 'Varanda da frente', fundos: 'Varanda dos fundos', esquerda: 'Varanda da esquerda', direita: 'Varanda da direita' };

function painelVaranda(casa: CasaConfig, v: Varanda, redesenhar: () => void): Node[] {
  const L = LIMITES_VARANDA;
  const fachada = medidaDaFachada(casa, v.lado);
  const aplicar = (mudanca: Partial<Varanda>): void => {
    const nova = limitarVaranda({ ...v, ...mudanca }, casa);
    if (JSON.stringify(nova) !== JSON.stringify(v)) acoes.definirVaranda(nova);
  };
  const inteira = h('input', { type: 'checkbox', 'data-campo': 'inteira', checked: v.largura === null });
  // Ao desmarcar, a varanda começa com metade da fachada, no meio dela.
  inteira.addEventListener('change', () => aplicar(inteira.checked ? { largura: null, deslocamento: 0 } : { largura: Math.max(1, Math.round(fachada * 5) / 10), deslocamento: 0 }));
  const beira = alturaDaBeira(casa, v.profundidade, v.inclinacaoPct);
  const remover = botao('Remover varanda', apagarDaCasa, { class: 'perigo', 'data-acao': 'remover-varanda' });
  return [
    h('h3', null, NOME_DA_VARANDA[v.lado]),
    h('p', { class: 'detalhe' }, 'Na cena, arraste a bolinha da borda de fora para mudar a profundidade e as das pontas para mudar a largura.'),
    h(
      'div',
      { class: 'campos-casa' },
      campoNumero('Profundidade (m)', 'profundidade', v.profundidade, { min: L.profundidadeMin, max: Math.min(L.profundidadeMax, profundidadeMaxima(casa)), passo: L.profundidadePasso }, (n) => aplicar({ profundidade: n }), redesenhar),
      campoNumero('Inclinação (%)', 'inclinacao', v.inclinacaoPct, { min: L.inclinacaoMin, max: inclinacaoMaxima(casa, v.profundidade), passo: 1 }, (n) => aplicar({ inclinacaoPct: n }), redesenhar),
      ...(v.largura === null
        ? []
        : [
            campoNumero('Largura (m)', 'largura', v.largura, { min: Math.min(L.larguraMin, fachada), max: fachada, passo: 0.1 }, (n) => aplicar({ largura: n }), redesenhar),
            campoNumero('Deslocamento (m)', 'deslocamento', v.deslocamento, { min: -deslocamentoMaximo(fachada, v.largura), max: deslocamentoMaximo(fachada, v.largura), passo: 0.1 }, (n) => aplicar({ deslocamento: n }), redesenhar),
          ]),
    ),
    h('label', { class: 'campo' }, inteira, `Fachada inteira (${num(fachada, 1)} m)`),
    h('p', { class: 'detalhe' }, `A beira do telhado fica a ${num(beira, 2)} m do chão. O mínimo é ${num(L.alturaMinBeira, 1)} m: por isso, quanto mais funda a varanda, menor a inclinação que cabe.`),
    v.largura === null ? null : h('p', { class: 'detalhe' }, 'Deslocamento é quanto o meio da varanda sai do meio da fachada: positivo vai para a direita de quem olha a fachada de fora.'),
    h('div', { class: 'acoes-item' }, remover),
  ].filter((n) => n !== null);
}

function painelParede(p: ParedeInterna): Node[] {
  const n = p.passagens.length;
  return [
    h('h3', null, 'Parede interna'),
    h('p', null, `Comprimento: ${num(comprimentoDaParede(p), 1)} m`),
    h('p', null, n === 0 ? 'Sem passagem' : n === 1 ? '1 passagem de 0,8 m' : `${n} passagens de 0,8 m`),
    h('p', { class: 'detalhe' }, 'Na cena: arraste a parede para mover, arraste uma ponta para encurtar ou esticar e clique nela para pôr ou tirar uma passagem (um vão sem porta).'),
    h('div', { class: 'acoes-item' }, botao('Apagar parede', apagarDaCasa, { class: 'perigo', 'data-acao': 'apagar-parede', title: 'Tecla Delete' })),
  ];
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
    } else if (s?.tipo === 'quartinho') {
      nos = painelQuartinho(estado.projeto.casa, forcar);
    } else if (s?.tipo === 'varanda') {
      const v = estado.projeto.casa.varandas.find((x) => x.lado === s.lado);
      if (v) nos = painelVaranda(estado.projeto.casa, v, forcar);
    } else if (s?.tipo === 'parede') {
      const p = estado.projeto.casa.paredesInternas.find((x) => x.uid === s.uid);
      if (p) nos = painelParede(p);
    } else if (s?.tipo === 'obstaculo') {
      const o = (estado.projeto.obstaculos ?? []).find((x) => x.uid === s.uid);
      if (o) nos = painelObstaculo(o, forcar);
    }
    raiz.hidden = nos === null;
    if (nos === null) {
      raiz.replaceChildren();
      delete raiz.dataset.assinatura;
      return;
    }
    raiz.dataset.tipo = s?.tipo ?? '';
    // Fechar o painel é tirar a seleção (o mesmo que Esc ou clicar no vazio da cena).
    const fechar = h('button', { type: 'button', class: 'fechar-item', 'data-acao': 'fechar-item', title: 'Fechar este painel (Esc)', 'aria-label': 'Fechar o painel do item' }, '×');
    fechar.addEventListener('click', () => acoes.selecionar(null));
    substituir(raiz, [fechar, ...nos]);
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
