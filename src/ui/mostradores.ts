// Mostradores ao vivo (Sol, Consumo, Bateria, Rede), faixa "A bateria acabou às..." e botões da queda de luz.
// Tarefa 3.5. Especificação: docs/especificacao/cena-e-interface.md, seções 11 e 12.
// O DOM é criado uma vez; a cada evento 'simulacao' só trocam textos, larguras e classes.

import { acoes, assinar, estado, horaLocalDe } from '../estado';
import { infoBanco } from '../nucleo/eletrica';
import { localDoProjeto } from '../nucleo/irradiancia';
import { posicaoSol } from '../nucleo/sol';
import { CATALOGO } from '../catalogo';
import type { AvisoPasso, OrigemEnergia } from '../nucleo/tipos';
import { el, h, num } from './formato';

const AVISOS: Record<AvisoPasso, string> = {
  'sem-bateria': 'Falta a bateria: sem ela o inversor não tem de onde tirar energia.',
  'placas-tensao-baixa': 'Placas com tensão baixa: o inversor não consegue aproveitar a energia delas. Ligue mais placas em série.',
  'placas-tensao-alta': 'Placas com tensão alta demais para o inversor: risco de queimar. Ligue menos placas em série.',
  'placas-limitadas': 'As placas poderiam gerar mais do que o inversor aceita: parte da geração é descartada.',
  sobrecarga: 'Sobrecarga: os aparelhos pedem mais do que o inversor aguenta. Desligue algum.',
  bms: 'A proteção da bateria cortou: os aparelhos pedem mais corrente do que ela pode dar.',
  'bateria-vazia': 'Bateria vazia: o inversor desligou para proteger a bateria.',
};

const ORIGENS: Record<OrigemEnergia, string> = {
  rede: 'A energia vem da rede da rua.',
  bateria: 'A energia vem da bateria.',
  solar: 'A energia vem das placas solares.',
  nenhuma: 'Nenhuma fonte está alimentando a casa agora.',
};

