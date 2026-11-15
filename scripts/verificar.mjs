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
    // Novo, Exportar e Importar ficam no menu "Projeto" da barra de cima.
    conferir(await pagina.locator('#lista-projeto').isHidden(), 'o menu Projeto começa fechado');
    await pagina.locator('#botao-projeto').click();
    conferir(await pagina.locator('#botao-exportar').isVisible(), 'o menu Projeto deveria mostrar Exportar');
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('#botao-exportar').click()]);
    conferir(await pagina.locator('#lista-projeto').isHidden(), 'escolher um item deveria fechar o menu Projeto');
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
    await pagina.locator('#botao-projeto').click();
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
  // Primeira abertura: o cartão "Por onde começar" aparece, e as barras de cima e de baixo cabem em uma linha.
  conferir(await pagina.locator('#boas-vindas').isVisible(), 'na primeira abertura deveria aparecer o cartão "Por onde começar"');
  const barras = await pagina.evaluate(() => ({
    base: document.querySelector('#base').getBoundingClientRect().height,
    topo: Math.max(...[...document.querySelectorAll('#topo button')].filter((b) => b.offsetParent !== null).map((b) => b.offsetHeight)),
    sobra: document.querySelector('#topo').scrollWidth - document.querySelector('#topo').clientWidth,
  }));
  conferir(barras.base < 76, `a barra de baixo deveria caber em uma linha em 1440 de largura: ${JSON.stringify(barras)}`);
  conferir(barras.topo < 36 && barras.sobra <= 0, `os botões da barra de cima não deveriam quebrar em duas linhas nem sair da tela: ${JSON.stringify(barras)}`);

  // 1b. Painéis da fase 2 (catálogo, consultor, orçamento, item selecionado, barra de cima).
  await verificarPaineis();
  conferir((await pagina.locator('#boas-vindas').count()) === 0, 'o cartão "Por onde começar" deveria sumir na primeira mudança do projeto');

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

  // 3. Modos de visão. O telhado do quartinho some com o da casa (deixa de ser superfície de encaixe e de receber clique),
  // mas continua no cálculo de sombra: o número de malhas e de triângulos que tapam o sol não muda.
  const sombraNaVisaoCompleta = JSON.stringify(await pagina.evaluate(() => window.__offgrid.resumoDaSombra()));
  conferir((await pagina.evaluate(() => window.__offgrid.superficies())).includes('telhado-quartinho'), 'na visão completa o telhado do quartinho deveria ser superfície de encaixe');
  for (const [rotulo, visao, nome] of [
    ['Sem telhado', 'sem-telhado', '05-visao-sem-telhado'],
    ['Só térreo', 'terreo', '06-visao-terreo'],
    ['Completa', 'completa', '07-visao-completa'],
  ]) {
    await pagina.getByRole('button', { name: rotulo, exact: true }).click();
    e = await estado();
    conferir(e.visao === visao, `visão deveria ser ${visao}`);
    const aVista = await pagina.evaluate(() => window.__offgrid.superficies());
    conferir(aVista.includes('telhado-quartinho') === (visao === 'completa'), `na visão ${visao}, o telhado do quartinho ${visao === 'completa' ? 'deveria estar' : 'não deveria estar'} entre as superfícies à vista`);
    conferir(aVista.includes('telhado-frente') === (visao === 'completa') && aVista.includes('parede-quartinho-fundo') && aVista.includes('piso-quartinho'), `na visão ${visao}, as paredes e o piso do quartinho deveriam continuar à vista`);
    conferir(aVista.some((id) => id.startsWith('telhado-varanda')), `na visão ${visao}, o telhado da varanda deveria continuar à vista`);
    conferir(JSON.stringify(await pagina.evaluate(() => window.__offgrid.resumoDaSombra())) === sombraNaVisaoCompleta, `a visão ${visao} não deveria mudar o que tapa o sol no cálculo`);
    await captura(nome);
  }

  // 4. Casa térrea, pelo formulário.
  await pagina.locator('#abrir-casa').click();
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
  await pagina.locator('#fechar-casa').click();
  await captura('09-casa-terrea');

  // 5. Varanda nos quatro lados (casa de volta com 2 andares).
  await pagina.locator('#abrir-casa').click();
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
    await pagina.locator('#fechar-casa').click();
    await captura(`10-varanda-${lado}`);
    await pagina.locator('#abrir-casa').click();
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
  await pagina.locator('#fechar-casa').click();
  await captura('10b-quartinho-alterado');
  await pagina.locator('#abrir-casa').click();

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
  await pagina.locator('#fechar-casa').click();
  await captura('11b-frente-inteira-e-meia-direita');
  await de_cima('11c-de-cima-frente-inteira-e-meia-direita');
  await pagina.locator('#abrir-casa').click();

  // Quatro varandas.
  for (const l of lados) await marcar(`#varanda-${l}-tem`, true);
  e = await estado();
  conferir(e.projeto.casa.varandas.length === 4 && lados.every((l) => e.projeto.casa.varandas.some((x) => x.lado === l)), 'deveria haver quatro varandas');
  await pagina.locator('#fechar-casa').click();
  await captura('11d-quatro-varandas');
  await de_cima('11e-de-cima-quatro-varandas');
  await pagina.locator('#abrir-casa').click();

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
  await pagina.locator('#fechar-casa').click();

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
    await pagina.locator('#abrir-casa').click();
    await pagina.locator('[data-casa="andares"]').selectOption('1');
    await pagina.locator('#fechar-casa').click();
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

  // 9. "Editar casa" com o ponteiro de verdade (tarefas 2.6 e 2.7b): parede interna, cômodos, varanda pela alça e quartinho.
  async function verificarEdicaoDaCasa() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const casa = async () => (await estado()).projeto.casa;
    const selecao = () => og(() => window.__offgrid.estado().selecao);
    const telaDoPonto = (p) => og((q) => window.__offgrid.telaDoPonto(q), p);
    const alca = async (id) => {
      const a = await og((i) => window.__offgrid.telaDaAlca(i), id);
      conferir(Array.isArray(a), `a alça ${id} deveria estar na cena`);
      return a;
    };
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    /** Espera a cena tratar o último movimento do ponteiro e devolve o que a edição está fazendo. */
    const parado = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return og(() => window.__offgrid.edicao());
    };
    const levar = async (de, ate) => {
      await pagina.mouse.move(de[0], de[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.move(ate[0], ate[1], { steps: 10 });
      return parado();
    };
    const soltar = async () => {
      await pagina.mouse.up();
      await parado();
    };
    const clicar = async (p) => {
      await pagina.mouse.move(p[0], p[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.up();
      await parado();
    };
    const desfazer = async () => {
      await pagina.keyboard.press('Control+Z');
      await parado();
    };
    const igual = (a, b) => Math.abs(a - b) < 1e-6;
    const mesmoPonto = (a, b) => igual(a[0], b[0]) && igual(a[1], b[1]);

    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
    await esperar(400);
    const inicial = await casa();

    // ---- Entrar no modo: a faixa explica, a visão passa para o térreo visto de cima.
    await pagina.locator('#botao-editar-casa').click();
    await parado();
    let e9 = await estado();
    conferir(e9.edicaoCasa.ativa === true && e9.edicaoCasa.andar === 0 && e9.visao === 'terreo', `Editar casa deveria abrir o térreo sem o andar de cima: ${JSON.stringify([e9.edicaoCasa, e9.visao])}`);
    conferir((await pagina.locator('#faixa-edicao').textContent()).includes('Editando a casa'), 'a faixa deveria explicar o modo de edição');
    const deCima = await og(() => window.__offgrid.camera());
    conferir(deCima.pos[1] > 15 && Math.hypot(deCima.pos[0] - deCima.alvo[0], deCima.pos[2] - deCima.alvo[2]) < 0.1, `a câmera deveria olhar a casa de cima: ${JSON.stringify(deCima)}`);
    await captura('32-editar-casa-de-cima');

    // ---- Desenhar uma parede no térreo, dos fundos até a parede do meio: gruda no limite da planta e na outra parede.
    let s = await levar(await telaDoPonto([-1, 0.05, -3.2]), await telaDoPonto([-1.05, 0.05, -0.8]));
    conferir(s.modo === 'desenhar' && s.valido === true, `arrastar no piso deveria desenhar uma parede: ${JSON.stringify(s)}`);
    conferir(((await pagina.locator('[data-offgrid-medida]').textContent()) ?? '').includes('2,8 m'), 'a medida da parede deveria aparecer perto do ponteiro');
    await captura('33-desenhando-parede');
    await soltar();
    let c9 = await casa();
    const parede = c9.paredesInternas[c9.paredesInternas.length - 1];
    conferir(
      c9.paredesInternas.length === inicial.paredesInternas.length + 1 && parede.andar === 0 && mesmoPonto(parede.de, [-1, -3.5]) && mesmoPonto(parede.para, [-1, -0.7]) && parede.passagens.length === 0,
      `a parede desenhada deveria ir de (-1; -3,5) a (-1; -0,7): ${JSON.stringify(parede)}`,
    );
    conferir((await selecao())?.tipo === 'parede' && (await selecao()).uid === parede.uid, 'a parede criada deveria ficar selecionada');
    conferir((await pagina.locator('#item-selecionado h3').textContent()) === 'Parede interna', 'o painel deveria mostrar a parede selecionada');

    // Parede curta demais: fantasma vermelho, nada criado.
    s = await levar(await telaDoPonto([2, 0.05, 1.5]), await telaDoPonto([2.3, 0.05, 1.5]));
    conferir(s.modo === 'desenhar' && s.valido === false, `uma parede de 0,3 m deveria ser recusada: ${JSON.stringify(s)}`);
    await soltar();
    conferir((await casa()).paredesInternas.length === inicial.paredesInternas.length + 1, 'a parede curta demais não deveria ser criada');

    // Clicar na parede selecionada põe uma passagem de 0,8 m; clicar na passagem a tira.
    await clicar(await telaDoPonto([-1, 0.05, -3]));
    conferir((await selecao())?.uid === parede.uid, 'clicar na parede deveria selecioná-la');
    await clicar(await telaDoPonto([-1, 0.05, -2]));
    let passagens = (await casa()).paredesInternas.find((w) => w.uid === parede.uid).passagens;
    conferir(passagens.length === 1 && igual(passagens[0], 1.5), `clicar na parede selecionada deveria pôr uma passagem a 1,5 m da ponta: ${JSON.stringify(passagens)}`);
    await captura('34-parede-com-passagem');
    await desfazer();
    conferir((await casa()).paredesInternas.find((w) => w.uid === parede.uid).passagens.length === 0, 'Ctrl+Z deveria tirar a passagem');

    // ---- Dar nome aos dois cômodos que a parede separou.
    await clicar(await telaDoPonto([-2.8, 0.05, -1.4]));
    conferir(await pagina.locator('#campo-comodo').isVisible(), 'clicar no piso deveria abrir o campo do nome do cômodo');
    conferir((await pagina.locator('#campo-comodo .sugestoes-comodo button').count()) === 7, 'o campo deveria ter as 7 sugestões de nome');
    await captura('35-campo-do-nome-do-comodo');
    await pagina.keyboard.press('Escape');
    conferir((await pagina.locator('#campo-comodo').isHidden()) && (await estado()).edicaoCasa.ativa === true, 'Esc no campo deveria fechar só o campo');
    await clicar(await telaDoPonto([-2.8, 0.05, -1.4]));
    await pagina.locator('#campo-comodo [data-nome="Banheiro"]').click();
    await parado();
    c9 = await casa();
    const banheiro = c9.comodos.find((x) => x.nome === 'Banheiro');
    conferir(banheiro && banheiro.andar === 0 && banheiro.ponto[0] < -1 && banheiro.ponto[1] < -0.7, `o cômodo à esquerda da parede deveria se chamar Banheiro: ${JSON.stringify(c9.comodos)}`);
    // O lado direito já era a Cozinha: o nome novo reaproveita o cômodo dela.
    await clicar(await telaDoPonto([1.5, 0.05, -2.4]));
    conferir((await pagina.locator('#nome-comodo').inputValue()) === 'Cozinha', 'o campo deveria abrir com o nome atual da área');
    await pagina.locator('#nome-comodo').fill('Copa');
    await pagina.keyboard.press('Enter');
    await parado();
    c9 = await casa();
    conferir(
      c9.comodos.length === inicial.comodos.length + 1 && c9.comodos.find((x) => x.uid === 'cm-cozinha')?.nome === 'Copa' && !c9.comodos.some((x) => x.nome === 'Cozinha'),
      `a Cozinha deveria virar Copa, no mesmo cômodo: ${JSON.stringify(c9.comodos)}`,
    );
    await captura('36-comodos-nomeados');

    // ---- Esc sai do modo e a visão volta a ser a de antes.
    await pagina.keyboard.press('Escape');
    await parado();
    e9 = await estado();
    const depois = await og(() => window.__offgrid.camera());
    conferir(e9.edicaoCasa.ativa === false && e9.visao === 'completa' && Math.abs(depois.pos[1] - CAMERA_INICIAL.pos[1]) < 1e-6, 'Esc deveria sair do modo de edição e devolver a visão e a câmera');

    // ---- Um aparelho do catálogo em cada cômodo: o painel do item mostra o nome novo.
    await pagina.getByRole('button', { name: 'Só térreo', exact: true }).click();
    await mudarCamera(noMundo([0, 16, -3.2]), noMundo([0, 0, -1.2]));
    await esperar(300);
    const interacao = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return og(() => window.__offgrid.interacao());
    };
    for (const [itemId, lugar, nome] of [
      ['ap-ventilador', [-1.9, 0.05, -1.5], 'Banheiro'],
      ['ap-microondas', [1.6, 0.05, -2.2], 'Copa'],
    ]) {
      const cartao = await og((id) => window.__offgrid.telaDoCartao(id), itemId);
      const destino = await telaDoPonto(lugar);
      await pagina.mouse.move(cartao[0], cartao[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.move(destino[0], destino[1], { steps: 10 });
      s = await interacao();
      conferir(s.modo === 'catalogo' && s.valido === true, `${itemId} deveria caber no piso do cômodo ${nome}: ${JSON.stringify(s)}`);
      await pagina.mouse.up();
      await esperar(300);
      const novo = (await estado()).projeto.dispositivos.at(-1);
      conferir(novo.itemId === itemId && (await selecao())?.uid === novo.uid, `soltar ${itemId} deveria criar o aparelho e selecioná-lo`);
      const texto = await pagina.locator('#item-selecionado .comodo').textContent();
      conferir(texto === `Cômodo: ${nome}`, `o painel do aparelho deveria mostrar "Cômodo: ${nome}", mostrou "${texto}"`);
      if (nome === 'Copa') await captura('37-aparelho-no-comodo-nomeado');
    }
    await pagina.locator('[data-aba="sistema"]').click();
    const linhas = await pagina.locator('#painel-sistema .linha-aparelho').allTextContents();
    conferir(linhas.some((t) => t.includes('Cômodo: Copa')) && linhas.some((t) => t.includes('Cômodo: Banheiro')), 'a aba Sistema deveria mostrar os cômodos novos dos aparelhos');
    await pagina.locator('[data-aba="consultor"]').click();
    await desfazer();
    await desfazer();
    conferir((await estado()).projeto.dispositivos.length === 10, 'dois Ctrl+Z deveriam tirar os dois aparelhos');
    await og(() => window.__offgrid.acoes.selecionar(null));

    // ---- De volta à edição: varanda lateral pela alça. Do lado direito o quartinho está no caminho e a varanda é recusada.
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await pagina.locator('#botao-editar-casa').click();
    await parado();
    await clicar(await alca('nova-direita'));
    conferir((await casa()).varandas.length === 1 && (await pagina.locator('#faixa-edicao').textContent()).includes('no caminho'), 'a varanda em cima do quartinho deveria ser recusada, com o recado na faixa');
    await clicar(await alca('nova-esquerda'));
    let ve = (await casa()).varandas.find((v) => v.lado === 'esquerda');
    conferir(ve && ve.profundidade === 3 && ve.inclinacaoPct === 30 && ve.largura === null, `a alça da esquerda deveria criar uma varanda de 3 m e 30%: ${JSON.stringify(ve)}`);
    conferir((await selecao())?.tipo === 'varanda' && (await pagina.locator('#item-selecionado h3').textContent()) === 'Varanda da esquerda', 'a varanda criada deveria ficar selecionada, com o painel dela');
    await captura('38-varanda-criada-pela-alca');
    // Arrastar a borda de fora até 4 m da fachada: a inclinação cai para a beira ficar a 2 m.
    const borda = await alca('borda-esquerda');
    const yBeira = c9.peDireito + 0.25 - 3 * 0.3;
    s = await levar(borda, await telaDoPonto([-c9.largura / 2 - 4, yBeira, 0]));
    conferir(s.modo === 'profundidade' && s.valido === true, `arrastar a borda da varanda deveria mudar a profundidade: ${JSON.stringify(s)}`);
    await captura('39-arrastando-a-borda-da-varanda');
    await soltar();
    ve = (await casa()).varandas.find((v) => v.lado === 'esquerda');
    conferir(ve.profundidade === 4 && ve.inclinacaoPct === 26, `a varanda deveria ficar com 4 m e 26%: ${JSON.stringify(ve)}`);
    conferir(c9.peDireito + 0.25 - (ve.profundidade * ve.inclinacaoPct) / 100 >= 2 - 1e-6, 'a beira da varanda não deveria ficar abaixo de 2 m');
    // Arrastar uma ponta estreita a varanda.
    await levar(await alca('ponta-esquerda-a'), await telaDoPonto([-c9.largura / 2 - 2, 2.5, -1.5]));
    await soltar();
    ve = (await casa()).varandas.find((v) => v.lado === 'esquerda');
    conferir(igual(ve.largura, 5) && igual(ve.deslocamento, 1), `a ponta arrastada deveria deixar a varanda com 5 m, deslocada 1 m: ${JSON.stringify(ve)}`);
    // Cada arraste é um passo só do desfazer.
    await desfazer();
    ve = (await casa()).varandas.find((v) => v.lado === 'esquerda');
    conferir(ve.largura === null && ve.profundidade === 4, 'um Ctrl+Z deveria desfazer o arraste da ponta');
    await desfazer();
    conferir((await casa()).varandas.find((v) => v.lado === 'esquerda').profundidade === 3, 'outro Ctrl+Z deveria desfazer o arraste da borda');
    await desfazer();
    conferir(!(await casa()).varandas.some((v) => v.lado === 'esquerda'), 'mais um Ctrl+Z deveria tirar a varanda criada');

    // ---- Arrastar o quartinho: preso à grade de 0,5 m, com as peças dele junto.
    const doQuartinho = async () => (await estado()).projeto.dispositivos.filter((d) => d.superficie?.includes('quartinho')).map((d) => [d.uid, d.pos]);
    const q0 = (await casa()).quartinho;
    const pecas0 = await doQuartinho();
    conferir(pecas0.length >= 3, 'o cenário deveria ter inversor, bateria e tomada no quartinho');
    s = await levar(await telaDoPonto([q0.x, 2.6, q0.z]), await telaDoPonto([q0.x + 1, 2.6, q0.z - 2]));
    conferir(s.modo === 'quartinho' && s.valido === true, `arrastar o quartinho deveria movê-lo: ${JSON.stringify(s)}`);
    await soltar();
    const q1 = (await casa()).quartinho;
    conferir(igual(q1.x, q0.x + 1) && igual(q1.z, q0.z - 2), `o quartinho deveria ir para (${q0.x + 1}; ${q0.z - 2}): ${JSON.stringify(q1)}`);
    const pecas1 = await doQuartinho();
    conferir(
      pecas1.length === pecas0.length && pecas1.every(([uid, pos]) => {
        const antes = pecas0.find((x) => x[0] === uid)[1];
        return Math.abs(pos[0] - antes[0] - 1) < 1e-3 && Math.abs(pos[1] - antes[1]) < 1e-3 && Math.abs(pos[2] - antes[2] + 2) < 1e-3;
      }),
      `as peças do quartinho deveriam ir junto: ${JSON.stringify([pecas0, pecas1])}`,
    );
    conferir((await selecao())?.tipo === 'quartinho' && (await pagina.locator('#item-selecionado h3').textContent()) === 'Quartinho', 'o quartinho arrastado deveria ficar selecionado, com o painel dele');
    conferir(Number(await pagina.locator('#item-selecionado [data-campo="x"]').inputValue()) === q1.x, 'o painel do quartinho deveria mostrar a posição nova');
    await captura('40-quartinho-arrastado');

    // Em cima da casa não fica: vulto vermelho e, ao soltar, o último lugar válido.
    s = await levar(await telaDoPonto([q1.x, 2.6, q1.z]), await telaDoPonto([0, 2.6, 0]));
    conferir(s.modo === 'quartinho' && s.valido === false, `o quartinho em cima da casa deveria ficar vermelho: ${JSON.stringify(s)}`);
    await captura('41-quartinho-em-cima-da-casa');
    await soltar();
    const q2 = (await casa()).quartinho;
    const fora = Math.abs(q2.x) - q2.largura / 2 >= c9.largura / 2 - 1e-6 || Math.abs(q2.z) - q2.profundidade / 2 >= c9.profundidade / 2 - 1e-6;
    conferir(fora && (await pagina.locator('#aviso-quartinho').textContent()) === '', `o quartinho não deveria ficar em cima da casa: ${JSON.stringify(q2)}`);
    await desfazer();
    conferir(JSON.stringify((await casa()).quartinho) === JSON.stringify(q1), 'um Ctrl+Z deveria desfazer o segundo arraste do quartinho');
    await desfazer();
    conferir(JSON.stringify((await casa()).quartinho) === JSON.stringify(q0) && JSON.stringify(await doQuartinho()) === JSON.stringify(pecas0), 'outro Ctrl+Z deveria devolver o quartinho e as peças dele ao lugar');

    // ---- Apagar a parede com Delete: os dois cômodos viram um só, com o primeiro nome, e a faixa avisa.
    await clicar(await telaDoPonto([-1, 0.05, -3]));
    conferir((await selecao())?.uid === parede.uid, 'clicar na parede deveria selecioná-la');
    await pagina.keyboard.press('Delete');
    await parado();
    c9 = await casa();
    conferir(c9.paredesInternas.length === inicial.paredesInternas.length && c9.comodos.filter((x) => x.andar === 0).length === 2, `Delete deveria apagar a parede e juntar os dois cômodos: ${JSON.stringify(c9.comodos)}`);
    conferir((await pagina.locator('#faixa-edicao').textContent()).includes('viraram um só'), 'a faixa deveria avisar que os cômodos se juntaram');
    await captura('42-parede-apagada-comodos-juntados');
    await desfazer();
    c9 = await casa();
    conferir(c9.paredesInternas.some((w) => w.uid === parede.uid) && c9.comodos.some((x) => x.nome === 'Copa') && c9.comodos.some((x) => x.nome === 'Banheiro'), 'um Ctrl+Z deveria trazer de volta a parede e os dois nomes');

    // ---- Andar de cima e saída pelo botão.
    await pagina.locator('#seletor-andar [data-andar="1"]').click();
    await parado();
    conferir((await estado()).visao === 'sem-telhado', 'editar o andar de cima deveria tirar só o telhado');
    await captura('43-editar-andar-de-cima');
    await pagina.locator('#botao-editar-casa').click();
    await parado();
    conferir((await estado()).edicaoCasa.ativa === false && (await estado()).visao === 'completa', 'sair da edição deveria devolver a visão completa');
  }
  await verificarEdicaoDaCasa();

  // ---------------------------------------------------------------- Tarefa 3.5, 4.2 e 4.3: queda de luz, mostradores, gráfico, "Por quê?", glossário e segurança
  async function verificarSimulacaoEAprender() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    await og(() => window.__offgrid.acoes.novoProjeto());
    await esperar(500);
    await og(() => window.__offgrid.acoes.selecionar(null));
    await pagina.locator('[data-aba="consultor"]').click();

    // A linha fixa de limite do simulador fica no Orçamento.
    conferir((await pagina.locator('#painel-orcamento .limite-simulador').count()) === 1, 'o painel de Orçamento deveria ter a linha de limite do simulador');

    // Queda de luz às 20 h de 21/06, com a bateria cheia, a 60 min/s.
    await og(() => {
      const a = window.__offgrid.acoes;
      a.definirVelocidade(0);
      a.recarregarBateria();
      a.definirTempo(Date.UTC(2026, 5, 21, 23, 0, 0));
    });
    await esperar(400);
    conferir((await pagina.locator('#m-bateria .m-valor').textContent()).trim() === '100 %', 'antes da queda a bateria deveria estar em 100 %');
    await captura('50-mostradores-antes-da-queda');
    await pagina.locator('#botao-queda').click();
    conferir((await pagina.locator('#botao-queda').textContent()) === 'Luz voltou', 'durante a queda o botão deveria dizer "Luz voltou"');
    conferir((await pagina.locator('#m-rede .m-valor').textContent()) === 'em queda', 'o mostrador da rede deveria dizer "em queda"');
    await pagina.locator('#botoes-velocidade [data-vel="60"]').click();
    await esperar(2500);
    const pctMeio = Number((await pagina.locator('#m-bateria .m-valor').textContent()).replace(/\D/g, ''));
    conferir(pctMeio < 100, `com a queda e o tempo correndo, a bateria deveria estar abaixo de 100 %: ${pctMeio}`);
    conferir((await pagina.locator('#m-origem').getAttribute('data-origem')) === 'bateria', 'durante a queda a energia deveria vir da bateria');
    await captura('51-mostradores-durante-a-queda');

    await pagina.waitForSelector('#faixa-queda:not([hidden])', { timeout: 90000 });
    await pagina.locator('#botoes-velocidade [data-vel="0"]').click();
    const faixa = await pagina.locator('#faixa-queda').textContent();
    conferir(/^A bateria acabou às 0[2-4]:\d\d, depois de \d+ h( \d+ min)? sem luz\.$/.test(faixa), `a faixa deveria dizer que a bateria acabou por volta das 3 h: "${faixa}"`);
    conferir((await pagina.locator('#m-consumo .m-valor').textContent()) === 'desligado', 'sem bateria, o consumo deveria aparecer como "desligado"');
    conferir((await pagina.locator('#m-avisos li[data-aviso="bateria-vazia"]').count()) === 1, 'o aviso de bateria vazia deveria aparecer');
    await captura('52-bateria-acabou');

    // Gráfico na aba Sistema.
    await pagina.locator('[data-aba="sistema"]').click();
    await esperar(600);
    const pontos = Number(await pagina.locator('#grafico-bateria').getAttribute('data-pontos'));
    conferir(pontos > 10, `o gráfico deveria ter pontos: ${pontos}`);
    const pintados = await pagina.locator('#grafico-bateria').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    conferir(pintados > 500, `o gráfico deveria ter sido desenhado: ${pintados} pixels`);
    await captura('53-grafico-da-bateria');

    // Controles do projeto na aba Sistema.
    await pagina.locator('#sistema-projeto [data-prioridade="solar"]').click();
    conferir((await estado()).projeto.prioridade === 'solar', '"Solar primeiro" deveria mudar a prioridade');
    await pagina.locator('#sistema-projeto [data-prioridade="rede"]').click();
    conferir((await estado()).projeto.prioridade === 'rede', '"Rede primeiro" deveria voltar a prioridade');
    await pagina.locator('#sistema-projeto [data-tensao-rede="220"]').click();
    conferir((await estado()).projeto.tensaoRede === 220, 'o botão 220 V deveria mudar a tensão da rede');
    await pagina.locator('#sistema-projeto [data-tensao-rede="127"]').click();
    conferir((await estado()).projeto.tensaoRede === 127, 'o botão 127 V deveria voltar a tensão da rede');

    // "Bateria cheia" e "Luz voltou".
    await pagina.locator('#botao-bateria-cheia').click();
    await esperar(300);
    conferir((await pagina.locator('#m-bateria .m-valor').textContent()).trim() === '100 %', '"Bateria cheia" deveria voltar a 100 %');
    conferir(await pagina.locator('#faixa-queda').isHidden(), 'com a bateria cheia a faixa deveria sumir');
    await pagina.locator('#botao-queda').click();
    conferir((await pagina.locator('#botao-queda').textContent()) === 'Queda de luz', 'depois da queda o botão deveria voltar a "Queda de luz"');
    await captura('54-bateria-cheia-e-luz-voltou');

    // "Por quê?" no consultor. Sem a bateria, o consultor sempre tem sugestão.
    await og(() => {
      const e = window.__offgrid.estado();
      const b = e.projeto.dispositivos.find((d) => /^bat-/.test(d.itemId));
      if (b) window.__offgrid.acoes.removerDispositivo(b.uid);
    });
    await esperar(500);
    await pagina.locator('[data-aba="consultor"]').click();
    const botaoPorQue = pagina.locator('#painel-consultor .sugestao .porque-botao').first();
    conferir((await botaoPorQue.count()) === 1, 'alguma sugestão deveria ter o botão "Por quê?"');
    const cartao = pagina.locator('#painel-consultor .sugestao:has(.porque-botao)').first();
    conferir(await cartao.locator('.porque-texto').isHidden(), 'o "Por quê?" começa fechado');
    await botaoPorQue.click();
    conferir((await cartao.locator('.porque-texto').isVisible()) && (await cartao.locator('.porque-texto p').first().textContent()).length > 40, 'o "Por quê?" deveria abrir o texto');
    await esperar(400);
    conferir(await pagina.locator('#painel-consultor .porque-texto').first().isVisible(), 'o "Por quê?" aberto deveria sobreviver ao recálculo do consultor');
    await captura('55-por-que-aberto');

    // Glossário: por uma etiqueta do "Por quê?" e pelo botão da barra de cima.
    const etiqueta = cartao.locator('.porque-texto .etiqueta-termo').first();
    if (await etiqueta.count()) {
      const id = await etiqueta.getAttribute('data-termo');
      await etiqueta.click();
      conferir(await pagina.locator('#painel-glossario').isVisible(), 'a etiqueta do termo deveria abrir o glossário');
      conferir((await pagina.locator(`#termo-${id}.aberto`).count()) === 1, 'a etiqueta deveria abrir o glossário naquele termo');
      await pagina.keyboard.press('Escape');
      conferir(await pagina.locator('#painel-glossario').isHidden(), 'Esc deveria fechar o glossário');
    }
    await pagina.locator('#botao-glossario').click();
    conferir(await pagina.locator('#painel-glossario').isVisible(), 'o botão Glossário deveria abrir o painel');
    const total = await pagina.locator('#painel-glossario .termo:not([hidden])').count();
    conferir(total >= 10, `o glossário deveria listar os termos: ${total}`);
    await pagina.locator('#busca-glossario').fill('fusivel');
    const achados = await pagina.locator('#painel-glossario .termo:not([hidden])').count();
    conferir(achados > 0 && achados < total, `a busca por "fusivel" deveria filtrar: ${achados} de ${total}`);
    await pagina.locator('#painel-glossario .termo:not([hidden]) .termo-titulo').first().click();
    await captura('56-glossario-com-busca');
    await pagina.locator('#painel-glossario .fechar-sobreposto').click();
    conferir(await pagina.locator('#painel-glossario').isHidden(), 'o botão Fechar deveria fechar o glossário');

    // Painel de segurança.
    await pagina.locator('#botao-seguranca').click();
    conferir(await pagina.locator('#painel-seguranca').isVisible(), 'o botão Segurança deveria abrir o painel');
    const nAvisos = await pagina.locator('#painel-seguranca article.aviso-lista').count();
    conferir(nAvisos === 12, `o painel de segurança deveria listar 12 avisos: ${nAvisos}`);
    await captura('57-painel-de-seguranca');
    await pagina.keyboard.press('Escape');
    conferir(await pagina.locator('#painel-seguranca').isHidden(), 'Esc deveria fechar o painel de segurança');

    // Aviso no momento certo: a segunda placa em série dispara o aviso dos 100 V. O que já existia ao abrir não dispara.
    await og(() => {
      window.__offgrid.reiniciarAvisosVistos();
      window.__offgrid.acoes.novoProjeto();
    });
    await esperar(500);
    for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    conferir((await pagina.locator('#avisos-seguranca .aviso-seguranca').count()) === 0, 'o botão "Entendi" deveria fechar os avisos');
    const novoUid = await og(() => {
      const a = window.__offgrid.acoes;
      const e = window.__offgrid.estado();
      const placa = e.projeto.dispositivos.find((d) => /^placa-/.test(d.itemId));
      const nova = a.adicionarDispositivo(placa.itemId, { pos: [placa.pos[0] + 1.2, placa.pos[1], placa.pos[2]], quat: placa.quat, superficie: placa.superficie, giro: placa.giro ?? 0 });
      a.adicionarCabo({ disp: nova, terminal: 'neg' }, { disp: placa.uid, terminal: 'pos' }, 1.5);
      return nova;
    });
    await esperar(300);
    conferir(typeof novoUid === 'string', 'a segunda placa deveria ter sido criada');
    // Os avisos entram um por vez; a captura é feita com o aviso dos 100 V à vista.
    const vistos = await og(() => JSON.parse(sessionStorage.getItem('offgrid.avisos.vistos') ?? '[]'));
    conferir(vistos.includes('placas-tensao-em-serie'), `a segunda placa em série deveria disparar o aviso dos 100 V: ${JSON.stringify(vistos)}`);
    conferir(!vistos.includes('bateria-local-e-ventilacao') && !vistos.includes('ca-127-v-choca'), `o que já existia ao abrir não deveria disparar aviso: ${JSON.stringify(vistos)}`);
    for (let i = 0; i < 10 && !(await pagina.locator('.aviso-seguranca[data-aviso-seguranca="placas-tensao-em-serie"]').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    conferir((await pagina.locator('.aviso-seguranca[data-aviso-seguranca="placas-tensao-em-serie"] h4').textContent()).includes('100 V'), 'o cartão do aviso dos 100 V deveria estar à vista');
    await captura('58-aviso-placas-em-serie');
  }
  await verificarSimulacaoEAprender();

  // 11. Obstáculos que fazem sombra (muro, vizinho, árvore) e placas no chão, sobre suporte (tarefas 5.2 e 5.3).
  async function verificarObstaculosEPlacasNoChao() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const projeto = async () => (await estado()).projeto;
    const telaDoPonto = (p) => og((q) => window.__offgrid.telaDoPonto(q), p);
    const selecao = () => og(() => window.__offgrid.estado().selecao);
    const parado = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const levar = async (de, ate) => {
      await pagina.mouse.move(de[0], de[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.move(ate[0], ate[1], { steps: 10 });
      await parado();
    };
    const soltar = async () => {
      await pagina.mouse.up();
      await parado();
    };
    const fecharAvisos = async () => {
      for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    };
    /** Fração da geração do dia que a sombra tira de uma placa, recalculada na hora. */
    const perdaDe = (uid) =>
      og((u) => {
        window.__offgrid.recalcular();
        return window.__offgrid.estado().derivados.estimativas.perdaSombra.get(u);
      }, uid);
    const campo = async (chave, valor) => {
      const c = pagina.locator(`#item-selecionado [data-campo="${chave}"]`);
      await c.fill(String(valor));
      await c.press('Enter');
      // O foco sai do campo, para os atalhos de teclado voltarem a valer.
      await og(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await parado();
    };
    const obstaculos = async () => (await projeto()).obstaculos ?? [];
    const noCanvas = (p) => og(([x, y]) => document.elementFromPoint(x, y) === document.querySelector('#cena canvas'), p);

    // Começa do cenário inicial, ao meio-dia de 21/06, com a frente da casa para o norte.
    await og(() => {
      const a = window.__offgrid.acoes;
      if (window.__offgrid.estado().edicaoCasa.ativa) a.definirEdicaoDaCasa(false);
      a.novoProjeto();
      a.definirTempo(Date.UTC(2026, 5, 21, 15, 0, 0));
    });
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await parado();
    await fecharAvisos();
    const semObstaculo = await perdaDe('placa1');
    const malhasSemObstaculo = (await og(() => window.__offgrid.resumoDaSombra())).malhas;
    conferir(typeof semObstaculo === 'number', 'a placa do cenário deveria ter a perda por sombra calculada');

    // ---- Vizinho pela barra "Acrescentar", levado pelos campos do painel para o norte da varanda, com 12 m de altura.
    await pagina.locator('#botao-editar-casa').click();
    await parado();
    conferir(await pagina.locator('#barra-obstaculos').isVisible(), 'a barra "Acrescentar" deveria aparecer em "Editar casa"');
    await pagina.locator('#barra-obstaculos [data-obstaculo="vizinho"]').click();
    await parado();
    let lista = await obstaculos();
    conferir(lista.length === 1 && lista[0].tipo === 'vizinho' && lista[0].largura === 8 && lista[0].profundidade === 8 && lista[0].altura === 6, `o vizinho deveria nascer com 8 × 8 × 6 m: ${JSON.stringify(lista)}`);
    conferir(Math.abs(lista[0].x) === 13 && lista[0].z === 0, `o vizinho deveria nascer a 5 m da lateral da casa: ${JSON.stringify(lista[0])}`);
    const vizinho = lista[0].uid;
    conferir((await selecao())?.tipo === 'obstaculo' && (await selecao()).uid === vizinho, 'o vizinho criado deveria ficar selecionado');
    // Em cima da casa não pode: o campo recusa e nada muda.
    await campo('x', 0);
    conferir((await obstaculos())[0].x === lista[0].x, 'o vizinho não deveria poder ir para cima da casa');
    await campo('z', 12.5);
    await campo('x', 0);
    await campo('altura', 12);
    lista = await obstaculos();
    conferir(lista[0].x === 0 && lista[0].z === 12.5 && lista[0].altura === 12, `os campos deveriam levar o vizinho para o norte da varanda: ${JSON.stringify(lista[0])}`);
    const comVizinho = await perdaDe('placa1');
    const malhasComVizinho = (await og(() => window.__offgrid.resumoDaSombra())).malhas;
    console.log(`sombra na placa da varanda: ${(semObstaculo * 100).toFixed(1)} % sem obstáculo, ${(comVizinho * 100).toFixed(1)} % com um vizinho de 12 m ao norte`);
    conferir(comVizinho > semObstaculo + 0.2, `o vizinho alto do lado do sol deveria aumentar a perda por sombra: ${semObstaculo} → ${comVizinho}`);
    conferir(malhasComVizinho > malhasSemObstaculo, 'as malhas do vizinho deveriam entrar no cálculo de sombra');
    await captura('60-editar-casa-com-vizinho-ao-norte');

    // ---- Mover com o ponteiro: preso à grade de 0,5 m, um ponto de desfazer por arraste.
    const topo = await telaDoPonto([0, 12, 12.5]);
    const destino = await telaDoPonto([4, 12, 12.5]);
    conferir((await noCanvas(topo)) && (await noCanvas(destino)), 'o vizinho deveria estar à vista na cena, na vista de cima');
    await levar(topo, destino);
    const arrastando = await og(() => window.__offgrid.edicao());
    conferir(arrastando.modo === 'obstaculo' && arrastando.valido === true, `arrastar o vizinho deveria movê-lo: ${JSON.stringify(arrastando)}`);
    await soltar();
    lista = await obstaculos();
    conferir(Math.abs(lista[0].x - 4) <= 0.5 && (lista[0].x * 2) % 1 === 0 && lista[0].z === 12.5, `o vizinho deveria ter ido para perto de x = 4, na grade de 0,5 m: ${JSON.stringify(lista[0])}`);
    await pagina.keyboard.press('Control+Z');
    await parado();
    lista = await obstaculos();
    conferir(lista.length === 1 && lista[0].x === 0, 'um Ctrl+Z deveria desfazer o arraste inteiro do vizinho');

    // ---- Muro e árvore; R gira o muro; Delete remove a árvore.
    await pagina.locator('#barra-obstaculos [data-obstaculo="muro"]').click();
    await parado();
    await pagina.locator('#barra-obstaculos [data-obstaculo="arvore"]').click();
    await parado();
    lista = await obstaculos();
    const muro = lista.find((o) => o.tipo === 'muro');
    const arvore = lista.find((o) => o.tipo === 'arvore');
    conferir(lista.length === 3 && muro && arvore, `a barra deveria criar o muro e a árvore: ${JSON.stringify(lista)}`);
    conferir(muro.largura === 6 && muro.profundidade === 0.15 && muro.altura === 2.2 && arvore.altura === 6 && arvore.largura === 4, 'muro e árvore deveriam nascer com as medidas iniciais');
    await captura('61-muro-vizinho-e-arvore-de-cima');
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'obstaculo', uid: u }), muro.uid);
    await pagina.keyboard.press('r');
    await parado();
    conferir(Math.abs((await obstaculos()).find((o) => o.uid === muro.uid).giro) === 90, 'R deveria girar o muro em 90°');
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'obstaculo', uid: u }), arvore.uid);
    await pagina.keyboard.press('Delete');
    await parado();
    conferir((await obstaculos()).length === 2 && (await selecao()) === null, 'Delete deveria remover a árvore selecionada');
    await pagina.keyboard.press('Control+Z');
    await parado();
    conferir((await obstaculos()).length === 3, 'Ctrl+Z deveria trazer a árvore de volta');

    // Fora da edição, com a casa inteira: os três obstáculos e a sombra do vizinho sobre a varanda.
    await pagina.locator('#botao-editar-casa').click();
    await parado();
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await mudarCamera([-24, 16, -34], [0, 3, -4]);
    await captura('62-vizinho-muro-e-arvore');
    await og(() => window.__offgrid.acoes.definirTempo(Date.UTC(2026, 5, 21, 12, 0, 0)));
    await captura('62b-sombra-do-vizinho-as-9h');
    await og(() => window.__offgrid.acoes.definirTempo(Date.UTC(2026, 5, 21, 15, 0, 0)));

    // ---- Remover o vizinho: a perda por sombra volta ao que era.
    await og((u) => window.__offgrid.acoes.removerObstaculo(u), vizinho);
    await parado();
    const semVizinho = await perdaDe('placa1');
    conferir(Math.abs(semVizinho - semObstaculo) < 0.01, `sem o vizinho a perda por sombra deveria voltar: ${semObstaculo} → ${semVizinho}`);

    // ---- Placa do catálogo para o terreno: fica sobre suporte, inclinada e virada para o norte.
    await mudarCamera([-18, 16, -26], [-3, 0, -6]);
    await parado();
    const cartaoDaPlaca = await og((id) => window.__offgrid.telaDoCartao(id), 'placa-renepv-585');
    await levar(cartaoDaPlaca, await telaDoPonto([6, 0, 9]));
    let s = await og(() => window.__offgrid.interacao());
    conferir(s.modo === 'catalogo' && s.valido === true, `a placa sobre o terreno deveria ficar verde: ${JSON.stringify(s)}`);
    await soltar();
    await fecharAvisos();
    let p = await projeto();
    const noChao = p.dispositivos[p.dispositivos.length - 1];
    conferir(noChao.superficie === 'terreno' && noChao.inclinacaoGraus === 23, `a placa solta no terreno deveria ficar sobre suporte, a 23°: ${JSON.stringify(noChao)}`);
    let normal = await og((u) => window.__offgrid.ambiente().normal(u), noChao.uid);
    conferir(Math.abs(normal[0]) < 0.01 && normal[2] < -0.3 && Math.abs(normal[1] - Math.cos((23 * Math.PI) / 180)) < 0.001, `a face da placa no chão deveria olhar para o norte e para cima: ${normal}`);
    await mudarCamera([-8.5, 1.7, -13], [-6, 0.9, -9]);
    await captura('63-placa-no-chao-sobre-suporte');

    // Inclinação e direção pelo painel; Ctrl+Z desfaz.
    await campo('inclinacao', 35);
    p = await projeto();
    conferir(p.dispositivos.find((d) => d.uid === noChao.uid).inclinacaoGraus === 35, 'o campo "Inclinação" deveria mudar a inclinação da placa');
    normal = await og((u) => window.__offgrid.ambiente().normal(u), noChao.uid);
    conferir(Math.abs(normal[1] - Math.cos((35 * Math.PI) / 180)) < 0.001 && normal[2] < 0, `com 35° a normal deveria deitar mais para o norte: ${normal}`);
    await campo('direcao', 90);
    normal = await og((u) => window.__offgrid.ambiente().normal(u), noChao.uid);
    conferir(normal[0] > 0.5 && Math.abs(normal[2]) < 0.01, `com direção 90 a face deveria olhar para o leste: ${normal}`);
    await captura('64-placa-no-chao-inclinada-para-o-leste');
    await pagina.keyboard.press('Control+Z');
    await pagina.keyboard.press('Control+Z');
    await parado();
    p = await projeto();
    conferir(p.dispositivos.find((d) => d.uid === noChao.uid).inclinacaoGraus === 23 && p.dispositivos.find((d) => d.uid === noChao.uid).giro === 0, 'dois Ctrl+Z deveriam voltar a inclinação e a direção');

    // No terreno só ficam placas e estação portátil.
    await mudarCamera([-18, 16, -26], [-3, 0, -6]);
    await parado();
    await levar(await og((id) => window.__offgrid.telaDoCartao(id), 'ap-geladeira'), await telaDoPonto([4, 0, 9]));
    s = await og(() => window.__offgrid.interacao());
    conferir(s.modo === 'catalogo' && s.valido === false, `a geladeira no terreno deveria ficar vermelha: ${JSON.stringify(s)}`);
    await soltar();
    await levar(await og((id) => window.__offgrid.telaDoCartao(id), 'est-ecoflow-delta2'), await telaDoPonto([4, 0, 9]));
    s = await og(() => window.__offgrid.interacao());
    conferir(s.modo === 'catalogo' && s.valido === true, `a estação portátil no terreno deveria ficar verde: ${JSON.stringify(s)}`);
    await soltar();
    await fecharAvisos();
    p = await projeto();
    conferir(p.dispositivos[p.dispositivos.length - 1].superficie === 'terreno', 'a estação portátil deveria ficar no terreno');
    await captura('65-placa-e-estacao-no-terreno');

    const quadros = await og(() => window.__offgrid.medirQuadros(20, true));
    console.log(`obstáculos e placa no chão: quadro de ${quadros.ms.toFixed(1)} ms com sombra (desenho por software), ${quadros.chamadas} chamadas, ${quadros.triangulos} triângulos`);
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
  }
  await verificarObstaculosEPlacasNoChao();

  // 9. Clima real, cidade e passo a passo (tarefas 5.1 e 4.1). A rede é simulada com `page.route`: o roteiro não depende da internet.
  async function verificarClimaCidadePassoAPasso() {
    const { readFileSync } = await import('node:fs');
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const texto = readFileSync(join(raiz, 'src', 'dados', 'exemplosDeResposta.ts'), 'utf8');
    const pegar = (nome) => JSON.parse(new RegExp(`export const ${nome} = (\\{.*\\});`).exec(texto)[1]);
    const exemploMeteo = pegar('RESPOSTA_OPEN_METEO');
    const exemploNasa = pegar('RESPOSTA_NASA_POWER');

    // O corpo do Open-Meteo: o dia 21/12/2025 do exemplo, repetido em cada dia que a requisição pede.
    const corpoMeteo = (inicio, fim) => {
      const h = exemploMeteo.hourly;
      const campos = ['shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation', 'temperature_2m'];
      const saida = { time: [], ...Object.fromEntries(campos.map((c) => [c, []])) };
      for (let d = Date.parse(inicio); d <= Date.parse(fim); d += 86400000) {
        const dia = new Date(d).toISOString().slice(0, 10);
        for (let hora = 0; hora < 24; hora++) {
          saida.time.push(`${dia}T${String(hora).padStart(2, '0')}:00`);
          for (const c of campos) saida[c].push(h[c][24 + hora]);
        }
      }
      return { ...exemploMeteo, hourly: saida };
    };
    let meteoFalha = false;
    let nasaFalha = false;
    let pedidosNasa = 0;
    const cors = { 'access-control-allow-origin': '*' };
    await pagina.route('https://archive-api.open-meteo.com/**', (rota) => {
      if (meteoFalha) return rota.abort('failed');
      const u = new URL(rota.request().url());
      return rota.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(corpoMeteo(u.searchParams.get('start_date'), u.searchParams.get('end_date'))) });
    });
    await pagina.route('https://power.larc.nasa.gov/**', (rota) => {
      pedidosNasa += 1;
      if (nasaFalha) return rota.abort('failed');
      return rota.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(exemploNasa) });
    });

    await og(() => window.__offgrid.acoes.novoProjeto());
    await og(() => window.__offgrid.acoes.definirTempo(Date.UTC(2026, 5, 21, 15, 0, 0)));
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);

    // ---- Clima real: a opção existe, mostra "baixando…" e depois a data dos dados.
    const opcoes = await pagina.locator('#clima option').allTextContents();
    conferir(opcoes.includes('Real (medido)'), `o seletor de clima deveria ter "Real (medido)": ${opcoes}`);
    conferir(await pagina.locator('#clima-situacao').isHidden(), 'sem o clima real escolhido, o texto da situação fica escondido');
    await pagina.locator('#clima').selectOption('real');
    await pagina.waitForFunction(() => /dados de|mesmo dia/.test(document.querySelector('#clima-situacao')?.textContent ?? ''), null, { timeout: 10000 });
    let situacao = await pagina.locator('#clima-situacao').textContent();
    conferir(/dados de 21\/06\/202[56]/.test(situacao) && situacao.includes('Open-Meteo'), `o texto deveria dizer de que dia são os dados: "${situacao}"`);
    conferir((await estado()).climaReal.situacao === 'pronto', 'o estado do clima real deveria estar pronto');
    await captura('70-clima-real-data-dos-dados');

    // Data futura: o texto diz "mesmo dia de <ano anterior>".
    const futuro = await og(() => {
      const d = new Date(Date.now() + 30 * 86400000);
      return { ms: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15), ano: d.getUTCFullYear() };
    });
    await og((ms) => window.__offgrid.acoes.definirTempo(ms), futuro.ms);
    await pagina.waitForFunction((ano) => (document.querySelector('#clima-situacao')?.textContent ?? '').includes(`mesmo dia de ${ano}`), futuro.ano - 1, { timeout: 10000 });
    situacao = await pagina.locator('#clima-situacao').textContent();
    console.log(`clima real em data futura: "${situacao}"`);
    await captura('70b-clima-real-dia-futuro');

    // Sem rede: aparece o erro, o aviso de que vale o clima típico e o botão; com a rede de volta, o botão resolve.
    const errosAntes = erros.length;
    meteoFalha = true;
    await og((ms) => window.__offgrid.acoes.definirTempo(ms), futuro.ms + 3 * 86400000);
    await pagina.waitForFunction(() => document.querySelector('#clima-situacao')?.classList.contains('erro'), null, { timeout: 10000 });
    situacao = await pagina.locator('#clima-situacao').textContent();
    conferir(situacao.includes('Open-Meteo') && situacao.includes('clima típico'), `o erro deveria falar do Open-Meteo e do clima típico: "${situacao}"`);
    conferir(await pagina.getByRole('button', { name: 'Tentar de novo' }).isVisible(), 'o botão "Tentar de novo" deveria aparecer no erro');
    await captura('71-clima-real-erro-tentar-de-novo');
    // As falhas de rede acima foram provocadas de propósito: não contam como erro da página.
    await esperar(300);
    erros.splice(errosAntes);
    meteoFalha = false;
    await pagina.getByRole('button', { name: 'Tentar de novo' }).click();
    await pagina.waitForFunction(() => /mesmo dia|dados de/.test(document.querySelector('#clima-situacao')?.textContent ?? ''), null, { timeout: 10000 });
    conferir(!(await pagina.getByRole('button', { name: 'Tentar de novo' }).isVisible()), 'o botão some quando os dados chegam');

    // ---- Cidade: escolher Recife baixa as médias, muda o local do projeto e o rótulo da hora.
    await og((ms) => window.__offgrid.acoes.definirTempo(ms), Date.UTC(2026, 5, 21, 15, 0, 0));
    await pagina.locator('[data-aba="sistema"]').click();
    conferir((await pagina.locator('#seletor-cidade option:checked').textContent()) === 'Rio de Janeiro (RJ)', 'o seletor deveria mostrar o Rio de Janeiro no começo');
    await pagina.locator('#seletor-cidade').selectOption({ label: 'Recife (PE)' });
    await pagina.waitForFunction(() => window.__offgrid.estado().projeto.localId !== 'rio', null, { timeout: 10000 });
    let e = await estado();
    conferir(e.projeto.localId === 'local--8.05--34.88' && e.projeto.localPersonalizado?.nome === 'Recife', `a cidade do projeto deveria ser Recife: ${e.projeto.localId}`);
    const rotuloHora = await pagina.locator('.grupo-hora .rotulo').textContent();
    conferir(rotuloHora.startsWith('Hora em Recife'), `o rótulo da hora deveria citar Recife: "${rotuloHora}"`);
    await pagina.waitForFunction(() => window.__offgrid.estado().climaReal.situacao === 'pronto', null, { timeout: 10000 });
    await pagina.locator('#seletor-cidade').scrollIntoViewIfNeeded();
    await captura('72-seletor-de-cidade-recife');

    // Erro ao baixar: a cidade não muda e a mensagem aparece.
    nasaFalha = true;
    const errosNasa = erros.length;
    await pagina.locator('#seletor-cidade').selectOption({ label: 'Salvador (BA)' });
    await pagina.waitForFunction(() => document.querySelector('#cidade-situacao')?.classList.contains('erro'), null, { timeout: 10000 });
    e = await estado();
    conferir(e.projeto.localId === 'local--8.05--34.88', 'com a rede falhando a cidade não deveria mudar');
    conferir((await pagina.locator('#seletor-cidade option:checked').textContent()) === 'Recife (PE)', 'o seletor deveria voltar para Recife');
    conferir((await pagina.locator('#cidade-situacao').textContent()).includes('NASA POWER'), 'a mensagem de erro deveria citar a NASA POWER');
    await pagina.locator('#cidade-situacao').scrollIntoViewIfNeeded();
    await captura('73-seletor-de-cidade-erro');
    await esperar(300);
    erros.splice(errosNasa);
    nasaFalha = false;

    // O Rio da lista fixa usa o local fixo, sem baixar nada.
    const pedidosAntes = pedidosNasa;
    await pagina.locator('#seletor-cidade').selectOption({ label: 'Rio de Janeiro (RJ)' });
    await pagina.waitForFunction(() => window.__offgrid.estado().projeto.localId === 'rio', null, { timeout: 10000 });
    e = await estado();
    conferir(pedidosNasa === pedidosAntes && e.projeto.localPersonalizado === undefined, 'o Rio da lista fixa não deveria baixar nada nem guardar local personalizado');
    conferir((await pagina.locator('.grupo-hora .rotulo').textContent()).startsWith('Hora no Rio'), 'o rótulo volta para "Hora no Rio"');
    await og(() => window.__offgrid.acoes.definirClima('tipico'));
    await pagina.unroute('https://archive-api.open-meteo.com/**');
    await pagina.unroute('https://power.larc.nasa.gov/**');

    // ---- Passo a passo.
    const contagem = () => pagina.locator('#passo-a-passo .passo-contagem').textContent();
    const painelVisivel = () => pagina.locator('#passo-a-passo').isVisible();
    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.locator('[data-aba="consultor"]').click();
    await pagina.locator('#botao-passo-a-passo').click();
    await pagina.locator('#painel-escolha-roteiro').waitFor({ state: 'visible' });
    conferir((await pagina.locator('#painel-escolha-roteiro .roteiro-opcao').count()) === 3 && ((await pagina.locator('#painel-escolha-roteiro .roteiro-opcao').first().getAttribute('class')) ?? '').includes('roteiro-tutorial'), 'a escolha deveria listar o tutorial primeiro e os dois roteiros da casa');
    await captura('74-passo-a-passo-escolha');

    // 12 V: pergunta antes, e a montagem fica vazia (sem a tomada da rede).
    let mensagemDoDialogo = '';
    pagina.once('dialog', (d) => {
      mensagemDoDialogo = d.message();
      d.accept();
    });
    await pagina.locator('[data-roteiro="primeiro-sistema-12v"]').click();
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    conferir(mensagemDoDialogo.includes('casa vazia') && mensagemDoDialogo.includes('desfazer'), `a pergunta antes de começar: "${mensagemDoDialogo}"`);
    conferir((await contagem()).startsWith('Passo 1 de 8'), `o roteiro de 12 V deveria começar no passo 1 de 8: ${await contagem()}`);
    let p = (await estado()).projeto;
    conferir(p.dispositivos.length === 0 && p.cabos.length === 0, 'o roteiro de 12 V deveria começar com a casa vazia');
    await captura('75-passo-a-passo-12v-passo-1');
    await pagina.getByRole('button', { name: 'Sair do passo a passo' }).click();
    conferir(!(await painelVisivel()), 'sair deveria esconder o painel');

    // 24 V: mantém a tomada da rede; o painel diz "Passo 1 de 8".
    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.locator('#botao-passo-a-passo').click();
    pagina.once('dialog', (d) => d.accept());
    await pagina.locator('[data-roteiro="plano-da-casa-24v"]').click();
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    conferir((await contagem()).startsWith('Passo 1 de 8'), `o roteiro de 24 V deveria começar no passo 1 de 8: ${await contagem()}`);
    p = (await estado()).projeto;
    conferir(p.cabos.length === 0 && p.dispositivos.length === 1 && p.dispositivos[0].itemId === 'rede-tomada', `o roteiro de 24 V deveria manter só a tomada da rede: ${JSON.stringify(p.dispositivos.map((d) => d.itemId))}`);
    const sessao = await og(() => sessionStorage.getItem('offgrid.passoapasso'));
    conferir(sessao && JSON.parse(sessao).roteiro === 'plano-da-casa-24v', `o roteiro em andamento deveria ficar no sessionStorage: ${sessao}`);
    await captura('76-passo-a-passo-24v-passo-1');

    // O painel não captura o ponteiro fora dos botões e não cobre a barra de tempo.
    const geometria = await og(() => {
      const painel = document.querySelector('#passo-a-passo');
      const r = painel.getBoundingClientRect();
      const base = document.querySelector('#base').getBoundingClientRect();
      const titulo = painel.querySelector('.passo-titulo').getBoundingClientRect();
      const noTitulo = document.elementFromPoint(titulo.left + 10, titulo.top + titulo.height / 2);
      const botao = painel.querySelector('button').getBoundingClientRect();
      const noBotao = document.elementFromPoint(botao.left + botao.width / 2, botao.top + botao.height / 2);
      return { baixo: r.bottom, topoDaBase: base.top, textoCapturaPonteiro: painel.contains(noTitulo), botaoResponde: painel.contains(noBotao) };
    });
    conferir(geometria.baixo <= geometria.topoDaBase, `o painel não deveria cobrir a barra de tempo: ${JSON.stringify(geometria)}`);
    conferir(!geometria.textoCapturaPonteiro && geometria.botaoResponde, `o painel só deveria capturar o ponteiro nos botões: ${JSON.stringify(geometria)}`);

    // Mostrar no catálogo: no passo 1 o item é a bateria; abre a aba e destaca o cartão.
    await pagina.getByRole('button', { name: 'Mostrar no catálogo' }).click();
    conferir((await pagina.locator('#abas-catalogo [data-cat="baterias"]').getAttribute('aria-selected')) === 'true', 'o catálogo deveria abrir na aba Baterias');
    conferir((await pagina.locator('#lista-catalogo .cartao.destaque-passo').count()) === 1, 'o cartão do item do passo deveria ficar destacado');
    await captura('77-passo-a-passo-mostrar-no-catalogo');

    // Cumpre os dois primeiros passos: o painel avança sozinho, com o "Feito!".
    const encaixe = (itemId, superficie, ponto, normal) => og(([i, s, pt, n]) => window.__offgrid.encaixar(i, s, pt, n), [itemId, superficie, ponto, normal]);
    const noPiso = await encaixe('bat-alfx-24v-100', { id: 'piso-quartinho', tipo: 'piso' }, [6.5, 0.05, -2.0], [0, 1, 0]);
    await og((enc) => window.__offgrid.acoes.adicionarDispositivo('bat-alfx-24v-100', enc), noPiso);
    await og(() => window.__offgrid.recalcular());
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo .passo-contagem')?.textContent.startsWith('Passo 2 de 8'), null, { timeout: 5000 });
    conferir((await pagina.locator('#passo-a-passo .passo-feito').count()) === 1, 'ao cumprir o passo 1 deveria aparecer o "Feito!"');
    await captura('78-passo-a-passo-feito-e-passo-2');
    const naParede = await encaixe('inv-anenji-3kw-24v-127', { id: 'parede-quartinho-fundo', tipo: 'parede' }, [6.5, 1.3, -2.95], [0, 0, 1]);
    await og((enc) => window.__offgrid.acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', enc), naParede);
    await og(() => window.__offgrid.recalcular());
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo .passo-contagem')?.textContent.startsWith('Passo 3 de 8'), null, { timeout: 5000 });
    await captura('79-passo-a-passo-passo-3');

    // Pular: o passo 3 sai da frente.
    await pagina.getByRole('button', { name: 'Pular' }).click();
    conferir((await contagem()).startsWith('Passo 4 de 8'), `pular deveria ir para o passo 4: ${await contagem()}`);
    conferir((await pagina.locator('#passo-a-passo .passo-item.pulado').count()) === 1, 'o passo pulado deveria aparecer marcado na lista');

    // Recarregar a página: o andamento volta da sessão (o projeto volta da gravação do navegador).
    await esperar(900);
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    conferir((await contagem()).startsWith('Passo 4 de 8'), `depois de recarregar o painel deveria continuar no passo 4: ${await contagem()}`);

    // O plano corrigido inteiro (convertido para a cena): todos os passos ficam feitos e vem o resumo.
    await og(() => {
      const a = window.__offgrid.acoes;
      a.novoProjeto();
      const proj = JSON.parse(JSON.stringify(window.__offgrid.estado().projeto));
      const disp = (uid, itemId) => ({ uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null });
      const i = proj.dispositivos.findIndex((d) => d.uid === 'placa1');
      proj.dispositivos.splice(i + 1, 0, disp('placa2', 'placa-renepv-585'));
      for (const c of proj.cabos) {
        if (c.uid === 'c1') {
          c.protecoes.push('prot-dps-cc-600');
          c.quadro = 'quadro-cc';
        }
        if (c.uid === 'c2') c.de = { disp: 'placa2', terminal: 'neg' };
        if (c.uid === 'c3' || c.uid === 'c4') c.caboId = 'cabo-bat-35';
        if (c.de.terminal === 'caSaida') {
          c.protecoes.push('prot-disjuntor-ca-16');
          c.quadro = 'quadro-ca';
        }
      }
      proj.dispositivos.push(disp('quadro-cc', 'acc-quadro-8'), disp('quadro-ca', 'acc-quadro-8'));
      proj.cabos.push({ uid: 'c12', de: { disp: 'placa1', terminal: 'neg' }, para: { disp: 'placa2', terminal: 'pos' }, caboId: 'cabo-solar-6', comprimento: 1.5, protecoes: [], quadro: null });
      a.carregarProjeto(proj);
      window.__offgrid.recalcular();
    });
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo')?.dataset.situacao === 'resumo', null, { timeout: 5000 });
    const resumo = await pagina.locator('#passo-a-passo').textContent();
    conferir(resumo.includes('Montagem concluída') && /autonomia|sustenta/.test(resumo) && resumo.includes('Orçamento total: R$') && resumo.includes('queda de luz'), `o resumo deveria trazer autonomia, orçamento e a sugestão da queda de luz: "${resumo}"`);
    await mudarCamera(CAMERA_INICIAL.pos, CAMERA_INICIAL.alvo);
    await captura('80-passo-a-passo-resumo');

    // A sugestão da queda de luz liga a simulação; sair apaga o painel e o andamento.
    await pagina.getByRole('button', { name: 'Simular queda de luz' }).click();
    conferir((await estado()).simulacao.quedaDeLuz.ativa === true, 'o botão do resumo deveria ligar a queda de luz');
    await og(() => window.__offgrid.acoes.alternarQuedaDeLuz());
    await pagina.getByRole('button', { name: 'Sair do passo a passo' }).click();
    conferir(!(await painelVisivel()), 'sair deveria esconder o painel');
    conferir((await og(() => sessionStorage.getItem('offgrid.passoapasso'))) === null, 'sair deveria apagar o andamento da sessão');
  }
  await verificarClimaCidadePassoAPasso();

  // ---------------------------------------------------------------- O conjunto: cabo com dois cliques, atalhos com o foco em um controle e câmera
  async function verificarConjunto() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const situacao = () => og(() => window.__offgrid.interacao());
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    const terminal = (uid, t) => og(([u, x]) => window.__offgrid.telaDoTerminal(u, x), [uid, t]);
    await og(() => {
      const a = window.__offgrid.acoes;
      if (window.__offgrid.estado().edicaoCasa.ativa) a.definirEdicaoDaCasa(false);
      a.novoProjeto();
      a.selecionar(null);
    });
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();

    // Cabo com dois cliques: clique no terminal, câmera livre no caminho, clique no destino.
    let p = (await estado()).projeto;
    const inversor = p.dispositivos.find((d) => d.uid === 'inversor');
    const doPositivo = p.cabos.find((c) => [c.de, c.para].some((x) => x.disp === 'bateria1' && x.terminal === 'pos') && [c.de, c.para].some((x) => x.disp === 'inversor' && x.terminal === 'batPos'));
    conferir(doPositivo, 'o cenário deveria ter o cabo do positivo da bateria ao BAT+ do inversor');
    await og((uid) => window.__offgrid.acoes.removerCabo(uid), doPositivo.uid);
    for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    const cabos = (await estado()).projeto.cabos.length;
    await mudarCamera(noMundo([inversor.pos[0] + 0.4, 1.5, inversor.pos[2] + 5.4]), noMundo([inversor.pos[0], 1.1, inversor.pos[2]]));
    await esperar(400);
    let ponto = await terminal('bateria1', 'pos');
    await pagina.mouse.click(ponto[0], ponto[1]);
    await esperar(200);
    conferir((await situacao()).modo === 'cabo', `um clique no terminal deveria prender o cabo ao ponteiro: ${JSON.stringify(await situacao())}`);
    // Girar a câmera (arrastar no vazio) não solta o cabo; a câmera volta ao lugar para o segundo clique.
    const tela = await pagina.locator('#cena canvas').boundingBox();
    await pagina.mouse.move(tela.x + 40, tela.y + 60);
    await pagina.mouse.down();
    await pagina.mouse.move(tela.x + 90, tela.y + 70, { steps: 5 });
    await pagina.mouse.up();
    await esperar(200);
    conferir((await situacao()).modo === 'cabo', 'girar a câmera não deveria soltar o cabo preso ao ponteiro');
    await mudarCamera(noMundo([inversor.pos[0] + 0.4, 1.5, inversor.pos[2] + 5.4]), noMundo([inversor.pos[0], 1.1, inversor.pos[2]]));
    await esperar(300);
    ponto = await terminal('inversor', 'batPos');
    await pagina.mouse.move(ponto[0], ponto[1], { steps: 6 });
    await esperar(300);
    await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    conferir((await situacao()).valido === true, `o cabo preso ao ponteiro sobre o BAT+ deveria poder ser ligado: ${JSON.stringify(await situacao())}`);
    await captura('81-cabo-com-dois-cliques');
    await pagina.mouse.click(ponto[0], ponto[1]);
    await esperar(300);
    p = (await estado()).projeto;
    conferir(p.cabos.length === cabos + 1 && (await situacao()).modo === 'ocioso', 'o segundo clique deveria criar o cabo e encerrar');
    const novo = p.cabos[p.cabos.length - 1];
    conferir(novo.de.disp === 'bateria1' && novo.de.terminal === 'pos' && novo.para.disp === 'inversor' && novo.para.terminal === 'batPos', `o cabo deveria ligar o positivo da bateria ao BAT+: ${JSON.stringify(novo)}`);
    for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    // Esc larga o cabo preso ao ponteiro.
    ponto = await terminal('bateria1', 'neg');
    await pagina.mouse.click(ponto[0], ponto[1]);
    await esperar(200);
    conferir((await situacao()).modo === 'cabo', 'outro clique em um terminal deveria prender outro cabo');
    await pagina.keyboard.press('Escape');
    conferir((await situacao()).modo === 'ocioso' && (await estado()).projeto.cabos.length === cabos + 1, 'Esc deveria largar o cabo preso ao ponteiro sem criar nada');

    // Atalhos com o foco no controle da hora: Ctrl+Z continua desfazendo.
    await og(() => window.__offgrid.acoes.selecionar(null));
    await pagina.locator('#hora').focus();
    await pagina.keyboard.press('Control+Z');
    conferir((await estado()).projeto.cabos.length === cabos, 'Ctrl+Z deveria desfazer mesmo com o foco no controle da hora');
    await pagina.keyboard.press('Control+Y');
    conferir((await estado()).projeto.cabos.length === cabos + 1, 'Ctrl+Y deveria refazer mesmo com o foco no controle da hora');
    await og(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

    // Câmera: "Vista inicial" volta à vista da abertura; a roda aproxima do ponto sob o ponteiro.
    await pagina.locator('#botao-vista-inicial').click();
    let camera = await og(() => window.__offgrid.camera());
    conferir(Math.abs(camera.pos[0] - CAMERA_INICIAL.pos[0]) < 1e-6 && Math.abs(camera.alvo[1] - CAMERA_INICIAL.alvo[1]) < 1e-6, `"Vista inicial" deveria devolver a câmera: ${JSON.stringify(camera)}`);
    const q = (await estado()).projeto.casa.quartinho;
    for (let i = 0; i < 8; i++) {
      const alvo = await og((pt) => window.__offgrid.telaDoPonto(pt), [q.x, 0.3, q.z + 0.4]);
      await pagina.mouse.move(alvo[0], alvo[1]);
      await pagina.mouse.wheel(0, -240);
      await esperar(80);
    }
    await esperar(300);
    camera = await og(() => window.__offgrid.camera());
    const perto = Math.hypot(camera.alvo[0] + q.x, camera.alvo[2] + q.z);
    conferir(perto < 3.5, `a roda deveria aproximar a câmera do quartinho, que estava sob o ponteiro: alvo a ${perto.toFixed(1)} m dele`);
    await captura('82-roda-aproxima-do-ponteiro');
    await pagina.locator('#botao-vista-inicial').click();
  }
  // ---- Tutorial do quartinho (tarefa 7.5): entrada pelo cartão, nove passos com o mouse, teste de autonomia e saída.
  async function verificarTutorial() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const projeto = async () => (await estado()).projeto;
    const situacao = () => og(() => window.__offgrid.interacao());
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    const painel = () => pagina.locator('#passo-a-passo');
    const destaques = async () => (await estado()).destaques ?? [];
    const olhar = (pos, alvo) => mudarCamera(noMundo(pos), noMundo(alvo));
    const parado = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return situacao();
    };
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
    const telaDoPonto = (pt) => og((x) => window.__offgrid.telaDoPonto(x), pt);
    const telaDoTerminal = (uid, t) => og(([u, x]) => window.__offgrid.telaDoTerminal(u, x), [uid, t]);
    const fecharAvisos = async () => {
      for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    };
    /** Espera o painel chegar ao passo `n` (1 a 9) ou ao resumo (10). */
    const noPasso = async (n) => {
      try {
        await pagina.waitForFunction((x) => document.querySelector('#passo-a-passo')?.dataset.passo === String(x), n, { timeout: 8000 });
      } catch {
        const e = await estado();
        const sug = (e.derivados?.sugestoes ?? []).map((x) => `${x.nivel}: ${x.titulo}`);
        throw new Error(`Conferência falhou: o painel deveria estar no passo ${n}; está no ${await painel().getAttribute('data-passo')}. Consultor: ${JSON.stringify(sug)}`);
      }
      await esperar(200);
    };
    const exigirDestaque = async (tipo, mensagem) => {
      const d = await destaques();
      conferir(d.length > 0 && d.every((x) => x.tipo === tipo), `${mensagem}: ${JSON.stringify(d)}`);
      return d;
    };
    const arrastarPeca = async (itemId, pontoDeCasa, nome) => {
      const alvo = await telaDoPonto(pontoDeCasa);
      await fecharAvisos();
      const s = await levar(await doCartao(itemId), alvo);
      conferir(s.modo === 'catalogo' && s.valido === true, `${nome}: soltar ${itemId} em ${JSON.stringify(pontoDeCasa)} deveria ficar verde: ${JSON.stringify(s)}`);
      await soltar();
      await fecharAvisos();
    };
    const uidDe = async (itemId) => (await projeto()).dispositivos.find((d) => d.itemId === itemId)?.uid;
    const cabo = async (uid1, t1, uid2, t2) => {
      await fecharAvisos();
      const de = await telaDoTerminal(uid1, t1);
      const para = await telaDoTerminal(uid2, t2);
      conferir(de && para, `os terminais ${uid1}.${t1} e ${uid2}.${t2} deveriam estar na tela`);
      let s = await levar(de, [(de[0] + para[0]) / 2 + 40, (de[1] + para[1]) / 2]);
      if (s.modo !== 'cabo') await pagina.screenshot({ path: join(pasta, 'zz-falha-cabo.png') });
      conferir(s.modo === 'cabo', `puxar do terminal ${uid1}.${t1} deveria começar um cabo: ${JSON.stringify(s)}`);
      await pagina.mouse.move(para[0], para[1], { steps: 8 });
      s = await parado();
      conferir(s.valido === true, `o cabo ${uid1}.${t1} até ${uid2}.${t2} deveria poder ser ligado: ${JSON.stringify(s)}`);
      await soltar();
      await fecharAvisos();
    };
    /** Câmera para dentro do quartinho: a porta fica no lado de z negativo e a parede do fundo em z = +1,25. */
    const paraDentro = async () => {
      await olhar([0, 3.0, -4.2], [0, 0.8, 0.4]);
      await esperar(300);
      await fecharAvisos();
    };
    const botaoDoPainel = (acao) => painel().locator(`button[data-acao="${acao}"]`);
    const esperarTeste = (fase, ms) => pagina.waitForFunction((f) => document.querySelector('#passo-a-passo')?.dataset.teste === f, fase, { timeout: ms });
    const esperarSituacao = (sit) => pagina.waitForFunction((x) => document.querySelector('#passo-a-passo')?.dataset.situacao === x, sit, { timeout: 8000 });

    // ---- Entrada pelo cartão "Por onde começar": volta o cartão e confere o botão principal.
    await og(() => window.__offgrid.acoes.novoProjeto());
    await esperar(900);
    await og(() => localStorage.removeItem('offgrid.boasvindas.vista'));
    await og(() => sessionStorage.clear());
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    conferir(await pagina.locator('#boas-vindas').isVisible(), 'o cartão "Por onde começar" deveria aparecer de novo');
    conferir((await pagina.locator('#boas-vindas button').first().textContent()) === 'Fazer o tutorial', 'o botão principal do cartão deveria ser "Fazer o tutorial"');
    const casaAntes = await projeto();
    conferir(!casaAntes.casa.soQuartinho && casaAntes.dispositivos.length > 0, 'antes do tutorial deveria haver a casa com peças');

    let confirmou = false;
    pagina.once('dialog', (dlg) => {
      confirmou = true;
      dlg.dismiss();
    });
    await pagina.locator('#boas-vindas button[data-acao="tutorial"]').click();
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    await esperar(400);
    conferir(!confirmou, 'entrar no tutorial não deveria pedir confirmação');
    let e = await estado();
    conferir(e.projeto.casa.soQuartinho === true && e.projeto.dispositivos.length === 0 && e.projeto.cabos.length === 0, 'o tutorial deveria abrir só com o quartinho, vazio');
    const guardada = JSON.parse(await og(() => localStorage.getItem('offgrid.projeto.casa')));
    conferir(JSON.stringify(guardada) === JSON.stringify(casaAntes), 'a casa deveria ficar guardada em offgrid.projeto.casa');
    conferir((await painel().getAttribute('data-roteiro')) === 'tutorial-quartinho', 'o painel deveria mostrar o roteiro do tutorial');
    conferir((await pagina.locator('#passo-a-passo .passo-contagem').textContent()).startsWith('Passo 1 de 9'), 'o tutorial deveria começar no passo 1 de 9');
    conferir((await painel().textContent()).includes('Sair do tutorial'), 'o painel deveria ter "Sair do tutorial"');
    // Topo.
    conferir(await pagina.locator('#rotulo-tutorial').isVisible(), 'o rótulo "Tutorial" deveria aparecer no topo');
    for (const id of ['#abrir-casa', '#botao-editar-casa']) conferir(!(await pagina.locator(id).isVisible()), `${id} deveria sumir no tutorial`);
    await pagina.locator('#botao-projeto').click();
    conferir(!(await pagina.locator('#botao-novo').isVisible()) && !(await pagina.locator('#botao-importar').isVisible()) && (await pagina.locator('#botao-exportar').isVisible()), 'no menu Projeto só "Exportar" deveria sobrar');
    await pagina.keyboard.press('Escape');
    // Passo 1: realce da superfície do telhado.
    let d = await exigirDestaque('superficie', 'no passo 1 deveria haver realce de superfície');
    conferir(d[0].id === 'telhado-quartinho', `o passo 1 deveria realçar o telhado do quartinho: ${JSON.stringify(d)}`);
    await pagina.locator('#botao-vista-inicial').click();
    await esperar(1200);
    await captura('83-tutorial-aberto-passo-1');
    // Cena (se já existir): destaque desenhado.
    const naCena = await og(() => window.__offgrid.destaquesNaCena?.());
    if (naCena !== undefined) conferir(Array.isArray(naCena) ? naCena.length > 0 : Boolean(naCena), `a cena deveria desenhar o realce: ${JSON.stringify(naCena)}`);

    // ---- Passo 1: a placa no telhado do quartinho.
    await olhar([0, 5.5, 6], [0, 2, 0]);
    await esperar(300);
    let colocada = false;
    for (const y of [2.5, 2.6, 2.7, 2.4, 2.8]) {
      const alvo = await telaDoPonto([0, y, 0]);
      const s = await levar(await doCartao('placa-resun-100'), alvo);
      if (s.modo === 'catalogo' && s.valido === true) {
        await soltar();
        colocada = true;
        break;
      }
      await pagina.keyboard.press('Escape');
      await soltar();
    }
    conferir(colocada, 'a placa deveria poder ser solta no telhado do quartinho');
    await fecharAvisos();
    let p = await projeto();
    conferir(p.dispositivos.length === 1 && p.dispositivos[0].superficie === 'telhado-quartinho', `a placa deveria ficar em telhado-quartinho: ${JSON.stringify(p.dispositivos.map((x) => x.superficie))}`);
    await noPasso(2);
    d = await exigirDestaque('superficie', 'no passo 2 deveria haver realce de superfície');
    conferir(d[0].id === 'piso-quartinho', `o passo 2 deveria realçar o piso: ${JSON.stringify(d)}`);

    // ---- Passos 2 e 3: bateria e inversor no piso, com o quartinho aberto.
    await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
    await paraDentro();
    await esperar(400);
    await captura('84-tutorial-passo-2-realce-no-piso');
    await arrastarPeca('bat-moura-12mn105', [0.8, 0.05, 0.5], 'passo 2');
    await noPasso(3);
    await arrastarPeca('inv-aiker-500-12v-110', [-0.8, 0.05, 0.5], 'passo 3');
    await noPasso(4);
    const bateria = await uidDe('bat-moura-12mn105');
    const inversor = await uidDe('inv-aiker-500-12v-110');

    // Recarregar a página com o projeto do tutorial aberto continua o tutorial, mesmo sem nada na sessão.
    await esperar(900);
    await og(() => sessionStorage.clear());
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    await painel().waitFor({ state: 'visible' });
    await noPasso(4);
    conferir((await painel().getAttribute('data-roteiro')) === 'tutorial-quartinho' && (await pagina.locator('#rotulo-tutorial').isVisible()), 'depois de recarregar o tutorial deveria continuar');
    await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
    await paraDentro();
    await esperar(400);

    // ---- Passo 4: cabos da bateria ao inversor; o destaque é de terminais.
    d = await exigirDestaque('terminal', 'no passo 4 deveria haver realce de terminais');
    conferir(d.length === 4, `o passo 4 deveria realçar os quatro terminais: ${JSON.stringify(d)}`);
    await captura('85-tutorial-passo-4-realce-nos-terminais');
    await cabo(bateria, 'pos', inversor, 'batPos');
    await esperar(400);
    d = await destaques();
    conferir(d.length === 2 && d.every((x) => x.tipo === 'terminal'), `com um cabo ligado deveriam sobrar dois terminais: ${JSON.stringify(d)}`);
    await cabo(bateria, 'neg', inversor, 'batNeg');
    await noPasso(5);

    // ---- Passo 5: fusível no cabo positivo (realce no cabo).
    d = await exigirDestaque('cabo', 'no passo 5 deveria haver realce no cabo');
    p = await projeto();
    const caboPos = p.cabos.find((c) => c.de.disp === bateria && c.de.terminal === 'pos');
    conferir(d.length === 1 && d[0].uid === caboPos.uid, `o realce do passo 5 deveria ser o cabo positivo: ${JSON.stringify(d)}`);
    const sFus = await levar(await doCartao('prot-fusivel-anl-100'), await og((u) => window.__offgrid.telaDoCabo(u, 0.5), caboPos.uid));
    conferir(sFus.modo === 'protecao' && sFus.valido === true, `o fusível sobre o cabo positivo deveria poder ser instalado: ${JSON.stringify(sFus)}`);
    await soltar();
    await noPasso(6);

    // ---- Passo 6: controlador na parede do fundo e dois cabos até a bateria.
    d = await exigirDestaque('superficie', 'no passo 6 deveria haver realce de superfície');
    conferir(d[0].id === 'parede-quartinho-fundo', `o passo 6 deveria realçar a parede do fundo: ${JSON.stringify(d)}`);
    // A parede do fundo: a câmera está na porta, então ela ocupa a parte de cima da cena; tenta alguns pontos até ficar verde.
    let noFundo = false;
    for (const [fx, fy] of [[0.5, 0.42], [0.62, 0.42], [0.38, 0.45], [0.5, 0.35]]) {
      const caixa = await pagina.locator('#cena canvas').boundingBox();
      const s = await levar(await doCartao('ctl-pwm-30a'), [caixa.x + caixa.width * fx, caixa.y + caixa.height * fy]);
      if (s.modo === 'catalogo' && s.valido === true) {
        await soltar();
        noFundo = true;
        break;
      }
      await pagina.keyboard.press('Escape');
      await soltar();
    }
    conferir(noFundo, 'o controlador deveria poder ser solto na parede do fundo do quartinho');
    await fecharAvisos();
    conferir((await projeto()).dispositivos.find((x) => x.itemId === 'ctl-pwm-30a')?.superficie === 'parede-quartinho-fundo', 'o controlador deveria ficar na parede do fundo');
    const ctl = await uidDe('ctl-pwm-30a');
    await esperar(400);
    await exigirDestaque('terminal', 'no passo 6, com o controlador, deveria haver realce de terminais');
    await cabo(bateria, 'pos', ctl, 'batPos');
    await cabo(bateria, 'neg', ctl, 'batNeg');
    await noPasso(7);

    // ---- Passo 7: cabos da placa no controlador.
    await esperar(300);
    await exigirDestaque('terminal', 'no passo 7 deveria haver realce de terminais');
    const placa = await uidDe('placa-resun-100');
    // A placa está no telhado e o controlador dentro do quartinho: com o telhado à vista, a placa só aparece de cima.
    // O cabo é feito com dois cliques: clica no terminal da placa (vista de cima) e, com o cabo preso ao ponteiro,
    // a câmera vai para dentro do quartinho, pela porta, e o segundo clique cai no terminal do controlador.
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    const cabo2cliques = async (uid1, t1, uid2, t2) => {
      await fecharAvisos();
      await olhar([0, 5.5, 6], [0, 2, 0]);
      await esperar(400);
      const de = await telaDoTerminal(uid1, t1);
      conferir(de, `o terminal ${uid1}.${t1} deveria estar na tela vista de cima`);
      await pagina.mouse.click(de[0], de[1]);
      await esperar(250);
      conferir((await situacao()).modo === 'cabo', `um clique no terminal ${uid1}.${t1} deveria prender o cabo ao ponteiro: ${JSON.stringify(await situacao())}`);
      await olhar([0, 1.5, -3.6], [0, 1.0, 0.4]);
      await esperar(400);
      const para = await telaDoTerminal(uid2, t2);
      conferir(para, `o terminal ${uid2}.${t2} deveria estar na tela, visto de dentro`);
      await pagina.mouse.move(para[0], para[1], { steps: 8 });
      const s = await parado();
      if (s.valido !== true) await pagina.screenshot({ path: join(pasta, 'zz-falha-cabo2.png') });
      conferir(s.valido === true, `o cabo ${uid1}.${t1} até ${uid2}.${t2} deveria poder ser ligado: ${JSON.stringify(s)}`);
      await pagina.mouse.click(para[0], para[1]);
      await esperar(300);
      await fecharAvisos();
    };
    await cabo2cliques(placa, 'pos', ctl, 'pvPos');
    await cabo2cliques(placa, 'neg', ctl, 'pvNeg');
    await noPasso(8);
    await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
    await paraDentro();

    // ---- Passo 8: lâmpada no piso, plugue na saída do inversor.
    d = await exigirDestaque('superficie', 'no passo 8, sem aparelho, deveria haver realce de superfície');
    conferir(d[0].id === 'piso-quartinho', `o passo 8 deveria realçar o piso: ${JSON.stringify(d)}`);
    await arrastarPeca('ap-ventilador', [0.4, 0.05, -0.2], 'passo 8');
    const ventilador = await uidDe('ap-ventilador');
    await esperar(400);
    await exigirDestaque('terminal', 'no passo 8, com o aparelho, deveria haver realce de terminais');
    await cabo(ventilador, 'plug', inversor, 'caSaida');
    p = await projeto();
    if (!p.dispositivos.find((x) => x.uid === ventilador).ligado) await og((u) => window.__offgrid.acoes.definirLigado(u, true), ventilador);
    await og(() => window.__offgrid.acoes.selecionar(null));

    // ---- Passo 9: sem erros → resumo. Se ficar preso aqui, o consultor diz por quê.
    try {
      await esperarSituacao('resumo');
    } catch {
      const sug = ((await estado()).derivados?.sugestoes ?? []).map((x) => `${x.nivel}: ${x.titulo}`);
      throw new Error(`Conferência falhou: o passo "sem erros" não fechou. Sugestões do consultor: ${JSON.stringify(sug)}`);
    }
    conferir((await destaques()).length === 0, 'no resumo a lista de destaques deveria estar vazia');
    const resumoTexto = await painel().textContent();
    conferir(resumoTexto.includes('Montagem concluída') && resumoTexto.includes('Testar a bateria') && resumoTexto.includes('Orçamento total: R$'), `o resumo do tutorial: "${resumoTexto}"`);
    await pagina.locator('#botao-vista-inicial').click();
    await esperar(1000);
    await captura('86-tutorial-resumo');

    // Um passo desfeito durante o teste cancela o teste e o painel volta ao passo da vez.
    await botaoDoPainel('testar-bateria').click();
    await esperarTeste('rodando', 5000);
    conferir((await painel().textContent()).includes('a partir das 18:00'), 'o teste deveria começar às 18:00');
    e = await estado();
    conferir(e.simulacao.quedaDeLuz.ativa === true && e.tempo.velocidade === 60 && (await destaques()).length === 0, 'durante o teste: contagem sem rede ligada, 60 min/s e nenhum destaque');
    await og((u) => window.__offgrid.acoes.removerDispositivo(u), ventilador);
    await esperarSituacao('andamento');
    e = await estado();
    conferir(!e.simulacao.quedaDeLuz.ativa && e.tempo.velocidade === 0 && !(await painel().getAttribute('data-teste')), `remover o ventilador no meio do teste deveria cancelá-lo e parar o relógio: queda ${e.simulacao.quedaDeLuz.ativa}, velocidade ${e.tempo.velocidade}, teste ${await painel().getAttribute('data-teste')}`);
    conferir((await painel().getAttribute('data-passo')) === '8', 'o painel deveria voltar ao passo do aparelho');
    await og(() => window.__offgrid.acoes.desfazer());
    await esperarSituacao('resumo');

    // ---- Teste com o ventilador (50 W): a bateria esvazia. O horário de uso do aparelho (10 às 22 h) não vale no teste.
    await botaoDoPainel('testar-bateria').click();
    await esperarTeste('rodando', 5000);
    await esperar(1500);
    conferir(await pagina.locator('#faixa-queda').isHidden(), 'durante o teste a faixa "A bateria acabou às…" não deveria aparecer');
    conferir((await painel().textContent()).includes('No teste, os aparelhos ligados ficam funcionando o tempo todo.'), 'o painel deveria avisar que no teste os aparelhos funcionam o tempo todo');
    await captura('87-tutorial-teste-rodando');
    await esperarTeste('resultado', 150000);
    e = await estado();
    let texto = await painel().textContent();
    conferir(/A bateria segurou (\d+ h( \d+ min)?|\d+ min): das 18:00 às \d\d:\d\d\./.test(texto), `texto do resultado com o ventilador: "${texto}"`);
    conferir(/Aparelhos ligados: Ventilador, somando 50 W\./.test(texto), `o resultado deveria listar o ventilador e os 50 W: "${texto}"`);
    conferir(texto.includes('inversor de 500 W') && texto.includes('Geladeira e micro-ondas'), 'o resultado deveria avisar da geladeira e do micro-ondas');
    conferir(e.tempo.velocidade === 0 && !e.simulacao.quedaDeLuz.ativa, 'ao terminar o teste o tempo deveria parar e a contagem sem rede acabar');
    conferir(e.simulacao.estadoSim.soc < 0.55, `no teste do ventilador a bateria deveria estar no limite de descarga: ${e.simulacao.estadoSim.soc}`);
    conferir((await pagina.locator('button[data-acao="testar-de-novo"]').count()) === 1 && (await pagina.locator('#passo-a-passo button[data-acao="sair"]').count()) === 1, 'o resultado deveria ter "Testar de novo" e "Sair do tutorial"');
    conferir(await pagina.locator('#faixa-queda').isHidden(), 'a faixa da queda de luz não deveria aparecer no tutorial');
    await captura('88-tutorial-resultado-ventilador');

    // ---- "Testar de novo" repete o teste com o mesmo resultado.
    await botaoDoPainel('testar-de-novo').click();
    await esperarTeste('rodando', 5000);
    await esperarTeste('resultado', 150000);
    const textoDeNovo = await painel().textContent();
    conferir(/A bateria segurou .+: das 18:00 às \d\d:\d\d\./.test(textoDeNovo) && textoDeNovo.includes('Ventilador, somando 50 W'), `testar de novo deveria dar outro resultado completo: "${textoDeNovo}"`);
    texto = textoDeNovo;

    // ---- Troca de aparelho: desliga o ventilador, lâmpada no piso, plugue na saída: a bateria passa de 24 horas.
    await og((u) => window.__offgrid.acoes.definirLigado(u, false), ventilador);
    await paraDentro();
    await arrastarPeca('ap-lampada', [0.4, 0.05, -0.2], 'lâmpada');
    const lampada = await uidDe('ap-lampada');
    await cabo(lampada, 'plug', inversor, 'caSaida');
    p = await projeto();
    if (!p.dispositivos.find((x) => x.uid === lampada).ligado) await og((u) => window.__offgrid.acoes.definirLigado(u, true), lampada);
    await og(() => window.__offgrid.acoes.selecionar(null));
    await esperarSituacao('resumo');
    await botaoDoPainel('testar-bateria').click();
    await esperarTeste('rodando', 5000);
    await esperarTeste('resultado', 150000);
    texto = await painel().textContent();
    conferir(texto.includes('A bateria passou de 24 horas. O ponto mais baixo foi') && /às \d\d:\d\d; de dia a placa repôs o que foi gasto à noite\./.test(texto), `texto do resultado com a lâmpada: "${texto}"`);
    conferir(/Aparelhos ligados: Lâmpada LED, somando 9 W\./.test(texto) && !texto.includes('Ventilador, somando'), `o resultado deveria listar só a lâmpada ligada: "${texto}"`);
    e = await estado();
    conferir(e.simulacao.quedaDeLuz.ativa === false && e.tempo.velocidade === 0, 'o teste da lâmpada deveria parar o tempo e encerrar a contagem');
    await captura('89-tutorial-resultado-lampada');

    // ---- Painel em 1280 x 720 e em 1440 x 900: o quartinho na vista inicial não fica sob o painel.
    for (const [largura, altura] of [[1280, 720], [1440, 900]]) {
      await pagina.setViewportSize({ width: largura, height: altura });
      await pagina.locator('#botao-vista-inicial').click();
      await esperar(1200);
      const geo = await og(() => {
        const r = document.querySelector('#passo-a-passo').getBoundingClientRect();
        const cantos = [];
        for (const x of [-1.5, 1.5]) for (const y of [0, 2.4]) for (const z of [-1.25, 1.25]) cantos.push(window.__offgrid.telaDoPonto([x, y, z]));
        const xs = cantos.map((c) => c[0]);
        const ys = cantos.map((c) => c[1]);
        const q = { esq: Math.min(...xs), dir: Math.max(...xs), topo: Math.min(...ys), base: Math.max(...ys) };
        const larg = Math.max(0, Math.min(q.dir, r.right) - Math.max(q.esq, r.left));
        const alt = Math.max(0, Math.min(q.base, r.bottom) - Math.max(q.topo, r.top));
        const area = (q.dir - q.esq) * (q.base - q.topo);
        return { sobreposto: area > 0 ? (larg * alt) / area : 0, painel: [r.left, r.top, r.right, r.bottom].map(Math.round), quartinho: [q.esq, q.topo, q.dir, q.base].map(Math.round) };
      });
      console.log(`tutorial ${largura}x${altura}: o painel cobre ${(geo.sobreposto * 100).toFixed(0)} % do quartinho ${JSON.stringify(geo)}`);
      conferir(geo.sobreposto < 0.15, `o painel não deveria cobrir o quartinho em ${largura}x${altura}: ${JSON.stringify(geo)}`);
      await captura(`90-tutorial-painel-${largura}x${altura}`);
    }

    // ---- Sair: a casa volta igual, o painel fecha, o topo volta.
    await botaoDoPainel('sair').click();
    await esperar(600);
    e = await estado();
    conferir(!e.projeto.casa.soQuartinho, 'ao sair o projeto da casa deveria voltar');
    conferir(JSON.stringify(e.projeto) === JSON.stringify(casaAntes), 'ao sair a casa deveria voltar igual à de antes do tutorial');
    conferir(!(await painel().isVisible()) && (await destaques()).length === 0, 'ao sair o painel deveria fechar e os destaques sumir');
    conferir(!(await pagina.locator('#rotulo-tutorial').isVisible()), 'ao sair o rótulo "Tutorial" deveria sumir');
    for (const id of ['#abrir-casa', '#botao-editar-casa']) conferir(await pagina.locator(id).isVisible(), `${id} deveria voltar ao sair`);
    conferir((await og(() => localStorage.getItem('offgrid.projeto.casa'))) === null, 'ao sair a chave da casa guardada deveria ser apagada');
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await captura('91-tutorial-casa-de-volta');
  }
  await verificarTutorial();

  await verificarConjunto();

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
