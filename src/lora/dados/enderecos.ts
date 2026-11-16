// Busca de endereço do simulador LoRa. Especificação: docs/especificacao/lora.md, seção 7.1.
// É a única parte do ambiente que manda para fora algo que a pessoa digitou. Por isso:
// - o pedido leva só o texto e os parâmetros fixos da especificação (nenhuma coordenada de ponto, nenhuma área da tela);
// - sem cabeçalhos próprios e sem `referrerPolicy`: o navegador manda o `Referer` sozinho, como a política do serviço pede;
// - um pedido por vez, com intervalo mínimo de 1 s, cancelamento do anterior e espera máxima de 10 s;
// - os resultados ficam em memória só enquanto a página está aberta (nada em localStorage, projeto ou exportação).
// O endereço do serviço e a leitura da resposta ficam todos aqui, para trocar de serviço mexendo em um arquivo só.

/** Serviço de endereços do OpenStreetMap (Nominatim). Política: https://operations.osmfoundation.org/policies/nominatim/ */
export const ENDERECO_DO_SERVICO = 'https://nominatim.openstreetmap.org/search';
/** Texto de atribuição que a política exige junto da lista. */
export const ATRIBUICAO_DOS_ENDERECOS = 'Resultados: © colaboradores do OpenStreetMap, pelo Nominatim';
export const LINK_DA_ATRIBUICAO = 'https://www.openstreetmap.org/copyright';

export const TAMANHO_MINIMO_DO_TEXTO = 3;
export const LIMITE_DE_RESULTADOS = 5;
/** Espera máxima por uma resposta. */
export const ESPERA_MAXIMA_MS = 10_000;
/** Intervalo mínimo entre dois pedidos ao serviço. */
export const INTERVALO_MINIMO_MS = 1000;

export type EscopoDaBusca = 'brasil' | 'mundo';

export interface CaixaDoLugar {
  sul: number;
  norte: number;
  oeste: number;
  leste: number;
}

export interface ResultadoDeEndereco {
  /** `display_name` do serviço. Sempre texto puro: quem desenha usa `textContent`. */
  nome: string;
  lat: number;
  lon: number;
  /** Nulo quando a resposta não trouxe uma caixa utilizável. */
  caixa: CaixaDoLugar | null;
}

/** `recusa`: HTTP 403 ou 429. `falha`: sem rede, tempo esgotado ou resposta ilegível. `cancelada`: uma busca nova tomou o lugar. */
export type TipoDeErroDeEndereco = 'recusa' | 'falha' | 'cancelada';

export class ErroDeEndereco extends Error {
  readonly tipo: TipoDeErroDeEndereco;
  constructor(tipo: TipoDeErroDeEndereco, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeEndereco';
    this.tipo = tipo;
  }
}

/** Texto como a pessoa digitou, sem espaços nas pontas. */
export function textoDaBusca(texto: string): string {
  return texto.trim();
}

/** Texto usado como chave do cache: sem espaços repetidos nem diferença de maiúsculas. */
export function textoNormalizado(texto: string): string {
  return textoDaBusca(texto).replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/** Verdadeiro se o texto tem o mínimo para gerar um pedido. */
export function textoBasta(texto: string): boolean {
  return textoDaBusca(texto).length >= TAMANHO_MINIMO_DO_TEXTO;
}

/**
 * Endereço do pedido. Exatamente estes parâmetros, nesta ordem: `q`, `format=jsonv2`, `limit=5`, `accept-language=pt-BR`
 * e, no escopo Brasil, `countrycodes=br`. Nada mais: nem e-mail, nem a área da tela, nem coordenada de ponto.
 */
export function urlDaBusca(texto: string, escopo: EscopoDaBusca): string {
  const p = new URLSearchParams();
  p.set('q', textoDaBusca(texto));
  p.set('format', 'jsonv2');
  p.set('limit', String(LIMITE_DE_RESULTADOS));
  p.set('accept-language', 'pt-BR');
  if (escopo === 'brasil') p.set('countrycodes', 'br');
  return `${ENDERECO_DO_SERVICO}?${p.toString()}`;
}

/** O serviço manda números como texto ("-10.5"). Aceita número ou texto numérico; o resto vira `null`. */
function numeroDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** `boundingbox` do serviço: [sul, norte, oeste, leste]. Caixa fora dos limites ou de ponta-cabeça é descartada. */
function caixaDe(v: unknown): CaixaDoLugar | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [sul, norte, oeste, leste] = v.map(numeroDe);
  if (sul === null || norte === null || oeste === null || leste === null) return null;
  if (sul < -90 || norte > 90 || oeste < -180 || leste > 180) return null;
  if (sul! > norte! || oeste! > leste!) return null;
  return { sul: sul!, norte: norte!, oeste: oeste!, leste: leste! };
}

