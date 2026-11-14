// Cômodos da casa: área fechada por paredes, cômodo de um dispositivo e ajuste das paredes internas.
// Especificação: docs/especificacao/fase-2.md, seção 1.2. Tarefa 2.0.

import type { CasaConfig, Comodo, Dispositivo, LadoCasa, ParedeInterna } from './tipos';

/** Lado da célula da grade, em metros. */
export const GRADE = 0.1;
/** Comprimento mínimo de uma parede interna, em metros. */
export const COMPRIMENTO_MINIMO_PAREDE = 0.5;

const LADOS: LadoCasa[] = ['frente', 'fundos', 'esquerda', 'direita'];
/** Folga numérica para as contas na grade. */
const EPS = 1e-6;

/** Área de um cômodo: o conjunto de células de 0,1 m que o `ponto` alcança sem atravessar parede. */
export interface AreaDoComodo {
  /** Quantidade de células da área. */
  celulas: number;
  /** Área em metros quadrados. */
  metrosQuadrados: number;
  /** Verdadeiro se o ponto (x, z), em coordenadas da casa, está dentro da área. */
  contem(x: number, z: number): boolean;
}

const ARREDONDA = (v: number): number => Math.round(v * 1000) / 1000;

/** Índice da célula que contém a coordenada. */
const celula = (v: number): number => Math.floor(v / GRADE + EPS);
/** Índice da linha de grade mais próxima da coordenada. */
const linha = (v: number): number => Math.round(v / GRADE);

interface Grade {
  ixMin: number;
  ixMax: number;
  izMin: number;
  izMax: number;
  /** Arestas bloqueadas por parede: `h:ix:iz` separa a célula (ix, iz-1) da (ix, iz); `v:ix:iz` separa a (ix-1, iz) da (ix, iz). */
  bloqueios: Set<string>;
}

/** Limites da planta e arestas fechadas pelas paredes internas do andar. As passagens contam como parede fechada. */
function montarGrade(casa: CasaConfig, andar: 0 | 1): Grade {
  const grade: Grade = {
    ixMin: Math.floor(-casa.largura / 2 / GRADE + EPS),
    ixMax: Math.ceil(casa.largura / 2 / GRADE - EPS) - 1,
    izMin: Math.floor(-casa.profundidade / 2 / GRADE + EPS),
    izMax: Math.ceil(casa.profundidade / 2 / GRADE - EPS) - 1,
    bloqueios: new Set(),
  };
  for (const p of casa.paredesInternas) {
    if (p.andar !== andar) continue;
    const [x0, z0] = p.de;
    const [x1, z1] = p.para;
    if (Math.abs(z0 - z1) < EPS) {
      // Paralela a X: separa a fileira de cima da de baixo, nas células cujo centro está entre as pontas.
      const iz = linha(z0);
      const a = Math.min(x0, x1);
      const b = Math.max(x0, x1);
      for (let ix = celula(a - GRADE); ix <= celula(b + GRADE); ix++) {
        const centro = (ix + 0.5) * GRADE;
        if (centro > a && centro < b) grade.bloqueios.add(`h:${ix}:${iz}`);
      }
    } else if (Math.abs(x0 - x1) < EPS) {
      const ix = linha(x0);
      const a = Math.min(z0, z1);
      const b = Math.max(z0, z1);
      for (let iz = celula(a - GRADE); iz <= celula(b + GRADE); iz++) {
        const centro = (iz + 0.5) * GRADE;
        if (centro > a && centro < b) grade.bloqueios.add(`v:${ix}:${iz}`);
      }
    }
  }
  return grade;
}

const dentro = (g: Grade, ix: number, iz: number): boolean => ix >= g.ixMin && ix <= g.ixMax && iz >= g.izMin && iz <= g.izMax;

/** Área do cômodo no andar dele. Um `ponto` fora da planta dá área vazia. */
export function areaDoComodo(casa: CasaConfig, comodo: Comodo): AreaDoComodo {
  const g = montarGrade(casa, comodo.andar);
  const chave = (ix: number, iz: number): string => `${ix}:${iz}`;
  const visitadas = new Set<string>();
  const ix0 = celula(comodo.ponto[0]);
  const iz0 = celula(comodo.ponto[1]);
  if (dentro(g, ix0, iz0)) {
    const fila: [number, number][] = [[ix0, iz0]];
    visitadas.add(chave(ix0, iz0));
    while (fila.length > 0) {
      const [ix, iz] = fila.pop()!;
      const vizinhas: [number, number, string][] = [
        [ix + 1, iz, `v:${ix + 1}:${iz}`],
        [ix - 1, iz, `v:${ix}:${iz}`],
        [ix, iz + 1, `h:${ix}:${iz + 1}`],
        [ix, iz - 1, `h:${ix}:${iz}`],
      ];
      for (const [jx, jz, aresta] of vizinhas) {
        if (!dentro(g, jx, jz) || g.bloqueios.has(aresta) || visitadas.has(chave(jx, jz))) continue;
        visitadas.add(chave(jx, jz));
        fila.push([jx, jz]);
      }
    }
  }
  return {
    celulas: visitadas.size,
    metrosQuadrados: ARREDONDA(visitadas.size * GRADE * GRADE),
    contem(x: number, z: number): boolean {
      // Quem está sobre a parede externa (no limite da planta) pertence à célula de dentro.
      const ix = Math.min(Math.max(celula(x), g.ixMin), g.ixMax);
      const iz = Math.min(Math.max(celula(z), g.izMin), g.izMax);
      return visitadas.has(chave(ix, iz));
    },
  };
}

