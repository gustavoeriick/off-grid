// Estado do ambiente de rádio LoRa: o projeto da tela, a seleção, o histórico de desfazer e "Meus projetos".
// Especificação: docs/especificacao/lora.md, seções 1 e 6. Este arquivo é do coordenador.
// Os pontos do mapa ficam só no navegador: nada aqui envia o projeto para fora.

import { criarBiblioteca, nomeLimpo, type ProjetoGravado } from '../biblioteca';
import type { PontoLora, ProjetoLora, Regiao } from './nucleo/tipos';

export type SelecaoLora = { tipo: 'ponto'; id: string } | { tipo: 'enlace'; de: string; para: string } | null;

export type EventoLora = 'projeto' | 'selecao' | 'projetos';

const biblioteca = criarBiblioteca('offgrid.lora.projetos');
const LIMITE_HISTORICO = 50;
const ESPERA_GRAVAR_MS = 400;

/** Valores de um ponto novo (especificação, seção 6). */
export const PONTO_PADRAO = { alturaDaAntenaM: 6, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0 } as const;

export function projetoVazio(nome: string): ProjetoLora {
  return { versao: 1, nome, regiao: 'ANZ', modo: 'long-fast', margemDoAmbienteDb: 0, limiteDeSaltos: 3, pontos: [], enlaces: [] };
}

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const entre = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Confere e arruma um projeto lido de fora. Lança erro se não for um projeto de rádio. */
export function conferirProjeto(dados: unknown): ProjetoLora {
  const d = dados as Partial<ProjetoLora> | null;
  if (!d || typeof d !== 'object' || d.versao !== 1 || !Array.isArray(d.pontos) || !Array.isArray(d.enlaces)) {
    throw new Error('Este arquivo não é um projeto de rádio LoRa do simulador.');
  }
  const pontos: PontoLora[] = [];
  for (const p of d.pontos as Partial<PontoLora>[]) {
    if (!p || typeof p.id !== 'string' || !finito(p.lat) || !finito(p.lon) || Math.abs(p.lat) > 85 || Math.abs(p.lon) > 180) {
      throw new Error('O projeto tem um ponto sem posição válida.');
    }
    if (pontos.some((x) => x.id === p.id)) continue;
    pontos.push({
      id: p.id,
      nome: nomeLimpo(typeof p.nome === 'string' ? p.nome : 'Ponto'),
      tipo: p.tipo === 'repetidor' ? 'repetidor' : 'casa',
      lat: p.lat,
      lon: p.lon,
      alturaDaAntenaM: entre(finito(p.alturaDaAntenaM) ? p.alturaDaAntenaM : PONTO_PADRAO.alturaDaAntenaM, 1, 100),
      potenciaDbm: entre(finito(p.potenciaDbm) ? p.potenciaDbm : PONTO_PADRAO.potenciaDbm, 0, 30),
      ganhoDbi: entre(finito(p.ganhoDbi) ? p.ganhoDbi : PONTO_PADRAO.ganhoDbi, 0, 20),
      perdaNoCaboDb: entre(finito(p.perdaNoCaboDb) ? p.perdaNoCaboDb : PONTO_PADRAO.perdaNoCaboDb, 0, 20),
    });
  }
  const ids = new Set(pontos.map((p) => p.id));
  const enlaces: ProjetoLora['enlaces'] = [];
  for (const e of d.enlaces as { de?: unknown; para?: unknown }[]) {
    if (typeof e?.de !== 'string' || typeof e.para !== 'string' || e.de === e.para || !ids.has(e.de) || !ids.has(e.para)) continue;
    if (enlaces.some((x) => (x.de === e.de && x.para === e.para) || (x.de === e.para && x.para === e.de))) continue;
    enlaces.push({ de: e.de, para: e.para });
  }
  return {
    versao: 1,
    nome: nomeLimpo(typeof d.nome === 'string' ? d.nome : 'Projeto de rádio'),
    regiao: d.regiao === 'BR_902' ? 'BR_902' : 'ANZ',
    modo: typeof d.modo === 'string' ? d.modo : 'long-fast',
    margemDoAmbienteDb: entre(finito(d.margemDoAmbienteDb) ? d.margemDoAmbienteDb : 0, 0, 40),
    limiteDeSaltos: Math.round(entre(finito(d.limiteDeSaltos) ? d.limiteDeSaltos : 3, 1, 7)),
    pontos,
    enlaces,
  };
}