/**
 * Lê a resposta do serviço. Resposta que não é lista lança erro (conta como falha). Item sem `display_name` em texto
 * ou com latitude ou longitude que não seja número dentro dos limites é descartado. No máximo 5 itens.
 */
export function lerRespostaDeEnderecos(resposta: unknown): ResultadoDeEndereco[] {
  if (!Array.isArray(resposta)) throw new ErroDeEndereco('falha', 'A resposta do serviço de endereços não é uma lista.');
  const lista: ResultadoDeEndereco[] = [];
  for (const item of resposta) {
    if (lista.length >= LIMITE_DE_RESULTADOS) break;
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const nome = typeof r.display_name === 'string' ? r.display_name.trim() : '';
    const lat = numeroDe(r.lat);
    const lon = numeroDe(r.lon);
    if (nome === '' || lat === null || lon === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    lista.push({ nome, lat, lon, caixa: caixaDe(r.boundingbox) });
  }
  return lista;
}

// ---------------------------------------------------------------- Pedido de verdade

/** Guarda em memória, só enquanto a página está aberta. Chave: texto normalizado + escopo. */
const cache = new Map<string, ResultadoDeEndereco[]>();
let pedidoEmCurso: AbortController | null = null;
let instanteDoUltimoPedido = Number.NEGATIVE_INFINITY;

/** Espera `ms`, mas acorda na hora se o pedido for cancelado. */
function esperar(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sinal.aborted) {
      reject(new ErroDeEndereco('cancelada', 'Busca cancelada.'));
      return;
    }
    const t = setTimeout(() => {
      sinal.removeEventListener('abort', aoCancelar);
      resolve();
    }, ms);
    const aoCancelar = (): void => {
      clearTimeout(t);
      reject(new ErroDeEndereco('cancelada', 'Busca cancelada.'));
    };
    sinal.addEventListener('abort', aoCancelar, { once: true });
  });
}

/**
 * Busca endereços. Uma busca nova cancela a anterior. Repetir o mesmo texto e escopo responde do cache, sem pedido.
 * Lança `ErroDeEndereco`. O texto precisa passar por `textoBasta` antes (a tela cuida disso).
 */
export async function buscarEnderecos(texto: string, escopo: EscopoDaBusca): Promise<ResultadoDeEndereco[]> {
  const chave = `${escopo}|${textoNormalizado(texto)}`;
  pedidoEmCurso?.abort();
  const controlador = new AbortController();
  pedidoEmCurso = controlador;

  const guardado = cache.get(chave);
  if (guardado) {
    pedidoEmCurso = null;
    return guardado;
  }

  const esgotou = { valor: false };
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  try {
    // Um pedido por segundo, no máximo.
    const espera = INTERVALO_MINIMO_MS - (Date.now() - instanteDoUltimoPedido);
    if (espera > 0) await esperar(espera, controlador.signal);
    temporizador = setTimeout(() => {
      esgotou.valor = true;
      controlador.abort();
    }, ESPERA_MAXIMA_MS);
    instanteDoUltimoPedido = Date.now();

    let resposta: Response;
    try {
      // Sem cabeçalhos próprios e sem referrerPolicy: o navegador manda o Referer sozinho.
      resposta = await fetch(urlDaBusca(texto, escopo), { signal: controlador.signal });
    } catch {
      if (esgotou.valor) throw new ErroDeEndereco('falha', 'Tempo esgotado.');
      if (controlador.signal.aborted) throw new ErroDeEndereco('cancelada', 'Busca cancelada.');
      throw new ErroDeEndereco('falha', 'Sem resposta do serviço de endereços.');
    }
    if (resposta.status === 403 || resposta.status === 429) throw new ErroDeEndereco('recusa', `O serviço recusou o pedido (HTTP ${resposta.status}).`);
    if (!resposta.ok) throw new ErroDeEndereco('falha', `O serviço respondeu HTTP ${resposta.status}.`);
    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      if (esgotou.valor) throw new ErroDeEndereco('falha', 'Tempo esgotado.');
      if (controlador.signal.aborted) throw new ErroDeEndereco('cancelada', 'Busca cancelada.');
      throw new ErroDeEndereco('falha', 'Resposta ilegível.');
    }
    const lista = lerRespostaDeEnderecos(corpo);
    cache.set(chave, lista);
    return lista;
  } finally {
    if (temporizador !== null) clearTimeout(temporizador);
    if (pedidoEmCurso === controlador) pedidoEmCurso = null;
  }
}

/** Cancela o pedido em andamento, se houver (por exemplo, na troca de projeto). */
export function cancelarBuscaDeEndereco(): void {
  pedidoEmCurso?.abort();
}
