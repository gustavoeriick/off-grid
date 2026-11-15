// Barra do alto do ambiente de LoRa: desfazer, refazer, menu Projeto e o painel "Meus projetos".
// Especificação: docs/especificacao/lora.md, seção 1.

import { acoesLora, assinarLora, estadoLora } from '../estado';
import { dataTexto, el, h, mostrarMensagem } from './dom';

function exportar(): void {
  const blob = new Blob([acoesLora.exportarProjeto()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'rede-lora.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importar(arquivo: File): Promise<void> {
  try {
    acoesLora.importarProjeto(JSON.parse(await arquivo.text()));
    mostrarMensagem(`Arquivo "${arquivo.name}" aberto como o projeto "${estadoLora.projeto.nome}".`);
  } catch (erro) {
    const motivo = erro instanceof SyntaxError ? 'O arquivo não é um projeto válido (não é JSON).' : erro instanceof Error ? erro.message : 'Erro desconhecido.';
    mostrarMensagem(`Não foi possível abrir o arquivo. ${motivo}`, true);
  }
}

function montarMenu(): void {
  const botao = el<HTMLButtonElement>('#lora-botao-projeto');
  const lista = el<HTMLElement>('#lora-lista-projeto');
  const alternar = (aberto: boolean): void => {
    lista.hidden = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
  };
  botao.addEventListener('click', () => alternar(lista.hidden === true));
  lista.addEventListener('click', (e) => {
    if ((e.target as Element).closest('button')) alternar(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if (!lista.hidden && !(e.target as Element).closest?.('#lora-menu-projeto')) alternar(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lista.hidden) alternar(false);
  });
}

/** Painel "Meus projetos": a lista dos projetos de rádio gravados no navegador. */
function montarProjetos(): void {
  const corpo = h('div', { class: 'sobreposto-corpo' });
  const fecharBotao = h('button', { type: 'button', class: 'fechar-sobreposto' }, 'Fechar');
  const painel = h(
    'section',
    { id: 'lora-painel-projetos', class: 'painel-sobreposto', role: 'dialog', 'aria-label': 'Meus projetos', hidden: true },
    h('div', { class: 'sobreposto-titulo' }, h('h3', null, 'Meus projetos'), fecharBotao),
    corpo,
  );
  document.body.append(painel);
  const fechar = (): void => {
    painel.hidden = true;
  };
  fecharBotao.addEventListener('click', fechar);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !painel.hidden) fechar();
  });

  let renomeando: string | null = null;
  const botao = (rotulo: string, acao: string, aoClicar: () => void, extra: Record<string, string | boolean> = {}): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'passo-botao', 'data-acao': acao, ...extra }, rotulo);
    b.addEventListener('click', aoClicar);
    return b;
  };

  function desenhar(): void {
    const lista = acoesLora.listarProjetos();
    const itens = lista.map((p) => {
      const botoes = h('div', { class: 'projeto-botoes' });
      let titulo: HTMLElement;
      if (renomeando === p.id) {
        const campo = h('input', { type: 'text', class: 'projeto-nome-campo', value: p.nome, maxlength: '60', 'aria-label': 'Nome do projeto' });
        const salvar = (): void => {
          renomeando = null;
          acoesLora.renomearProjeto(p.id, campo.value);
          desenhar();
        };
        campo.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') salvar();
        });
        titulo = h('div', { class: 'projeto-titulo' }, campo);
        botoes.append(botao('Salvar o nome', 'salvar-nome', salvar));
        requestAnimationFrame(() => campo.focus());
      } else {
        titulo = h('div', { class: 'projeto-titulo' }, h('strong', null, p.nome), p.atual ? h('span', { class: 'projeto-aberto' }, 'aberto') : null, h('span', { class: 'detalhe' }, `alterado em ${dataTexto(p.alteradoEm)}`));
        botoes.append(
          botao(
            'Abrir',
            'abrir',
            () => {
              if (acoesLora.abrirProjeto(p.id)) {
                fechar();
                mostrarMensagem(`Projeto "${p.nome}" aberto.`);
              } else mostrarMensagem(`Não foi possível abrir "${p.nome}".`, true);
            },
            p.atual ? { disabled: true, title: 'Este é o projeto que está aberto' } : {},
          ),
          botao('Renomear', 'renomear', () => {
            renomeando = p.id;
            desenhar();
          }),
          botao('Duplicar', 'duplicar', () => {
            acoesLora.duplicarProjeto(p.id);
            desenhar();
          }),
          botao(
            'Apagar',
            'apagar',
            () => {
              if (!window.confirm(`Apagar "${p.nome}"? Isto não pode ser desfeito.`)) return;
              acoesLora.apagarProjeto(p.id);
              desenhar();
            },
            { class: 'passo-botao perigo' },
          ),
        );
      }
      return h('article', { class: p.atual ? 'projeto-item atual' : 'projeto-item', 'data-projeto': p.id, 'data-nome': p.nome }, titulo, botoes);
    });

    const nome = h('input', { type: 'text', id: 'lora-novo-projeto-nome', maxlength: '60', placeholder: 'Por exemplo: Rede da família' });
    const copia = h('input', { type: 'checkbox', id: 'lora-novo-projeto-copia' });
    const criar = (): void => {
      if (nome.value.trim() === '') {
        nome.focus();
        return mostrarMensagem('Dê um nome ao projeto novo.', true);
      }
      acoesLora.criarProjeto(nome.value, copia.checked ? 'copia' : 'vazio');
      fechar();
      mostrarMensagem(`Projeto "${estadoLora.projeto.nome}" criado e aberto.`);
    };
    nome.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') criar();
    });
    corpo.replaceChildren(
      h('p', { class: 'detalhe' }, 'Cada projeto guarda os pontos do mapa, as antenas e os repetidores. Trocar de projeto grava antes o que está na tela.'),
      h('div', { class: 'projeto-lista', id: 'lora-lista-de-projetos' }, ...itens),
      h(
        'div',
        { class: 'projeto-novo' },
        h('h4', null, 'Novo projeto'),
        h('label', { class: 'projeto-novo-nome' }, 'Nome ', nome),
        h('label', null, copia, ` Começar como cópia de "${estadoLora.projeto.nome}"`),
        botao('Criar e abrir', 'criar', criar),
      ),
      h('p', { class: 'passo-dica' }, 'Os projetos ficam gravados neste navegador. Limpar os dados do site apaga todos: use "Exportar" no menu Projeto para ter uma cópia em arquivo.'),
    );
  }

  el('#lora-meus-projetos').addEventListener('click', () => {
    renomeando = null;
    desenhar();
    painel.hidden = false;
  });
  assinarLora('projetos', () => {
    if (!painel.hidden) desenhar();
  });
}

export function montarTopoLora(): void {
  montarMenu();
  montarProjetos();
  el('#lora-desfazer').addEventListener('click', () => acoesLora.desfazer());
  el('#lora-refazer').addEventListener('click', () => acoesLora.refazer());
  el('#lora-exportar').addEventListener('click', exportar);
  const arquivo = el<HTMLInputElement>('#lora-arquivo');
  el('#lora-importar').addEventListener('click', () => arquivo.click());
  arquivo.addEventListener('change', () => {
    const f = arquivo.files?.[0];
    arquivo.value = '';
    if (f) void importar(f);
  });
  window.addEventListener('keydown', (e) => {
    const alvo = e.target as Element | null;
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) {
      e.preventDefault();
      acoesLora.desfazer();
    } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
      e.preventDefault();
      acoesLora.refazer();
    }
  });

  const mostrarNome = (): void => {
    document.title = `${estadoLora.projeto.nome} · Rádio LoRa · Simulador off-grid`;
    el('#lora-projeto-aberto').textContent = `Aberto: ${estadoLora.projeto.nome}`;
  };
  assinarLora('projeto', mostrarNome);
  mostrarNome();
}
