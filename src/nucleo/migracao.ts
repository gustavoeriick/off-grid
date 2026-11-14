// Conversão de projetos salvos. Especificação: docs/especificacao/fase-2.md, seções 1.1 e 5. Tarefa 2.0.

import { CASA_INICIAL } from './cenarios';
import type { Cabo, Dispositivo, LadoCasa, Projeto, Varanda } from './tipos';

/** A varanda do formato da versão 1: uma só, sem largura nem deslocamento. */
interface VarandaV1 {
  lado: LadoCasa;
  profundidade: number;
  inclinacaoPct: number;
}

function ehObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** As medidas que a fase 1 usava para desenhar as três paredes internas fixas. */
function medidasIniciais(casa: Record<string, unknown>): boolean {
  return (
    casa.largura === CASA_INICIAL.largura &&
    casa.profundidade === CASA_INICIAL.profundidade &&
    casa.andares === CASA_INICIAL.andares &&
    casa.peDireito === CASA_INICIAL.peDireito
  );
}

/**
 * Converte o que veio de um arquivo ou do armazenamento em um `Projeto` da versão atual.
 *
 * - Versão 2: devolvida como está (a estrutura não é conferida a fundo).
 * - Versão 1: a varanda única vira a lista `varandas` (`largura: null`, `deslocamento: 0`); as superfícies `telhado-varanda`
 *   e `piso-varanda` ganham o lado; `paredesInternas` e `comodos` da casa inicial entram só se as medidas forem as iniciais
 *   (senão ficam vazios); cada cabo ganha `quadro: null`. O objeto de entrada não é alterado.
 * - Outra versão, ou dado que não é um projeto: lança `Error` com mensagem em português.
 */
export function converterProjeto(dados: unknown): Projeto {
  if (!ehObjeto(dados)) throw new Error('O arquivo não é um projeto do simulador.');
  const versao = dados.versao;
  if (versao === 2) return dados as unknown as Projeto;
  if (versao !== 1) {
    const dita = versao === undefined ? 'sem versão' : `de versão ${JSON.stringify(versao)}`;
    throw new Error(`Este projeto é ${dita}, e o simulador só abre as versões 1 e 2. Ele pode ter sido salvo por uma versão mais nova do simulador.`);
  }
  if (!ehObjeto(dados.casa) || !Array.isArray(dados.dispositivos) || !Array.isArray(dados.cabos)) {
    throw new Error('O projeto da versão 1 está incompleto: faltam a casa, os dispositivos ou os cabos.');
  }

  const projeto = structuredClone(dados) as Record<string, unknown>;
  const casaV1 = projeto.casa as Record<string, unknown>;
  const varanda = (casaV1.varanda ?? null) as VarandaV1 | null;
  const inicial = medidasIniciais(casaV1);

  const varandas: Varanda[] = varanda === null ? [] : [{ ...varanda, largura: null, deslocamento: 0 }];
  delete casaV1.varanda;
  casaV1.varandas = varandas;
  casaV1.paredesInternas = inicial ? structuredClone(CASA_INICIAL.paredesInternas) : [];
  casaV1.comodos = inicial ? structuredClone(CASA_INICIAL.comodos) : [];

  const lado = varanda?.lado;
  for (const d of projeto.dispositivos as Dispositivo[]) {
    if (lado !== undefined && (d.superficie === 'telhado-varanda' || d.superficie === 'piso-varanda')) {
      d.superficie = `${d.superficie}-${lado}`;
    }
  }
  for (const c of projeto.cabos as Cabo[]) {
    c.quadro = null;
  }

  projeto.versao = 2;
  return projeto as unknown as Projeto;
}
