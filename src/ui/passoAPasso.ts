// Modo passo a passo (tarefa 4.1). O conteúdo dos roteiros vem de src/conteudo/roteiros.ts; aqui se mostra o painel
// no canto da cena, se avança quando o passo fica feito e se guarda o andamento na sessão.
// O painel só reage ao evento 'derivados': ele chega logo depois de cada mudança do projeto, já com a análise nova,
// e é nela que os passos olham.

import { CATALOGO } from '../catalogo';
import { ROTEIRO_TUTORIAL, roteiroPorId, ROTEIROS, type Passo, type Roteiro } from '../conteudo/roteiros';
import { acoes, assinar, emTutorial, estado, recalcularAgora } from '../estado';
import { localDoProjeto } from '../nucleo/irradiancia';
import type { Aparelho } from '../catalogo/tipos';
import { criarSobreposto } from './aprender';
import { destacarCategoriaNoCatalogo, destacarNoCatalogo } from './catalogo';
import { brl, el, h, num, substituir } from './formato';
import { duracaoTexto, horaTexto } from './mostradores';

const CHAVE = 'offgrid.passoapasso';
const MS_DO_FEITO = 1800;

let roteiro: Roteiro | null = null;
const pulados = new Set<string>();
/** Passos que estavam feitos na última conferência, para notar quando um passo acaba de ficar feito. */
let feitosAntes = new Set<string>();
let atualAntes: string | null = null;
let feitoRecente: string | null = null;
let esperaDoFeito: ReturnType<typeof setTimeout> | null = null;
let painel: HTMLElement | null = null;
/** A lista de todos os passos começa fechada, para o painel cobrir pouco da cena. */
let listaAberta = false;

// ---------------------------------------------------------------- Tutorial e teste de autonomia

const MS_HORA = 3_600_000;
/** O teste termina quando a bateria esvazia ou quando passam 24 horas simuladas. */
const LIMITE_DO_TESTE_MS = 24 * MS_HORA;
const HORA_DO_TESTE = 18;

interface ResultadoDoTeste {
  /** `esvaziou`: a bateria acabou antes das 24 h. `passou`: aguentou as 24 h. `nao-funcionou`: os aparelhos não chegaram a funcionar. */
  tipo: 'esvaziou' | 'passou' | 'nao-funcionou';
  texto: string;
  aparelhos: string[];
  somaW: number;
}

/** `rodando` enquanto o relógio corre; `resultado` quando termina e o tempo fica parado. */
let teste:
  | { fase: 'rodando'; inicioMsUtc: number; intervencoes: number }
  | { fase: 'resultado'; resultado: ResultadoDoTeste }
  | null = null;
/** Por que o último teste foi cancelado, para o painel dizer. Some quando outro teste começa. */
let avisoDoTeste: string | null = null;

/** Verdadeiro enquanto o teste de autonomia roda: a faixa "A bateria acabou às…" sobre a cena não aparece (o resultado vai para o painel). */
export function emTesteDeAutonomia(): boolean {
  return teste?.fase === 'rodando';
}

const noTutorial = (): boolean => roteiro?.id === ROTEIRO_TUTORIAL.id;

/** 18:00 locais do dia que está na tela. */
function dezoitoHorasDoDia(): number {
  const fuso = (localDoProjeto(estado.projeto)?.fuso ?? -3) * MS_HORA;
  const dia = 24 * MS_HORA;
  const inicioDoDia = Math.floor((estado.tempo.msUtc + fuso) / dia) * dia - fuso;
  return inicioDoDia + HORA_DO_TESTE * MS_HORA;
}

function iniciarTeste(): void {
  if (!noTutorial() || indiceAtual() >= 0) return;
  const inicio = dezoitoHorasDoDia();
  // Os aparelhos têm horário típico de uso e, fora dele, não consomem: no teste ficam ligados o tempo todo (o horário não volta depois).
  for (const uid of estado.derivados.analise.sistema?.cargas ?? []) {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    if (d?.ligado && CATALOGO.get(d.itemId)?.categoria === 'aparelho') acoes.definirUso(uid, { inicio: 0, fim: 24 });
  }
  // Se a contagem sem rede já estava ligada, desliga antes: a contagem do teste começa agora, do zero.
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  acoes.definirTempo(inicio);
  acoes.recarregarBateria();
  avisoDoTeste = null;
  // Daqui em diante, qualquer salto do relógio ou "Bateria cheia" cancela o teste.
  teste = { fase: 'rodando', inicioMsUtc: inicio, intervencoes: estado.simulacao.intervencoes };
  acoes.alternarQuedaDeLuz();
  acoes.definirVelocidade(60);
  desenhar();
}

