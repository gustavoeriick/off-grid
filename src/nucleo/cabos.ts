// Correntes de projeto e queda de tensão nos cabos. Especificação: docs/especificacao/nucleo.md, seção 9. Tarefa 1.6.

import type { Aparelho, Catalogo, Controlador, Inversor, Placa, TipoCabo } from '../catalogo/tipos';
import { infoBanco } from './eletrica';
import type { AnaliseCircuito, Cabo, Projeto, QuedaDeTensao } from './tipos';

/** Resistividade, em ohm·mm²/m. */
const RHO_COBRE = 0.019;
const RHO_ALUCOBRE = 0.0304;
/** Margem sobre a corrente de curto-circuito das placas. */
const MARGEM_ISC = 1.25;
/** Maior corrente de carregador de rede que o simulador considera, em A. */
const LIMITE_CARREGADOR_REDE_A = 20;

const LIMITE_PLACAS = 0.03;
const LIMITE_BATERIA = 0.02;
const LIMITE_APARELHOS = 0.04;

/** Resistência de um trecho de cabo, em ohms. */
export function resistencia(cabo: TipoCabo, comprimento: number): number {
  return ((cabo.cobre ? RHO_COBRE : RHO_ALUCOBRE) * comprimento) / cabo.secao;
}

/** Como um cabo chega a um terminal a partir do sorvedouro da rede: o cabo e o terminal do lado do sorvedouro. */
interface Elo {
  cabo: Cabo;
  de: string;
}

interface Calculo {
  correntes: Map<string, number>;
  /** Para cada terminal alcançado, o cabo que o liga ao sorvedouro. */
  arvore: Map<string, Elo>;
}

const chave = (disp: string, terminal: string): string => `${disp}:${terminal}`;

/** Redes elétricas: terminais ligados por cabos, direta ou indiretamente. */
function montarRedes(projeto: Projeto): (disp: string, terminal: string) => string {
  const pai = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    for (let p = pai.get(r); p !== undefined && p !== r; p = pai.get(r)) r = p;
    return r;
  };
  for (const c of projeto.cabos) {
    const ra = raiz(chave(c.de.disp, c.de.terminal));
    const rb = raiz(chave(c.para.disp, c.para.terminal));
    if (ra !== rb) pai.set(ra, rb);
  }
  return (disp, terminal) => raiz(chave(disp, terminal));
}