function projetoDeAbertura(): ProjetoLora {
  const atual = biblioteca.atual();
  const texto = atual === null ? null : biblioteca.texto(atual);
  if (texto !== null) {
    try {
      return conferirProjeto(JSON.parse(texto));
    } catch (erro) {
      console.warn('O projeto de rádio gravado não pôde ser aberto; abrindo um projeto vazio.', erro);
    }
  }
  return projetoVazio('Minha rede');
}

export const estadoLora: { projeto: ProjetoLora; selecao: SelecaoLora } = { projeto: projetoDeAbertura(), selecao: null };

const ouvintes: Record<EventoLora, Set<() => void>> = { projeto: new Set(), selecao: new Set(), projetos: new Set() };

export function assinarLora(evento: EventoLora, fn: () => void): () => void {
  ouvintes[evento].add(fn);
  return () => ouvintes[evento].delete(fn);
}

function avisar(evento: EventoLora): void {
  for (const fn of [...ouvintes[evento]]) fn();
}

const passado: string[] = [];
const futuro: string[] = [];
let esperaGravar: ReturnType<typeof setTimeout> | null = null;

function gravarAgora(): void {
  const atual = biblioteca.atual();
  if (atual !== null) biblioteca.salvar(atual, estadoLora.projeto.nome, JSON.stringify(estadoLora.projeto), Date.now());
}

function agendarGravacao(): void {
  if (esperaGravar) clearTimeout(esperaGravar);
  esperaGravar = setTimeout(() => {
    esperaGravar = null;
    gravarAgora();
  }, ESPERA_GRAVAR_MS);
}

/** O projeto da tela sempre tem vaga em "Meus projetos". */
function garantirBiblioteca(): void {
  if (biblioteca.atual() !== null) return;
  estadoLora.projeto.nome = biblioteca.nomeLivre(estadoLora.projeto.nome);
  biblioteca.definirAtual(biblioteca.criar(estadoLora.projeto.nome, JSON.stringify(estadoLora.projeto), Date.now()));
}

function limparSelecaoOrfa(): void {
  const s = estadoLora.selecao;
  if (!s) return;
  const p = estadoLora.projeto;
  const existe = s.tipo === 'ponto' ? p.pontos.some((x) => x.id === s.id) : p.enlaces.some((e) => mesmoEnlace(e, s.de, s.para));
  if (!existe) {
    estadoLora.selecao = null;
    avisar('selecao');
  }
}

const mesmoEnlace = (e: { de: string; para: string }, a: string, b: string): boolean => (e.de === a && e.para === b) || (e.de === b && e.para === a);

function mudar(fn: (p: ProjetoLora) => void, historico = true): void {
  if (historico) {
    passado.push(JSON.stringify(estadoLora.projeto));
    if (passado.length > LIMITE_HISTORICO) passado.shift();
    futuro.length = 0;
  }
  fn(estadoLora.projeto);
  limparSelecaoOrfa();
  avisar('projeto');
  agendarGravacao();
}

function abrirNaTela(id: string, projeto: ProjetoLora): void {
  biblioteca.definirAtual(id);
  passado.length = 0;
  futuro.length = 0;
  estadoLora.projeto = projeto;
  estadoLora.selecao = null;
  gravarAgora();
  avisar('selecao');
  avisar('projeto');
  avisar('projetos');
}

