// Painel "Meus projetos": a lista dos projetos gravados no navegador, para abrir, criar, renomear, duplicar e apagar.
// Especificação: docs/especificacao/fase-2.md, seção 9. A gravação e a troca são do estado; aqui só se mostra e se pede.

import { acoes, assinar, emTutorial, estado } from '../estado';
import { criarSobreposto } from './aprender';
import { el, h, mostrarMensagem, substituir } from './formato';

/** Projeto com o nome em edição, ou nulo. */
let renomeando: string | null = null;

function dataTexto(ms: number): string {
  const d = new Date(ms);
  const dois = (n: number): string => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** O nome do projeto aberto aparece no título da aba e no menu Projeto. */
function mostrarNomeAberto(): void {
  const nome = emTutorial() ? 'Tutorial' : estado.projeto.nome;
  document.title = `${nome} · Simulador off-grid`;
  const linha = document.querySelector<HTMLElement>('#projeto-aberto');
  if (linha) linha.textContent = emTutorial() ? 'Você está no tutorial. A sua casa está guardada.' : `Aberto: ${nome}`;
}

export function montarProjetos(): void {
  const { corpo, abrir, fechar } = criarSobreposto('painel-projetos', 'Meus projetos', () => desenhar());

  const botao = (rotulo: string, acao: string, aoClicar: () => void, extra: Record<string, string | boolean> = {}): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-acao': acao, ...extra }, rotulo);
    b.addEventListener('click', aoClicar);
    return b;
  };

  const linhaDoProjeto = (p: ReturnType<typeof acoes.listarProjetos>[number], unico: boolean): HTMLElement => {
    const acoesDaLinha = h('div', { class: 'projeto-botoes' });
    let titulo: HTMLElement;
    if (renomeando === p.id) {
      const campo = h('input', { type: 'text', class: 'projeto-nome-campo', value: p.nome, maxlength: '60', 'aria-label': 'Nome do projeto' });
      const salvar = (): void => {
        renomeando = null;
        acoes.renomearProjeto(p.id, campo.value);
        desenhar();
      };
      campo.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') salvar();
        if (e.key === 'Escape') {
          renomeando = null;
          desenhar();
        }
      });
      titulo = h('div', { class: 'projeto-titulo' }, campo);
      acoesDaLinha.append(
        botao('Salvar o nome', 'salvar-nome', salvar),
        botao('Cancelar', 'cancelar-nome', () => {
          renomeando = null;
          desenhar();
        }),
      );
      requestAnimationFrame(() => {
        campo.focus();
        campo.select();
      });
    } else {
      titulo = h(
        'div',
        { class: 'projeto-titulo' },
        h('strong', null, p.nome),
        p.atual ? h('span', { class: 'projeto-aberto' }, 'aberto') : null,
        h('span', { class: 'detalhe' }, `alterado em ${dataTexto(p.alteradoEm)}`),
      );
      acoesDaLinha.append(
        botao(
          'Abrir',
          'abrir',
          () => {
            if (acoes.abrirProjeto(p.id)) {
              fechar();
              mostrarMensagem(`Projeto "${p.nome}" aberto.`);
            } else {
              mostrarMensagem(`Não foi possível abrir "${p.nome}".`, true);
            }
          },
          p.atual ? { disabled: true, title: 'Este é o projeto que está aberto' } : {},
        ),
        botao('Renomear', 'renomear', () => {
          renomeando = p.id;
          desenhar();
        }),
        botao('Duplicar', 'duplicar', () => {
          acoes.duplicarProjeto(p.id);
          desenhar();
        }),
        botao(
          'Apagar',
          'apagar',
          () => {
            const aviso = unico
              ? `Apagar "${p.nome}"? É o único projeto: no lugar dele abre uma casa vazia. Isto não pode ser desfeito.`
              : `Apagar "${p.nome}"? Isto não pode ser desfeito.`;
            if (!window.confirm(aviso)) return;
            acoes.apagarProjeto(p.id);
            desenhar();
          },
          { class: 'passo-botao perigo' },
        ),
      );
    }
    return h('article', { class: p.atual ? 'projeto-item atual' : 'projeto-item', 'data-projeto': p.id, 'data-nome': p.nome }, titulo, acoesDaLinha);
  };

  const formularioDeNovo = (): HTMLElement => {
    const nome = h('input', { type: 'text', id: 'novo-projeto-nome', maxlength: '60', placeholder: 'Por exemplo: Casa dos pais' });
    nome.addEventListener('keydown', (e) => e.stopPropagation());
    const vazia = h('input', { type: 'radio', name: 'novo-projeto-base', value: 'vazia', checked: true });
    const copia = h('input', { type: 'radio', name: 'novo-projeto-base', value: 'copia' });
    const criar = (): void => {
      const dado = nome.value.trim();
      if (dado === '') {
        nome.focus();
        return mostrarMensagem('Dê um nome ao projeto novo.', true);
      }
      const id = acoes.criarProjeto(dado, copia.checked ? 'copia' : 'vazia');
      if (id === null) return;
      fechar();
      mostrarMensagem(`Projeto "${estado.projeto.nome}" criado e aberto.`);
    };
    nome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') criar();
    });
    return h(
      'form',
      { class: 'projeto-novo', id: 'novo-projeto' },
      h('h4', null, 'Novo projeto'),
      h('label', { class: 'projeto-novo-nome' }, 'Nome ', nome),
      h('label', null, vazia, ' Casa vazia: a casa do cenário inicial, sem equipamentos'),
      h('label', null, copia, ` Cópia de "${estado.projeto.nome}": mesma casa e mesma montagem`),
      botao('Criar e abrir', 'criar', criar),
    );
  };

  function desenhar(): void {
    const lista = acoes.listarProjetos();
    if (renomeando !== null && !lista.some((p) => p.id === renomeando)) renomeando = null;
    const novo = formularioDeNovo();
    novo.addEventListener('submit', (e) => e.preventDefault());
    substituir(corpo, [
      h(
        'p',
        { class: 'detalhe' },
        'Cada projeto guarda a casa, a posição dela em relação ao sol, a cidade e a montagem. Trocar de projeto grava antes o que está na tela.',
      ),
      h('div', { class: 'projeto-lista', id: 'lista-de-projetos' }, ...lista.map((p) => linhaDoProjeto(p, lista.length === 1))),
      novo,
      h(
        'p',
        { class: 'passo-dica' },
        'Os projetos ficam gravados neste navegador. Limpar os dados do site apaga todos: use "Exportar" no menu Projeto para ter uma cópia em arquivo.',
      ),
    ]);
  }

  el('#botao-meus-projetos').addEventListener('click', abrir);

  const painel = el<HTMLElement>('#painel-projetos');
  const atualizar = (): void => {
    mostrarNomeAberto();
    // Dentro do tutorial a lista não pode ser mexida: o painel fecha.
    if (emTutorial()) return fechar();
    if (!painel.hidden) desenhar();
  };
  assinar('projetos', atualizar);
  assinar('projeto', mostrarNomeAberto);
  mostrarNomeAberto();
}
