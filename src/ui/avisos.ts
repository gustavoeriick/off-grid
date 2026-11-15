// Avisos de segurança: painel com todos, avisos no momento certo e a linha fixa de limite do simulador. Tarefa 4.3.
// O conteúdo vem de src/conteudo/seguranca.ts. Os gatilhos só olham mudanças feitas depois da abertura:
// o que já existe ao abrir ou carregar um projeto não dispara nada.

import { CATALOGO } from '../catalogo';
import { AVISOS_DE_SEGURANCA, type AvisoDeSeguranca, type TemaSeguranca } from '../conteudo/seguranca';
import { assinar, estado } from '../estado';
import type { PontaCabo, Projeto } from '../nucleo/tipos';
import { criarSobreposto } from './aprender';
import { el, h } from './formato';

const CHAVE_VISTOS = 'offgrid.avisos.vistos';
const CHAVE_LIMITE = 'offgrid.aviso.limite.visto';

const TEMAS: { id: TemaSeguranca; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Em geral' },
  { id: 'bateria', rotulo: 'Bateria' },
  { id: 'placas', rotulo: 'Placas solares' },
  { id: 'corrente-alternada', rotulo: 'Corrente alternada (127 V)' },
  { id: 'telhado', rotulo: 'Telhado' },
];

const porId = new Map<string, AvisoDeSeguranca>(AVISOS_DE_SEGURANCA.map((a) => [a.id, a]));

// ---------------------------------------------------------------- O que já foi visto

const vistosNaMemoria = new Set<string>();

function lerVistos(): Set<string> {
  const conjunto = new Set(vistosNaMemoria);
  try {
    const lista: unknown = JSON.parse(sessionStorage.getItem(CHAVE_VISTOS) ?? '[]');
    if (Array.isArray(lista)) for (const x of lista) if (typeof x === 'string') conjunto.add(x);
  } catch {
    /* sem sessionStorage: vale só a memória */
  }
  return conjunto;
}

function marcarVisto(id: string): void {
  vistosNaMemoria.add(id);
  try {
    sessionStorage.setItem(CHAVE_VISTOS, JSON.stringify([...lerVistos()]));
  } catch {
    /* ignora */
  }
}

/** Esquece os avisos já mostrados (usado pelo roteiro de verificação). */
export function reiniciarAvisosVistos(): void {
  vistosNaMemoria.clear();
  try {
    sessionStorage.removeItem(CHAVE_VISTOS);
  } catch {
    /* ignora */
  }
}

// ---------------------------------------------------------------- Cartão no canto da cena

/** Um cartão por vez, para não cobrir a cena; os outros esperam na fila. O cartão não captura o ponteiro, só o botão "Entendi". */
const fila: AvisoDeSeguranca[] = [];
let pilha: HTMLElement | null = null;

function garantirPilha(): HTMLElement {
  if (!pilha) {
    pilha = h('div', { id: 'avisos-seguranca', 'aria-label': 'Avisos de segurança' });
    el('#centro').append(pilha);
  }
  return pilha;
}

function desenharFila(): void {
  const p = garantirPilha();
  const a = fila[0];
  if (!a) {
    p.replaceChildren();
    return;
  }
  const botao = h('button', { type: 'button', class: 'entendi' }, 'Entendi');
  botao.addEventListener('click', () => {
    fila.shift();
    desenharFila();
  });
  p.replaceChildren(
    h(
      'aside',
      { class: 'aviso-seguranca', 'data-aviso-seguranca': a.id, role: 'status' },
      h('p', { class: 'aviso-selo' }, fila.length > 1 ? `Segurança (mais ${fila.length - 1} na fila)` : 'Segurança'),
      h('h4', null, a.titulo),
      h('p', null, a.texto),
      botao,
    ),
  );
}

/** Mostra o aviso no canto, uma vez por projeto aberto. */
export function mostrarAviso(id: string): void {
  const a = porId.get(id);
  if (!a || lerVistos().has(id)) return;
  marcarVisto(id);
  fila.push(a);
  desenharFila();
}

// ---------------------------------------------------------------- Gatilhos

interface Foto {
  projeto: Projeto;
  dispositivos: Set<string>;
  cabos: Map<string, string>;
}

function chaveDoCabo(c: { de: PontaCabo; para: PontaCabo }): string {
  return `${c.de.disp}.${c.de.terminal}>${c.para.disp}.${c.para.terminal}`;
}

