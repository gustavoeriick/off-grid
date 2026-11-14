// Topologia do circuito a partir dos cabos. Especificação: docs/especificacao/nucleo.md, seção 8. Tarefa 1.4.

import type { Catalogo, EntradaSolar, Item } from '../catalogo/tipos';
import type { AnaliseCircuito, CodigoProblema, Dispositivo, ProblemaCircuito, Projeto } from './tipos';

/** Maior número de peças em série que a busca aceita em um ramo ou fileira. */
const LIMITE_EM_SERIE = 40;

/** Identificador da rede de um terminal. */
export type Rede = (disp: string, terminal: string) => string;

/** Redes elétricas: terminais ligados por cabos, direta ou indiretamente. União de conjuntos sobre `uid:terminal`. Terminal sem cabo é uma rede sozinha. */
export function montarRedes(projeto: Projeto): Rede {
  const pai = new Map<string, string>();
  const raiz = (chave: string): string => {
    let r = chave;
    for (let p = pai.get(r); p !== undefined && p !== r; p = pai.get(r)) r = p;
    // Compressão do caminho.
    let c = chave;
    while (c !== r) {
      const p = pai.get(c)!;
      pai.set(c, r);
      c = p;
    }
    return r;
  };
  for (const c of projeto.cabos) {
    const ra = raiz(`${c.de.disp}:${c.de.terminal}`);
    const rb = raiz(`${c.para.disp}:${c.para.terminal}`);
    if (ra !== rb) pai.set(ra, rb);
  }
  return (disp, terminal) => raiz(`${disp}:${terminal}`);
}

interface Peca {
  uid: string;
  itemId: string;
}

/** Caminhos aceitos e as peças dos caminhos descartados por repetir peça de um caminho já aceito. */
interface Busca {
  aceitos: string[][];
  /** Peças dos caminhos descartados que não ficaram em caminho aceito: primeiro as repetidas, depois as demais. */
  repetidas: string[];
}

/**
 * Busca em profundidade de peças em série (placas ou baterias) entre a rede `inicio` e a rede `fim`. Cada caminho
 * completo é uma lista do positivo para o negativo. Uma peça só pode estar em um caminho: o caminho que repete peça
 * de um caminho já aceito é descartado.
 */
function caminhos(pecas: Peca[], rede: Rede, inicio: string, fim: string): Busca {
  const achados: string[][] = [];
  const caminho: string[] = [];
  const noCaminho = new Set<string>();

  const buscar = (atual: string): void => {
    if (caminho.length >= LIMITE_EM_SERIE) return;
    for (const p of pecas) {
      if (noCaminho.has(p.uid)) continue;
      const pos = rede(p.uid, 'pos');
      const neg = rede(p.uid, 'neg');
      if (pos !== atual || pos === neg) continue;
      caminho.push(p.uid);
      noCaminho.add(p.uid);
      if (neg === fim) achados.push([...caminho]);
      else buscar(neg);
      caminho.pop();
      noCaminho.delete(p.uid);
    }
  };

  if (inicio !== fim) buscar(inicio);

  const aceitos: string[][] = [];
  const usadas = new Set<string>();
  const repetidas = new Set<string>();
  const outras = new Set<string>();
  for (const c of achados) {
    if (c.some((uid) => usadas.has(uid))) {
      for (const uid of c) (usadas.has(uid) ? repetidas : outras).add(uid);
      continue;
    }
    aceitos.push(c);
    for (const uid of c) usadas.add(uid);
  }
  return { aceitos, repetidas: [...repetidas, ...[...outras].filter((uid) => !usadas.has(uid) && !repetidas.has(uid))] };
}

