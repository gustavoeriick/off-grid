// Painéis da coluna da direita do ambiente de LoRa: resumo da rede, configuração, ponto e enlace.
// Especificação: docs/especificacao/lora.md, seções 4.6 a 4.8, 6 e 7.
// Os painéis se redesenham quando o projeto, a seleção ou o cálculo mudam. O painel do ponto e a configuração
// são montados uma vez e só têm os valores atualizados, para o campo que está sendo digitado não perder o foco.

import { acoesLora, assinarLora, estadoLora } from '../estado';
import { altitudeDoPonto, assinarCalculo, modoDoProjeto, situacaoDaAltitude, situacaoDoEnlace, type SituacaoDoEnlace } from '../calculo';
import { avisosDaRegra, MODOS, REGIOES, SALTOS_MAXIMO } from '../nucleo';
import type { PontoLora, Regiao } from '../nucleo/tipos';
import { h, num, type Filho } from './dom';
import {
  AVISO_FIXO,
  dbmTexto,
  distanciaTexto,
  EXPLICACAO_DO_VEREDITO,
  GLOSSARIO,
  dbComSinal,
  lerNumero,
  linhasDaConta,
  resumoDoEnlace,
  TEXTO_DE_SALTOS,
  TEXTO_DO_MODO,
  TEXTO_MARGEM_DO_AMBIENTE,
  TEXTO_SEM_PONTOS,
  textoDaZona,
  textoDoVeredito,
  vereditoEmDestaque,
} from './textos';

/** Termo de rádio com a explicação ao passar o ponteiro. */
const termo = (texto: string, explicacao: string): HTMLElement => h('span', { class: 'lora-termo', title: explicacao, tabindex: '0' }, texto);

const nomeDoPonto = (id: string): string => estadoLora.projeto.pontos.find((p) => p.id === id)?.nome ?? '?';

function distintivo(texto: string, classe: string): HTMLElement {
  return h('span', { class: `lora-selo ${classe}` }, texto);
}

// ---------------------------------------------------------------- Resumo da rede

function montarResumo(): HTMLElement {
  const projeto = estadoLora.projeto;
  const caixa = h('section', { class: 'lora-painel', 'aria-label': 'Resumo da rede' }, h('h2', null, 'Sua rede'));
  if (projeto.pontos.length === 0) {
    caixa.append(h('p', { class: 'lora-ajuda' }, TEXTO_SEM_PONTOS));
    return caixa;
  }
  caixa.append(h('h3', null, `Pontos (${projeto.pontos.length})`));
  const lista = h('ul', { class: 'lora-lista' });
  for (const p of projeto.pontos) {
    const botao = h(
      'button',
      { type: 'button', class: 'lora-item', title: 'Selecionar este ponto' },
      h('strong', null, p.nome),
      h('span', { class: 'detalhe' }, `${p.tipo === 'repetidor' ? 'repetidor' : 'casa'}, antena a ${num(p.alturaDaAntenaM, 1)} m`),
    );
    botao.addEventListener('click', () => acoesLora.selecionar({ tipo: 'ponto', id: p.id }));
    lista.append(h('li', null, botao));
  }
  caixa.append(lista);

  caixa.append(h('h3', null, `Enlaces (${projeto.enlaces.length})`));
  if (projeto.enlaces.length === 0) {
    caixa.append(h('p', { class: 'lora-ajuda' }, 'Use "Ligar dois pontos" na barra do mapa para ver se o rádio fecha a ligação entre eles. ', termo('Enlace', GLOSSARIO.enlace), ' é a ligação de rádio entre dois pontos.'));
    return caixa;
  }
  const enlaces = h('ul', { class: 'lora-lista' });
  for (const e of projeto.enlaces) {
    const s = situacaoDoEnlace(e.de, e.para);
    const r = resumoDoEnlace(
      !s || s.estado === 'calculando'
        ? { estado: 'calculando' }
        : s.estado === 'erro'
          ? { estado: 'erro', mensagem: s.mensagem }
          : { estado: 'pronto', veredito: s.resultado.veredito, distanciaKm: s.resultado.conta.distanciaKm, folgaDb: s.resultado.conta.folgaDb },
    );
    const botao = h(
      'button',
      { type: 'button', class: 'lora-item', title: 'Selecionar este enlace' },
      h('strong', null, `${nomeDoPonto(e.de)} ↔ ${nomeDoPonto(e.para)}`),
      h('span', null, distintivo(r.veredito, r.classe)),
      r.detalhe ? h('span', { class: 'detalhe' }, r.detalhe) : null,
    );
    botao.addEventListener('click', () => acoesLora.selecionar({ tipo: 'enlace', de: e.de, para: e.para }));
    enlaces.append(h('li', null, botao));
  }
  caixa.append(enlaces);
  return caixa;
}