/** Para o relógio e encerra a contagem sem rede. */
function encerrarContagem(): void {
  acoes.definirVelocidade(0);
  if (estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
}

function cancelarTeste(motivo?: string): void {
  if (!teste) return;
  const rodando = teste.fase === 'rodando';
  teste = null;
  avisoDoTeste = motivo ?? null;
  if (rodando) encerrarContagem();
  desenhar();
}

/** Aparelhos ligados na saída do inversor e a soma do que eles pedem. */
function aparelhosLigados(): { nomes: string[]; somaW: number } {
  const nomes: string[] = [];
  let somaW = 0;
  for (const uid of estado.derivados.analise.sistema?.cargas ?? []) {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    if (!d || !d.ligado || item?.categoria !== 'aparelho') continue;
    nomes.push(item.nome);
    // A média é o que a simulação gasta (na geladeira, o motor liga e desliga).
    somaW += (item as Aparelho).mediaW;
  }
  return { nomes, somaW };
}

/** Confere se o teste acabou. Chamado a cada mudança da simulação. */
function acompanharTeste(): void {
  if (teste?.fase !== 'rodando') return;
  const sim = estado.simulacao;
  const inicio = teste.inicioMsUtc;
  // O usuário mexeu na contagem, no relógio ou na bateria: o teste deixou de valer.
  if (!sim.quedaDeLuz.ativa || estado.tempo.msUtc < inicio || sim.intervencoes !== teste.intervencoes) {
    return cancelarTeste('O teste foi cancelado porque o relógio, a data ou a bateria foram mexidos no meio dele. Teste de novo.');
  }
  // Um passo deixou de estar feito (a análise já está atualizada): o teste não vale mais.
  if (indiceAtual() >= 0) return cancelarTeste();
  const { nomes, somaW } = aparelhosLigados();
  let resultado: ResultadoDoTeste | null = null;
  const s = sim.saida;
  if (sim.quedaDeLuz.apagouMsUtc !== null) {
    // Os minutos são cortados nos dois horários, para a duração bater com o que a tela mostra.
    const minuto = (ms: number): number => Math.floor(ms / 60_000) * 60_000;
    const apagou = sim.quedaDeLuz.apagouMsUtc;
    resultado = {
      tipo: 'esvaziou',
      // Os 50 % (no chumbo) são a conta do simulador, não uma proteção garantida do inversor.
      texto:
        `A bateria segurou ${duracaoTexto(minuto(apagou) - minuto(inicio))}: das ${horaTexto(inicio)} às ${horaTexto(apagou)}. ` +
        `O simulador para a conta com a bateria em ${Math.round(sim.estadoSim.soc * 100)} %, o limite saudável deste tipo de bateria: descarregar mais que isso encurta a vida dela. ` +
        'Na vida real, confira no manual em que tensão o seu inversor desliga; muitos só desligam com a bateria quase vazia.',
      aparelhos: nomes,
      somaW,
    };
  } else if (s.cargaPedidaW > 0 && s.cargaAtendidaW <= 0 && !sim.estadoSim.cortado) {
    // Os aparelhos pedem energia e não recebem, sem a bateria ter esvaziado: proteção da bateria ou sobrecarga do inversor.
    const motivo = s.avisos.includes('bms')
      ? 'a proteção da bateria cortou, porque os aparelhos pedem mais corrente do que ela pode dar'
      : s.avisos.includes('sobrecarga')
        ? 'os aparelhos pedem mais potência do que o inversor aguenta'
        : 'o sistema não conseguiu alimentar os aparelhos';
    resultado = {
      tipo: 'nao-funcionou',
      texto: `Os aparelhos não funcionaram: ${motivo}. Veja o aviso nos mostradores e as sugestões do consultor, troque o aparelho ou a peça e teste de novo.`,
      aparelhos: nomes,
      somaW,
    };
  } else if (estado.tempo.msUtc - inicio >= LIMITE_DO_TESTE_MS) {
    const pontos = sim.historico.filter((p) => p.msUtc >= inicio);
    const baixo = pontos.reduce<(typeof pontos)[number] | null>((m, p) => (m === null || p.soc < m.soc ? p : m), null);
    const pct = Math.round((baixo?.soc ?? sim.estadoSim.soc) * 100);
    const fim = Math.round(sim.estadoSim.soc * 100);
    // Só diz que a placa repôs tudo quando a bateria termina as 24 horas cheia de novo.
    const conclusao =
      fim >= 99
        ? 'De dia a placa repôs tudo o que foi gasto à noite.'
        : `Ao fim das 24 horas ela estava em ${num(fim)} %: a placa não repôs tudo o que foi gasto. Nesse ritmo a bateria perde carga a cada dia, até faltar. Mais placa ou menos consumo fecham a conta.`;
    resultado = {
      tipo: 'passou',
      texto: `A bateria passou de 24 horas. O ponto mais baixo foi ${num(pct)} %, às ${baixo ? horaTexto(baixo.msUtc) : horaTexto(estado.tempo.msUtc)}. ${conclusao}`,
      aparelhos: nomes,
      somaW,
    };
  }
  if (!resultado) {
    desenhar();
    return;
  }
  teste = { fase: 'resultado', resultado };
  encerrarContagem();
  desenhar();
}

// ---------------------------------------------------------------- Andamento

function gravar(): void {
  try {
    if (!roteiro) sessionStorage.removeItem(CHAVE);
    else sessionStorage.setItem(CHAVE, JSON.stringify({ roteiro: roteiro.id, passo: Math.max(0, indiceAtual()), pulados: [...pulados] }));
  } catch {
    /* sem sessionStorage: o andamento só vale enquanto a página está aberta */
  }
}

function ler(): { roteiro: Roteiro; pulados: string[] } | null {
  try {
    const dados: unknown = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null');
    if (!dados || typeof dados !== 'object') return null;
    const { roteiro: id, pulados: lista } = dados as { roteiro?: unknown; pulados?: unknown };
    const r = typeof id === 'string' ? roteiroPorId(id) : undefined;
    if (!r) return null;
    return { roteiro: r, pulados: Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}

function feitos(): boolean[] {
  return roteiro ? roteiro.passos.map((p) => p.feito(estado.projeto, estado.derivados, CATALOGO)) : [];
}

/** Primeiro passo que não está feito nem foi pulado. -1 quando não resta nenhum. */
function indiceAtual(f: boolean[] = feitos()): number {
  return roteiro ? roteiro.passos.findIndex((p, i) => !f[i] && !pulados.has(p.id)) : -1;
}

function sair(): void {
  if (noTutorial() && emTutorial()) {
    // Sair do tutorial devolve a casa guardada (o estado zera a simulação e os destaques) e fecha o painel.
    cancelarTeste();
    acoes.sairDoTutorial();
  }
  roteiro = null;
  teste = null;
  pulados.clear();
  feitosAntes = new Set();
  atualAntes = null;
  feitoRecente = null;
  gravar();
  desenhar();
}

/** Troca a montagem por uma casa vazia (a mesma casa, sem dispositivos nem cabos) e começa o roteiro. */
function comecar(r: Roteiro): void {
  // Dentro do tutorial, outro roteiro pede a casa de volta: o tutorial fecha e a casa guardada é a base.
  if (emTutorial()) {
    cancelarTeste();
    acoes.sairDoTutorial();
  }
  const base = structuredClone(estado.projeto);
  // O roteiro de 24 V usa a tomada da rede da casa: ela fica. O de 12 V não usa.
  const precisaDaRede = r.passos.some((p) => p.itemId === 'rede-tomada');
  const novo = {
    ...base,
    dispositivos: precisaDaRede ? base.dispositivos.filter((d) => CATALOGO.get(d.itemId)?.categoria === 'rede') : [],
    cabos: [],
  };
  acoes.carregarProjeto(novo);
  recalcularAgora();
  roteiro = r;
  pulados.clear();
  feitoRecente = null;
  const f = feitos();
  feitosAntes = new Set(r.passos.filter((_, i) => f[i]).map((p) => p.id));
  atualAntes = r.passos[indiceAtual(f)]?.id ?? null;
  gravar();
  desenhar();
}

/** Abre o tutorial (só o quartinho, vazio; a casa fica guardada) e começa o roteiro. Não pede confirmação. */
export function iniciarTutorial(): void {
  acoes.entrarNoTutorial();
  recalcularAgora();
  teste = null;
  comecarRoteiroDoTutorial();
}

function comecarRoteiroDoTutorial(): void {
  roteiro = ROTEIRO_TUTORIAL;
  pulados.clear();
  feitoRecente = null;
  const f = feitos();
  feitosAntes = new Set(ROTEIRO_TUTORIAL.passos.filter((_, i) => f[i]).map((p) => p.id));
  atualAntes = ROTEIRO_TUTORIAL.passos[indiceAtual(f)]?.id ?? null;
  gravar();
  desenhar();
}

// ---------------------------------------------------------------- Painel

function mostrarNoCatalogo(p: Passo): void {
  if (p.itemId) destacarNoCatalogo(p.itemId);
  else if (p.categoria) destacarCategoriaNoCatalogo(p.categoria);
}

function marca(estadoDoPasso: 'feito' | 'atual' | 'pulado' | 'adiante'): string {
  return { feito: '✓', atual: '▶', pulado: '–', adiante: '○' }[estadoDoPasso];
}

const semNulos = (lista: (Node | null)[]): Node[] => lista.filter((n): n is Node => n !== null);

function resumoDoTutorial(r: Roteiro): Node[] {
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, 'Sair do tutorial');
  botaoSair.addEventListener('click', sair);
  const cabeca = h('p', { class: 'passo-contagem' }, r.titulo);

  if (teste?.fase === 'rodando') {
    const soc = Math.round(estado.simulacao.estadoSim.soc * 100);
    const cancelar = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'cancelar-teste' }, 'Cancelar o teste');
    cancelar.addEventListener('click', () => cancelarTeste());
    return [
      cabeca,
      h('h4', { class: 'passo-titulo' }, 'Testando a bateria…'),
      h('p', { class: 'passo-texto', 'data-teste': 'andamento' }, `Sem rede, a partir das ${horaTexto(teste.inicioMsUtc)}. Agora são ${horaTexto(estado.tempo.msUtc)} e a bateria está com ${num(soc)} %.`),
      h('p', { class: 'passo-dica' }, 'No teste, os aparelhos ligados ficam funcionando o tempo todo.'),
      h(
        'p',
        { class: 'passo-dica' },
        estado.tempo.velocidade > 0
          ? 'O relógio corre e para quando a bateria esvazia ou passam 24 horas simuladas. Mexer na data, na hora ou em "Bateria cheia" cancela o teste.'
          : 'O relógio está em pausa. Escolha uma velocidade na barra de baixo para o teste continuar.',
      ),
      h('div', { class: 'passo-botoes' }, cancelar, botaoSair),
    ];
  }

  if (teste?.fase === 'resultado') {
    const { resultado } = teste;
    const deNovo = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'testar-de-novo' }, 'Testar de novo');
    deNovo.addEventListener('click', iniciarTeste);
    const ligados =
      resultado.aparelhos.length > 0
        ? `Aparelhos ligados: ${resultado.aparelhos.join(', ')}, somando ${num(resultado.somaW)} W de consumo médio.`
        : 'Nenhum aparelho estava ligado na saída do inversor.';
    return [
      cabeca,
      h('h4', { class: 'passo-titulo' }, 'Resultado do teste'),
      h('p', { class: 'passo-texto', 'data-teste': resultado.tipo }, resultado.texto),
      h('p', { class: 'passo-texto', 'data-teste': 'aparelhos' }, ligados),
      h(
        'p',
        { class: 'passo-texto' },
        'Quer ver como outro aparelho muda o resultado? Desligue o atual, arraste outro do catálogo, ligue o plugue dele na saída do inversor e teste de novo. Micro-ondas e chuveiro pedem mais do que o inversor de 500 W aguenta: o consultor mostra o motivo.',
      ),
      h('div', { class: 'passo-botoes' }, deNovo, botaoSair),
    ];
  }

  const e = estado.derivados.estimativas;
  const autonomia =
    e.autonomiaHoras === null
      ? 'A autonomia ainda não pôde ser calculada: falta bateria ou aparelho ligado na saída.'
      : `A bateria sustenta os aparelhos por cerca de ${num(e.autonomiaHoras, 1)} h sem sol e sem rede (autonomia).`;
  const testar = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'testar-bateria' }, 'Testar a bateria');
  testar.addEventListener('click', iniciarTeste);
  return semNulos([
    cabeca,
    h('h4', { class: 'passo-titulo' }, 'Montagem concluída'),
    avisoDoTeste ? h('p', { class: 'passo-dica', role: 'status', 'data-teste': 'cancelado' }, avisoDoTeste) : null,
    h('p', { class: 'passo-texto' }, autonomia),
    h('p', { class: 'passo-texto' }, `Orçamento total: ${brl(estado.derivados.orcamento.total)}. Os preços mudam: confira os anúncios antes de comprar.`),
    h('p', { class: 'passo-texto' }, `O teste põe o relógio às ${horaTexto(dezoitoHorasDoDia())} deste dia, enche a bateria, tira a rede e acelera o tempo até a bateria esvaziar ou passarem 24 horas.`),
    h('p', { class: 'passo-texto' }, 'No teste, os aparelhos ligados ficam funcionando o tempo todo.'),
    h('p', { class: 'passo-dica' }, 'O simulador ajuda a aprender e a planejar. Antes de comprar e instalar de verdade, mostre o plano a um eletricista habilitado.'),
    h('div', { class: 'passo-botoes' }, testar, botaoSair),
  ]);
}