function calcular(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): Calculo {
  const correntes = new Map<string, number>(projeto.cabos.map((c) => [c.uid, 0]));
  const arvore = new Map<string, Elo>();
  const sistema = analise.sistema;
  if (sistema === null) return { correntes, arvore };

  const rede = montarRedes(projeto);

  // Cabos de cada terminal.
  const vizinhos = new Map<string, { cabo: Cabo; outro: string }[]>();
  const ligar = (de: string, para: string, cabo: Cabo): void => {
    const lista = vizinhos.get(de);
    if (lista) lista.push({ cabo, outro: para });
    else vizinhos.set(de, [{ cabo, outro: para }]);
  };
  for (const c of projeto.cabos) {
    const a = chave(c.de.disp, c.de.terminal);
    const b = chave(c.para.disp, c.para.terminal);
    ligar(a, b, c);
    ligar(b, a, c);
  }

  const visitados = new Set<string>();
  const usados = new Set<string>();

  /** Percorre a rede em largura a partir do sorvedouro e distribui as injeções pelos cabos da árvore. */
  const resolver = (sorvedouro: string, injecoes: [string, number][]): void => {
    if (visitados.has(sorvedouro)) return;
    visitados.add(sorvedouro);
    const ordem: string[] = [sorvedouro];
    for (let i = 0; i < ordem.length; i++) {
      const no = ordem[i];
      for (const { cabo, outro } of vizinhos.get(no) ?? []) {
        if (usados.has(cabo.uid)) continue;
        usados.add(cabo.uid); // cabo que fecha laço fica com 0
        if (visitados.has(outro)) continue;
        visitados.add(outro);
        arvore.set(outro, { cabo, de: no });
        ordem.push(outro);
      }
    }
    const acumulado = new Map<string, number>();
    for (const [no, amperes] of injecoes) acumulado.set(no, (acumulado.get(no) ?? 0) + amperes);
    for (let i = ordem.length - 1; i > 0; i--) {
      const no = ordem[i];
      const elo = arvore.get(no)!;
      const soma = acumulado.get(no) ?? 0;
      correntes.set(elo.cabo.uid, soma);
      acumulado.set(elo.de, (acumulado.get(elo.de) ?? 0) + soma);
    }
  };

  const item = <T extends string>(uid: string, categoria: T) => {
    const d = projeto.dispositivos.find((x) => x.uid === uid);
    const it = d ? catalogo.get(d.itemId) : undefined;
    return it?.categoria === categoria ? it : undefined;
  };
  const inversor = item(sistema.inversor, 'inversor') as Inversor | undefined;

  // ---------------------------------------------------------------- Placas
  const donoSolar = sistema.controlador ?? sistema.inversor;
  const placaDe = (uid: string) => item(uid, 'placa') as Placa | undefined;
  if (sistema.entradaSolar !== null && sistema.fileiras.length > 0) {
    const iPos: [string, number][] = [];
    const iNeg: [string, number][] = [];
    for (const fileira of sistema.fileiras) {
      const primeira = fileira[0];
      const ultima = fileira[fileira.length - 1];
      const isc = (uid: string): number => (placaDe(uid)?.isc ?? 0) * MARGEM_ISC;
      iPos.push([chave(primeira, 'pos'), isc(primeira)]);
      iNeg.push([chave(ultima, 'neg'), isc(ultima)]);
      for (let k = 0; k + 1 < fileira.length; k++) {
        resolver(chave(fileira[k + 1], 'pos'), [[chave(fileira[k], 'neg'), isc(fileira[k])]]);
      }
    }
    resolver(chave(donoSolar, 'pvPos'), iPos);
    resolver(chave(donoSolar, 'pvNeg'), iNeg);
  }

  // ---------------------------------------------------------------- Banco
  const banco = inversor ? infoBanco(sistema, projeto, catalogo) : null;
  if (inversor && banco !== null && sistema.banco.length > 0) {
    const iBateria = inversor.potenciaW / (inversor.rendimento * banco.tensaoRef);
    const porRamo = iBateria / sistema.banco.length;
    const P = rede(sistema.inversor, 'batPos');
    const N = rede(sistema.inversor, 'batNeg');
    const iPos: [string, number][] = [];
    const iNeg: [string, number][] = [];
    for (const ramo of sistema.banco) {
      iPos.push([chave(ramo[0], 'pos'), porRamo]);
      iNeg.push([chave(ramo[ramo.length - 1], 'neg'), porRamo]);
      for (let k = 0; k + 1 < ramo.length; k++) {
        resolver(chave(ramo[k + 1], 'pos'), [[chave(ramo[k], 'neg'), porRamo]]);
      }
    }
    for (const d of projeto.dispositivos) {
      const c = item(d.uid, 'controlador') as Controlador | undefined;
      if (!c || rede(d.uid, 'batPos') !== P || rede(d.uid, 'batNeg') !== N) continue;
      iPos.push([chave(d.uid, 'batPos'), c.solar.correnteCargaA]);
      iNeg.push([chave(d.uid, 'batNeg'), c.solar.correnteCargaA]);
    }
    resolver(chave(sistema.inversor, 'batPos'), iPos);
    resolver(chave(sistema.inversor, 'batNeg'), iNeg);
  }

  // ---------------------------------------------------------------- Corrente alternada
  const potenciaDe = (uid: string): number => (item(uid, 'aparelho') as Aparelho | undefined)?.potenciaW ?? 0;
  const tensaoRede = projeto.tensaoRede;
  resolver(
    chave(sistema.inversor, 'caSaida'),
    sistema.cargas.map((uid): [string, number] => [chave(uid, 'plug'), potenciaDe(uid) / tensaoRede]),
  );

  if (inversor && sistema.redeLigada) {
    const entrada = rede(sistema.inversor, 'caEntrada');
    const tomada = projeto.dispositivos.find((d) => item(d.uid, 'rede') !== undefined && rede(d.uid, 'tomada') === entrada);
    if (tomada) {
      const cargaW = sistema.cargas.reduce((s, uid) => s + potenciaDe(uid), 0);
      const carregadorW =
        banco === null ? 0 : Math.min(inversor.carregadorRedeA ?? 0, LIMITE_CARREGADOR_REDE_A) * banco.tensaoCarga;
      resolver(chave(tomada.uid, 'tomada'), [[chave(sistema.inversor, 'caEntrada'), (cargaW + carregadorW) / tensaoRede]]);
    }
  }

  return { correntes, arvore };
}

