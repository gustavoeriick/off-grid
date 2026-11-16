// Busca de endereço sobre o mapa. Especificação: docs/especificacao/lora.md, seção 7.1.
// O texto digitado só sai do navegador no Enter ou no botão "Buscar", depois de a pessoa aceitar o aviso uma vez.
// O texto e os resultados vivem só nesta tela: nada vai para o projeto, o desfazer, a exportação nem o localStorage.
// A única gravação é a marca de que o aviso foi aceito. O nome de cada resultado entra sempre como texto, nunca como HTML.

import {
  ATRIBUICAO_DOS_ENDERECOS,
  buscarEnderecos,
  cancelarBuscaDeEndereco,
  ErroDeEndereco,
  INTERVALO_MINIMO_MS,
  LINK_DA_ATRIBUICAO,
  textoBasta,
  TAMANHO_MINIMO_DO_TEXTO,
  type EscopoDaBusca,
  type ResultadoDeEndereco,
} from '../dados/enderecos';
import { acoesLora, assinarLora } from '../estado';
import type { MapaLora } from '../mapa/mapa';
import { h } from './dom';

const CHAVE_DO_AVISO = 'offgrid.lora.avisoEndereco';
const ZOOM_MAXIMO_DA_CAIXA = 16;
const ZOOM_SEM_CAIXA = 15;

const FRASE_FIXA = 'O texto da busca vai para o OpenStreetMap.';
const TEXTO_DO_AVISO =
  'O texto que você digitar aqui vai para o Nominatim, o serviço de endereços do OpenStreetMap, que fica fora deste navegador. Se digitar o endereço da sua casa, o serviço recebe esse endereço. Dá para buscar só a rua ou o bairro, sem o número, e ajustar o ponto à mão no mapa. Os pontos que você marca continuam sem sair deste navegador.';
const FALHA_SEM_RESPOSTA = 'A busca de endereço não respondeu. Tente de novo ou marque o ponto à mão no mapa.';
const FALHA_RECUSA = 'O serviço de endereços recusou o pedido, por excesso de uso. Espere um minuto e tente de novo, ou marque o ponto à mão no mapa.';
const NADA_NO_BRASIL = 'Nada encontrado no Brasil com esse texto.';
const NADA_NO_MUNDO = 'Nada encontrado com esse texto.';

