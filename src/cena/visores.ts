// Visores com números ao vivo: o que cada um mostra e o desenho de cristal líquido.
// Especificação: docs/especificacao/operar.md, seção 7. Tarefa 8.3.
//
// Os números vêm só da saída do passo da simulação (`SaidaPasso`), do catálogo e da corrente de operação dos cabos.
// O visor da bateria mostra a porcentagem e os volts aproximados de repouso (operar.md, seção 7.1): os volts saem da carga,
// por tabela de fabricante, e não de um modelo de tensão sob corrente.

import type { Bateria, Catalogo, Inversor, Item } from '../catalogo/tipos';
import { bateriaPresente, caboInterrompido } from '../nucleo/operacao';
import { tensaoDeRepouso } from '../nucleo/tensaoDeRepouso';
import type { AnaliseCircuito, Dispositivo, Projeto, SaidaPasso } from '../nucleo/tipos';
import type { Pincel } from './estampas';

/** Medidas do desenho do visor, em pontos. A proporção é a dos visores pintados nas peças. */
export const VISOR_LARGURA_PX = 288;
export const VISOR_ALTURA_PX = 160;

export interface ConteudoDoVisor {
  /** Falso: visor escuro, sem números. */
  aceso: boolean;
  /** De cima para baixo. Vazio com o visor apagado. */
  linhas: string[];
  /** A primeira linha é um aviso de falha: sai em negativo (letras claras em faixa escura). */
  alerta: boolean;
  /** Bateria: carga de 0 a 1, desenhada também em cinco barras. Nulo nas outras peças. */
  barras: number | null;
}

/** O que os visores leem a cada atualização. */
export interface LeituraDosVisores {
  projeto: Projeto;
  catalogo: Catalogo;
  /** Análise do que está energizado agora. */
  viva: AnaliseCircuito;
  saida: SaidaPasso;
  /** Corrente de operação de cada cabo, em ampères. */
  correntes: ReadonlyMap<string, number>;
}

const APAGADO: ConteudoDoVisor = { aceso: false, linhas: [], alerta: false, barras: null };

