// Menu "Visores", na barra de ajuda sobre a cena: como os números ao vivo de cada peça aparecem.
// Especificação: docs/especificacao/operar.md, seção 7.2. Ajustes A1 e A2 do plano.
//
// O ajuste (`estado.visores`) fica gravado no navegador, não no projeto. "Todos no lugar padrão" mexe no projeto:
// devolve os visores arrastados (`Dispositivo.visor`) para cima da peça de cada um.

import { acoes, assinar, estado, type ModoDosVisores, type TamanhoDosVisores } from '../estado';
import { el, mostrarMensagem } from './formato';

/** Menu "Visores ▾": abre com o botão; fecha ao clicar fora e com Esc. Escolher um modo ou um tamanho não fecha: dá para ver o efeito na cena. */
export function montarVisores(): void {
  const barra = el<HTMLElement>('#ajuda-camera');
  const botao = el<HTMLButtonElement>('#botao-visores');
  const lista = el<HTMLElement>('#lista-visores');
  const modos = lista.querySelectorAll<HTMLButtonElement>('[data-modo-dos-visores]');
  const tamanhos = lista.querySelectorAll<HTMLButtonElement>('[data-tamanho-dos-visores]');
  const noPadrao = el<HTMLButtonElement>('#botao-visores-no-padrao');

  const alternar = (aberto: boolean): void => {
    lista.hidden = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
    barra.classList.toggle('com-menu', aberto);
  };
  const desenhar = (): void => {
    const { modo, tamanho } = estado.visores;
    modos.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modoDosVisores === modo)));
    tamanhos.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tamanhoDosVisores === tamanho));
      // No modo "tamanho real" não há visor ampliado para mudar de tamanho.
      b.disabled = modo === 'real';
    });
    noPadrao.disabled = !estado.projeto.dispositivos.some((d) => d.visor !== undefined);
  };

  botao.addEventListener('click', () => {
    desenhar();
    alternar(lista.hidden === true);
  });
  modos.forEach((b) => b.addEventListener('click', () => acoes.definirVisores({ modo: b.dataset.modoDosVisores as ModoDosVisores })));
  tamanhos.forEach((b) => b.addEventListener('click', () => acoes.definirVisores({ tamanho: b.dataset.tamanhoDosVisores as TamanhoDosVisores })));
  noPadrao.addEventListener('click', () => {
    const quantos = estado.projeto.dispositivos.filter((d) => d.visor !== undefined).length;
    acoes.visoresNoLugarPadrao();
    alternar(false);
    if (quantos > 0) mostrarMensagem(quantos === 1 ? 'O visor voltou para cima da peça dele. Ctrl+Z desfaz.' : `Os ${quantos} visores voltaram para cima da peça de cada um. Ctrl+Z desfaz.`);
  });
  window.addEventListener('pointerdown', (e) => {
    if (!lista.hidden && !(e.target as Element).closest?.('#menu-visores')) alternar(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lista.hidden) alternar(false);
  });

  assinar('visores', desenhar);
  assinar('dispositivos', () => {
    if (!lista.hidden) desenhar();
  });
  desenhar();
}
