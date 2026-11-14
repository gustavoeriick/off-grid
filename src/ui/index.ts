// Interface: liga os controles da tela ao estado. Tarefa 1.13.
// Especificação: docs/especificacao/cena-e-interface.md, seções 1 e 12.

import { acoes, assinar, estado, type ModoVisao } from '../estado';
import { localPorId } from '../nucleo/irradiancia';
import type { CasaConfig, Clima, Varanda } from '../nucleo/tipos';
import { montarCatalogo } from './catalogo';
import { montarPaineis } from './paineis';
import { montarSelecionado } from './selecionado';
import { montarTopo } from './topo';
import { LADOS, LIMITES_VARANDA, avisoDoQuartinho, deslocamentoMaximo, inclinacaoMaxima, limitarVaranda, limitarVarandas, medidaDaFachada, novaVaranda, profundidadeMaxima } from './varandas';

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
/** Fuso do local do projeto, em ms (o Rio fica em UTC − 3). Vem do núcleo, não é escrito aqui. */
const DESLOCAMENTO_RIO_MS = (localPorId(estado.projeto.localId)?.fuso ?? -3) * MS_HORA;
const ANO = 2026;
const INICIO_ANO_MS = Date.UTC(ANO, 0, 1, 3, 0, 0);
const FIM_ANO_MS = Date.UTC(ANO + 1, 0, 1, 3, 0, 0);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function el<T extends HTMLElement>(seletor: string): T {
  const e = document.querySelector<T>(seletor);
  if (!e) throw new Error(`Elemento não encontrado: ${seletor}`);
  return e;
}

/** Data e hora locais do Rio a partir do instante UTC. */
function localDoRio(msUtc: number) {
  const d = new Date(msUtc + DESLOCAMENTO_RIO_MS);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function diasNoMes(mes: number): number {
  return new Date(Date.UTC(ANO, mes + 1, 0)).getUTCDate();
}

function msUtcDe(mes: number, dia: number, minutos: number): number {
  return Date.UTC(ANO, mes, dia, 0, 0, 0) - DESLOCAMENTO_RIO_MS + minutos * 60_000;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

function numeroDe(campo: HTMLInputElement): number | null {
  if (campo.value.trim() === '') return null;
  const v = Number(campo.value.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const min = campo.min === '' ? -Infinity : Number(campo.min);
  const max = campo.max === '' ? Infinity : Number(campo.max);
  return Math.min(max, Math.max(min, v));
}

export function montarInterface(): void {
  montarVisao();
  montarTempo();
  montarClimaERotacao();
  montarFormularioCasa();
  montarAbas();
  montarCatalogo();
  montarSelecionado();
  montarPaineis();
  montarTopo();
  montarAvancoDoTempo();
}

// ---------------------------------------------------------------- Modo de visão

function montarVisao(): void {
  const botoes = document.querySelectorAll<HTMLButtonElement>('#botoes-visao button');
  const desenhar = () => {
    botoes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.visao === estado.visao)));
  };
  botoes.forEach((b) => b.addEventListener('click', () => acoes.definirVisao(b.dataset.visao as ModoVisao)));
  assinar('visao', desenhar);
  desenhar();
}

// ---------------------------------------------------------------- Data, hora e velocidade

function montarTempo(): void {
  const dia = el<HTMLInputElement>('#dia');
  const mes = el<HTMLSelectElement>('#mes');
  const hora = el<HTMLInputElement>('#hora');
  const horaTexto = el<HTMLOutputElement>('#hora-texto');
  const botoesVel = document.querySelectorAll<HTMLButtonElement>('#botoes-velocidade button');

  MESES.forEach((nome, i) => mes.append(new Option(nome, String(i))));

  const desenhar = () => {
    const l = localDoRio(estado.tempo.msUtc);
    if (document.activeElement !== dia) dia.value = String(l.dia);
    mes.value = String(l.mes);
    dia.max = String(diasNoMes(l.mes));
    hora.value = String(l.minutos);
    horaTexto.textContent = `${doisDigitos(Math.floor(l.minutos / 60))}:${doisDigitos(l.minutos % 60)}`;
    botoesVel.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.vel) === estado.tempo.velocidade)));
  };

  const aplicarData = () => {
    const l = localDoRio(estado.tempo.msUtc);
    const m = Number(mes.value);
    const valor = numeroDe(dia);
    const d = Math.min(diasNoMes(m), Math.max(1, Math.round(valor ?? l.dia)));
    acoes.definirTempo(msUtcDe(m, d, l.minutos));
  };
  dia.addEventListener('change', () => {
    aplicarData();
    dia.value = String(localDoRio(estado.tempo.msUtc).dia);
  });
  mes.addEventListener('change', aplicarData);

  hora.addEventListener('input', () => {
    const l = localDoRio(estado.tempo.msUtc);
    acoes.definirTempo(msUtcDe(l.mes, l.dia, Number(hora.value)));
  });

  botoesVel.forEach((b) => b.addEventListener('click', () => acoes.definirVelocidade(Number(b.dataset.vel))));

  assinar('tempo', desenhar);
  desenhar();
}

