// Importador da coleta de preços do Mercado Livre.
// Uso: node scripts/importar-pesquisa.mjs [caminho do .md]
// Lê pesquisa/precos-mercado-livre-AAAA-MM-DD.md e grava o .json ao lado.
// Especificação: docs/especificacao/catalogo.md, seção 1.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'pesquisa');

function achaArquivo() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const md = readdirSync(pasta)
    .filter((n) => /^precos-mercado-livre-\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .sort();
  if (md.length === 0) throw new Error('Nenhuma coleta encontrada em pesquisa/');
  return join(pasta, md[md.length - 1]);
}

/** Divide "3.750,00" ou "1.286 (nota)" em número e nota. Valores vazios viram null. */
function lePreco(texto) {
  const t = texto.trim();
  if (t === '' || t === '-' || /^não informado/i.test(t)) return { valor: null, nota: null };
  const m = t.match(/^([\d.,]+)\s*(?:\((.*)\))?\s*$/);
  if (!m) throw new Error(`Preço ilegível: "${texto}"`);
  const valor = Number(m[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor)) throw new Error(`Preço ilegível: "${texto}"`);
  return { valor: Math.round(valor * 100) / 100, nota: m[2] ? m[2].trim() : null };
}

function leCodigo(link) {
  let m = link.match(/\/(?:p|up)\/(MLBU?\d+)/);
  if (m) return m[1];
  m = link.match(/\/MLB-(\d+)-/);
  if (m) return `MLB${m[1]}`;
  throw new Error(`Código não encontrado no link: ${link}`);
}

const ouNulo = (t) => {
  const s = t.trim();
  return s === '' || s === '-' || /^não informado$/i.test(s) ? null : s;
};

export function converte(texto) {
  const linhas = texto.split(/\r?\n/);
  const cab = linhas[0].match(/coleta em (\d{4}-\d{2}-\d{2})/);
  if (!cab) throw new Error('A primeira linha deve trazer a data da coleta');
  const registros = [];
  let secao = null;
  let tituloSecao = null;
  for (const linha of linhas.slice(1)) {
    const s = linha.match(/^## (\S+) - (.*)$/);
    if (s) {
      secao = s[1];
      tituloSecao = s[2].trim();
      continue;
    }
    if (/^## /.test(linha)) {
      secao = null; // Observações e o que vier depois
      continue;
    }
    if (secao === null || !linha.startsWith('| ') || linha.startsWith('| Busca')) continue;
    const cols = linha.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (cols.length !== 12) throw new Error(`Linha com ${cols.length} colunas na seção ${secao}: ${linha.slice(0, 80)}`);
    const [busca, titulo, marcaModelo, especificacoes, preco, pix, riscado, frete, vendedor, loja, vendidos, link] = cols;
    const p = lePreco(preco);
    registros.push({
      secao,
      tituloSecao,
      busca,
      titulo,
      marcaModelo,
      especificacoes,
      preco: p.valor,
      notaPreco: p.nota,
      precoPix: lePreco(pix).valor,
      precoRiscado: lePreco(riscado).valor,
      frete,
      vendedor,
      lojaOficial: /^sim/i.test(loja) ? true : /^não/i.test(loja) ? false : null,
      vendidosNota: ouNulo(vendidos),
      link,
      codigo: leCodigo(link),
    });
  }
  return { coletadoEm: cab[1], registros };
}

const entrada = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entrada) {
  const md = achaArquivo();
  const saida = md.replace(/\.md$/, '.json');
  const dados = converte(readFileSync(md, 'utf8'));
  writeFileSync(saida, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  console.log(`${dados.registros.length} registros gravados em ${saida}`);
}
