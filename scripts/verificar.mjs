// Roteiro de verificação visual. Especificação: docs/especificacao/cena-e-interface.md, seção 14.
// Faz o build, sobe o vite preview, conduz a tela pelos controles e grava capturas em verificacao/.
// Qualquer erro de console ou de página faz o roteiro terminar com código 1.

import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'verificacao');

const erros = [];
let servidor = null;
let navegador = null;

function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function conferir(condicao, mensagem) {
  if (!condicao) throw new Error(`Conferência falhou: ${mensagem}`);
}

async function esperarServidor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await esperar(200);
  }
  throw new Error('O vite preview não respondeu a tempo.');
}

async function abrirNavegador() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true, args });
    } catch (e) {
      console.warn(`Não abriu ${channel}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error('Nem o Chrome nem o Edge puderam ser abertos.');
}

async function encerrar(codigo) {
  try {
    await navegador?.close();
  } catch {
    /* ignora */
  }
  if (servidor && servidor.pid) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: 'ignore' });
      else servidor.kill();
    } catch {
      /* já encerrou */
    }
  }
  process.exit(codigo);
}

async function principal() {
  console.log('Build...');
  execSync('npm run build', { cwd: raiz, stdio: 'inherit' });

  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });

  const porta = await portaLivre();
  servidor = spawn(process.execPath, [join(raiz, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(porta), '--strictPort', '--host', '127.0.0.1'], {
    cwd: raiz,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${porta}/`;
  await esperarServidor(url);

  navegador = await abrirNavegador();
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  pagina.on('console', (m) => {
    if (m.type() === 'error') erros.push(`console: ${m.text()}`);
  });
  pagina.on('pageerror', (e) => erros.push(`página: ${e.message}`));
  pagina.on('requestfailed', (r) => erros.push(`requisição falhou: ${r.url()}`));
  pagina.on('response', (r) => {
    if (r.status() >= 400) erros.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  // O projeto agora fica gravado no navegador: começa sempre do zero.
  await pagina.goto(url);
  await pagina.evaluate(() => localStorage.clear());
  await pagina.reload();
  await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });

  const estado = () => pagina.evaluate(() => JSON.parse(JSON.stringify(window.__offgrid.estado())));
  /** Hora local do Rio (decimal) e dia/mês do estado. */
  const quando = async () => {
    const e = await estado();
    const d = new Date(e.tempo.msUtc - 3 * 3600_000);
    return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1, hora: d.getUTCHours() + d.getUTCMinutes() / 60 };
  };
  const captura = async (nome) => {
    await esperar(500);
    await pagina.screenshot({ path: join(pasta, `${nome}.png`) });
    console.log(`captura: ${nome}.png`);
  };

  const CAMERA_INICIAL = { pos: [-14, 11, -16], alvo: [0, 2.5, 0] };
  const mudarCamera = (pos, alvo) => pagina.evaluate(([p, a]) => window.__offgrid.posicionarCamera(p, a), [pos, alvo]);
  /** Captura vista de cima (norte para cima na tela, se a cena seguir a especificação) e devolve a câmera à posição inicial. */
  const de_cima = async (nome) => {
    await mudarCamera([0, 45, 0.01], [0, 0, 0]);
    await captura(nome);
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
  };
  /** Preenche um campo numérico do formulário e confirma com Tab (dispara o evento change). */
  const preencher = async (seletor, valor) => {
    await pagina.locator(seletor).fill(String(valor));
    await pagina.locator(seletor).press('Tab');
  };

  async function verificarPaineis() {
    const cartoes = () => pagina.locator('#lista-catalogo .cartao').count();
    // Catálogo: cada aba lista itens; o filtro por linha esconde o que não é da linha.
    for (const aba of ['placas', 'baterias', 'inversores', 'controladores', 'protecoes', 'aparelhos', 'instalacao']) {
      await pagina.locator(`#abas-catalogo [data-cat="${aba}"]`).click();
      conferir((await cartoes()) > 0, `a aba ${aba} do catálogo deveria listar itens`);
    }
    await pagina.locator('#abas-catalogo [data-cat="aparelhos"]').click();
    conferir((await pagina.locator('#lista-catalogo .cartao .preco').count()) === 0, 'aparelhos não mostram preço');
    await pagina.locator('#abas-catalogo [data-cat="instalacao"]').click();
    conferir((await pagina.locator('#lista-catalogo .cartao[data-arrastavel]').count()) === 1, 'na aba Instalação só o quadro é arrastável');
    await captura('14b-catalogo-instalacao');
    await pagina.locator('#abas-catalogo [data-cat="placas"]').click();
    const todas = await cartoes();
    await pagina.locator('#filtro-linha [data-linha="simples"]').click();
    const simples = await pagina.locator('#lista-catalogo .cartao').evaluateAll((l) => l.map((c) => c.dataset.linha));
    conferir(simples.every((x) => x === 'simples') && simples.length <= todas, 'o filtro "simples" deveria mostrar só a linha simples');
    await pagina.locator('#filtro-linha [data-linha="todas"]').click();
    const links = await pagina.locator('#lista-catalogo .cartao a').evaluateAll((l) => l.map((a) => [a.target, a.rel]));
    conferir(links.length > 0 && links.every(([t, r]) => t === '_blank' && r === 'noopener noreferrer'), 'links de anúncio abrem em nova aba com rel seguro');
    await captura('14-catalogo-placas');

    // Catálogo por tipo: um cartão só para as placas de 585 W, com 2 modelos; os links ficam no detalhe.
    const cartoesPlaca = pagina.locator('#lista-catalogo .cartao', { has: pagina.locator('h4', { hasText: /^Placa solar de 585 W$/ }) });
    conferir((await cartoesPlaca.count()) === 1, 'as placas de 585 W deveriam ser um cartão só');
    const c585 = cartoesPlaca.first();
    conferir((await c585.getAttribute('data-modelos')) === '2', 'o cartão de 585 W deveria ter 2 modelos');
    conferir((await c585.locator('.ver-modelos').textContent()).includes('2 modelos no mercado'), 'o cartão mostra "2 modelos no mercado"');
    conferir((await c585.locator('a').count()) === 0 && (await c585.locator('.modelos').count()) === 0, 'fechado, o cartão de 585 W não lista modelos nem links');
    const ordemW = await pagina.locator('#lista-catalogo .cartao h4').allTextContents();
    const pot = ordemW.map((t) => Number(/de (\d+) W/.exec(t)?.[1]));
    conferir(pot.every((x, i) => i === 0 || x >= pot[i - 1]), `os cartões de placa deveriam estar em ordem crescente: ${ordemW.join(' | ')}`);
    const idReferencia = await c585.getAttribute('data-item-id');
    await c585.locator('.ver-modelos').click();
    conferir((await c585.locator('.modelos .modelo').count()) === 2, 'abrir o detalhe lista os 2 modelos');
    const linksDetalhe = await c585.locator('.modelos a').evaluateAll((l) => l.map((a) => [a.textContent, a.target, a.rel]));
    conferir(linksDetalhe.length === 2 && linksDetalhe.every(([t, a, r]) => t === 'ver anúncio' && a === '_blank' && r === 'noopener noreferrer'), 'o detalhe mostra o link "ver anúncio" de cada modelo');
    await captura('14c-catalogo-detalhe-aberto');
    const outro = await c585.locator('.modelos .modelo:not(.escolhido)').first().getAttribute('data-modelo-id');
    conferir(outro && outro !== idReferencia, 'deveria haver um modelo diferente do de referência');
    await c585.locator(`.modelo[data-modelo-id="${outro}"] .modelo-nome`).click();
    conferir((await c585.getAttribute('data-item-id')) === outro, 'escolher o outro modelo deveria mudar o data-item-id do cartão');
    // telaDoCartao de um item que não é o de referência: volta à referência e depois ao outro.
    await pagina.evaluate(() => {
      window.__arrastos = [];
      window.addEventListener('offgrid:arrastar-item', (ev) => window.__arrastos.push(ev.detail));
    });
    await pagina.evaluate((id) => window.__offgrid.telaDoCartao(id), idReferencia);
    const centroOutro = await pagina.evaluate((id) => window.__offgrid.telaDoCartao(id), outro);
    conferir(Array.isArray(centroOutro), 'telaDoCartao de um modelo que não é o de referência deveria devolver o ponto');
    conferir(
      (await pagina.locator('#lista-catalogo .cartao', { has: pagina.locator('h4', { hasText: /^Placa solar de 585 W$/ }) }).getAttribute('data-item-id')) === outro,
      'telaDoCartao deveria escolher o modelo pedido',
    );
    await pagina.mouse.move(centroOutro[0], centroOutro[1]);
    await pagina.mouse.down();
    await pagina.mouse.up();
    const arrastoOutro = await pagina.evaluate(() => window.__arrastos);
    conferir(arrastoOutro.length === 1 && arrastoOutro[0].itemId === outro, 'arrastar o cartão deveria usar o modelo escolhido');
    // Apertar um link, botão ou opção dentro do cartão não inicia arraste.
    const antesDosArrastos = arrastoOutro.length;
    await pagina.locator('#lista-catalogo .cartao .ver-modelos').first().click();
    await pagina.locator('#lista-catalogo .cartao .ver-modelos').first().click();
    conferir((await pagina.evaluate(() => window.__arrastos.length)) === antesDosArrastos, 'clicar no botão "ver modelos" não deveria iniciar arraste');
    await pagina.evaluate((id) => window.__offgrid.telaDoCartao(id), idReferencia);

    // O cartão arrastável avisa a cena com o evento, sem fazer mais nada.
    const idCartao = await pagina.locator('#lista-catalogo .cartao[data-arrastavel]').first().getAttribute('data-item-id');
    await pagina.evaluate(() => {
      window.__arrastos = [];
    });
    const centro = await pagina.evaluate((id) => window.__offgrid.telaDoCartao(id), idCartao);
    conferir(Array.isArray(centro), 'telaDoCartao deveria devolver o centro do cartão');
    await pagina.mouse.move(centro[0], centro[1]);
    await pagina.mouse.down();
    await pagina.mouse.up();
    const arrastos = await pagina.evaluate(() => window.__arrastos);
    conferir(arrastos.length === 1 && arrastos[0].itemId === idCartao && Math.abs(arrastos[0].clientX - centro[0]) < 1, 'apertar o cartão deveria disparar offgrid:arrastar-item');

    // Consultor e orçamento do cenário inicial.
    conferir((await pagina.locator('#painel-consultor .sugestao').count()) === 7, 'o cenário inicial deveria mostrar 7 sugestões');
    await captura('16-consultor');
    await pagina.locator('[data-aba="orcamento"]').click();
    const total = await pagina.locator('#total-orcamento strong').textContent();
    conferir(total === 'R$ 8.668,19', `o total do orçamento deveria ser R$ 8.668,19, veio ${total}`);
    await captura('17-orcamento');
    await pagina.locator('[data-aba="sistema"]').click();
    conferir((await pagina.locator('#painel-sistema .linha-aparelho').count()) > 0, 'a aba Sistema lista os aparelhos');
    await captura('18-sistema');
    await pagina.locator('[data-aba="consultor"]').click();

    // Item selecionado: um aparelho.
    const aparelho = (await estado()).projeto.dispositivos.find((d) => d.itemId.startsWith('ap-'));
    conferir(aparelho, 'o cenário inicial deveria ter aparelhos');
    conferir(await pagina.locator('#item-selecionado').isHidden(), 'sem seleção o painel do item fica escondido');
    await pagina.evaluate((uid) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid }), aparelho.uid);
    conferir((await pagina.locator('#item-selecionado .comodo').textContent()).startsWith('Cômodo:'), 'o painel do aparelho mostra o cômodo');
    await captura('15-item-selecionado');
    // Desligar pelo painel muda o estado; Desfazer volta.
    await pagina.locator('#item-selecionado [data-acao="ligar"]').click();
    let d = (await estado()).projeto.dispositivos.find((x) => x.uid === aparelho.uid);
    conferir(d.ligado === false, 'desligar pelo painel deveria mudar o estado');
    await pagina.locator('#item-selecionado [data-acao="dia-inteiro"]').click();
    d = (await estado()).projeto.dispositivos.find((x) => x.uid === aparelho.uid);
    conferir(d.uso?.inicio === 0 && d.uso?.fim === 24, '"o dia inteiro" deveria gravar o uso de 0 a 24');
    await pagina.locator('#botao-desfazer').click();
    await pagina.locator('#botao-desfazer').click();
    d = (await estado()).projeto.dispositivos.find((x) => x.uid === aparelho.uid);
    conferir(d.ligado === true && d.uso === null, 'Desfazer deveria devolver o aparelho ao que era');
    await pagina.keyboard.press('Control+Y');
    d = (await estado()).projeto.dispositivos.find((x) => x.uid === aparelho.uid);
    conferir(d.ligado === false, 'Ctrl+Y deveria refazer');
    await pagina.keyboard.press('Control+Z');
    d = (await estado()).projeto.dispositivos.find((x) => x.uid === aparelho.uid);
    conferir(d.ligado === true, 'Ctrl+Z deveria desfazer');

    // Item selecionado: trocar o modelo de uma placa pelo painel; Desfazer volta.
    const placa = (await estado()).projeto.dispositivos.find((x) => x.itemId === 'placa-renepv-585' || x.itemId === 'placa-ronma-585');
    conferir(placa, 'o cenário inicial deveria ter uma placa de 585 W');
    await pagina.evaluate((uid) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid }), placa.uid);
    conferir((await pagina.locator('#item-selecionado h3').textContent()) === 'Placa solar de 585 W', 'o painel mostra o nome do tipo em destaque');
    conferir((await pagina.locator('#item-selecionado .modelo-do-item').textContent()).includes('Modelo:'), 'o painel mostra "Modelo:"');
    conferir((await pagina.locator('#item-selecionado a', { hasText: 'ver anúncio' }).count()) === 1, 'o painel mostra o link do anúncio do modelo atual');
    const outraPlaca = placa.itemId === 'placa-renepv-585' ? 'placa-ronma-585' : 'placa-renepv-585';
    await captura('15c-item-selecionado-modelo');
    await pagina.locator('#item-selecionado select[data-modelo]').selectOption(outraPlaca);
    conferir((await estado()).projeto.dispositivos.find((x) => x.uid === placa.uid).itemId === outraPlaca, 'trocar o modelo pelo painel deveria mudar o itemId');
    await pagina.locator('#botao-desfazer').click();
    conferir((await estado()).projeto.dispositivos.find((x) => x.uid === placa.uid).itemId === placa.itemId, 'Desfazer deveria devolver o modelo');
    await pagina.evaluate(() => window.__offgrid.acoes.selecionar(null));

    // Item selecionado: um cabo.
    const cabo = (await estado()).projeto.cabos[0];
    await pagina.evaluate((uid) => window.__offgrid.acoes.selecionar({ tipo: 'cabo', uid }), cabo.uid);
    const textoCabo = await pagina.locator('#item-selecionado').textContent();
    conferir(textoCabo.includes('Corrente de projeto') && textoCabo.includes('Queda de tensão') && textoCabo.includes('Comprimento'), 'o painel do cabo mostra corrente, queda e comprimento');
    await captura('15b-cabo-selecionado');
    await pagina.evaluate(() => window.__offgrid.acoes.selecionar(null));
    conferir(await pagina.locator('#item-selecionado').isHidden(), 'sem seleção o painel do item some');

    // Exportar e importar: por código, e pelos botões.
    const igual = await pagina.evaluate(() => {
      const a = window.__offgrid.acoes;
      const antes = a.exportarProjeto();
      a.novoProjeto();
      a.carregarProjeto(JSON.parse(antes));
      return a.exportarProjeto() === antes;
    });
    conferir(igual, 'exportar e importar por código deveria manter o projeto');
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('#botao-exportar').click()]);
    conferir(download.suggestedFilename().endsWith('.json'), 'Exportar baixa um .json');
    const caminho = join(pasta, 'exportado.json');
    await download.saveAs(caminho);
    const antes = JSON.stringify((await estado()).projeto);
    await pagina.evaluate(() => window.__offgrid.acoes.definirClima('nublado'));
    await pagina.locator('#arquivo-importar').setInputFiles(caminho);
    await pagina.waitForFunction((x) => JSON.stringify(window.__offgrid.estado().projeto) === x, antes, { timeout: 5000 });
    await pagina.locator('#arquivo-importar').setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('{"versao":99}') });
    await pagina.waitForSelector('#mensagem.erro:not([hidden])', { timeout: 5000 });
    conferir(JSON.stringify((await estado()).projeto) === antes, 'um arquivo recusado não muda o projeto');
    await captura('19-mensagem-de-erro');

    // Novo pergunta antes.
    pagina.once('dialog', (dlg) => dlg.dismiss());
    await pagina.locator('#botao-novo').click();
    conferir(JSON.stringify((await estado()).projeto) === antes, 'cancelar o "Novo" não muda o projeto');

    // Editar casa: o seletor de andar aparece com 2 andares.
    conferir(await pagina.locator('#seletor-andar').isHidden(), 'o seletor de andar começa escondido');
    await pagina.locator('#botao-editar-casa').click();
    conferir((await estado()).edicaoCasa.ativa === true && (await pagina.locator('#faixa-edicao').isVisible()) && (await pagina.locator('#seletor-andar').isVisible()), 'Editar casa mostra a faixa e o seletor de andar');
    await pagina.locator('#seletor-andar [data-andar="1"]').click();
    conferir((await estado()).edicaoCasa.andar === 1, 'o seletor deveria escolher o andar superior');
    await captura('20-editar-casa');
    await pagina.locator('#botao-editar-casa').click();
    conferir((await estado()).edicaoCasa.ativa === false && (await pagina.locator('#faixa-edicao').isHidden()), 'Editar casa desliga');

    // Recarregar mantém uma mudança (gravada 500 ms depois).
    await pagina.locator('#clima').selectOption('limpo');
    await esperar(900);
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    conferir((await estado()).projeto.clima === 'limpo', 'recarregar a página deveria manter a mudança');
    await pagina.locator('#clima').selectOption('tipico');
    await esperar(900);
    conferir((await estado()).projeto.clima === 'tipico', 'o clima deveria voltar ao típico');
  }

  // 1. Tela inicial.
  await captura('01-tela-inicial');
  let e = await estado();
  conferir(e.visao === 'completa' && e.projeto.casa.andares === 2, 'estado inicial inesperado');

  // 1b. Painéis da fase 2 (catálogo, consultor, orçamento, item selecionado, barra de cima).
  await verificarPaineis();

  // 2. 21/06 pelos controles: data, depois hora.
  await pagina.locator('#mes').selectOption('5');
  await pagina.locator('#dia').fill('21');
  await pagina.locator('#dia').press('Tab');
  let q = await quando();
  conferir(q.dia === 21 && q.mes === 6, `data deveria ser 21/06, veio ${q.dia}/${q.mes}`);

  await pagina.locator('#hora').fill('720');
  q = await quando();
  conferir(q.hora === 12, `hora deveria ser 12, veio ${q.hora}`);
  // Sem captura aqui: a tela é igual à inicial (21/06, meio-dia).
  await de_cima('02-de-cima-meio-dia-21-06');

  await pagina.locator('#hora').fill('480');
  q = await quando();
  conferir(q.hora === 8 && q.dia === 21, `hora deveria ser 8, veio ${q.hora}`);
  await captura('03-oito-horas-21-06');
  await de_cima('03b-de-cima-oito-horas-21-06');

  await pagina.locator('#hora').fill('0');
  q = await quando();
  conferir(q.hora === 0 && q.dia === 21 && q.mes === 6, `deveria ser 21/06 à meia-noite, veio ${q.dia}/${q.mes} ${q.hora}`);
  await captura('04-meia-noite-21-06');

  await pagina.locator('#hora').fill('720');

  // 3. Modos de visão.
  for (const [rotulo, visao, nome] of [
    ['Sem telhado', 'sem-telhado', '05-visao-sem-telhado'],
    ['Só térreo', 'terreo', '06-visao-terreo'],
    ['Completa', 'completa', '07-visao-completa'],
  ]) {
    await pagina.getByRole('button', { name: rotulo, exact: true }).click();
    e = await estado();
    conferir(e.visao === visao, `visão deveria ser ${visao}`);
    await captura(nome);
  }

  // 4. Casa térrea, pelo formulário.
  await pagina.getByRole('button', { name: 'Casa', exact: true }).click();
  await pagina.locator('[data-casa="andares"]').selectOption('1');
  e = await estado();
  conferir(e.projeto.casa.andares === 1, 'a casa deveria ter 1 andar');
  await captura('08-casa-terrea-com-formulario');
  await pagina.locator('[data-casa="andares"]').selectOption('2');

  // Campos numéricos do corpo, pelo formulário, conferidos no estado.
  for (const [chave, valor] of [
    ['largura', 9],
    ['profundidade', 8],
    ['peDireito', 3],
    ['inclinacaoTelhadoPct', 40],
    ['beiral', 0.8],
  ]) {
    await preencher(`[data-casa="${chave}"]`, valor);
    e = await estado();
    conferir(e.projeto.casa[chave] === valor, `${chave} deveria ser ${valor}, veio ${e.projeto.casa[chave]}`);
  }
  await pagina.locator('[data-casa="andares"]').selectOption('1');
  await captura('08b-casa-medidas-alteradas');
  await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
  await captura('09-casa-terrea');

  // 5. Varanda nos quatro lados (casa de volta com 2 andares).
  await pagina.getByRole('button', { name: 'Casa', exact: true }).click();
  await pagina.locator('[data-casa="andares"]').selectOption('2');
  /** Liga ou desliga a varanda de um lado pela caixa "tem varanda". */
  const marcar = async (seletor, ligado) => {
    await pagina.locator(seletor).setChecked(ligado);
  };
  const lados = ['frente', 'fundos', 'esquerda', 'direita'];
  const apenas = async (lado) => {
    for (const l of lados) await marcar(`#varanda-${l}-tem`, l === lado);
  };
  for (const lado of lados) {
    await apenas(lado);
    e = await estado();
    conferir(e.projeto.casa.varandas.length === 1 && e.projeto.casa.varandas[0].lado === lado, `varanda deveria estar só em ${lado}`);
    await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
    await captura(`10-varanda-${lado}`);
    await pagina.getByRole('button', { name: 'Casa', exact: true }).click();
  }
  await apenas('frente');
  await preencher('#varanda-frente-prof', 4);
  await preencher('#varanda-frente-inc', 20);
  e = await estado();
  conferir(e.projeto.casa.varandas[0]?.profundidade === 4 && e.projeto.casa.varandas[0]?.inclinacaoPct === 20, 'varanda deveria ter profundidade 4 e inclinação 20');

  // Quartinho, campo a campo.
  for (const [chave, valor] of [
    ['x', 5],
    ['z', -3],
    ['largura', 3],
    ['profundidade', 2.5],
    ['altura', 2.6],
    ['giro', 30],
  ]) {
    await preencher(`#quartinho-${chave}`, valor);
    e = await estado();
    conferir(e.projeto.casa.quartinho[chave] === valor, `quartinho.${chave} deveria ser ${valor}, veio ${e.projeto.casa.quartinho[chave]}`);
  }
  await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
  await captura('10b-quartinho-alterado');
  await pagina.getByRole('button', { name: 'Casa', exact: true }).click();

  await apenas(null);
  e = await estado();
  conferir(e.projeto.casa.varandas.length === 0, 'as varandas deveriam sumir');
  await captura('11-sem-varanda-com-formulario');

  // Varanda na frente inteira mais meia varanda na direita.
  await apenas('frente');
  await marcar('#varanda-direita-tem', true);
  await marcar('#varanda-direita-inteira', false);
  await preencher('#varanda-direita-largura', 3);
  await preencher('#varanda-direita-desloc', 1);
  e = await estado();
  let vd = e.projeto.casa.varandas.find((x) => x.lado === 'direita');
  let vf = e.projeto.casa.varandas.find((x) => x.lado === 'frente');
  conferir(e.projeto.casa.varandas.length === 2 && vf?.largura === null && vd?.largura === 3 && vd?.deslocamento === 1, 'deveria haver varanda na frente inteira e meia varanda na direita');
  await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
  await captura('11b-frente-inteira-e-meia-direita');
  await de_cima('11c-de-cima-frente-inteira-e-meia-direita');
  await pagina.getByRole('button', { name: 'Casa', exact: true }).click();

  // Quatro varandas.
  for (const l of lados) await marcar(`#varanda-${l}-tem`, true);
  e = await estado();
  conferir(e.projeto.casa.varandas.length === 4 && lados.every((l) => e.projeto.casa.varandas.some((x) => x.lado === l)), 'deveria haver quatro varandas');
  await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
  await captura('11d-quatro-varandas');
  await de_cima('11e-de-cima-quatro-varandas');
  await pagina.getByRole('button', { name: 'Casa', exact: true }).click();

  // Altura mínima da beira: varanda de 6 m a 100% em casa térrea de pé-direito 2,2 deve ser cortada.
  await apenas(null);
  await pagina.locator('[data-casa="andares"]').selectOption('1');
  await preencher('[data-casa="peDireito"]', 2.2);
  await marcar('#varanda-frente-tem', true);
  await preencher('#varanda-frente-prof', 6);
  await preencher('#varanda-frente-inc', 100);
  e = await estado();
  const casaT = e.projeto.casa;
  const vt = casaT.varandas[0];
  const yParede = casaT.peDireito - 0.1;
  conferir(vt && yParede - (vt.profundidade * vt.inclinacaoPct) / 100 >= 2.0 - 1e-6, `a beira da varanda ficou abaixo de 2 m: ${JSON.stringify(vt)}`);
  conferir(
    Number(await pagina.locator('#varanda-frente-inc').inputValue()) === vt.inclinacaoPct && Number(await pagina.locator('#varanda-frente-prof').inputValue()) === vt.profundidade,
    'o formulário deveria mostrar os valores cortados',
  );
  await captura('11f-varanda-cortada-casa-terrea');
  // Volta ao estado das etapas seguintes: 2 andares, pé-direito 3, varanda na frente.
  await preencher('[data-casa="peDireito"]', 3);
  await pagina.locator('[data-casa="andares"]').selectOption('2');
  await apenas('frente');
  await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();

  // 6. Orientação 90 pela letra L, e pelo controle deslizante.
  await pagina.getByRole('button', { name: 'L', exact: true }).click();
  e = await estado();
  conferir(e.projeto.casa.orientacaoGraus === 90, 'orientação deveria ser 90');
  await captura('12-orientacao-90');
  await de_cima('12b-de-cima-orientacao-90');
  await pagina.locator('#rotacao').fill('45');
  e = await estado();
  conferir(e.projeto.casa.orientacaoGraus === 45, 'o controle deslizante deveria dar 45');
  await pagina.getByRole('button', { name: 'N', exact: true }).click();

  // 7. Clima e velocidade (conferidos pelo estado; o clima ainda não muda a cena).
  await pagina.locator('#clima').selectOption('nublado');
  e = await estado();
  conferir(e.projeto.clima === 'nublado', 'clima deveria ser nublado');
  await pagina.locator('#clima').selectOption('tipico');

  const antes = (await estado()).tempo.msUtc;
  await pagina.getByRole('button', { name: '60 min/s', exact: true }).click();
  await esperar(1500);
  const depois = (await estado()).tempo.msUtc;
  conferir(depois - antes > 30 * 60_000, `o tempo deveria avançar a 60 min/s, avançou ${(depois - antes) / 60000} min`);
  await captura('13-tempo-correndo');
  await pagina.getByRole('button', { name: 'Pausa', exact: true }).click();
  const parado = (await estado()).tempo.msUtc;
  await esperar(500);
  conferir((await estado()).tempo.msUtc === parado, 'o tempo deveria parar na pausa');

  // O avanço exige pelo menos o laço de renderização: confere que o canvas tem tamanho.
  const caixa = await pagina.locator('#cena canvas').boundingBox();
  conferir(caixa && caixa.width > 400 && caixa.height > 300, 'o canvas da cena deveria ocupar o centro');

  // 8. Interação com o ponteiro de verdade (tarefas 2.2 a 2.4): arrastar do catálogo, mover, girar, apagar, cabos,
  // proteções no quadro, peças que acompanham a casa e a ação "Acrescentar placa em série".
  async function verificarInteracao() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const projeto = async () => (await estado()).projeto;
    const peca = async (uid) => (await projeto()).dispositivos.find((d) => d.uid === uid);
    const situacao = () => og(() => window.__offgrid.interacao());
    const selecao = () => og(() => window.__offgrid.estado().selecao);
    const telaDoPonto = (p) => og((q) => window.__offgrid.telaDoPonto(q), p);
    const telaDoTerminal = (uid, terminal) => og(([u, t]) => window.__offgrid.telaDoTerminal(u, t), [uid, terminal]);
    /** Com a orientação 0 a casa fica girada de 180° no mundo: ponto da casa para ponto do mundo. */
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    const olharDaCasa = (pos, alvo) => mudarCamera(noMundo(pos), noMundo(alvo));
    /** Espera a cena tratar o último movimento do ponteiro (um por quadro) e devolve a situação. */
    const parado = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return situacao();
    };
    /** Aperta em `de` e leva o ponteiro até `ate`, sem soltar. */
    const levar = async (de, ate) => {
      await pagina.mouse.move(de[0], de[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.move(ate[0], ate[1], { steps: 10 });
      return parado();
    };
    const soltar = async () => {
      await pagina.mouse.up();
      await esperar(250);
    };
    const doCartao = async (itemId) => {
      const c = await og((id) => window.__offgrid.telaDoCartao(id), itemId);
      conferir(Array.isArray(c), `o catálogo deveria ter um cartão para ${itemId}`);
      return c;
    };
    const categoria = (itemId) => itemId.split('-')[0];

    // Começa do cenário inicial, com a casa inteira à vista.
    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await pagina.locator('[data-aba="consultor"]').click();
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
    await esperar(400);
    let p = await projeto();
    const placa1 = p.dispositivos.find((d) => d.uid === 'placa1');
    conferir(placa1?.superficie === 'telhado-varanda-frente', 'a placa do cenário inicial deveria estar no telhado da varanda');

    // ---- Placa do catálogo para o telhado da varanda: fantasma verde, peça criada e selecionada.
    const noTelhado = await telaDoPonto([placa1.pos[0] + 2.5, placa1.pos[1], placa1.pos[2]]);
    let s = await levar(await doCartao('placa-renepv-585'), noTelhado);
    conferir(s.modo === 'catalogo' && s.valido === true, `a placa sobre o telhado da varanda deveria ficar verde: ${JSON.stringify(s)}`);
    await captura('21-fantasma-verde-no-telhado');
    await soltar();
    p = await projeto();
    const placa2 = p.dispositivos[p.dispositivos.length - 1];
    conferir(p.dispositivos.length === 11 && categoria(placa2.itemId) === 'placa' && placa2.superficie === 'telhado-varanda-frente', 'soltar a placa no telhado da varanda deveria criar o dispositivo');
    conferir((await selecao())?.uid === placa2.uid, 'a placa criada deveria ficar selecionada');
    if (placa2.itemId === placa1.itemId) {
      // Presa à grade: a distância entre as duas é um número inteiro de passos de largura mais 2 cm de folga.
      const passo = 1.134 + 0.02;
      const passos = Math.abs(placa2.pos[0] - placa1.pos[0]) / passo;
      conferir(passos > 0.5 && Math.abs(passos - Math.round(passos)) < 0.01, `a placa deveria ficar na grade, com 2 cm de folga: ${passos} passos`);
    }
    await captura('21b-placa-criada-e-selecionada');

    // ---- A mesma placa em uma parede: fantasma vermelho, nada criado.
    s = await levar(await doCartao('placa-renepv-585'), await telaDoPonto([-1.33, p.casa.peDireito + 1.6, p.casa.profundidade / 2]));
    conferir(s.modo === 'catalogo' && s.valido === false, `a placa sobre a parede deveria ficar vermelha: ${JSON.stringify(s)}`);
    await captura('22-fantasma-vermelho-na-parede');
    await soltar();
    conferir((await projeto()).dispositivos.length === 11, 'soltar a placa em uma parede não deveria criar nada');
    // Esc cancela o arraste.
    await levar(await doCartao('placa-renepv-585'), noTelhado);
    await pagina.keyboard.press('Escape');
    conferir((await situacao()).modo === 'ocioso', 'Esc deveria cancelar o arraste do catálogo');
    await soltar();
    conferir((await projeto()).dispositivos.length === 11, 'o arraste cancelado com Esc não deveria criar nada');

    // ---- Dentro do quartinho: inversor na parede, cabos e proteções.
    const inversor = p.dispositivos.find((d) => d.uid === 'inversor');
    await olharDaCasa([inversor.pos[0] + 0.4, 1.5, inversor.pos[2] + 5.4], [inversor.pos[0], 1.1, inversor.pos[2]]);
    await esperar(300);
    const zParede = inversor.pos[2] - 0.06;
    s = await levar(await doCartao('inv-anenji-3kw-24v-127'), await telaDoPonto([inversor.pos[0] - 0.62, 1.75, zParede]));
    conferir(s.valido === true, `o inversor na parede do quartinho deveria ficar verde: ${JSON.stringify(s)}`);
    await captura('23-fantasma-do-inversor-na-parede');
    await soltar();
    p = await projeto();
    const inversor2 = p.dispositivos[p.dispositivos.length - 1];
    conferir(p.dispositivos.length === 12 && categoria(inversor2.itemId) === 'inv' && inversor2.superficie === 'parede-quartinho-fundo', 'soltar o inversor na parede do quartinho deveria criar o dispositivo');

    // Passar o ponteiro sobre um terminal mostra o rótulo dele.
    const pvPos = await telaDoTerminal('inversor', 'pvPos');
    await pagina.mouse.move(pvPos[0], pvPos[1], { steps: 4 });
    await parado();
    const rotuloVisivel = await og(() => window.__offgrid.camadas.dispositivos.grupoDe('inversor').getObjectByName('terminal-pvPos').getObjectByName('rotulo').visible);
    conferir(rotuloVisivel === true, 'passar o ponteiro sobre o terminal deveria mostrar o rótulo dele');

    // Cabo entre dois terminais compatíveis: positivo da bateria no BAT+ do inversor novo.
    const cabosAntes = p.cabos.length;
    const deBateria = await telaDoTerminal('bateria1', 'pos');
    const noInversor2 = await telaDoTerminal(inversor2.uid, 'batPos');
    s = await levar(deBateria, [(deBateria[0] + noInversor2[0]) / 2 + 70, (deBateria[1] + noInversor2[1]) / 2]);
    conferir(s.modo === 'cabo', `apertar sobre o terminal e arrastar deveria puxar um cabo: ${JSON.stringify(s)}`);
    await captura('24-cabo-puxado-com-terminais-acesos');
    await pagina.mouse.move(noInversor2[0], noInversor2[1], { steps: 6 });
    s = await parado();
    conferir(s.valido === true, `o cabo sobre o BAT+ deveria poder ser ligado: ${JSON.stringify(s)}`);
    await soltar();
    p = await projeto();
    const caboNovo = p.cabos[p.cabos.length - 1];
    conferir(
      p.cabos.length === cabosAntes + 1 && caboNovo.de.disp === 'bateria1' && caboNovo.de.terminal === 'pos' && caboNovo.para.disp === inversor2.uid && caboNovo.para.terminal === 'batPos' && caboNovo.comprimento >= 0.3,
      `puxar o cabo entre dois terminais de corrente contínua deveria criar o cabo: ${JSON.stringify(caboNovo)}`,
    );
    conferir((await selecao())?.uid === caboNovo.uid, 'o cabo criado deveria ficar selecionado');
    await captura('24b-cabo-criado-e-selecionado');

    // Corrente contínua com corrente alternada: não cria, e o motivo aparece perto do ponteiro.
    s = await levar(pvPos, await telaDoTerminal('rede', 'tomada'));
    conferir(s.modo === 'cabo' && s.valido === false && /alternada/.test(s.motivo ?? ''), `PV+ na tomada da rede deveria ser recusado com o motivo: ${JSON.stringify(s)}`);
    conferir(/alternada/.test((await pagina.locator('[data-offgrid-dica]').textContent()) ?? ''), 'o motivo deveria aparecer perto do ponteiro');
    await captura('25-cabo-recusado-cc-com-ca');
    await soltar();
    conferir((await projeto()).cabos.length === cabosAntes + 1, 'soltar o cabo de corrente contínua em corrente alternada não deveria criar cabo');

    // Disjuntor do catálogo sobre um cabo, sem quadro na cena: fica no próprio cabo.
    const noCabo = () => og(() => window.__offgrid.telaDoCabo('c5', 0.5));
    s = await levar(await doCartao('prot-disjuntor-ca-16'), await noCabo());
    conferir(s.modo === 'protecao' && s.valido === true, `o disjuntor sobre o cabo deveria poder ser instalado: ${JSON.stringify(s)}`);
    await captura('26-disjuntor-sobre-o-cabo');
    await soltar();
    let c5 = (await projeto()).cabos.find((c) => c.uid === 'c5');
    conferir(c5.protecoes.length === 1 && c5.quadro === null, `sem quadro, o disjuntor deveria ficar no cabo: ${JSON.stringify(c5)}`);

    // Quadro na parede; o disjuntor seguinte vai para o trilho dele.
    s = await levar(await doCartao('acc-quadro-8'), await telaDoPonto([inversor.pos[0] + 0.45, 1.9, zParede]));
    conferir(s.valido === true, `o quadro na parede do quartinho deveria ficar verde: ${JSON.stringify(s)}`);
    await soltar();
    p = await projeto();
    const quadro = p.dispositivos[p.dispositivos.length - 1];
    conferir(quadro.itemId === 'acc-quadro-8' && quadro.superficie === 'parede-quartinho-fundo', 'soltar o quadro na parede deveria criar o dispositivo');
    await levar(await doCartao('prot-disjuntor-ca-16'), await noCabo());
    await soltar();
    c5 = (await projeto()).cabos.find((c) => c.uid === 'c5');
    conferir(c5.protecoes.length === 2 && c5.quadro === quadro.uid, `com quadro na cena, o cabo deveria passar por ele: ${JSON.stringify(c5)}`);
    conferir(await og(() => window.__offgrid.camadas.dispositivos.noTrilho('c5', 0) && window.__offgrid.camadas.dispositivos.noTrilho('c5', 1)), 'os disjuntores deveriam aparecer no trilho do quadro');
    await og(() => window.__offgrid.acoes.selecionar(null));
    await captura('27-disjuntores-no-quadro');

    // ---- No térreo: geladeira no piso; mover, girar, apagar e desfazer.
    await pagina.getByRole('button', { name: 'Só térreo', exact: true }).click();
    await olharDaCasa([-3, 13, -7], [0, 0, 0.8]);
    await esperar(300);
    s = await levar(await doCartao('ap-geladeira'), await telaDoPonto([-2.5, 0.05, 1.8]));
    conferir(s.valido === true, `a geladeira no piso da sala deveria ficar verde: ${JSON.stringify(s)}`);
    await captura('28-fantasma-da-geladeira-no-piso');
    await soltar();
    p = await projeto();
    const geladeira = p.dispositivos[p.dispositivos.length - 1];
    conferir(p.dispositivos.length === 14 && categoria(geladeira.itemId) === 'ap' && geladeira.superficie === 'piso-terreo', 'soltar a geladeira no piso deveria criar o dispositivo');

    const ventilador = await peca('ap-ventilador');
    const caboDoVentilador = p.cabos.find((c) => c.para.disp === 'ap-ventilador');
    s = await levar(await og(() => window.__offgrid.telaDe('ap-ventilador')), await telaDoPonto([-0.8, 0.05, 2.2]));
    conferir(s.modo === 'mover', `arrastar o ventilador deveria movê-lo: ${JSON.stringify(s)}`);
    await captura('29-movendo-o-ventilador');
    await soltar();
    let movido = await peca('ap-ventilador');
    conferir(movido.superficie === 'piso-terreo' && Math.hypot(movido.pos[0] - ventilador.pos[0], movido.pos[2] - ventilador.pos[2]) > 0.5, 'o ventilador deveria ter mudado de lugar no piso');
    conferir((await selecao())?.uid === 'ap-ventilador', 'a peça movida deveria ficar selecionada');
    const medido = await og((c) => window.__offgrid.camadas.cabos.comprimentoEntre(c.de, c.para), caboDoVentilador);
    const comprimento = (await projeto()).cabos.find((c) => c.uid === caboDoVentilador.uid).comprimento;
    conferir(comprimento === medido && comprimento !== caboDoVentilador.comprimento, `o cabo do ventilador deveria ter o comprimento atualizado: ${comprimento} m, medido ${medido} m`);

    await pagina.keyboard.press('r');
    conferir((await peca('ap-ventilador')).giro === 90, 'R deveria girar a peça selecionada em 90°');
    await pagina.keyboard.press('Delete');
    p = await projeto();
    conferir(!p.dispositivos.some((d) => d.uid === 'ap-ventilador') && !p.cabos.some((c) => c.para.disp === 'ap-ventilador'), 'Delete deveria apagar a peça selecionada e o cabo dela');
    await pagina.keyboard.press('Control+Z');
    conferir((await peca('ap-ventilador'))?.giro === 90, 'Ctrl+Z deveria trazer de volta a peça apagada');
    await pagina.keyboard.press('Control+Z');
    await pagina.keyboard.press('Control+Z');
    movido = await peca('ap-ventilador');
    conferir(movido.giro === 0 && Math.abs(movido.pos[0] - ventilador.pos[0]) < 1e-6 && Math.abs(movido.pos[2] - ventilador.pos[2]) < 1e-6, 'mais dois Ctrl+Z deveriam desfazer o giro e o movimento');

    // Clique seleciona; clique no vazio desfaz a seleção.
    const naTv = await og(() => window.__offgrid.telaDe('ap-tv'));
    await pagina.mouse.click(naTv[0], naTv[1]);
    conferir((await selecao())?.uid === 'ap-tv', 'clicar em uma peça deveria selecioná-la');
    await captura('29b-peca-selecionada');
    const gramado = await pagina.locator('#cena canvas').boundingBox();
    await pagina.mouse.click(gramado.x + 30, gramado.y + gramado.height - 30);
    conferir((await selecao()) === null, 'clicar no vazio deveria desfazer a seleção');

    // ---- As peças acompanham a casa: térrea, pelo formulário.
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
    p = await projeto();
    const deCima = p.dispositivos.filter((d) => d.superficie === 'piso-superior').map((d) => d.uid);
    const yDaPlaca = p.dispositivos.find((d) => d.uid === 'placa1').pos[1];
    conferir(deCima.length === 3, 'o cenário deveria ter três aparelhos no andar de cima');
    await pagina.getByRole('button', { name: 'Casa', exact: true }).click();
    await pagina.locator('[data-casa="andares"]').selectOption('1');
    await pagina.getByRole('button', { name: 'Fechar', exact: true }).click();
    await esperar(300);
    p = await projeto();
    const aVista = await og(() => window.__offgrid.superficies());
    conferir(p.dispositivos.every((d) => aVista.includes(d.superficie)), 'na casa térrea, toda peça deveria estar em uma superfície que existe');
    conferir(deCima.every((uid) => p.dispositivos.find((d) => d.uid === uid).superficie === 'piso-terreo'), 'as peças do andar de cima deveriam descer para o térreo');
    conferir(p.dispositivos.find((d) => d.uid === 'placa1').pos[1] < yDaPlaca - 0.1, 'a placa deveria descer com o telhado da varanda');
    await captura('30-casa-terrea-pecas-reassentadas');

    // ---- "Acrescentar placa em série", no cenário inicial: some o erro da tensão mínima; um Ctrl+Z desfaz tudo.
    await og(() => window.__offgrid.acoes.novoProjeto());
    await esperar(400);
    const regras = () => og(() => (window.__offgrid.recalcular(), window.__offgrid.estado().derivados.sugestoes.map((x) => x.regra)));
    conferir((await regras()).includes('placas-abaixo-da-tensao'), 'o cenário inicial deveria ter o erro da tensão mínima das placas');
    await pagina.locator('.sugestao[data-regra="placas-abaixo-da-tensao"] .acao-sugestao').click();
    await esperar(300);
    p = await projeto();
    const placas = p.dispositivos.filter((d) => categoria(d.itemId) === 'placa');
    conferir(placas.length === 2 && placas[1].superficie === 'telhado-varanda-frente', 'a ação deveria pôr mais uma placa no telhado da varanda');
    conferir(p.cabos.length === 12 && p.cabos.some((c) => c.de.disp === 'placa1' && c.de.terminal === 'neg' && c.para.disp === placas[1].uid && c.para.terminal === 'pos'), 'a ação deveria fazer a emenda entre as duas placas');
    conferir(!(await regras()).includes('placas-abaixo-da-tensao'), '"Acrescentar placa em série" deveria resolver o erro da tensão mínima');
    await captura('31-placa-acrescentada-em-serie');
    await pagina.keyboard.press('Control+Z');
    p = await projeto();
    conferir(p.dispositivos.filter((d) => categoria(d.itemId) === 'placa').length === 1 && p.cabos.length === 11, 'um só Ctrl+Z deveria desfazer a placa e os cabos da ação');

    const quadros = await og(() => window.__offgrid.medirQuadros(20, true));
    console.log(`interação: quadro de ${quadros.ms.toFixed(1)} ms com sombra (desenho por software), ${quadros.chamadas} chamadas, ${quadros.triangulos} triângulos`);
  }
  await verificarInteracao();

  if (erros.length) throw new Error(`Erros na página:\n${erros.join('\n')}`);
  console.log('Verificação concluída sem erros.');
}

principal().then(
  () => encerrar(0),
  (err) => {
    console.error(err.message ?? err);
    if (erros.length) console.error(`Erros na página:\n${erros.join('\n')}`);
    encerrar(1);
  },
);