/** Avanço do tempo com a velocidade escolhida. O laço completo de simulação vem na fase 3. */
function montarAvancoDoTempo(): void {
  let anterior = performance.now();
  const passo = (agora: number) => {
    const dt = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;
    const v = estado.tempo.velocidade;
    if (v > 0 && dt > 0) {
      let novo = estado.tempo.msUtc + v * 60_000 * dt;
      // Passou do fim de 2026: volta ao começo do ano.
      if (novo >= FIM_ANO_MS) novo = INICIO_ANO_MS + ((novo - FIM_ANO_MS) % MS_DIA);
      acoes.definirTempo(novo);
    }
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// ---------------------------------------------------------------- Clima e rotação

function montarClimaERotacao(): void {
  const clima = el<HTMLSelectElement>('#clima');
  const rotacao = el<HTMLInputElement>('#rotacao');
  const rotacaoTexto = el<HTMLOutputElement>('#rotacao-texto');
  const botoesRosa = document.querySelectorAll<HTMLButtonElement>('#botoes-rosa button');

  const desenhar = () => {
    clima.value = estado.projeto.clima;
    const g = Math.round(estado.projeto.casa.orientacaoGraus) % 360;
    rotacao.value = String(g);
    rotacaoTexto.textContent = `${g}°`;
    botoesRosa.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.graus) === g)));
  };

  clima.addEventListener('change', () => acoes.definirClima(clima.value as Clima));
  rotacao.addEventListener('input', () => acoes.alterarCasa({ orientacaoGraus: Number(rotacao.value) }));
  botoesRosa.forEach((b) => b.addEventListener('click', () => acoes.alterarCasa({ orientacaoGraus: Number(b.dataset.graus) })));

  assinar('projeto', desenhar);
  desenhar();
}

// ---------------------------------------------------------------- Formulário da casa

