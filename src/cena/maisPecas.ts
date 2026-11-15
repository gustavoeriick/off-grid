// Ações do consultor que acrescentam uma peça e refazem os cabos: `mais-placa` e `mais-bateria`.
// Especificação: docs/especificacao/consultor.md (tabela de ações e `planejarMaisPlaca`).
//
// Cada ação monta o projeto novo de uma vez e o entrega com `acoes.carregarProjeto`, que guarda um único ponto
// de retorno: `acoes.adicionarDispositivo`, `adicionarCabo` e `removerCabo` não aceitam `historico: false`, e não há
// ação para trocar a ponta de um cabo sem perder as proteções dele.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Item } from '../catalogo/tipos';
import { acoes, type Encaixe, estado } from '../estado';
import { analisarCircuito } from '../nucleo/circuito';
import { planejarMaisPlaca } from '../nucleo/consultor';
import type { Cabo, Dispositivo, PontaCabo, Projeto } from '../nucleo/tipos';
import { comprimentoDoTrecho, type CamadaDeCabos } from './cabos';
import type { Lugares } from './lugares';
import { modeloDe } from './modelos';

export interface Resultado {
  /** `uid` da peça criada. Nulo se a ação não pôde ser feita. */
  uid: string | null;
  /** O que dizer ao usuário quando não deu. */
  motivo?: string;
}

function novoUid(prefixo: string, usados: string[]): string {
  const conjunto = new Set(usados);
  let n = conjunto.size + 1;
  while (conjunto.has(`${prefixo}${n}`)) n += 1;
  return `${prefixo}${n}`;
}

/** Posição de um terminal de uma peça que ainda não está na cena, pelo encaixe dela. */
function terminalEm(item: Item, e: { pos: readonly number[]; quat: readonly number[] }, id: string): THREE.Vector3 | null {
  const t = modeloDe(item)?.terminais.find((x) => x.id === id);
  if (!t) return null;
  return new THREE.Vector3(...t.pos).applyQuaternion(new THREE.Quaternion(e.quat[0], e.quat[1], e.quat[2], e.quat[3])).add(new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]));
}

function comprimento(projeto: Projeto, de: PontaCabo, para: PontaCabo): number {
  const ponta = (p: PontaCabo): THREE.Vector3 | null => {
    const d = projeto.dispositivos.find((x) => x.uid === p.disp);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    return d && item ? terminalEm(item, d, p.terminal) : null;
  };
  const a = ponta(de);
  const b = ponta(para);
  return a && b ? comprimentoDoTrecho(a, b) : 0.3;
}

function cabo(projeto: Projeto, de: PontaCabo, para: PontaCabo, caboId: string): Cabo {
  const uid = novoUid('c', projeto.cabos.map((c) => c.uid));
  const novo: Cabo = { uid, de, para, caboId, comprimento: comprimento(projeto, de, para), protecoes: [], quadro: null };
  projeto.cabos.push(novo);
  return novo;
}

function mesmaPonta(a: PontaCabo, disp: string, terminal: string): boolean {
  return a.disp === disp && a.terminal === terminal;
}

/** Entrega o projeto novo em um único ponto de retorno, mede os cabos mexidos pelo desenho e seleciona a peça nova. */
function entregar(projeto: Projeto, uid: string, cabos: CamadaDeCabos, mexidos: string[]): void {
  acoes.carregarProjeto(projeto);
  cabos.medir(mexidos);
  acoes.selecionar({ tipo: 'dispositivo', uid });
}

/**
 * Acrescenta uma placa do mesmo item ao lado da última da fileira: na próxima posição livre da grade do mesmo
 * telhado ou, se não couber, na água livre mais próxima. Os cabos seguem `planejarMaisPlaca`: em série, a placa nova
 * entra entre a última e o PV−, com uma emenda; em paralelo, vai direto ao PV+ e ao PV− da entrada.
 */