function resumo(r: Roteiro): Node[] {
  if (r.fim === 'teste-de-autonomia') return resumoDoTutorial(r);
  const e = estado.derivados.estimativas;
  const f = feitos();
  const puladosAgora = r.passos.filter((p, i) => pulados.has(p.id) && !f[i]).length;
  const autonomia =
    e.autonomiaHoras === null
      ? 'A autonomia ainda não pôde ser calculada: falta bateria ou aparelho ligado na saída.'
      : `A bateria sustenta os aparelhos por cerca de ${num(e.autonomiaHoras, 1)} h sem sol e sem rede (autonomia).`;
  const botaoQueda = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'queda' }, 'Simular queda de luz');
  botaoQueda.addEventListener('click', () => {
    if (!estado.simulacao.quedaDeLuz.ativa) acoes.alternarQuedaDeLuz();
  });
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, 'Sair do passo a passo');
  botaoSair.addEventListener('click', sair);
  return semNulos([
    h('p', { class: 'passo-contagem' }, r.titulo),
    h('h4', { class: 'passo-titulo' }, 'Montagem concluída'),
    h('p', { class: 'passo-texto' }, autonomia),
    h('p', { class: 'passo-texto' }, `Orçamento total: ${brl(estado.derivados.orcamento.total)}. Os preços mudam: confira os anúncios antes de comprar.`),
    puladosAgora > 0 ? h('p', { class: 'passo-dica' }, `Você pulou ${puladosAgora} ${puladosAgora === 1 ? 'passo' : 'passos'}: eles não foram conferidos.`) : null,
    h('p', { class: 'passo-texto' }, 'Que tal simular uma queda de luz? Ela mostra se a bateria aguenta a casa sem a rede.'),
    h('p', { class: 'passo-dica' }, 'O simulador ajuda a aprender e a planejar. Antes de comprar e instalar de verdade, mostre o plano a um eletricista habilitado.'),
    h('div', { class: 'passo-botoes' }, botaoQueda, botaoSair),
  ]);
}