/** Número escrito como no Brasil, com as casas dadas: 37,2. */
function numero(valor: number, casas: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Soma da corrente de operação dos cabos ligados em um terminal da peça. Nulo se não há cabo nele. */
function correnteNoTerminal(l: LeituraDosVisores, uid: string, terminal: string): number | null {
  let soma: number | null = null;
  for (const c of l.projeto.cabos) {
    const aqui = (c.de.disp === uid && c.de.terminal === terminal) || (c.para.disp === uid && c.para.terminal === terminal);
    if (aqui) soma = (soma ?? 0) + (l.correntes.get(c.uid) ?? 0);
  }
  return soma;
}

/** Há cabo que conduz (sem proteção aberta nem peça queimada) ligado no terminal da peça. */
function temCaboVivo(l: LeituraDosVisores, uid: string, terminal: string): boolean {
  return l.projeto.cabos.some((c) =>
    ((c.de.disp === uid && c.de.terminal === terminal) || (c.para.disp === uid && c.para.terminal === terminal)) && !caboInterrompido(c, l.projeto, l.catalogo));
}

const ampere = (a: number | null): string => (a === null ? '— A' : `${numero(a, 1)} A`);

function doControlador(d: Dispositivo, l: LeituraDosVisores): ConteudoDoVisor {
  // Apagado sem bateria presente, ou queimado: o controlador liga sozinho quando recebe bateria.
  if (d.queimado !== undefined || !bateriaPresente(l.projeto, l.catalogo, d.uid)) return APAGADO;
  const sistema = l.viva.sistema;
  const emUso = sistema !== null && sistema.controlador === d.uid && sistema.fileiras.length > 0;
  const s = l.saida;
  // Fora da conta da simulação: sem cabo vivo na entrada das placas, é falta de placas; com cabo, é o controlador que a
  // simulação não acompanha (ela só calcula o que está ligado a um inversor com bateria).
  const comPlacas = temCaboVivo(l, d.uid, 'pvPos') && temCaboVivo(l, d.uid, 'pvNeg');
  const situacao = !emUso ? (comPlacas ? 'em espera' : 'sem placas ligadas')
    : s.pvW > 0 ? 'carregando'
    : s.pvDisponivelW > 0 ? (s.estado.soc >= 0.995 ? 'bateria cheia' : 'em espera')
    : 'sem sol';
  return {
    aceso: true,
    linhas: [`PV ${emUso ? numero(s.pvTensao, 1) : '—'} V`, `carga ${ampere(emUso ? correnteNoTerminal(l, d.uid, 'batPos') : null)}`, situacao],
    alerta: false,
    barras: null,
  };
}

const ORIGEM: Record<SaidaPasso['origem'], string | null> = { rede: 'rede', bateria: 'bateria', solar: 'placas', nenhuma: null };

function doInversor(d: Dispositivo, item: Inversor, l: LeituraDosVisores): ConteudoDoVisor {
  // Apagado quando desligado, sem bateria presente, ou queimado.
  if (d.queimado !== undefined || !d.ligado || !bateriaPresente(l.projeto, l.catalogo, d.uid)) return APAGADO;
  const sistema = l.viva.sistema;
  const emUso = sistema !== null && sistema.inversor === d.uid;
  const s = l.saida;
  const falha = d.falha === 'sobrecarga';
  const origem = emUso ? ORIGEM[s.origem] : null;
  const linhas = [falha ? 'falha: sobrecarga' : origem ? `ligado · ${origem}` : 'ligado'];
  linhas.push(emUso ? `${numero(s.cargaAtendidaW, 0)} W · ${numero((100 * s.cargaAtendidaW) / item.potenciaW, 0)} %` : '— W');
  // Com solar embutido em uso (sem controlador externo), também a tensão das placas e a corrente de carga da bateria.
  if (item.solar && sistema !== null && emUso && sistema.controlador === null && sistema.fileiras.length > 0) {
    const noCabo = correnteNoTerminal(l, d.uid, 'batPos');
    // A corrente do cabo da bateria só é de carga quando a bateria está recebendo.
    const carga = noCabo === null ? null : s.bateriaW > 0 ? noCabo : 0;
    linhas.push(noCabo === null ? `PV ${numero(s.pvTensao, 1)} V` : `PV ${numero(s.pvTensao, 1)} V · ${ampere(carga)}`);
  }
  return { aceso: true, linhas, alerta: falha, barras: null };
}

function daBateria(d: Dispositivo, item: Bateria, l: LeituraDosVisores): ConteudoDoVisor {
  // Nunca apaga: é ajuda do simulador (bateria de chumbo não tem visor).
  const s = l.saida;
  const noBanco = l.viva.sistema?.banco.some((ramo) => ramo.includes(d.uid)) ?? false;
  const w = noBanco ? s.bateriaW : 0;
  const potencia = w >= 0.5 ? `entrando ${numero(w, 0)} W` : w <= -0.5 ? `saindo ${numero(-w, 0)} W` : 'parada · 0 W';
  const t = tensaoDeRepouso(item.quimica, s.estado.soc, item.tensao);
  const volts = `${t.abaixoDaTabela ? '<' : '≈'} ${numero(t.volts, 1)} V`;
  return { aceso: true, linhas: [`${numero(100 * s.estado.soc, 0)} %`, volts, potencia], alerta: false, barras: s.estado.soc };
}

/** O que o visor da peça mostra agora. Nulo para a peça que não tem visor (placa, aparelho, tomada, quadro). */
export function conteudoDoVisor(d: Dispositivo, item: Item, l: LeituraDosVisores): ConteudoDoVisor | null {
  if (item.categoria === 'controlador') return doControlador(d, l);
  if (item.categoria === 'inversor') return doInversor(d, item, l);
  if (item.categoria === 'bateria') return daBateria(d, item, l);
  return null;
}

/** Texto do visor em uma linha só, para a verificação e para quem não enxerga a tela: as linhas separadas por " | ". Vazio se apagado. */
export function textoDoConteudo(c: ConteudoDoVisor): string {
  return c.aceso ? c.linhas.join(' | ') : '';
}

const FONTE = '"Consolas", "Lucida Console", "DejaVu Sans Mono", "Courier New", monospace';
const TINTA = '#0d2a40';

/** Desenha o visor: moldura preta, vidro azulado com os números em tinta escura; apagado, só o vidro escuro. */
export function desenharVisor(g: Pincel, c: ConteudoDoVisor): void {
  const w = VISOR_LARGURA_PX;
  const h = VISOR_ALTURA_PX;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#0a0c0e';
  g.beginPath();
  g.roundRect(0, 0, w, h, 12);
  g.fill();
  const m = 8;
  const lx = w - 2 * m;
  const ly = h - 2 * m;
  if (!c.aceso) {
    // Cristal líquido sem luz de fundo: cinza-esverdeado escuro, com um reflexo fraco.
    g.fillStyle = '#1a211f';
    g.fillRect(m, m, lx, ly);
    const reflexo = g.createLinearGradient(m, m, m + lx * 0.6, m + ly);
    reflexo.addColorStop(0, 'rgba(255,255,255,0.07)');
    reflexo.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = reflexo;
    g.fillRect(m, m, lx, ly);
    return;
  }
  const fundo = g.createLinearGradient(0, m, 0, m + ly);
  fundo.addColorStop(0, '#d2f0ff');
  fundo.addColorStop(1, '#93cbef');
  g.fillStyle = fundo;
  g.fillRect(m, m, lx, ly);
  const n = Math.max(1, c.linhas.length);
  const passo = (ly - 8) / n;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  c.linhas.forEach((linha, i) => {
    const y = m + 4 + passo * (i + 0.5);
    // A primeira linha da bateria é a porcentagem, grande, com as barras ao lado.
    const comBarras = c.barras !== null && i === 0;
    const tamanho = Math.min(passo * (comBarras ? 0.86 : 0.74), 58);
    g.font = `bold ${tamanho}px ${FONTE}`;
    const larguraMax = comBarras ? lx * 0.5 : lx - 20;
    if (c.alerta && i === 0) {
      g.fillStyle = TINTA;
      g.fillRect(m + 4, y - passo / 2 + 2, lx - 8, passo - 4);
      g.fillStyle = '#d2f0ff';
    } else g.fillStyle = TINTA;
    g.fillText(linha, m + 10, y + 1, larguraMax);
    if (comBarras) {
      // Cinco barras: as cheias em tinta, as vazias só no contorno.
      const cheias = Math.max(0, Math.min(5, Math.round((c.barras ?? 0) * 5)));
      const x0 = m + lx * 0.56;
      const lb = (lx * 0.4) / 5;
      const hb = passo * 0.56;
      g.strokeStyle = TINTA;
      g.lineWidth = 2.5;
      for (let k = 0; k < 5; k++) {
        const x = x0 + k * lb;
        if (k < cheias) {
          g.fillStyle = TINTA;
          g.fillRect(x, y - hb / 2, lb - 6, hb);
        } else g.strokeRect(x + 1.25, y - hb / 2 + 1.25, lb - 8.5, hb - 2.5);
      }
    }
  });
}
