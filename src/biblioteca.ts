// Biblioteca de projetos gravados no navegador: "Minha casa", "Casa dos pais"...
// Aqui fica só a gravação: um índice com nome e data de cada projeto e um texto JSON por projeto.
// Quem abre, troca e apaga é o estado (src/estado.ts). Sem localStorage (testes, navegação privada restrita),
// tudo vale só na memória, enquanto a página está aberta.

export interface ProjetoGravado {
  id: string;
  nome: string;
  /** Instante da última gravação, em milissegundos UTC. */
  alteradoEm: number;
}

interface Indice {
  /** Projeto aberto. Nulo enquanto a biblioteca está vazia. */
  atual: string | null;
  itens: ProjetoGravado[];
}

const CHAVE_INDICE = 'offgrid.projetos';
const chaveDe = (id: string): string => `offgrid.projetos.${id}`;

/** Cópia em memória: é ela que responde; o localStorage é a cópia que sobrevive a fechar a página. */
const memoria = new Map<string, string>();

function guarda(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function ler(chave: string): string | null {
  const daMemoria = memoria.get(chave);
  if (daMemoria !== undefined) return daMemoria;
  try {
    const texto = guarda()?.getItem(chave) ?? null;
    if (texto !== null) memoria.set(chave, texto);
    return texto;
  } catch {
    return null;
  }
}

function gravar(chave: string, texto: string): void {
  memoria.set(chave, texto);
  try {
    guarda()?.setItem(chave, texto);
  } catch (erro) {
    console.warn('Não foi possível gravar no navegador; o projeto vale só enquanto a página estiver aberta.', erro);
  }
}

function apagar(chave: string): void {
  memoria.delete(chave);
  try {
    guarda()?.removeItem(chave);
  } catch {
    // Sem permissão: a chave fica órfã, sem efeito.
  }
}

function lerIndice(): Indice {
  try {
    const dados: unknown = JSON.parse(ler(CHAVE_INDICE) ?? 'null');
    if (dados && typeof dados === 'object') {
      const { atual, itens } = dados as { atual?: unknown; itens?: unknown };
      const lista = (Array.isArray(itens) ? itens : []).filter(
        (i): i is ProjetoGravado =>
          !!i && typeof i === 'object' && typeof (i as ProjetoGravado).id === 'string' && typeof (i as ProjetoGravado).nome === 'string' && Number.isFinite((i as ProjetoGravado).alteradoEm),
      );
      return { atual: typeof atual === 'string' && lista.some((i) => i.id === atual) ? atual : null, itens: lista };
    }
  } catch {
    // Índice ilegível: começa vazio. Os textos dos projetos continuam nas chaves deles.
  }
  return { atual: null, itens: [] };
}

function gravarIndice(indice: Indice): void {
  gravar(CHAVE_INDICE, JSON.stringify(indice));
}

function novoId(indice: Indice): string {
  const usados = new Set(indice.itens.map((i) => i.id));
  let n = indice.itens.length + 1;
  while (usados.has(`p${n}`)) n += 1;
  return `p${n}`;
}

/** Nome sem espaços nas pontas, com no máximo 60 caracteres; vazio vira "Projeto sem nome". */
export function nomeLimpo(nome: string): string {
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpo === '' ? 'Projeto sem nome' : limpo;
}

/** Nome que ainda não existe na lista: "Casa", "Casa (2)", "Casa (3)"... */
export function nomeLivre(nome: string, ignorar?: string): string {
  const base = nomeLimpo(nome);
  const usados = new Set(lerIndice().itens.filter((i) => i.id !== ignorar).map((i) => i.nome));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

export const biblioteca = {
  /** Projetos gravados, do alterado mais recentemente para o mais antigo. */
  listar(): ProjetoGravado[] {
    return [...lerIndice().itens].sort((a, b) => b.alteradoEm - a.alteradoEm);
  },

  atual(): string | null {
    return lerIndice().atual;
  },

  /** Texto JSON do projeto, ou nulo se ele não existe. */
  texto(id: string): string | null {
    return lerIndice().itens.some((i) => i.id === id) ? ler(chaveDe(id)) : null;
  },

  /** Grava um projeto novo e devolve o `id` dele. Não muda qual é o atual. */
  criar(nome: string, texto: string, agoraMs: number): string {
    const indice = lerIndice();
    const id = novoId(indice);
    gravar(chaveDe(id), texto);
    indice.itens.push({ id, nome: nomeLivre(nome), alteradoEm: agoraMs });
    gravarIndice(indice);
    return id;
  },

  /** Regrava o texto de um projeto que já existe, com o nome e a data novos. Devolve falso se ele não existe. */
  salvar(id: string, nome: string, texto: string, agoraMs: number): boolean {
    const indice = lerIndice();
    const item = indice.itens.find((i) => i.id === id);
    if (!item) return false;
    gravar(chaveDe(id), texto);
    item.nome = nome;
    item.alteradoEm = agoraMs;
    gravarIndice(indice);
    return true;
  },

  definirAtual(id: string | null): void {
    const indice = lerIndice();
    indice.atual = id !== null && indice.itens.some((i) => i.id === id) ? id : null;
    gravarIndice(indice);
  },

  apagar(id: string): void {
    const indice = lerIndice();
    indice.itens = indice.itens.filter((i) => i.id !== id);
    if (indice.atual === id) indice.atual = null;
    gravarIndice(indice);
    apagar(chaveDe(id));
  },

  /** Só para os testes: esvazia a biblioteca. */
  esvaziar(): void {
    for (const i of lerIndice().itens) apagar(chaveDe(i.id));
    apagar(CHAVE_INDICE);
  },
};
