// Aba Sistema: gráfico da bateria ao longo do tempo (canvas 2D) e controles do projeto (prioridade e tensão da rede).
// Tarefa 3.5. O gráfico lê `estado.simulacao.historico` (últimas 48 h) e redesenha no máximo 4 vezes por segundo.

import { CATALOGO } from '../catalogo';
import { acoes, assinar, estado, horaLocalDe } from '../estado';
import { infoBanco } from '../nucleo/eletrica';
import { localDoProjeto } from '../nucleo/irradiancia';
import type { Prioridade } from '../nucleo/tipos';
import { el, h, num } from './formato';

const ALTURA = 170;
const MARGEM = { esq: 34, dir: 8, topo: 8, base: 20 };
const INTERVALO_MS = 250;
const LACUNA_MS = 25 * 60_000;
const PASSOS_HORAS = [1, 2, 3, 6, 12, 24];

const COR = {
  bateria: '#1b7f3b',
  queda: 'rgba(198, 40, 40, 0.14)',
  minimo: '#c62828',
  geracao: 'rgba(239, 160, 0, 0.35)',
  consumo: 'rgba(21, 101, 192, 0.30)',
  grade: '#e3e8ed',
  texto: '#5f6c7b',
};

function nomeDoDia(msUtc: number): string {
  const d = new Date(msUtc + (localDoProjeto(estado.projeto)?.fuso ?? 0) * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function horaRotulo(msUtc: number): string {
  const hora = Math.round(horaLocalDe(estado.projeto, msUtc)) % 24;
  return hora === 0 ? nomeDoDia(msUtc) : `${hora} h`;
}

/** Instantes de marcação do eixo, nas horas cheias locais, em passo escolhido para caber uns 6 rótulos. */
function marcas(inicio: number, fim: number): number[] {
  const horas = (fim - inicio) / 3_600_000;
  const passo = PASSOS_HORAS.find((p) => horas / p <= 6) ?? 24;
  const deslocamento = horaLocalDe(estado.projeto, inicio) % passo;
  let t = inicio + ((passo - deslocamento) % passo) * 3_600_000;
  t = Math.ceil((t - 1) / 3_600_000) * 3_600_000;
  const lista: number[] = [];
  while (t <= fim) {
    lista.push(t);
    t += passo * 3_600_000;
  }
  return lista;
}

export function montarGrafico(): void {
  const canvas = h('canvas', { id: 'grafico-bateria', height: String(ALTURA), role: 'img', 'aria-label': 'Carga da bateria ao longo do tempo' });
  const vazio = h('p', { class: 'vazio', id: 'grafico-vazio' }, 'Acelere o tempo ou simule uma queda de luz para ver a bateria ao longo do dia.');
  const legenda = h(
    'p',
    { class: 'legenda-grafico', id: 'grafico-legenda' },
    h('span', { class: 'l-bateria' }, 'Carga da bateria (%)'),
    h('span', { class: 'l-geracao' }, 'Geração (W)'),
    h('span', { class: 'l-consumo' }, 'Consumo (W)'),
    h('span', { class: 'l-queda' }, 'Queda de luz'),
    h('span', { class: 'l-minimo' }, 'Carga mínima'),
  );
  const caixa = h('div', { class: 'caixa-grafico' }, canvas, vazio);
  el('#sistema-grafico').replaceChildren(h('h4', null, 'Bateria ao longo do tempo'), caixa, legenda);

  const ctx = canvas.getContext('2d');

  const desenhar = (): void => {
    const hist = estado.simulacao.historico;
    const vazioAgora = hist.length < 2;
    vazio.hidden = !vazioAgora;
    canvas.hidden = vazioAgora;
    legenda.hidden = vazioAgora;
    canvas.dataset.pontos = String(hist.length);
    if (vazioAgora || !ctx || caixa.offsetParent === null) return;

    const dpr = window.devicePixelRatio || 1;
    const largura = Math.max(200, Math.floor(caixa.clientWidth));
    if (canvas.width !== Math.round(largura * dpr) || canvas.height !== Math.round(ALTURA * dpr)) {
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(ALTURA * dpr);
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${ALTURA}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largura, ALTURA);

    const x0 = MARGEM.esq;
    const x1 = largura - MARGEM.dir;
    const y0 = MARGEM.topo;
    const y1 = ALTURA - MARGEM.base;
    const inicio = hist[0]!.msUtc;
    const fim = Math.max(hist[hist.length - 1]!.msUtc, inicio + 3_600_000);
    const X = (t: number): number => x0 + ((t - inicio) / (fim - inicio)) * (x1 - x0);
    const Y = (soc: number): number => y1 - soc * (y1 - y0);

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Grade e eixo da carga.
    ctx.strokeStyle = COR.grade;
    ctx.fillStyle = COR.texto;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(x0, Math.round(Y(p)) + 0.5);
      ctx.lineTo(x1, Math.round(Y(p)) + 0.5);
      ctx.stroke();
      ctx.fillText(`${p * 100}%`, x0 - 4, Y(p));
    }

    // Trecho em queda de luz.
    ctx.fillStyle = COR.queda;
    for (let i = 1; i < hist.length; i++) {
      const b = hist[i]!;
      if (!b.semRede) continue;
      const a = hist[i - 1]!;
      const de = b.msUtc - a.msUtc > LACUNA_MS ? b.msUtc - 10 * 60_000 : a.msUtc;
      ctx.fillRect(X(de), y0, Math.max(1, X(b.msUtc) - X(de)), y1 - y0);
    }

    // Geração e consumo em W, em tom claro, na parte de baixo.
    const maxW = Math.max(100, ...hist.map((p) => Math.max(p.pvW, p.cargaW)));
    const altura = (y1 - y0) * 0.4;
    const area = (valor: (p: (typeof hist)[number]) => number, cor: string): void => {
      ctx.fillStyle = cor;
      let aberto = false;
      let ultimoX = x0;
      for (let i = 0; i <= hist.length; i++) {
        const p = hist[i];
        const quebra = !p || (i > 0 && p.msUtc - hist[i - 1]!.msUtc > LACUNA_MS);
        if (aberto && quebra) {
          ctx.lineTo(ultimoX, y1);
          ctx.closePath();
          ctx.fill();
          aberto = false;
        }
        if (!p) break;
        const x = X(p.msUtc);
        const y = y1 - (valor(p) / maxW) * altura;
        if (!aberto) {
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y);
          aberto = true;
        } else ctx.lineTo(x, y);
        ultimoX = x;
      }
    };
    area((p) => p.pvW, COR.geracao);
    area((p) => p.cargaW, COR.consumo);
    ctx.fillStyle = COR.texto;
    ctx.textAlign = 'left';
    ctx.fillText(`${num(maxW)} W`, x0 + 3, y1 - altura - 5);

    // Carga mínima da bateria.
    const sistema = estado.derivados.analise.sistema;
    const banco = sistema ? infoBanco(sistema, estado.projeto, CATALOGO) : null;
    if (banco) {
      ctx.save();
      ctx.strokeStyle = COR.minimo;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, Y(banco.socMin));
      ctx.lineTo(x1, Y(banco.socMin));
      ctx.stroke();
      ctx.restore();
    }

    // Linha da carga da bateria.
    ctx.strokeStyle = COR.bateria;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    hist.forEach((p, i) => {
      const novo = i === 0 || p.msUtc - hist[i - 1]!.msUtc > LACUNA_MS;
      if (novo) ctx.moveTo(X(p.msUtc), Y(p.soc));
      else ctx.lineTo(X(p.msUtc), Y(p.soc));
    });
    ctx.stroke();

    // Eixo das horas.
    ctx.fillStyle = COR.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of marcas(inicio, fim)) {
      const x = X(t);
      ctx.fillText(horaRotulo(t), Math.min(x1 - 8, Math.max(x0 + 8, x)), y1 + 5);
      ctx.strokeStyle = COR.texto;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y1);
      ctx.lineTo(Math.round(x) + 0.5, y1 + 3);
      ctx.stroke();
    }
  };

  // No máximo 4 desenhos por segundo.
  let ultimo = 0;
  let espera: ReturnType<typeof setTimeout> | null = null;
  const agendar = (): void => {
    const agora = performance.now();
    if (agora - ultimo >= INTERVALO_MS) {
      ultimo = agora;
      desenhar();
    } else if (!espera) {
      espera = setTimeout(() => {
        espera = null;
        ultimo = performance.now();
        desenhar();
      }, INTERVALO_MS - (agora - ultimo));
    }
  };
  assinar('simulacao', agendar);
  assinar('derivados', agendar);
  document.querySelector('[data-aba="sistema"]')?.addEventListener('click', () => setTimeout(desenhar, 0));
  window.addEventListener('resize', agendar);
  desenhar();

  montarControlesDoProjeto();
}

