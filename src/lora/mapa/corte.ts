// Corte do terreno do enlace selecionado: o chão entre os dois pontos visto de lado, com a linha entre as antenas e a zona de Fresnel.
// Especificação: docs/especificacao/lora.md, seções 4.3 e 7. Só desenha o que o núcleo calculou em `resultado.geometria`.

import { assinarCalculo, situacaoDoEnlace, tentarDeNovo, type SituacaoDoEnlace } from '../calculo';
import { assinarLora, estadoLora } from '../estado';
import { FRACAO_DE_FRESNEL, pontoNoCaminho } from '../nucleo';
import type { Coordenada, PontoDaGeometria } from '../nucleo/tipos';
import { h, num } from '../ui/dom';
import { svg } from './svg';
import { distanciaTexto, PALAVRAS_DO_VEREDITO, tomDaSituacao } from './vereditos';

type Pronto = Extract<SituacaoDoEnlace, { estado: 'pronto' }>;

const MARGEM = { esquerda: 56, direita: 20, cima: 40, baixo: 26 };

/** Passo "redondo" (1, 2 ou 5 vezes uma potência de 10) para um eixo ter perto de `quantos` riscos. */
function passoRedondo(intervalo: number, quantos: number): number {
  const bruto = intervalo / Math.max(1, quantos);
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  return (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia;
}

const metros = (m: number): string => `${num(Math.round(m))} m`;

/** O que acontece em um ponto do caminho, em palavras. */
function folgaEmPalavras(p: PontoDaGeometria): string {
  const precisa = FRACAO_DE_FRESNEL * p.raioDeFresnelM;
  if (p.folgaM < 0) return `O terreno passa ${metros(Math.ceil(-p.folgaM))} acima da linha entre as antenas.`;
  if (p.folgaM < precisa) return `Folga de ${metros(Math.floor(p.folgaM))} até a linha; o sinal precisa de ${metros(Math.ceil(precisa))} livres aqui.`;
  return `Folga de ${metros(Math.floor(p.folgaM))} até a linha; o sinal precisa de ${metros(Math.ceil(precisa))}. Livre.`;
}

export function montarCorteLora(raiz: HTMLElement, mapa: { marcarNoCaminho(lugar: Coordenada | null): void }): void {
  const titulo = h('h3', null, 'Corte do terreno');
  const trecho = h('span', { class: 'lora-corte-trecho' });
  const selo = h('span', { class: 'lora-corte-selo' });
  const frase = h('p', { class: 'lora-corte-frase' });
  const grafico = h('div', { class: 'lora-corte-grafico' });
  const leitura = h('div', { class: 'lora-corte-leitura', hidden: true, role: 'status' });
  const situacaoTexto = h('p', { class: 'lora-corte-situacao' });
  const tentar = h('button', { type: 'button', id: 'lora-corte-tentar' }, 'Tentar de novo');
  const espera = h('div', { class: 'lora-corte-espera', hidden: true }, situacaoTexto, tentar);
  const legenda = h(
    'p',
    { class: 'lora-corte-legenda' },
    h('span', { class: 'l-terreno' }, 'Terreno visto de lado, já com a curva da Terra somada'),
    h('span', { class: 'l-linha' }, 'Linha reta entre as duas antenas'),
    h(
      'span',
      { class: 'l-fresnel', title: 'O sinal de rádio não viaja só pela linha reta: ele ocupa um espaço em forma de charuto em volta dela, a zona de Fresnel. Pelo menos 60% desse espaço precisa ficar sem obstáculo.' },
      'Zona de Fresnel: o espaço em volta da linha que o sinal ocupa. A faixa mais escura (60%) precisa ficar livre',
    ),
    h('span', { class: 'l-nota' }, 'A altura está esticada em relação à distância. O corte mostra o relevo, não prédios nem árvores.'),
  );
  raiz.append(h('div', { class: 'lora-corte-topo' }, titulo, trecho, selo, frase), grafico, espera, legenda);
  grafico.append(leitura);

  tentar.addEventListener('click', () => tentarDeNovo());

  let atual: Pronto | null = null;
  let desenho: SVGElement | null = null;

  function enlaceSelecionado(): { de: string; para: string } | null {
    const s = estadoLora.selecao;
    return s?.tipo === 'enlace' ? { de: s.de, para: s.para } : null;
  }

  function atualizar(): void {
    const enlace = enlaceSelecionado();
    const situacao = enlace ? situacaoDoEnlace(enlace.de, enlace.para) : null;
    const visivel = enlace !== null && situacao !== null;
    if (raiz.hidden === visivel) raiz.hidden = !visivel;
    mapa.marcarNoCaminho(null);
    leitura.hidden = true;
    if (!enlace || !situacao) {
      atual = null;
      return;
    }
    const pontos = estadoLora.projeto.pontos;
    const de = situacao.estado === 'pronto' ? situacao.de : pontos.find((p) => p.id === enlace.de);
    const para = situacao.estado === 'pronto' ? situacao.para : pontos.find((p) => p.id === enlace.para);
    const tom = tomDaSituacao(situacao);
    trecho.textContent = de && para ? `${de.nome} → ${para.nome}` : '';
    selo.dataset.tom = tom;
    selo.textContent = PALAVRAS_DO_VEREDITO[tom];

    if (situacao.estado !== 'pronto') {
      atual = null;
      desenho?.remove();
      desenho = null;
      frase.textContent = '';
      grafico.hidden = true;
      legenda.hidden = true;
      espera.hidden = false;
      espera.classList.toggle('erro', situacao.estado === 'erro');
      situacaoTexto.textContent = situacao.estado === 'erro' ? `Não deu para montar o corte do terreno. ${situacao.mensagem}` : 'Baixando o relevo…';
      tentar.hidden = situacao.estado !== 'erro';
      return;
    }
    atual = situacao;
    trecho.textContent += ` · ${distanciaTexto(situacao.resultado.geometria.distanciaKm)}`;
    frase.textContent = situacao.resultado.texto;
    grafico.hidden = false;
    legenda.hidden = false;
    espera.hidden = true;
    desenharGrafico();
  }

  function desenharGrafico(): void {
    desenho?.remove();
    desenho = null;
    const situacao = atual;
    const largura = grafico.clientWidth;
    const altura = grafico.clientHeight;
    if (!situacao || largura < 200 || altura < 100) return;

    const g = situacao.resultado.geometria;
    const pontos = g.pontos;
    const dTotal = g.distanciaKm;
    const chao = (p: PontoDaGeometria): number => p.altM + p.curvaM;

    // Escalas. A de altitude vai do ponto mais baixo do terreno ao mais alto entre o terreno e as antenas, com uma sobra.
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const p of pontos) {
      minimo = Math.min(minimo, chao(p));
      maximo = Math.max(maximo, chao(p), p.linhaM);
    }
    const sobra = Math.max(10, (maximo - minimo) * 0.2);
    const passoY = passoRedondo(maximo - minimo + 2 * sobra, 4);
    const y0 = Math.floor((minimo - sobra) / passoY) * passoY;
    const y1 = maximo + sobra;
    const esq = MARGEM.esquerda;
    const dir = largura - MARGEM.direita;
    const cima = MARGEM.cima;
    const baixo = altura - MARGEM.baixo;
    const X = (dKm: number): number => esq + (dTotal > 0 ? dKm / dTotal : 0) * (dir - esq);
    const Y = (altM: number): number => baixo - ((altM - y0) / (y1 - y0)) * (baixo - cima);
    const xy = (dKm: number, altM: number): string => `${X(dKm).toFixed(1)},${Y(altM).toFixed(1)}`;

    const raizSvg = svg('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': `Corte do terreno entre ${situacao.de.nome} e ${situacao.para.nome}. ${situacao.resultado.texto}` });
    raizSvg.append(svg('defs', null, svg('clipPath', { id: 'lora-corte-area' }, svg('rect', { x: esq, y: cima, width: dir - esq, height: baixo - cima }))));

    // Eixo de altitude, com linhas de grade.
    const eixos = svg('g', { class: 'corte-eixos' });
    for (let a = Math.ceil(y0 / passoY) * passoY; a <= y1; a += passoY) {
      eixos.append(svg('line', { class: 'corte-grade', x1: esq, x2: dir, y1: Y(a), y2: Y(a) }), svg('text', { x: esq - 6, y: Y(a) + 4, 'text-anchor': 'end' }, metros(a)));
    }
    // Eixo de distância.
    const passoX = passoRedondo(dTotal, Math.max(3, Math.floor((dir - esq) / 90)));
    const casasX = passoX < 1 ? 1 : 0;
    for (let d = 0; d <= dTotal + 1e-9; d += passoX) {
      // O último risco redondo some quando fica colado no fim do enlace.
      if (dTotal - d < passoX * 0.35 && d < dTotal) continue;
      eixos.append(svg('line', { class: 'corte-risco', x1: X(d), x2: X(d), y1: baixo, y2: baixo + 4 }), svg('text', { x: X(d), y: baixo + 17, 'text-anchor': 'middle' }, `${num(d, casasX)} km`));
    }
    eixos.append(svg('line', { class: 'corte-risco', x1: dir, x2: dir, y1: baixo, y2: baixo + 4 }), svg('text', { x: dir, y: baixo + 17, 'text-anchor': 'end', class: 'corte-fim' }, distanciaTexto(dTotal)));
    eixos.append(svg('text', { x: 4, y: cima - 8, class: 'corte-unidade' }, 'altitude'));
    raizSvg.append(eixos);

    const area = svg('g', { 'clip-path': 'url(#lora-corte-area)' });
    raizSvg.append(area);

    // Terreno, já com a curva da Terra.
    const perfil = pontos.map((p) => xy(p.dKm, chao(p))).join(' L');
    area.append(svg('path', { class: 'corte-terreno', d: `M${X(0).toFixed(1)},${baixo} L${perfil} L${X(dTotal).toFixed(1)},${baixo} Z` }));

    // Zona de Fresnel abaixo da linha: a faixa de 60% e o contorno inteiro.
    const ida = pontos.map((p) => xy(p.dKm, p.linhaM)).join(' L');
    const volta = (fracao: number): string =>
      [...pontos]
        .reverse()
        .map((p) => xy(p.dKm, p.linhaM - fracao * p.raioDeFresnelM))
        .join(' L');
    area.append(
      svg('path', { class: 'corte-fresnel-inteira', d: `M${ida} L${volta(1)} Z` }),
      svg('path', { class: 'corte-fresnel-60', d: `M${ida} L${volta(FRACAO_DE_FRESNEL)} Z` }),
      svg('path', { class: 'corte-fresnel-contorno', d: `M${volta(1)}` }),
      svg('path', { class: 'corte-terreno-borda', d: `M${perfil}` }),
      svg('path', { class: 'corte-linha', d: `M${ida}` }),
    );

    // Antenas: o mastro na altura real (na escala do gráfico) e uma bolinha no alto, para aparecer mesmo quando o mastro é curto.
    const inicio = pontos[0]!;
    const fim = pontos[pontos.length - 1]!;
    const antena = (p: PontoDaGeometria, topoM: number, nome: string, alturaM: number, ancora: 'start' | 'end'): SVGElement => {
      const x = X(p.dKm);
      const xTexto = ancora === 'start' ? esq : dir;
      return svg(
        'g',
        { class: 'corte-antena' },
        svg('line', { x1: x, x2: x, y1: Y(chao(p)), y2: Y(topoM) }),
        svg('circle', { cx: x, cy: Y(topoM), r: 4 }),
        svg('text', { class: 'corte-nome', x: xTexto, y: 14, 'text-anchor': ancora }, nome),
        svg('text', { class: 'corte-altura', x: xTexto, y: 28, 'text-anchor': ancora }, `antena a ${num(alturaM, Number.isInteger(alturaM) ? 0 : 1)} m do chão · terreno a ${metros(p.altM)}`),
      );
    };
    raizSvg.append(antena(inicio, g.antenaInicioM, situacao.de.nome, situacao.de.alturaDaAntenaM, 'start'), antena(fim, g.antenaFimM, situacao.para.nome, situacao.para.alturaDaAntenaM, 'end'));

    // Pior ponto: onde o terreno chega mais perto da linha (ou passa dela).
    const pior = g.piorPonto;
    if (pior) {
      const x = X(pior.dKm);
      const corta = pior.folgaM < 0;
      const apertado = pior.folgaM < FRACAO_DE_FRESNEL * pior.raioDeFresnelM;
      const texto = corta
        ? `Pior ponto: o terreno corta a linha em ${metros(Math.ceil(-pior.folgaM))}`
        : apertado
          ? `Pior ponto: o terreno fica a ${metros(Math.floor(pior.folgaM))} da linha; precisa de ${metros(Math.ceil(FRACAO_DE_FRESNEL * pior.raioDeFresnelM))}`
          : `Ponto mais apertado: ${metros(Math.floor(pior.folgaM))} livres; o sinal precisa de ${metros(Math.ceil(FRACAO_DE_FRESNEL * pior.raioDeFresnelM))}`;
      const yTopo = Math.min(Y(chao(pior)), Y(pior.linhaM));
      const yTexto = Math.max(cima + 4, yTopo - 10);
      const ancora = x < esq + 190 ? 'start' : x > dir - 190 ? 'end' : 'middle';
      raizSvg.append(
        svg(
          'g',
          { class: `corte-pior${apertado ? ' ruim' : ''}` },
          svg('line', { x1: x, x2: x, y1: Y(chao(pior)), y2: Y(pior.linhaM) }),
          svg('circle', { cx: x, cy: Y(chao(pior)), r: 4.5 }),
          svg('text', { x: ancora === 'start' ? x + 8 : ancora === 'end' ? x - 8 : x, y: yTexto, 'text-anchor': ancora }, texto),
        ),
      );
    }

    // Leitura com o ponteiro: uma linha vertical, e a marca do mesmo lugar no mapa.
    const guia = svg('g', { class: 'corte-guia', visibility: 'hidden' }, svg('line', { y1: cima, y2: baixo }), svg('circle', { class: 'no-terreno', r: 4 }), svg('circle', { class: 'na-linha', r: 3 }));
    const alvo = svg('rect', { class: 'corte-alvo', x: esq, y: cima, width: dir - esq, height: baixo - cima });
    raizSvg.append(guia, alvo);
    alvo.addEventListener('pointermove', (e) => {
      const caixa = raizSvg.getBoundingClientRect();
      const dKm = (((e as PointerEvent).clientX - caixa.left - esq) / (dir - esq)) * dTotal;
      let p = pontos[0]!;
      for (const q of pontos) if (Math.abs(q.dKm - dKm) < Math.abs(p.dKm - dKm)) p = q;
      const x = X(p.dKm);
      guia.setAttribute('visibility', 'visible');
      guia.querySelector('line')!.setAttribute('x1', String(x));
      guia.querySelector('line')!.setAttribute('x2', String(x));
      const noTerreno = guia.querySelector('.no-terreno')!;
      noTerreno.setAttribute('cx', String(x));
      noTerreno.setAttribute('cy', String(Y(chao(p))));
      const naLinha = guia.querySelector('.na-linha')!;
      naLinha.setAttribute('cx', String(x));
      naLinha.setAttribute('cy', String(Y(p.linhaM)));
      leitura.replaceChildren(
        h('strong', null, `A ${distanciaTexto(p.dKm)} de ${situacao.de.nome}`),
        h('span', null, `Terreno a ${metros(p.altM)} de altitude.`),
        h('span', { 'data-folga': p.folgaM < 0 ? 'corta' : p.folgaM < FRACAO_DE_FRESNEL * p.raioDeFresnelM ? 'apertado' : 'livre' }, folgaEmPalavras(p)),
      );
      leitura.hidden = false;
      const paraDireita = x < (esq + dir) / 2;
      leitura.style.left = paraDireita ? `${x + 12}px` : '';
      leitura.style.right = paraDireita ? '' : `${largura - x + 12}px`;
      mapa.marcarNoCaminho(pontoNoCaminho(situacao.de, situacao.para, dTotal > 0 ? p.dKm / dTotal : 0));
    });
    alvo.addEventListener('pointerleave', () => {
      guia.setAttribute('visibility', 'hidden');
      leitura.hidden = true;
      mapa.marcarNoCaminho(null);
    });

    grafico.append(raizSvg);
    desenho = raizSvg;
  }

  new ResizeObserver(() => {
    if (atual) desenharGrafico();
  }).observe(grafico);
  assinarLora('selecao', atualizar);
  assinarLora('projeto', atualizar);
  assinarCalculo(atualizar);
  atualizar();
}