export function acrescentarPlaca(lugares: Lugares, cabos: CamadaDeCabos): Resultado {
  const atual = estado.projeto;
  const analise = analisarCircuito(atual, CATALOGO);
  const plano = planejarMaisPlaca(atual, CATALOGO, analise);
  const sistema = analise.sistema;
  if (!plano || !sistema) return { uid: null, motivo: 'Esta entrada não aceita mais placas deste modelo.' };
  const dono = sistema.controlador ?? sistema.inversor;

  const ehPlaca = (d: Dispositivo): boolean => CATALOGO.get(d.itemId)?.categoria === 'placa';
  const fileira = sistema.fileiras[sistema.fileiras.length - 1] ?? [];
  const ultimaUid = fileira[fileira.length - 1];
  // Sem fileira ligada, a referência é a última placa posta na casa.
  const ultima = atual.dispositivos.find((d) => d.uid === ultimaUid) ?? [...atual.dispositivos].reverse().find((d) => ehPlaca(d) && d.superficie !== null);
  const item = ultima ? CATALOGO.get(ultima.itemId) : undefined;
  if (!ultima || !item || item.categoria !== 'placa') return { uid: null, motivo: 'Arraste primeiro uma placa do catálogo para o telhado.' };

  // ---- Lugar: ao lado da última; depois, a água livre mais próxima.
  let encaixe: Encaixe | null = null;
  const q = lugares.quadroDaPeca(ultima);
  const centro = new THREE.Vector3(...ultima.pos);
  if (q) encaixe = lugares.lugarLivre(item, ultima.giro, q, centro.dot(q.u), centro.dot(q.v), { pularOrigem: true });
  encaixe ??= lugares.lugarEmOutraAgua(item, ultima.giro, centro, ultima.superficie);
  if (!encaixe) return { uid: null, motivo: 'Não há lugar livre no telhado para mais uma placa deste tamanho.' };

  // ---- Projeto novo.
  const projeto = structuredClone(atual);
  const uid = novoUid('d', projeto.dispositivos.map((d) => d.uid));
  projeto.dispositivos.push({ uid, itemId: item.id, ...encaixe, ligado: true, uso: null });
  const daFileira = new Set(fileira);
  const caboDaFileira = projeto.cabos.find((c) => daFileira.has(c.de.disp) || daFileira.has(c.para.disp));
  const tipoDeCabo = caboDaFileira?.caboId ?? 'cabo-solar-6';
  const mexidos: string[] = [];

  if (plano.modo === 'serie' && fileira.length > 0) {
    // O cabo que ia do negativo da última placa para fora da fileira (o PV−) passa a sair da placa nova.
    const paraFora = projeto.cabos.find((c) => {
      const outra = mesmaPonta(c.de, ultima.uid, 'neg') ? c.para : mesmaPonta(c.para, ultima.uid, 'neg') ? c.de : null;
      const dispositivo = outra ? projeto.dispositivos.find((d) => d.uid === outra.disp) : undefined;
      return dispositivo !== undefined && !ehPlaca(dispositivo);
    });
    if (paraFora) {
      if (mesmaPonta(paraFora.de, ultima.uid, 'neg')) paraFora.de = { disp: uid, terminal: 'neg' };
      else paraFora.para = { disp: uid, terminal: 'neg' };
      paraFora.comprimento = comprimento(projeto, paraFora.de, paraFora.para);
      mexidos.push(paraFora.uid);
    } else {
      mexidos.push(cabo(projeto, { disp: uid, terminal: 'neg' }, { disp: dono, terminal: 'pvNeg' }, tipoDeCabo).uid);
    }
    // Emenda entre as duas placas.
    mexidos.push(cabo(projeto, { disp: ultima.uid, terminal: 'neg' }, { disp: uid, terminal: 'pos' }, tipoDeCabo).uid);
  } else {
    // Em paralelo (ou primeira placa ligada): positivo com positivo e negativo com negativo da entrada.
    mexidos.push(cabo(projeto, { disp: uid, terminal: 'pos' }, { disp: dono, terminal: 'pvPos' }, tipoDeCabo).uid);
    mexidos.push(cabo(projeto, { disp: uid, terminal: 'neg' }, { disp: dono, terminal: 'pvNeg' }, tipoDeCabo).uid);
  }
  entregar(projeto, uid, cabos, mexidos);
  return { uid };
}

/**
 * Acrescenta uma bateria do mesmo item ao lado da primeira, no mesmo piso, ligada em paralelo:
 * positivo com positivo e negativo com negativo, com o mesmo tipo de cabo do banco.
 */
export function acrescentarBateria(lugares: Lugares, cabos: CamadaDeCabos): Resultado {
  const atual = estado.projeto;
  const analise = analisarCircuito(atual, CATALOGO);
  const ehBateria = (d: Dispositivo): boolean => CATALOGO.get(d.itemId)?.categoria === 'bateria';
  const primeiraUid = analise.sistema?.banco[0]?.[0];
  const primeira = atual.dispositivos.find((d) => d.uid === primeiraUid) ?? atual.dispositivos.find((d) => ehBateria(d) && d.superficie !== null);
  const item = primeira ? CATALOGO.get(primeira.itemId) : undefined;
  if (!primeira || !item || item.categoria !== 'bateria') return { uid: null, motivo: 'Arraste primeiro uma bateria do catálogo para o piso.' };

  const q = lugares.quadroDaPeca(primeira);
  if (!q) return { uid: null, motivo: 'A bateria não está em um piso.' };
  const centro = new THREE.Vector3(...primeira.pos);
  const [l, p] = lugares.medida(item, primeira.giro, q);
  // Lado a lado, com 4 cm entre elas; sem lugar na fila, uma fila à frente.
  const encaixe =
    lugares.lugarLivre(item, primeira.giro, q, centro.dot(q.u), centro.dot(q.v), { pularOrigem: true, passo: [l + 0.04, p + 0.06], emFila: true }) ??
    lugares.lugarLivre(item, primeira.giro, q, centro.dot(q.u), centro.dot(q.v), { pularOrigem: true });
  if (!encaixe) return { uid: null, motivo: 'Não há lugar livre neste piso para mais uma bateria.' };

  const projeto = structuredClone(atual);
  const uid = novoUid('d', projeto.dispositivos.map((d) => d.uid));
  projeto.dispositivos.push({ uid, itemId: item.id, ...encaixe, ligado: true, uso: null });
  const doBanco = projeto.cabos.find((c) => {
    const tipo = CATALOGO.get(c.caboId);
    return (c.de.disp === primeira.uid || c.para.disp === primeira.uid) && tipo?.categoria === 'cabo' && tipo.uso === 'bateria';
  });
  const tipoDeCabo = doBanco?.caboId ?? 'cabo-bat-35';
  const mexidos = [
    cabo(projeto, { disp: primeira.uid, terminal: 'pos' }, { disp: uid, terminal: 'pos' }, tipoDeCabo).uid,
    cabo(projeto, { disp: primeira.uid, terminal: 'neg' }, { disp: uid, terminal: 'neg' }, tipoDeCabo).uid,
  ];
  entregar(projeto, uid, cabos, mexidos);
  return { uid };
}
