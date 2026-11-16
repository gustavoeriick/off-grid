// Mapa do ambiente de rádio LoRa: fundo do OpenStreetMap (MapLibre), os pontos arrastáveis, os enlaces e as ferramentas.
// Especificação: docs/especificacao/lora.md, seções 5 e 7.
// Privacidade: o serviço do mapa de fundo recebe só pedidos de blocos da área que está na tela.
// Os pontos e os enlaces são desenhados aqui, por cima do mapa, e nunca são enviados a lugar nenhum.

import { AttributionControl, Map as MapaGL, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import urlDoTrabalhador from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { assinarCalculo, atribuicaoDoRelevo, situacaoDoEnlace } from '../calculo';
import { acoesLora, assinarLora, estadoLora } from '../estado';
import { distanciaKm } from '../nucleo';
import type { Coordenada, PontoLora } from '../nucleo/tipos';
import { assinarBusca, buscaAtual, destacarRota, destacarSugestao, procurarRepetidor, sugestaoEmDestaque, trechosDaRotaEmDestaque, type Busca } from '../ui/busca';
import { h, mostrarMensagem } from '../ui/dom';
import { TEXTO_DA_BUSCA } from '../ui/textos';
import { svg } from './svg';
import { distanciaTexto, PALAVRAS_DO_VEREDITO, tomDaSituacao } from './vereditos';

// O MapLibre roda parte do trabalho em um "worker" (um programa auxiliar do navegador). O arquivo dele vai junto com o site.
setWorkerUrl(urlDoTrabalhador);

const BLOCOS_DO_MAPA = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO_DO_MAPA = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores do OpenStreetMap</a>';
/** Retângulo que contém o Brasil inteiro: [oeste, sul] e [leste, norte]. A visão inicial não centra em cidade nenhuma. */
const BRASIL: [[number, number], [number, number]] = [
  [-74.0, -33.8],
  [-34.8, 5.3],
];
const CHAVE_DO_AVISO = 'offgrid.lora.avisoDoMapa';
/** Movimento mínimo, em pixels, para um clique em um ponto virar arraste. */
const FOLGA_DO_CLIQUE_PX = 4;
/** Abaixo deste comprimento na tela, o rótulo do enlace não cabe entre os dois pontos. */
const COMPRIMENTO_MINIMO_DO_ROTULO_PX = 110;

type Ferramenta = 'ponto' | 'repetidor' | 'ligar' | 'sugerir' | null;

export interface MapaLora {
  /** Posição do ponto na janela, em pixels. Nulo se o ponto não existe. */
  telaDoPonto(id: string): { x: number; y: number } | null;
  /** Posição de uma coordenada na janela, em pixels. */
  telaDe(lat: number, lon: number): { x: number; y: number };
  centro(): Coordenada;
  zoom(): number;
  irPara(lat: number, lon: number, zoom: number): void;
  /** Marca no mapa um lugar do caminho do enlace (o ponteiro sobre o corte do terreno). Nulo apaga a marca. */
  marcarNoCaminho(lugar: Coordenada | null): void;
  /** Enquadra uma caixa (graus), sem aproximar além de `zoomMaximo`. */
  enquadrarCaixa(caixa: CaixaGeografica, zoomMaximo: number): void;
  /**
   * Mostra, ou tira (com nulo), a marca provisória de um lugar da busca de endereço, com os botões "Pôr uma casa aqui",
   * "Pôr um repetidor aqui" e "Fechar". A marca não é ponto do projeto. `aoEncerrar` é chamado quando a marca some por
   * conta própria (um dos botões, Esc ou troca de projeto), nunca quando quem chamou a tira.
   */
  mostrarLugarProvisorio(lugar: Coordenada | null, aoEncerrar?: () => void): void;
}

export interface CaixaGeografica {
  sul: number;
  norte: number;
  oeste: number;
  leste: number;
}

function desenhoDaCasa(): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: 'M3.5 11.5 12 4l8.5 7.5M6 10v9.5h4.2V14h3.6v5.5H18V10', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}

function desenhoDoRepetidor(): SVGElement {
  const traco = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  return svg(
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svg('path', { d: 'M12 9.5 7.5 21h9zM9.3 16.5h5.4', ...traco }),
    svg('circle', { cx: '12', cy: '7', r: '1.8', fill: 'currentColor' }),
    svg('path', { d: 'M7.8 3.4a5.6 5.6 0 0 0 0 7.2M16.2 3.4a5.6 5.6 0 0 1 0 7.2', ...traco }),
  );
}

const chaveDoEnlace = (de: string, para: string): string => `${de}|${para}`;
/** A mesma chave para os dois sentidos do enlace. */
const chaveSemSentido = (de: string, para: string): string => (de < para ? `${de}|${para}` : `${para}|${de}`);

