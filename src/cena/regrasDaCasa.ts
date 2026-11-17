// Regras de edição da casa: limites das varandas, lugar do quartinho, paredes internas e cômodos.
// Funções puras, sem Three.js e sem DOM: a cena (arraste com o ponteiro) e a interface (formulário e painéis)
// usam as mesmas contas. Especificação: docs/especificacao/fase-2.md, seções 1.1, 1.2 e 4.

import { areaDoComodo, COMPRIMENTO_MINIMO_PAREDE, GRADE } from '../nucleo/comodos';
import type { CasaConfig, Comodo, LadoCasa, ParedeInterna, Varanda } from '../nucleo/tipos';

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

export interface Retangulo {
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

// ---------------------------------------------------------------- Canto entre duas varandas

/** Folga, em metros, para dizer que a ponta de uma varanda encosta na quina da casa. */
const FOLGA_DA_QUINA = 0.02;

/** Lado vizinho de cada lado, na ponta positiva da fachada (à direita de quem a olha de fora). */
const LADO_SEGUINTE: Record<LadoCasa, LadoCasa> = { frente: 'direita', direita: 'fundos', fundos: 'esquerda', esquerda: 'frente' };

/**
 * Canto entre duas varandas de lados vizinhos que chegam, as duas, até a mesma quina da casa.
 * Não está no projeto salvo: é derivado das duas varandas. É desenho e sombra, não superfície de encaixe.
 */
export interface CantoDeVarandas {
  /** As duas varandas, na ordem em que se dá a volta na casa: a ponta positiva da primeira encontra a ponta negativa da segunda. */
  lados: [LadoCasa, LadoCasa];
  /** Retângulo do canto, em coordenadas da casa: da quina da casa até a quina de fora. */
  planta: Retangulo;
  /**
   * `espigao`: as duas têm a mesma profundidade e a mesma inclinação, e os dois telhados se encontram na diagonal.
   * `aberto`: são diferentes, e o canto leva só piso e pilar, sem telhado.
   */
  fechamento: 'espigao' | 'aberto';
}

/** A varanda como a cena a desenha: pontas cortadas para caber na fachada e inclinação cortada pela beira de 2,0 m. */
function varandaDesenhada(casa: Pick<CasaConfig, 'largura' | 'profundidade' | 'andares' | 'peDireito' | 'varandas'>, lado: LadoCasa): { a0: number; a1: number; meia: number; profundidade: number; inclinacao: number } | null {
  // Vale a primeira da lista em cada lado, como no desenho.
  const v = casa.varandas.find((item) => item.lado === lado);
  if (!v || !(v.profundidade > 0.05)) return null;
  const fachada = medidaDaFachada(casa, lado);
  const largura = v.largura === null ? fachada : entre(v.largura, 0, fachada);
  if (!(largura > 0.05)) return null;
  const folga = (fachada - largura) / 2;
  const centro = v.largura === null ? 0 : entre(v.deslocamento, -folga, folga);
  const teto = Math.max(0, (alturaDaParede(casa) - LIMITES_VARANDA.alturaMinBeira) / v.profundidade);
  return { a0: centro - largura / 2, a1: centro + largura / 2, meia: fachada / 2, profundidade: v.profundidade, inclinacao: entre(v.inclinacaoPct / 100, 0, teto) };
}

/**
 * Cantos entre varandas vizinhas. Há canto quando a ponta de cada uma das duas encosta na quina da casa que elas
 * dividem (a varanda nunca passa da ponta da fachada, então encostar é chegar a ela). O retângulo vai da quina da
 * casa até a profundidade de cada uma. O telhado só fecha em espigão com profundidades e inclinações iguais.
 */
export function cantosDasVarandas(casa: Pick<CasaConfig, 'largura' | 'profundidade' | 'andares' | 'peDireito' | 'varandas' | 'soQuartinho'>): CantoDeVarandas[] {
  if (casa.soQuartinho) return [];
  const W = casa.largura / 2;
  const D = casa.profundidade / 2;
  const lista: CantoDeVarandas[] = [];
  for (const primeiro of ['frente', 'direita', 'fundos', 'esquerda'] as const) {
    const segundo = LADO_SEGUINTE[primeiro];
    const a = varandaDesenhada(casa, primeiro);
    const b = varandaDesenhada(casa, segundo);
    if (!a || !b) continue;
    if (a.a1 < a.meia - FOLGA_DA_QUINA || b.a0 > -b.meia + FOLGA_DA_QUINA) continue;
    // A quina fica em x = ±W e z = ±D; a varanda da frente ou dos fundos dá a medida em Z, a lateral dá a medida em X.
    const lateral = primeiro === 'direita' || primeiro === 'esquerda' ? a : b;
    const frontal = lateral === a ? b : a;
    const sx = primeiro === 'frente' || primeiro === 'direita' ? 1 : -1;
    const sz = primeiro === 'frente' || primeiro === 'esquerda' ? 1 : -1;
    const xFora = sx * (W + lateral.profundidade);
    const zFora = sz * (D + frontal.profundidade);
    const iguais = Math.abs(a.profundidade - b.profundidade) < 1e-6 && Math.abs(a.inclinacao - b.inclinacao) < 1e-6;
    lista.push({
      lados: [primeiro, segundo],
      planta: { x0: Math.min(sx * W, xFora), x1: Math.max(sx * W, xFora), z0: Math.min(sz * D, zFora), z1: Math.max(sz * D, zFora) },
      fechamento: iguais ? 'espigao' : 'aberto',
    });
  }
  return lista;
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

/** A varanda, com estas medidas, ficaria em cima do quartinho. */
export function varandaSobreOQuartinho(casa: CasaConfig, v: Varanda): boolean {
  // No tutorial só existe o quartinho: não há varanda para ficar em cima dele.
  if (casa.soQuartinho) return false;
  if (quartinhoCruza(casa.quartinho, plantaDaVaranda(v, casa))) return true;
  // O canto que ela forma com uma varanda vizinha também é chão da varanda.
  const com = { ...casa, varandas: [v, ...casa.varandas.filter((item) => item.lado !== v.lado)] };
  return cantosDasVarandas(com).some((c) => c.lados.includes(v.lado) && quartinhoCruza(casa.quartinho, c.planta));
}

/** Limites da posição do quartinho no terreno (seção 12 de cena-e-interface.md) e passo do arraste. */
export const LIMITES_QUARTINHO = { posicaoMax: 15, passo: 0.5 } as const;

/** Texto do aviso quando o quartinho está em cima da casa ou de uma varanda; nulo quando está livre. */
export function avisoDoQuartinho(casa: CasaConfig): string | null {
  // No tutorial o corpo da casa não existe: as medidas dele continuam no projeto, mas não valem nada.
  if (casa.soQuartinho) return null;
  const planta: Retangulo = { x0: -casa.largura / 2, x1: casa.largura / 2, z0: -casa.profundidade / 2, z1: casa.profundidade / 2 };
  const retangulos = [planta, ...casa.varandas.map((v) => plantaDaVaranda(v, casa)), ...cantosDasVarandas(casa).map((c) => c.planta)];
  return retangulos.some((r) => quartinhoCruza(casa.quartinho, r)) ? 'O quartinho está em cima da casa ou da varanda.' : null;
}

// ---------------------------------------------------------------- Varanda arrastada pelas alças

const centavos = (v: number): number => Math.round(v * 100) / 100;
const naGrade = (v: number, passo: number): number => centavos(Math.round(v / passo) * passo);

/** Pontas da varanda ao longo da fachada, no quadro da fachada (zero no meio, positivo à direita de quem olha de fora). */
export function pontasDaVaranda(v: Varanda, casa: Pick<CasaConfig, 'largura' | 'profundidade'>): [a0: number, a1: number] {
  const fachada = medidaDaFachada(casa, v.lado);
  if (v.largura === null) return [-fachada / 2, fachada / 2];
  return [v.deslocamento - v.largura / 2, v.deslocamento + v.largura / 2];
}

/** Varanda com a profundidade pedida pelo arraste da borda de fora: passo de 0,5 m, inclinação cortada pela regra dos 2,0 m. */
export function varandaComProfundidade(base: Varanda, profundidade: number, casa: CasaConfig): Varanda {
  return limitarVaranda({ ...base, profundidade: naGrade(profundidade, LIMITES_VARANDA.profundidadePasso) }, casa);
}

/**
 * Varanda com uma das pontas levada até `t` (posição ao longo da fachada, no quadro dela): passo de 0,1 m,
 * largura mínima de 1 m. Quando as duas pontas chegam às pontas da fachada, vira `largura: null`.
 */
export function varandaComPonta(base: Varanda, ponta: -1 | 1, t: number, casa: CasaConfig): Varanda {
  const meia = medidaDaFachada(casa, base.lado) / 2;
  let [a0, a1] = pontasDaVaranda(base, casa);
  const minimo = Math.min(LIMITES_VARANDA.larguraMin, 2 * meia);
  if (ponta === -1) a0 = entre(naGrade(t, GRADE), -meia, a1 - minimo);
  else a1 = entre(naGrade(t, GRADE), a0 + minimo, meia);
  if (a0 <= -meia + 1e-6 && a1 >= meia - 1e-6) return limitarVaranda({ ...base, largura: null, deslocamento: 0 }, casa);
  const v = limitarVaranda({ ...base, largura: centavos(a1 - a0), deslocamento: centavos((a0 + a1) / 2) }, casa);
  // O corte do deslocamento é uma conta com a largura: tira o ruído (0,8999999).
  return { ...v, deslocamento: centavos(v.deslocamento) };
}

// ---------------------------------------------------------------- Quartinho arrastado

/** Quartinho levado até (x, z), preso à grade de 0,5 m e aos limites do terreno. */
export function quartinhoEm(q: CasaConfig['quartinho'], x: number, z: number): CasaConfig['quartinho'] {
  const L = LIMITES_QUARTINHO;
  return { ...q, x: entre(naGrade(x, L.passo), -L.posicaoMax, L.posicaoMax), z: entre(naGrade(z, L.passo), -L.posicaoMax, L.posicaoMax) };
}

// ---------------------------------------------------------------- Paredes internas

export type Ponto = [x: number, z: number];

/** Distância a que a ponta de uma parede gruda no limite da planta (cobre a espessura da parede de fora). */
const GRUDA_NO_LIMITE = 0.35;
/** Distância a que a ponta gruda no eixo de outra parede interna que ela encontra. */
const GRUDA_NA_PAREDE = 0.25;
/** Menor distância entre o eixo de uma parede interna e o limite da planta: mais perto, ela ficaria dentro da parede de fora. */
export const RECUO_DA_PAREDE = 0.2;
export const LARGURA_DA_PASSAGEM = 0.8;
/** Sobra de parede entre a passagem e a ponta, e entre duas passagens. */
const OMBREIRA = 0.1;

export const paralelaAX = (p: Pick<ParedeInterna, 'de' | 'para'>): boolean => Math.abs(p.de[1] - p.para[1]) < 1e-6;

export function comprimentoDaParede(p: Pick<ParedeInterna, 'de' | 'para'>): number {
  return centavos(Math.hypot(p.para[0] - p.de[0], p.para[1] - p.de[1]));
}

/**
 * Coordenada, ao longo da direção da parede, em que uma ponta fica: na grade de 0,1 m, grudando no limite da planta
 * e no eixo de outra parede que ela encontra. Sem isso sobraria uma fresta por onde dois cômodos se juntariam.
 * `fixa` é a outra coordenada da parede (a que não muda ao longo dela).
 */
export function prenderPonta(valor: number, fixa: number, aoLongoDeX: boolean, casa: CasaConfig, andar: 0 | 1, ignorar?: string): number {
  const lim = (aoLongoDeX ? casa.largura : casa.profundidade) / 2;
  if (valor > lim - GRUDA_NO_LIMITE) return lim;
  if (valor < -lim + GRUDA_NO_LIMITE) return -lim;
  let melhor: number | null = null;
  for (const p of casa.paredesInternas) {
    if (p.andar !== andar || p.uid === ignorar || paralelaAX(p) === aoLongoDeX) continue;
    // Parede de través: o eixo dela fica em uma coordenada ao longo da nossa direção.
    const eixo = aoLongoDeX ? p.de[0] : p.de[1];
    const [s0, s1] = aoLongoDeX ? [p.de[1], p.para[1]] : [p.de[0], p.para[0]];
    if (fixa < Math.min(s0, s1) - 0.05 || fixa > Math.max(s0, s1) + 0.05) continue;
    if (Math.abs(valor - eixo) <= GRUDA_NA_PAREDE && (melhor === null || Math.abs(valor - eixo) < Math.abs(valor - melhor))) melhor = eixo;
  }
  return melhor ?? naGrade(valor, GRADE);
}

/** Parede desenhada do ponto `a` até perto do ponto `b`: presa à grade e ao eixo (X ou Z) em que o arraste foi mais longe. */
export function paredeEntre(a: Ponto, b: Ponto, casa: CasaConfig, andar: 0 | 1): { de: Ponto; para: Ponto } {
  const aoLongoDeX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const limFixa = (aoLongoDeX ? casa.profundidade : casa.largura) / 2 - RECUO_DA_PAREDE;
  const fixa = entre(naGrade(aoLongoDeX ? a[1] : a[0], GRADE), -limFixa, limFixa);
  const u0 = prenderPonta(aoLongoDeX ? a[0] : a[1], fixa, aoLongoDeX, casa, andar);
  const u1 = prenderPonta(aoLongoDeX ? b[0] : b[1], fixa, aoLongoDeX, casa, andar);
  return aoLongoDeX ? { de: [u0, fixa], para: [u1, fixa] } : { de: [fixa, u0], para: [fixa, u1] };
}

/** Parede levada, de través, até a coordenada dada (grade de 0,1 m, sem entrar na parede de fora). */
export function paredeMovida(p: ParedeInterna, coordenada: number, casa: CasaConfig): { de: Ponto; para: Ponto } {
  const x = paralelaAX(p);
  const lim = (x ? casa.profundidade : casa.largura) / 2 - RECUO_DA_PAREDE;
  const w = entre(naGrade(coordenada, GRADE), -lim, lim);
  return x ? { de: [p.de[0], w], para: [p.para[0], w] } : { de: [w, p.de[1]], para: [w, p.para[1]] };
}

/**
 * Parede com uma ponta levada até `valor` (coordenada ao longo dela). Nunca fica com menos de 0,5 m.
 * As passagens ficam onde estavam na casa; as que deixam de caber somem.
 */
export function paredeEsticada(p: ParedeInterna, ponta: 'de' | 'para', valor: number, casa: CasaConfig): Pick<ParedeInterna, 'de' | 'para' | 'passagens'> {
  const x = paralelaAX(p);
  const i = x ? 0 : 1;
  const fixa = p.de[x ? 1 : 0];
  const outra = ponta === 'de' ? p.para[i] : p.de[i];
  const sentido = Math.sign(p.para[i] - p.de[i]) || 1;
  // A ponta arrastada continua do mesmo lado da outra.
  const lado = ponta === 'de' ? -sentido : sentido;
  let u = prenderPonta(valor, fixa, x, casa, p.andar, p.uid);
  if ((u - outra) * lado < COMPRIMENTO_MINIMO_PAREDE) u = centavos(outra + lado * COMPRIMENTO_MINIMO_PAREDE);
  const de: Ponto = [p.de[0], p.de[1]];
  const para: Ponto = [p.para[0], p.para[1]];
  (ponta === 'de' ? de : para)[i] = u;
  const recuo = (de[i] - p.de[i]) * sentido;
  const comprimento = Math.abs(para[i] - de[i]);
  const meia = LARGURA_DA_PASSAGEM / 2;
  const passagens = p.passagens.map((d) => centavos(d - recuo)).filter((d) => d - meia >= -1e-6 && d + meia <= comprimento + 1e-6);
  return { de, para, passagens };
}

/** A parede (linha do eixo) passa por dentro do retângulo. Encostar na borda não conta. */
export function atravessa(p: Pick<ParedeInterna, 'de' | 'para'>, r: Retangulo): boolean {
  const folga = 0.02;
  const x0 = Math.min(p.de[0], p.para[0]);
  const x1 = Math.max(p.de[0], p.para[0]);
  const z0 = Math.min(p.de[1], p.para[1]);
  const z1 = Math.max(p.de[1], p.para[1]);
  return x1 > r.x0 + folga && x0 < r.x1 - folga && z1 > r.z0 + folga && z0 < r.z1 - folga;
}

/** Distância do ponto (x, z) ao eixo da parede, e a distância da ponta `de` até o ponto do eixo mais próximo. */
export function distanciaDaParede(p: Pick<ParedeInterna, 'de' | 'para'>, x: number, z: number): { distancia: number; d: number } {
  const dx = p.para[0] - p.de[0];
  const dz = p.para[1] - p.de[1];
  const comp = Math.hypot(dx, dz);
  if (comp < 1e-9) return { distancia: Math.hypot(x - p.de[0], z - p.de[1]), d: 0 };
  const d = entre(((x - p.de[0]) * dx + (z - p.de[1]) * dz) / comp, 0, comp);
  return { distancia: Math.hypot(x - (p.de[0] + (dx * d) / comp), z - (p.de[1] + (dz * d) / comp)), d };
}

/**
 * Passagens da parede depois de um clique a `d` metros da ponta `de`: tira a passagem que estiver ali ou põe uma nova
 * de 0,8 m, afastada das pontas e das outras passagens. Nulo quando não cabe uma passagem ali.
 */
export function alternarPassagem(p: ParedeInterna, d: number): number[] | null {
  const meia = LARGURA_DA_PASSAGEM / 2;
  const existente = p.passagens.findIndex((c) => Math.abs(c - d) <= meia);
  if (existente >= 0) return p.passagens.filter((_, i) => i !== existente);
  const comp = comprimentoDaParede(p);
  const min = meia + OMBREIRA;
  const max = comp - meia - OMBREIRA;
  if (max < min - 1e-6) return null;
  const centro = entre(naGrade(d, GRADE), min, max);
  if (p.passagens.some((c) => Math.abs(c - centro) < LARGURA_DA_PASSAGEM + OMBREIRA - 1e-6)) return null;
  return [...p.passagens, centavos(centro)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- Cômodos

/** Cômodo com nome cuja área contém o ponto, ou nulo. Com mais de um na mesma área, vale o primeiro da lista. */
export function comodoNoPonto(casa: CasaConfig, andar: 0 | 1, x: number, z: number): Comodo | null {
  for (const c of casa.comodos) {
    if (c.andar === andar && areaDoComodo(casa, c).contem(x, z)) return c;
  }
  return null;
}

/** O ponto está dentro da planta do andar. */
export function naPlanta(casa: Pick<CasaConfig, 'largura' | 'profundidade'>, x: number, z: number): boolean {
  return Math.abs(x) < casa.largura / 2 - 1e-6 && Math.abs(z) < casa.profundidade / 2 - 1e-6;
}

/** Centro da célula de 0,1 m que contém a coordenada: um ponto que nunca cai em cima de uma linha de parede. */
const centroDaCelula = (v: number): number => centavos((Math.floor(v / GRADE + 1e-6) + 0.5) * GRADE);

/**
 * Onde escrever o nome de um cômodo novo, criado com um clique em (x, z): o meio da área, se o meio fizer parte dela
 * (em um cômodo em L pode não fazer); senão, o próprio ponto clicado.
 */
export function pontoDoNome(casa: CasaConfig, andar: 0 | 1, x: number, z: number): Ponto {
  const clique: Ponto = [centroDaCelula(x), centroDaCelula(z)];
  const area = areaDoComodo(casa, { uid: '', andar, nome: '', ponto: clique });
  if (area.celulas === 0) return clique;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let cx = -casa.largura / 2 + GRADE / 2; cx < casa.largura / 2; cx += GRADE) {
    for (let cz = -casa.profundidade / 2 + GRADE / 2; cz < casa.profundidade / 2; cz += GRADE) {
      if (!area.contem(cx, cz)) continue;
      x0 = Math.min(x0, cx);
      x1 = Math.max(x1, cx);
      z0 = Math.min(z0, cz);
      z1 = Math.max(z1, cz);
    }
  }
  const meio: Ponto = [centroDaCelula((x0 + x1) / 2), centroDaCelula((z0 + z1) / 2)];
  return area.contem(meio[0], meio[1]) ? meio : clique;
}

/**
 * Cômodos que continuam valendo depois de uma parede ser criada, movida ou apagada, e os nomes dos que saem:
 * sai o cômodo cujo `ponto` ficou dentro de uma parede ou fora da planta e, quando duas áreas se juntam
 * e ficam com dois nomes, sai o segundo. Devolve a mesma lista se nada mudou.
 */
export function limparComodos(casa: CasaConfig): { comodos: Comodo[]; removidos: string[]; juntados: { saiu: string; ficou: string }[] } {
  const ficam: Comodo[] = [];
  const removidos: string[] = [];
  const juntados: { saiu: string; ficou: string }[] = [];
  for (const c of casa.comodos) {
    const [x, z] = c.ponto;
    const naParede = casa.paredesInternas.some((p) => p.andar === c.andar && distanciaDaParede(p, x, z).distancia < 0.05 - 1e-6);
    if (naParede || !naPlanta(casa, x, z)) {
      removidos.push(c.nome);
      continue;
    }
    const dono = ficam.find((f) => f.andar === c.andar && areaDoComodo(casa, f).contem(x, z));
    if (dono) {
      juntados.push({ saiu: c.nome, ficou: dono.nome });
      continue;
    }
    ficam.push(c);
  }
  return { comodos: ficam.length === casa.comodos.length ? casa.comodos : ficam, removidos, juntados };
}

/** Nomes sugeridos para um cômodo (fase-2.md, seção 4). */
export const NOMES_DE_COMODO = ['Sala', 'Cozinha', 'Quarto', 'Banheiro', 'Escritório', 'Área de serviço', 'Corredor'] as const;