const PRIORIDADES: { valor: Prioridade; rotulo: string; frase: string }[] = [
  {
    valor: 'rede',
    rotulo: 'Rede primeiro',
    frase: 'Com a rede ligada, os aparelhos usam a rede da rua e as placas carregam a bateria. A bateria fica cheia para a queda de luz.',
  },
  {
    valor: 'solar',
    rotulo: 'Solar primeiro',
    frase: 'Os aparelhos usam as placas e a bateria. O inversor só puxa da rede quando a bateria chega perto do mínimo, e volta para a bateria quando ela recupera.',
  },
];

function montarControlesDoProjeto(): void {
  const botoesPrioridade = PRIORIDADES.map((p) => {
    const b = h('button', { type: 'button', 'data-prioridade': p.valor }, p.rotulo);
    b.addEventListener('click', () => acoes.definirPrioridade(p.valor));
    return b;
  });
  const frase = h('p', { class: 'detalhe', id: 'frase-prioridade' });
  const botoesTensao = ([127, 220] as const).map((v) => {
    const b = h('button', { type: 'button', 'data-tensao-rede': String(v) }, `${v} V`);
    b.addEventListener('click', () => acoes.definirTensaoDaRede(v));
    return b;
  });

  el('#sistema-projeto').replaceChildren(
    h('h4', null, 'Como o sistema usa a energia'),
    h('div', { class: 'botoes', role: 'group', 'aria-label': 'Prioridade' }, ...botoesPrioridade),
    frase,
    h('h4', null, 'Tensão da rede'),
    h('div', { class: 'botoes', role: 'group', 'aria-label': 'Tensão da rede' }, ...botoesTensao),
    h('p', { class: 'detalhe' }, 'É a tensão das tomadas da rua. O inversor e os aparelhos precisam ser da mesma tensão; as tomadas da casa do Rio são de 127 V.'),
  );

  const desenhar = (): void => {
    botoesPrioridade.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.prioridade === estado.projeto.prioridade)));
    botoesTensao.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.tensaoRede) === estado.projeto.tensaoRede)));
    const atual = PRIORIDADES.find((p) => p.valor === estado.projeto.prioridade);
    const texto = atual?.frase ?? '';
    if (frase.textContent !== texto) frase.textContent = texto;
  };
  assinar('projeto', desenhar);
  desenhar();
}