function foto(): Foto {
  const p = estado.projeto;
  return { projeto: p, dispositivos: new Set(p.dispositivos.map((d) => d.uid)), cabos: new Map(p.cabos.map((c) => [c.uid, chaveDoCabo(c)])) };
}

function categoriaDe(uid: string): string | undefined {
  const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
  return d ? CATALOGO.get(d.itemId)?.categoria : undefined;
}

function montarGatilhos(): void {
  let antes = foto();

  const depois = (): void => {
    const agora = foto();
    // Projeto trocado por inteiro (abrir, importar, novo, desfazer, refazer): só se guarda a nova foto.
    if (agora.projeto !== antes.projeto) {
      antes = agora;
      return;
    }
    const novosDisp = estado.projeto.dispositivos.filter((d) => !antes.dispositivos.has(d.uid));
    const novosCabos = estado.projeto.cabos.filter((c) => antes.cabos.get(c.uid) !== chaveDoCabo(c));
    const cabosApagados = [...antes.cabos.keys()].filter((uid) => !agora.cabos.has(uid));
    antes = agora;

    for (const d of novosDisp) {
      const cat = CATALOGO.get(d.itemId)?.categoria;
      if (cat === 'bateria' || cat === 'inversor') mostrarAviso('bateria-local-e-ventilacao');
      if (cat === 'placa') {
        mostrarAviso('placas-tensao-com-luz');
        if (d.superficie?.startsWith('telhado')) mostrarAviso('telhado-colonial');
      }
    }

    for (const c of novosCabos) {
      const pontas = [c.de, c.para];
      const cats = pontas.map((p) => categoriaDe(p.disp));
      const terminais = pontas.map((p) => p.terminal);
      const bateria = pontas.filter((p) => categoriaDe(p.disp) === 'bateria');
      if (bateria.length) mostrarAviso('bateria-ferramenta-metalica');
      if (bateria.some((p) => p.terminal === 'pos')) mostrarAviso('bateria-fusivel-no-positivo');
      if (cats.includes('bateria') && terminais.some((t) => t === 'batPos' || t === 'batNeg')) mostrarAviso('bateria-polaridade');
      if (cats[0] === 'placa' && cats[1] === 'placa') mostrarAviso('placas-tensao-em-serie');
      if (terminais.includes('caSaida')) mostrarAviso('ca-127-v-choca');
      if (terminais.includes('caEntrada')) mostrarAviso('ca-saida-nunca-na-rede');
    }

    if (cabosApagados.length) mostrarAviso('geral-desligar-antes-de-mexer');
  };

  assinar('dispositivos', depois);
  assinar('cabos', depois);
  assinar('projeto', depois);
}

// ---------------------------------------------------------------- Painel "Segurança"

function montarPainel(): void {
  const { corpo, abrir } = criarSobreposto('painel-seguranca', 'Avisos de segurança');
  corpo.append(h('p', { class: 'detalhe' }, 'Eletricidade machuca. Leia antes de mexer em qualquer parte do sistema real.'));
  for (const t of TEMAS) {
    const avisos = AVISOS_DE_SEGURANCA.filter((a) => a.tema === t.id);
    if (!avisos.length) continue;
    corpo.append(
      h(
        'section',
        { class: 'tema-seguranca', 'data-tema': t.id },
        h('h4', null, t.rotulo),
        ...avisos.map((a) => h('article', { class: 'aviso-lista', 'data-aviso-seguranca': a.id }, h('h5', null, a.titulo), h('p', null, a.texto))),
      ),
    );
  }
  el('#botao-seguranca').addEventListener('click', abrir);
}

// ---------------------------------------------------------------- Aviso de limite do simulador

/** Linha fixa e pequena no rodapé do painel de Orçamento. */
export function rodapeDeLimite(): HTMLElement {
  const a = porId.get('geral-limite-do-simulador');
  return h('p', { class: 'limite-simulador' }, h('strong', null, 'Importante: '), a ? `${a.titulo}.` : '');
}

function limiteJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE_LIMITE) === '1';
  } catch {
    return false;
  }
}

function mostrarLimiteNaPrimeiraAbertura(): void {
  const a = porId.get('geral-limite-do-simulador');
  if (!a || limiteJaVisto()) return;
  try {
    localStorage.setItem(CHAVE_LIMITE, '1');
  } catch {
    /* ignora */
  }
  fila.push(a);
  desenharFila();
}

export function montarAvisos(): void {
  montarPainel();
  montarGatilhos();
  mostrarLimiteNaPrimeiraAbertura();
}