export function montarBuscaDeEndereco(raiz: HTMLElement, mapa: MapaLora): void {
  const campo = h('input', {
    type: 'search',
    id: 'lora-endereco',
    class: 'lora-endereco-campo',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '200',
    placeholder: 'Rua ou bairro, cidade',
  });
  const rotulo = h('label', { for: 'lora-endereco', class: 'lora-endereco-rotulo' }, 'Buscar endereço');
  const botao = h('button', { type: 'submit', id: 'lora-endereco-buscar', title: 'Procura o lugar no OpenStreetMap. A busca só sai quando você clica aqui ou aperta Enter' }, 'Buscar');
  const formulario = h('form', { class: 'lora-endereco-form', role: 'search', novalidate: true }, rotulo, campo, botao);
  const frase = h('p', { class: 'lora-endereco-frase', id: 'lora-endereco-frase' }, FRASE_FIXA);

  const aviso = h('section', { class: 'lora-endereco-aviso', id: 'lora-aviso-endereco', role: 'alertdialog', 'aria-label': 'Aviso de privacidade da busca de endereço', hidden: true });
  const resultados = h('div', { class: 'lora-endereco-resultados', id: 'lora-endereco-resultados', hidden: true });
  const caixa = h('div', { class: 'lora-endereco', id: 'lora-endereco-caixa' }, formulario, frase, aviso, resultados);
  raiz.append(caixa);

  let avisoAceito = false;
  try {
    avisoAceito = localStorage.getItem(CHAVE_DO_AVISO) === 'sim';
  } catch {
    // Sem acesso ao armazenamento do navegador: o aviso volta na próxima visita.
  }

  /** Cada busca e cada fechamento mudam a geração; resposta de uma geração antiga é ignorada. */
  let geracao = 0;
  let ocupado = false;
  let escopoPendente: EscopoDaBusca = 'brasil';
  let temporizadorDoBotao: ReturnType<typeof setTimeout> | null = null;
  let botaoMundo: HTMLButtonElement | null = null;

  function limparResultados(): void {
    resultados.hidden = true;
    resultados.replaceChildren();
    botaoMundo = null;
  }

  /** Tira a lista, o aviso e a marca. Com `tirarMarca` falso, a marca já se foi por conta própria. */
  function fecharTudo(tirarMarca: boolean): void {
    geracao += 1;
    cancelarBuscaDeEndereco();
    if (temporizadorDoBotao) clearTimeout(temporizadorDoBotao);
    temporizadorDoBotao = null;
    ocupado = false;
    botao.disabled = false;
    aviso.hidden = true;
    limparResultados();
    if (tirarMarca) mapa.mostrarLugarProvisorio(null);
  }

  function mostrarTexto(texto: string, extra: HTMLElement[] = [], alerta = false): void {
    resultados.replaceChildren(h('p', { class: 'lora-endereco-estado', id: 'lora-endereco-estado', role: alerta ? 'alert' : 'status' }, texto), ...extra);
    resultados.hidden = false;
  }

  function atribuicao(): HTMLElement {
    const [antes, depois] = ATRIBUICAO_DOS_ENDERECOS.split('© colaboradores do OpenStreetMap');
    return h(
      'p',
      { class: 'lora-endereco-atribuicao', id: 'lora-endereco-atribuicao' },
      antes,
      h('a', { href: LINK_DA_ATRIBUICAO, target: '_blank', rel: 'noopener noreferrer' }, '© colaboradores do OpenStreetMap'),
      depois,
    );
  }

  function escolher(r: ResultadoDeEndereco, itemEscolhido: HTMLButtonElement): void {
    for (const b of resultados.querySelectorAll('.lora-endereco-resultado')) b.classList.toggle('escolhido', b === itemEscolhido);
    if (r.caixa) mapa.enquadrarCaixa(r.caixa, ZOOM_MAXIMO_DA_CAIXA);
    else mapa.irPara(r.lat, r.lon, ZOOM_SEM_CAIXA);
    mapa.mostrarLugarProvisorio({ lat: r.lat, lon: r.lon }, () => fecharTudo(false));
  }

  function mostrarResultados(lista: ResultadoDeEndereco[], escopo: EscopoDaBusca): void {
    if (lista.length === 0) {
      const extra: HTMLElement[] = [];
      if (escopo === 'brasil') {
        const mundo = h('button', { type: 'button', id: 'lora-endereco-mundo', title: 'Repete a busca sem limitar ao Brasil' }, 'Procurar no mundo todo');
        // Só liga quando o botão "Buscar" também volta (1 s depois do pedido anterior).
        mundo.disabled = ocupado;
        botaoMundo = mundo;
        mundo.addEventListener('click', () => void executar('mundo'));
        extra.push(mundo);
      }
      extra.push(atribuicao());
      mostrarTexto(escopo === 'brasil' ? NADA_NO_BRASIL : NADA_NO_MUNDO, extra);
      return;
    }
    const itens = lista.map((r) => {
      // O nome vem do serviço: entra como texto puro.
      const b = h('button', { type: 'button', class: 'lora-endereco-resultado', title: 'Ir até este lugar' });
      b.textContent = r.nome;
      b.addEventListener('click', () => escolher(r, b));
      return b;
    });
    resultados.replaceChildren(h('div', { class: 'lora-endereco-lista', role: 'group', 'aria-label': 'Lugares encontrados' }, ...itens), atribuicao());
    resultados.hidden = false;
  }

  async function executar(escopo: EscopoDaBusca): Promise<void> {
    const texto = campo.value;
    if (ocupado) return;
    if (!textoBasta(texto)) {
      mostrarTexto(`Digite pelo menos ${TAMANHO_MINIMO_DO_TEXTO} letras.`);
      return;
    }
    // Uma busca nova tira a marca e a lista da anterior.
    fecharTudo(true);
    const minha = geracao;
    ocupado = true;
    botao.disabled = true;
    const inicio = Date.now();
    mostrarTexto('Buscando…');
    try {
      const lista = await buscarEnderecos(texto, escopo);
      if (minha !== geracao) return;
      mostrarResultados(lista, escopo);
    } catch (e) {
      if (minha !== geracao) return;
      const erro = e instanceof ErroDeEndereco ? e : null;
      if (erro?.tipo === 'cancelada') return;
      mostrarTexto(erro?.tipo === 'recusa' ? FALHA_RECUSA : FALHA_SEM_RESPOSTA, [], true);
    }
    // O botão volta quando a resposta chegou e passou 1 s do pedido.
    temporizadorDoBotao = setTimeout(() => {
      temporizadorDoBotao = null;
      if (minha !== geracao) return;
      ocupado = false;
      botao.disabled = false;
      if (botaoMundo) botaoMundo.disabled = false;
    }, Math.max(0, INTERVALO_MINIMO_MS - (Date.now() - inicio)));
  }

  function pedirOAviso(escopo: EscopoDaBusca): void {
    escopoPendente = escopo;
    limparResultados();
    const buscar = h('button', { type: 'button', id: 'lora-aviso-endereco-buscar' }, 'Buscar');
    const cancelar = h('button', { type: 'button', id: 'lora-aviso-endereco-cancelar' }, 'Cancelar');
    buscar.addEventListener('click', () => {
      avisoAceito = true;
      try {
        localStorage.setItem(CHAVE_DO_AVISO, 'sim');
      } catch {
        // Sem acesso ao armazenamento do navegador: vale só até fechar a página.
      }
      aviso.hidden = true;
      void executar(escopoPendente);
    });
    cancelar.addEventListener('click', () => {
      aviso.hidden = true;
      campo.focus();
    });
    aviso.replaceChildren(h('h4', null, 'O que a busca envia'), h('p', null, TEXTO_DO_AVISO), h('div', { class: 'lora-endereco-aviso-botoes' }, buscar, cancelar));
    aviso.hidden = false;
  }

  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    if (ocupado) return;
    if (!textoBasta(campo.value)) {
      mostrarTexto(`Digite pelo menos ${TAMANHO_MINIMO_DO_TEXTO} letras.`);
      return;
    }
    if (!avisoAceito) {
      pedirOAviso('brasil');
      return;
    }
    void executar('brasil');
  });

  // O que se digita aqui não é atalho do ambiente (Ctrl+Z, Delete, setas do mapa). Esc fecha a lista e a marca.
  campo.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') fecharTudo(true);
  });
  // Esc dentro do aviso, da lista ou dos botões da caixa também fecha.
  caixa.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.target === campo) return;
    e.stopPropagation();
    fecharTudo(true);
    campo.focus();
  });
  // Trocar de projeto tira a marca e a lista.
  const projetoAberto = (): string | null => acoesLora.listarProjetos().find((p) => p.atual)?.id ?? null;
  let idDoProjeto = projetoAberto();
  assinarLora('projetos', () => {
    const id = projetoAberto();
    if (id === idDoProjeto) return;
    idDoProjeto = id;
    fecharTudo(true);
  });
}
