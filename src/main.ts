// Ponto de entrada. O coordenador da fase 1 substitui este aviso pela montagem da cena e dos painéis.

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <main class="aviso">
      <h1>Simulador off-grid</h1>
      <p>Em construção. O plano está em <code>docs/plano-de-desenvolvimento.md</code>.</p>
    </main>
  `;
}