export function montarMapaLora(raiz: HTMLElement): MapaLora {
  // ---------------------------------------------------------------- Mapa de fundo
  const caixa = h('div', { id: 'lora-mapa' });
  raiz.append(caixa);

  const temPontos = estadoLora.projeto.pontos.length > 0;
  const mapa = new MapaGL({
    container: caixa,
    style: {
      version: 8,
      sources: { osm: { type: 'raster', tiles: [BLOCOS_DO_MAPA], tileSize: 256, maxzoom: 19, attribution: ATRIBUICAO_DO_MAPA } },
      layers: [
        { id: 'fundo', type: 'background', paint: { 'background-color': '#e9edf1' } },
        { id: 'osm', type: 'raster', source: 'osm' },
      ],
    },
    bounds: BRASIL,
    fitBoundsOptions: { padding: 24 },
    minZoom: 2,
    maxZoom: 18,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    rollEnabled: false,
    touchPitch: false,
    locale: {
      'NavigationControl.ZoomIn': 'Aproximar',
      'NavigationControl.ZoomOut': 'Afastar',
      'AttributionControl.ToggleAttribution': 'Mostrar ou esconder os créditos do mapa',
      'Map.Title': 'Mapa',
    },
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.keyboard.disableRotation();
  mapa.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  mapa.addControl(new ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left');
  mapa.addControl(new AttributionControl({ compact: false, customAttribution: atribuicaoDoRelevo() }), 'bottom-right');

  let avisouErro = false;
  mapa.on('error', (e) => {
    console.warn('Mapa de fundo:', e.error);
    if (avisouErro) return;
    avisouErro = true;
    mostrarMensagem('Não foi possível baixar parte do mapa de fundo. Confira a internet; os pontos continuam gravados neste navegador.', true);
  });

  // ---------------------------------------------------------------- Camada dos pontos e dos enlaces, por cima do mapa
  const linhas = svg('svg', { class: 'lora-linhas', 'aria-hidden': 'true' });
  const elastico = svg('line', { class: 'lora-elastico', visibility: 'hidden' });
  // Com o ponteiro em uma sugestão de repetidor: os dois enlaces que ela teria, um para cada ponta.
  const linhasDaSugestao = [svg('line', { class: 'lora-sugestao-linha', visibility: 'hidden' }), svg('line', { class: 'lora-sugestao-linha', visibility: 'hidden' })];
  linhas.append(...linhasDaSugestao, elastico);
  const marcas = h('div', { class: 'lora-marcas' });
  const marcaDoCaminho = h('div', { class: 'lora-marca-caminho', hidden: true, 'aria-hidden': 'true' });
  marcas.append(marcaDoCaminho);
  // Lugar achado na busca de endereço: uma marca provisória com três botões. Não é ponto do projeto.
  const botaoCasaDoLugar = h('button', { type: 'button', id: 'lora-lugar-casa' }, 'Pôr uma casa aqui');
  const botaoRepetidorDoLugar = h('button', { type: 'button', id: 'lora-lugar-repetidor' }, 'Pôr um repetidor aqui');
  const botaoFecharOLugar = h('button', { type: 'button', id: 'lora-lugar-fechar' }, 'Fechar');
  const marcaDoLugar = h(
    'div',
    { class: 'lora-lugar', id: 'lora-lugar', hidden: true, role: 'group', 'aria-label': 'Lugar encontrado na busca' },
    h('span', { class: 'lora-lugar-alfinete', 'aria-hidden': 'true' }),
    h('div', { class: 'lora-lugar-cartao' }, botaoCasaDoLugar, botaoRepetidorDoLugar, botaoFecharOLugar),
  );
  marcas.append(marcaDoLugar);
  mapa.getCanvasContainer().append(linhas, marcas);

  interface DesenhoDoPonto {
    raiz: HTMLButtonElement;
    nome: HTMLElement;
    tipo: PontoLora['tipo'] | null;
  }
  interface DesenhoDoEnlace {
    grupo: SVGElement;
    borda: SVGElement;
    traco: SVGElement;
    alvo: SVGElement;
    rotulo: HTMLButtonElement;
    distancia: HTMLElement;
    veredito: HTMLElement;
  }
  const desenhosDosPontos = new Map<string, DesenhoDoPonto>();
  const desenhosDosEnlaces = new Map<string, DesenhoDoEnlace>();
  /** Os marcadores das sugestões de repetidor e a busca de que vieram. */
  let desenhosDasSugestoes: HTMLButtonElement[] = [];
  let buscaDesenhada: Busca | null = null;

  let ferramenta: Ferramenta = null;
  /** Nas ferramentas "Ligar dois pontos" e "Sugerir ponto de repetidor": o primeiro ponto clicado. */
  let origemDaLigacao: string | null = null;
  let lugarMarcado: Coordenada | null = null;
  let lugarDaBusca: Coordenada | null = null;
  let aoEncerrarOLugar: (() => void) | undefined;

  const naTela = (c: Coordenada): { x: number; y: number } => {
    const p = mapa.project([c.lon, c.lat]);
    return { x: p.x, y: p.y };
  };
  const naJanela = (c: Coordenada): { x: number; y: number } => {
    const r = caixa.getBoundingClientRect();
    const p = naTela(c);
    return { x: r.left + p.x, y: r.top + p.y };
  };
  /** Coordenada de um lugar da tela (pixels do mapa), já dentro dos limites que o projeto aceita. */
  const coordenadaDe = (x: number, y: number): Coordenada => {
    const c = mapa.unproject([x, y]).wrap();
    return { lat: Math.min(85, Math.max(-85, c.lat)), lon: c.lng };
  };

  // Eventos que o mapa não deve ver quando acontecem em cima de um ponto ou de um enlace: senão ele arrastaria junto ou criaria um ponto.
  const isolarDoMapa = (e: Element): void => {
    for (const tipo of ['mousedown', 'touchstart', 'click', 'dblclick']) e.addEventListener(tipo, (ev) => ev.stopPropagation());
  };

  function cliqueNoPonto(id: string): void {
    if (ferramenta !== 'ligar' && ferramenta !== 'sugerir') {
      definirFerramenta(null);
      acoesLora.selecionar({ tipo: 'ponto', id });
      return;
    }
    if (origemDaLigacao === null) {
      origemDaLigacao = id;
      atualizarFerramentas();
      desenhar();
      return;
    }
    if (origemDaLigacao === id) {
      origemDaLigacao = null;
      atualizarFerramentas();
      desenhar();
      return;
    }
    if (ferramenta === 'sugerir') {
      const origem = origemDaLigacao;
      definirFerramenta(null);
      procurarRepetidor(origem, id);
      return;
    }
    ligar(origemDaLigacao, id);
  }

  function ligar(de: string, para: string): void {
    if (acoesLora.ligar(de, para)) {
      definirFerramenta(null);
      acoesLora.selecionar({ tipo: 'enlace', de, para });
    } else {
      mostrarMensagem('Esses dois pontos já estão ligados.');
      definirFerramenta(null);
    }
  }

  function criarDesenhoDoPonto(id: string): DesenhoDoPonto {
    const nome = h('span', { class: 'lora-ponto-nome' });
    const botao = h('button', { type: 'button', class: 'lora-ponto', 'data-id': id }, h('span', { class: 'lora-ponto-desenho' }), nome);
    isolarDoMapa(botao);

    let arraste: { ponteiro: number; x0: number; y0: number; dx: number; dy: number; moveu: boolean } | null = null;
    botao.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const ponto = estadoLora.projeto.pontos.find((p) => p.id === id);
      if (!ponto) return;
      const p = naJanela(ponto);
      arraste = { ponteiro: e.pointerId, x0: e.clientX, y0: e.clientY, dx: p.x - e.clientX, dy: p.y - e.clientY, moveu: false };
      botao.setPointerCapture(e.pointerId);
    });
    botao.addEventListener('pointermove', (e) => {
      if (!arraste || e.pointerId !== arraste.ponteiro || ferramenta === 'ligar' || ferramenta === 'sugerir') return;
      if (!arraste.moveu) {
        if (Math.hypot(e.clientX - arraste.x0, e.clientY - arraste.y0) < FOLGA_DO_CLIQUE_PX) return;
        arraste.moveu = true;
        // Um arraste inteiro é um passo só de desfazer.
        acoesLora.marcarHistorico();
        definirFerramenta(null);
        // Arrastar a ponta do enlace selecionado mantém o enlace selecionado: o corte do terreno acompanha o arraste.
        const s = estadoLora.selecao;
        if (!(s?.tipo === 'enlace' && (s.de === id || s.para === id))) acoesLora.selecionar({ tipo: 'ponto', id });
        botao.classList.add('arrastando');
      }
      const r = caixa.getBoundingClientRect();
      const x = Math.min(r.width, Math.max(0, e.clientX + arraste.dx - r.left));
      const y = Math.min(r.height, Math.max(0, e.clientY + arraste.dy - r.top));
      acoesLora.alterarPonto(id, coordenadaDe(x, y), { historico: false });
    });
    const soltar = (e: PointerEvent, cancelado: boolean): void => {
      if (!arraste || e.pointerId !== arraste.ponteiro) return;
      const moveu = arraste.moveu;
      arraste = null;
      botao.classList.remove('arrastando');
      if (!moveu && !cancelado) cliqueNoPonto(id);
    };
    botao.addEventListener('pointerup', (e) => soltar(e, false));
    botao.addEventListener('pointercancel', (e) => soltar(e, true));
    // Pelo teclado (Enter ou espaço), o botão dispara "click" sem ponteiro.
    botao.addEventListener('click', (e) => {
      if (e.detail === 0) cliqueNoPonto(id);
    });

    marcas.append(botao);
    return { raiz: botao, nome, tipo: null };
  }

  /** Se alguma sugestão ou ponta da busca ficou fora da parte visível do mapa, enquadra todas. */
  function mostrarSugestoes(lugares: (Coordenada | undefined)[]): void {
    const todos = lugares.filter((c): c is Coordenada => c !== undefined);
    const largura = caixa.clientWidth;
    const altura = caixa.clientHeight;
    const cabe = todos.every((c) => {
      const t = naTela(c);
      return t.x >= 60 && t.x <= largura - 60 && t.y >= 110 && t.y <= altura - 50;
    });
    if (cabe || todos.length === 0) return;
    const lons = todos.map((c) => c.lon);
    const lats = todos.map((c) => c.lat);
    // Fora do desenho em curso: o enquadramento move o mapa, e o movimento redesenha tudo.
    queueMicrotask(() =>
      mapa.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: { top: 120, bottom: 60, left: 90, right: 150 }, maxZoom: 13 },
      ),
    );
  }

  function criarDesenhoDaSugestao(indice: number): HTMLButtonElement {
    const botao = h(
      'button',
      { type: 'button', class: 'lora-sugestao', 'data-indice': String(indice), 'aria-label': `Sugestão ${indice + 1} de lugar para um repetidor` },
      h('span', { class: 'lora-sugestao-desenho' }, h('span', null, String(indice + 1))),
    );
    isolarDoMapa(botao);
    botao.addEventListener('mouseenter', () => destacarSugestao(indice, 'mapa'));
    botao.addEventListener('mouseleave', () => destacarSugestao(null));
    botao.addEventListener('focus', () => destacarSugestao(indice, 'mapa'));
    botao.addEventListener('blur', () => destacarSugestao(null));
    marcas.append(botao);
    return botao;
  }

  function criarDesenhoDoEnlace(de: string, para: string): DesenhoDoEnlace {
    const borda = svg('line', { class: 'lora-enlace-borda' });
    const traco = svg('line', { class: 'lora-enlace-traco' });
    const alvo = svg('line', { class: 'lora-enlace-alvo' });
    const grupo = svg('g', { class: 'lora-enlace', 'data-de': de, 'data-para': para }, borda, traco, alvo);
    const distancia = h('strong', null);
    const veredito = h('span', null);
    const rotulo = h('button', { type: 'button', class: 'lora-enlace-rotulo', 'data-de': de, 'data-para': para }, h('span', { class: 'lora-enlace-cor', 'aria-hidden': 'true' }), distancia, '·', veredito);
    const selecionar = (): void => {
      if (ferramenta !== null) definirFerramenta(null);
      acoesLora.selecionar({ tipo: 'enlace', de, para });
    };
    for (const e of [alvo, rotulo]) {
      isolarDoMapa(e);
      e.addEventListener('click', selecionar);
    }
    linhas.insertBefore(grupo, linhasDaSugestao[0]!);
    marcas.insertBefore(rotulo, marcas.firstChild);
    return { grupo, borda, traco, alvo, rotulo, distancia, veredito };
  }

  /** Põe na tela o que o projeto, a seleção e o cálculo dizem. Reaproveita os elementos, para um arraste não perder o ponteiro. */
  function desenhar(): void {
    const { projeto, selecao } = estadoLora;
    const pontos = new Map(projeto.pontos.map((p) => [p.id, p]));

    // Rota destacada na lista "Rotas entre as casas": os trechos dela ficam marcados e os outros enlaces, apagados.
    const rota = trechosDaRotaEmDestaque();
    const trechosDaRota = new Set(rota.trechos.map((t) => chaveSemSentido(t.de, t.para)));
    const pontosDaRota = new Set(rota.pontos);
    raiz.classList.toggle('com-rota', trechosDaRota.size > 0);

    // Enlaces.
    const enlacesVivos = new Set<string>();
    for (const e of projeto.enlaces) {
      const de = pontos.get(e.de);
      const para = pontos.get(e.para);
      if (!de || !para) continue;
      const chave = chaveDoEnlace(e.de, e.para);
      enlacesVivos.add(chave);
      let d = desenhosDosEnlaces.get(chave);
      if (!d) {
        d = criarDesenhoDoEnlace(e.de, e.para);
        desenhosDosEnlaces.set(chave, d);
      }
      const a = naTela(de);
      const b = naTela(para);
      for (const linha of [d.borda, d.traco, d.alvo]) {
        linha.setAttribute('x1', a.x.toFixed(1));
        linha.setAttribute('y1', a.y.toFixed(1));
        linha.setAttribute('x2', b.x.toFixed(1));
        linha.setAttribute('y2', b.y.toFixed(1));
      }
      const situacao = situacaoDoEnlace(e.de, e.para);
      const tom = tomDaSituacao(situacao);
      const selecionado = selecao?.tipo === 'enlace' && ((selecao.de === e.de && selecao.para === e.para) || (selecao.de === e.para && selecao.para === e.de));
      const km = situacao?.estado === 'pronto' ? situacao.resultado.geometria.distanciaKm : distanciaKm(de, para);
      d.grupo.setAttribute('data-tom', tom);
      d.grupo.classList.toggle('selecionado', selecionado);
      d.rotulo.dataset.tom = tom;
      d.rotulo.classList.toggle('selecionado', selecionado);
      const naRota = trechosDaRota.has(chaveSemSentido(e.de, e.para));
      d.grupo.classList.toggle('na-rota', naRota);
      d.rotulo.classList.toggle('na-rota', naRota);
      d.distancia.textContent = distanciaTexto(km);
      d.veredito.textContent = PALAVRAS_DO_VEREDITO[tom];
      const explicacao = situacao?.estado === 'pronto' ? situacao.resultado.texto : situacao?.estado === 'erro' ? situacao.mensagem : 'Baixando o relevo do caminho…';
      d.rotulo.title = `Enlace: a ligação direta de rádio entre ${de.nome} e ${para.nome}, sem nada no meio. ${explicacao} Clique para ver o corte do terreno.`;
      d.rotulo.setAttribute('aria-pressed', String(selecionado));
      d.rotulo.style.transform = `translate(${((a.x + b.x) / 2).toFixed(1)}px, ${((a.y + b.y) / 2).toFixed(1)}px) translate(-50%, -50%)`;
      d.rotulo.hidden = !selecionado && !naRota && Math.hypot(a.x - b.x, a.y - b.y) < COMPRIMENTO_MINIMO_DO_ROTULO_PX;
    }
    for (const [chave, d] of desenhosDosEnlaces) {
      if (enlacesVivos.has(chave)) continue;
      d.grupo.remove();
      d.rotulo.remove();
      desenhosDosEnlaces.delete(chave);
    }

    // Pontos.
    for (const p of projeto.pontos) {
      let d = desenhosDosPontos.get(p.id);
      if (!d) {
        d = criarDesenhoDoPonto(p.id);
        desenhosDosPontos.set(p.id, d);
      }
      if (d.tipo !== p.tipo) {
        d.tipo = p.tipo;
        d.raiz.dataset.tipo = p.tipo;
        d.raiz.querySelector('.lora-ponto-desenho')!.replaceChildren(p.tipo === 'repetidor' ? desenhoDoRepetidor() : desenhoDaCasa());
      }
      const selecionado = selecao?.tipo === 'ponto' && selecao.id === p.id;
      const naPonta = selecao?.tipo === 'enlace' && (selecao.de === p.id || selecao.para === p.id);
      d.nome.textContent = p.nome;
      d.raiz.classList.toggle('selecionado', selecionado);
      d.raiz.classList.toggle('na-ponta', naPonta);
      d.raiz.classList.toggle('origem', origemDaLigacao === p.id);
      d.raiz.classList.toggle('na-rota', pontosDaRota.has(p.id));
      d.raiz.setAttribute('aria-pressed', String(selecionado));
      const oQueE = p.tipo === 'repetidor' ? 'Repetidor (um rádio em lugar alto, que recebe as mensagens dos outros e as transmite de novo)' : 'Ponto';
      const oQueFazer = ferramenta === 'ligar' ? 'Clique para ligar.' : ferramenta === 'sugerir' ? 'Clique para escolher como ponta da busca.' : 'Clique para selecionar; arraste para mudar de lugar.';
      d.raiz.title = `${oQueE}: ${p.nome}. ${oQueFazer}`;
      d.raiz.setAttribute('aria-label', `${p.tipo === 'repetidor' ? 'Repetidor' : 'Ponto'} ${p.nome}`);
      const t = naTela(p);
      d.raiz.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)`;
    }
    for (const [id, d] of desenhosDosPontos) {
      if (pontos.has(id)) continue;
      d.raiz.remove();
      desenhosDosPontos.delete(id);
    }
    if (origemDaLigacao !== null && !pontos.has(origemDaLigacao)) origemDaLigacao = null;
    if (origemDaLigacao === null) elastico.setAttribute('visibility', 'hidden');

    // Sugestões de lugar para repetidor: marcadores numerados, com contorno tracejado. Não são pontos do projeto.
    const busca = buscaAtual();
    if (busca !== buscaDesenhada) {
      buscaDesenhada = busca;
      for (const m of desenhosDasSugestoes) m.remove();
      desenhosDasSugestoes = busca.estado === 'pronta' ? busca.sugestoes.map((_, i) => criarDesenhoDaSugestao(i)) : [];
      if (busca.estado === 'pronta') mostrarSugestoes([pontos.get(busca.de), pontos.get(busca.para), ...busca.sugestoes]);
    }
    const emDestaque = sugestaoEmDestaque()?.indice ?? null;
    for (const linha of linhasDaSugestao) linha.setAttribute('visibility', 'hidden');
    if (busca.estado === 'pronta') {
      busca.sugestoes.forEach((s, i) => {
        const m = desenhosDasSugestoes[i]!;
        const t = naTela(s);
        m.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)`;
        m.classList.toggle('destaque', emDestaque === i);
        m.dataset.tom = s.veredito;
        m.title = `Sugestão ${i + 1} de lugar para um repetidor: ${PALAVRAS_DO_VEREDITO[s.veredito]}, terreno a ${Math.round(s.altM)} m. Nenhum rádio foi posto aqui ainda; os detalhes estão na lista à direita.`;
        if (emDestaque !== i) return;
        [
          { ponta: pontos.get(busca.de), trecho: s.trechoA },
          { ponta: pontos.get(busca.para), trecho: s.trechoB },
        ].forEach(({ ponta, trecho }, n) => {
          if (!ponta) return;
          const a = naTela(ponta);
          const linha = linhasDaSugestao[n]!;
          linha.setAttribute('x1', a.x.toFixed(1));
          linha.setAttribute('y1', a.y.toFixed(1));
          linha.setAttribute('x2', t.x.toFixed(1));
          linha.setAttribute('y2', t.y.toFixed(1));
          linha.setAttribute('data-tom', trecho.veredito);
          linha.setAttribute('visibility', 'visible');
        });
      });
    }

    // Marca do ponteiro sobre o corte do terreno.
    marcaDoCaminho.hidden = lugarMarcado === null;
    if (lugarMarcado) {
      const t = naTela(lugarMarcado);
      marcaDoCaminho.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)`;
    }

    // Marca provisória do lugar da busca de endereço.
    marcaDoLugar.hidden = lugarDaBusca === null;
    if (lugarDaBusca) {
      const t = naTela(lugarDaBusca);
      marcaDoLugar.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)`;
    }
  }

  /** Tira a marca do lugar da busca. Com `avisar`, conta a quem a pediu que ela se foi. */
  function tirarOLugar(avisar: boolean): void {
    const aviso = aoEncerrarOLugar;
    lugarDaBusca = null;
    aoEncerrarOLugar = undefined;
    marcaDoLugar.hidden = true;
    if (avisar) aviso?.();
  }
  isolarDoMapa(marcaDoLugar);
  const porPontoNoLugar = (tipo: PontoLora['tipo']): void => {
    const lugar = lugarDaBusca;
    if (!lugar) return;
    // A ação normal de adicionar ponto: um passo do desfazer, com o nome padrão (o nome do resultado não entra no projeto).
    const id = acoesLora.adicionarPonto(Math.min(85, Math.max(-85, lugar.lat)), lugar.lon, tipo);
    tirarOLugar(true);
    definirFerramenta(null);
    acoesLora.selecionar({ tipo: 'ponto', id });
  };
  botaoCasaDoLugar.addEventListener('click', () => porPontoNoLugar('casa'));
  botaoRepetidorDoLugar.addEventListener('click', () => porPontoNoLugar('repetidor'));
  botaoFecharOLugar.addEventListener('click', () => tirarOLugar(true));

  // ---------------------------------------------------------------- Ferramentas
  const botaoDeFerramenta = (id: string, rotulo: string, dica: string): HTMLButtonElement => h('button', { type: 'button', id, title: dica, 'aria-pressed': 'false' }, rotulo);
  const botaoPonto = botaoDeFerramenta('lora-novo-ponto', 'Novo ponto', 'Depois de clicar aqui, clique no mapa onde fica o lugar: uma casa, um sítio');
  const botaoRepetidor = botaoDeFerramenta(
    'lora-novo-repetidor',
    'Novo repetidor',
    'Repetidor é um rádio igual aos outros, posto em lugar alto. Ele não amplifica o sinal: recebe a mensagem inteira e transmite de novo, e por isso precisa fechar enlace com os dois lados. Depois de clicar aqui, clique no mapa onde ele ficaria',
  );
  const botaoLigar = botaoDeFerramenta(
    'lora-ligar',
    'Ligar dois pontos',
    'Cria um enlace: a ligação direta de rádio entre dois pontos, sem nada no meio. O simulador calcula se o sinal chega. Clique em um ponto e depois no outro',
  );
  const botaoSugerir = botaoDeFerramenta(
    'lora-sugerir',
    'Sugerir ponto de repetidor',
    'Procura no relevo até cinco lugares altos que fechem enlace com dois pontos. Com um enlace selecionado, usa os dois pontos dele; senão, clique nos dois pontos. Nada é criado: você escolhe depois',
  );
  const botaoEnquadrar = h('button', { type: 'button', id: 'lora-enquadrar', title: 'Ajusta o mapa para mostrar todos os pontos do projeto' }, 'Ver todos');
  const barra = h(
    'div',
    { class: 'lora-ferramentas', role: 'toolbar', 'aria-label': 'Ferramentas do mapa' },
    h('div', { class: 'botoes', role: 'group' }, botaoPonto, botaoRepetidor, botaoLigar, botaoSugerir),
    botaoEnquadrar,
  );
  const dica = h('p', { class: 'lora-dica', id: 'lora-dica', role: 'status' });
  raiz.append(barra, dica);

  function ligarOsDois(): void {
    const p = estadoLora.projeto;
    if (p.pontos.length === 2 && p.enlaces.length === 0) ligar(p.pontos[0]!.id, p.pontos[1]!.id);
  }

  function atualizarFerramentas(): void {
    const p = estadoLora.projeto;
    botaoPonto.setAttribute('aria-pressed', String(ferramenta === 'ponto'));
    botaoRepetidor.setAttribute('aria-pressed', String(ferramenta === 'repetidor'));
    botaoLigar.setAttribute('aria-pressed', String(ferramenta === 'ligar'));
    botaoLigar.disabled = p.pontos.length < 2;
    botaoSugerir.setAttribute('aria-pressed', String(ferramenta === 'sugerir'));
    botaoSugerir.disabled = p.pontos.length < 2;
    botaoEnquadrar.disabled = p.pontos.length === 0;
    raiz.dataset.ferramenta = ferramenta ?? '';

    const doisSoltos = p.pontos.length === 2 && p.enlaces.length === 0;
    const direto = (): HTMLButtonElement => {
      const b = h('button', { type: 'button', id: 'lora-ligar-direto', title: 'Cria o enlace (a ligação de rádio) entre os dois pontos do projeto' }, `Ligar ${p.pontos[0]!.nome} a ${p.pontos[1]!.nome}`);
      b.addEventListener('click', ligarOsDois);
      return b;
    };
    let conteudo: (Node | string)[] = [];
    if (ferramenta === 'ponto') conteudo = ['Clique no mapa onde fica o lugar. Dá para aproximar antes, com a roda do mouse. Esc cancela.'];
    else if (ferramenta === 'repetidor')
      conteudo = ['Clique no mapa onde ficaria o repetidor. Ele é um rádio igual aos outros: não amplifica o sinal, recebe a mensagem inteira e transmite de novo. Escolha um lugar alto, que feche enlace com os dois lados. Esc cancela.'];
    else if (ferramenta === 'sugerir') {
      const origem = p.pontos.find((x) => x.id === origemDaLigacao);
      conteudo = origem
        ? [`Agora clique na outra ponta: o ponto que precisa falar com ${origem.nome}. Esc cancela.`]
        : ['Clique nos dois pontos que precisam se falar: primeiro um, depois o outro. O simulador procura entre eles lugares altos para um repetidor. Esc cancela.'];
    } else if (buscaAtual().estado === 'buscando') conteudo = [`${TEXTO_DA_BUSCA} O andamento e o botão de cancelar estão no painel à direita.`];
    else if (buscaAtual().estado === 'pronta')
      conteudo = ['Os marcadores tracejados com número são sugestões de lugar para um repetidor. Nenhum rádio foi posto ainda: escolha na lista à direita.'];
    else if (ferramenta === 'ligar') {
      const origem = p.pontos.find((x) => x.id === origemDaLigacao);
      if (origem) conteudo = [`Agora clique no ponto que vai falar com ${origem.nome}. Esc cancela.`];
      else if (doisSoltos) conteudo = ['Clique no primeiro ponto e depois no segundo, ou ', direto(), ' Esc cancela.'];
      else conteudo = ['Clique no primeiro ponto e depois no segundo. Esc cancela.'];
    } else if (p.pontos.length === 0) conteudo = ['Comece por "Novo ponto" e clique no mapa onde fica cada lugar que vai ter um rádio.'];
    else if (p.pontos.length === 1) conteudo = ['Marque o segundo lugar com "Novo ponto". Depois é só ligar os dois para ver se o sinal chega.'];
    else if (doisSoltos) conteudo = ['Os dois pontos ainda não estão ligados. ', direto()];
    dica.replaceChildren(...conteudo);
    dica.hidden = conteudo.length === 0;
  }

  function definirFerramenta(nova: Ferramenta): void {
    if (ferramenta === nova && origemDaLigacao === null) return;
    ferramenta = nova;
    origemDaLigacao = null;
    atualizarFerramentas();
    desenhar();
  }

  botaoPonto.addEventListener('click', () => definirFerramenta(ferramenta === 'ponto' ? null : 'ponto'));
  botaoRepetidor.addEventListener('click', () => definirFerramenta(ferramenta === 'repetidor' ? null : 'repetidor'));
  botaoLigar.addEventListener('click', () => definirFerramenta(ferramenta === 'ligar' ? null : 'ligar'));
  botaoSugerir.addEventListener('click', () => {
    if (ferramenta === 'sugerir') {
      definirFerramenta(null);
      return;
    }
    const { projeto, selecao } = estadoLora;
    // Com um enlace selecionado, a busca é entre os dois pontos dele. Com só dois pontos no projeto, não há o que escolher.
    const pontas = selecao?.tipo === 'enlace' ? [selecao.de, selecao.para] : projeto.pontos.length === 2 ? [projeto.pontos[0]!.id, projeto.pontos[1]!.id] : null;
    if (pontas) {
      definirFerramenta(null);
      procurarRepetidor(pontas[0]!, pontas[1]!);
    } else definirFerramenta('sugerir');
  });
  botaoEnquadrar.addEventListener('click', () => enquadrar(true));

  mapa.on('click', (e) => {
    if (ferramenta === 'ponto' || ferramenta === 'repetidor') {
      const tipo = ferramenta === 'repetidor' ? 'repetidor' : 'casa';
      const lugar = e.lngLat.wrap();
      const id = acoesLora.adicionarPonto(Math.min(85, Math.max(-85, lugar.lat)), lugar.lng, tipo);
      definirFerramenta(null);
      acoesLora.selecionar({ tipo: 'ponto', id });
      return;
    }
    if (ferramenta === 'ligar' || ferramenta === 'sugerir') return;
    destacarRota(null);
    if (estadoLora.selecao !== null) acoesLora.selecionar(null);
  });

  // Na ferramenta de ligar, uma linha tracejada acompanha o ponteiro a partir do primeiro ponto.
  mapa.on('mousemove', (e) => {
    const origem = origemDaLigacao === null ? undefined : estadoLora.projeto.pontos.find((p) => p.id === origemDaLigacao);
    if (!origem) return;
    const a = naTela(origem);
    elastico.setAttribute('x1', a.x.toFixed(1));
    elastico.setAttribute('y1', a.y.toFixed(1));
    elastico.setAttribute('x2', e.point.x.toFixed(1));
    elastico.setAttribute('y2', e.point.y.toFixed(1));
    elastico.setAttribute('visibility', 'visible');
  });

  window.addEventListener('keydown', (e) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
    if (e.key === 'Escape' && lugarDaBusca !== null) {
      tirarOLugar(true);
      return;
    }
    if (e.key === 'Escape' && ferramenta !== null) {
      definirFerramenta(null);
      return;
    }
    if (e.key !== 'Delete') return;
    const s = estadoLora.selecao;
    if (!s) return;
    e.preventDefault();
    if (s.tipo === 'ponto') {
      const nome = estadoLora.projeto.pontos.find((p) => p.id === s.id)?.nome ?? 'Ponto';
      acoesLora.removerPonto(s.id);
      mostrarMensagem(`"${nome}" foi apagado. Ctrl+Z traz de volta.`);
    } else {
      acoesLora.desligar(s.de, s.para);
      mostrarMensagem('O enlace foi apagado; os pontos continuam no mapa. Ctrl+Z traz de volta.');
    }
  });

  // ---------------------------------------------------------------- Enquadramento
  function enquadrar(animado: boolean): void {
    const pontos = estadoLora.projeto.pontos;
    if (pontos.length === 0) {
      mapa.fitBounds(BRASIL, { padding: 24, animate: animado });
      return;
    }
    const lons = pontos.map((p) => p.lon);
    const lats = pontos.map((p) => p.lat);
    mapa.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 110, bottom: 70, left: 90, right: 150 }, maxZoom: 13, animate: animado },
    );
  }
  if (temPontos) enquadrar(false);

  // Trocar de projeto (abrir, criar, importar) enquadra o que o projeto novo tem.
  const projetoAberto = (): string | null => acoesLora.listarProjetos().find((p) => p.atual)?.id ?? null;
  let idDoProjeto = projetoAberto();
  assinarLora('projetos', () => {
    const id = projetoAberto();
    if (id === idDoProjeto) return;
    idDoProjeto = id;
    tirarOLugar(true);
    definirFerramenta(null);
    enquadrar(false);
  });

  // ---------------------------------------------------------------- Aviso de privacidade, uma vez
  let avisoVisto = false;
  try {
    avisoVisto = localStorage.getItem(CHAVE_DO_AVISO) === 'sim';
  } catch {
    // Sem acesso ao armazenamento do navegador: o aviso aparece de novo na próxima vez.
  }
  if (!avisoVisto) {
    const entendi = h('button', { type: 'button', id: 'lora-aviso-entendi' }, 'Entendi');
    const aviso = h(
      'section',
      { class: 'lora-aviso-mapa', id: 'lora-aviso-mapa', 'aria-label': 'Aviso de privacidade do mapa' },
      h('h4', null, 'O que o mapa fica sabendo'),
      h('p', null, 'O desenho do mapa vem do OpenStreetMap, um serviço de fora. Ele fica sabendo qual área está na tela, e com muito zoom essa área é pequena. O relevo vem de outro serviço, em blocos de cerca de 18 km, que só revelam a região.'),
      h('p', null, h('strong', null, 'Os pontos que você marca nunca saem deste navegador.')),
      entendi,
    );
    entendi.addEventListener('click', () => {
      try {
        localStorage.setItem(CHAVE_DO_AVISO, 'sim');
      } catch {
        // Idem.
      }
      aviso.remove();
    });
    raiz.append(aviso);
  }

  // ---------------------------------------------------------------- Redesenho
  mapa.on('move', desenhar);
  // Quando o corte do terreno abre ou fecha, o mapa muda de altura. O MapLibre manteria o centro, e tudo pularia na tela;
  // aqui o alto do mapa fica onde estava.
  let alturaDoMapa = caixa.clientHeight;
  mapa.on('resize', () => {
    const altura = caixa.clientHeight;
    if (altura !== alturaDoMapa && alturaDoMapa > 0 && altura > 0) mapa.panBy([0, (altura - alturaDoMapa) / 2], { animate: false });
    alturaDoMapa = altura;
    desenhar();
  });
  assinarLora('projeto', () => {
    atualizarFerramentas();
    desenhar();
  });
  assinarLora('selecao', desenhar);
  assinarCalculo(desenhar);
  assinarBusca(() => {
    atualizarFerramentas();
    desenhar();
  });
  atualizarFerramentas();
  desenhar();

  return {
    telaDoPonto(id) {
      const p = estadoLora.projeto.pontos.find((x) => x.id === id);
      return p ? naJanela(p) : null;
    },
    telaDe: (lat, lon) => naJanela({ lat, lon }),
    centro() {
      const c = mapa.getCenter();
      return { lat: c.lat, lon: c.lng };
    },
    zoom: () => mapa.getZoom(),
    irPara(lat, lon, zoom) {
      mapa.jumpTo({ center: [lon, lat], zoom });
    },
    marcarNoCaminho(lugar) {
      lugarMarcado = lugar;
      desenhar();
    },
    enquadrarCaixa(c, zoomMaximo) {
      mapa.fitBounds(
        [
          [c.oeste, c.sul],
          [c.leste, c.norte],
        ],
        { padding: { top: 130, bottom: 60, left: 40, right: 90 }, maxZoom: zoomMaximo },
      );
    },
    mostrarLugarProvisorio(lugar, aoEncerrar) {
      // Uma marca nova toma o lugar da anterior sem avisar quem pediu: ele já sabe.
      lugarDaBusca = lugar;
      aoEncerrarOLugar = lugar ? aoEncerrar : undefined;
      desenhar();
    },
  };
}