export function horaTexto(msUtc: number): string {
  const hora = horaLocalDe(estado.projeto, msUtc);
  const minutos = Math.floor(hora * 60 + 1e-6);
  return `${String(Math.floor(minutos / 60) % 24).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** "7 h 10 min", "45 min" ou "3 h". */
export function duracaoTexto(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const hs = Math.floor(total / 60);
  const mn = total % 60;
  if (hs === 0) return `${mn} min`;
  return mn === 0 ? `${hs} h` : `${hs} h ${mn} min`;
}

/** Watts com o separador brasileiro; "—" quando o núcleo não devolveu um número (passo de duração zero com a bateria cheia). */
function watts(n: number): string {
  return Number.isFinite(n) ? `${num(n)} W` : '—';
}

function trocarTexto(e: HTMLElement, texto: string): void {
  if (e.textContent !== texto) e.textContent = texto;
}

function mostrador(id: string, rotulo: string, extra?: HTMLElement): { raiz: HTMLElement; valor: HTMLElement; nota: HTMLElement } {
  const valor = h('strong', { class: 'm-valor' });
  const nota = h('span', { class: 'm-nota' });
  const raiz = h('div', { class: 'mostrador', id }, h('span', { class: 'm-rotulo' }, rotulo), valor, extra, nota);
  return { raiz, valor, nota };
}

export function montarMostradores(): void {
  // ---- Mostradores no alto da coluna da direita.
  const sol = mostrador('m-sol', 'Sol');
  sol.raiz.title = 'Potência das placas que o sistema está aproveitando agora. Com a bateria cheia, as placas só entregam o que os aparelhos pedem; se os aparelhos estão na rede, ficam em espera.';
  const consumo = mostrador('m-consumo', 'Consumo');
  const barraPreenchida = h('span', { class: 'barra-cheia' });
  const barra = h('span', { class: 'barra', role: 'progressbar', 'aria-label': 'Carga da bateria', 'aria-valuemin': '0', 'aria-valuemax': '100' }, barraPreenchida);
  const bateria = mostrador('m-bateria', 'Bateria', barra);
  const rede = mostrador('m-rede', 'Rede');
  const origem = h('p', { class: 'm-origem', id: 'm-origem' });
  const avisos = h('ul', { class: 'm-avisos', id: 'm-avisos' });
  const secao = h(
    'section',
    { id: 'mostradores', 'aria-label': 'Mostradores ao vivo' },
    h('div', { class: 'm-grade' }, sol.raiz, consumo.raiz, bateria.raiz, rede.raiz),
    origem,
    avisos,
  );
  const direita = el('#direita');
  direita.insertBefore(secao, direita.firstChild);

  // ---- Faixa sobre a cena quando a bateria acaba na queda de luz.
  const faixa = h('p', { id: 'faixa-queda', class: 'faixa-queda', role: 'status', hidden: true });
  el('#centro').append(faixa);

  // ---- Botões da barra de tempo.
  const botaoQueda = el<HTMLButtonElement>('#botao-queda');
  const botaoCheia = el<HTMLButtonElement>('#botao-bateria-cheia');
  botaoQueda.addEventListener('click', () => acoes.alternarQuedaDeLuz());
  botaoCheia.addEventListener('click', () => acoes.recarregarBateria());

  let chaveAvisos = '';

  const desenhar = (): void => {
    const sim = estado.simulacao;
    const s = sim.saida;
    const queda = sim.quedaDeLuz;
    const sistema = estado.derivados.analise.sistema;
    const banco = sistema ? infoBanco(sistema, estado.projeto, CATALOGO) : null;

    trocarTexto(sol.valor, watts(s.pvW));
    // O número é o que o sistema aproveita das placas, não o que elas poderiam dar: com a bateria cheia e os aparelhos
    // na rede, ele fica em zero mesmo ao meio-dia. A nota diz o motivo, para o zero não parecer defeito.
    const local = localDoProjeto(estado.projeto);
    const solNoCeu = local ? posicaoSol(estado.tempo.msUtc, local.lat, local.lon).elevacao > 3 : false;
    let notaDoSol: string;
    if (!Number.isFinite(s.pvW)) notaDoSol = 'calculando';
    else if (s.pvW > 0) notaDoSol = 'aproveitados agora';
    else if (!sistema || sistema.fileiras.length === 0) notaDoSol = 'sem placas ligadas';
    else if (s.avisos.includes('placas-tensao-baixa')) notaDoSol = 'tensão das placas baixa';
    else if (s.avisos.includes('placas-tensao-alta')) notaDoSol = 'tensão das placas alta demais';
    else if (!solNoCeu) notaDoSol = 'sem sol agora';
    else if (sim.estadoSim.soc >= 0.995 && !sim.estadoSim.cortado) {
      // As placas poderiam entregar, mas não há para onde mandar: mostra quanto está disponível.
      notaDoSol = s.pvDisponivelW > 0 ? `bateria cheia: ${watts(s.pvDisponivelW)} disponíveis, em espera` : 'bateria cheia: placas em espera';
    }
    else notaDoSol = 'sem geração agora';
    trocarTexto(sol.nota, notaDoSol);

    if (s.cargaPedidaW > 0 && s.cargaAtendidaW <= 0) {
      trocarTexto(consumo.valor, 'desligado');
      trocarTexto(consumo.nota, `pedem ${num(s.cargaPedidaW)} W`);
    } else {
      trocarTexto(consumo.valor, `${num(s.cargaAtendidaW)} W`);
      trocarTexto(
        consumo.nota,
        s.cargaPedidaW > s.cargaAtendidaW + 0.5 ? `de ${num(s.cargaPedidaW)} W pedidos` : s.cargaAtendidaW > 0 ? 'atendidos' : 'nenhum aparelho em uso',
      );
    }
    consumo.raiz.classList.toggle('desligado', s.cargaPedidaW > 0 && s.cargaAtendidaW <= 0);

    const tem = sistema !== null && banco !== null;
    // A carga vem do estado da simulação, que é sempre um número; a da saída pode faltar em um passo de duração zero.
    const soc = sim.estadoSim.soc;
    const pct = Math.round(soc * 100);
    let cor = 'verde';
    if (!tem) cor = 'nenhuma';
    else if (soc <= (banco?.socMin ?? 0.1) + 0.1) cor = 'vermelha';
    else if (soc <= 0.5) cor = 'amarela';
    barraPreenchida.style.width = `${tem ? pct : 0}%`;
    barra.setAttribute('aria-valuenow', String(tem ? pct : 0));
    bateria.raiz.dataset.cor = cor;
    if (!tem) {
      trocarTexto(bateria.valor, 'nenhuma');
      trocarTexto(bateria.nota, 'falta uma bateria ligada ao inversor');
    } else {
      trocarTexto(bateria.valor, `${num(pct)} %`);
      const bw = Number.isFinite(s.bateriaW) ? s.bateriaW : 0;
      const seta = bw > 1 ? '▲ carregando' : bw < -1 ? '▼ descarregando' : 'parada';
      trocarTexto(bateria.nota, Math.abs(bw) > 1 ? `${seta} ${num(Math.abs(bw))} W` : seta);
    }

    let textoRede: string;
    if (queda.ativa) textoRede = 'em queda';
    else if (sistema?.redeLigada) textoRede = 'ligada';
    else textoRede = 'não ligada';
    trocarTexto(rede.valor, textoRede);
    rede.raiz.dataset.estado = queda.ativa ? 'queda' : sistema?.redeLigada ? 'ligada' : 'solta';
    trocarTexto(rede.nota, queda.ativa ? 'sem luz na rua' : sistema?.redeLigada ? (Number.isFinite(s.redeW) && s.redeW > 1 ? `puxando ${num(s.redeW)} W` : 'disponível') : 'falta o cabo da tomada da rede até o inversor');

    trocarTexto(origem, ORIGENS[s.origem]);
    origem.dataset.origem = s.origem;

    // O núcleo avisa "bateria vazia" só no passo em que ela esvazia; enquanto o inversor segue cortado, o aviso continua.
    const lista: AvisoPasso[] = sim.estadoSim.cortado && !s.avisos.includes('bateria-vazia') ? [...s.avisos, 'bateria-vazia'] : s.avisos;
    const chave = lista.join('|');
    if (chave !== chaveAvisos) {
      chaveAvisos = chave;
      avisos.replaceChildren(...lista.map((a) => h('li', { 'data-aviso': a }, AVISOS[a])));
    }
    avisos.hidden = lista.length === 0;

    // Botões da barra de tempo.
    trocarTexto(botaoQueda, queda.ativa ? 'Luz voltou' : 'Queda de luz');
    botaoQueda.setAttribute('aria-pressed', String(queda.ativa));
    botaoQueda.classList.toggle('queda-ativa', queda.ativa);

    // Faixa sobre a cena.
    if (queda.ativa && queda.apagouMsUtc !== null && queda.inicioMsUtc !== null) {
      faixa.hidden = false;
      trocarTexto(faixa, `A bateria acabou às ${horaTexto(queda.apagouMsUtc)}, depois de ${duracaoTexto(queda.apagouMsUtc - queda.inicioMsUtc)} sem luz.`);
    } else if (!faixa.hidden) {
      faixa.hidden = true;
    }
  };

  assinar('simulacao', desenhar);
  desenhar();
}
