// Relevo do simulador LoRa: baixa blocos Terrarium, guarda na memória e responde altitudes.
// Nunca envia coordenadas: só pede blocos pelo endereço. Especificação: docs/especificacao/lora.md, seção 5.
import type { AltitudeEm, Coordenada } from '../nucleo/tipos';
import {
  altitudeDoPixel,
  altitudeNosBlocos,
  blocosDoCaminho,
  chaveDoBloco,
  LADO_DO_BLOCO,
  urlDoBloco,
  ZOOM_DO_RELEVO,
  type Bloco,
} from './blocos';

export interface OpcoesDoRelevo {
  /** Baixa o arquivo do bloco. Padrão: `fetch` do navegador. */
  buscar?: (url: string) => Promise<Blob>;
  /** Devolve os pixels RGBA (256×256×4) de um PNG. Padrão: `createImageBitmap` + canvas. */
  decodificar?: (resposta: Blob) => Promise<Uint8ClampedArray>;
  /** Downloads ao mesmo tempo. Padrão: 6. */
  simultaneos?: number;
}

export interface Relevo {
  /** Baixa os blocos que faltam para os pontos (e os vizinhos das pontas). */
  carregar(pontos: Coordenada[]): Promise<void>;
  /** Altitude em metros sobre o que já foi carregado. Lança erro se faltar o bloco. */
  altitudeEm: AltitudeEm;
  /** Texto de atribuição dos dados, para a tela. */
  atribuicao: string;
}

export const ATRIBUICAO_DO_RELEVO =
  'Relevo: Terrain Tiles (Mapzen, SRTM e outras fontes), hospedado na AWS.';

async function buscarPadrao(url: string): Promise<Blob> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`resposta ${resposta.status}`);
  return resposta.blob();
}

async function decodificarPadrao(resposta: Blob): Promise<Uint8ClampedArray> {
  const imagem = await createImageBitmap(resposta);
  try {
    const tela =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(imagem.width, imagem.height)
        : Object.assign(document.createElement('canvas'), { width: imagem.width, height: imagem.height });
    const contexto = tela.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!contexto) throw new Error('canvas sem contexto 2D');
    contexto.drawImage(imagem, 0, 0);
    return contexto.getImageData(0, 0, imagem.width, imagem.height).data;
  } finally {
    imagem.close();
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function criarRelevo(opcoes: OpcoesDoRelevo = {}): Relevo {
  const buscar = opcoes.buscar ?? buscarPadrao;
  const decodificar = opcoes.decodificar ?? decodificarPadrao;
  const limite = opcoes.simultaneos ?? 6;

  const blocos = new Map<string, Bloco>();
  const emAndamento = new Map<string, Promise<void>>();

  // Limite de downloads simultâneos: fila simples.
  let ativos = 0;
  const fila: (() => void)[] = [];
  async function comVaga<T>(tarefa: () => Promise<T>): Promise<T> {
    if (ativos >= limite) await new Promise<void>((liberar) => fila.push(liberar));
    ativos++;
    try {
      return await tarefa();
    } finally {
      ativos--;
      fila.shift()?.();
    }
  }

  async function baixar(z: number, x: number, y: number): Promise<Bloco> {
    const rotulo = `bloco de relevo ${chaveDoBloco(z, x, y)}`;
    let arquivo: Blob;
    try {
      arquivo = await buscar(urlDoBloco(z, x, y));
    } catch (erro) {
      throw new Error(`Não foi possível baixar o ${rotulo}: ${mensagemDe(erro)}.`);
    }
    let rgba: Uint8ClampedArray;
    try {
      rgba = await decodificar(arquivo);
    } catch (erro) {
      throw new Error(`Não foi possível decodificar a imagem do ${rotulo}: ${mensagemDe(erro)}.`);
    }
    if (rgba.length !== LADO_DO_BLOCO * LADO_DO_BLOCO * 4) {
      throw new Error(
        `Não foi possível decodificar a imagem do ${rotulo}: tamanho inesperado (${rgba.length} valores em vez de ${LADO_DO_BLOCO * LADO_DO_BLOCO * 4}).`,
      );
    }
    const bloco = new Float32Array(LADO_DO_BLOCO * LADO_DO_BLOCO);
    for (let i = 0; i < bloco.length; i++) {
      bloco[i] = altitudeDoPixel(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    }
    return bloco;
  }

  function garantir(z: number, x: number, y: number): Promise<void> | null {
    const chave = chaveDoBloco(z, x, y);
    if (blocos.has(chave)) return null;
    const existente = emAndamento.get(chave);
    if (existente) return existente;
    const promessa = comVaga(() => baixar(z, x, y))
      .then((bloco) => {
        blocos.set(chave, bloco);
      })
      .finally(() => {
        emAndamento.delete(chave);
      });
    emAndamento.set(chave, promessa);
    return promessa;
  }

  return {
    async carregar(pontos) {
      const pedidos: Promise<void>[] = [];
      for (const { x, y } of blocosDoCaminho(pontos, ZOOM_DO_RELEVO)) {
        const p = garantir(ZOOM_DO_RELEVO, x, y);
        if (p) pedidos.push(p);
      }
      // Espera todos terminarem e só então falha, para não deixar downloads soltos.
      const resultados = await Promise.allSettled(pedidos);
      const falha = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (falha) throw falha.reason;
    },
    altitudeEm: (ponto) => altitudeNosBlocos(blocos, ponto, ZOOM_DO_RELEVO),
    atribuicao: ATRIBUICAO_DO_RELEVO,
  };
}