function emAndamento(r: Roteiro, f: boolean[], atual: number): Node[] {
  const passo = r.passos[atual]!;
  const botoes = h('div', { class: 'passo-botoes' });
  if (passo.itemId || passo.categoria) {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'catalogo' }, 'Mostrar no catálogo');
    b.addEventListener('click', () => {
      const atualAgora = roteiro?.passos[indiceAtual()];
      if (atualAgora) mostrarNoCatalogo(atualAgora);
    });
    botoes.append(b);
  }
  const tutorial = r.id === ROTEIRO_TUTORIAL.id;
  const pular = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'pular' }, 'Pular');
  pular.addEventListener('click', () => {
    const atualAgora = roteiro?.passos[indiceAtual()];
    if (!atualAgora) return;
    pulados.add(atualAgora.id);
    gravar();
    avaliar();
  });
  const verLista = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'lista', 'aria-expanded': String(listaAberta) }, listaAberta ? 'Esconder os passos' : 'Ver os passos');
  verLista.addEventListener('click', () => {
    listaAberta = !listaAberta;
    desenhar();
  });
  const botaoSair = h('button', { type: 'button', class: 'passo-botao', 'data-acao': 'sair' }, tutorial ? 'Sair do tutorial' : 'Sair do passo a passo');
  botaoSair.addEventListener('click', sair);
  // No tutorial não se pula: o teste de autonomia no fim precisa do sistema inteiro montado.
  if (tutorial) botoes.append(verLista, botaoSair);
  else botoes.append(pular, verLista, botaoSair);

  const lista = h(
    'ol',
    { class: 'passo-lista', hidden: !listaAberta },
    ...r.passos.map((p, i) => {
      const situacao = f[i] ? 'feito' : pulados.has(p.id) ? 'pulado' : i === atual ? 'atual' : 'adiante';
      return h('li', { class: `passo-item ${situacao}`, 'data-passo-id': p.id }, h('span', { class: 'passo-marca', 'aria-hidden': 'true' }, marca(situacao)), h('span', null, p.titulo));
    }),
  );

  return semNulos([
    h('p', { class: 'passo-contagem' }, `Passo ${atual + 1} de ${r.passos.length}`, h('span', { class: 'passo-roteiro' }, ` · ${r.titulo}`)),
    feitoRecente ? h('p', { class: 'passo-feito', role: 'status' }, `Feito! ${feitoRecente}`) : null,
    h('h4', { class: 'passo-titulo' }, passo.titulo),
    h('p', { class: 'passo-texto' }, passo.texto),
    passo.dica ? h('p', { class: 'passo-dica' }, `Dica: ${passo.dica}`) : null,
    lista,
    botoes,
  ]);
}