// ---------------------------------------------------------------- Ponto selecionado

interface PainelDoPonto {
  elemento: HTMLElement;
  atualizar: () => void;
}

type CampoNumerico = 'alturaDaAntenaM' | 'potenciaDbm' | 'ganhoDbi' | 'perdaNoCaboDb';

const CAMPOS: { campo: CampoNumerico; rotulo: string; unidade: string; min: number; max: number; passo: number; glossario: string }[] = [
  { campo: 'alturaDaAntenaM', rotulo: 'Altura da antena', unidade: 'm', min: 1, max: 100, passo: 0.5, glossario: GLOSSARIO.altura },
  { campo: 'potenciaDbm', rotulo: 'Potência do rádio', unidade: 'dBm', min: 0, max: 30, passo: 1, glossario: GLOSSARIO.potencia },
  { campo: 'ganhoDbi', rotulo: 'Ganho da antena', unidade: 'dBi', min: 0, max: 20, passo: 0.5, glossario: GLOSSARIO.ganho },
  { campo: 'perdaNoCaboDb', rotulo: 'Perda no cabo', unidade: 'dB', min: 0, max: 20, passo: 0.5, glossario: GLOSSARIO.cabo },
];

function montarPainelDoPonto(id: string): PainelDoPonto {
  const achar = (): PontoLora | undefined => estadoLora.projeto.pontos.find((p) => p.id === id);
  const inicial = achar();

  const titulo = h('h2', null, inicial?.nome ?? '');
  const nome = h('input', { type: 'text', maxlength: '40', 'aria-label': 'Nome do ponto' });
  nome.addEventListener('change', () => {
    if (nome.value.trim() !== '') acoesLora.alterarPonto(id, { nome: nome.value });
    nome.value = achar()?.nome ?? nome.value;
  });

  const tipo = h('select', { 'aria-label': 'Tipo do ponto' }, h('option', { value: 'casa' }, 'Casa'), h('option', { value: 'repetidor' }, 'Repetidor'));
  tipo.addEventListener('change', () => acoesLora.alterarPonto(id, { tipo: tipo.value === 'repetidor' ? 'repetidor' : 'casa' }));

  const entradas = new Map<CampoNumerico, { entrada: HTMLInputElement; nota: HTMLElement }>();
  const linhas: HTMLElement[] = [];
  for (const c of CAMPOS) {
    const entrada = h('input', { type: 'number', min: String(c.min), max: String(c.max), step: String(c.passo), 'aria-label': `${c.rotulo} (${c.unidade})` });
    const nota = h('span', { class: 'lora-nota' });
    entrada.addEventListener('change', () => {
      const ponto = achar();
      if (!ponto) return;
      const digitado = lerNumero(entrada.value);
      if (digitado === null) {
        entrada.value = String(ponto[c.campo]);
        nota.textContent = '';
        return;
      }
      acoesLora.alterarPonto(id, { [c.campo]: digitado });
      const aplicado = achar()?.[c.campo] ?? digitado;
      entrada.value = String(aplicado);
      nota.textContent = aplicado !== digitado ? `Cortado para ${num(aplicado, 1)}: o limite é de ${c.min} a ${c.max} ${c.unidade}.` : '';
    });
    entradas.set(c.campo, { entrada, nota });
    linhas.push(
      h('div', { class: 'lora-campo' }, h('label', null, termo(c.rotulo, c.glossario), ' ', h('span', { class: 'detalhe' }, `(${c.unidade})`), entrada), nota),
    );
  }

  const posicao = h('p', { class: 'detalhe' });
  const altitude = h('p', { class: 'detalhe' });
  const avisos = h('div', null);
  const apagar = h('button', { type: 'button', class: 'lora-perigo', title: 'Apaga o ponto e os enlaces ligados a ele. Dá para desfazer com Ctrl+Z.' }, 'Apagar ponto');
  apagar.addEventListener('click', () => acoesLora.removerPonto(id));

  const elemento = h(
    'section',
    { class: 'lora-painel', 'aria-label': 'Ponto selecionado' },
    titulo,
    h('div', { class: 'lora-campo' }, h('label', null, 'Nome', nome)),
    h('div', { class: 'lora-campo' }, h('label', null, termo('Tipo', `Casa: um rádio em uma casa. ${GLOSSARIO.repetidor}`), tipo)),
    ...linhas,
    posicao,
    altitude,
    avisos,
    h('div', { class: 'lora-acoes' }, apagar),
  );

  const atualizar = (): void => {
    const ponto = achar();
    if (!ponto) return;
    titulo.textContent = ponto.nome;
    const foco = document.activeElement;
    if (foco !== nome) nome.value = ponto.nome;
    if (foco !== tipo) tipo.value = ponto.tipo;
    for (const { campo, entrada } of [...entradas].map(([campo, v]) => ({ campo, entrada: v.entrada }))) {
      if (foco !== entrada) entrada.value = String(ponto[campo]);
    }
    posicao.textContent = `Latitude ${num(ponto.lat, 5)} e longitude ${num(ponto.lon, 5)} (só leitura: arraste o ponto no mapa para mudar).`;
    const alt = altitudeDoPonto(id);
    const textoDaAltitude = situacaoDaAltitude(id) === 'erro' ? 'o relevo não pôde ser baixado; confira a internet' : alt === null ? 'baixando o relevo…' : `${num(alt, 0)} m`;
    altitude.replaceChildren(termo('Altitude do terreno', GLOSSARIO.altitude), `: ${textoDaAltitude}`);
    const lista = avisosDaRegra(ponto, modoDoProjeto(estadoLora.projeto));
    avisos.replaceChildren(...lista.map((a) => h('p', { class: 'lora-aviso', role: 'note' }, a)));
  };
  atualizar();
  return { elemento, atualizar };
}

