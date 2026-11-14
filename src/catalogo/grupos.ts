// Tipos de equipamento: junta os itens do catálogo que são o mesmo equipamento de marcas e anúncios diferentes.
// Especificação: docs/especificacao/fase-2.md, seção 2.1. Sem DOM.

import type { Catalogo, Categoria, Inversor, Item, TipoProtecao } from './tipos';

export interface GrupoDoCatalogo {
  /** Chave estável do tipo (não muda enquanto o catálogo não muda). */
  chave: string;
  categoria: Categoria;
  /** Nome do tipo, montado dos dados e sem marca. */
  nome: string;
  /** Itens do tipo, do mais barato ao mais caro. */
  itens: Item[];
  /** Modelo de referência: o mais barato sem `naoRecomendado` (ou o mais barato, se todos têm a marca). */
  referencia: Item;
  /** Valor para ordenar os cartões do tipo, do menor para o maior. */
  ordem: number;
}

/** Tolerância entre os valores de um mesmo tipo (placas e baterias). */
const TOLERANCIA = 0.04;

/** Número no padrão brasileiro, sem depender da localidade do ambiente: 3000 vira "3.000", 2.5 vira "2,5". */
function numero(n: number): string {
  const [inteira, decimal] = String(Math.round(n * 100) / 100).split('.');
  const comPontos = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${comPontos},${decimal}` : comPontos;
}

const ORDEM_PROTECAO: Record<TipoProtecao, number> = { disjuntorCC: 0, fusivel: 1, dps: 2, disjuntorCA: 3 };
const ORDEM_USO_CABO = { solar: 0, bateria: 1, ca: 2 } as const;

/** Como um item entra num tipo: o que precisa ser igual e o valor que admite tolerância. */
interface Regra {
  /** Características que precisam ser iguais. */
  base: string;
  /** Valor com tolerância de 4%, quando houver. */
  valor?: number;
}

function regraDe(item: Item): Regra {
  switch (item.categoria) {
    case 'placa':
      return { base: 'placa', valor: item.wp };
    case 'bateria':
      return { base: `bateria:${item.quimica}:${item.tensao}`, valor: item.ah };
    case 'inversor':
      return { base: `inversor:${especieDoInversor(item)}:${item.onda}:${item.tensaoBateria}:${item.saidaV}:${item.potenciaW}` };
    case 'controlador':
      return { base: `controlador:${item.solar.tipo}:${item.solar.correnteCargaA}` };
    case 'protecao':
      return { base: `protecao:${item.tipo}:${item.correnteA}` };
    case 'cabo':
      return { base: `cabo:${item.uso}:${item.secao}:${item.cobre ? 'cobre' : 'alucobre'}` };
    default:
      return { base: `item:${item.id}` };
  }
}

type Especie = 'estacao' | 'hibrido-mppt' | 'hibrido-pwm' | 'sem-solar';

function especieDoInversor(i: Inversor): Especie {
  if (i.bateriaInternaWh !== undefined) return 'estacao';
  if (i.solar) return i.solar.tipo === 'mppt' ? 'hibrido-mppt' : 'hibrido-pwm';
  return 'sem-solar';
}

/** Nome do tipo, montado dos dados do modelo de referência. Nunca leva marca. */
function nomeDoTipo(r: Item): string {
  switch (r.categoria) {
    case 'placa':
      return `Placa solar de ${numero(r.wp)} W`;
    case 'bateria': {
      const quimica = r.quimica === 'lifepo4' ? 'de lítio' : r.quimica === 'chumbo' ? 'estacionária de chumbo' : 'automotiva';
      return `Bateria ${quimica} ${r.tensao} V ${numero(r.ah)} Ah`;
    }
    case 'inversor': {
      const especie = especieDoInversor(r);
      if (especie === 'estacao') return `Estação portátil ${numero(r.bateriaInternaWh ?? 0)} Wh`;
      const saida = r.saidaV === 127 ? '' : ` saída ${r.saidaV} V`;
      const base = `${numero(r.potenciaW)} W ${r.tensaoBateria} V${saida}`;
      if (especie === 'sem-solar') return `Inversor ${base} onda ${r.onda}`;
      const onda = r.onda === 'modificada' ? ' onda modificada' : '';
      return `Inversor híbrido ${base}${onda} (${r.solar?.tipo === 'pwm' ? 'PWM' : 'MPPT'})`;
    }
    case 'controlador':
      return `Controlador ${r.solar.tipo === 'pwm' ? 'PWM' : 'MPPT'} ${numero(r.solar.correnteCargaA)} A`;
    case 'protecao':
      switch (r.tipo) {
        case 'disjuntorCC':
          return `Disjuntor de corrente contínua ${numero(r.correnteA)} A`;
        case 'disjuntorCA':
          return `Disjuntor de corrente alternada ${numero(r.correnteA)} A`;
        case 'fusivel':
          return `Fusível ${numero(r.correnteA)} A`;
        case 'dps':
          return 'DPS de corrente contínua';
      }
    case 'cabo': {
      const uso = r.uso === 'solar' ? 'solar' : r.uso === 'bateria' ? 'de bateria' : 'de corrente alternada';
      return `Cabo ${uso} ${numero(r.secao)} mm²${r.cobre ? '' : ' (alucobre)'}`;
    }
    default:
      return r.nome;
  }
}

/** Valor que ordena os cartões: potência, capacidade ou corrente. Na falta de um, a ordem do catálogo decide. */
function ordemDe(r: Item): number {
  switch (r.categoria) {
    case 'placa':
      return r.wp;
    case 'bateria':
      return r.tensao * r.ah;
    case 'inversor':
      return r.potenciaW;
    case 'controlador':
      return r.solar.correnteCargaA;
    case 'protecao':
      return ORDEM_PROTECAO[r.tipo] * 10000 + r.correnteA;
    case 'cabo':
      return ORDEM_USO_CABO[r.uso] * 1000 + r.secao + (r.cobre ? 0 : 0.1);
    case 'aparelho':
      return r.potenciaW;
    default:
      return 0;
  }
}

function referenciaDe(itens: Item[]): Item {
  return itens.find((i) => !i.naoRecomendado) ?? itens[0];
}

function porPreco(a: Item, b: Item): number {
  return a.preco - b.preco || a.nome.localeCompare(b.nome, 'pt-BR');
}

/** Junta os itens do catálogo em tipos de equipamento. A ordem do resultado é a do catálogo, por categoria e depois pelo valor de ordenação. */
export function gruposDoCatalogo(catalogo: Catalogo): GrupoDoCatalogo[] {
  const montados: { base: string; valor: number | undefined; itens: Item[] }[] = [];

  // Itens com o mesmo `base`, em ordem crescente do valor com tolerância, formam cadeias de até 4% sobre o primeiro.
  const porBase = new Map<string, { item: Item; valor: number | undefined }[]>();
  for (const item of catalogo.values()) {
    const { base, valor } = regraDe(item);
    const lista = porBase.get(base) ?? [];
    lista.push({ item, valor });
    porBase.set(base, lista);
  }
  for (const [base, lista] of porBase) {
    if (lista[0].valor === undefined) {
      montados.push({ base, valor: undefined, itens: lista.map((x) => x.item) });
      continue;
    }
    lista.sort((a, b) => (a.valor as number) - (b.valor as number));
    let atual: { base: string; valor: number | undefined; itens: Item[] } | null = null;
    for (const { item, valor } of lista) {
      if (atual && (valor as number) <= (atual.valor as number) * (1 + TOLERANCIA) + 1e-9) {
        atual.itens.push(item);
      } else {
        atual = { base, valor, itens: [item] };
        montados.push(atual);
      }
    }
  }

  const ordemDoCatalogo = new Map([...catalogo.keys()].map((id, i) => [id, i]));
  const grupos = montados.map((m): GrupoDoCatalogo => {
    const itens = [...m.itens].sort(porPreco);
    const referencia = referenciaDe(itens);
    return {
      chave: m.valor === undefined ? m.base : `${m.base}:${m.valor}`,
      categoria: referencia.categoria,
      nome: nomeDoTipo(referencia),
      itens,
      referencia,
      ordem: ordemDe(referencia),
    };
  });
  const primeiro = (g: GrupoDoCatalogo): number => Math.min(...g.itens.map((i) => ordemDoCatalogo.get(i.id) ?? 0));
  return grupos.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.ordem - b.ordem || primeiro(a) - primeiro(b));
}

const guardados = new WeakMap<Catalogo, GrupoDoCatalogo[]>();

function gruposGuardados(catalogo: Catalogo): GrupoDoCatalogo[] {
  let g = guardados.get(catalogo);
  if (!g) {
    g = gruposDoCatalogo(catalogo);
    guardados.set(catalogo, g);
  }
  return g;
}

/** O tipo a que o item pertence. */
export function grupoDoItem(catalogo: Catalogo, itemId: string): GrupoDoCatalogo | undefined {
  return gruposGuardados(catalogo).find((g) => g.itens.some((i) => i.id === itemId));
}