function desenhar(): void {
  if (!painel) return;
  if (!roteiro) {
    painel.hidden = true;
    painel.removeAttribute('data-roteiro');
    painel.removeAttribute('data-situacao');
    delete painel.dataset.assinatura;
    delete painel.dataset.teste;
    painel.replaceChildren();
    acoes.definirDestaques([]);
    return;
  }
  const f = feitos();
  const atual = indiceAtual(f);
  // O realce na cena: só no tutorial, e só enquanto há um passo da vez (no resumo e durante o teste, nada).
  const passoDaVez = atual >= 0 ? roteiro.passos[atual] : undefined;
  acoes.definirDestaques(noTutorial() && passoDaVez?.onde ? passoDaVez.onde(estado.projeto, CATALOGO) : []);
  painel.hidden = false;
  painel.dataset.roteiro = roteiro.id;
  if (teste) painel.dataset.teste = teste.fase;
  else delete painel.dataset.teste;
  painel.dataset.situacao = atual < 0 ? 'resumo' : 'andamento';
  painel.dataset.passo = String(atual < 0 ? roteiro.passos.length : atual + 1);
  substituir(painel, atual < 0 ? resumo(roteiro) : emAndamento(roteiro, f, atual));
}

/** Confere os passos, mostra o "Feito!" quando o passo da vez acabou de ficar feito e redesenha. */
function avaliar(): void {
  // O projeto do tutorial está aberto (entrou por outro caminho): o tutorial começa.
  if (emTutorial() && !noTutorial()) return comecarRoteiroDoTutorial();
  // O projeto deixou de ser o do tutorial por outro caminho (abrir um arquivo, desfazer): o painel fecha.
  if (noTutorial() && !emTutorial()) {
    if (teste?.fase === 'rodando') encerrarContagem();
    teste = null;
    avisoDoTeste = null;
    roteiro = null;
    pulados.clear();
    gravar();
    return desenhar();
  }
  if (!roteiro) return;
  const f = feitos();
  // Um passo deixou de estar feito durante o teste: o teste não vale mais.
  if (teste && indiceAtual(f) >= 0) cancelarTeste();
  const agoraFeitos = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
  const passoDaVez = atualAntes === null ? undefined : roteiro.passos.find((p) => p.id === atualAntes);
  if (passoDaVez && agoraFeitos.has(passoDaVez.id) && !feitosAntes.has(passoDaVez.id)) {
    feitoRecente = passoDaVez.titulo;
    if (esperaDoFeito) clearTimeout(esperaDoFeito);
    esperaDoFeito = setTimeout(() => {
      feitoRecente = null;
      desenhar();
    }, MS_DO_FEITO);
  }
  feitosAntes = agoraFeitos;
  atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  gravar();
  desenhar();
}

