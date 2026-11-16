// Barra de cima: desfazer, refazer, novo, exportar, importar e "Editar casa". Tarefa 2.5, parte de interface.

import { CATALOGO } from '../catalogo';
import { acoes, assinar, emTutorial, estado } from '../estado';
import { analisarCircuito } from '../nucleo/circuito';
import { sequenciaDeEnergizar } from '../nucleo/operacao';
import type { AnaliseCircuito } from '../nucleo/tipos';
import { el, mostrarMensagem } from './formato';

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable || alvo.tagName === 'TEXTAREA') return true;
  // Controle deslizante, caixa de marcar e botão não recebem texto: com o foco neles, os atalhos continuam valendo.
  return alvo instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'file'].includes(alvo.type);
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
    // O arquivo entra como um projeto novo de "Meus projetos": o que estava na tela continua gravado na lista.
    acoes.importarProjeto(dados);
    mostrarMensagem(`Arquivo "${arquivo.name}" aberto como o projeto "${estado.projeto.nome}".`);
  } catch (erro) {
    const motivo = erro instanceof SyntaxError ? 'O arquivo não é um projeto válido (não é JSON).' : erro instanceof Error ? erro.message : 'Erro desconhecido.';
    mostrarMensagem(`Não foi possível abrir o arquivo. ${motivo}`, true);
  }
}

