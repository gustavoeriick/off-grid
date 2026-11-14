import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos, para o site funcionar em uma subpasta (GitHub Pages).
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
