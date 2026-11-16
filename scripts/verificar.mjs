// Roteiro de verificação visual. Especificação: docs/especificacao/cena-e-interface.md, seção 14.
// Faz o build, sobe o vite preview, conduz a tela pelos controles e grava capturas em verificacao/.
// Qualquer erro de console ou de página faz o roteiro terminar com código 1.

import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { interceptarBlocos, LUGARES } from './blocos-falsos.mjs';

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
  pagina.on('requestfailed', (r) => {
    // O mapa do ambiente de rádio desiste sozinho dos blocos de que não precisa mais (ao mudar de zoom, por exemplo): isso não é erro.
    if (r.failure()?.errorText === 'net::ERR_ABORTED' && r.url().startsWith('https://tile.openstreetmap.org/')) return;
    erros.push(`requisição falhou: ${r.url()}`);
  });
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
    const arrastaveis = await pagina.locator('#lista-catalogo .cartao[data-arrastavel]').evaluateAll((lista) => lista.map((c) => c.dataset.itemId).sort());
    conferir(JSON.stringify(arrastaveis) === JSON.stringify(['acc-grampo', 'acc-quadro-8']), `na aba Instalação só o quadro e o grampo de parede são arrastáveis: ${JSON.stringify(arrastaveis)}`);
    await captura('14b-catalogo-instalacao');
    await pagina.locator('#abas-catalogo [data-cat="placas"]').click();
    const todas = await cartoes();
    await pagina.locator('#filtro-linha [data-linha="simples"]').click();
    const simples = await pagina.locator('#lista-catalogo .cartao').evaluateAll((l) => l.map((c) => c.dataset.linha));
    conferir(simples.every((x) => x === 'simples') && simples.length <= todas, 'o filtro "simples" deveria mostrar só a linha simples');
    await pagina.locator('#filtro-linha [data-linha="todas"]').click();
    // Fechado, o cartão é só o título e o botão "Mostrar detalhe": sem dados, preço, data nem link.
    const fechados = await pagina.locator('#lista-catalogo .cartao').evaluateAll((l) => l.map((c) => [c.querySelectorAll('a, .preco, .detalhe, .como-entra').length, c.querySelector('.ver-modelos')?.textContent]));
    conferir(fechados.length > 0 && fechados.every(([n, t]) => n === 0 && t === 'Mostrar detalhe'), `os cartões fechados deveriam mostrar só o título e "Mostrar detalhe": ${JSON.stringify(fechados)}`);
    await captura('14-catalogo-placas');
    // Aberto, o detalhe traz os dados, o preço e o link do anúncio, que abre em nova aba com rel seguro.
    await pagina.locator('#lista-catalogo .cartao .ver-modelos').first().click();
    const links = await pagina.locator('#lista-catalogo .cartao a').evaluateAll((l) => l.map((a) => [a.target, a.rel]));
    conferir(links.length > 0 && links.every(([t, r]) => t === '_blank' && r === 'noopener noreferrer'), 'links de anúncio abrem em nova aba com rel seguro');
    conferir((await pagina.locator('#lista-catalogo .cartao .detalhe').count()) === 1 && (await pagina.locator('#lista-catalogo .cartao .preco').count()) >= 1, 'o detalhe aberto mostra os dados e o preço');
    await pagina.locator('#lista-catalogo .cartao .ver-modelos').first().click();

    // Catálogo por tipo: um cartão só para as placas de 585 W, com 2 modelos; os links ficam no detalhe.
    const cartoesPlaca = pagina.locator('#lista-catalogo .cartao', { has: pagina.locator('h4', { hasText: /^Placa solar de 585 W$/ }) });
    conferir((await cartoesPlaca.count()) === 1, 'as placas de 585 W deveriam ser um cartão só');
    const c585 = cartoesPlaca.first();
    conferir((await c585.getAttribute('data-modelos')) === '2', 'o cartão de 585 W deveria ter 2 modelos');
    conferir((await c585.locator('.ver-modelos').textContent()) === 'Mostrar detalhe', 'o cartão fechado mostra "Mostrar detalhe"');
    conferir((await c585.locator('a').count()) === 0 && (await c585.locator('.modelos').count()) === 0, 'fechado, o cartão de 585 W não lista modelos nem links');
    const ordemW = await pagina.locator('#lista-catalogo .cartao h4').allTextContents();
    const pot = ordemW.map((t) => Number(/de (\d+) W/.exec(t)?.[1]));
    conferir(pot.every((x, i) => i === 0 || x >= pot[i - 1]), `os cartões de placa deveriam estar em ordem crescente: ${ordemW.join(' | ')}`);
    const idReferencia = await c585.getAttribute('data-item-id');
    await c585.locator('.ver-modelos').click();
    conferir((await c585.locator('.modelos .modelo').count()) === 2, 'abrir o detalhe lista os 2 modelos');
    conferir((await c585.locator('.rotulo-secao').textContent()).includes('2 modelos no mercado'), 'o detalhe diz "2 modelos no mercado"');
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
    // Importar abre o arquivo como um projeto novo de "Meus projetos": o da tela (agora nublado) continua na lista.
    const projetosAntes = await pagina.evaluate(() => window.__offgrid.acoes.listarProjetos().length);
    await pagina.locator('#arquivo-importar').setInputFiles(caminho);
    await pagina.waitForFunction((n) => window.__offgrid.acoes.listarProjetos().length === n + 1, projetosAntes, { timeout: 5000 });
    const importado = (await estado()).projeto;
    conferir(JSON.stringify({ ...importado, nome: '' }) === JSON.stringify({ ...JSON.parse(antes), nome: '' }), 'o projeto importado deveria ser igual ao exportado, fora o nome');
    conferir(importado.nome !== JSON.parse(antes).nome, `o projeto importado deveria ganhar um nome próprio: "${importado.nome}"`);
    // Apaga o importado: volta o projeto de antes, que tinha ficado nublado; o clima volta ao que era.
    await pagina.evaluate(() => {
      const a = window.__offgrid.acoes;
      a.apagarProjeto(a.listarProjetos().find((p) => p.atual).id);
      a.definirClima('tipico');
    });
    conferir(JSON.stringify((await estado()).projeto) === antes && (await pagina.evaluate(() => window.__offgrid.acoes.listarProjetos().length)) === projetosAntes, 'apagar o importado deveria devolver o projeto de antes');
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
    conferir((await contagem()).startsWith('Passo 1 de 14') && (await contagem()).includes('Parte 1: montar'), `o roteiro de 12 V deveria começar no passo 1 de 14, na parte de montar: ${await contagem()}`);
    let p = (await estado()).projeto;
    conferir(p.dispositivos.length === 0 && p.cabos.length === 0, 'o roteiro de 12 V deveria começar com a casa vazia');
    await captura('75-passo-a-passo-12v-passo-1');

    // ---- Parte de ligar do roteiro de 12 V, com o mouse e ao meio-dia (de dia, a ordem errada queimaria o controlador).
    // A montagem entra pronta, como o usuário a deixaria: fusível e disjuntor no cabo positivo, abertos; inversor e
    // lâmpada desligados; a placa no telhado, ainda sem cabo. A cena encaixa as peças nos lugares da tabela.
    const tempoAntesDosRoteiros = (await estado()).tempo.msUtc;
    const MEIO_DIA_21_JUN = Date.UTC(2026, 5, 21, 15);
    const noPassoDaCasa = async (n) => {
      try {
        await pagina.waitForFunction((x) => document.querySelector('#passo-a-passo')?.dataset.passo === String(x), n, { timeout: 8000 });
      } catch {
        const sug = ((await estado()).derivados?.sugestoes ?? []).filter((x) => x.nivel === 'erro').map((x) => x.titulo);
        throw new Error(`Conferência falhou: o painel deveria estar no passo ${n}; está no ${await pagina.locator('#passo-a-passo').getAttribute('data-passo')}. Erros do consultor: ${JSON.stringify(sug)}`);
      }
      await esperar(200);
    };
    const chaveDaCasa = async (caboUid, i) => ((await estado()).projeto.cabos.find((c) => c.uid === caboUid)?.estados ?? [])[i] ?? 'fechada';
    const visorDaCasa = (uid) => og((u) => window.__offgrid.textoDoVisor(u), uid);
    const fecharAvisosDaCasa = async () => {
      for (let i = 0; i < 20 && (await pagina.locator('#avisos-seguranca .entendi').count()); i++) await pagina.locator('#avisos-seguranca .entendi').click();
    };
    /** Clica na proteção desenhada no cabo, na cena: abre ou fecha a chave dela. */
    const clicarProtecaoNaCasa = async (caboUid, indice, nome) => {
      await fecharAvisosDaCasa();
      const antes = await chaveDaCasa(caboUid, indice);
      const pt = await og(([u, i]) => window.__offgrid.telaDaProtecao(u, i), [caboUid, indice]);
      if (!pt) await pagina.screenshot({ path: join(pasta, 'zz-falha-protecao-casa.png') });
      conferir(pt, `${nome}: a proteção deveria estar à vista na cena`);
      await pagina.mouse.click(pt[0], pt[1]);
      await esperar(350);
      const depois = await chaveDaCasa(caboUid, indice);
      if (depois === antes) await pagina.screenshot({ path: join(pasta, 'zz-falha-protecao-casa.png') });
      conferir(depois === 'fechada', `${nome}: o clique na proteção deveria fechá-la (está ${depois})`);
      await fecharAvisosDaCasa();
    };
    /** Clica no botão ⏻ do inversor na cena. */
    const clicarBotaoNaCasa = async (uid, nome) => {
      await fecharAvisosDaCasa();
      const pt = await og((u) => window.__offgrid.telaDoBotao(u), uid);
      if (!pt) await pagina.screenshot({ path: join(pasta, 'zz-falha-botao-casa.png') });
      conferir(pt, `${nome}: o botão ⏻ deveria estar à vista na cena`);
      await pagina.mouse.click(pt[0], pt[1]);
      await esperar(350);
      conferir((await estado()).projeto.dispositivos.find((x) => x.uid === uid).ligado === true, `${nome}: o clique no botão ⏻ deveria ligar`);
      await fecharAvisosDaCasa();
    };
    /** Liga o aparelho pelo painel do item selecionado. */
    const ligarPeloPainel = async (uid) => {
      await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid: u }), uid);
      await pagina.locator('#item-selecionado [data-acao="ligar"]').click();
      await esperar(250);
      conferir((await estado()).projeto.dispositivos.find((x) => x.uid === uid).ligado === true, `o botão "Ligar" do painel deveria ligar ${uid}`);
    };
    /** Câmera sobre o quartinho da casa, sem o telhado: na casa, o fundo dele fica em z = −2,95 e a porta do lado de z positivo. */
    const dentroDoQuartinho = async () => {
      await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
      // A câmera é posta em coordenadas do mundo: com a casa na orientação 0, o mundo é a casa girada meia volta.
      await mudarCamera([-5.0, 3.8, -2.2], [-5.3, 0.9, 2.3]);
      await esperar(400);
      await fecharAvisosDaCasa();
    };
    const semEventos = async (quando) => {
      const e = await estado();
      conferir(e.simulacao.eventos.length === 0 && !e.projeto.dispositivos.some((x) => x.queimado || x.falha), `${quando}: nada deveria queimar: ${JSON.stringify(e.simulacao.eventos)}`);
    };

    await og((ms) => window.__offgrid.acoes.definirTempo(ms), MEIO_DIA_21_JUN);
    await og(() => {
      const a = window.__offgrid.acoes;
      const proj = JSON.parse(JSON.stringify(window.__offgrid.estado().projeto));
      const disp = (uid, itemId, ligado = true) => ({ uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado, uso: null });
      const cabo = (uid, de, para, caboId, protecoes = []) => {
        const [dd, td] = de.split('.');
        const [dp, tp] = para.split('.');
        return { uid, de: { disp: dd, terminal: td }, para: { disp: dp, terminal: tp }, caboId, comprimento: 1, protecoes, estados: protecoes.map(() => 'aberta'), quadro: null };
      };
      proj.dispositivos = [
        disp('bateria', 'bat-moura-12mn105'), disp('inversor', 'inv-aiker-500-12v-110', false), disp('ctl', 'ctl-pwm-30a'),
        disp('placa', 'placa-resun-100'), disp('lampada', 'ap-lampada', false),
      ];
      proj.cabos = [
        cabo('c1', 'bateria.pos', 'inversor.batPos', 'cabo-bat-35', ['prot-fusivel-anl-100']),
        cabo('c2', 'bateria.neg', 'inversor.batNeg', 'cabo-bat-35'),
        cabo('c3', 'bateria.pos', 'ctl.batPos', 'cabo-bat-35', ['prot-disjuntor-cc-80']),
        cabo('c4', 'bateria.neg', 'ctl.batNeg', 'cabo-bat-35'),
        cabo('c5', 'inversor.caSaida', 'lampada.plug', 'cabo-ca-2p5'),
      ];
      a.carregarProjeto(proj);
      window.__offgrid.recalcular();
    });
    await noPassoDaCasa(10);
    conferir((await contagem()).startsWith('Passo 10 de 14') && (await contagem()).includes('Parte 2: ligar'), `montado com tudo desligado, o roteiro de 12 V deveria ir ao passo 10, o primeiro de ligar: ${await contagem()}`);
    let textoDoPasso = await pagina.locator('#passo-a-passo').textContent();
    conferir(textoDoPasso.includes('O inversor está desligado, e é assim que o fusível vai para o lugar') && textoDoPasso.includes('"Ligar o sistema"'), `o passo 10 deveria dizer que o fusível vai para o lugar com o inversor desligado e citar o atalho: "${textoDoPasso}"`);
    conferir(await pagina.locator('#m-ligar-sistema').isVisible(), 'na casa, com o fusível aberto, os mostradores deveriam oferecer "Ligar o sistema"');
    await dentroDoQuartinho();
    await captura('75a-passo-a-passo-12v-passo-10-fusivel');
    await clicarProtecaoNaCasa('c1', 0, 'fusível da bateria (12 V)');
    await noPassoDaCasa(11);
    conferir((await visorDaCasa('ctl')) === '', `com o disjuntor do controlador aberto, o visor dele deveria estar apagado: "${await visorDaCasa('ctl')}"`);
    await clicarProtecaoNaCasa('c3', 0, 'disjuntor do controlador (12 V)');
    await noPassoDaCasa(12);
    conferir((await visorDaCasa('ctl')).includes('sem placas ligadas'), `com a bateria, o visor do controlador deveria dizer que faltam as placas: "${await visorDaCasa('ctl')}"`);
    await captura('75b-passo-a-passo-12v-passo-12-placa');
    // Os cabos da placa (o cabo com o mouse está conferido no tutorial): ao meio-dia, com a bateria já no controlador, nada queima.
    await og(() => {
      const a = window.__offgrid.acoes;
      a.adicionarCabo({ disp: 'placa', terminal: 'pos' }, { disp: 'ctl', terminal: 'pvPos' }, 12);
      a.adicionarCabo({ disp: 'placa', terminal: 'neg' }, { disp: 'ctl', terminal: 'pvNeg' }, 12);
      window.__offgrid.recalcular();
    });
    await noPassoDaCasa(13);
    await semEventos('a placa ligada por último, ao meio-dia');
    const visorCtl12 = await visorDaCasa('ctl');
    console.log(`roteiro de 12 V: visor do controlador com a placa: "${visorCtl12}"`);
    conferir(/^PV \d+,\d V \| carga \d+,\d A \| /.test(visorCtl12), `com a placa, o visor do controlador deveria mostrar a tensão e a corrente de carga: "${visorCtl12}"`);
    await clicarBotaoNaCasa('inversor', 'inversor (12 V)');
    await noPassoDaCasa(14);
    conferir((await visorDaCasa('inversor')).startsWith('ligado'), `o visor do inversor deveria acender: "${await visorDaCasa('inversor')}"`);
    await ligarPeloPainel('lampada');
    await og(() => window.__offgrid.acoes.selecionar(null));
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo')?.dataset.situacao === 'resumo', null, { timeout: 8000 });
    await semEventos('o roteiro de 12 V feito na ordem');
    textoDoPasso = await pagina.locator('#passo-a-passo').textContent();
    conferir(textoDoPasso.includes('Montagem concluída') && !textoDoPasso.includes('pulou'), `o resumo do roteiro de 12 V: "${textoDoPasso}"`);
    await captura('75c-passo-a-passo-12v-resumo');
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await pagina.getByRole('button', { name: 'Sair do passo a passo' }).click();
    conferir(!(await painelVisivel()), 'sair deveria esconder o painel');

    // 24 V: mantém a tomada da rede; o painel diz "Passo 1 de 17".
    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.locator('#botao-passo-a-passo').click();
    pagina.once('dialog', (d) => d.accept());
    await pagina.locator('[data-roteiro="plano-da-casa-24v"]').click();
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    conferir((await contagem()).startsWith('Passo 1 de 17'), `o roteiro de 24 V deveria começar no passo 1 de 17: ${await contagem()}`);
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
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo .passo-contagem')?.textContent.startsWith('Passo 2 de 17'), null, { timeout: 5000 });
    conferir((await pagina.locator('#passo-a-passo .passo-feito').count()) === 1, 'ao cumprir o passo 1 deveria aparecer o "Feito!"');
    await captura('78-passo-a-passo-feito-e-passo-2');
    const naParede = await encaixe('inv-anenji-3kw-24v-127', { id: 'parede-quartinho-fundo', tipo: 'parede' }, [6.5, 1.3, -2.95], [0, 0, 1]);
    await og((enc) => window.__offgrid.acoes.adicionarDispositivo('inv-anenji-3kw-24v-127', enc), naParede);
    await og(() => window.__offgrid.recalcular());
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo .passo-contagem')?.textContent.startsWith('Passo 3 de 17'), null, { timeout: 5000 });
    await captura('79-passo-a-passo-passo-3');

    // Pular: o passo 3 sai da frente.
    await pagina.getByRole('button', { name: 'Pular' }).click();
    conferir((await contagem()).startsWith('Passo 4 de 17'), `pular deveria ir para o passo 4: ${await contagem()}`);
    conferir((await pagina.locator('#passo-a-passo .passo-item.pulado').count()) === 1, 'o passo pulado deveria aparecer marcado na lista');

    // Recarregar a página: o andamento volta da sessão (o projeto volta da gravação do navegador).
    await esperar(900);
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    conferir((await contagem()).startsWith('Passo 4 de 17'), `depois de recarregar o painel deveria continuar no passo 4: ${await contagem()}`);

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

    // ---- Parte de ligar do roteiro de 24 V, com o mouse, ao meio-dia. "Desligar o sistema" e os aparelhos desligados
    // deixam a casa como a montagem nasce: o painel volta ao primeiro passo de ligar.
    await og((ms) => window.__offgrid.acoes.definirTempo(ms), MEIO_DIA_21_JUN);
    await og(() => {
      const a = window.__offgrid.acoes;
      a.desenergizar();
      for (const d of window.__offgrid.estado().projeto.dispositivos) if (d.itemId.startsWith('ap-')) a.definirLigado(d.uid, false);
      window.__offgrid.recalcular();
    });
    await noPassoDaCasa(12);
    conferir((await contagem()).startsWith('Passo 12 de 17') && (await contagem()).includes('Parte 2: ligar'), `desligado, o roteiro de 24 V deveria voltar ao passo 12, o primeiro de ligar: ${await contagem()}`);
    textoDoPasso = await pagina.locator('#passo-a-passo').textContent();
    conferir(textoDoPasso.includes('depois as placas, o inversor, a saída, a rede') && textoDoPasso.includes('"Ligar o sistema"'), `o passo 12 do roteiro de 24 V deveria dizer a ordem de ligar e citar o atalho: "${textoDoPasso}"`);
    await dentroDoQuartinho();
    await captura('80a-passo-a-passo-24v-passo-12-fusivel');
    await clicarProtecaoNaCasa('c3', 0, 'fusível da bateria (24 V)');
    await noPassoDaCasa(13);
    conferir((await visorDaCasa('inversor')) === '', 'com o inversor desligado, o visor dele deveria continuar apagado');
    await captura('80b-passo-a-passo-24v-passo-13-disjuntor-das-placas');
    await clicarProtecaoNaCasa('c1', 0, 'disjuntor CC das placas');
    await noPassoDaCasa(14);
    await clicarBotaoNaCasa('inversor', 'inversor híbrido');
    await noPassoDaCasa(15);
    const visorHibrido = await visorDaCasa('inversor');
    console.log(`roteiro de 24 V: visor do inversor ligado, ao meio-dia: "${visorHibrido}"`);
    conferir(visorHibrido.startsWith('ligado') && /PV \d+,\d V/.test(visorHibrido), `ligado ao meio-dia, o visor do inversor híbrido deveria mostrar a tensão das placas: "${visorHibrido}"`);
    await captura('80c-passo-a-passo-24v-passo-15-saida');
    // Os disjuntores da saída pelo atalho dos mostradores: o passo fica feito do mesmo jeito. A tomada da rede já está ligada.
    conferir(await pagina.locator('#m-ligar-sistema').isVisible(), 'com a saída aberta, os mostradores deveriam oferecer "Ligar o sistema"');
    await pagina.locator('#m-ligar-sistema').click();
    await noPassoDaCasa(17);
    const aparelhosDaCasa = (await estado()).projeto.dispositivos.filter((x) => x.itemId.startsWith('ap-')).map((x) => x.uid);
    conferir(aparelhosDaCasa.length === 6 && (await estado()).projeto.dispositivos.filter((x) => aparelhosDaCasa.includes(x.uid)).every((x) => !x.ligado), '"Ligar o sistema" não deveria ligar os aparelhos');
    for (const uid of aparelhosDaCasa) await ligarPeloPainel(uid);
    await og(() => window.__offgrid.acoes.selecionar(null));
    await pagina.waitForFunction(() => document.querySelector('#passo-a-passo')?.dataset.situacao === 'resumo', null, { timeout: 8000 });
    await semEventos('o roteiro de 24 V ligado na ordem');
    conferir((await pagina.locator('#passo-a-passo').textContent()).includes('Montagem concluída'), 'ligado tudo, o roteiro de 24 V deveria voltar ao resumo');
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await og((ms) => window.__offgrid.acoes.definirTempo(ms), tempoAntesDosRoteiros);

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
  // ---- Tutorial do quartinho (tarefas 7.5 e 8.5): entrada pelo cartão, os 14 passos com o mouse, teste de autonomia, "Experimente errar" e saída.
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
    /** Espera o painel chegar ao passo `n` (1 a 14) ou ao resumo (15). */
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
    /** Estado da chave de índice `i` do cabo; campo ausente vale fechada. */
    const estadoDaChave = async (caboUid, i) => ((await projeto()).cabos.find((c) => c.uid === caboUid)?.estados ?? [])[i] ?? 'fechada';
    /** Texto do visor da peça (linhas separadas por " | "); vazio é apagado. */
    const visor = (uid) => og((u) => window.__offgrid.textoDoVisor(u), uid);
    /** Clica na proteção desenhada no cabo, na cena: abre ou fecha a chave dela. */
    const clicarProtecao = async (caboUid, indice, nome) => {
      await fecharAvisos();
      const antes = await estadoDaChave(caboUid, indice);
      const pt = await og(([u, i]) => window.__offgrid.telaDaProtecao(u, i), [caboUid, indice]);
      if (!pt) await pagina.screenshot({ path: join(pasta, 'zz-falha-protecao.png') });
      conferir(pt, `${nome}: a proteção deveria estar à vista na cena`);
      await pagina.mouse.click(pt[0], pt[1]);
      await esperar(350);
      const depois = await estadoDaChave(caboUid, indice);
      if (depois === antes) await pagina.screenshot({ path: join(pasta, 'zz-falha-protecao.png') });
      conferir(depois !== antes, `${nome}: o clique na proteção deveria mudar a chave (continua ${depois})`);
      await fecharAvisos();
    };
    /** Clica no botão ⏻ de um inversor ou aparelho, na cena. */
    const clicarBotao = async (uid, nome) => {
      await fecharAvisos();
      const antes = (await projeto()).dispositivos.find((x) => x.uid === uid);
      const pt = await og((u) => window.__offgrid.telaDoBotao(u), uid);
      if (!pt) await pagina.screenshot({ path: join(pasta, 'zz-falha-botao.png') });
      conferir(pt, `${nome}: o botão ⏻ deveria estar à vista na cena`);
      await pagina.mouse.click(pt[0], pt[1]);
      await esperar(350);
      const depois = (await projeto()).dispositivos.find((x) => x.uid === uid);
      if (depois.ligado === antes.ligado && depois.falha === antes.falha) await pagina.screenshot({ path: join(pasta, 'zz-falha-botao.png') });
      conferir(depois.ligado !== antes.ligado || depois.falha !== antes.falha, `${nome}: o clique no botão ⏻ deveria ligar ou desligar`);
      await fecharAvisos();
    };

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
    const aoConfirmar = (dlg) => {
      confirmou = true;
      dlg.dismiss();
    };
    pagina.once('dialog', aoConfirmar);
    await pagina.locator('#boas-vindas button[data-acao="tutorial"]').click();
    await pagina.locator('#passo-a-passo').waitFor({ state: 'visible' });
    await esperar(400);
    // Sem diálogo, o ouvinte sai: armado, ele responderia à próxima confirmação do roteiro.
    pagina.off('dialog', aoConfirmar);
    conferir(!confirmou, 'entrar no tutorial não deveria pedir confirmação');
    let e = await estado();
    conferir(e.projeto.casa.soQuartinho === true && e.projeto.dispositivos.length === 0 && e.projeto.cabos.length === 0, 'o tutorial deveria abrir só com o quartinho, vazio');
    const guardada = JSON.parse(await og(() => localStorage.getItem('offgrid.projeto.casa')));
    conferir(JSON.stringify(guardada) === JSON.stringify(casaAntes), 'a casa deveria ficar guardada em offgrid.projeto.casa');
    conferir((await painel().getAttribute('data-roteiro')) === 'tutorial-quartinho', 'o painel deveria mostrar o roteiro do tutorial');
    conferir((await pagina.locator('#passo-a-passo .passo-contagem').textContent()).startsWith('Passo 1 de 14'), 'o tutorial deveria começar no passo 1 de 14');
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
    // O painel da bateria diz que o visor dela é ajuda do simulador (operar.md, seção 7).
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid: u }), bateria);
    await esperar(300);
    const notaDoVisor = pagina.locator('#item-selecionado [data-nota="visor-da-bateria"]');
    conferir((await notaDoVisor.count()) === 1 && (await notaDoVisor.isVisible()), 'o painel da bateria deveria explicar o visor dela');
    const textoDaNota = await notaDoVisor.textContent();
    conferir(textoDaNota.includes('Os volts são aproximados') && textoDaNota.includes('bateria de chumbo de verdade não tem visor'), `a nota do visor da bateria: "${textoDaNota}"`);
    await captura('84b-tutorial-painel-da-bateria-visor');
    await og(() => window.__offgrid.acoes.selecionar(null));

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

    // ---- Passo 4: o cabo positivo da bateria ao inversor; o destaque é dos dois terminais dele.
    d = await exigirDestaque('terminal', 'no passo 4 deveria haver realce de terminais');
    conferir(d.length === 2 && d.some((x) => x.disp === bateria && x.terminal === 'pos') && d.some((x) => x.disp === inversor && x.terminal === 'batPos'), `o passo 4 deveria realçar o + da bateria e o BAT+ do inversor: ${JSON.stringify(d)}`);
    await captura('85-tutorial-passo-4-realce-nos-terminais');
    await cabo(bateria, 'pos', inversor, 'batPos');
    await noPasso(5);

    // ---- Passo 5: fusível no cabo positivo (realce no cabo), antes do cabo negativo. Ele nasce fora do porta-fusível.
    d = await exigirDestaque('cabo', 'no passo 5 deveria haver realce no cabo');
    p = await projeto();
    const caboPos = p.cabos.find((c) => c.de.disp === bateria && c.de.terminal === 'pos');
    conferir(d.length === 1 && d[0].uid === caboPos.uid, `o realce do passo 5 deveria ser o cabo positivo: ${JSON.stringify(d)}`);
    conferir(!p.cabos.some((c) => [c.de, c.para].some((x) => x.disp === bateria && x.terminal === 'neg')), 'no passo 5 o cabo negativo ainda não deveria existir');
    const sFus = await levar(await doCartao('prot-fusivel-anl-100'), await og((u) => window.__offgrid.telaDoCabo(u, 0.5), caboPos.uid));
    conferir(sFus.modo === 'protecao' && sFus.valido === true, `o fusível sobre o cabo positivo deveria poder ser instalado: ${JSON.stringify(sFus)}`);
    await soltar();
    await noPasso(6);
    conferir((await estadoDaChave(caboPos.uid, 0)) === 'aberta', 'o fusível deveria nascer fora do porta-fusível');
    await captura('85b-tutorial-passo-5-fusivel-antes-do-negativo');

    // ---- Passo 6: o cabo negativo, por último; o destaque é dos dois terminais do negativo.
    d = await exigirDestaque('terminal', 'no passo 6 deveria haver realce de terminais');
    conferir(d.length === 2 && d.some((x) => x.disp === bateria && x.terminal === 'neg') && d.some((x) => x.disp === inversor && x.terminal === 'batNeg'), `o passo 6 deveria realçar o − da bateria e o BAT− do inversor: ${JSON.stringify(d)}`);
    await captura('85c-tutorial-passo-6-realce-do-negativo');
    await cabo(bateria, 'neg', inversor, 'batNeg');
    await noPasso(7);

    // ---- Passo 7: controlador na parede do fundo; cabo positivo, disjuntor nele e só então o cabo negativo.
    d = await exigirDestaque('superficie', 'no passo 7 deveria haver realce de superfície');
    conferir(d[0].id === 'parede-quartinho-fundo', `o passo 7 deveria realçar a parede do fundo: ${JSON.stringify(d)}`);
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
    d = await exigirDestaque('terminal', 'no passo 7, com o controlador, deveria haver realce de terminais');
    conferir(d.length === 2 && d.some((x) => x.disp === ctl && x.terminal === 'batPos'), `no passo 7 o realce deveria começar pelo positivo do controlador: ${JSON.stringify(d)}`);
    await cabo(bateria, 'pos', ctl, 'batPos');
    // Com o cabo positivo, o passo 7 pede a proteção nele antes do negativo: realce no cabo e disjuntor sobre ele.
    await noPasso(7);
    d = await exigirDestaque('cabo', 'no passo 7, com o cabo positivo, deveria haver realce nele');
    p = await projeto();
    const caboCtl = p.cabos.find((c) => [c.de, c.para].some((x) => x.disp === ctl && x.terminal === 'batPos'));
    conferir(d.length === 1 && d[0].uid === caboCtl.uid, `o realce deveria ser o cabo positivo do controlador: ${JSON.stringify(d)}`);
    const sDj = await levar(await doCartao('prot-disjuntor-cc-80'), await og((u) => window.__offgrid.telaDoCabo(u, 0.5), caboCtl.uid));
    conferir(sDj.modo === 'protecao' && sDj.valido === true, `o disjuntor sobre o cabo do controlador deveria poder ser instalado: ${JSON.stringify(sDj)}`);
    await soltar();
    await noPasso(7);
    conferir((await estadoDaChave(caboCtl.uid, 0)) === 'aberta', 'o disjuntor do controlador deveria nascer aberto');
    await esperar(300);
    d = await exigirDestaque('terminal', 'no passo 7, com o disjuntor, deveria haver realce nos terminais do negativo');
    conferir(d.length === 2 && d.some((x) => x.disp === ctl && x.terminal === 'batNeg'), `com o disjuntor no positivo, o realce deveria passar ao negativo do controlador: ${JSON.stringify(d)}`);
    await captura('85d-tutorial-passo-7-disjuntor-antes-do-negativo');
    await cabo(bateria, 'neg', ctl, 'batNeg');
    await noPasso(8);
    conferir((await visor(ctl)) === '', `sem a bateria (disjuntor aberto), o visor do controlador deveria estar apagado: "${await visor(ctl)}"`);

    // ---- Passo 8: ventilador no piso, plugue na saída do inversor. Ele nasce desligado e o passo não pede que ligue.
    d = await exigirDestaque('superficie', 'no passo 8, sem aparelho, deveria haver realce de superfície');
    conferir(d[0].id === 'piso-quartinho', `o passo 8 deveria realçar o piso: ${JSON.stringify(d)}`);
    await arrastarPeca('ap-ventilador', [0.4, 0.05, -0.2], 'passo 8');
    const ventilador = await uidDe('ap-ventilador');
    await esperar(400);
    await exigirDestaque('terminal', 'no passo 8, com o aparelho, deveria haver realce de terminais');
    await cabo(ventilador, 'plug', inversor, 'caSaida');
    await og(() => window.__offgrid.acoes.selecionar(null));
    conferir((await projeto()).dispositivos.find((x) => x.uid === ventilador).ligado === false, 'o ventilador deveria nascer desligado');

    // ---- Passo 9 (conferir o consultor) fecha sozinho com a montagem certa: o painel vai ao passo 10, o primeiro de ligar.
    await noPasso(10);
    conferir((await pagina.locator('#passo-a-passo .passo-contagem').textContent()).includes('Parte 2: ligar'), 'o passo 10 deveria ser da parte de ligar');
    conferir((await painel().textContent()).includes('O inversor está desligado, e é assim que o fusível vai para o lugar'), 'o passo 10 deveria dizer que o fusível vai para o lugar com o inversor desligado');
    conferir(await pagina.locator('#m-desligado').isVisible(), 'com tudo desligado, os mostradores deveriam dizer por que não há energia');
    conferir(await pagina.locator('#m-ligar-sistema').isHidden(), 'no tutorial, "Ligar o sistema" não deveria aparecer nos mostradores: lá se liga com a mão');
    await captura('86a-tutorial-passo-10-fusivel-aberto');

    // ---- Passo 10: o fusível vai para o porta-fusível com um clique na cena, com o inversor desligado.
    d = await exigirDestaque('cabo', 'no passo 10 deveria haver realce no cabo do fusível');
    conferir(d[0].uid === caboPos.uid, `o realce do passo 10 deveria ser o cabo positivo do inversor: ${JSON.stringify(d)}`);
    conferir((await projeto()).dispositivos.find((x) => x.uid === inversor).ligado === false, 'o fusível deveria ir para o lugar com o inversor desligado');
    await clicarProtecao(caboPos.uid, 0, 'fusível da bateria');
    conferir((await estadoDaChave(caboPos.uid, 0)) === 'fechada', 'um clique no fusível deveria pô-lo no porta-fusível');
    await noPasso(11);
    conferir((await visor(inversor)) === '', 'com o inversor desligado, o visor dele deveria continuar apagado');

    // ---- Passo 11: o disjuntor do controlador, também com um clique: o visor do controlador acende.
    d = await exigirDestaque('cabo', 'no passo 11 deveria haver realce no cabo do controlador');
    conferir(d[0].uid === caboCtl.uid, `o realce do passo 11 deveria ser o cabo positivo do controlador: ${JSON.stringify(d)}`);
    await clicarProtecao(caboCtl.uid, 0, 'disjuntor do controlador');
    conferir((await estadoDaChave(caboCtl.uid, 0)) === 'fechada', 'um clique no disjuntor deveria fechá-lo');
    await noPasso(12);
    const visorCtl = await visor(ctl);
    console.log(`visor do controlador com a bateria e sem placa: "${visorCtl}"`);
    conferir(visorCtl !== '' && visorCtl.includes('sem placas ligadas'), `com a bateria, o visor do controlador deveria acender e dizer que faltam as placas: "${visorCtl}"`);
    await captura('86b-tutorial-passo-11-visor-do-controlador');

    // ---- Passo 12: cabos da placa no controlador, por último.
    await esperar(300);
    await exigirDestaque('terminal', 'no passo 12 deveria haver realce de terminais');
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
    await noPasso(13);
    e = await estado();
    conferir(!e.projeto.dispositivos.some((x) => x.queimado) && e.simulacao.eventos.length === 0, `ligar a placa por último não deveria queimar nada: ${JSON.stringify(e.simulacao.eventos)}`);
    await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
    await paraDentro();
    const visorComPlaca = await visor(ctl);
    console.log(`visor do controlador com a placa ligada: "${visorComPlaca}"`);
    conferir(/^PV \d+,\d V \| carga \d+,\d A \| (carregando|bateria cheia|em espera|sem sol)$/.test(visorComPlaca), `com a placa, o visor do controlador deveria mostrar a tensão da placa e a corrente de carga: "${visorComPlaca}"`);

    // ---- Passo 13: o inversor liga pelo botão ⏻ na cena; o visor dele acende.
    d = await exigirDestaque('terminal', 'no passo 13 deveria haver realce no inversor');
    conferir(d[0].disp === inversor, `o realce do passo 13 deveria marcar o inversor: ${JSON.stringify(d)}`);
    await clicarBotao(inversor, 'inversor');
    conferir((await projeto()).dispositivos.find((x) => x.uid === inversor).ligado === true, 'o botão ⏻ deveria ligar o inversor');
    await noPasso(14);
    const visorInv = await visor(inversor);
    console.log(`visor do inversor ligado: "${visorInv}"`);
    conferir(visorInv.startsWith('ligado') && visorInv.includes('0 W'), `o visor do inversor deveria acender com consumo zero: "${visorInv}"`);

    // ---- Passo 14: o ventilador liga pelo botão ⏻ na cena → resumo.
    d = await exigirDestaque('terminal', 'no passo 14 deveria haver realce no aparelho');
    conferir(d[0].disp === ventilador, `o realce do passo 14 deveria marcar o ventilador: ${JSON.stringify(d)}`);
    await clicarBotao(ventilador, 'ventilador');
    conferir((await projeto()).dispositivos.find((x) => x.uid === ventilador).ligado === true, 'o botão ⏻ deveria ligar o ventilador');
    await og(() => window.__offgrid.acoes.selecionar(null));
    try {
      await esperarSituacao('resumo');
    } catch {
      const sug = ((await estado()).derivados?.sugestoes ?? []).map((x) => `${x.nivel}: ${x.titulo}`);
      throw new Error(`Conferência falhou: o tutorial não chegou ao resumo. Sugestões do consultor: ${JSON.stringify(sug)}`);
    }
    e = await estado();
    conferir(e.simulacao.eventos.length === 0 && !e.projeto.dispositivos.some((x) => x.queimado || x.falha), `o tutorial feito na ordem não deveria queimar nada: ${JSON.stringify(e.simulacao.eventos)}`);
    console.log(`visor do inversor com o ventilador: "${await visor(inversor)}"`);
    conferir((await destaques()).length === 0, 'no resumo a lista de destaques deveria estar vazia');
    const resumoTexto = await painel().textContent();
    conferir(resumoTexto.includes('Montagem concluída') && resumoTexto.includes('Testar a bateria') && resumoTexto.includes('Orçamento total: R$'), `o resumo do tutorial: "${resumoTexto}"`);
    conferir(!resumoTexto.includes('Experimente errar'), 'antes do primeiro teste, o resumo não deveria oferecer "Experimente errar"');
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
    conferir(/Aparelhos ligados: Ventilador, somando 50 W de consumo médio./.test(texto), `o resultado deveria listar o ventilador e os 50 W: "${texto}"`);
    conferir(texto.includes('500 W do inversor') && texto.includes('Micro-ondas e chuveiro') && texto.includes('confira no manual'), 'o resultado deveria avisar do micro-ondas e do chuveiro e do corte do inversor');
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
    conferir(texto.includes('A bateria passou de 24 horas. O ponto mais baixo foi') && /às \d\d:\d\d\. Ao fim das 24 horas ela estava em \d+ %: a placa não repôs tudo/.test(texto), `texto do resultado com a lâmpada: "${texto}"`);
    conferir(/Aparelhos ligados: Lâmpada LED, somando 9 W de consumo médio./.test(texto) && !texto.includes('Ventilador, somando'), `o resultado deveria listar só a lâmpada ligada: "${texto}"`);
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

    // ---- "Experimente errar": os três erros guiados, cada um com o conserto (operar.md, seção 9).
    await pagina.setViewportSize({ width: 1440, height: 900 });
    const noErro = async (passoErro, ms = 8000) => {
      try {
        await pagina.waitForFunction((x) => document.querySelector('#passo-a-passo')?.dataset.passoErro === x, passoErro, { timeout: ms });
      } catch {
        const ev = (await estado()).simulacao.eventos.map((x) => x.codigo);
        throw new Error(`Conferência falhou: o "Experimente errar" deveria estar em "${passoErro}"; está em "${await painel().getAttribute('data-passo-erro')}". Eventos: ${JSON.stringify(ev)}. Painel: "${await painel().textContent()}"`);
      }
      await esperar(200);
    };
    const eventosAgora = async () => (await estado()).simulacao.eventos.map((x) => x.codigo);
    const sairVisivel = async (onde) => conferir((await painel().locator('button[data-acao="sair"]').count()) === 1, `"Sair do tutorial" deveria estar no painel em ${onde}`);
    const cobreOQuartinho = async () =>
      og(() => {
        const r = document.querySelector('#passo-a-passo').getBoundingClientRect();
        const cantos = [];
        for (const x of [-1.5, 1.5]) for (const y of [0, 2.4]) for (const z of [-1.25, 1.25]) cantos.push(window.__offgrid.telaDoPonto([x, y, z]));
        const xs = cantos.map((c) => c[0]);
        const ys = cantos.map((c) => c[1]);
        const q = { esq: Math.min(...xs), dir: Math.max(...xs), topo: Math.min(...ys), base: Math.max(...ys) };
        const larg = Math.max(0, Math.min(q.dir, r.right) - Math.max(q.esq, r.left));
        const alt = Math.max(0, Math.min(q.base, r.bottom) - Math.max(q.topo, r.top));
        const area = (q.dir - q.esq) * (q.base - q.topo);
        return area > 0 ? (larg * alt) / area : 0;
      });
    conferir((await painel().textContent()).includes('Experimente errar'), 'depois do teste, o resultado deveria oferecer "Experimente errar"');
    await botaoDoPainel('experimente-errar').click();
    await noErro('lista');
    texto = await painel().textContent();
    conferir(texto.includes('pode sair a qualquer hora') && texto.includes('peça queimada é peça nova') && texto.includes('pegar fogo'), `a lista do "Experimente errar" deveria avisar que é opcional e o custo de verdade: "${texto}"`);
    conferir((await painel().locator('button[data-acao="escolher-erro"]').count()) === 3, 'a lista deveria ter os três erros');
    await sairVisivel('a lista de erros');
    await pagina.locator('#botao-vista-inicial').click();
    await esperar(1000);
    await captura('90a-errar-lista');

    // (a) Placa sem a bateria: abrir o disjuntor do controlador com sol queima o controlador.
    /** Mede, nas duas resoluções e na vista inicial, quanto o painel do "Experimente errar" cobre do quartinho. */
    const medirCobertura = async (nome) => {
      for (const [largura, altura] of [[1280, 720], [1440, 900]]) {
        await pagina.setViewportSize({ width: largura, height: altura });
        await pagina.locator('#botao-vista-inicial').click();
        await esperar(1200);
        const sobre = await cobreOQuartinho();
        console.log(`"Experimente errar" (${nome}) ${largura}x${altura}: o painel cobre ${(sobre * 100).toFixed(0)} % do quartinho`);
        conferir(sobre < 0.15, `o painel do "Experimente errar" (${nome}) não deveria cobrir o quartinho em ${largura}x${altura}: ${(sobre * 100).toFixed(0)} %`);
        await captura(`${nome}-${largura}x${altura}`);
      }
    };
    await medirCobertura('90b-errar-lista');
    await painel().locator('button[data-erro="placas-antes-da-bateria"]').click();
    await noErro('antes');
    texto = await painel().textContent();
    conferir(texto.includes('O que vai acontecer:') && texto.includes('o controlador queima') && texto.includes('controlador novo') && texto.includes('pegar fogo'), `o erro (a) deveria dizer antes o que acontece e o custo de verdade: "${texto}"`);
    conferir((await painel().locator('button[data-acao="comecar-erro"]').count()) === 0, 'o erro não deveria começar antes de o painel dizer por quê');
    await sairVisivel('a explicação do erro (a)');
    await medirCobertura('90c-errar-a-o-que-vai-acontecer');
    await botaoDoPainel('por-que-erro').click();
    await noErro('porque');
    texto = await painel().textContent();
    conferir(texto.includes('Por quê:') && texto.includes('Epever e Victron') && texto.includes('Simplificação do simulador'), `o erro (a) deveria dizer por quê, com a fonte e a simplificação: "${texto}"`);
    await sairVisivel('o porquê do erro (a)');
    await medirCobertura('90d-errar-a-por-que');
    await botaoDoPainel('comecar-erro').click();
    await noErro('abrir');
    // O teste da lâmpada parou às 18:00: sem sol, o painel oferece o meio-dia.
    if ((await painel().locator('[data-erro-nota="noite"]').count()) > 0) {
      await medirCobertura('90e-errar-a-de-noite');
      await botaoDoPainel('meio-dia').click();
      await pagina.waitForFunction(() => !document.querySelector('#passo-a-passo [data-erro-nota="noite"]'), null, { timeout: 8000 });
      conferir(Math.abs((await quando()).hora - 12) < 0.01, `"Pôr o relógio ao meio-dia" deveria levar o relógio às 12:00: ${JSON.stringify(await quando())}`);
    }
    await pagina.setViewportSize({ width: 1440, height: 900 });
    await paraDentro();
    // Com sol e a bateria abaixo de cheia (o teste gastou), o visor do controlador mostra a corrente de carga.
    const visorCarregando = await visor(ctl);
    console.log(`visor do controlador ao meio-dia, depois do teste: "${visorCarregando}"`);
    conferir(/carga [1-9]\d*,\d A \| carregando$|carga 0,[1-9] A \| carregando$/.test(visorCarregando), `ao meio-dia, o visor do controlador deveria mostrar a corrente de carga: "${visorCarregando}"`);
    await captura('90f-errar-a-visor-carregando');
    const eventosAntes = (await estado()).simulacao.eventos.length;
    await clicarProtecao(caboCtl.uid, 0, 'disjuntor do controlador (erro a)');
    await noErro('consertar');
    e = await estado();
    conferir(e.simulacao.eventos.slice(eventosAntes).map((x) => x.codigo).join() === 'controlador-sem-bateria', `abrir o disjuntor com sol deveria queimar o controlador: ${JSON.stringify(e.simulacao.eventos.slice(eventosAntes))}`);
    conferir(e.projeto.dispositivos.find((x) => x.uid === ctl).queimado?.codigo === 'controlador-sem-bateria', 'o controlador deveria ficar queimado');
    conferir((await visor(ctl)) === '', 'queimado, o visor do controlador deveria apagar');
    conferir((await og(() => window.__offgrid.operacaoNaCena())).selos.includes(ctl), 'a cena deveria marcar o controlador como queimado');
    conferir((await pagina.locator('#cartoes-operacao article.cartao-operacao[data-evento="controlador-sem-bateria"]').count()) === 1, 'o painel da direita deveria ter o cartão do controlador queimado');
    await captura('90g-errar-controlador-queimado');
    // O conserto, na ordem do texto: fecha o disjuntor e depois conserta pelo painel do controlador.
    await clicarProtecao(caboCtl.uid, 0, 'disjuntor do controlador (conserto)');
    conferir((await estadoDaChave(caboCtl.uid, 0)) === 'fechada', 'o disjuntor deveria fechar de novo');
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid: u }), ctl);
    await pagina.locator('#item-selecionado .bloco-queimado [data-acao="consertar"]').click();
    await og(() => window.__offgrid.acoes.selecionar(null));
    await noErro('feito');
    conferir(!(await projeto()).dispositivos.find((x) => x.uid === ctl).queimado && (await visor(ctl)) !== '', 'consertado com a bateria ligada, o controlador deveria voltar e acender');
    conferir((await painel().textContent()).includes('Bateria primeiro, placa por último'), 'o fim do erro (a) deveria trazer a lição');
    await captura('90h-errar-controlador-consertado');

    // (b) Aparelho maior que o inversor: o micro-ondas põe o inversor em falha; desligar e religar.
    await botaoDoPainel('lista-de-erros').click();
    await noErro('lista');
    conferir((await painel().locator('button.erro-feito').count()) === 1, 'a lista deveria marcar o erro (a) como feito');
    await painel().locator('button[data-erro="aparelho-grande"]').click();
    await noErro('antes');
    texto = await painel().textContent();
    conferir(texto.includes('micro-ondas de 1.300 W num inversor de 500 W') && texto.includes('não queima nada'), `o erro (b) deveria dizer antes o que acontece: "${texto}"`);
    await botaoDoPainel('por-que-erro').click();
    await noErro('porque');
    conferir((await painel().textContent()).includes('fica em falha até ser religado') && (await painel().textContent()).includes('confira no manual'), 'o erro (b) deveria explicar por quê, com o manual do inversor e o aviso de que o seu pode religar sozinho');
    await botaoDoPainel('comecar-erro').click();
    await noErro('por-aparelho');
    // O piso já tem bateria, inversor e aparelho: tenta alguns lugares livres até ficar verde.
    let microondasNoPiso = false;
    for (const ponto of [[-0.5, 0.05, -0.6], [-0.9, 0.05, -0.5], [0.9, 0.05, -0.6], [-0.2, 0.05, 0.1], [0.1, 0.05, -0.9]]) {
      await fecharAvisos();
      const s = await levar(await doCartao('ap-microondas'), await telaDoPonto(ponto));
      if (s.modo === 'catalogo' && s.valido === true) {
        await soltar();
        microondasNoPiso = true;
        break;
      }
      await pagina.keyboard.press('Escape');
      await soltar();
    }
    conferir(microondasNoPiso, 'o micro-ondas deveria poder ser solto no piso do quartinho');
    await fecharAvisos();
    const microondas = await uidDe('ap-microondas');
    await cabo(microondas, 'plug', inversor, 'caSaida');
    await og(() => window.__offgrid.acoes.selecionar(null));
    await noErro('ligar');
    if ((await painel().locator('[data-erro-nota="horario"]').count()) > 0) await botaoDoPainel('dia-inteiro-erro').click();
    const antesDaSobrecarga = (await estado()).simulacao.eventos.length;
    await clicarBotao(microondas, 'micro-ondas');
    await noErro('religar');
    e = await estado();
    conferir(e.simulacao.eventos.slice(antesDaSobrecarga).map((x) => x.codigo).includes('sobrecarga') && e.projeto.dispositivos.find((x) => x.uid === inversor).falha === 'sobrecarga', `ligar o micro-ondas deveria pôr o inversor em falha: ${JSON.stringify(e.simulacao.eventos.slice(antesDaSobrecarga))}`);
    const visorFalha = await visor(inversor);
    console.log(`visor do inversor em sobrecarga: "${visorFalha}"`);
    conferir(visorFalha.startsWith('falha: sobrecarga'), `o visor do inversor deveria mostrar a falha: "${visorFalha}"`);
    await captura('90i-errar-sobrecarga');
    // Religar com o micro-ondas ligado: cai de novo. Desligado o micro-ondas, religa pelo painel do inversor.
    await clicarBotao(microondas, 'micro-ondas (desligar)');
    conferir((await projeto()).dispositivos.find((x) => x.uid === microondas).ligado === false, 'o botão ⏻ deveria desligar o micro-ondas');
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid: u }), inversor);
    await pagina.locator('#item-selecionado [data-acao="religar-inversor"]').click();
    await og(() => window.__offgrid.acoes.selecionar(null));
    await noErro('feito');
    conferir((await visor(inversor)).startsWith('ligado'), `religado, o visor do inversor deveria voltar: "${await visor(inversor)}"`);

    // (c) Bateria invertida: desligar, trocar os cabos, fechar o fusível queima o inversor; desfazer, consertar e religar.
    await botaoDoPainel('lista-de-erros').click();
    await painel().locator('button[data-erro="bateria-invertida"]').click();
    await noErro('antes');
    texto = await painel().textContent();
    conferir(texto.includes('o inversor queima na hora') && texto.includes('inversor novo') && texto.includes('pegar fogo'), `o erro (c) deveria dizer antes o que acontece e o custo de verdade: "${texto}"`);
    await botaoDoPainel('por-que-erro').click();
    await noErro('porque');
    conferir((await painel().textContent()).includes('positivo com positivo'), 'o erro (c) deveria explicar por quê');
    await botaoDoPainel('comecar-erro').click();
    await noErro('desligar');
    // Desliga na ordem inversa: aparelhos, inversor e por último o fusível, tudo pelo clique na cena.
    for (const ap of (await projeto()).dispositivos.filter((x) => x.itemId.startsWith('ap-') && x.ligado)) await clicarBotao(ap.uid, ap.itemId);
    await clicarBotao(inversor, 'inversor (desligar)');
    await clicarProtecao(caboPos.uid, 0, 'fusível da bateria (tirar)');
    await noErro('apagar');
    const apagarCabo = async (uid) => {
      await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'cabo', uid: u }), uid);
      await pagina.locator('#item-selecionado button', { hasText: 'Apagar cabo' }).click();
      await esperar(200);
    };
    for (const c of (await projeto()).cabos.filter((x) => [x.de.disp, x.para.disp].includes(bateria) && [x.de.disp, x.para.disp].includes(inversor))) await apagarCabo(c.uid);
    await noErro('cruzar-positivo');
    await cabo(bateria, 'pos', inversor, 'batNeg');
    const trocadoPos = (await projeto()).cabos.find((x) => [x.de, x.para].some((t) => t.disp === bateria && t.terminal === 'pos') && [x.de, x.para].some((t) => t.disp === inversor && t.terminal === 'batNeg')).uid;
    const sFus2 = await levar(await doCartao('prot-fusivel-anl-100'), await og((u) => window.__offgrid.telaDoCabo(u, 0.5), trocadoPos));
    conferir(sFus2.modo === 'protecao' && sFus2.valido === true, `o fusível sobre o cabo trocado deveria poder ser instalado: ${JSON.stringify(sFus2)}`);
    await soltar();
    await noErro('cruzar-negativo');
    await cabo(bateria, 'neg', inversor, 'batPos');
    await noErro('fechar');
    const antesDaInversao = (await estado()).simulacao.eventos.length;
    conferir(!(await projeto()).dispositivos.find((x) => x.uid === inversor).queimado, 'com o fusível fora, a bateria invertida ainda não deveria queimar o inversor');
    await clicarProtecao(trocadoPos, 0, 'fusível do cabo trocado');
    await noErro('desfazer');
    e = await estado();
    conferir(e.simulacao.eventos.slice(antesDaInversao).map((x) => x.codigo).join() === 'bateria-invertida', `fechar o fusível com a bateria invertida deveria queimar o inversor: ${JSON.stringify(e.simulacao.eventos.slice(antesDaInversao))}`);
    conferir(e.projeto.dispositivos.find((x) => x.uid === inversor).queimado?.codigo === 'bateria-invertida' && (e.projeto.cabos.find((x) => x.uid === trocadoPos).estados ?? [])[0] === 'queimada', 'o inversor e o fusível deveriam ficar queimados');
    conferir((await og(() => window.__offgrid.operacaoNaCena())).selos.includes(inversor), 'a cena deveria marcar o inversor como queimado');
    await captura('90j-errar-inversor-queimado');
    for (const c of (await projeto()).cabos.filter((x) => [x.de.disp, x.para.disp].includes(bateria) && [x.de.disp, x.para.disp].includes(inversor))) await apagarCabo(c.uid);
    // Refaz na ordem da montagem: cabo positivo, fusível nele, cabo negativo; o realce acompanha.
    await esperar(300);
    d = await exigirDestaque('terminal', 'no "desfazer", sem cabos, o realce deveria marcar os terminais do positivo');
    conferir(d.length === 2 && d.some((x) => x.disp === inversor && x.terminal === 'batPos'), `o "desfazer" deveria começar pelo cabo positivo: ${JSON.stringify(d)}`);
    await cabo(bateria, 'pos', inversor, 'batPos');
    const novoPos = (await projeto()).cabos.find((x) => x.de.disp === bateria && x.de.terminal === 'pos' && x.para.disp === inversor).uid;
    await esperar(300);
    d = await exigirDestaque('cabo', 'no "desfazer", com o cabo positivo, o realce deveria marcar esse cabo');
    conferir(d[0].uid === novoPos, `o realce deveria pedir o fusível no cabo positivo refeito: ${JSON.stringify(d)}`);
    const sFus3 = await levar(await doCartao('prot-fusivel-anl-100'), await og((u) => window.__offgrid.telaDoCabo(u, 0.5), novoPos));
    conferir(sFus3.modo === 'protecao' && sFus3.valido === true, `o fusível sobre o cabo refeito deveria poder ser instalado: ${JSON.stringify(sFus3)}`);
    await soltar();
    await noErro('desfazer');
    await esperar(300);
    d = await exigirDestaque('terminal', 'no "desfazer", com o fusível, o realce deveria marcar os terminais do negativo');
    conferir(d.length === 2 && d.some((x) => x.disp === inversor && x.terminal === 'batNeg'), `com o fusível, o realce deveria passar ao negativo: ${JSON.stringify(d)}`);
    await captura('90j2-errar-c-refazer-fusivel-antes-do-negativo');
    await cabo(bateria, 'neg', inversor, 'batNeg');
    await noErro('consertar');
    await og((u) => window.__offgrid.acoes.selecionar({ tipo: 'dispositivo', uid: u }), inversor);
    await pagina.locator('#item-selecionado .bloco-queimado [data-acao="consertar"]').click();
    await og(() => window.__offgrid.acoes.selecionar(null));
    await clicarProtecao(novoPos, 0, 'fusível do cabo refeito');
    await clicarBotao(inversor, 'inversor (religar)');
    const aparelhoDoTeste = (await projeto()).dispositivos.find((x) => x.itemId === 'ap-lampada') ?? (await projeto()).dispositivos.find((x) => x.itemId === 'ap-ventilador');
    if (!aparelhoDoTeste.ligado) await clicarBotao(aparelhoDoTeste.uid, aparelhoDoTeste.itemId);
    await noErro('feito');
    e = await estado();
    conferir(e.simulacao.eventos.slice(antesDaInversao).length === 1 && !e.projeto.dispositivos.some((x) => x.queimado || x.falha), `o conserto na ordem não deveria queimar nada de novo: ${JSON.stringify(e.simulacao.eventos.slice(antesDaInversao))}`);
    await captura('90k-errar-pronto');
    await botaoDoPainel('voltar-ao-teste').click();
    await esperarSituacao('resumo');
    conferir((await painel().textContent()).includes('Experimente errar'), 'depois de um teste, o resumo deveria continuar oferecendo "Experimente errar"');

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

    // ---- "Ligar o sistema" na casa completa: o cenário pronto desligado com "Desligar o sistema" volta pelo botão dos mostradores.
    await og(() => window.__offgrid.acoes.desenergizar());
    await og(() => window.__offgrid.recalcular());
    await pagina.waitForFunction(() => !document.querySelector('#m-desligado')?.hidden && !document.querySelector('#m-ligar-sistema')?.hidden, null, { timeout: 8000 });
    texto = await pagina.locator('#m-desligado').textContent();
    conferir(texto.includes('Sem energia nos aparelhos:') && texto.includes('Ligar o sistema'), `desligada, a casa deveria dizer por que não há energia e oferecer "Ligar o sistema": "${texto}"`);
    await captura('91b-casa-desligada-ligar-o-sistema');
    await pagina.locator('#m-ligar-sistema').click();
    await pagina.waitForFunction(() => document.querySelector('#m-desligado')?.hidden === true, null, { timeout: 8000 });
    e = await estado();
    const inversorDaCasa = e.projeto.dispositivos.find((x) => x.uid === e.derivados.analise.sistema.inversor);
    conferir(inversorDaCasa.ligado === true && e.projeto.cabos.every((c) => (c.estados ?? []).every((s) => s === 'fechada')), 'o botão "Ligar o sistema" dos mostradores deveria fechar as proteções e ligar o inversor');
    await pagina.locator('#botao-projeto').click();
    conferir((await pagina.locator('#botao-sistema').textContent()) === 'Desligar o sistema', 'ligado o sistema, o menu Projeto deveria oferecer "Desligar o sistema"');
    await pagina.keyboard.press('Escape');
    // Desfaz os dois passos: a casa volta a ser exatamente a de antes (os estados das chaves ficam ausentes, como no cenário).
    await og(() => window.__offgrid.acoes.desfazer());
    await og(() => window.__offgrid.acoes.desfazer());
    conferir(JSON.stringify((await estado()).projeto) === JSON.stringify(casaAntes), 'desfazer o ligar e o desligar deveria devolver a casa igual');
  }
  await verificarTutorial();

  await verificarConjunto();

  // Grampo de parede (cena-e-interface.md, seção 8): dois grampos postos com o mouse em um cabo do quartinho,
  // a ordem em `cabo.grampos`, o comprimento novo, o desfazer, o Delete e a recusa quando não há cabo.
  async function verificarGrampo() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const projeto = async () => (await estado()).projeto;
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    const telaDoPonto = (p) => og((q) => window.__offgrid.telaDoPonto(q), p);
    const parado = async () => {
      await esperar(300);
      await og(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return og(() => window.__offgrid.interacao());
    };
    /** Aperta no cartão do grampo e leva o ponteiro até o ponto da casa, sem soltar. */
    const levarGrampo = async (ponto) => {
      const de = await og(() => window.__offgrid.telaDoCartao('acc-grampo'));
      conferir(Array.isArray(de), 'o catálogo deveria ter o cartão do grampo de parede');
      const ate = await telaDoPonto(ponto);
      await pagina.mouse.move(de[0], de[1]);
      await esperar(150);
      await pagina.mouse.down();
      await pagina.mouse.move(ate[0], ate[1], { steps: 10 });
      return parado();
    };
    const soltar = async () => {
      await pagina.mouse.up();
      await esperar(300);
    };
    const c5 = async () => (await projeto()).cabos.find((c) => c.uid === 'c5');
    const grampos = async () => (await projeto()).dispositivos.filter((d) => d.itemId === 'acc-grampo');
    /**
     * `(|dx| + |dy| + |dz|) × 1,1` somado pelos trechos do cabo c5: terminal, grampos na ordem, terminal.
     * O ponto do grampo aqui é o centro da peça; o cabo passa a milímetros dele, dentro do arco.
     */
    const brutoDeC5 = () =>
      og(() => {
        const o = window.__offgrid;
        const p = o.estado().projeto;
        const c = p.cabos.find((x) => x.uid === 'c5');
        const ponta = (x) => o.camadas.dispositivos.terminal(x.disp, x.terminal).pos.toArray();
        const pontos = [ponta(c.de), ...(c.grampos ?? []).map((g) => p.dispositivos.find((d) => d.uid === g).pos), ponta(c.para)];
        let soma = 0;
        for (let i = 0; i + 1 < pontos.length; i++) soma += [0, 1, 2].reduce((s, k) => s + Math.abs(pontos[i][k] - pontos[i + 1][k]), 0) * 1.1;
        return soma;
      });
    /** O comprimento gravado é a soma arredondada a 0,1 m: até 0,05 do arredondamento, mais 1 cm do ponto dentro do grampo. */
    const conferirComprimento = async (quando) => {
      const bruto = await brutoDeC5();
      const c = await c5();
      conferir(Math.abs(c.comprimento - bruto) <= 0.06 && Math.abs(c.comprimento * 10 - Math.round(c.comprimento * 10)) < 1e-9, `${quando}: o comprimento do cabo deveria ser a soma dos trechos (${bruto.toFixed(3)} m), arredondada a 0,1 m; está em ${c.comprimento}`);
      return c.comprimento;
    };

    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
    await esperar(600);
    let p = await projeto();
    const inversor = p.dispositivos.find((d) => d.uid === 'inversor');
    const comprimentoInicial = (await c5()).comprimento;
    const sugestoesAntes = JSON.stringify((await estado()).derivados.sugestoes.map((s) => s.titulo));
    const pecasAntes = p.dispositivos.length;
    // De dentro do quartinho, de frente para a parede do fundo, onde ficam o inversor e a tomada da rede.
    const zParede = inversor.pos[2] - 0.06;
    await mudarCamera(noMundo([inversor.pos[0] + 0.25, 1.0, inversor.pos[2] + 1.6]), noMundo([inversor.pos[0] + 0.3, 0.95, zParede]));
    await esperar(400);

    // ---- Primeiro grampo, sem nada selecionado: prende o cabo mais próximo (o do inversor à tomada da rede), que acende.
    let s = await levarGrampo([inversor.pos[0] + 0.6, 0.85, zParede]);
    conferir(s.modo === 'catalogo' && s.valido === true && s.cabo === 'c5', `o grampo sobre a parede, abaixo da tomada, deveria prender o cabo c5: ${JSON.stringify(s)}`);
    conferir(/Solte para prender o cabo aqui/.test((await pagina.locator('[data-offgrid-dica]').textContent()) ?? ''), 'a dica deveria dizer que o grampo vai prender o cabo');
    await captura('92-grampo-fantasma-e-cabo-aceso');
    await soltar();
    let c = await c5();
    let g = await grampos();
    conferir(g.length === 1 && g[0].superficie === 'parede-quartinho-fundo' && JSON.stringify(c.grampos) === JSON.stringify([g[0].uid]), `soltar o grampo deveria criar a peça na parede e pôr o uid dela no cabo: ${JSON.stringify([c.grampos, g])}`);
    const sel = (await estado()).selecao;
    conferir(sel?.tipo === 'cabo' && sel.uid === 'c5', `o cabo preso deveria ficar selecionado: ${JSON.stringify(sel)}`);
    const comUm = await conferirComprimento('com um grampo');
    const primeiro = g[0].uid;

    // ---- Segundo grampo, com o cabo selecionado: vai para ele, e entra na ordem antes do primeiro (fica do lado do inversor).
    s = await levarGrampo([inversor.pos[0] + 0.28, 0.45, zParede]);
    conferir(s.valido === true && s.cabo === 'c5', `com o cabo c5 selecionado, o grampo deveria ir para ele: ${JSON.stringify(s)}`);
    await soltar();
    c = await c5();
    g = await grampos();
    const segundo = g.find((x) => x.uid !== primeiro)?.uid;
    conferir(g.length === 2 && JSON.stringify(c.grampos) === JSON.stringify([segundo, primeiro]), `o segundo grampo deveria entrar antes do primeiro, que é a ordem que menos alonga o cabo: ${JSON.stringify(c.grampos)}`);
    const comDois = await conferirComprimento('com dois grampos');
    conferir(comDois > comUm, `o desvio pelo segundo grampo deveria alongar o cabo: ${comUm} -> ${comDois}`);
    // O cabo passa pelos dois grampos: um trecho reto entre eles, mais os dois das pontas.
    const tubos = await og(() => window.__offgrid.camadas.cabos.grupoDe('c5').children.filter((o) => o.name === 'tubo').length);
    conferir(tubos === 3, `o cabo com dois grampos deveria ser desenhado em três trechos; tem ${tubos}`);
    // Não atrapalha: nenhuma sugestão nova do consultor, e o grampo não tem terminais.
    await esperar(900);
    conferir(JSON.stringify((await estado()).derivados.sugestoes.map((x) => x.titulo)) === sugestoesAntes, 'o grampo não deveria mudar as sugestões do consultor');
    conferir(await og((u) => window.__offgrid.camadas.dispositivos.grupoDe(u).children.every((o) => !o.name.startsWith('terminal-')), segundo), 'o grampo não deveria ter terminais');
    await og(() => window.__offgrid.acoes.selecionar(null));
    await captura('93-cabo-preso-por-dois-grampos');

    // ---- Desfazer tira um grampo de cada vez e devolve o comprimento; refazer põe de volta.
    await og(() => window.__offgrid.acoes.desfazer());
    await esperar(300);
    c = await c5();
    conferir(JSON.stringify(c.grampos) === JSON.stringify([primeiro]) && c.comprimento === comUm && (await grampos()).length === 1, `desfazer deveria tirar o segundo grampo e devolver o comprimento: ${JSON.stringify(c)}`);
    await og(() => window.__offgrid.acoes.desfazer());
    await esperar(300);
    c = await c5();
    conferir((c.grampos ?? []).length === 0 && c.comprimento === comprimentoInicial && (await grampos()).length === 0 && (await projeto()).dispositivos.length === pecasAntes, `desfazer de novo deveria deixar o cabo como era: ${JSON.stringify(c)}`);
    await og(() => window.__offgrid.acoes.refazer());
    await og(() => window.__offgrid.acoes.refazer());
    await esperar(300);
    c = await c5();
    conferir(JSON.stringify(c.grampos) === JSON.stringify([segundo, primeiro]) && c.comprimento === comDois, `refazer deveria devolver os dois grampos: ${JSON.stringify(c)}`);

    // ---- Clique no grampo seleciona o grampo; Delete solta o cabo naquele ponto.
    const noGrampo = await og((u) => window.__offgrid.telaDe(u), segundo);
    await pagina.mouse.click(noGrampo[0], noGrampo[1]);
    await esperar(300);
    conferir((await estado()).selecao?.uid === segundo, `clicar no grampo deveria selecionar o grampo, e não o cabo: ${JSON.stringify((await estado()).selecao)}`);
    await pagina.keyboard.press('Delete');
    await esperar(300);
    c = await c5();
    conferir(JSON.stringify(c.grampos) === JSON.stringify([primeiro]) && c.comprimento === comUm, `Delete no grampo deveria soltar o cabo naquele ponto: ${JSON.stringify(c)}`);

    // ---- Sem cabo no projeto, o grampo é recusado, com a mensagem.
    await og(() => {
      for (const cabo of window.__offgrid.estado().projeto.cabos) window.__offgrid.acoes.removerCabo(cabo.uid);
    });
    await esperar(300);
    conferir((await grampos()).length === 0, 'apagar o cabo deveria apagar o grampo dele');
    s = await levarGrampo([inversor.pos[0] + 0.6, 0.85, zParede]);
    conferir(s.valido === false && s.motivo === 'Puxe um cabo antes de pôr o grampo.', `sem cabo, o grampo deveria ser recusado com a mensagem: ${JSON.stringify(s)}`);
    await soltar();
    conferir((await grampos()).length === 0, 'sem cabo, soltar o grampo não deveria criar nada');
    conferir(((await pagina.locator('[data-offgrid-dica]').textContent()) ?? '') === 'Puxe um cabo antes de pôr o grampo.' && (await pagina.locator('[data-offgrid-dica]').isVisible()), 'a recusa deveria aparecer perto do ponteiro');
    await captura('94-grampo-recusado-sem-cabo');
  }
  await verificarGrampo();

  // "Meus projetos" (fase-2.md, seção 9): criar, trocar, renomear, duplicar e apagar pelo painel, com o mouse.
  async function verificarProjetos() {
    const lista = () => pagina.evaluate(() => window.__offgrid.acoes.listarProjetos());
    const abrirPainel = async () => {
      await pagina.locator('#botao-projeto').click();
      await pagina.locator('#botao-meus-projetos').click();
      conferir(await pagina.locator('#painel-projetos').isVisible(), 'o painel "Meus projetos" deveria abrir');
    };
    const item = (nome) => pagina.locator(`#lista-de-projetos .projeto-item[data-nome="${nome}"]`);
    await pagina.evaluate(() => {
      const a = window.__offgrid.acoes;
      if (window.__offgrid.estado().projeto.casa.soQuartinho) a.sairDoTutorial();
      a.definirTempo(Date.UTC(2026, 5, 21, 15));
    });
    const inicio = await lista();
    conferir(inicio.filter((p) => p.atual).length === 1, `o projeto da tela deveria estar na lista: ${JSON.stringify(inicio)}`);
    const primeiro = inicio.find((p) => p.atual);
    // Uma marca no primeiro projeto, para reconhecê-lo na volta: a casa virada para o leste.
    await pagina.evaluate(() => window.__offgrid.acoes.alterarCasa({ orientacaoGraus: 90 }));
    const daPrimeira = JSON.stringify((await estado()).projeto);

    await abrirPainel();
    conferir((await item(primeiro.nome).locator('.projeto-aberto').count()) === 1 && (await item(primeiro.nome).locator('[data-acao="abrir"]').isDisabled()), 'o projeto aberto vem marcado e sem "Abrir"');
    await captura('95-meus-projetos');
    // Novo projeto, de casa vazia.
    await pagina.locator('#novo-projeto-nome').fill('Casa dos pais');
    await pagina.locator('#novo-projeto [data-acao="criar"]').click();
    let e = await estado();
    conferir(e.projeto.nome === 'Casa dos pais' && e.projeto.cabos.length === 0 && e.projeto.casa.orientacaoGraus !== 90, `o projeto novo deveria abrir vazio: ${e.projeto.nome}, ${e.projeto.cabos.length} cabos`);
    conferir(await pagina.locator('#painel-projetos').isHidden(), 'criar deveria fechar o painel');
    conferir((await pagina.title()).startsWith('Casa dos pais'), `o título da aba deveria trazer o nome do projeto: "${await pagina.title()}"`);
    await esperar(300);
    await captura('96-projeto-novo-casa-vazia');
    await pagina.evaluate(() => window.__offgrid.acoes.alterarCasa({ orientacaoGraus: 270, andares: 1 }));

    // De volta ao primeiro: a casa, a orientação e a montagem dele estão como ficaram.
    await abrirPainel();
    conferir((await pagina.locator('#lista-de-projetos .projeto-item').count()) === inicio.length + 1, 'a lista deveria ter um projeto a mais');
    await item(primeiro.nome).locator('[data-acao="abrir"]').click();
    conferir(JSON.stringify((await estado()).projeto) === daPrimeira, 'abrir o primeiro projeto deveria devolvê-lo igual');
    await pagina.evaluate(() => window.__offgrid.acoes.desfazer());
    conferir(JSON.stringify((await estado()).projeto) === daPrimeira, 'desfazer não deveria atravessar a troca de projeto');

    // Renomear e duplicar o outro, sem abri-lo.
    await abrirPainel();
    await item('Casa dos pais').locator('[data-acao="renomear"]').click();
    await pagina.locator('#lista-de-projetos .projeto-nome-campo').fill('Sítio');
    await pagina.locator('#lista-de-projetos [data-acao="salvar-nome"]').click();
    conferir((await item('Sítio').count()) === 1 && (await item('Casa dos pais').count()) === 0, 'o projeto deveria aparecer com o nome novo');
    await item('Sítio').locator('[data-acao="duplicar"]').click();
    conferir((await item('Sítio (cópia)').count()) === 1, 'duplicar deveria criar "Sítio (cópia)"');
    await captura('97-meus-projetos-tres');
    // Apagar pede confirmação: recusar mantém, aceitar apaga.
    pagina.once('dialog', (dlg) => dlg.dismiss());
    await item('Sítio (cópia)').locator('[data-acao="apagar"]').click();
    conferir((await item('Sítio (cópia)').count()) === 1, 'recusar a confirmação não deveria apagar');
    pagina.once('dialog', (dlg) => dlg.accept());
    await item('Sítio (cópia)').locator('[data-acao="apagar"]').click();
    conferir((await item('Sítio (cópia)').count()) === 0, 'aceitar a confirmação deveria apagar');
    // O projeto "Sítio" guardou a casa térrea virada para o oeste.
    await item('Sítio').locator('[data-acao="abrir"]').click();
    e = await estado();
    conferir(e.projeto.casa.orientacaoGraus === 270 && e.projeto.casa.andares === 1, 'o segundo projeto deveria guardar a casa e a orientação dele');

    // Recarregar a página abre o projeto que estava aberto, e a lista continua lá.
    await esperar(700);
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid?.pronto === true, null, { timeout: 30000 });
    e = await estado();
    conferir(e.projeto.nome === 'Sítio' && (await lista()).length === inicio.length + 1, `depois de recarregar deveria abrir "Sítio" com a lista inteira: ${e.projeto.nome}`);

    // No tutorial, "Meus projetos" some do menu e o tutorial não entra na lista.
    await pagina.evaluate(() => window.__offgrid.acoes.entrarNoTutorial());
    await pagina.locator('#botao-projeto').click();
    conferir(!(await pagina.locator('#botao-meus-projetos').isVisible()), 'no tutorial o menu Projeto não deveria mostrar "Meus projetos"');
    await pagina.keyboard.press('Escape');
    conferir((await lista()).length === inicio.length + 1, 'o tutorial não deveria entrar na lista');
    await pagina.evaluate(() => window.__offgrid.acoes.sairDoTutorial());

    // Arruma a casa: apaga o segundo projeto e devolve a orientação do primeiro.
    await pagina.evaluate((id) => {
      const a = window.__offgrid.acoes;
      a.apagarProjeto(a.listarProjetos().find((p) => p.atual).id);
      a.abrirProjeto(id);
      a.alterarCasa({ orientacaoGraus: 0 });
    }, primeiro.id);
    conferir((await lista()).length === inicio.length, 'no fim a lista deveria voltar ao tamanho do começo');
  }
  await verificarProjetos();

  // "Arrumar os cabos" (cena-e-interface.md, seção 8): o botão põe os grampos em todos os cabos, o comprimento é
  // remedido, desfazer volta tudo em um passo, "Soltar os cabos" tira os grampos e, sem cabos, o botão avisa.
  async function verificarArrumarCabos() {
    const og = (fn, arg) => pagina.evaluate(fn, arg);
    const projeto = async () => (await estado()).projeto;
    const noMundo = (p) => [-p[0], p[1], -p[2]];
    const escolher = async (id) => {
      await pagina.locator('#botao-cabos').click();
      await pagina.locator(id).click();
    };
    const mensagem = async () => (await pagina.locator('#mensagem').textContent()) ?? '';
    const grampos = (p) => p.dispositivos.filter((d) => d.itemId === 'acc-grampo');

    await og(() => window.__offgrid.acoes.novoProjeto());
    await og(() => window.__offgrid.acoes.definirTempo(Date.UTC(2026, 5, 21, 15)));
    await pagina.getByRole('button', { name: 'Sem telhado', exact: true }).click();
    await esperar(600);
    const antes = await projeto();
    conferir(antes.cabos.length > 0 && grampos(antes).length === 0, 'o plano inicial deveria ter cabos e nenhum grampo');
    const q = antes.casa.quartinho;
    // De frente para a porta do quartinho, e de cima, para o vão entre ele e a casa.
    const daPorta = [noMundo([q.x, 1.5, q.z + q.profundidade / 2 + 1.6]), noMundo([q.x, 1.0, q.z - q.profundidade / 2])];
    const doVao = [noMundo([q.x - q.largura / 2 - 0.9, 3.4, q.z + q.profundidade / 2 + 1.6]), noMundo([q.x + 0.2, 0.9, q.z - q.profundidade / 4])];
    await mudarCamera(...daPorta);
    await captura('98-cabos-soltos-no-quartinho');

    await escolher('#botao-arrumar-cabos');
    await pagina.waitForFunction(() => window.__offgrid.estado().projeto.cabos.every((c) => (c.grampos ?? []).length > 0), null, { timeout: 60000 });
    await esperar(400);
    const depois = await projeto();
    conferir(depois.cabos.every((c) => (c.grampos ?? []).length > 0), 'depois de "Arrumar os cabos" todos os cabos deveriam ter grampos');
    const presos = depois.cabos.flatMap((c) => c.grampos);
    conferir(new Set(presos).size === presos.length && presos.length === grampos(depois).length, 'cada grampo deveria prender um cabo só, e não deveria sobrar grampo sem cabo');
    conferir(depois.cabos.every((c) => c.comprimento >= 0.3 && Math.abs(c.comprimento * 10 - Math.round(c.comprimento * 10)) < 1e-9), 'os comprimentos remedidos deveriam ter no mínimo 0,3 m e passo de 0,1 m');
    conferir(depois.cabos.some((c, i) => c.comprimento !== antes.cabos[i].comprimento), 'o comprimento dos cabos deveria ser remedido pelo trajeto');
    conferir(/cabos arrumados, com \d+ grampos/.test(await mensagem()), `a mensagem deveria dizer quantos cabos e grampos: "${await mensagem()}"`);
    await captura('99-cabos-arrumados-no-quartinho');
    await mudarCamera(...doVao);
    await captura('100-cabos-arrumados-saida-do-quartinho');

    // Desfazer volta tudo em um passo; refazer traz de volta.
    await og(() => window.__offgrid.acoes.desfazer());
    await esperar(400);
    conferir(JSON.stringify(await projeto()) === JSON.stringify(antes), 'um desfazer deveria voltar o projeto ao que era antes de arrumar (grampos e comprimentos)');
    await og(() => window.__offgrid.acoes.refazer());
    await esperar(400);
    conferir(JSON.stringify(await projeto()) === JSON.stringify(depois), 'refazer deveria devolver os cabos arrumados');

    // Arrumar de novo refaz o trajeto com o mesmo resultado (nada mudou de lugar).
    await escolher('#botao-arrumar-cabos');
    await pagina.waitForFunction(() => /cabos arrumados/.test(document.querySelector('#mensagem')?.textContent ?? ''), null, { timeout: 60000 });
    await esperar(400);
    const deNovo = await projeto();
    conferir(grampos(deNovo).length === grampos(depois).length && deNovo.cabos.every((c, i) => c.comprimento === depois.cabos[i].comprimento), 'arrumar de novo sem mover nada deveria dar o mesmo trajeto');

    // Soltar tira todos os grampos, em um passo de desfazer.
    await escolher('#botao-soltar-cabos');
    await esperar(400);
    const solto = await projeto();
    conferir(grampos(solto).length === 0 && solto.cabos.every((c) => (c.grampos ?? []).length === 0), '"Soltar os cabos" deveria tirar todos os grampos');
    await og(() => window.__offgrid.acoes.desfazer());
    await esperar(300);
    conferir(grampos(await projeto()).length === grampos(deNovo).length, 'desfazer depois de soltar deveria devolver os grampos');

    // Sem cabos, o botão avisa e não cria nada.
    await og(() => {
      for (const c of [...window.__offgrid.estado().projeto.cabos]) window.__offgrid.acoes.removerCabo(c.uid);
    });
    await esperar(300);
    await escolher('#botao-arrumar-cabos');
    await esperar(300);
    conferir((await mensagem()).startsWith('Não há cabos para arrumar'), `sem cabos, o botão deveria avisar: "${await mensagem()}"`);
    conferir(grampos(await projeto()).length === 0, 'sem cabos, arrumar não deveria criar grampos');
    await og(() => window.__offgrid.acoes.novoProjeto());
    await pagina.getByRole('button', { name: 'Completa', exact: true }).click();
  }
  await verificarArrumarCabos();

  // Busca no catálogo (tarefa 9.1): o campo procura em todas as abas, sem diferença de acento, de maiúsculas e de
  // espaço antes da unidade; o cartão aponta para o modelo que casou; o filtro de linha continua valendo; Esc e o "×" limpam.
  async function verificarBuscaNoCatalogo() {
    // Página nova: sem modelo escolhido à mão em nenhum cartão.
    await pagina.reload();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true && typeof window.__offgrid.telaDoCartao === 'function', null, { timeout: 30000 });
    const campo = pagina.locator('#busca-catalogo');
    const limpar = pagina.locator('#busca-limpar');
    const cartoes = pagina.locator('#lista-catalogo .cartao');
    const grupos = () => cartoes.evaluateAll((l) => l.map((c) => c.dataset.grupo));
    const abaAberta = () => pagina.locator('#abas-catalogo button[aria-selected="true"]').evaluateAll((l) => l.map((b) => b.dataset.cat));
    const buscar = async (texto) => {
      await campo.click();
      await campo.fill(texto);
    };

    // O nome do modelo que não é o de referência no cartão de 585 W, lido da tela.
    await pagina.locator('#abas-catalogo button[data-cat="placas"]').click();
    const c585 = pagina.locator('#lista-catalogo .cartao', { has: pagina.locator('h4', { hasText: /^Placa solar de 585 W$/ }) });
    const idReferencia = await c585.getAttribute('data-item-id');
    await c585.locator('.ver-modelos').click();
    const outro = c585.locator('.modelos .modelo:not(.escolhido)').first();
    const idOutro = await outro.getAttribute('data-modelo-id');
    const nomeOutro = (await outro.locator('.modelo-nome span').textContent()).trim();
    const nomeReferencia = (await c585.locator('.modelos .modelo.escolhido .modelo-nome span').textContent()).trim();
    await c585.locator('.ver-modelos').click();
    conferir(idOutro && idOutro !== idReferencia && nomeOutro !== nomeReferencia, 'o cartão de 585 W deveria ter um segundo modelo');

    // De uma aba que não é a primeira, para conferir a volta.
    await pagina.locator('#abas-catalogo button[data-cat="baterias"]').click();
    conferir(await limpar.isHidden(), 'sem texto, o "×" fica escondido');
    const caixaDoCampo = await campo.boundingBox();
    const caixaDasAbas = await pagina.locator('#abas-catalogo').boundingBox();
    conferir(caixaDoCampo.y + caixaDoCampo.height <= caixaDasAbas.y + 1, 'o campo de busca fica acima das abas');

    // Unidade colada ou separada, maiúsculas e acento.
    await buscar('585w');
    const colado = await grupos();
    conferir(colado.length > 0, 'a busca por "585w" deveria achar alguma coisa');
    conferir((await abaAberta()).length === 0, 'com busca, nenhuma aba fica marcada');
    conferir((await cartoes.locator('.etiqueta-aba').count()) === colado.length, 'cada cartão do resultado diz a aba dele');
    conferir(await limpar.isVisible(), 'com texto, o "×" aparece');
    await buscar('585 W');
    conferir(JSON.stringify(await grupos()) === JSON.stringify(colado), '"585 W" e "585w" deveriam dar o mesmo resultado');
    await buscar('bateria');
    const minusculas = await grupos();
    const abasDoResultado = new Set(await cartoes.locator('.etiqueta-aba').allTextContents());
    conferir(minusculas.length > 0 && abasDoResultado.has('Baterias'), `"bateria" deveria achar itens da aba Baterias: ${[...abasDoResultado]}`);
    await buscar('BATERIA');
    conferir(JSON.stringify(await grupos()) === JSON.stringify(minusculas), 'maiúsculas não deveriam mudar o resultado');
    await buscar('fusivel');
    const semAcento = await grupos();
    await buscar('Fusível');
    conferir(semAcento.length > 0 && JSON.stringify(await grupos()) === JSON.stringify(semAcento), 'o acento não deveria mudar o resultado');
    await captura('100b-busca-no-catalogo');

    // O modelo que casou: o cartão aponta para ele, fechado, e o arraste leva esse modelo.
    await buscar(nomeOutro);
    const achado = pagina.locator(`#lista-catalogo .cartao[data-item-id="${idOutro}"]`);
    conferir((await achado.count()) === 1, `buscar "${nomeOutro}" deveria apontar o cartão para esse modelo`);
    conferir((await achado.locator('.modelo-casou').textContent()).includes(nomeOutro), 'o cartão diz qual modelo casou');
    conferir((await achado.locator('.detalhe').count()) === 0, 'o cartão do resultado continua fechado');
    await pagina.evaluate(() => {
      window.__arrastos = [];
      window.addEventListener('offgrid:arrastar-item', (ev) => window.__arrastos.push(ev.detail));
    });
    const titulo = await achado.locator('h4').boundingBox();
    await pagina.mouse.move(titulo.x + titulo.width / 2, titulo.y + titulo.height / 2);
    await pagina.mouse.down();
    await pagina.mouse.up();
    const arrastos = await pagina.evaluate(() => window.__arrastos);
    conferir(arrastos.length === 1 && arrastos[0].itemId === idOutro, `arrastar o resultado deveria levar o modelo que casou: ${JSON.stringify(arrastos)}`);
    await achado.locator('.ver-modelos').click();
    conferir((await achado.locator(`.modelo[data-modelo-id="${idOutro}"] input`).isChecked()) === true, 'no detalhe, o modelo que casou vem marcado');
    await captura('100c-busca-modelo-que-casou');
    // A escolha à mão vale mais que a busca.
    await achado.locator(`.modelo[data-modelo-id="${idReferencia}"] .modelo-nome`).click();
    conferir((await pagina.locator(`#lista-catalogo .cartao[data-item-id="${idReferencia}"]`).count()) === 1, 'escolher outro modelo à mão deveria valer mais que a busca');

    // Filtro de linha sobre o resultado, e o aviso de que há resultado em outras linhas.
    await buscar('585w');
    await pagina.locator('#filtro-linha button[data-linha="simples"]').click();
    const naSimples = await grupos();
    conferir(naSimples.length < colado.length, 'o filtro de linha deveria valer sobre o resultado da busca');
    if (naSimples.length === 0) {
      conferir((await pagina.locator('#lista-catalogo .vazio').textContent()).includes('em outras linhas'), 'sem resultado na linha, a lista avisa que há em outras');
      await pagina.locator('#lista-catalogo .ver-todas-linhas').click();
      conferir(JSON.stringify(await grupos()) === JSON.stringify(colado), '"Ver todas as linhas" deveria mostrar o resultado inteiro');
    } else await pagina.locator('#filtro-linha button[data-linha="todas"]').click();

    // Sem resultado.
    await buscar('zzzz');
    conferir((await cartoes.count()) === 0 && (await pagina.locator('#lista-catalogo .vazio').textContent()).trim() === 'Nenhum item com esse texto.', 'texto sem resultado deveria dizer "Nenhum item com esse texto."');

    // Digitar no campo não mexe na cena.
    const antes = JSON.stringify((await estado()).projeto);
    await buscar('');
    await pagina.keyboard.type('rg Delete');
    await pagina.keyboard.press('Delete');
    conferir(JSON.stringify((await estado()).projeto) === antes, 'digitar no campo de busca não deveria mudar o projeto');

    // Esc, "×" e clique em aba limpam; as duas primeiras voltam à aba de antes.
    await buscar('585w');
    await pagina.keyboard.press('Escape');
    conferir((await campo.inputValue()) === '' && JSON.stringify(await abaAberta()) === '["baterias"]', 'Esc deveria limpar a busca e voltar à aba de antes');
    await buscar('585w');
    await limpar.click();
    conferir((await campo.inputValue()) === '' && JSON.stringify(await abaAberta()) === '["baterias"]' && (await limpar.isHidden()), 'o "×" deveria limpar a busca e voltar à aba de antes');
    await buscar('585w');
    await pagina.locator('#abas-catalogo button[data-cat="inversores"]').click();
    conferir((await campo.inputValue()) === '' && JSON.stringify(await abaAberta()) === '["inversores"]', 'clicar em uma aba deveria limpar a busca e abrir a aba');

    // Quem procura um cartão pelo programa (consultor, tutorial) acha mesmo com busca ativa.
    await buscar('zzzz');
    const centro = await pagina.evaluate((id) => window.__offgrid.telaDoCartao(id), idReferencia);
    conferir(Array.isArray(centro) && (await campo.inputValue()) === '' && JSON.stringify(await abaAberta()) === '["placas"]', 'telaDoCartao deveria limpar a busca e achar o cartão');
  }
  await verificarBuscaNoCatalogo();

  // Mapa e corte do terreno do ambiente de rádio (especificacao/lora.md, seção 7), tudo com o mouse.
  // O terreno é o inventado em scripts/blocos-falsos.mjs: dois morros que se enxergam por cima de um vale
  // (enlace que fecha com folga) e um lugar atrás de uma serra (enlace que não fecha).
  async function verificarLoraMapa(lora, pedidos) {
    const tela = (c) => pagina.evaluate(([lat, lon]) => window.__lora.mapa.telaDe(lat, lon), [c.lat, c.lon]);
    const telaDoPonto = (id) => pagina.evaluate((i) => window.__lora.telaDoPonto(i), id);
    const situacao = () =>
      pagina.evaluate(() => {
        const en = window.__lora.estado().projeto.enlaces[0];
        const s = en ? window.__lora.situacaoDoEnlace(en.de, en.para) : null;
        if (!s || s.estado !== 'pronto') return s;
        return { estado: 'pronto', veredito: s.resultado.veredito, texto: s.resultado.texto, km: s.resultado.geometria.distanciaKm, zonaLivre: s.resultado.geometria.zonaLivre, folgaDb: s.resultado.conta.folgaDb };
      });
    const esperarSituacao = async (estado) => {
      await pagina.waitForFunction(
        (alvo) => {
          const en = window.__lora.estado().projeto.enlaces[0];
          return en && window.__lora.situacaoDoEnlace(en.de, en.para)?.estado === alvo;
        },
        estado,
        { timeout: 30000 },
      );
      return situacao();
    };
    /** Espera o mapa parar de se mexer (o enquadramento é animado). */
    const mapaParado = async () => {
      const ler = () => pagina.evaluate(() => JSON.stringify([window.__lora.mapa.centro(), window.__lora.mapa.zoom()]));
      let anterior = await ler();
      for (let i = 0; i < 50; i++) {
        await esperar(200);
        const agora = await ler();
        if (agora === anterior) return;
        anterior = agora;
      }
      throw new Error('O mapa não parou de se mexer.');
    };
    const pressionado = async (seletor) => (await pagina.locator(seletor).getAttribute('aria-pressed')) === 'true';
    const cursorDoMapa = () => pagina.evaluate(() => getComputedStyle(document.querySelector('#lora-mapa .maplibregl-canvas-container')).cursor);

    // Abertura: projeto vazio mostra o Brasil inteiro, sem centrar em cidade nenhuma; os créditos e o aviso estão na tela.
    let e = await lora();
    conferir(e.projeto.pontos.length === 0, `o projeto de rádio deveria estar vazio: ${e.projeto.pontos.length} pontos`);
    await esperar(800);
    const visao = await pagina.evaluate(() => ({ c: window.__lora.mapa.centro(), z: window.__lora.mapa.zoom() }));
    conferir(visao.z < 5 && visao.c.lat < -8 && visao.c.lat > -22 && visao.c.lon < -46 && visao.c.lon > -62, `a visão inicial deveria ser o Brasil inteiro: ${JSON.stringify(visao)}`);
    const creditos = await pagina.locator('#lora-mapa .maplibregl-ctrl-attrib').textContent();
    conferir(creditos.includes('© colaboradores do OpenStreetMap') && creditos.includes('Terrain Tiles'), `os créditos do mapa e do relevo deveriam aparecer: "${creditos}"`);
    conferir((await pagina.locator('#lora-mapa .maplibregl-ctrl-zoom-in').count()) === 1, 'o mapa deveria ter os botões de zoom');
    conferir((await pagina.locator('#lora-corte').isHidden()), 'sem enlace selecionado, o corte do terreno fica escondido');
    const aviso = pagina.locator('#lora-aviso-mapa');
    conferir((await aviso.textContent()).includes('nunca saem deste navegador'), 'o aviso de privacidade do mapa deveria aparecer na primeira vez');
    await pagina.locator('#lora-aviso-entendi').click();
    conferir((await aviso.count()) === 0, '"Entendi" deveria fechar o aviso do mapa');

    // Ferramenta "Novo ponto": fica marcada, o cursor muda e o próximo clique no mapa cria uma casa.
    await pagina.evaluate(([lat, lon]) => window.__lora.mapa.irPara(lat, lon, 9.9), [LUGARES.centro.lat, LUGARES.centro.lon]);
    await esperar(800);
    conferir(await pagina.locator('#lora-ligar').isDisabled(), 'sem dois pontos, "Ligar dois pontos" fica desligado');
    await pagina.locator('#lora-novo-ponto').click();
    conferir((await pressionado('#lora-novo-ponto')) && (await cursorDoMapa()) === 'crosshair', `"Novo ponto" deveria ficar marcado e mudar o cursor: ${await cursorDoMapa()}`);
    let p = await tela(LUGARES.morroA);
    await pagina.mouse.click(p.x, p.y);
    e = await lora();
    conferir(e.projeto.pontos.length === 1 && e.projeto.pontos[0].tipo === 'casa', 'o clique no mapa deveria criar uma casa');
    conferir(Math.abs(e.projeto.pontos[0].lat - LUGARES.morroA.lat) < 0.002 && Math.abs(e.projeto.pontos[0].lon - LUGARES.morroA.lon) < 0.002, `o ponto deveria ficar onde foi o clique: ${JSON.stringify(e.projeto.pontos[0])}`);
    conferir(e.selecao?.tipo === 'ponto' && !(await pressionado('#lora-novo-ponto')), 'o ponto novo fica selecionado e a ferramenta desliga');
    await pagina.locator('#lora-novo-ponto').click();
    p = await tela(LUGARES.morroB);
    await pagina.mouse.click(p.x, p.y);
    e = await lora();
    conferir(e.projeto.pontos.length === 2, 'o segundo clique deveria criar o segundo ponto');
    const [idA, idB] = e.projeto.pontos.map((x) => x.id);
    conferir((await pagina.locator('#lora-mapa .lora-ponto[data-tipo="casa"]').count()) === 2, 'o mapa deveria mostrar as duas casas');
    conferir((await pagina.locator('#lora-mapa .lora-ponto-nome').allTextContents()).join('|') === 'Ponto 1|Ponto 2', 'cada ponto mostra o nome ao lado');
    conferir(await pagina.locator('#lora-ligar-direto').isVisible(), 'com dois pontos soltos, o mapa oferece ligar direto');
    await captura('103-lora-dois-pontos');

    // "Ligar dois pontos": Esc cancela; depois, um clique em cada ponto cria o enlace.
    const a = await telaDoPonto(idA);
    const b = await telaDoPonto(idB);
    await pagina.locator('#lora-ligar').click();
    await pagina.mouse.click(a.x, a.y);
    conferir((await pagina.locator('#lora-dica').textContent()).includes('Ponto 1'), 'a dica deveria dizer que falta o segundo ponto');
    await pagina.keyboard.press('Escape');
    conferir(!(await pressionado('#lora-ligar')) && (await lora()).projeto.enlaces.length === 0, 'Esc deveria cancelar a ligação');
    await pagina.locator('#lora-ligar').click();
    conferir(await pressionado('#lora-ligar'), '"Ligar dois pontos" deveria ficar marcado');
    await pagina.mouse.click(a.x, a.y);
    await pagina.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 40);
    await captura('104-lora-ligando');
    await pagina.mouse.click(b.x, b.y);
    e = await lora();
    conferir(e.projeto.enlaces.length === 1 && e.selecao?.tipo === 'enlace', 'os dois cliques deveriam criar o enlace e selecioná-lo');

    // O enlace calcula com o relevo baixado: de morro a morro, por cima do vale, fecha com folga.
    let s = await esperarSituacao('pronto');
    conferir(s.veredito === 'folga' && s.zonaLivre && s.km > 20 && s.km < 22, `de morro a morro o enlace deveria fechar com folga: ${JSON.stringify(s)}`);
    const rotulo = pagina.locator('#lora-mapa .lora-enlace-rotulo');
    conferir((await rotulo.textContent()).includes('km') && (await rotulo.textContent()).includes('fecha com folga'), `o rótulo do enlace deveria dizer a distância e o veredito: "${await rotulo.textContent()}"`);
    conferir((await pagina.locator('#lora-mapa .lora-enlace').getAttribute('data-tom')) === 'folga', 'a linha deveria ter a cor do veredito');

    // Clique fora tira a seleção e esconde o corte; clique na linha seleciona o enlace e mostra o corte.
    p = await tela(LUGARES.centro);
    await pagina.mouse.click(p.x, p.y);
    conferir((await lora()).selecao === null && (await pagina.locator('#lora-corte').isHidden()), 'clique no mapa vazio deveria tirar a seleção e esconder o corte');
    const a2 = await telaDoPonto(idA);
    const b2 = await telaDoPonto(idB);
    await pagina.mouse.click(a2.x + (b2.x - a2.x) * 0.25, a2.y + (b2.y - a2.y) * 0.25);
    conferir((await lora()).selecao?.tipo === 'enlace', 'clique na linha deveria selecionar o enlace');
    const corte = pagina.locator('#lora-corte');
    conferir(await corte.isVisible(), 'com o enlace selecionado, o corte do terreno aparece');
    for (const parte of ['.corte-terreno', '.corte-linha', '.corte-fresnel-60', '.corte-fresnel-contorno', '.corte-pior', '.corte-antena']) {
      conferir((await corte.locator(parte).count()) >= 1, `o corte do terreno deveria desenhar ${parte}`);
    }
    const textoDoCorte = await corte.textContent();
    conferir(['Ponto 1', 'Ponto 2', 'km', 'Zona de Fresnel', 'fecha com folga', 'antena a 6 m'].every((t) => textoDoCorte.includes(t)), `o corte deveria ter nomes, eixos, legenda e veredito: "${textoDoCorte}"`);
    await captura('105-lora-enlace-com-folga');

    // O ponteiro sobre o corte mostra distância, altitude e folga, e marca o lugar no mapa.
    let g = await corte.locator('.lora-corte-grafico').boundingBox();
    await pagina.mouse.move(g.x + g.width * 0.45, g.y + g.height * 0.6);
    const leitura = await corte.locator('.lora-corte-leitura').textContent();
    conferir(leitura.includes('km de Ponto 1') && leitura.includes('de altitude') && leitura.includes('Folga de'), `a leitura do ponteiro deveria ter distância, altitude e folga: "${leitura}"`);
    conferir(await pagina.locator('#lora-mapa .lora-marca-caminho').isVisible(), 'o lugar do ponteiro deveria aparecer marcado no mapa');
    await captura('106-lora-ponteiro-no-corte');

    // Arrastar o ponto 2 para trás da serra: o enlace recalcula e deixa de fechar. O arraste é um passo só de desfazer.
    const antes = (await lora()).projeto.pontos[1];
    const de = await telaDoPonto(idB);
    const para = await tela(LUGARES.atrasDaSerra);
    await pagina.mouse.move(de.x, de.y);
    await pagina.mouse.down();
    await pagina.mouse.move((de.x + para.x) / 2, (de.y + para.y) / 2, { steps: 6 });
    await pagina.mouse.move(para.x, para.y, { steps: 6 });
    await pagina.mouse.up();
    e = await lora();
    conferir(Math.abs(e.projeto.pontos[1].lat - LUGARES.atrasDaSerra.lat) < 0.003 && Math.abs(e.projeto.pontos[1].lon - LUGARES.atrasDaSerra.lon) < 0.003, `o arraste deveria levar o ponto ao lugar novo: ${JSON.stringify(e.projeto.pontos[1])}`);
    conferir(e.selecao?.tipo === 'enlace', 'arrastar a ponta do enlace selecionado mantém o enlace selecionado');
    s = await esperarSituacao('pronto');
    conferir(s.veredito === 'nao-fecha' && !s.zonaLivre && s.folgaDb < 0, `com a serra no caminho o enlace não deveria fechar: ${JSON.stringify(s)}`);
    conferir((await rotulo.textContent()).includes('não fecha') && (await corte.textContent()).includes('corta a linha'), 'o mapa e o corte deveriam dizer que o enlace não fecha e onde o terreno corta a linha');
    g = await corte.locator('.lora-corte-grafico').boundingBox();
    await pagina.mouse.move(g.x + g.width * 0.62, g.y + g.height * 0.6);
    await captura('107-lora-enlace-nao-fecha');
    await pagina.mouse.move(g.x + g.width * 0.5, g.y - 200);
    await pagina.keyboard.press('Control+z');
    e = await lora();
    conferir(e.projeto.pontos[1].lat === antes.lat && e.projeto.pontos[1].lon === antes.lon, 'um Ctrl+Z só deveria devolver o ponto arrastado ao lugar de antes');
    s = await esperarSituacao('pronto');
    conferir(s.veredito === 'folga', `desfeito o arraste, o enlace volta a fechar com folga: ${JSON.stringify(s)}`);

    // "Novo repetidor": desenho diferente do da casa. Delete apaga o ponto selecionado.
    await pagina.locator('#lora-novo-repetidor').click();
    p = await tela(LUGARES.centro);
    await pagina.mouse.click(p.x, p.y);
    e = await lora();
    conferir(e.projeto.pontos.length === 3 && e.projeto.pontos[2].tipo === 'repetidor' && e.selecao?.tipo === 'ponto', 'o clique deveria criar um repetidor e selecioná-lo');
    conferir((await pagina.locator('#lora-mapa .lora-ponto[data-tipo="repetidor"]').count()) === 1, 'o repetidor deveria ter o desenho próprio');
    await captura('108-lora-repetidor');
    await pagina.keyboard.press('Delete');
    e = await lora();
    conferir(e.projeto.pontos.length === 2 && e.projeto.enlaces.length === 1, 'Delete deveria apagar o repetidor selecionado, e só ele');

    // Relevo que não baixa: o corte mostra o erro e "Tentar de novo" refaz a conta. O ponto vai para longe, onde nenhum bloco foi baixado.
    const errosAntes = erros.length;
    pedidos.relevoFalha = true;
    await pagina.evaluate((id) => window.__lora.acoes.alterarPonto(id, { lat: -10.7, lon: -50.6 }), idB);
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idA, idB]);
    s = await esperarSituacao('erro');
    conferir(s.mensagem.includes('bloco de relevo'), `a falha do relevo deveria ter mensagem clara: ${JSON.stringify(s)}`);
    conferir((await corte.locator('.lora-corte-situacao').textContent()).includes('bloco de relevo') && (await corte.locator('#lora-corte-tentar').isVisible()), 'o corte deveria mostrar o erro e o botão "Tentar de novo"');
    conferir((await rotulo.textContent()).includes('sem relevo'), 'o rótulo do enlace deveria dizer que falta o relevo');
    await pagina.locator('#lora-enquadrar').click();
    await mapaParado();
    await captura('109-lora-erro-de-relevo');
    pedidos.relevoFalha = false;
    await esperar(300);
    // Os erros de rede deste trecho são os provocados de propósito (resposta 503 do relevo); qualquer outro continua valendo.
    const provocados = erros.splice(errosAntes);
    erros.push(...provocados.filter((x) => !x.includes('503')));
    await pagina.locator('#lora-corte-tentar').click();
    s = await esperarSituacao('pronto');
    conferir(await corte.locator('.corte-terreno').isVisible(), 'depois de "Tentar de novo" o corte do terreno deveria aparecer');
    await pagina.keyboard.press('Control+z');
    s = await esperarSituacao('pronto');
    conferir(s.veredito === 'folga', 'desfazer a mudança de lugar devolve o enlace com folga');

    // Delete com o enlace selecionado apaga só o enlace; com um ponto selecionado, apaga o ponto.
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idA, idB]);
    await pagina.keyboard.press('Delete');
    e = await lora();
    conferir(e.projeto.enlaces.length === 0 && e.projeto.pontos.length === 2, 'Delete com o enlace selecionado deveria apagar só o enlace');
    conferir((await pagina.locator('#lora-mapa .lora-enlace').count()) === 0 && (await corte.isHidden()), 'sem enlace, a linha e o corte somem');
    await pagina.locator('#lora-enquadrar').click();
    await mapaParado();
    const fim = await telaDoPonto(idB);
    await pagina.mouse.click(fim.x, fim.y);
    conferir((await lora()).selecao?.id === idB, 'clique no ponto deveria selecioná-lo');
    await pagina.keyboard.press('Delete');
    e = await lora();
    conferir(e.projeto.pontos.length === 1 && e.projeto.pontos[0].id === idA, 'Delete deveria apagar o ponto selecionado');
    await captura('110-lora-ponto-apagado');

    // Privacidade: só os dois serviços interceptados foram chamados, e os dois foram mesmo usados.
    conferir(pedidos.outros.length === 0, `nenhum pedido deveria sair para outro endereço: ${pedidos.outros.join(', ')}`);
    conferir(pedidos.mapa > 0 && pedidos.relevo > 0, `o mapa e o relevo deveriam ter pedido blocos: ${pedidos.mapa} e ${pedidos.relevo}`);
  }

  // Rotas com vários saltos e "Sugerir ponto de repetidor" (especificacao/lora.md, seção 4.9), no mesmo terreno inventado:
  // uma casa no alto de um morro e outra atrás da serra. O enlace direto não fecha; o alto da serra enxerga as duas.
  // Os números da tela são comparados com os do cálculo, lidos por `window.__lora`; nenhum valor de rádio é fixado aqui.
  async function verificarLoraRede(lora, pedidos) {
    const MENOS = '−';
    const br = (n, casas) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    /** Como a tela escreve uma folga: "+12,3 dB", com o sinal de menos de verdade. */
    const dbBr = (n) => `${Number(Math.abs(n).toFixed(1)) === 0 ? '' : n < 0 ? MENOS : '+'}${br(Math.abs(n), 1)} dB`;
    const kmBr = (km) => (km < 1 ? `${br(km * 1000, 0)} m` : `${br(km, km < 10 ? 2 : 1)} km`);
    const PALAVRAS = { folga: 'fecha com folga', limite: 'fecha no limite', 'nao-fecha': 'não fecha' };
    const POSTO = { folga: 0, limite: 1, 'nao-fecha': 2 };
    const pior = (...v) => v.reduce((a, b) => (POSTO[a] >= POSTO[b] ? a : b));

    const busca = () => pagina.evaluate(() => JSON.parse(JSON.stringify(window.__lora.busca())));
    const rota = (de, para) => pagina.evaluate(([a, b]) => JSON.parse(JSON.stringify(window.__lora.rotaEntre(a, b))), [de, para]);
    const enlace = (de, para) =>
      pagina.evaluate(([a, b]) => {
        const s = window.__lora.situacaoDoEnlace(a, b);
        return s?.estado === 'pronto' ? { estado: 'pronto', veredito: s.resultado.veredito, folgaDb: s.resultado.conta.folgaDb, km: s.resultado.geometria.distanciaKm } : s;
      }, [de, para]);
    const enlacesProntos = () =>
      pagina.waitForFunction(() => window.__lora.estado().projeto.enlaces.every((e) => window.__lora.situacaoDoEnlace(e.de, e.para)?.estado === 'pronto'), null, { timeout: 60000 });
    /** Espera a busca chegar ao estado e o mapa parar: quando as sugestões não cabem na tela, o mapa se enquadra com animação. */
    const buscaEm = async (estado) => {
      await pagina.waitForFunction((alvo) => window.__lora.busca().estado === alvo, estado, { timeout: 60000 });
      const ler = () => pagina.evaluate(() => JSON.stringify([window.__lora.mapa.centro(), window.__lora.mapa.zoom()]));
      let anterior = await ler();
      for (let i = 0; i < 50; i++) {
        await esperar(200);
        const agora = await ler();
        if (agora === anterior) return;
        anterior = agora;
      }
      throw new Error('O mapa não parou de se mexer.');
    };
    const telaDoPonto = (id) => pagina.evaluate((i) => window.__lora.telaDoPonto(i), id);
    const cliqueNoPonto = async (id) => {
      const t = await telaDoPonto(id);
      await pagina.mouse.click(t.x, t.y);
    };
    const meioDe = async (seletor) => {
      const c = await pagina.locator(seletor).boundingBox();
      return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    };
    const recarregar = async () => {
      await esperar(600); // o projeto é gravado com um pequeno atraso
      await pagina.reload();
      await pagina.waitForFunction(() => window.__lora && window.__lora.pronto === true, null, { timeout: 30000 });
      await esperar(500);
    };
    const painel = pagina.locator('#lora-busca');
    const marcadores = pagina.locator('#lora-mapa .lora-sugestao');
    const rotas = pagina.locator('#lora-rotas');

    // Um projeto novo com duas casas ligadas: o enlace direto não fecha, e a seção de rotas diz isso.
    const [idA, idB] = await pagina.evaluate(
      ([a, b]) => {
        const ac = window.__lora.acoes;
        ac.criarProjeto('Rede com repetidor', 'vazio');
        const x = ac.adicionarPonto(a.lat, a.lon, 'casa', 'Casa do morro');
        const y = ac.adicionarPonto(b.lat, b.lon, 'casa', 'Casa do vale');
        ac.ligar(x, y);
        return [x, y];
      },
      [LUGARES.morroA, LUGARES.atrasDaSerra],
    );
    await enlacesProntos();
    const direto = await enlace(idA, idB);
    conferir(direto.veredito === 'nao-fecha', `com a serra no meio, o enlace direto não deveria fechar: ${JSON.stringify(direto)}`);
    let r = await rota(idA, idB);
    conferir(r.rota && r.rota.pontosNoMeio === 0 && r.rota.veredito === 'nao-fecha', `a rota deveria ser a ligação direta, que não fecha: ${JSON.stringify(r)}`);
    let texto = await rotas.textContent();
    conferir(texto.includes('Rota é o caminho') && texto.includes('salto'), 'a seção de rotas deveria explicar o que é rota e o que é salto');
    conferir(texto.includes('Casa do morro ↔ Casa do vale') && texto.includes('não fecha') && texto.includes(`A ligação direta não fecha: folga ${dbBr(direto.folgaDb)}`), `a rota direta deveria aparecer com a folga do cálculo: "${texto}"`);
    conferir((await pagina.locator('#lora-direita').textContent()).includes('ligação direta entre dois rádios'), 'o resumo deveria dizer que cada linha é uma ligação direta entre dois rádios');

    // Busca com o relevo ainda baixando: barra de andamento, texto e botão de cancelar. O resultado da busca cancelada é ignorado.
    pedidos.relevoEmEspera = true;
    await recarregar();
    await pagina.locator('#lora-sugerir').click();
    let b = await busca();
    conferir(b.estado === 'buscando' && b.de === idA && b.para === idB, `com dois pontos só, "Sugerir ponto de repetidor" deveria começar a busca entre eles: ${JSON.stringify(b)}`);
    texto = await painel.textContent();
    conferir(texto.includes('Baixando o relevo da região e procurando lugares altos…') && texto.includes('Casa do morro') && texto.includes('Casa do vale'), `o painel deveria dizer o que a busca está fazendo: "${texto}"`);
    conferir((await painel.locator('progress').count()) === 1 && (await painel.locator('#lora-busca-fechar').textContent()) === 'Cancelar a busca', 'a busca deveria ter barra de andamento e botão de cancelar');
    await captura('111-lora-busca-em-andamento');
    await painel.locator('#lora-busca-fechar').click();
    conferir((await busca()).estado === 'parada' && (await painel.isHidden()), 'cancelar deveria fechar o painel da busca');
    pedidos.relevoEmEspera = false;
    await enlacesProntos();
    await esperar(1500);
    conferir((await busca()).estado === 'parada' && (await marcadores.count()) === 0, 'o resultado de uma busca cancelada não deveria aparecer');

    // Com o mouse: seleciona o enlace que não fecha e pede a busca pelo botão do painel do enlace.
    const a = await telaDoPonto(idA);
    const z = await telaDoPonto(idB);
    await pagina.mouse.click(a.x + (z.x - a.x) * 0.25, a.y + (z.y - a.y) * 0.25);
    conferir((await lora()).selecao?.tipo === 'enlace', 'clique na linha deveria selecionar o enlace');
    const pedir = pagina.locator('#lora-enlace-sugerir');
    conferir((await pedir.textContent()) === 'Procurar lugar para um repetidor entre estes pontos', 'o painel do enlace que não fecha deveria oferecer a busca de repetidor');
    conferir((await pagina.locator('#lora-direita .lora-explica').textContent()).includes('não amplifica'), 'o painel do enlace deveria dizer que o repetidor não amplifica');
    await pedir.click();
    await buscaEm('pronta');
    b = await busca();
    const sugestoes = b.sugestoes;
    conferir(sugestoes.length >= 2 && sugestoes.length <= 5, `a busca deveria devolver de 2 a 5 lugares neste terreno: ${sugestoes.length}`);
    conferir(sugestoes.some((s) => s.veredito !== 'nao-fecha'), `no alto da serra, algum lugar deveria fechar com as duas casas: ${JSON.stringify(sugestoes.map((s) => s.veredito))}`);
    conferir((await marcadores.count()) === sugestoes.length, `o mapa deveria ter um marcador por sugestão: ${await marcadores.count()}`);
    const areaDoMapa = await pagina.locator('#lora-mapa').boundingBox();
    for (const s of sugestoes) {
      const t = await pagina.evaluate(([lat, lon]) => window.__lora.mapa.telaDe(lat, lon), [s.lat, s.lon]);
      conferir(t.x > areaDoMapa.x && t.x < areaDoMapa.x + areaDoMapa.width && t.y > areaDoMapa.y + 40 && t.y < areaDoMapa.y + areaDoMapa.height, `as sugestões deveriam ficar à vista no mapa: ${JSON.stringify(t)}`);
    }
    conferir((await painel.boundingBox()).y < 120, 'o painel das sugestões deveria ir para o alto da coluna da direita');
    conferir((await marcadores.allTextContents()).join('') === sugestoes.map((_, i) => i + 1).join(''), 'os marcadores deveriam ser numerados');
    const itens = painel.locator('.lora-sugestao-item');
    conferir((await itens.count()) === sugestoes.length, 'a lista deveria ter um item por sugestão');
    for (let i = 0; i < sugestoes.length; i++) {
      const s = sugestoes[i];
      conferir(s.veredito === pior(s.trechoA.veredito, s.trechoB.veredito), `o veredito da sugestão ${i + 1} deveria ser o do pior trecho`);
      const item = await itens.nth(i).textContent();
      const esperados = [
        `Lugar ${i + 1}: ${PALAVRAS[s.veredito][0].toUpperCase()}${PALAVRAS[s.veredito].slice(1)}`,
        `terreno a ${br(s.altM, 0)} m`,
        `Casa do morro ↔ repetidor: ${kmBr(s.trechoA.distanciaKm)}, folga ${dbBr(s.trechoA.folgaDb)} ${PALAVRAS[s.trechoA.veredito]}`,
        `Casa do vale ↔ repetidor: ${kmBr(s.trechoB.distanciaKm)}, folga ${dbBr(s.trechoB.folgaDb)} ${PALAVRAS[s.trechoB.veredito]}`,
        'Pôr um repetidor aqui',
      ];
      for (const t of esperados) conferir(item.includes(t), `o item ${i + 1} da lista deveria ter "${t}": "${item}"`);
    }
    texto = await painel.textContent();
    conferir(texto.includes('A sugestão só olha o relevo: procura terreno alto com boa ligação para os dois lados. Não sabe se o lugar tem acesso, dono, energia ou autorização.'), 'o aviso do limite da sugestão deveria aparecer sempre');
    conferir(texto.includes('nenhum rádio foi posto ainda') && texto.includes('não amplifica'), 'o painel deveria dizer que as sugestões não são rádios e que o repetidor não amplifica');
    conferir((await lora()).projeto.pontos.length === 2, 'a busca não deveria criar ponto nenhum');
    await pagina.mouse.move(a.x + 200, a.y + 40);
    await captura('112-lora-sugestoes-de-repetidor');

    // O ponteiro em um item da lista destaca o marcador e mostra os dois enlaces que ele teria; no marcador, destaca o item.
    let p = await meioDe('#lora-busca .lora-sugestao-item[data-indice="0"] .lora-sugestao-topo');
    await pagina.mouse.move(p.x, p.y);
    conferir(await marcadores.nth(0).evaluate((m) => m.classList.contains('destaque')), 'o ponteiro no item 1 deveria destacar o marcador 1');
    conferir((await pagina.locator('#lora-mapa .lora-sugestao-linha[visibility="visible"]').count()) === 2, 'o destaque deveria mostrar os dois enlaces da sugestão');
    await captura('113-lora-sugestao-em-destaque');
    p = await meioDe('#lora-mapa .lora-sugestao[data-indice="1"] .lora-sugestao-desenho');
    await pagina.mouse.move(p.x, p.y);
    conferir(await itens.nth(1).evaluate((m) => m.classList.contains('destaque')), 'o ponteiro no marcador 2 deveria destacar o item 2 da lista');
    conferir(!(await itens.nth(0).evaluate((m) => m.classList.contains('destaque'))), 'só um item fica em destaque');

    // "Pôr um repetidor aqui": cria o repetidor, liga às duas casas, mantém o enlace direto e apaga as sugestões.
    const antesDePor = JSON.stringify((await lora()).projeto);
    const s0 = sugestoes[0];
    await itens.nth(0).locator('.lora-sugestao-por').click();
    let e = await lora();
    const rep = e.projeto.pontos[2];
    conferir(e.projeto.pontos.length === 3 && rep.tipo === 'repetidor' && rep.lat === s0.lat && rep.lon === s0.lon, `o repetidor deveria nascer no lugar da sugestão: ${JSON.stringify(rep)}`);
    conferir(e.projeto.enlaces.length === 3, `o repetidor deveria ser ligado às duas casas, e o enlace direto mantido: ${JSON.stringify(e.projeto.enlaces)}`);
    conferir((await busca()).estado === 'parada' && (await marcadores.count()) === 0 && (await painel.isHidden()), 'as sugestões deveriam sumir depois de pôr o repetidor');
    await enlacesProntos();
    const tA = await enlace(idA, rep.id);
    const tB = await enlace(idB, rep.id);
    conferir(Math.abs(tA.folgaDb - s0.trechoA.folgaDb) < 1e-6 && tA.veredito === s0.trechoA.veredito, `o enlace da casa do morro ao repetidor deveria dar o que a sugestão previu: ${JSON.stringify([tA, s0.trechoA])}`);
    conferir(Math.abs(tB.folgaDb - s0.trechoB.folgaDb) < 1e-6 && tB.veredito === s0.trechoB.veredito, `o enlace da casa do vale ao repetidor deveria dar o que a sugestão previu: ${JSON.stringify([tB, s0.trechoB])}`);

    // A seção de rotas mostra a rota pelo repetidor, com o veredito e a folga do trecho mais fraco.
    r = await rota(idA, idB);
    conferir(r.rota && r.rota.pontos.join() === [idA, rep.id, idB].join() && r.rota.pontosNoMeio === 1, `a rota deveria passar pelo repetidor: ${JSON.stringify(r)}`);
    conferir(r.rota.veredito === pior(tA.veredito, tB.veredito) && Math.abs(r.rota.folgaDb - Math.min(tA.folgaDb, tB.folgaDb)) < 1e-9, `a rota vale o que vale o pior trecho: ${JSON.stringify(r.rota)}`);
    const fraco = tA.folgaDb <= tB.folgaDb ? 'Casa do morro ↔ Repetidor 1' : 'Repetidor 1 ↔ Casa do vale';
    texto = await rotas.locator('.lora-rota').textContent();
    for (const t of [PALAVRAS[r.rota.veredito], 'Casa do morro → Repetidor 1 → Casa do vale', 'Passa por 1 rádio no meio', `Trecho mais fraco: ${fraco}, folga ${dbBr(r.rota.folgaDb)}`]) {
      conferir(texto.includes(t), `a rota pelo repetidor deveria ter "${t}": "${texto}"`);
    }
    await captura('114-lora-rota-pelo-repetidor');

    // Clicar na rota destaca os trechos dela no mapa; clicar de novo, ou no mapa vazio, tira o destaque.
    const naRota = pagina.locator('#lora-mapa .lora-enlace.na-rota');
    await rotas.locator('button.lora-rota').click();
    conferir((await naRota.count()) === 2 && (await rotas.locator('button.lora-rota').getAttribute('aria-pressed')) === 'true', 'clicar na rota deveria destacar os dois trechos dela');
    conferir((await pagina.locator(`#lora-mapa .lora-enlace[data-de="${idA}"][data-para="${idB}"].na-rota`).count()) === 0, 'o enlace direto, que não é da rota, não fica em destaque');
    await captura('115-lora-rota-em-destaque');
    await rotas.locator('button.lora-rota').click();
    conferir((await naRota.count()) === 0, 'clicar de novo na rota deveria tirar o destaque');
    await rotas.locator('button.lora-rota').click();
    p = await pagina.evaluate(([lat, lon]) => window.__lora.mapa.telaDe(lat, lon), [LUGARES.morroB.lat, LUGARES.morroB.lon]);
    await pagina.mouse.click(p.x, p.y);
    conferir((await naRota.count()) === 0, 'clicar no mapa vazio deveria tirar o destaque da rota');

    // O painel do repetidor explica o que ele é e diz de que rota participa; a dica de "Novo repetidor" também explica.
    await cliqueNoPonto(rep.id);
    conferir((await lora()).selecao?.id === rep.id, 'clique no repetidor deveria selecioná-lo');
    texto = await pagina.locator('#lora-explica-repetidor').textContent();
    conferir(['rádio igual aos outros', 'lugar alto', 'não amplifica', 'recebe a mensagem inteira e transmite de novo', 'os dois lados'].every((t) => texto.includes(t)), `o painel do repetidor deveria explicar o que ele é: "${texto}"`);
    conferir((await pagina.locator('#lora-direita .lora-nas-rotas').textContent()).includes('Casa do morro → Repetidor 1 → Casa do vale'), 'o painel do ponto deveria dizer de que rota ele participa');
    await captura('116-lora-painel-do-repetidor');

    // Repetidor solar (seção 4.10): a faixa padrão, um ajuste pelo campo e a volta com desfazer.
    conferir(await pagina.locator('#lora-solar').isVisible(), 'o painel do repetidor deveria mostrar a seção do repetidor solar');
    texto = await pagina.locator('#lora-solar-resultado').textContent();
    conferir(
      ['de 0,44 a 3,6 Wh por dia', 'de 0,14 a 1,1 W', 'de 1,5 a 11,8 Wh', 'de 400 a 3.200 mAh', '3 dias sem sol'].every((t) => texto.includes(t)),
      `a faixa padrão do repetidor solar deveria aparecer: "${texto}"`,
    );
    conferir((await pagina.locator('#lora-solar').textContent()).includes('estimativa'), 'a seção deveria dizer que o consumo é uma estimativa');
    await pagina.locator('#lora-solar').scrollIntoViewIfNeeded();
    await captura('120-lora-repetidor-solar');
    const campoMin = pagina.locator('#lora-solar [data-solar="consumoMinMa"]');
    const campoMax = pagina.locator('#lora-solar [data-solar="consumoMaxMa"]');
    await campoMin.fill('20');
    await campoMin.press('Tab');
    await campoMax.fill('20');
    await campoMax.press('Tab');
    texto = await pagina.locator('#lora-solar-resultado').textContent();
    conferir(texto.includes('1,8 Wh por dia') && !texto.includes('de 0,44'), `com 20 mA nos dois campos o resultado deveria ser um valor só: "${texto}"`);
    conferir((await lora()).projeto.repetidorSolar?.consumoMinMa === 20, 'o ajuste do repetidor solar deveria ficar no projeto');
    await pagina.evaluate(() => {
      window.__lora.acoes.desfazer();
      window.__lora.acoes.desfazer();
    });
    conferir((await lora()).projeto.repetidorSolar === undefined, 'desfazer deveria voltar aos ajustes padrão do repetidor solar');
    // Uma casa não mostra a seção.
    await cliqueNoPonto((await lora()).projeto.pontos.find((p) => p.tipo === 'casa').id);
    conferir(await pagina.locator('#lora-solar').count() === 0 || await pagina.locator('#lora-solar').isHidden(), 'uma casa não deveria mostrar a seção do repetidor solar');
    await cliqueNoPonto(rep.id);

    await pagina.locator('#lora-novo-repetidor').click();
    texto = await pagina.locator('#lora-dica').textContent();
    conferir(texto.includes('não amplifica') && texto.includes('lugar alto') && texto.includes('dois lados'), `a dica de "Novo repetidor" deveria explicar o repetidor: "${texto}"`);
    await pagina.keyboard.press('Escape');
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idA, rep.id]);
    conferir((await pagina.locator('#lora-direita .lora-nas-rotas').textContent()).includes('passa por este enlace'), 'o painel do enlace deveria dizer de que rota ele participa');
    await pagina.evaluate(() => window.__lora.acoes.selecionar(null));

    // Desfazer volta tudo. Hoje são três passos (cada enlace e o ponto); com uma ação única no estado, bastará um.
    let passos = 0;
    while (passos < 1 && JSON.stringify((await lora()).projeto) !== antesDePor) {
      await pagina.keyboard.press('Control+z');
      passos += 1;
    }
    conferir(JSON.stringify((await lora()).projeto) === antesDePor, 'desfazer deveria devolver o projeto ao que era antes de pôr o repetidor');
    await enlacesProntos();
    r = await rota(idA, idB);
    conferir(r.rota && r.rota.pontosNoMeio === 0 && r.rota.veredito === 'nao-fecha', 'desfeito o repetidor, a rota volta a ser a ligação direta, que não fecha');

    // Limite de saltos: dois repetidores em série e limite 1. A tela diz quantos rádios no meio seriam precisos e onde mudar.
    const [idR1, idR2] = await pagina.evaluate(
      ([x, y, s]) => {
        const ac = window.__lora.acoes;
        const fim = window.__lora.estado().projeto.pontos.find((q) => q.id === y);
        const r1 = ac.adicionarPonto(s.lat, s.lon, 'repetidor');
        const r2 = ac.adicionarPonto((s.lat + fim.lat) / 2, (s.lon + fim.lon) / 2, 'repetidor');
        ac.ligar(x, r1);
        ac.ligar(r1, r2);
        ac.ligar(r2, y);
        ac.desligar(x, y);
        return [r1, r2];
      },
      [idA, idB, s0],
    );
    const saltos = pagina.locator('#lora-direita input[aria-label="Limite de saltos"]');
    await saltos.fill('1');
    await saltos.press('Tab');
    conferir((await lora()).projeto.limiteDeSaltos === 1, 'o limite de saltos deveria ser 1');
    await enlacesProntos();
    r = await rota(idA, idB);
    conferir(r.rota === null && r.motivo === 'limite' && r.pontosNoMeio === 2, `com limite 1 e dois repetidores em série, a rota passa do limite: ${JSON.stringify(r)}`);
    texto = await rotas.locator('.lora-rota').textContent();
    for (const t of ['passa do limite de saltos', 'precisa de 2 rádios no meio', 'o limite de saltos deste projeto é 1', 'Configuração da rede']) {
      conferir(texto.includes(t), `a rota que passa do limite deveria ter "${t}": "${texto}"`);
    }
    conferir((await rotas.locator('button.lora-rota').count()) === 0, 'sem rota, não há o que destacar no mapa');
    await captura('117-lora-limite-de-saltos');
    await saltos.fill('2');
    await saltos.press('Tab');
    r = await rota(idA, idB);
    const tres = [await enlace(idA, idR1), await enlace(idR1, idR2), await enlace(idR2, idB)];
    conferir(r.rota && r.rota.pontosNoMeio === 2 && r.rota.veredito === pior(...tres.map((t) => t.veredito)) && Math.abs(r.rota.folgaDb - Math.min(...tres.map((t) => t.folgaDb))) < 1e-9, `com limite 2, a rota passa pelos dois repetidores: ${JSON.stringify([r, tres])}`);
    texto = await rotas.locator('.lora-rota').textContent();
    conferir(texto.includes('Casa do morro → Repetidor 1 → Repetidor 2 → Casa do vale') && texto.includes('2 rádios no meio') && texto.includes(PALAVRAS[r.rota.veredito]) && texto.includes(dbBr(r.rota.folgaDb)), `a rota com dois saltos deveria aparecer por nome: "${texto}"`);

    // Sem ligação: apagado o enlace entre os repetidores, não há caminho entre as casas.
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idR1, idR2]);
    await pagina.keyboard.press('Delete');
    r = await rota(idA, idB);
    conferir(r.rota === null && r.motivo === 'sem-ligacao', `sem o enlace do meio, não há rota: ${JSON.stringify(r)}`);
    texto = await rotas.locator('.lora-rota').textContent();
    conferir(texto.includes('sem ligação') && texto.includes("Não há ligação desenhada entre estas casas. Use 'Ligar dois pontos' ou 'Sugerir ponto de repetidor'."), `a tela deveria dizer que não há ligação: "${texto}"`);
    await captura('118-lora-sem-ligacao');

    // A ferramenta da barra, sem enlace selecionado: pede dois pontos, como "Ligar dois pontos"; Esc cancela.
    const pressionado = async () => (await pagina.locator('#lora-sugerir').getAttribute('aria-pressed')) === 'true';
    await pagina.locator('#lora-sugerir').click();
    conferir((await pressionado()) && (await pagina.locator('#lora-dica').textContent()).includes('Clique nos dois pontos'), 'a ferramenta deveria pedir os dois pontos');
    await cliqueNoPonto(idA);
    conferir((await pagina.locator('#lora-dica').textContent()).includes('Casa do morro'), 'a dica deveria dizer que falta a outra ponta');
    await pagina.keyboard.press('Escape');
    conferir(!(await pressionado()) && (await busca()).estado === 'parada', 'Esc deveria cancelar a escolha dos pontos');
    await pagina.locator('#lora-sugerir').click();
    await cliqueNoPonto(idA);
    await cliqueNoPonto(idB);
    await buscaEm('pronta');
    b = await busca();
    conferir(b.de === idA && b.para === idB && JSON.stringify(b.sugestoes) === JSON.stringify(sugestoes), 'a busca entre os mesmos dois pontos deveria dar as mesmas sugestões');
    conferir((await lora()).selecao === null && !(await pressionado()), 'a busca não muda a seleção, e a ferramenta desliga');

    // As sugestões somem quando um dos dois pontos muda e com o botão "Fechar sugestões".
    await pagina.evaluate((id) => window.__lora.acoes.alterarPonto(id, { alturaDaAntenaM: 12 }), idB);
    conferir((await busca()).estado === 'parada' && (await marcadores.count()) === 0, 'mudar um dos pontos da busca deveria apagar as sugestões');
    await pagina.keyboard.press('Control+z');
    await pagina.locator('#lora-sugerir').click();
    await cliqueNoPonto(idA);
    await cliqueNoPonto(idB);
    await buscaEm('pronta');
    conferir((await painel.locator('#lora-busca-fechar').textContent()) === 'Fechar sugestões', 'o painel deveria ter o botão "Fechar sugestões"');
    await painel.locator('#lora-busca-fechar').click();
    conferir((await busca()).estado === 'parada' && (await marcadores.count()) === 0 && (await painel.isHidden()), '"Fechar sugestões" deveria tirar as sugestões do mapa e fechar o painel');

    // Relevo que não baixa: a busca diz o que houve e "Tentar de novo" refaz.
    const errosAntes = erros.length;
    pedidos.relevoFalha = true;
    await recarregar();
    await pagina.locator('#lora-sugerir').click();
    await cliqueNoPonto(idA);
    await cliqueNoPonto(idB);
    await buscaEm('erro');
    texto = await painel.textContent();
    conferir(texto.includes('A busca não pôde ser feita') && texto.includes('bloco de relevo') && (await painel.locator('#lora-busca-tentar').isVisible()), `a falha do relevo deveria ter mensagem clara e "Tentar de novo": "${texto}"`);
    conferir((await rotas.locator('.lora-rota').textContent()).includes('sem resultado'), 'com enlace sem relevo, a rota deveria dizer que está sem resultado, e não que falta ligação');
    await captura('119-lora-busca-sem-relevo');
    pedidos.relevoFalha = false;
    await esperar(300);
    // Os erros de rede deste trecho são os provocados de propósito (resposta 503 do relevo); qualquer outro continua valendo.
    const provocados = erros.splice(errosAntes);
    erros.push(...provocados.filter((x) => !x.includes('503')));
    await painel.locator('#lora-busca-tentar').click();
    await buscaEm('pronta');
    conferir(JSON.stringify((await busca()).sugestoes) === JSON.stringify(sugestoes), 'depois de "Tentar de novo", a busca deveria dar as mesmas sugestões');

    // Trocar de projeto apaga as sugestões.
    await pagina.evaluate(() => window.__lora.acoes.criarProjeto('Outra rede', 'copia'));
    conferir((await busca()).estado === 'parada' && (await marcadores.count()) === 0 && (await painel.isHidden()), 'trocar de projeto deveria apagar as sugestões');

    // Privacidade: a busca baixa blocos de relevo, e nada sai para outro endereço.
    conferir(pedidos.outros.length === 0, `nenhum pedido deveria sair para outro endereço: ${pedidos.outros.join(', ')}`);
  }

  // Aprender (tarefas L4.1 e L4.2): o cartão da primeira abertura, o tutorial "Meu primeiro enlace" cumprido de verdade com o
  // mouse (no cenário falso em que o enlace direto não fecha), o glossário, o "Por quê?" e as regras da Anatel.
  // Roda logo depois da página inicial, com o projeto vazio e nada lembrado. Em 1280 × 720, que é a janela mais apertada.
  // Termina com os projetos como estavam: o do tutorial é apagado e "Minha rede" continua aberta.
  async function verificarLoraAprender(pedidos) {
    const lora = () => pagina.evaluate(() => JSON.parse(JSON.stringify(window.__lora.estado())));
    const PALAVRAS = { folga: 'fecha com folga', limite: 'fecha no limite', 'nao-fecha': 'não fecha' };
    const visivel = (seletor) => pagina.locator(seletor).first().isVisible();
    const texto = async (seletor) => (await pagina.locator(seletor).first().textContent()) ?? '';
    const telaDoPonto = (id) => pagina.evaluate((i) => window.__lora.telaDoPonto(i), id);
    const telaDe = (c) => pagina.evaluate(([lat, lon]) => window.__lora.mapa.telaDe(lat, lon), [c.lat, c.lon]);
    const cliqueNoPonto = async (id) => {
      const t = await telaDoPonto(id);
      await pagina.mouse.click(t.x, t.y);
    };
    const enlacesProntos = () =>
      pagina.waitForFunction(() => window.__lora.estado().projeto.enlaces.every((e) => window.__lora.situacaoDoEnlace(e.de, e.para)?.estado === 'pronto'), null, { timeout: 60000 });
    const passo = () =>
      pagina.evaluate(() => {
        const p = document.querySelector('#lora-tutorial');
        return p && !p.hidden
          ? { id: p.dataset.passo ?? null, modo: p.dataset.modo ?? null, contagem: p.querySelector('.passo-contagem')?.textContent ?? '', titulo: p.querySelector('.passo-titulo')?.textContent ?? '', texto: p.querySelector('.lora-passo-texto')?.textContent ?? '' }
          : null;
      });
    const esperarPasso = async (id) => {
      try {
        await pagina.waitForFunction((alvo) => document.querySelector('#lora-tutorial')?.dataset.passo === alvo, id, { timeout: 15000 });
      } catch {
        throw new Error(`Conferência falhou: o passo da vez deveria ser "${id}" e é ${JSON.stringify(await passo())}`);
      }
    };
    const realcados = () => pagina.evaluate(() => [...document.querySelectorAll('.lora-realce')].map((b) => b.id));
    const continuar = () => pagina.locator('#lora-tutorial [data-acao="continuar"]').click();
    const projetos = () => pagina.evaluate(() => window.__lora.acoes.listarProjetos().map((p) => ({ id: p.id, nome: p.nome, atual: p.atual })));
    const sobreposto = (id) => pagina.locator(id).isVisible();
    const verTermoAberto = (id) => pagina.locator(`#lora-termo-${id}`).getAttribute('aria-expanded').catch(() => null);
    const termoAberto = async () => pagina.evaluate(() => [...document.querySelectorAll('#lora-painel-glossario .termo')].filter((a) => a.querySelector('.termo-titulo')?.getAttribute('aria-expanded') === 'true').map((a) => a.dataset.termo));
    const recarregar = async () => {
      await esperar(700); // o projeto é gravado com um pequeno atraso
      await pagina.reload();
      await pagina.waitForFunction(() => window.__lora && window.__lora.pronto === true, null, { timeout: 30000 });
      await esperar(500);
    };

    // ---------------------------------------------------------------- Barra do alto e primeira abertura (1280 × 720)
    await pagina.setViewportSize({ width: 1280, height: 720 });
    await esperar(400);
    const topo = await pagina.locator('#topo').boundingBox();
    conferir(topo.height <= 49, `a barra do alto do LoRa deveria ter uma linha só em 1280 px: ${topo.height} px`);
    conferir(await pagina.evaluate(() => document.querySelector('#topo').scrollWidth <= document.querySelector('#topo').clientWidth), 'a barra do alto não deveria passar da largura da janela');
    const botoesAprender = await pagina.locator('.lora-aprender button').allTextContents();
    conferir(botoesAprender.join('|') === 'Tutorial|Glossário|Regras da Anatel', `o grupo Aprender deveria ter os três botões: ${botoesAprender.join('|')}`);
    conferir((await lora()).projeto.pontos.length === 0, 'a primeira abertura é com o projeto vazio');

    const cartao = pagina.locator('#lora-primeira');
    const avisoMapa = pagina.locator('#lora-aviso-mapa');
    conferir((await cartao.isVisible()) && (await avisoMapa.isVisible()), 'o cartão da primeira abertura e o aviso de privacidade deveriam aparecer juntos');
    const bc = await cartao.boundingBox();
    const ba = await avisoMapa.boundingBox();
    const area = await pagina.locator('#lora-mapa-area').boundingBox();
    const semCruzar = bc.x >= ba.x + ba.width || ba.x >= bc.x + bc.width || bc.y >= ba.y + ba.height || ba.y >= bc.y + bc.height;
    conferir(semCruzar, `o cartão e o aviso de privacidade não podem se cobrir: ${JSON.stringify([bc, ba])}`);
    const dentro = (b) => b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height;
    conferir(dentro(bc) && dentro(ba), 'o cartão e o aviso deveriam caber na área do mapa');
    const textoDoCartao = await cartao.textContent();
    conferir(textoDoCartao.includes('Fazer o tutorial') && textoDoCartao.includes('Entendi') && textoDoCartao.includes('relevo'), `o cartão deveria explicar o ambiente e ter os dois botões: ${textoDoCartao}`);
    await captura('121-lora-primeira-abertura');

    // ---------------------------------------------------------------- Tutorial: começar
    const antes = await projetos();
    conferir(antes.length === 1 && antes[0].nome === 'Minha rede', `antes do tutorial só existe "Minha rede": ${JSON.stringify(antes)}`);
    await pagina.locator('#lora-primeira-tutorial').click();
    let e = await lora();
    conferir(e.projeto.nome === 'Tutorial: meu primeiro enlace' && e.projeto.pontos.length === 0, `começar o tutorial deveria abrir um projeto novo e vazio: ${e.projeto.nome}`);
    const lista = await projetos();
    conferir(lista.length === 2 && lista.some((p) => p.nome === 'Minha rede' && !p.atual), `o projeto de antes deveria continuar na lista: ${JSON.stringify(lista)}`);
    conferir(await cartao.isHidden(), 'com o tutorial em andamento, o cartão da primeira abertura some');
    await esperarPasso('o-que-e');
    let p = await passo();
    conferir(p.contagem.startsWith('Passo 1 de 13'), `o painel deveria dizer "Passo 1 de 13": ${p.contagem}`);
    conferir(p.titulo.includes('O que é LoRa'), `título do passo 1: ${p.titulo}`);
    conferir((await pagina.evaluate(() => getComputedStyle(document.querySelector('#lora-tutorial')).pointerEvents)) === 'none', 'o painel do tutorial não deveria capturar o ponteiro');
    conferir((await realcados()).length === 0, 'no passo de leitura nenhum botão da barra do mapa fica realçado');
    // Fica ao lado do aviso de privacidade, sem cobri-lo.
    const bt = await pagina.locator('#lora-tutorial').boundingBox();
    conferir(bt.x >= ba.x + ba.width || bt.y >= ba.y + ba.height, 'o painel do tutorial não pode cobrir o aviso de privacidade');
    await captura('122-lora-tutorial-passo-1');

    // ---------------------------------------------------------------- Os 13 passos, de verdade
    const a = LUGARES.morroA;
    const b = LUGARES.atrasDaSerra;
    await pagina.evaluate(([lat, lon]) => window.__lora.mapa.irPara(lat, lon, 9.5), [(a.lat + b.lat) / 2 - 0.05, (a.lon + b.lon) / 2]);
    await esperar(500);

    await continuar();
    await esperarPasso('primeiro-ponto');
    conferir((await realcados()).join() === 'lora-novo-ponto', `"Novo ponto" deveria estar realçado no passo 2: ${(await realcados()).join()}`);
    conferir((await pagina.evaluate(() => getComputedStyle(document.querySelector('#lora-novo-ponto')).animationName)) === 'lora-pulso', 'o realce deveria pulsar');
    await captura('123-lora-tutorial-realce');
    await pagina.locator('#lora-novo-ponto').click();
    let t = await telaDe(a);
    await pagina.mouse.click(t.x, t.y);
    await esperarPasso('segundo-ponto');
    conferir((await lora()).projeto.pontos.length === 1, 'o primeiro clique deveria criar o primeiro ponto');
    await pagina.locator('#lora-novo-ponto').click();
    t = await telaDe(b);
    await pagina.mouse.click(t.x, t.y);
    await esperarPasso('ligar');
    e = await lora();
    conferir(e.projeto.pontos.length === 2, 'o segundo clique deveria criar o segundo ponto');
    conferir((await realcados()).join() === 'lora-ligar', `"Ligar dois pontos" deveria estar realçado no passo 4: ${(await realcados()).join()}`);
    const [idA, idB] = e.projeto.pontos.map((x) => x.id);
    await pagina.locator('#lora-ligar').click();
    await cliqueNoPonto(idA);
    await cliqueNoPonto(idB);
    // Ligar já deixa o enlace selecionado: o passo 5 (abrir o enlace) fica feito assim que o cálculo termina.
    await pagina.waitForFunction(() => ['selecionar-enlace', 'ler-veredito'].includes(document.querySelector('#lora-tutorial')?.dataset.passo), null, { timeout: 15000 });
    conferir((await realcados()).length === 0, 'depois de ligar, nenhum botão fica realçado');
    conferir((await lora()).projeto.enlaces.length === 1, 'deveria haver um enlace');
    await enlacesProntos();
    await esperarPasso('ler-veredito');
    const veredito = await pagina.evaluate(([x, y]) => window.__lora.situacaoDoEnlace(x, y).resultado.veredito, [idA, idB]);
    conferir(veredito === 'nao-fecha', `no cenário falso o enlace direto deveria não fechar: ${veredito}`);
    p = await passo();
    conferir(p.texto.includes('"não fecha"') && p.texto.includes('Quase nunca falta potência'), `o texto do passo 6 deveria ser o de "não fecha": ${p.texto}`);
    conferir(p.contagem.startsWith('Passo 6 de 13'), p.contagem);
    await captura('124-lora-tutorial-veredito');
    // Recolher o painel deixa só a linha do passo, para cobrir menos do mapa.
    await pagina.locator('#lora-tutorial [data-acao="recolher"]').click();
    conferir((await pagina.locator('#lora-tutorial .lora-passo-texto').count()) === 0 && (await visivel('#lora-tutorial .passo-titulo')), 'recolhido, o painel deveria mostrar só o passo e o título');
    const recolhidoAlt = (await pagina.locator('#lora-tutorial').boundingBox()).height;
    await captura('139-lora-tutorial-recolhido');
    await pagina.locator('#lora-tutorial [data-acao="recolher"]').click();
    conferir((await pagina.locator('#lora-tutorial .lora-passo-texto').count()) === 1 && (await pagina.locator('#lora-tutorial').boundingBox()).height > recolhidoAlt + 40, 'aberto de novo, o painel deveria mostrar o texto do passo');

    // "Por quê?" do veredito, com termos clicáveis.
    await pagina.locator('#lora-direita .lora-veredito .lora-porque-botao').click();
    conferir(await sobreposto('#lora-painel-porque'), 'o "Por quê?" do veredito deveria abrir o painel');
    let porque = await texto('#lora-painel-porque .lora-porque-texto');
    conferir(porque.includes('abaixo da sensibilidade') && porque.includes('153 dB'), `texto do "Por quê?" do veredito: ${porque}`);
    conferir((await pagina.locator('#lora-painel-porque .etiqueta-termo').count()) === 4, 'o "Por quê?" deveria ter as etiquetas dos termos relacionados');
    await captura('125-lora-porque-do-veredito');
    await pagina.locator('#lora-painel-porque .etiqueta-termo[data-termo="sensibilidade"]').click();
    conferir((await sobreposto('#lora-painel-glossario')) && !(await sobreposto('#lora-painel-porque')), 'a etiqueta deveria abrir o glossário no lugar do "Por quê?"');
    conferir((await termoAberto()).join() === 'sensibilidade', `o glossário deveria abrir em "sensibilidade": ${(await termoAberto()).join()}`);
    await pagina.keyboard.press('Escape');
    conferir(!(await sobreposto('#lora-painel-glossario')), 'Esc deveria fechar o glossário');
    conferir((await passo()).id === 'ler-veredito', 'abrir o glossário não deveria mexer no passo da vez');

    await continuar();
    await esperarPasso('ler-corte');
    conferir(await pagina.locator('#lora-corte').isVisible(), 'o corte do terreno deveria estar à vista no passo 7');

    // "Por quê?" de uma melhoria de "O que mudar para fechar".
    const melhoria = pagina.locator('#lora-direita .lora-melhorias li').first();
    const rotuloDaMelhoria = await melhoria.locator('span').first().textContent();
    conferir(rotuloDaMelhoria.startsWith('Subir a antena'), `a primeira melhoria deveria ser subir a antena: ${rotuloDaMelhoria}`);
    await melhoria.locator('.lora-porque-botao').click();
    porque = await texto('#lora-painel-porque .lora-porque-texto');
    conferir(porque.includes('Antena mais alta levanta a linha'), `texto do "Por quê?" de subir a antena: ${porque}`);
    await captura('126-lora-porque-de-melhoria');
    await pagina.keyboard.press('Escape');

    await continuar();
    await esperarPasso('mudar-altura');
    await cliqueNoPonto(idA);
    conferir((await lora()).selecao?.tipo === 'ponto', 'o clique no ponto deveria selecioná-lo');
    conferir((await passo()).id === 'mudar-altura', 'selecionar o ponto não adianta o passo; o enlace do passo 5 continua feito');
    const campoAltura = pagina.locator('#lora-direita input[aria-label="Altura da antena (m)"]');
    await campoAltura.fill('15');
    await campoAltura.press('Tab');
    await esperarPasso('o-que-mudar');
    conferir((await lora()).projeto.pontos.find((x) => x.id === idA).alturaDaAntenaM === 15, 'a altura da antena deveria ter mudado para 15 m');
    p = await passo();
    conferir(p.texto.startsWith('A lista "o que mudar para fechar" mostra'), `o passo 9 deveria falar da lista (o enlace ainda não fecha com folga): ${p.texto}`);

    await continuar();
    await esperarPasso('repetidor');
    conferir((await realcados()).join() === 'lora-sugerir', `"Sugerir ponto de repetidor" deveria estar realçado no passo 10: ${(await realcados()).join()}`);
    p = await passo();
    conferir(p.texto.startsWith('Quando o caminho direto não fecha com folga'), `texto do passo 10: ${p.texto}`);
    await enlacesProntos();
    await pagina.locator('#lora-sugerir').click();
    await pagina.waitForFunction(() => window.__lora.busca().estado === 'pronta', null, { timeout: 60000 });
    await esperar(800);
    await captura('127-lora-tutorial-sugestoes');
    await pagina.locator('#lora-busca .lora-sugestao-por').first().click();
    await esperarPasso('ler-rota');
    e = await lora();
    const rep = e.projeto.pontos.find((x) => x.tipo === 'repetidor');
    conferir(Boolean(rep) && e.projeto.enlaces.length === 3, `a sugestão deveria pôr um repetidor ligado às duas pontas: ${JSON.stringify(e.projeto.enlaces)}`);
    conferir((await realcados()).length === 0, 'depois do repetidor, nenhum botão fica realçado');
    await enlacesProntos();
    await esperar(300);
    const rota = await pagina.evaluate(([x, y]) => JSON.parse(JSON.stringify(window.__lora.rotaEntre(x, y))), [idA, idB]);
    conferir(rota?.rota, 'deveria haver rota entre as duas casas');
    const frase = { folga: 'fecha com folga', limite: 'fecha no limite', 'nao-fecha': 'não fecha' }[rota.rota.veredito];
    p = await passo();
    conferir(p.texto.includes(`A sua rota ${frase}`), `o texto do passo 11 deveria ser o da rota que ${frase}: ${p.texto}`);
    conferir(p.contagem.startsWith('Passo 11 de 13'), p.contagem);

    // Recarregar a página no meio do tutorial: continua de onde parou.
    await recarregar();
    await esperarPasso('ler-rota');
    p = await passo();
    conferir(p.contagem.startsWith('Passo 11 de 13') && p.texto.includes(`A sua rota ${frase}`), `depois de recarregar, o tutorial deveria continuar no passo 11: ${JSON.stringify(p)}`);
    conferir((await lora()).projeto.nome === 'Tutorial: meu primeiro enlace', 'recarregar deveria manter o projeto do tutorial aberto');
    await pagina.setViewportSize({ width: 1280, height: 720 });
    await captura('128-lora-tutorial-depois-de-recarregar');

    // "Ver os passos": feito, atual e adiante.
    await pagina.locator('#lora-tutorial [data-acao="lista"]').click();
    const marcas = await pagina.evaluate(() => [...document.querySelectorAll('#lora-tutorial .passo-item')].map((li) => (li.classList.contains('feito') ? 'f' : li.classList.contains('atual') ? 'a' : 'x')).join(''));
    conferir(/^f{10}a(x{2})$/.test(marcas), `a lista de passos deveria ter 10 feitos, 1 atual e 2 adiante: ${marcas}`);
    await captura('129-lora-tutorial-lista-de-passos');
    await pagina.locator('#lora-tutorial [data-acao="lista"]').click();

    await continuar();
    await esperarPasso('repetidor-solar');
    await cliqueNoPonto(rep.id);
    conferir(await pagina.locator('#lora-solar').isVisible(), 'o painel do repetidor deveria mostrar a seção solar');
    await pagina.locator('#lora-solar .lora-porque-botao').click();
    porque = await texto('#lora-painel-porque .lora-porque-texto');
    conferir(porque.includes('Não há medição publicada'), `texto do "Por quê?" do consumo: ${porque}`);
    await pagina.keyboard.press('Escape');
    conferir((await passo()).id === 'repetidor-solar', 'clicar no repetidor não pula a leitura do passo 12');
    await continuar();
    await esperarPasso('proximos-passos');
    await continuar();
    await pagina.waitForFunction(() => document.querySelector('#lora-tutorial')?.dataset.modo === 'resumo', null, { timeout: 10000 });
    conferir((await texto('#lora-tutorial')).includes('13 passos feitos'), 'o fim do tutorial deveria dizer que os 13 passos estão feitos');
    conferir((await pagina.locator('#lora-tutorial [data-acao]').allTextContents()).join('|') === 'Glossário|Regras da Anatel|Fechar', 'o resumo deveria ter os próximos passos como botões');
    await captura('130-lora-tutorial-resumo');

    // ---------------------------------------------------------------- Glossário
    await pagina.locator('#lora-tutorial [data-acao="glossario"]').click();
    conferir(await sobreposto('#lora-painel-glossario'), 'o botão do resumo deveria abrir o glossário');
    await pagina.keyboard.press('Escape');
    await pagina.locator('#lora-aprender-glossario').click();
    const busca = pagina.locator('#lora-busca-glossario');
    conferir(await busca.evaluate((x) => document.activeElement === x), 'o campo de busca do glossário deveria ficar em foco');
    const visiveis = () => pagina.evaluate(() => [...document.querySelectorAll('#lora-painel-glossario .termo')].filter((x) => !x.hidden).map((x) => x.dataset.termo));
    const todos = (await visiveis()).length;
    conferir(todos > 30, `o glossário deveria listar todos os termos: ${todos}`);
    await busca.fill('fresnel');
    const achados = await visiveis();
    conferir(achados.includes('zona-de-fresnel') && achados.length < todos, `a busca "fresnel" deveria achar a zona de Fresnel: ${achados.join()}`);
    await busca.fill('RADIACAO RESTRITA');
    conferir((await visiveis()).includes('radiacao-restrita'), 'a busca não deveria diferenciar acento nem maiúscula');
    await busca.fill('zzzqqq');
    conferir((await visiveis()).length === 0 && (await visivel('#lora-glossario-vazio')), 'sem resultado, o glossário deveria dizer "Nenhum termo encontrado"');
    conferir((await texto('#lora-glossario-vazio')) === 'Nenhum termo encontrado.', 'texto de nenhum termo encontrado');
    await captura('131-lora-glossario-sem-resultado');
    await busca.fill('fresnel');
    await pagina.locator('#lora-termo-zona-de-fresnel .termo-titulo').click();
    conferir((await termoAberto()).join() === 'zona-de-fresnel', 'clicar no termo deveria abri-lo');
    const veja = pagina.locator('#lora-termo-zona-de-fresnel .etiqueta-termo').first();
    const destino = await veja.getAttribute('data-termo');
    await veja.click();
    conferir((await termoAberto()).join() === destino && (await visiveis()).length === todos, `"veja também" deveria navegar para "${destino}": ${(await termoAberto()).join()}`);
    await captura('132-lora-glossario-veja-tambem');
    await pagina.keyboard.press('Escape');

    // Termo sublinhado do painel abre o glossário nele; a dica (title) continua a mesma.
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idA, idB]);
    const sublinhado = pagina.locator('#lora-direita .lora-termo-glossario[data-termo="zona-de-fresnel"]');
    conferir((await sublinhado.getAttribute('title')).startsWith('Zona de Fresnel: um espaço em forma de charuto'), 'a dica do termo deveria continuar a mesma');
    await sublinhado.click();
    conferir((await sobreposto('#lora-painel-glossario')) && (await termoAberto()).join() === 'zona-de-fresnel', 'o termo sublinhado deveria abrir o glossário nele');
    await captura('133-lora-glossario-do-termo-da-tela');
    await pagina.setViewportSize({ width: 1440, height: 900 });
    await captura('140-lora-glossario-do-termo-da-tela-1440');
    await pagina.setViewportSize({ width: 1280, height: 720 });
    await pagina.keyboard.press('Escape');

    // "Por quê?" do aviso fixo de prédios e árvores, e das rotas.
    await pagina.locator('#lora-direita .lora-aviso.fixo .lora-porque-botao').click();
    conferir((await texto('#lora-painel-porque .lora-porque-texto')).includes('mapa de relevo público'), 'o "Por quê?" do aviso fixo deveria falar do mapa de relevo');
    await pagina.keyboard.press('Escape');

    // ---------------------------------------------------------------- Regras da Anatel e avisos de regra
    await pagina.locator('#lora-aprender-regras').click();
    conferir(await sobreposto('#lora-painel-regras'), 'o botão "Regras da Anatel" deveria abrir o painel');
    const regras = await pagina.locator('#lora-painel-regras .lora-regra h4').allTextContents();
    conferir(regras.length === 6 && regras[0] === 'Em uma frase' && regras.includes('O que não foi conferido'), `o painel deveria ter os 6 blocos das regras: ${regras.join('|')}`);
    await captura('134-lora-regras-da-anatel');
    await pagina.keyboard.press('Escape');
    conferir(!(await sobreposto('#lora-painel-regras')), 'Esc deveria fechar as regras');

    await pagina.evaluate((id) => window.__lora.acoes.alterarPonto(id, { ganhoDbi: 9, potenciaDbm: 30 }), idA);
    await cliqueNoPonto(idA);
    const aviso = pagina.locator('#lora-direita .lora-aviso').filter({ hasText: 'passa do limite' }).first();
    conferir(await aviso.isVisible(), 'com 30 dBm e 9 dBi, o painel do ponto deveria avisar da regra');
    await aviso.locator('.lora-link-regras').click();
    conferir(await sobreposto('#lora-painel-regras'), '"ver as regras" deveria abrir o painel das regras');
    await pagina.keyboard.press('Escape');
    await aviso.locator('.lora-porque-botao').click();
    conferir((await texto('#lora-painel-porque .lora-porque-texto')).includes('Ato nº 14.448/2017'), 'o "Por quê?" do aviso de regra deveria citar o ato');
    await captura('135-lora-porque-do-aviso-de-regra');
    await pagina.keyboard.press('Escape');
    await pagina.evaluate((id) => window.__lora.acoes.alterarPonto(id, { ganhoDbi: 0, potenciaDbm: 22 }), idA);

    // ---------------------------------------------------------------- "Por quê?" da rota sem ligação e da sugestão que não fecha
    await pagina.evaluate(([x, y, r]) => {
      const ac = window.__lora.acoes;
      ac.desligar(x, y);
      ac.desligar(y, r);
    }, [idA, idB, rep.id]);
    await enlacesProntos();
    await pagina.evaluate(() => window.__lora.acoes.selecionar(null));
    await pagina.locator('#lora-rotas .lora-rota .lora-porque-botao').click();
    conferir((await texto('#lora-painel-porque .lora-porque-texto')).includes('só conta as ligações que você desenhou'), 'o "Por quê?" da rota sem ligação deveria dizer que só contam as ligações desenhadas');
    await captura('136-lora-porque-da-rota-sem-ligacao');
    await pagina.keyboard.press('Escape');
    await pagina.evaluate(() => {
      window.__lora.acoes.desfazer();
      window.__lora.acoes.desfazer();
    });
    await enlacesProntos();
    await pagina.evaluate(() => window.__lora.acoes.configurar({ margemDoAmbienteDb: 40 }));
    await enlacesProntos();
    await pagina.evaluate(([x, y]) => window.__lora.acoes.selecionar({ tipo: 'enlace', de: x, para: y }), [idA, idB]);
    await pagina.locator('#lora-enlace-sugerir').click();
    await pagina.waitForFunction(() => window.__lora.busca().estado === 'pronta', null, { timeout: 60000 });
    await esperar(800);
    conferir(await pagina.locator('#lora-busca-sem-saida').isVisible(), 'com margem de 40 dB nenhum lugar fecha, e o painel deveria dizer isso');
    await pagina.locator('#lora-busca-sem-saida .lora-porque-botao').click();
    conferir((await texto('#lora-painel-porque .lora-porque-texto')).includes('O repetidor não amplifica'), 'o "Por quê?" da sugestão que não fecha');
    await captura('137-lora-porque-da-sugestao');
    await pagina.keyboard.press('Escape');
    await pagina.locator('#lora-busca-fechar').click();
    await pagina.evaluate(() => window.__lora.acoes.configurar({ margemDoAmbienteDb: 0 }));

    // ---------------------------------------------------------------- Começar de novo, sair e trocar de projeto
    await pagina.locator('#lora-tutorial [data-acao="fechar"]').click();
    conferir(await pagina.locator('#lora-tutorial').isHidden(), '"Fechar o tutorial" deveria esconder o painel');
    await pagina.locator('#lora-aprender-tutorial').click();
    conferir((await passo())?.modo === 'pergunta', `com o projeto do tutorial já existente, deveria perguntar: ${JSON.stringify(await passo())}`);
    conferir((await lora()).projeto.pontos.length === 3, 'a pergunta não deveria mexer no projeto aberto');
    await captura('138-lora-tutorial-pergunta');
    await pagina.locator('#lora-tutorial [data-acao="comecar-outro"]').click();
    e = await lora();
    conferir(e.projeto.nome === 'Tutorial: meu primeiro enlace (2)' && e.projeto.pontos.length === 0, `"Começar outro" deveria criar outro projeto vazio: ${e.projeto.nome}`);
    await esperarPasso('o-que-e');
    await pagina.locator('#lora-tutorial [data-acao="sair"]').click();
    conferir(await pagina.locator('#lora-tutorial').isHidden() && (await realcados()).length === 0, '"Sair do tutorial" deveria esconder o painel');
    conferir((await pagina.evaluate(() => sessionStorage.getItem('offgrid.lora.tutorial'))) === null, 'sair deveria limpar o andamento da sessão');
    conferir((await projetos()).length === 3, 'sair não apaga projeto nenhum');

    await pagina.locator('#lora-aprender-tutorial').click();
    await pagina.locator('#lora-tutorial [data-acao="continuar-no-existente"]').click();
    conferir((await lora()).projeto.nome === 'Tutorial: meu primeiro enlace' && (await lora()).projeto.pontos.length === 3, '"Continuar nele" deveria abrir o projeto do tutorial que já existe');
    await esperarPasso('o-que-e');
    // Trocar para outro projeto fecha o tutorial.
    await pagina.locator('#lora-botao-projeto').click();
    await pagina.locator('#lora-meus-projetos').click();
    await pagina.locator('#lora-lista-de-projetos .projeto-item[data-nome="Minha rede"] [data-acao="abrir"]').click();
    conferir((await lora()).projeto.nome === 'Minha rede' && (await pagina.locator('#lora-tutorial').isHidden()), 'trocar de projeto deveria fechar o tutorial');
    conferir((await lora()).projeto.pontos.length === 0, 'o projeto "Minha rede" continua como estava, vazio');
    conferir((await pagina.locator('#lora-realce, .lora-realce').count()) === 0, 'sem tutorial, nenhum botão fica realçado');

    // Limpeza: os dois projetos do tutorial saem; "Minha rede" fica.
    await pagina.evaluate(() => {
      for (const x of window.__lora.acoes.listarProjetos()) if (x.nome.startsWith('Tutorial:')) window.__lora.acoes.apagarProjeto(x.id);
    });
    const fim = await projetos();
    conferir(fim.length === 1 && fim[0].nome === 'Minha rede' && fim[0].atual, `no fim só "Minha rede" deveria ficar, aberta: ${JSON.stringify(fim)}`);
    conferir(await cartao.isHidden(), 'o cartão da primeira abertura não volta depois de visto');

    // Voltar ao tamanho das outras verificações. O cartão lembrado em localStorage não aparece de novo.
    await pagina.setViewportSize({ width: 1440, height: 900 });
    await esperar(300);
    conferir(pedidos.outros.length === 0, `nenhum pedido deveria sair para outro endereço: ${pedidos.outros.join(', ')}`);
  }

  // Ambiente de rádio LoRa (especificacao/lora.md, seção 1): página própria, seletor de ambiente e projetos separados.
  // Os pontos de teste ficam em lugares neutros, sem relação com casa nenhuma.
  // Busca de endereço (especificacao/lora.md, seção 7.1) e link da MeshBrasil (7.2). O serviço de endereços é
  // interceptado: os lugares são inventados, na região neutra do terreno falso, e nenhum pedido chega ao serviço real.
  async function verificarLoraEndereco(lora) {
    const lugar = { lat: LUGARES.centro.lat, lon: LUGARES.centro.lon };
    const falso = (nome, dLat) => ({
      display_name: nome,
      lat: (lugar.lat + dLat).toFixed(4),
      lon: lugar.lon.toFixed(4),
      boundingbox: [(lugar.lat + dLat - 0.01).toFixed(4), (lugar.lat + dLat + 0.01).toFixed(4), (lugar.lon - 0.01).toFixed(4), (lugar.lon + 0.01).toFixed(4)],
    });
    const pedidosDeEndereco = [];
    let resposta = { status: 200, corpo: [falso('Rua de Teste, Cidade Fictícia, Estado Fictício, Brasil', 0), falso('Rua de Teste <b>dois</b>, Vila Inventada, Brasil', 0.05)] };
    await pagina.route('https://nominatim.openstreetmap.org/**', (rota) => {
      const pedido = rota.request();
      pedidosDeEndereco.push({ url: pedido.url(), cabecalhos: pedido.headers() });
      if (resposta === 'abortar') return rota.abort();
      return rota.fulfill({ status: resposta.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(resposta.corpo) });
    });
    // As respostas de recusa e a queda são esperadas aqui: não contam como erro da página.
    const errosAntes = erros.length;
    const campo = pagina.locator('#lora-endereco');
    const buscar = async (texto) => {
      await campo.click();
      await campo.fill(texto);
      await pagina.keyboard.press('Enter');
    };
    const botaoLivre = () => pagina.waitForFunction(() => !document.querySelector('#lora-endereco-buscar').disabled, null, { timeout: 5000 });
    const estadoDaLista = async () => ((await pagina.locator('#lora-endereco-estado').count()) ? (await pagina.locator('#lora-endereco-estado').textContent()).trim() : '');

    await pagina.evaluate(() => localStorage.removeItem('offgrid.lora.avisoEndereco'));
    await pagina.reload();
    await pagina.waitForFunction(() => window.__lora && window.__lora.pronto === true, null, { timeout: 30000 });
    const antes = await lora();
    const chavesAntes = await pagina.evaluate(() => Object.keys(localStorage).sort());
    conferir((await pagina.locator('#lora-endereco-frase').textContent()).trim() === 'O texto da busca vai para o OpenStreetMap.', 'a frase fixa da busca deveria estar na tela');
    // O campo não cobre as ferramentas nem os controles de zoom.
    const caixas = await pagina.evaluate(() => ['#lora-endereco-caixa', '.lora-ferramentas', '.maplibregl-ctrl-top-right'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
    const cruza = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    conferir(!cruza(caixas[0], caixas[1]) && !cruza(caixas[0], caixas[2]), `o campo de endereço não deveria cobrir as ferramentas nem o zoom: ${JSON.stringify(caixas)}`);

    // Texto curto e digitar sem Enter não geram pedido.
    await campo.click();
    await campo.fill('Rua de Teste');
    await esperar(1200);
    conferir(pedidosDeEndereco.length === 0, 'digitar sem Enter não deveria gerar pedido');
    await buscar('Ru');
    conferir(pedidosDeEndereco.length === 0 && (await pagina.locator('#lora-aviso-endereco').isHidden()), 'texto com menos de 3 letras não deveria gerar pedido nem aviso');

    // Primeira busca: o aviso vem antes do pedido.
    await buscar('Rua de Teste');
    conferir(await pagina.locator('#lora-aviso-endereco').isVisible(), 'a primeira busca deveria mostrar o aviso de privacidade');
    conferir((await pagina.locator('#lora-aviso-endereco').textContent()).includes('o serviço recebe esse endereço'), 'o aviso diz que o serviço recebe o endereço');
    conferir(pedidosDeEndereco.length === 0, 'antes de aceitar o aviso, nenhum pedido deveria sair');
    await captura('141-lora-endereco-aviso');
    await pagina.locator('#lora-aviso-endereco-cancelar').click();
    conferir(pedidosDeEndereco.length === 0 && (await pagina.locator('#lora-aviso-endereco').isHidden()), 'cancelar o aviso não deveria gerar pedido');
    await buscar('Rua de Teste');
    await pagina.locator('#lora-aviso-endereco-buscar').click();
    await pagina.locator('.lora-endereco-resultado').first().waitFor();
    conferir(pedidosDeEndereco.length === 1, `aceitar o aviso deveria gerar um pedido: ${pedidosDeEndereco.length}`);
    const primeiro = new URL(pedidosDeEndereco[0].url);
    const parametros = Object.fromEntries(primeiro.searchParams);
    conferir(
      primeiro.origin + primeiro.pathname === 'https://nominatim.openstreetmap.org/search' &&
        JSON.stringify(Object.keys(parametros).sort()) === '["accept-language","countrycodes","format","limit","q"]' &&
        parametros.q === 'Rua de Teste' && parametros.format === 'jsonv2' && parametros.limit === '5' && parametros['accept-language'] === 'pt-BR' && parametros.countrycodes === 'br',
      `o pedido deveria levar só os cinco parâmetros da especificação: ${pedidosDeEndereco[0].url}`,
    );
    const proprios = Object.keys(pedidosDeEndereco[0].cabecalhos).filter((c) => c.startsWith('x-') || c === 'authorization' || c === 'content-type');
    conferir(proprios.length === 0 && 'referer' in pedidosDeEndereco[0].cabecalhos, `o pedido não leva cabeçalho próprio e leva o Referer: ${JSON.stringify(pedidosDeEndereco[0].cabecalhos)}`);
    conferir((await pagina.locator('.lora-endereco-resultado').count()) === 2, 'a lista deveria ter os dois resultados');
    conferir((await pagina.locator('.lora-endereco-resultado b').count()) === 0 && (await pagina.locator('.lora-endereco-resultado').nth(1).textContent()).includes('<b>dois</b>'), 'o nome do resultado entra como texto, nunca como HTML');
    const credito = pagina.locator('#lora-endereco-atribuicao');
    conferir((await credito.textContent()).includes('© colaboradores do OpenStreetMap') && (await credito.locator('a').getAttribute('href')) === 'https://www.openstreetmap.org/copyright', 'a lista deveria trazer a atribuição do OpenStreetMap');
    await captura('142-lora-endereco-resultados');

    // O mesmo texto de novo não gera pedido; o aviso não volta.
    await botaoLivre();
    await buscar('Rua de Teste');
    await pagina.locator('.lora-endereco-resultado').first().waitFor();
    conferir(pedidosDeEndereco.length === 1 && (await pagina.locator('#lora-aviso-endereco').isHidden()), 'repetir a busca não deveria gerar pedido novo nem mostrar o aviso de novo');

    // Escolher: o mapa vai até lá e a marca provisória oferece os três botões.
    await pagina.locator('.lora-endereco-resultado').first().click();
    await pagina.locator('#lora-lugar-casa').waitFor();
    await esperar(800);
    const centro = await pagina.evaluate(() => window.__lora.mapa.centro());
    const zoom = await pagina.evaluate(() => window.__lora.mapa.zoom());
    conferir(Math.abs(centro.lat - lugar.lat) < 0.02 && Math.abs(centro.lon - lugar.lon) < 0.02 && zoom <= 16.01 && zoom > 11, `o mapa deveria ir até o resultado, com zoom até 16: ${JSON.stringify(centro)} zoom ${zoom}`);
    conferir((await lora()).projeto.pontos.length === antes.projeto.pontos.length, 'a marca provisória não é ponto do projeto');
    await captura('143-lora-endereco-lugar');
    await pagina.locator('#lora-lugar-casa').click();
    let e = await lora();
    const novo = e.projeto.pontos[e.projeto.pontos.length - 1];
    conferir(e.projeto.pontos.length === antes.projeto.pontos.length + 1 && novo.tipo === 'casa' && Math.abs(novo.lat - lugar.lat) < 1e-3 && Math.abs(novo.lon - lugar.lon) < 1e-3, `"Pôr uma casa aqui" deveria criar o ponto no lugar: ${JSON.stringify(novo)}`);
    conferir(!JSON.stringify(e.projeto).includes('Teste') && e.selecao?.tipo === 'ponto' && e.selecao.id === novo.id, 'o ponto nasce com o nome padrão, selecionado');
    conferir((await pagina.locator('#lora-lugar-casa').isHidden()) && (await pagina.locator('#lora-endereco-resultados').isHidden()), 'pôr o ponto tira a marca e a lista');
    await pagina.locator('#lora-desfazer').click();
    conferir((await lora()).projeto.pontos.length === antes.projeto.pontos.length, 'pôr o ponto é um passo só do desfazer');

    // O repetidor, o "Fechar" e o Esc.
    await buscar('Rua de Teste');
    await pagina.locator('.lora-endereco-resultado').nth(1).click();
    await pagina.locator('#lora-lugar-repetidor').click();
    e = await lora();
    conferir(e.projeto.pontos[e.projeto.pontos.length - 1].tipo === 'repetidor', '"Pôr um repetidor aqui" deveria criar um repetidor');
    await pagina.locator('#lora-desfazer').click();
    await buscar('Rua de Teste');
    await pagina.locator('.lora-endereco-resultado').first().click();
    await pagina.locator('#lora-lugar-fechar').click();
    conferir((await pagina.locator('#lora-lugar-casa').isHidden()) && (await pagina.locator('#lora-endereco-resultados').isHidden()), '"Fechar" tira a marca e a lista');
    await buscar('Rua de Teste');
    await pagina.locator('.lora-endereco-resultado').first().click();
    await campo.click();
    await pagina.keyboard.press('Escape');
    conferir((await pagina.locator('#lora-lugar-casa').isHidden()) && (await pagina.locator('#lora-endereco-resultados').isHidden()), 'Esc no campo tira a marca e a lista');
    // Ctrl+Z dentro do campo é do campo, não do projeto.
    const pontosAgora = (await lora()).projeto.pontos.length;
    await campo.click();
    await pagina.keyboard.press('Control+z');
    conferir((await lora()).projeto.pontos.length === pontosAgora, 'Ctrl+Z no campo não deveria desfazer o projeto');

    // Nada no Brasil: o botão repete sem o filtro do país, só com o clique.
    resposta = { status: 200, corpo: [] };
    await botaoLivre();
    await buscar('Lugar Inventado');
    await pagina.locator('#lora-endereco-mundo').waitFor();
    conferir((await estadoDaLista()) === 'Nada encontrado no Brasil com esse texto.', `sem resultado no Brasil: "${await estadoDaLista()}"`);
    const antesDoMundo = pedidosDeEndereco.length;
    await esperar(1500);
    conferir(pedidosDeEndereco.length === antesDoMundo, 'a busca no mundo todo não sai sozinha');
    await pagina.locator('#lora-endereco-mundo').click();
    await esperar(600);
    const doMundo = new URL(pedidosDeEndereco[pedidosDeEndereco.length - 1].url);
    conferir(pedidosDeEndereco.length === antesDoMundo + 1 && !doMundo.searchParams.has('countrycodes') && doMundo.searchParams.get('q') === 'Lugar Inventado', `"Procurar no mundo todo" repete sem countrycodes: ${doMundo}`);

    // Recusa do serviço, resposta ilegível e queda.
    resposta = { status: 429, corpo: {} };
    await botaoLivre();
    await buscar('Outro Lugar Inventado');
    await pagina.locator('#lora-endereco-estado[role="alert"]').waitFor();
    conferir((await estadoDaLista()).startsWith('O serviço de endereços recusou o pedido'), `recusa: "${await estadoDaLista()}"`);
    await captura('144-lora-endereco-recusa');
    resposta = { status: 200, corpo: {} };
    await botaoLivre();
    await buscar('Terceiro Lugar Inventado');
    await pagina.locator('#lora-endereco-estado[role="alert"]').waitFor();
    conferir((await estadoDaLista()).startsWith('A busca de endereço não respondeu'), `resposta que não é lista: "${await estadoDaLista()}"`);
    resposta = 'abortar';
    await botaoLivre();
    await buscar('Quarto Lugar Inventado');
    await pagina.locator('#lora-endereco-estado[role="alert"]').waitFor();
    conferir((await estadoDaLista()).startsWith('A busca de endereço não respondeu'), `sem rede: "${await estadoDaLista()}"`);
    await campo.click();
    await pagina.keyboard.press('Escape');

    // Nada do que foi buscado ficou gravado.
    await esperar(600);
    const gravado = await pagina.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    const chavesNovas = Object.keys(gravado).filter((k) => !chavesAntes.includes(k));
    conferir(JSON.stringify(chavesNovas) === '["offgrid.lora.avisoEndereco"]' && gravado['offgrid.lora.avisoEndereco'] === 'sim', `a busca só grava a marca do aviso: ${JSON.stringify(chavesNovas)}`);
    conferir(!/Teste|Inventad|Fict/.test(JSON.stringify(gravado)), 'o texto buscado e os resultados não deveriam ficar gravados no navegador');
    const exportado = await pagina.evaluate(() => window.__lora.acoes.exportarProjeto());
    conferir(!/Teste|Inventad|Fict/.test(exportado), 'o texto buscado não deveria ir para a exportação');
    conferir(pedidosDeEndereco.every((p) => !/lat=|lon=|viewbox|email/.test(p.url)), 'nenhum pedido leva coordenada, área da tela ou e-mail');
    await pagina.unroute('https://nominatim.openstreetmap.org/**');
    // Só os três erros provocados acima (HTTP 429 e a queda) podem ter entrado na lista.
    const provocados = erros.splice(errosAntes);
    const estranhos = provocados.filter((x) => !x.includes('nominatim.openstreetmap.org') && !x.includes('429') && !x.includes('Failed to load resource'));
    erros.push(...estranhos);

    // Link da MeshBrasil no painel do resumo e no glossário.
    await pagina.evaluate(() => window.__lora.acoes.selecionar(null));
    const link = pagina.locator('#lora-link-meshbrasil');
    conferir(
      (await link.textContent()).trim() === 'Ver nós ativos no Brasil (MeshBrasil)' &&
        (await link.getAttribute('href')) === 'https://www.meshbrasil.com/mapa-meshtastic-brasil.html' &&
        (await link.getAttribute('target')) === '_blank' &&
        (await link.getAttribute('rel')) === 'noopener noreferrer',
      'o painel do resumo deveria ter o link da MeshBrasil, abrindo em outra aba',
    );
    conferir((await pagina.locator('#lora-direita').textContent()).includes('O mapa mostra só quem escolheu aparecer; a rede real é maior.'), 'o link vem com a frase da especificação');
    await captura('145-lora-link-meshbrasil');
    await pagina.locator('#lora-aprender-glossario').click();
    await pagina.locator('#lora-termo-rede-em-malha').scrollIntoViewIfNeeded();
    if ((await pagina.locator('#lora-link-meshbrasil-rede-em-malha').count()) === 0) await pagina.locator('#lora-termo-rede-em-malha').click();
    conferir((await pagina.locator('#lora-link-meshbrasil-rede-em-malha').getAttribute('href')) === 'https://www.meshbrasil.com/mapa-meshtastic-brasil.html', 'o termo "Rede em malha" do glossário deveria ter o link da MeshBrasil');
    await captura('146-lora-glossario-meshbrasil');
    await pagina.keyboard.press('Escape');
  }

  async function verificarLora() {
    const solarAntes = await pagina.evaluate(() => JSON.stringify(window.__offgrid.estado().projeto));
    // O ambiente de rádio pede blocos de mapa e de relevo a dois serviços de fora. Aqui eles são interceptados e
    // respondidos com blocos falsos: a verificação não depende da internet e nada sai para fora.
    const pedidos = await interceptarBlocos(pagina, url);
    // O seletor fica na barra do alto, que continua com uma linha só em 1280 px.
    const topo = await pagina.locator('#topo').boundingBox();
    conferir(topo.height <= 49, `a barra do alto do solar deveria ter uma linha só: ${topo.height} px`);
    conferir((await pagina.locator('.ambientes a[aria-current="page"]').textContent()) === 'Solar', 'no solar, o seletor deveria marcar "Solar"');
    await pagina.locator('.ambientes a', { hasText: 'LoRa' }).click();
    await pagina.waitForFunction(() => window.__lora && window.__lora.pronto === true, null, { timeout: 30000 });
    conferir(pagina.url().endsWith('lora.html'), `o seletor deveria abrir lora.html: ${pagina.url()}`);
    conferir((await pagina.locator('.ambientes a[aria-current="page"]').textContent()) === 'LoRa', 'no LoRa, o seletor deveria marcar "LoRa"');
    const lora = () => pagina.evaluate(() => JSON.parse(JSON.stringify(window.__lora.estado())));
    let e = await lora();
    conferir(e.projeto.pontos.length === 0 && e.projeto.regiao === 'ANZ' && e.projeto.modo === 'long-fast', `o projeto de rádio começa vazio: ${JSON.stringify(e.projeto)}`);
    await captura('101-lora-pagina-inicial');
    await verificarLoraAprender(pedidos);

    // Projetos de LoRa: criar pelo painel, com o mouse; não se misturam com os do solar.
    await pagina.locator('#lora-botao-projeto').click();
    await pagina.locator('#lora-meus-projetos').click();
    await pagina.locator('#lora-novo-projeto-nome').fill('Rede de teste');
    await pagina.locator('#lora-painel-projetos [data-acao="criar"]').click();
    e = await lora();
    conferir(e.projeto.nome === 'Rede de teste' && (await pagina.title()).startsWith('Rede de teste'), `o projeto novo deveria abrir: ${e.projeto.nome}`);
    await pagina.evaluate(() => {
      const a = window.__lora.acoes;
      const p1 = a.adicionarPonto(-10, -50, 'casa', 'Ponto A');
      const p2 = a.adicionarPonto(-10.2, -50.3, 'casa', 'Ponto B');
      a.ligar(p1, p2);
    });
    e = await lora();
    conferir(e.projeto.pontos.length === 2 && e.projeto.enlaces.length === 1, 'o projeto deveria ter dois pontos e um enlace');
    conferir((await pagina.locator('#lora-mapa .lora-ponto').count()) === 2 && (await pagina.locator('#lora-mapa .lora-enlace').count()) === 1, 'o mapa deveria desenhar os dois pontos e o enlace');
    await pagina.keyboard.press('Control+z');
    conferir((await lora()).projeto.enlaces.length === 0, 'Ctrl+Z deveria desfazer o enlace');
    await esperar(600);
    await pagina.reload();
    await pagina.waitForFunction(() => window.__lora && window.__lora.pronto === true, null, { timeout: 30000 });
    e = await lora();
    conferir(e.projeto.nome === 'Rede de teste' && e.projeto.pontos.length === 2, 'recarregar deveria manter o projeto de rádio');
    await pagina.locator('#lora-botao-projeto').click();
    await pagina.locator('#lora-meus-projetos').click();
    await captura('102-lora-meus-projetos');
    pagina.once('dialog', (dlg) => dlg.accept());
    await pagina.locator('#lora-lista-de-projetos .projeto-item[data-nome="Rede de teste"] [data-acao="apagar"]').click();
    conferir((await lora()).projeto.nome !== 'Rede de teste', 'apagar deveria abrir outro projeto');
    await pagina.locator('#lora-painel-projetos .fechar-sobreposto').click();

    await verificarLoraMapa(lora, pedidos);
    await verificarLoraRede(lora, pedidos);
    await verificarLoraEndereco(lora);

    // De volta ao solar: o projeto dele está como estava.
    await pagina.locator('.ambientes a', { hasText: 'Solar' }).click();
    await pagina.waitForFunction(() => window.__offgrid && window.__offgrid.pronto === true, null, { timeout: 30000 });
    conferir((await pagina.evaluate(() => JSON.stringify(window.__offgrid.estado().projeto))) === solarAntes, 'o projeto do solar não deveria mudar ao visitar o LoRa');
  }
  await verificarLora();

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