function novoIdDePonto(p: ProjetoLora): string {
  let n = p.pontos.length + 1;
  while (p.pontos.some((x) => x.id === `pt${n}`)) n += 1;
  return `pt${n}`;
}

export const acoesLora = {
  /** Cria um ponto no lugar dado e devolve o `id`. */
  adicionarPonto(lat: number, lon: number, tipo: PontoLora['tipo'], nome?: string): string {
    const id = novoIdDePonto(estadoLora.projeto);
    mudar((p) => {
      const quantos = p.pontos.filter((x) => x.tipo === tipo).length + 1;
      const padrao = tipo === 'repetidor' ? `Repetidor ${quantos}` : `Ponto ${quantos}`;
      p.pontos = [...p.pontos, { id, nome: nomeLimpo(nome ?? padrao), tipo, lat, lon, ...PONTO_PADRAO }];
    });
    return id;
  },

  /** Muda dados de um ponto. `historico: false` durante um arraste; marque o começo com `marcarHistorico`. */
  alterarPonto(id: string, dados: Partial<Omit<PontoLora, 'id'>>, opcoes?: { historico?: boolean }): void {
    mudar((p) => {
      p.pontos = conferirProjeto({ ...p, pontos: p.pontos.map((x) => (x.id === id ? { ...x, ...dados } : x)) }).pontos;
    }, opcoes?.historico !== false);
  },

  /** Ponto de retorno antes de um arraste feito com `historico: false`. */
  marcarHistorico(): void {
    passado.push(JSON.stringify(estadoLora.projeto));
    if (passado.length > LIMITE_HISTORICO) passado.shift();
    futuro.length = 0;
  },

  removerPonto(id: string): void {
    mudar((p) => {
      p.pontos = p.pontos.filter((x) => x.id !== id);
      p.enlaces = p.enlaces.filter((e) => e.de !== id && e.para !== id);
    });
  },

  /** Liga dois pontos. Devolve falso se são o mesmo ponto, se algum não existe ou se já estão ligados. */
  ligar(de: string, para: string): boolean {
    const p = estadoLora.projeto;
    if (de === para || !p.pontos.some((x) => x.id === de) || !p.pontos.some((x) => x.id === para) || p.enlaces.some((e) => mesmoEnlace(e, de, para))) return false;
    mudar((q) => {
      q.enlaces = [...q.enlaces, { de, para }];
    });
    return true;
  },

  desligar(de: string, para: string): void {
    mudar((p) => {
      p.enlaces = p.enlaces.filter((e) => !mesmoEnlace(e, de, para));
    });
  },

  /** Região, modo do rádio, margem do ambiente e limite de saltos. */
  configurar(dados: Partial<Pick<ProjetoLora, 'modo' | 'margemDoAmbienteDb' | 'limiteDeSaltos'>> & { regiao?: Regiao }): void {
    mudar((p) => {
      Object.assign(p, conferirProjeto({ ...p, ...dados }));
    });
  },

  selecionar(selecao: SelecaoLora): void {
    estadoLora.selecao = selecao;
    avisar('selecao');
  },

  desfazer(): boolean {
    const anterior = passado.pop();
    if (anterior === undefined) return false;
    futuro.push(JSON.stringify(estadoLora.projeto));
    estadoLora.projeto = JSON.parse(anterior) as ProjetoLora;
    limparSelecaoOrfa();
    avisar('projeto');
    agendarGravacao();
    return true;
  },

  refazer(): boolean {
    const proximo = futuro.pop();
    if (proximo === undefined) return false;
    passado.push(JSON.stringify(estadoLora.projeto));
    estadoLora.projeto = JSON.parse(proximo) as ProjetoLora;
    limparSelecaoOrfa();
    avisar('projeto');
    agendarGravacao();
    return true;
  },

  // ---------------------------------------------------------------- Meus projetos

  listarProjetos(): (ProjetoGravado & { atual: boolean })[] {
    const atual = biblioteca.atual();
    return biblioteca.listar().map((p) => ({ ...p, atual: p.id === atual }));
  },

  /** Cria um projeto e o abre: vazio, ou cópia do projeto da tela. */
  criarProjeto(nome: string, base: 'vazio' | 'copia'): string {
    gravarAgora();
    const novo = base === 'copia' ? (JSON.parse(JSON.stringify(estadoLora.projeto)) as ProjetoLora) : projetoVazio('');
    novo.nome = biblioteca.nomeLivre(nome);
    const id = biblioteca.criar(novo.nome, JSON.stringify(novo), Date.now());
    abrirNaTela(id, novo);
    return id;
  },

  abrirProjeto(id: string): boolean {
    if (id === biblioteca.atual()) return true;
    const texto = biblioteca.texto(id);
    if (texto === null) return false;
    let novo: ProjetoLora;
    try {
      novo = conferirProjeto(JSON.parse(texto));
    } catch (erro) {
      console.warn('O projeto de rádio gravado não pôde ser aberto.', erro);
      return false;
    }
    gravarAgora();
    abrirNaTela(id, novo);
    return true;
  },

  renomearProjeto(id: string, nome: string): void {
    const novoNome = biblioteca.nomeLivre(nomeLimpo(nome), id);
    if (id === biblioteca.atual()) {
      estadoLora.projeto.nome = novoNome;
      gravarAgora();
      avisar('projeto');
    } else {
      const item = biblioteca.listar().find((p) => p.id === id);
      const texto = biblioteca.texto(id);
      if (!item || texto === null) return;
      try {
        const dados = JSON.parse(texto) as { nome?: string };
        dados.nome = novoNome;
        biblioteca.salvar(id, novoNome, JSON.stringify(dados), item.alteradoEm);
      } catch {
        return;
      }
    }
    avisar('projetos');
  },

  duplicarProjeto(id: string): string | null {
    const texto = id === biblioteca.atual() ? JSON.stringify(estadoLora.projeto) : biblioteca.texto(id);
    const item = biblioteca.listar().find((p) => p.id === id);
    if (texto === null || !item) return null;
    try {
      const dados = JSON.parse(texto) as { nome?: string };
      dados.nome = biblioteca.nomeLivre(`${item.nome} (cópia)`);
      const copia = biblioteca.criar(dados.nome, JSON.stringify(dados), Date.now());
      avisar('projetos');
      return copia;
    } catch {
      return null;
    }
  },

  /** Apaga um projeto. Se era o da tela, abre o alterado mais recentemente, ou um projeto vazio. Não tem desfazer. */
  apagarProjeto(id: string): boolean {
    if (!biblioteca.listar().some((p) => p.id === id)) return false;
    const eraODaTela = id === biblioteca.atual();
    biblioteca.apagar(id);
    if (!eraODaTela) {
      avisar('projetos');
      return true;
    }
    for (const outro of biblioteca.listar()) {
      const texto = biblioteca.texto(outro.id);
      if (texto === null) continue;
      try {
        abrirNaTela(outro.id, conferirProjeto(JSON.parse(texto)));
        return true;
      } catch {
        // Projeto que não abre: tenta o seguinte.
      }
    }
    const vazio = projetoVazio('Minha rede');
    abrirNaTela(biblioteca.criar(vazio.nome, JSON.stringify(vazio), Date.now()), vazio);
    return true;
  },

  /** Abre um arquivo como projeto novo da lista. Lança erro se o arquivo não for um projeto de rádio. */
  importarProjeto(dados: unknown): void {
    const novo = conferirProjeto(dados);
    gravarAgora();
    novo.nome = biblioteca.nomeLivre(novo.nome);
    abrirNaTela(biblioteca.criar(novo.nome, JSON.stringify(novo), Date.now()), novo);
  },

  exportarProjeto(): string {
    return JSON.stringify(estadoLora.projeto, null, 2);
  },
};

garantirBiblioteca();
