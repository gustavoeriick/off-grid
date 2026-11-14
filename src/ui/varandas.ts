// Regras do formulário das varandas e do aviso do quartinho. Funções puras, sem DOM.
// Especificação: docs/especificacao/fase-2.md, seções 1.1 e 4.

import type { CasaConfig, LadoCasa, Varanda } from '../nucleo/tipos';

export const LADOS: readonly LadoCasa[] = ['frente', 'fundos', 'esquerda', 'direita'];

/** Limites do formulário. A beira do telhado da varanda não pode ficar abaixo de ALTURA_MIN_BEIRA. */
export const LIMITES_VARANDA = {
  profundidadeMin: 1,
  profundidadeMax: 6,
  profundidadePasso: 0.5,
  inclinacaoMin: 10,
  inclinacaoMax: 100,
  larguraMin: 1,
  alturaMinBeira: 2.0,
} as const;

const EPS = 1e-9;

/** Altura em que o telhado da varanda encontra a parede da casa. Mesma conta da cena. */
export function alturaDaParede(casa: Pick<CasaConfig, 'andares' | 'peDireito'>): number {
  return casa.andares === 2 ? casa.peDireito + 0.25 : casa.peDireito - 0.1;
}

/** Altura da beira de fora do telhado da varanda, em metros. */
export function alturaDaBeira(casa: Pick<CasaConfig, 'andares' | 'peDireito'>, profundidade: number, inclinacaoPct: number): number {
  return alturaDaParede(casa) - (profundidade * inclinacaoPct) / 100;
}

/** Medida da fachada de um lado: largura da casa para frente e fundos, profundidade para os lados. */
export function medidaDaFachada(casa: Pick<CasaConfig, 'largura' | 'profundidade'>, lado: LadoCasa): number {
  return lado === 'frente' || lado === 'fundos' ? casa.largura : casa.profundidade;
}

/** Maior profundidade (passo de 0,5 m, no mínimo 1 m) que ainda aceita 10% de inclinação. */
export function profundidadeMaxima(casa: Pick<CasaConfig, 'andares' | 'peDireito'>): number {
  const L = LIMITES_VARANDA;
  const folga = alturaDaParede(casa) - L.alturaMinBeira;
  const bruta = folga / (L.inclinacaoMin / 100);
  const passo = Math.floor((bruta + EPS) / L.profundidadePasso) * L.profundidadePasso;
  return Math.max(L.profundidadeMin, Math.min(L.profundidadeMax, passo));
}

/** Maior inclinação inteira (em %) que respeita a altura mínima da beira para esta profundidade. */
export function inclinacaoMaxima(casa: Pick<CasaConfig, 'andares' | 'peDireito'>, profundidade: number): number {
  const L = LIMITES_VARANDA;
  const folga = alturaDaParede(casa) - L.alturaMinBeira;
  const bruta = Math.floor(((folga / profundidade) * 100) + EPS);
  return Math.max(L.inclinacaoMin, Math.min(L.inclinacaoMax, bruta));
}

/** Maior deslocamento (em módulo) que mantém a varanda de uma dada largura dentro da fachada. */
export function deslocamentoMaximo(medidaFachada: number, largura: number): number {
  return Math.max(0, (medidaFachada - largura) / 2);
}

