import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos, para o site funcionar em uma subpasta (GitHub Pages).
  base: './',
  build: {
    // Duas páginas, dois ambientes: energia solar (index.html) e rádio LoRa (lora.html).
    // Os caminhos são relativos à raiz do projeto.
    rolldownOptions: {
      input: { index: 'index.html', lora: 'lora.html' },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