// ---------------------------------------------------------------- Escolha do roteiro

function montarEscolha(): () => void {
  const { corpo, abrir, fechar } = criarSobreposto('painel-escolha-roteiro', 'Passo a passo');
  corpo.append(h('p', { class: 'detalhe' }, 'Escolha um roteiro. Ele guia a montagem, um passo de cada vez, e avisa quando você cumpre cada um.'));
  const botaoTutorial = h('button', { type: 'button', class: 'passo-botao passo-botao-principal', 'data-roteiro': ROTEIRO_TUTORIAL.id }, 'Fazer o tutorial');
  botaoTutorial.addEventListener('click', () => {
    fechar();
    iniciarTutorial();
  });
  corpo.append(
    h(
      'article',
      { class: 'roteiro-opcao roteiro-tutorial' },
      h('h4', null, ROTEIRO_TUTORIAL.titulo),
      h('p', null, ROTEIRO_TUTORIAL.paraQuem),
      h('p', { class: 'detalhe' }, `${ROTEIRO_TUTORIAL.passos.length} passos`),
      botaoTutorial,
    ),
  );
  for (const r of ROTEIROS) {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-roteiro': r.id }, 'Começar');
    b.addEventListener('click', () => {
      if (!window.confirm('Isto troca a montagem atual por uma casa vazia. Você pode desfazer.')) return;
      fechar();
      comecar(r);
    });
    corpo.append(
      h('article', { class: 'roteiro-opcao' }, h('h4', null, r.titulo), h('p', null, r.paraQuem), h('p', { class: 'detalhe' }, `${r.passos.length} passos`), b),
    );
  }
  return abrir;
}

export function montarPassoAPasso(): void {
  painel = h('aside', { id: 'passo-a-passo', class: 'passo-a-passo', 'aria-label': 'Passo a passo', hidden: true });
  el('#centro').append(painel);

  const abrirEscolha = montarEscolha();
  el('#botao-passo-a-passo').addEventListener('click', abrirEscolha);

  assinar('derivados', avaliar);
  assinar('simulacao', acompanharTeste);

  // Uma sessão em andamento (a página foi recarregada) continua de onde parou.
  const guardado = ler();
  if (emTutorial()) {
    // O projeto do tutorial está aberto: continua o tutorial, mesmo sem nada guardado na sessão.
    roteiro = ROTEIRO_TUTORIAL;
    const f = feitos();
    feitosAntes = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
    atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  } else if (guardado && guardado.roteiro.id !== ROTEIRO_TUTORIAL.id) {
    roteiro = guardado.roteiro;
    guardado.pulados.forEach((id) => pulados.add(id));
    const f = feitos();
    feitosAntes = new Set(roteiro.passos.filter((_, i) => f[i]).map((p) => p.id));
    atualAntes = roteiro.passos[indiceAtual(f)]?.id ?? null;
  }
  desenhar();
}