// ---------------------------------------------------------------- Enlace selecionado

function montarListaDeMelhorias(s: Extract<SituacaoDoEnlace, { estado: 'pronto' }>): HTMLElement | null {
  if (s.resultado.veredito === 'folga') return null;
  const caixa = h('div', null, h('h3', null, 'O que mudar para fechar'));
  if (s.melhorias.length === 0) {
    caixa.append(h('p', { class: 'lora-ajuda' }, 'Nenhuma das mudanças testadas (antena mais alta, modo mais lento, antena de mais ganho) melhora o suficiente. Um repetidor no meio do caminho pode ajudar.'));
    return caixa;
  }
  const lista = h('ul', { class: 'lora-melhorias' });
  for (const m of s.melhorias) {
    lista.append(
      h(
        'li',
        null,
        h('span', null, m.rotulo),
        h('span', { class: 'detalhe' }, ` → folga ${dbComSinal(m.folgaDb)}, `),
        distintivo(textoDoVeredito(m.veredito), m.veredito),
        m.aviso ? h('p', { class: 'lora-aviso', role: 'note' }, m.aviso) : null,
      ),
    );
  }
  caixa.append(h('p', { class: 'detalhe' }, 'Cada mudança foi testada sozinha, uma por vez.'), lista);
  return caixa;
}