function montarFormularioCasa(): void {
  const painel = el<HTMLElement>('#form-casa');
  const abrir = el<HTMLButtonElement>('#abrir-casa');
  const fechar = el<HTMLButtonElement>('#fechar-casa');
  const campos = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-casa]');
  const aviso = el<HTMLElement>('#aviso-quartinho');
  const linhas = LADOS.map((l) => ({
    lado: l,
    tem: el<HTMLInputElement>(`#varanda-${l}-tem`),
    prof: el<HTMLInputElement>(`#varanda-${l}-prof`),
    inc: el<HTMLInputElement>(`#varanda-${l}-inc`),
    inteira: el<HTMLInputElement>(`#varanda-${l}-inteira`),
    largura: el<HTMLInputElement>(`#varanda-${l}-largura`),
    desloc: el<HTMLInputElement>(`#varanda-${l}-desloc`),
  }));
  const camposQuartinho = (['x', 'z', 'largura', 'profundidade', 'altura', 'giro'] as const).map((chave) => ({
    chave,
    campo: el<HTMLInputElement>(`#quartinho-${chave}`),
  }));

  const preencher = (campo: HTMLInputElement, valor: number) => {
    if (document.activeElement !== campo) campo.value = String(valor);
  };

  type Linha = (typeof linhas)[number];
  const forcar = (campo: HTMLInputElement, valor: number) => {
    campo.value = String(valor);
  };
  const desenharLinha = (ln: Linha, casa: CasaConfig) => {
    const v = casa.varandas.find((x) => x.lado === ln.lado);
    const ref: Varanda = v ?? novaVaranda(ln.lado, casa);
    const fachada = medidaDaFachada(casa, ln.lado);
    ln.tem.checked = !!v;
    ln.inteira.checked = ref.largura === null;
    const largura = ref.largura ?? fachada;
    ln.prof.max = String(Math.min(LIMITES_VARANDA.profundidadeMax, profundidadeMaxima(casa)));
    ln.inc.max = String(inclinacaoMaxima(casa, ref.profundidade));
    ln.largura.max = String(fachada);
    const lim = deslocamentoMaximo(fachada, largura);
    ln.desloc.min = String(-lim);
    ln.desloc.max = String(lim);
    preencher(ln.prof, ref.profundidade);
    preencher(ln.inc, ref.inclinacaoPct);
    preencher(ln.largura, largura);
    preencher(ln.desloc, ref.deslocamento);
    const sem = !v;
    ln.prof.disabled = ln.inc.disabled = ln.inteira.disabled = sem;
    ln.largura.disabled = ln.desloc.disabled = sem || ref.largura === null;
    // Largura e deslocamento só fazem sentido quando a varanda não ocupa a fachada inteira.
    ln.largura.closest('label')!.hidden = ln.desloc.closest('label')!.hidden = ref.largura === null;
  };

  const desenhar = () => {
    const casa = estado.projeto.casa;
    campos.forEach((c) => {
      const chave = c.dataset.casa as keyof CasaConfig;
      if (c instanceof HTMLSelectElement) c.value = String(casa[chave]);
      else preencher(c, casa[chave] as number);
    });
    linhas.forEach((ln) => desenharLinha(ln, casa));
    const texto = avisoDoQuartinho(casa);
    aviso.hidden = texto === null;
    aviso.textContent = texto ?? '';
    camposQuartinho.forEach(({ chave, campo }) => preencher(campo, casa.quartinho[chave]));
  };

  campos.forEach((c) =>
    c.addEventListener('change', () => {
      const chave = c.dataset.casa as string;
      const v = c instanceof HTMLSelectElement ? Number(c.value) : numeroDe(c);
      if (v === null) return desenhar();
      acoes.alterarCasa({ [chave]: v } as Partial<CasaConfig>);
      // Pé-direito, andares ou medidas novas podem deixar as varandas fora dos limites: corta e mostra o valor cortado.
      const casa = estado.projeto.casa;
      const cortadas = limitarVarandas(casa.varandas, casa);
      if (cortadas !== casa.varandas) acoes.alterarCasa({ varandas: cortadas });
      linhas.forEach((ln) => {
        const v2 = estado.projeto.casa.varandas.find((x) => x.lado === ln.lado);
        if (v2) {
          forcar(ln.prof, v2.profundidade);
          forcar(ln.inc, v2.inclinacaoPct);
        }
      });
    }),
  );

  const aplicarVaranda = (ln: Linha) => {
    const casa = estado.projeto.casa;
    const outras = casa.varandas.filter((x) => x.lado !== ln.lado);
    if (!ln.tem.checked) return acoes.alterarCasa({ varandas: outras });
    const atual = casa.varandas.find((x) => x.lado === ln.lado) ?? novaVaranda(ln.lado, casa);
    const fachada = medidaDaFachada(casa, ln.lado);
    const inteira = ln.inteira.checked;
    const largura = inteira ? null : (numeroDe(ln.largura) ?? atual.largura ?? fachada);
    const nova = limitarVaranda(
      {
        lado: ln.lado,
        profundidade: numeroDe(ln.prof) ?? atual.profundidade,
        inclinacaoPct: numeroDe(ln.inc) ?? atual.inclinacaoPct,
        largura,
        deslocamento: inteira ? 0 : (numeroDe(ln.desloc) ?? atual.deslocamento),
      },
      casa,
    );
    // Mantém a ordem dos lados.
    const lista = [...outras, nova].sort((a, b) => LADOS.indexOf(a.lado) - LADOS.indexOf(b.lado));
    acoes.alterarCasa({ varandas: lista });
    forcar(ln.prof, nova.profundidade);
    forcar(ln.inc, nova.inclinacaoPct);
    if (nova.largura !== null) {
      forcar(ln.largura, nova.largura);
      forcar(ln.desloc, nova.deslocamento);
    }
  };
  linhas.forEach((ln) => [ln.tem, ln.prof, ln.inc, ln.inteira, ln.largura, ln.desloc].forEach((c) => c.addEventListener('change', () => aplicarVaranda(ln))));

  const aplicarQuartinho = () => {
    const q = estado.projeto.casa.quartinho;
    const novo = { ...q };
    camposQuartinho.forEach(({ chave, campo }) => (novo[chave] = numeroDe(campo) ?? q[chave]));
    acoes.alterarCasa({ quartinho: novo });
  };
  camposQuartinho.forEach(({ campo }) => campo.addEventListener('change', aplicarQuartinho));

  const alternar = (aberto: boolean) => {
    painel.hidden = !aberto;
    abrir.setAttribute('aria-expanded', String(aberto));
  };
  abrir.addEventListener('click', () => alternar(painel.hidden === true));
  fechar.addEventListener('click', () => alternar(false));
  painel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') alternar(false);
  });

  assinar('projeto', desenhar);
  desenhar();
}

// ---------------------------------------------------------------- Abas da direita

function montarAbas(): void {
  const abas = document.querySelectorAll<HTMLButtonElement>('[data-aba]');
  const paineis = document.querySelectorAll<HTMLElement>('[data-painel]');
  abas.forEach((a) =>
    a.addEventListener('click', () => {
      abas.forEach((o) => o.setAttribute('aria-selected', String(o === a)));
      paineis.forEach((p) => (p.hidden = p.dataset.painel !== a.dataset.aba));
    }),
  );
}
