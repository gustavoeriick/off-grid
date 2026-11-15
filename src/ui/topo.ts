// Barra de cima: desfazer, refazer, novo, exportar, importar e "Editar casa". Tarefa 2.5, parte de interface.

import { acoes, assinar, estado } from '../estado';
import { el, mostrarMensagem } from './formato';

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

function exportar(): void {
  const blob = new Blob([acoes.exportarProjeto()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'projeto-offgrid.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importar(arquivo: File): Promise<void> {
  try {
    const dados: unknown = JSON.parse(await arquivo.text());
    acoes.carregarProjeto(dados);
    mostrarMensagem(`Projeto "${arquivo.name}" aberto.`);
  } catch (erro) {
    const motivo = erro instanceof SyntaxError ? 'O arquivo não é um projeto válido (não é JSON).' : erro instanceof Error ? erro.message : 'Erro desconhecido.';
    mostrarMensagem(`Não foi possível abrir o arquivo. ${motivo}`, true);
  }
}

export function montarTopo(): void {
  el('#botao-desfazer').addEventListener('click', () => acoes.desfazer());
  el('#botao-refazer').addEventListener('click', () => acoes.refazer());
  el('#botao-novo').addEventListener('click', () => {
    if (window.confirm('Começar um projeto novo? O projeto atual será substituído (dá para desfazer).')) acoes.novoProjeto();
  });
  el('#botao-exportar').addEventListener('click', exportar);

  const arquivo = el<HTMLInputElement>('#arquivo-importar');
  el('#botao-importar').addEventListener('click', () => arquivo.click());
  arquivo.addEventListener('change', () => {
    const f = arquivo.files?.[0];
    arquivo.value = '';
    if (f) void importar(f);
  });

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || emCampoDeTexto(e.target)) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) acoes.desfazer();
    else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) acoes.refazer();
    else return;
    e.preventDefault();
  });

  // Editar casa.
  const botao = el<HTMLButtonElement>('#botao-editar-casa');
  const seletor = el<HTMLElement>('#seletor-andar');
  const faixa = el<HTMLElement>('#faixa-edicao');
  const andares = document.querySelectorAll<HTMLButtonElement>('#seletor-andar button');
  botao.addEventListener('click', () => acoes.definirEdicaoDaCasa(!estado.edicaoCasa.ativa));
  andares.forEach((b) => b.addEventListener('click', () => acoes.definirEdicaoDaCasa(true, Number(b.dataset.andar) as 0 | 1)));

  // A faixa explica o modo em uma frase; um recado da cena (cômodos que se juntaram) toma o lugar dela por alguns segundos.
  const instrucao = faixa.textContent ?? '';
  let esperaDoRecado: ReturnType<typeof setTimeout> | null = null;
  const mostrarInstrucao = (): void => {
    if (esperaDoRecado) clearTimeout(esperaDoRecado);
    esperaDoRecado = null;
    faixa.textContent = instrucao;
    faixa.classList.remove('recado');
  };
  window.addEventListener('offgrid:aviso-edicao', (e) => {
    const texto = (e as CustomEvent<{ texto: string }>).detail?.texto;
    if (!texto) return;
    if (esperaDoRecado) clearTimeout(esperaDoRecado);
    faixa.textContent = texto;
    faixa.classList.add('recado');
    esperaDoRecado = setTimeout(mostrarInstrucao, 9000);
  });

  // Uma mudança seguinte na casa (outra edição, um desfazer) deixa o recado velho: volta a instrução.
  // O recado chega depois do aviso da mudança que o causou, então não é apagado por ela.
  assinar('casa', () => {
    if (esperaDoRecado) mostrarInstrucao();
  });

  let ativaAntes = false;
  const desenhar = (): void => {
    const { ativa, andar } = estado.edicaoCasa;
    // Casa de um andar não tem "Superior": volta ao térreo.
    if (ativa && andar === 1 && estado.projeto.casa.andares < 2) return acoes.definirEdicaoDaCasa(true, 0);
    if (ativa !== ativaAntes) mostrarInstrucao();
    ativaAntes = ativa;
    botao.setAttribute('aria-pressed', String(ativa));
    botao.textContent = ativa ? 'Sair da edição' : 'Editar casa';
    faixa.hidden = !ativa;
    seletor.hidden = !ativa || estado.projeto.casa.andares < 2;
    andares.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.andar) === andar)));
  };
  assinar('edicao', desenhar);
  assinar('projeto', desenhar);
  desenhar();
}