/** Menu "Projeto": abre com o botão; fecha ao escolher um item, ao clicar fora e com Esc. */
function montarMenuDoProjeto(): void {
  const botao = el<HTMLButtonElement>('#botao-projeto');
  const lista = el<HTMLElement>('#lista-projeto');
  const alternar = (aberto: boolean): void => {
    lista.hidden = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
  };
  botao.addEventListener('click', () => alternar(lista.hidden === true));
  lista.addEventListener('click', (e) => {
    if ((e.target as Element).closest('button')) alternar(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if (!lista.hidden && !(e.target as Element).closest?.('#menu-projeto')) alternar(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lista.hidden) alternar(false);
  });
}

/** Menu "Cabos": "Arrumar os cabos" põe os grampos sozinho e "Soltar os cabos" tira todos (cena-e-interface.md, seção 8). */
function montarMenuDosCabos(): void {
  const botao = el<HTMLButtonElement>('#botao-cabos');
  const lista = el<HTMLElement>('#lista-cabos');
  const alternar = (aberto: boolean): void => {
    lista.hidden = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
  };
  botao.addEventListener('click', () => alternar(lista.hidden === true));
  window.addEventListener('pointerdown', (e) => {
    if (!lista.hidden && !(e.target as Element).closest?.('#menu-cabos')) alternar(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lista.hidden) alternar(false);
  });
  el('#botao-arrumar-cabos').addEventListener('click', () => {
    alternar(false);
    if (estado.projeto.cabos.length === 0) return mostrarMensagem('Não há cabos para arrumar. Puxe um cabo de um terminal a outro primeiro.');
    mostrarMensagem('Arrumando os cabos…');
    // A conta leva um instante: a mensagem aparece antes de ela começar.
    setTimeout(() => {
      const r = window.__offgrid?.arrumarCabos?.();
      if (!r) return mostrarMensagem('Não foi possível arrumar os cabos: a cena 3D não está pronta.', true);
      const cabos = r.arrumados === 1 ? '1 cabo arrumado' : `${r.arrumados} cabos arrumados`;
      const semCaminho = r.semCaminho.length === 0 ? '' : r.semCaminho.length === 1 ? ' Um cabo ficou sem caminho pelas paredes e cruza o vão em linha reta.' : ` ${r.semCaminho.length} cabos ficaram sem caminho pelas paredes e cruzam o vão em linha reta.`;
      mostrarMensagem(`${cabos}, com ${r.grampos} grampos.${semCaminho} O comprimento de cada cabo foi medido de novo pelo caminho.`);
    }, 30);
  });
  el('#botao-soltar-cabos').addEventListener('click', () => {
    alternar(false);
    const soltos = window.__offgrid?.soltarCabos?.() ?? 0;
    mostrarMensagem(soltos === 0 ? 'Nenhum cabo está preso por grampos.' : soltos === 1 ? '1 cabo solto: os grampos dele foram tirados.' : `${soltos} cabos soltos: os grampos foram tirados.`);
  });
}

/**
 * "Ligar o sistema" (operar.md, seção 6): fecha as chaves na ordem certa. Com erro de polaridade ou de curto, o núcleo
 * recusa e a tela mostra o motivo. Usado pelo menu "Projeto" e pela linha "Sem energia nos aparelhos" dos mostradores.
 */
export function ligarOSistema(): void {
  const recusa = acoes.energizar();
  if (recusa) mostrarMensagem(recusa.texto, true);
}

/** O texto de um aviso `{ codigo, uids, texto }` devolvido por uma ação; nulo quando ela não devolve nada. */
function textoDoAviso(aviso: unknown): string | null {
  if (typeof aviso !== 'object' || aviso === null || !('texto' in aviso)) return null;
  return typeof aviso.texto === 'string' && aviso.texto.trim() !== '' ? aviso.texto : null;
}

/**
 * "Desligar o sistema" (operar.md, seção 6): abre as chaves na ordem inversa. Quando algo fica ligado (por exemplo,
 * placas sem disjuntor continuam ligadas ao controlador, que fica na bateria), o núcleo devolve um aviso e a tela o mostra.
 */
export function desligarOSistema(): void {
  const aviso: unknown = acoes.desenergizar();
  const texto = textoDoAviso(aviso);
  if (texto) mostrarMensagem(texto);
}

/**
 * "Ligar o sistema" e "Desligar o sistema" (operar.md, seção 6), no menu "Projeto" (na barra do alto não cabe em 1280 px): visível quando há inversor no projeto. Mostra o que faz sentido
 * agora: se ainda há manobra de ligar a fazer, "Ligar"; se não, "Desligar". Com erro de polaridade ou de curto na montagem,
 * o núcleo recusa e a tela mostra o motivo.
 */
function montarBotaoDoSistema(): void {
  const botao = el<HTMLButtonElement>('#botao-sistema');
  const faltaLigar = (analise: AnaliseCircuito): boolean => {
    const plano = sequenciaDeEnergizar(estado.projeto, CATALOGO, analise);
    return plano.recusa !== null || plano.manobras.length > 0;
  };
  const desenhar = (): void => {
    const temInversor = estado.projeto.dispositivos.some((d) => CATALOGO.get(d.itemId)?.categoria === 'inversor');
    botao.hidden = !temInversor;
    if (!temInversor) return;
    const ligar = faltaLigar(estado.derivados.analise);
    botao.textContent = ligar ? 'Ligar o sistema' : 'Desligar o sistema';
    botao.dataset.acao = ligar ? 'ligar-sistema' : 'desligar-sistema';
    botao.title = ligar
      ? 'Fecha as proteções e liga o inversor na ordem certa: bateria, placas, inversor, saída. Os aparelhos não entram.'
      : 'Desliga na ordem: saída, inversor, placas e bateria. Placas sem disjuntor continuam ligadas ao controlador.';
  };
  botao.addEventListener('click', () => {
    // A análise dos derivados pode estar um instante atrasada depois de uma manobra: confere de novo na hora do clique.
    if (!faltaLigar(analisarCircuito(estado.projeto, CATALOGO))) {
      desligarOSistema();
      return;
    }
    ligarOSistema();
  });
  for (const nome of ['projeto', 'dispositivos', 'cabos', 'derivados'] as const) assinar(nome, desenhar);
  desenhar();
}

export function montarTopo(): void {
  montarMenuDoProjeto();
  montarMenuDosCabos();
  montarBotaoDoSistema();
  el('#botao-desfazer').addEventListener('click', () => acoes.desfazer());
  el('#botao-refazer').addEventListener('click', () => acoes.refazer());
  el('#botao-novo').addEventListener('click', () => {
    if (window.confirm('Voltar este projeto ao plano inicial? A montagem atual será substituída (dá para desfazer).')) acoes.novoProjeto();
  });
  el('#botao-exportar').addEventListener('click', exportar);

  const arquivo = el<HTMLInputElement>('#arquivo-importar');
  el('#botao-importar').addEventListener('click', () => arquivo.click());
  arquivo.addEventListener('change', () => {
    const f = arquivo.files?.[0];
    arquivo.value = '';
    if (f) void importar(f);
  });

  // Com o botão do mouse apertado (peça, cabo ou medida sendo arrastada), desfazer e refazer esperam o arraste acabar:
  // trocar o projeto no meio dele deixaria o arraste sem ponto de retorno.
  let arrastando = false;
  // Só conta o que começa na cena ou em um cartão do catálogo: uma lista de opções aberta não devolve o "soltar" à página.
  window.addEventListener('pointerdown', (e) => (arrastando = e.target instanceof Element && e.target.closest('#cena, #lista-catalogo') !== null), true);
  for (const tipo of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(tipo, () => (arrastando = false), true);

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || emCampoDeTexto(e.target)) return;
    if (arrastando) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) acoes.desfazer();
    else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) acoes.refazer();
    else return;
    e.preventDefault();
  });

  el('#botao-vista-inicial').addEventListener('click', () => window.dispatchEvent(new CustomEvent('offgrid:vista-inicial')));

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

  // No tutorial só existe o quartinho: medidas da casa, edição da casa, "Novo" e "Importar" saem do topo, e aparece o rótulo "Tutorial".
  // O projeto do tutorial não é um cenário para trocar: "Novo" recomeçaria o tutorial e "Importar" o apagaria.
  const escondidosNoTutorial = ['#abrir-casa', '#botao-editar-casa', '#botao-novo', '#botao-importar', '#botao-meus-projetos'].map((s) => el<HTMLElement>(s));
  const rotuloTutorial = el('#rotulo-tutorial');
  const desenharTutorial = (): void => {
    const tutorial = emTutorial();
    escondidosNoTutorial.forEach((b) => (b.hidden = tutorial));
    rotuloTutorial.hidden = !tutorial;
    if (tutorial) {
      if (estado.edicaoCasa.ativa) acoes.definirEdicaoDaCasa(false);
      el('#form-casa').hidden = true;
    }
  };
  assinar('projeto', desenharTutorial);
  desenharTutorial();

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
    el('#ajuda-camera').hidden = ativa;
    seletor.hidden = !ativa || estado.projeto.casa.andares < 2;
    andares.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.andar) === andar)));
  };
  assinar('edicao', desenhar);
  assinar('projeto', desenhar);
  desenhar();
}
