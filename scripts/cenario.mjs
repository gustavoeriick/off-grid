// Imprime o relatório em texto do "plano no papel" e do "plano corrigido".
// O núcleo é TypeScript sem passo de compilação: o vite, que já é dependência do projeto, carrega os módulos.
// Uso: npm run cenario

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const servidor = await createServer({
  root: raiz,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const { CATALOGO } = await servidor.ssrLoadModule('/src/catalogo/index.ts');
  const { cenarioPlanoNoPapel, cenarioPlanoCorrigido } = await servidor.ssrLoadModule('/src/nucleo/cenarios.ts');
  const { relatorioDoCenario } = await servidor.ssrLoadModule('/src/nucleo/relatorio.ts');
  const textos = [cenarioPlanoNoPapel(), cenarioPlanoCorrigido()].map((p) => relatorioDoCenario(p, CATALOGO));
  console.log(textos.join('\n\n\n'));
} finally {
  await servidor.close();
}