function montarPainelDoEnlace(de: string, para: string): HTMLElement {
  const situacao = situacaoDoEnlace(de, para);
  const titulo = h('h2', null, `${nomeDoPonto(de)} ↔ ${nomeDoPonto(para)}`);
  const desligar = h('button', { type: 'button', class: 'lora-perigo', title: 'Remove a ligação entre os dois pontos. Os pontos ficam. Dá para desfazer com Ctrl+Z.' }, 'Desligar estes pontos');
  desligar.addEventListener('click', () => acoesLora.desligar(de, para));
  const caixa = h('section', { class: 'lora-painel', 'aria-label': 'Enlace selecionado' }, titulo);

  if (!situacao || situacao.estado === 'calculando') {
    caixa.append(h('p', { class: 'lora-ajuda' }, 'Baixando o relevo e calculando…'), h('div', { class: 'lora-acoes' }, desligar));
    return caixa;
  }
  if (situacao.estado === 'erro') {
    caixa.append(h('p', { class: 'lora-aviso lora-erro', role: 'alert' }, situacao.mensagem), h('div', { class: 'lora-acoes' }, desligar));
    return caixa;
  }

  const { resultado: r } = situacao;
  caixa.append(
    h('div', { class: `lora-veredito ${r.veredito}` }, h('strong', null, vereditoEmDestaque(r.veredito)), h('span', null, ` (folga ${dbComSinal(r.conta.folgaDb)})`)),
    h('p', null, r.texto),
    h('p', { class: 'detalhe' }, EXPLICACAO_DO_VEREDITO[r.veredito]),
    h('p', null, `Distância: ${distanciaTexto(r.conta.distanciaKm)}. Frequência de cálculo: ${num(r.conta.frequenciaMHz, 2)} MHz.`),
    h('p', null, termo('Zona de Fresnel', GLOSSARIO.fresnel), ': ', textoDaZona(r.geometria).replace(/^A zona de Fresnel /, '')),
    h('h3', null, 'A conta, linha a linha'),
    h('p', { class: 'detalhe' }, 'Feita no sentido em que a folga é menor, que é o que vale. As parcelas que ajudam somam; as que atrapalham subtraem. Os valores são arredondados na tela.'),
  );

  const tabela = h('dl', { class: 'lora-conta' });
  for (const l of linhasDaConta(r.conta)) {
    tabela.append(
      h('div', { class: `lora-linha ${l.tipo}` }, h('dt', null, l.rotulo), h('dd', null, l.valor), h('p', { class: 'detalhe' }, l.explicacao)),
    );
  }
  caixa.append(tabela);

  const melhorias = montarListaDeMelhorias(situacao);
  if (melhorias) caixa.append(melhorias);
  for (const a of situacao.avisos) caixa.append(h('p', { class: 'lora-aviso', role: 'note' }, a));
  caixa.append(h('p', { class: 'lora-aviso fixo', role: 'note' }, AVISO_FIXO), h('div', { class: 'lora-acoes' }, desligar));
  return caixa;
}

// ---------------------------------------------------------------- Configuração da rede

interface PainelDaConfiguracao {
  elemento: HTMLElement;
  atualizar: () => void;
}

