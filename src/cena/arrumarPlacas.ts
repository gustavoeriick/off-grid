// "Arrumar as placas": realinha as placas de uma água de telhado, ou de todas, para caber o máximo.
//
// Este arquivo mede a cena (o retângulo da água e a pegada de cada placa nela) e entrega as medidas a
// `arrumarPlacas`, de `gradeDasPlacas.ts`, que faz a conta. As posições novas são conferidas com `assentar` (borda e
// recorte do telhado) e aplicadas de uma vez com `acoes.moverDispositivos`: um passo só de desfazer. Nenhum cabo é
// solto; o comprimento deles é remedido pela camada de cabos, como quando uma placa é arrastada.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Item } from '../catalogo/tipos';
import { acoes, type Encaixe, estado } from '../estado';
import type { Dispositivo } from '../nucleo/tipos';
import { arrumarPlacas, type PlacaNaAgua } from './gradeDasPlacas';
import type { Lugares } from './lugares';

export interface AguaArrumada {
  /** `id` da superfície. */
  superficie: string;
  /** Nome da água, para a tela: "telhado do quartinho". */
  nome: string;
  /** Placas que há nela. */
  placas: number;
  /** Placas que mudaram de lugar. */
  movidas: number;
  /** Por que não deu para arrumar esta água. Nulo quando deu, ou quando já estava arrumada. */
  motivo: string | null;
}

export interface ResultadoDeArrumarPlacas {
  /** Placas que mudaram de lugar, no total. */
  movidas: number;
  /** Uma entrada por água de telhado com placa. */
  aguas: AguaArrumada[];
  /** O que houve, em uma frase para a tela. */
  mensagem: string;
  /** Verdadeiro quando alguma água não pôde ser arrumada. */
  erro: boolean;
}

export interface ArrumadorDePlacas {
  /** Arruma as placas da água de `id` dado ou, sem ele, de todas as águas que têm placa. */
  arrumar(superficie?: string): ResultadoDeArrumarPlacas;
}

const LADO: Record<string, string> = { frente: 'da frente', fundos: 'dos fundos', esquerda: 'da esquerda', direita: 'da direita' };

/** Nome de uma água de telhado, para a tela. */
export function nomeDoTelhado(id: string): string {
  if (id === 'telhado-quartinho') return 'telhado do quartinho';
  if (id.startsWith('telhado-varanda-')) return `telhado da varanda ${LADO[id.slice('telhado-varanda-'.length)] ?? ''}`.trim();
  const lado = LADO[id.slice('telhado-'.length)];
  return lado ? `telhado da casa, lado ${lado}` : 'telhado';
}

const placas = (n: number): string => (n === 1 ? '1 placa arrumada' : `${n} placas arrumadas`);

/** A frase da tela para o resultado de "Arrumar as placas". */
export function mensagemDaArrumacao(aguas: readonly AguaArrumada[]): string {
  if (aguas.length === 0) return 'Não há placas em telhado para arrumar.';
  const arrumadas = aguas.filter((a) => a.movidas > 0);
  const recusadas = aguas.filter((a) => a.motivo !== null);
  const total = arrumadas.reduce((soma, a) => soma + a.movidas, 0);
  const partes: string[] = [];
  if (arrumadas.length === 1) partes.push(`${placas(total)} no ${arrumadas[0]!.nome}.`);
  else if (arrumadas.length > 1) partes.push(`${placas(total)} em ${arrumadas.length} telhados.`);
  for (const a of recusadas) partes.push(`Não deu para arrumar as placas do ${a.nome}: nada foi mexido nele. ${a.motivo}`);
  if (partes.length === 0) return 'As placas já estão arrumadas.';
  return partes.join(' ');
}

export function criarArrumadorDePlacas(lugares: Lugares): ArrumadorDePlacas {
  function arrumar(superficie?: string): ResultadoDeArrumarPlacas {
    const telhados = new Set(lugares.idsDoTipo('telhado'));
    const porAgua = new Map<string, { d: Dispositivo; item: Item }[]>();
    for (const d of estado.projeto.dispositivos) {
      const item = CATALOGO.get(d.itemId);
      if (item?.categoria !== 'placa' || d.superficie === null || !telhados.has(d.superficie)) continue;
      if (superficie !== undefined && d.superficie !== superficie) continue;
      const lista = porAgua.get(d.superficie);
      if (lista) lista.push({ d, item });
      else porAgua.set(d.superficie, [{ d, item }]);
    }

    const aguas: AguaArrumada[] = [];
    const encaixes = new Map<string, Encaixe>();
    for (const [id, lista] of porAgua) {
      const agua: AguaArrumada = { superficie: id, nome: nomeDoTelhado(id), placas: lista.length, movidas: 0, motivo: null };
      aguas.push(agua);
      const q = lugares.quadro(id);
      if (!q) {
        agua.motivo = 'A cena não achou este telhado.';
        continue;
      }
      const naAgua: PlacaNaAgua[] = lista.map(({ d, item }) => {
        const [u, v] = lugares.noQuadro(q, new THREE.Vector3(...d.pos));
        const [largura, altura] = lugares.medida(item, d.giro, q);
        return { uid: d.uid, u, v, largura, altura };
      });
      const conta = arrumarPlacas(q, naAgua);
      if (!conta.ok) {
        agua.motivo = conta.motivo;
        continue;
      }
      if (conta.movidas === 0) continue;
      // Confere cada lugar novo na cena: a conta vê um retângulo, e a água pode ter um canto cortado.
      const novos = new Map<string, Encaixe>();
      let movidas = 0;
      for (const [i, { d, item }] of lista.entries()) {
        const alvo = conta.posicoes.get(d.uid)!;
        const antes = naAgua[i]!;
        if (Math.abs(alvo.u - antes.u) <= 0.0005 && Math.abs(alvo.v - antes.v) <= 0.0005) continue;
        // As vizinhas não contam: a conta já pôs a folga entre todas, e elas também estão de mudança.
        const c = lugares.assentar(item, d.giro, q, alvo.u, alvo.v, { ignorar: 'todas', prender: false });
        const [u, v] = lugares.noQuadro(q, new THREE.Vector3(...c.encaixe.pos));
        if (!c.valido || Math.abs(u - alvo.u) > 0.001 || Math.abs(v - alvo.v) > 0.001) {
          agua.motivo = 'Este telhado não é um retângulo inteiro, e uma das placas ficaria fora dele.';
          break;
        }
        novos.set(d.uid, c.encaixe);
        movidas++;
      }
      if (agua.motivo !== null) continue;
      agua.movidas = movidas;
      for (const [uid, e] of novos) encaixes.set(uid, e);
    }

    // Tudo de uma vez: um passo só de desfazer. A camada de cabos remede os cabos ligados às placas em seguida.
    if (encaixes.size > 0) acoes.moverDispositivos(encaixes);
    return { movidas: encaixes.size, aguas, mensagem: mensagemDaArrumacao(aguas), erro: aguas.some((a) => a.motivo !== null) };
  }
  return { arrumar };
}
