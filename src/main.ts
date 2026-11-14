// Ponto de entrada. Monta a cena em tela cheia; os painéis entram depois.

import { criarCena } from './cena';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) criarCena(app);