function entre(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Corta uma varanda para os limites: profundidade 1 a 6, inclinação 10 a 100% e no máximo o que respeita a altura
 * mínima da beira (se nem 10% respeitar, corta a profundidade), largura de 1 m até a fachada e deslocamento que a
 * mantém dentro da fachada.
 */
export function limitarVaranda(v: Varanda, casa: CasaConfig): Varanda {
  const L = LIMITES_VARANDA;
  const prof = entre(v.profundidade, L.profundidadeMin, Math.min(L.profundidadeMax, profundidadeMaxima(casa)));
  const inc = entre(v.inclinacaoPct, L.inclinacaoMin, inclinacaoMaxima(casa, prof));
  const fachada = medidaDaFachada(casa, v.lado);
  if (v.largura === null) return { lado: v.lado, profundidade: prof, inclinacaoPct: inc, largura: null, deslocamento: 0 };
  const largura = entre(v.largura, Math.min(L.larguraMin, fachada), fachada);
  const lim = deslocamentoMaximo(fachada, largura);
  return { lado: v.lado, profundidade: prof, inclinacaoPct: inc, largura, deslocamento: entre(v.deslocamento, -lim, lim) };
}

/** Varanda nova: 3 m e 30%, cortados pela regra da altura mínima, na fachada inteira. */
export function novaVaranda(lado: LadoCasa, casa: CasaConfig): Varanda {
  return limitarVaranda({ lado, profundidade: 3, inclinacaoPct: 30, largura: null, deslocamento: 0 }, casa);
}

/** Corta todas as varandas da lista; devolve a mesma lista se nada mudou. */
export function limitarVarandas(varandas: Varanda[], casa: CasaConfig): Varanda[] {
  const novas = varandas.map((v) => limitarVaranda(v, casa));
  const igual = novas.every((n, i) => JSON.stringify(n) === JSON.stringify(varandas[i]));
  return igual ? varandas : novas;
}

// ---------------------------------------------------------------- Aviso do quartinho

interface Retangulo {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Planta de uma varanda. Frente é +z, direita é +x. O deslocamento positivo vai para a direita de quem olha de fora. */
export function plantaDaVaranda(v: Varanda, casa: Pick<CasaConfig, 'largura' | 'profundidade'>): Retangulo {
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  const fachada = medidaDaFachada(casa, v.lado);
  const meia = (v.largura ?? fachada) / 2;
  const c = v.largura === null ? 0 : v.deslocamento;
  switch (v.lado) {
    case 'frente':
      return { x0: c - meia, x1: c + meia, z0: D, z1: D + v.profundidade };
    case 'fundos':
      return { x0: -c - meia, x1: -c + meia, z0: -D - v.profundidade, z1: -D };
    case 'direita':
      return { x0: W, x1: W + v.profundidade, z0: -c - meia, z1: -c + meia };
    case 'esquerda':
      return { x0: -W - v.profundidade, x1: -W, z0: c - meia, z1: c + meia };
  }
}

/** Verdadeiro quando o retângulo girado do quartinho invade (área maior que zero) o retângulo `r`. */
function quartinhoCruza(q: CasaConfig['quartinho'], r: Retangulo): boolean {
  const th = (q.giro * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const hx = q.largura / 2;
  const hz = q.profundidade / 2;
  // Eixos do quartinho (convenção de rotation.y do Three.js) e eixos do mundo.
  const eixoA: [number, number] = [c, -s];
  const eixoB: [number, number] = [s, c];
  const rx = (r.x1 - r.x0) / 2;
  const rz = (r.z1 - r.z0) / 2;
  const dx = (r.x0 + r.x1) / 2 - q.x;
  const dz = (r.z0 + r.z1) / 2 - q.z;
  const eixos: [number, number][] = [[1, 0], [0, 1], eixoA, eixoB];
  for (const [ex, ez] of eixos) {
    const raioQ = hx * Math.abs(eixoA[0] * ex + eixoA[1] * ez) + hz * Math.abs(eixoB[0] * ex + eixoB[1] * ez);
    const raioR = rx * Math.abs(ex) + rz * Math.abs(ez);
    if (Math.abs(dx * ex + dz * ez) >= raioQ + raioR - 1e-6) return false;
  }
  return true;
}

/** Texto do aviso quando o quartinho está em cima da casa ou de uma varanda; nulo quando está livre. */
export function avisoDoQuartinho(casa: CasaConfig): string | null {
  const planta: Retangulo = { x0: -casa.largura / 2, x1: casa.largura / 2, z0: -casa.profundidade / 2, z1: casa.profundidade / 2 };
  const retangulos = [planta, ...casa.varandas.map((v) => plantaDaVaranda(v, casa))];
  return retangulos.some((r) => quartinhoCruza(casa.quartinho, r)) ? 'O quartinho está em cima da casa ou da varanda.' : null;
}