export function analisarCircuito(projeto: Projeto, catalogo: Catalogo): AnaliseCircuito {
  const rede = montarRedes(projeto);

  const itemDe = (d: Dispositivo): Item | undefined => catalogo.get(d.itemId);
  const daCategoria = (categoria: Item['categoria']): Dispositivo[] =>
    projeto.dispositivos.filter((d) => itemDe(d)?.categoria === categoria);

  const placas = daCategoria('placa');
  const baterias = daCategoria('bateria');
  const controladores = daCategoria('controlador');
  const inversores = daCategoria('inversor');
  const aparelhos = daCategoria('aparelho');
  const tomadas = daCategoria('rede');

  /** Cabos com alguma ponta no dispositivo, na ordem do projeto. */
  const cabosDoDispositivo = (uid: string): string[] =>
    projeto.cabos.filter((c) => c.de.disp === uid || c.para.disp === uid).map((c) => c.uid);
  /** Cabos com alguma ponta em um dos dispositivos, na ordem do projeto. */
  const cabosDos = (uids: Iterable<string>): string[] => {
    const alvo = new Set(uids);
    return projeto.cabos.filter((c) => alvo.has(c.de.disp) || alvo.has(c.para.disp)).map((c) => c.uid);
  };
  /** Cabos que pertencem a uma rede, na ordem do projeto. */
  const cabosDaRede = (r: string): string[] =>
    projeto.cabos.filter((c) => rede(c.de.disp, c.de.terminal) === r).map((c) => c.uid);
  const temCabo = (uid: string): boolean => projeto.cabos.some((c) => c.de.disp === uid || c.para.disp === uid);

  /** Redes que contêm a `tomada` de um dispositivo da rede elétrica. */
  const redesDasTomadas = new Set(tomadas.map((t) => rede(t.uid, 'tomada')));

  const problemas: ProblemaCircuito[] = [];
  const problema = (codigo: CodigoProblema, dispositivos: string[], cabos: string[] = []): void => {
    problemas.push({ codigo, dispositivos, cabos });
  };

  // ---------------------------------------------------------------- Inversor
  const inversor = inversores[0];
  if (inversor === undefined) {
    const equipamentos = [...placas, ...baterias, ...controladores].map((d) => d.uid);
    if (equipamentos.length > 0) problema('sem-inversor', equipamentos);
    return { sistema: null, problemas, naRede: naRede(null) };
  }
  if (inversores.length > 1) problema('varios-inversores', inversores.map((d) => d.uid));

  const itemInversor = itemDe(inversor);
  if (itemInversor?.categoria !== 'inversor') throw new Error('inversor fora do catálogo');
  const estacao = itemInversor.bateriaInternaWh !== undefined;

  // ---------------------------------------------------------------- Banco e candidatas a entrada solar
  const P = estacao ? null : rede(inversor.uid, 'batPos');
  const N = estacao ? null : rede(inversor.uid, 'batNeg');
  const buscaBanco: Busca = P !== null && N !== null ? caminhos(baterias, rede, P, N) : { aceitos: [], repetidas: [] };
  const banco = buscaBanco.aceitos;

  interface Candidata {
    dono: Dispositivo;
    controlador: boolean;
    solar: EntradaSolar;
    pvPos: string;
    pvNeg: string;
    busca: Busca;
  }
  const candidatas: Candidata[] = [];
  const candidata = (dono: Dispositivo, controlador: boolean, solar: EntradaSolar): void => {
    const pvPos = rede(dono.uid, 'pvPos');
    const pvNeg = rede(dono.uid, 'pvNeg');
    candidatas.push({ dono, controlador, solar, pvPos, pvNeg, busca: caminhos(placas, rede, pvPos, pvNeg) });
  };
  if (itemInversor.solar) candidata(inversor, false, itemInversor.solar);
  if (P !== null && N !== null) {
    for (const c of controladores) {
      const item = itemDe(c);
      if (item?.categoria !== 'controlador') continue;
      if (rede(c.uid, 'batPos') === P && rede(c.uid, 'batNeg') === N) candidata(c, true, item.solar);
    }
  }
  const emUso = candidatas.find((c) => c.busca.aceitos.length > 0) ?? candidatas[0] ?? null;
  const fileiras = emUso?.busca.aceitos ?? [];

  // Placas e bateria ligadas direto: o barramento da bateria e a entrada das placas se encontram fora do equipamento.
  const redesDoBanco = new Set([P, N].filter((r): r is string => r !== null));
  const redesPv = new Set(candidatas.flatMap((c) => [c.pvPos, c.pvNeg]));
  const donosMisturados = candidatas.filter((c) => redesDoBanco.has(c.pvPos) || redesDoBanco.has(c.pvNeg));
  const terminalEm = (uid: string, redes: Set<string>): boolean => redes.has(rede(uid, 'pos')) || redes.has(rede(uid, 'neg'));
  const bateriasNoPv = baterias.filter((b) => temCabo(b.uid) && terminalEm(b.uid, redesPv)).map((b) => b.uid);
  const placasNoBanco = placas.filter((p) => temCabo(p.uid) && terminalEm(p.uid, redesDoBanco)).map((p) => p.uid);
  const misturadas = new Set([...bateriasNoPv, ...placasNoBanco]);

  // ---------------------------------------------------------------- Problemas do banco
  if (!estacao && banco.length === 0) problema('sem-bateria', [inversor.uid]);
  if (P !== null && P === N) problema('curto-bateria', [inversor.uid], cabosDaRede(P));

  const noBanco = new Set(banco.flat());
  const repetidasNoBanco = new Set(buscaBanco.repetidas);
  for (const b of baterias) {
    if (noBanco.has(b.uid) || !temCabo(b.uid)) continue;
    const pos = rede(b.uid, 'pos');
    const neg = rede(b.uid, 'neg');
    if (pos === neg) problema('curto-bateria', [b.uid], cabosDoDispositivo(b.uid));
    else if ((P !== null && neg === P) || (N !== null && pos === N)) problema('bateria-invertida', [b.uid], cabosDoDispositivo(b.uid));
    // A peça já apontada por `placas-no-banco` ou `peca-repetida` não é "solta".
    else if (!misturadas.has(b.uid) && !repetidasNoBanco.has(b.uid)) problema('bateria-solta', [b.uid], cabosDoDispositivo(b.uid));
  }

  if (banco.length > 1) {
    const tensaoDoRamo = (ramo: string[]): number =>
      ramo.reduce((soma, uid) => {
        const item = catalogo.get(projeto.dispositivos.find((d) => d.uid === uid)!.itemId);
        return soma + (item?.categoria === 'bateria' ? item.tensao : 0);
      }, 0);
    const tensoes = banco.map(tensaoDoRamo);
    if (tensoes.some((t) => t !== tensoes[0])) problema('ramos-desiguais', [...noBanco]);
  }
  if (modelos(baterias, noBanco) > 1) problema('baterias-misturadas', [...noBanco]);
  if (buscaBanco.repetidas.length > 0) problema('peca-repetida', buscaBanco.repetidas, cabosDos(buscaBanco.repetidas));

  // ---------------------------------------------------------------- Problemas das placas
  for (const c of candidatas) {
    if (c.pvPos === c.pvNeg) problema('curto-placas', [c.dono.uid], cabosDaRede(c.pvPos));
  }

  const naFileira = new Set(fileiras.flat());
  const repetidasNaFileira = emUso?.busca.repetidas ?? [];
  for (const p of placas) {
    if (naFileira.has(p.uid) || !temCabo(p.uid)) continue;
    const pos = rede(p.uid, 'pos');
    const neg = rede(p.uid, 'neg');
    if (pos === neg) problema('curto-placas', [p.uid], cabosDoDispositivo(p.uid));
    else if (emUso !== null && (neg === emUso.pvPos || pos === emUso.pvNeg)) problema('placa-invertida', [p.uid], cabosDoDispositivo(p.uid));
    else if (!misturadas.has(p.uid) && !repetidasNaFileira.includes(p.uid)) problema('placa-solta', [p.uid], cabosDoDispositivo(p.uid));
  }

  if (fileiras.some((f) => f.length !== fileiras[0].length)) problema('fileiras-desiguais', [...naFileira]);
  if (modelos(placas, naFileira) > 1) problema('placas-misturadas', [...naFileira]);
  if (repetidasNaFileira.length > 0) problema('peca-repetida', repetidasNaFileira, cabosDos(repetidasNaFileira));

  if (donosMisturados.length > 0 || misturadas.size > 0) {
    const dispositivos = [...new Set([...donosMisturados.map((c) => c.dono.uid), ...bateriasNoPv, ...placasNoBanco])];
    // Cabos das redes em que banco e placas se encontram, e os das peças fora do lugar.
    const redesComuns = new Set(donosMisturados.flatMap((c) => [c.pvPos, c.pvNeg]).filter((r) => redesDoBanco.has(r)));
    const cabos = new Set([...[...redesComuns].flatMap(cabosDaRede), ...cabosDos(misturadas)]);
    problema('placas-no-banco', dispositivos, projeto.cabos.filter((c) => cabos.has(c.uid)).map((c) => c.uid));
  }

  // ---------------------------------------------------------------- Corrente alternada
  const saida = rede(inversor.uid, 'caSaida');
  const cargas = aparelhos.filter((a) => rede(a.uid, 'plug') === saida).map((a) => a.uid);
  const temEntradaCa = itemInversor.solar !== undefined || estacao;
  const redeLigada = temEntradaCa && redesDasTomadas.has(rede(inversor.uid, 'caEntrada'));

  // A saída de qualquer inversor do projeto, não só a do simulado.
  for (const inv of inversores) {
    const saidaDele = rede(inv.uid, 'caSaida');
    if (!redesDasTomadas.has(saidaDele)) continue;
    const tomadasNaSaida = tomadas.filter((t) => rede(t.uid, 'tomada') === saidaDele).map((t) => t.uid);
    problema('saida-na-rede', [inv.uid, ...tomadasNaSaida], cabosDaRede(saidaDele));
  }

  return {
    sistema: {
      inversor: inversor.uid,
      controlador: emUso?.controlador ? emUso.dono.uid : null,
      entradaSolar: emUso?.solar ?? null,
      fileiras,
      banco,
      cargas,
      redeLigada,
    },
    problemas,
    naRede: naRede(saida),
  };

  /** Aparelhos com o plugue na rede de uma tomada e fora da saída do inversor. */
  function naRede(saidaDoInversor: string | null): string[] {
    return aparelhos
      .filter((a) => {
        const r = rede(a.uid, 'plug');
        return redesDasTomadas.has(r) && r !== saidaDoInversor;
      })
      .map((a) => a.uid);
  }

  /** Quantos modelos diferentes há entre as peças escolhidas. */
  function modelos(pecas: Dispositivo[], escolhidas: Set<string>): number {
    return new Set(pecas.filter((d) => escolhidas.has(d.uid)).map((d) => d.itemId)).size;
  }
}
