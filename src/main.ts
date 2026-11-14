// Ponto de entrada. Monta a cena no centro da tela e liga os controles.

import { criarCena } from './cena';
import { montarInterface } from './ui';

const cena = document.querySelector<HTMLElement>('#cena');

if (cena) {
  criarCena(cena);
  montarInterface();
}