/** Andar de uma superfície da casa pelo id, ou nulo se ela não é de um andar (telhado, varanda, quartinho). */
export function andarDaSuperficie(casa: CasaConfig, superficie: string | null): 0 | 1 | null {
  if (superficie === null) return null;
  if (superficie === 'piso-terreo') return 0;
  if (superficie === 'piso-superior') return 1;
  const externa = /^parede-(frente|fundos|esquerda|direita)-([01])$/.exec(superficie);
  if (externa) return externa[2] === '1' ? 1 : 0;
  if (superficie.startsWith('parede-interna-')) {
    const uid = superficie.slice('parede-interna-'.length);
    return casa.paredesInternas.find((p) => p.uid === uid)?.andar ?? null;
  }
  return null;
}

/** Verdadeiro nas superfícies `piso-varanda-{lado}` e `telhado-varanda-{lado}`. */
function ehSuperficieDeVaranda(superficie: string): boolean {
  return LADOS.some((l) => superficie === `piso-varanda-${l}` || superficie === `telhado-varanda-${l}`);
}

function ehSuperficieDoQuartinho(superficie: string): boolean {
  return superficie === 'piso-quartinho' || superficie === 'telhado-quartinho' || superficie.startsWith('parede-quartinho-');
}

/**
 * Cômodo de um dispositivo, ou nulo.
 *
 * - Superfícies de varanda e do quartinho devolvem os cômodos prontos "Varanda" e "Quartinho" (uid `varanda-{lado}` e `quartinho`).
 * - Peça no telhado principal, ou sem superfície, não tem cômodo.
 * - Nas superfícies de um andar vale a área que contém a posição da peça. Área sem `ponto` de nenhum cômodo devolve "Sem nome" (uid vazio).
 * - Andar 1 em casa de um andar não existe: nulo.
 */
export function comodoDe(casa: CasaConfig, dispositivo: Dispositivo): Comodo | null {
  const superficie = dispositivo.superficie;
  if (superficie === null) return null;
  const [x, , z] = dispositivo.pos;
  const pronto = (uid: string, nome: string): Comodo => ({ uid, andar: 0, nome, ponto: [x, z] });
  if (ehSuperficieDeVaranda(superficie)) return pronto(`varanda-${superficie.slice(superficie.lastIndexOf('-') + 1)}`, 'Varanda');
  if (ehSuperficieDoQuartinho(superficie)) return pronto('quartinho', 'Quartinho');

  const andar = andarDaSuperficie(casa, superficie);
  if (andar === null || andar >= casa.andares) return null;
  if (Math.abs(x) > casa.largura / 2 + EPS || Math.abs(z) > casa.profundidade / 2 + EPS) return null;
  for (const comodo of casa.comodos) {
    if (comodo.andar !== andar) continue;
    if (areaDoComodo(casa, comodo).contem(x, z)) return comodo;
  }
  return { uid: '', andar, nome: 'Sem nome', ponto: [x, z] };
}

/**
 * Ajusta as paredes internas a uma nova largura e profundidade da casa: corta o que passa do limite da planta
 * e remove a parede que ficar com menos de 0,5 m. As passagens que deixam de caber somem; as demais acompanham a ponta `de`.
 * Devolve uma lista nova, sem alterar a de entrada.
 */
export function ajustarParedesInternas(paredes: ParedeInterna[], largura: number, profundidade: number): ParedeInterna[] {
  const limX = largura / 2;
  const limZ = profundidade / 2;
  const resultado: ParedeInterna[] = [];
  for (const p of paredes) {
    const alongaX = Math.abs(p.de[1] - p.para[1]) < EPS;
    // Eixo ao longo da parede (a) e eixo da posição dela (b).
    const ia = alongaX ? 0 : 1;
    const ib = alongaX ? 1 : 0;
    const limA = alongaX ? limX : limZ;
    const limB = alongaX ? limZ : limX;
    if (Math.abs(p.de[ib]) > limB + EPS) continue;
    const sentido = p.para[ia] >= p.de[ia] ? 1 : -1;
    const deA = Math.min(Math.max(p.de[ia], -limA), limA);
    const paraA = Math.min(Math.max(p.para[ia], -limA), limA);
    if (Math.abs(paraA - deA) < COMPRIMENTO_MINIMO_PAREDE - EPS) continue;
    const recuo = (deA - p.de[ia]) * sentido;
    const comprimento = Math.abs(paraA - deA);
    const passagens = p.passagens
      .map((d) => ARREDONDA(d - recuo))
      .filter((d) => d - 0.4 >= -EPS && d + 0.4 <= comprimento + EPS);
    const de: [number, number] = [0, 0];
    const para: [number, number] = [0, 0];
    de[ia] = ARREDONDA(deA);
    para[ia] = ARREDONDA(paraA);
    de[ib] = p.de[ib];
    para[ib] = p.para[ib];
    resultado.push({ ...p, de, para, passagens });
  }
  return resultado;
}