function montarConfiguracao(): PainelDaConfiguracao {
  const regiao = h('select', { 'aria-label': 'Região' });
  for (const r of Object.values(REGIOES)) regiao.append(h('option', { value: r.id }, `${r.id}: ${num(r.faixaMHz[0], 0)} a ${num(r.faixaMHz[1], 1)} MHz`));
  regiao.addEventListener('change', () => acoesLora.configurar({ regiao: regiao.value as Regiao }));

  const regiaoDetalhe = h('p', { class: 'detalhe' });
  const modo = h('select', { 'aria-label': 'Modo do rádio' });
  for (const m of MODOS) modo.append(h('option', { value: m.id }, `${m.nome}: ${num(m.taxaKbps, 2)} kbps, ${dbmTexto(m.sensibilidadeDbm, 0)}`));
  modo.addEventListener('change', () => acoesLora.configurar({ modo: modo.value }));
  const modoDetalhe = h('p', { class: 'detalhe' });

  const margem = h('input', { type: 'number', min: '0', max: '40', step: '1', 'aria-label': 'Margem do ambiente (dB)' });
  const margemNota = h('span', { class: 'lora-nota' });
  margem.addEventListener('change', () => {
    const n = lerNumero(margem.value);
    if (n !== null) acoesLora.configurar({ margemDoAmbienteDb: n });
    margem.value = String(estadoLora.projeto.margemDoAmbienteDb);
    margemNota.textContent = n !== null && n !== estadoLora.projeto.margemDoAmbienteDb ? 'Cortado: o limite é de 0 a 40 dB.' : '';
  });

  const saltos = h('input', { type: 'number', min: '1', max: String(SALTOS_MAXIMO), step: '1', 'aria-label': 'Limite de saltos' });
  const saltosNota = h('span', { class: 'lora-nota' });
  saltos.addEventListener('change', () => {
    const n = lerNumero(saltos.value);
    if (n !== null) acoesLora.configurar({ limiteDeSaltos: n });
    saltos.value = String(estadoLora.projeto.limiteDeSaltos);
    saltosNota.textContent = n !== null && Math.round(n) !== estadoLora.projeto.limiteDeSaltos ? `Cortado: o limite é de 1 a ${SALTOS_MAXIMO}.` : '';
  });

  const elemento = h(
    'details',
    { class: 'lora-painel lora-config', open: true },
    h('summary', null, 'Configuração da rede'),
    h('div', { class: 'lora-campo lora-larga' }, h('label', null, 'Região', regiao), regiaoDetalhe),
    h(
      'div',
      { class: 'lora-campo lora-larga' },
      h('label', null, termo('Modo do rádio', TEXTO_DO_MODO), modo),
      modoDetalhe,
      h('p', { class: 'detalhe' }, TEXTO_DO_MODO),
    ),
    h(
      'div',
      { class: 'lora-campo' },
      h('label', null, termo('Margem do ambiente', TEXTO_MARGEM_DO_AMBIENTE), ' ', h('span', { class: 'detalhe' }, '(dB, de 0 a 40)'), margem),
      margemNota,
      h('p', { class: 'detalhe' }, TEXTO_MARGEM_DO_AMBIENTE),
    ),
    h(
      'div',
      { class: 'lora-campo' },
      h('label', null, termo('Limite de saltos', TEXTO_DE_SALTOS), ' ', h('span', { class: 'detalhe' }, `(de 1 a ${SALTOS_MAXIMO})`), saltos),
      saltosNota,
      h('p', { class: 'detalhe' }, TEXTO_DE_SALTOS),
    ),
  );

  const atualizar = (): void => {
    const p = estadoLora.projeto;
    const foco = document.activeElement;
    if (foco !== regiao) regiao.value = p.regiao;
    regiaoDetalhe.textContent = `${REGIOES[p.regiao].nome}. A região define a faixa de frequência (em MHz) em que o rádio transmite; as contas usam ${num(REGIOES[p.regiao].frequenciaMHz, 2)} MHz.`;
    if (foco !== modo) modo.value = modoDoProjeto(p).id;
    if (foco !== margem) margem.value = String(p.margemDoAmbienteDb);
    if (foco !== saltos) saltos.value = String(p.limiteDeSaltos);
    const m = modoDoProjeto(p);
    modoDetalhe.replaceChildren(
      `Neste modo: taxa de ${num(m.taxaKbps, 2)} kbps (velocidade dos dados) e `,
      termo('sensibilidade', GLOSSARIO.sensibilidade),
      ` de ${dbmTexto(m.sensibilidadeDbm)}. Quanto mais negativo, mais fraco é o sinal que o rádio entende.`,
    );
  };
  atualizar();
  return { elemento, atualizar };
}

// ---------------------------------------------------------------- Montagem

/** Monta os painéis dentro de `raiz` (o `#lora-direita`) e os mantém atualizados. */
export function montarPaineisLora(raiz: HTMLElement): void {
  const area = h('div', { class: 'lora-area' });
  const configuracao = montarConfiguracao();
  raiz.replaceChildren(area, configuracao.elemento);

  let chave = '';
  let painelDoPonto: PainelDoPonto | null = null;

  const trocar = (...filhos: Filho[]): void => area.replaceChildren(...(filhos.filter(Boolean) as Node[]));

  const redesenhar = (): void => {
    const sel = estadoLora.selecao;
    if (sel?.tipo === 'ponto' && estadoLora.projeto.pontos.some((p) => p.id === sel.id)) {
      const nova = `ponto:${sel.id}`;
      if (nova === chave && painelDoPonto) {
        painelDoPonto.atualizar();
        return;
      }
      chave = nova;
      painelDoPonto = montarPainelDoPonto(sel.id);
      trocar(painelDoPonto.elemento);
      return;
    }
    chave = '';
    painelDoPonto = null;
    if (sel?.tipo === 'enlace' && estadoLora.projeto.enlaces.some((e) => (e.de === sel.de && e.para === sel.para) || (e.de === sel.para && e.para === sel.de))) {
      trocar(montarPainelDoEnlace(sel.de, sel.para));
    } else {
      trocar(montarResumo());
    }
  };

  const aoMudar = (): void => {
    configuracao.atualizar();
    redesenhar();
  };
  assinarLora('projeto', aoMudar);
  assinarLora('selecao', redesenhar);
  assinarCalculo(redesenhar);
  redesenhar();
}
