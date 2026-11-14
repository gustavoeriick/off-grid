// Topologia do circuito a partir dos cabos. Especificação: docs/especificacao/nucleo.md, seção 8. Tarefa 1.4.

import type { Catalogo, EntradaSolar, Item } from '../catalogo/tipos';
import type { AnaliseCircuito, CodigoProblema, Dispositivo, ProblemaCircuito, Projeto } from './tipos';

/** Maior número de peças em série que a busca aceita em um ramo ou fileira. */
const LIMITE_EM_SERIE = 40;

/** Redes elétricas: terminais ligados por cabos, direta ou indiretamente. União de conjuntos sobre `uid:terminal`. */
class Redes {
  private readonly pai = new Map<string, string>();

  private raiz(chave: string): string {
    let r = chave;
    while (true) {
      const p = this.pai.get(r);
      if (p === undefined || p === r) break;
      r = p;
    }
    // Compressão do caminho.
    let c = chave;
    while (c !== r) {
      const p = this.pai.get(c)!;
      this.pai.set(c, r);
      c = p;
    }
    return r;
  }

  unir(a: string, b: string): void {
    const ra = this.raiz(a);
    const rb = this.raiz(b);
    if (ra !== rb) this.pai.set(ra, rb);
  }

  /** Identificador da rede de um terminal. Terminal sem cabo é uma rede sozinha. */
  de(disp: string, terminal: string): string {
    return this.raiz(`${disp}:${terminal}`);
  }
}

interface Peca {
  uid: string;
  itemId: string;
}

/** Busca em profundidade de peças em série (placas ou baterias) entre a rede `inicio` e a rede `fim`. Cada caminho completo é uma lista do positivo para o negativo. */
function caminhos(pecas: Peca[], redes: Redes, inicio: string, fim: string): string[][] {
  const achados: string[][] = [];
  const caminho: string[] = [];
  const noCaminho = new Set<string>();

  const buscar = (atual: string): void => {
    if (caminho.length >= LIMITE_EM_SERIE) return;
    for (const p of pecas) {
      if (noCaminho.has(p.uid)) continue;
      const pos = redes.de(p.uid, 'pos');
      const neg = redes.de(p.uid, 'neg');
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
  return achados;
}

export function analisarCircuito(projeto: Projeto, catalogo: Catalogo): AnaliseCircuito {
  const redes = new Redes();
  for (const c of projeto.cabos) redes.unir(`${c.de.disp}:${c.de.terminal}`, `${c.para.disp}:${c.para.terminal}`);

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
  /** Cabos que pertencem a uma rede, na ordem do projeto. */
  const cabosDaRede = (rede: string): string[] =>
    projeto.cabos.filter((c) => redes.de(c.de.disp, c.de.terminal) === rede).map((c) => c.uid);
  const temCabo = (uid: string): boolean => projeto.cabos.some((c) => c.de.disp === uid || c.para.disp === uid);

  /** Redes que contêm a `tomada` de um dispositivo da rede elétrica. */
  const redesDasTomadas = new Set(tomadas.map((t) => redes.de(t.uid, 'tomada')));

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

  // ---------------------------------------------------------------- Banco de baterias
  const P = estacao ? null : redes.de(inversor.uid, 'batPos');
  const N = estacao ? null : redes.de(inversor.uid, 'batNeg');
  const banco = P !== null && N !== null ? caminhos(baterias, redes, P, N) : [];

  if (!estacao && banco.length === 0) problema('sem-bateria', [inversor.uid]);
  if (P !== null && P === N) problema('curto-bateria', [inversor.uid], cabosDaRede(P));

  const noBanco = new Set(banco.flat());
  for (const b of baterias) {
    if (noBanco.has(b.uid) || !temCabo(b.uid)) continue;
    const pos = redes.de(b.uid, 'pos');
    const neg = redes.de(b.uid, 'neg');
    if (pos === neg) problema('curto-bateria', [b.uid], cabosDoDispositivo(b.uid));
    else if ((P !== null && neg === P) || (N !== null && pos === N)) problema('bateria-invertida', [b.uid], cabosDoDispositivo(b.uid));
    else problema('bateria-solta', [b.uid], cabosDoDispositivo(b.uid));
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

  // ---------------------------------------------------------------- Entrada solar
  interface Candidata {
    dono: Dispositivo;
    controlador: boolean;
    solar: EntradaSolar;
    pvPos: string;
    pvNeg: string;
    fileiras: string[][];
  }
  const candidatas: Candidata[] = [];
  const candidata = (dono: Dispositivo, controlador: boolean, solar: EntradaSolar): void => {
    const pvPos = redes.de(dono.uid, 'pvPos');
    const pvNeg = redes.de(dono.uid, 'pvNeg');
    candidatas.push({ dono, controlador, solar, pvPos, pvNeg, fileiras: caminhos(placas, redes, pvPos, pvNeg) });
  };
  if (itemInversor.solar) candidata(inversor, false, itemInversor.solar);
  if (P !== null && N !== null) {
    for (const c of controladores) {
      const item = itemDe(c);
      if (item?.categoria !== 'controlador') continue;
      if (redes.de(c.uid, 'batPos') === P && redes.de(c.uid, 'batNeg') === N) candidata(c, true, item.solar);
    }
  }
  const emUso = candidatas.find((c) => c.fileiras.length > 0) ?? candidatas[0] ?? null;
  const fileiras = emUso?.fileiras ?? [];

  for (const c of candidatas) {
    if (c.pvPos === c.pvNeg) problema('curto-placas', [c.dono.uid], cabosDaRede(c.pvPos));
  }

  const naFileira = new Set(fileiras.flat());
  for (const p of placas) {
    if (naFileira.has(p.uid) || !temCabo(p.uid)) continue;
    const pos = redes.de(p.uid, 'pos');
    const neg = redes.de(p.uid, 'neg');
    if (pos === neg) problema('curto-placas', [p.uid], cabosDoDispositivo(p.uid));
    else if (emUso !== null && (neg === emUso.pvPos || pos === emUso.pvNeg)) problema('placa-invertida', [p.uid], cabosDoDispositivo(p.uid));
    else problema('placa-solta', [p.uid], cabosDoDispositivo(p.uid));
  }

  if (fileiras.some((f) => f.length !== fileiras[0].length)) problema('fileiras-desiguais', [...naFileira]);
  if (modelos(placas, naFileira) > 1) problema('placas-misturadas', [...naFileira]);

  // ---------------------------------------------------------------- Corrente alternada
  const saida = redes.de(inversor.uid, 'caSaida');
  const cargas = aparelhos.filter((a) => redes.de(a.uid, 'plug') === saida).map((a) => a.uid);
  const temEntradaCa = itemInversor.solar !== undefined || estacao;
  const redeLigada = temEntradaCa && redesDasTomadas.has(redes.de(inversor.uid, 'caEntrada'));

  if (redesDasTomadas.has(saida)) {
    const tomadasNaSaida = tomadas.filter((t) => redes.de(t.uid, 'tomada') === saida).map((t) => t.uid);
    problema('saida-na-rede', [inversor.uid, ...tomadasNaSaida], cabosDaRede(saida));
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
        const rede = redes.de(a.uid, 'plug');
        return redesDasTomadas.has(rede) && rede !== saidaDoInversor;
      })
      .map((a) => a.uid);
  }

  /** Quantos modelos diferentes há entre as peças escolhidas. */
  function modelos(pecas: Dispositivo[], escolhidas: Set<string>): number {
    return new Set(pecas.filter((d) => escolhidas.has(d.uid)).map((d) => d.itemId)).size;
  }
}