/** Corrente que cada cabo precisa aguentar, em ampères, por `uid` do cabo. Cabo fora de qualquer circuito, ou que fecha laço, fica com 0. */
export function correntesDeProjeto(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): Map<string, number> {
  return calcular(projeto, catalogo, analise).correntes;
}

/** Queda de tensão de cada circuito: placas, bateria e cada aparelho. */
export function quedasDeTensao(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): QuedaDeTensao[] {
  const sistema = analise.sistema;
  if (sistema === null) return [];
  const { correntes, arvore } = calcular(projeto, catalogo, analise);

  const tipoDe = (cabo: Cabo): TipoCabo => {
    const it = catalogo.get(cabo.caboId);
    if (it?.categoria !== 'cabo') throw new Error(`cabo fora do catálogo: ${cabo.caboId}`);
    return it;
  };
  const dispositivo = (uid: string) => projeto.dispositivos.find((d) => d.uid === uid);

  /** Cabos do terminal até o sorvedouro da rede. */
  const caminho = (disp: string, terminal: string): Cabo[] => {
    const cabos: Cabo[] = [];
    let no = chave(disp, terminal);
    for (let elo = arvore.get(no); elo !== undefined; elo = arvore.get(no)) {
      cabos.push(elo.cabo);
      no = elo.de;
    }
    return cabos;
  };
  /** Queda, em volts, ao longo dos cabos, com `fator` sobre a corrente de cada um. */
  const queda = (cabos: Cabo[], fator: number): number =>
    cabos.reduce((s, c) => s + (correntes.get(c.uid) ?? 0) * fator * resistencia(tipoDe(c), c.comprimento), 0);
  const unicos = (cabos: Cabo[]): string[] => [...new Set(cabos.map((c) => c.uid))];

  /** Cabos do caminho de uma série de peças: positivo, negativo e emendas. */
  const cabosDaSerie = (serie: string[]): Cabo[] => [
    ...caminho(serie[0], 'pos'),
    ...caminho(serie[serie.length - 1], 'neg'),
    ...serie.slice(0, -1).flatMap((uid) => caminho(uid, 'neg')),
  ];

  /** Escolhe, entre os ramos ou fileiras, o de maior queda em fração. */
  const pior = (
    circuito: 'placas' | 'bateria',
    limite: number,
    series: { cabos: Cabo[]; volts: number; base: number }[],
  ): QuedaDeTensao => {
    const melhor = series.reduce((a, b) => (b.volts / b.base > a.volts / a.base ? b : a));
    return { circuito, alvo: null, volts: melhor.volts, fracao: melhor.volts / melhor.base, limite, cabos: unicos(melhor.cabos) };
  };

  const resultado: QuedaDeTensao[] = [];

  if (sistema.entradaSolar !== null && sistema.fileiras.length > 0) {
    const series = sistema.fileiras.map((fileira) => {
      const placa = dispositivo(fileira[0]) && catalogo.get(dispositivo(fileira[0])!.itemId);
      if (placa?.categoria !== 'placa') throw new Error('placa fora do catálogo');
      const cabos = cabosDaSerie(fileira);
      // Corrente de trabalho: a de projeto (1,25 × isc) trazida para imp.
      return { cabos, volts: queda(cabos, placa.imp / (MARGEM_ISC * placa.isc)), base: fileira.length * placa.vmp };
    });
    resultado.push(pior('placas', LIMITE_PLACAS, series));
  }

  const banco = infoBanco(sistema, projeto, catalogo);
  if (banco !== null && sistema.banco.length > 0) {
    const series = sistema.banco.map((ramo) => {
      const cabos = cabosDaSerie(ramo);
      return { cabos, volts: queda(cabos, 1), base: banco.tensaoRef };
    });
    resultado.push(pior('bateria', LIMITE_BATERIA, series));
  }

  for (const uid of sistema.cargas) {
    const cabos = caminho(uid, 'plug');
    // Um cabo CA leva fase e neutro: a resistência conta em dobro.
    const volts = queda(cabos, 2);
    resultado.push({
      circuito: 'saida',
      alvo: uid,
      volts,
      fracao: volts / projeto.tensaoRede,
      limite: LIMITE_APARELHOS,
      cabos: unicos(cabos),
    });
  }

  return resultado;
}
