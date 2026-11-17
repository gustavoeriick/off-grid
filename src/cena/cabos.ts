// Camada de cabos: desenha os cabos do projeto e informa o comprimento de cada um.
// Especificação: docs/especificacao/cena-e-interface.md, seção 8, e fase-2.md, seção 1.3.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Protecao } from '../catalogo/tipos';
import { acoes, estado } from '../estado';
import type { Cabo, PontaCabo, Projeto, TipoTerminal } from '../nucleo/tipos';
import type { CamadaDeDispositivos } from './dispositivos';
import { ehGrampo } from './encaixe';
import { liso } from './estampas';
import { esconder } from './malha';
import { GRAMPO } from './modelos';
import { estadoDaProtecao } from '../nucleo/operacao';
import { aplicarEstadoDaProtecao, modeloDaProtecao } from './protecoes';

/** Quanto o cabo segue a direção de saída do terminal antes de fazer a curva. */
const SAIDA = 0.12;
/** Raio do desenho. Os da seção 8 (0,012, 0,022 e 0,015) ficavam grossos de perto. */
const RAIO: Record<string, number> = { solar: 0.006, bateria: 0.011, ca: 0.007 };
/** Raio do tubo invisível que recebe o clique: o cabo fino seria difícil de acertar. */
export const RAIO_DE_CLIQUE_DO_CABO = 0.03;
/** O porta-fusível da bateria fica a esta distância do terminal dela, ao longo do cabo. */
const DISTANCIA_DO_FUSIVEL = 0.2;
/**
 * Proteção desenhada no cabo, fora de quadro: um pouco ampliada, e sempre mais larga que o cabo, para ser reconhecida.
 */
function escalaNoCabo(larguraDaPeca: number, raio: number): number {
  return Math.max(1.25, (2 * raio + 0.016) / larguraDaPeca);
}

/** `(|dx| + |dy| + |dz|) × 1,1` entre dois pontos, em coordenadas da casa, sem mínimo nem arredondamento. */
function brutoDoTrecho(a: THREE.Vector3, b: THREE.Vector3): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) * 1.1;
}

/** Mínimo de 0,3 m e arredondamento a 0,1 m. */
function comprimentoFinal(bruto: number): number {
  return Math.round(Math.max(0.3, bruto) * 10) / 10;
}

/** Comprimento de um trecho entre dois pontos, em coordenadas da casa: `(|dx| + |dy| + |dz|) × 1,1`, mínimo de 0,3 m, arredondado a 0,1 m. */
export function comprimentoDoTrecho(a: THREE.Vector3, b: THREE.Vector3): number {
  return comprimentoFinal(brutoDoTrecho(a, b));
}

/** Cor do cabo pelas duas pontas (seção 8). */
export function corDoCabo(a: TipoTerminal, b: TipoTerminal): string {
  if (a === 'ca' || b === 'ca') return '#90a4ae';
  if (a === 'cc+' && b === 'cc+') return '#e53935';
  if (a === 'cc-' && b === 'cc-') return '#37474f';
  return '#fb8c00';
}

interface Ponta {
  pos: THREE.Vector3;
  saida: THREE.Vector3;
}

/** Plano de uma superfície em que há um grampo: o cabo solto que chega a ele não entra na superfície. */
interface Plano {
  ponto: THREE.Vector3;
  normal: THREE.Vector3;
}

interface OpcoesDaCurva {
  /** Quanto o cabo segue a saída de cada ponta. O padrão é o do cabo solto. */
  saida?: number;
  /** Falso tira a barriga do meio (entre dois grampos de superfícies diferentes o cabo vai esticado). */
  barriga?: boolean;
  /** O meio da curva fica do lado de fora destes planos, a pelo menos `folga` deles. */
  planos?: readonly Plano[];
  folga?: number;
}

/** Curva suave de um trecho: ponta A; A mais a saída; meio rebaixado; B mais a saída; ponta B. */
export function curvaDoTrecho(a: Ponta, b: Ponta, opcoes: OpcoesDaCurva = {}): THREE.CatmullRomCurve3 {
  const dist = a.pos.distanceTo(b.pos);
  // Em trecho curto a saída encolhe, para a curva não dar laço.
  const s = Math.min(opcoes.saida ?? SAIDA, dist * 0.3);
  const meio = a.pos.clone().add(b.pos).multiplyScalar(0.5);
  if (opcoes.barriga !== false) meio.y -= Math.min(0.6, dist * 0.12);
  for (const plano of opcoes.planos ?? []) {
    const falta = (opcoes.folga ?? 0) - meio.clone().sub(plano.ponto).dot(plano.normal);
    if (falta > 0) meio.addScaledVector(plano.normal, falta);
  }
  return new THREE.CatmullRomCurve3(
    [a.pos.clone(), a.pos.clone().addScaledVector(a.saida, s), meio, b.pos.clone().addScaledVector(b.saida, s), b.pos.clone()],
    false,
    'centripetal',
  );
}

/**
 * A mesma curva, percorrida de modo a pôr mais pontos perto das duas pontas, onde o cabo dobra:
 * o tubo fica liso na dobra sem gastar triângulos no trecho reto do meio.
 */
class PercursoDoTubo extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly curva: THREE.CatmullRomCurve3) {
    super();
  }

  private parametro(u: number): number {
    // Quatro vãos entre os cinco pontos. Nos dois do meio, os pontos se juntam do lado da ponta do cabo.
    const v = Math.min(3.999999, Math.max(0, u) * 4);
    const i = Math.floor(v);
    const t = v - i;
    const local = i === 1 ? t * t * t : i === 2 ? 1 - (1 - t) ** 3 : t;
    return (i + local) / 4;
  }

  override getPoint(u: number, alvo = new THREE.Vector3()): THREE.Vector3 {
    return this.curva.getPoint(this.parametro(u), alvo);
  }

  override getPointAt(u: number, alvo = new THREE.Vector3()): THREE.Vector3 {
    return this.getPoint(u, alvo);
  }

  override getTangent(u: number, alvo = new THREE.Vector3()): THREE.Vector3 {
    return this.curva.getTangent(this.parametro(u), alvo);
  }

  override getTangentAt(u: number, alvo = new THREE.Vector3()): THREE.Vector3 {
    return this.getTangent(u, alvo);
  }
}

/** Divisões do tubo ao longo do cabo: 14 por vão da curva. */
const DIVISOES_DO_TUBO = 56;
/** O tubo de clique não é desenhado: basta acompanhar a curva. */
const DIVISOES_DO_CLIQUE = 28;

export interface CamadaDeCabos {
  /**
   * Refaz os cabos cuja forma mudou. Quando uma ponta de um cabo já desenhado muda de lugar (peça movida,
   * cabo que passou a atravessar um quadro), informa o comprimento novo com `acoes.definirComprimentos`.
   * Projeto recém-aberto e peças recém-colocadas ficam com os comprimentos que o projeto traz.
   */
  atualizar(): void;
  /**
   * Comprimento, pela fórmula da seção 8, de um cabo direto entre dois terminais (cabo novo ainda não passa por quadro).
   * Para quem cria o cabo. Nulo se alguma ponta não está na cena.
   */
  comprimentoEntre(de: PontaCabo, para: PontaCabo): number | null;
  /**
   * Durante um arraste, a peça muda de lugar a cada movimento do ponteiro: com `true`, os cabos são redesenhados
   * mas os comprimentos ficam como estão; com `false`, os comprimentos dos cabos que mudaram de percurso são informados.
   */
  adiarComprimentos(adiar: boolean): void;
  /** Mede de novo os cabos dados (ou todos) pelo desenho atual, com a passagem pelo quadro, e informa os comprimentos. */
  medir(uids?: readonly string[]): void;
  /** Grupo de um cabo: os tubos e as proteções desenhadas nele, todos com `userData.cabo`. */
  grupoDe(uid: string): THREE.Group | undefined;
  /** Tubos invisíveis de clique dos cabos à vista (`userData.cabo`), com 0,03 de raio, para o raio do ponteiro. */
  malhas(): THREE.Object3D[];
  /** Ponto do cabo, em coordenadas da casa, a uma fração do primeiro trecho. Nulo se o cabo não está desenhado. */
  ponto(uid: string, fracao?: number): THREE.Vector3 | null;
  /**
   * Para o grampo de parede que vai ser posto em `ponto` (coordenadas da casa): o cabo desenhado mais próximo.
   * Valem primeiro os cabos à vista. Nulo se não há cabo desenhado.
   */
  maisProximo(ponto: THREE.Vector3): string | null;
  /** Posição, na lista de grampos do cabo, em que um grampo novo em `ponto` menos alonga o caminho. */
  indiceDoGrampo(uid: string, ponto: THREE.Vector3): number;
  /** A proteção de índice dado desenhada no próprio cabo (fora de quadro). Nulo se não está desenhada aqui. */
  protecao(uid: string, indice: number): THREE.Object3D | null;
  /** Verdadeiro se o cabo está escondido pelo modo de visão, ou não está desenhado. */
  escondido(uid: string): boolean;
  /** Ponto do cabo, em coordenadas da casa, a uma fração do caminho inteiro (todos os trechos). Nulo se o cabo não está desenhado. */
  pontoNoCaminho(uid: string, fracao: number): THREE.Vector3 | null;
  destruir(): void;
}

interface Desenho {
  grupo: THREE.Group;
  assinatura: string;
  escondido: boolean;
  curvas: THREE.Curve<THREE.Vector3>[];
  /** Proteções desenhadas no cabo, por índice em `cabo.protecoes`. */
  protecoes: Map<number, { item: Protecao; peca: THREE.Object3D }>;
}

/** Cabo queimado por curto: capa carbonizada, com o cobre aparecendo em alguns pontos. */
const COR_DO_CABO_QUEIMADO = '#1a1512';
const COR_DO_COBRE_EXPOSTO = '#9a5a2c';

/** Grampo de parede por onde o cabo passa. */
interface GrampoNoCabo {
  uid: string;
  /** Onde o cabo passa: sob o arco, encostado na superfície. */
  pos: THREE.Vector3;
  /** Normal da superfície e os dois eixos da peça no plano dela. */
  normal: THREE.Vector3;
  ex: THREE.Vector3;
  ey: THREE.Vector3;
}

/** Trecho do desenho, de uma ponta a outra. */
interface Trecho {
  a: Ponta;
  b: Ponta;
  /** Entre dois grampos da mesma superfície: reto e rente a ela. */
  reto: boolean;
  /** Entre dois grampos de superfícies diferentes: esticado, sem barriga. */
  esticado: boolean;
  /** Superfícies dos grampos das pontas. */
  planos: Plano[];
  /**
   * Entre dois grampos: os pontos por onde o cabo passa, em linha reta de um a outro. Na mesma superfície são só as
   * duas pontas; em volta de uma quina entra o ponto dela; no vão, o ponto em que o cabo deixa a borda da superfície.
   */
  linha: THREE.Vector3[] | null;
  /** Normal da superfície de cada pedaço da linha (nula no ar). */
  normais: (THREE.Vector3 | null)[];
}

/** Pedaço do desenho de um cabo: a curva e, quando corre rente a uma superfície, a normal dela. */
interface Pedaco {
  curva: THREE.Curve<THREE.Vector3>;
  normal: THREE.Vector3 | null;
}

/** Raio da curva do cabo ao dobrar uma quina ou a borda de uma superfície. */
const RAIO_DA_DOBRA = 0.018;
/** No vão que começa atrás da superfície do grampo (o beiral), quanto o cabo segue por ela antes de virar. */
const PASSO_DA_BORDA = 0.035;

/**
 * Linha do cabo entre dois grampos de superfícies diferentes.
 * - Faces perpendiculares com os grampos frente a frente (quina de parede com parede ou com piso): o cabo segue
 *   cada face até a quina.
 * - Senão é um vão, em linha reta; se a outra ponta fica atrás da superfície do grampo (o cabo que dá a volta no
 *   beiral), ele antes segue a superfície por alguns centímetros, para sair pela borda e não por dentro dela.
 */
function linhaEntreGrampos(p: GrampoNoCabo, q: GrampoNoCabo): { linha: THREE.Vector3[]; normais: (THREE.Vector3 | null)[] } {
  const d = q.pos.clone().sub(p.pos);
  if (Math.abs(p.normal.dot(q.normal)) < 0.05) {
    const eixo = new THREE.Vector3().crossVectors(p.normal, q.normal).normalize();
    if (Math.abs(d.dot(eixo)) < 0.012) {
      const quina = p.pos.clone().addScaledVector(q.normal, d.dot(q.normal));
      if (quina.distanceTo(p.pos) > 1e-4 && quina.distanceTo(q.pos) > 1e-4) return { linha: [p.pos, quina, q.pos], normais: [p.normal, q.normal] };
    }
  }
  const linha = [p.pos];
  const normais: (THREE.Vector3 | null)[] = [];
  const borda = (g: GrampoNoCabo, outro: THREE.Vector3): THREE.Vector3 | null => {
    const rumo = outro.clone().sub(g.pos);
    if (rumo.dot(g.normal) > -0.01) return null;
    rumo.addScaledVector(g.normal, -rumo.dot(g.normal));
    return rumo.lengthSq() < 1e-8 ? null : g.pos.clone().addScaledVector(rumo.normalize(), PASSO_DA_BORDA);
  };
  const bp = borda(p, q.pos);
  const bq = borda(q, p.pos);
  if (bp) {
    linha.push(bp);
    normais.push(p.normal);
  }
  if (bq) {
    linha.push(bq);
    normais.push(null);
  }
  linha.push(q.pos);
  normais.push(bq ? q.normal : null);
  return { linha, normais };
}

/** Curvas de uma linha de pontos: retas, com um arco pequeno em cada dobra. */
function pedacosDaLinha(linha: readonly THREE.Vector3[], normais: readonly (THREE.Vector3 | null)[]): Pedaco[] {
  const pedacos: Pedaco[] = [];
  let inicio = linha[0]!.clone();
  for (let i = 1; i < linha.length; i++) {
    const p = linha[i]!;
    const proximo = linha[i + 1];
    const normal = normais[i - 1] ?? null;
    if (!proximo) {
      if (inicio.distanceToSquared(p) > 1e-10) pedacos.push({ curva: new THREE.LineCurve3(inicio, p.clone()), normal });
      break;
    }
    const antes = p.clone().sub(linha[i - 1]!);
    const depois = proximo.clone().sub(p);
    const raio = Math.min(RAIO_DA_DOBRA, antes.length() / 2, depois.length() / 2);
    const entra = p.clone().addScaledVector(antes.normalize(), -raio);
    const sai = p.clone().addScaledVector(depois.normalize(), raio);
    if (inicio.distanceToSquared(entra) > 1e-10) pedacos.push({ curva: new THREE.LineCurve3(inicio, entra), normal });
    if (raio > 1e-5) pedacos.push({ curva: new THREE.QuadraticBezierCurve3(entra, p.clone(), sai), normal: null });
    inicio = sai;
  }
  return pedacos;
}

interface Percurso {
  trechos: Trecho[];
  grampos: GrampoNoCabo[];
  /** Por grampo, o ângulo do cabo no plano da peça (em torno da normal). */
  angulos: number[];
  raio: number;
  tipoA: TipoTerminal;
  tipoB: TipoTerminal;
}

const CIMA = new THREE.Vector3(0, 1, 0);
/** Folga entre o cabo e a superfície, no grampo. */
const FOLGA_DO_GRAMPO = 0.0005;

/** Menor distância de um ponto a um segmento. */
function distanciaAoSegmento(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = ab.lengthSq() < 1e-12 ? 0 : THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

/**
 * Entre quais pontos do caminho o cabo entra no quadro: a posição que menos o alonga.
 * Devolve `i`: a passagem fica entre `pontos[i]` e `pontos[i + 1]`.
 */
export function corteDoQuadro(pontos: readonly THREE.Vector3[], entrada: THREE.Vector3, saida: THREE.Vector3): number {
  let melhor = 0;
  let menor = Infinity;
  for (let i = 0; i + 1 < pontos.length; i++) {
    const custo = pontos[i]!.distanceTo(entrada) + saida.distanceTo(pontos[i + 1]!) - pontos[i]!.distanceTo(pontos[i + 1]!);
    if (custo < menor - 1e-9) {
      menor = custo;
      melhor = i;
    }
  }
  return melhor;
}

export function criarCamadaDeCabos(casa: THREE.Group, pecas: CamadaDeDispositivos): CamadaDeCabos {
  const desenhos = new Map<string, Desenho>();
  /** Por cabo, onde estavam as pontas e a passagem pelo quadro na última vez. */
  const percursos = new Map<string, string>();
  let projetoVisto: Projeto | null = null;
  let adiado = false;
  const invisivel = new THREE.MeshBasicMaterial({ visible: false });
  /** Bolinha que fecha a dobra do cabo em cada grampo. É a mesma para todos os cabos. */
  const geoJunta = new THREE.SphereGeometry(1, 10, 8);

  /** Grampos do cabo que estão na cena, na ordem da lista dele, com o ponto por onde o cabo passa. */
  function gramposDe(c: Cabo, raio: number): GrampoNoCabo[] {
    const lista: GrampoNoCabo[] = [];
    for (const uid of c.grampos ?? []) {
      const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
      const item = d ? CATALOGO.get(d.itemId) : undefined;
      if (!d || d.superficie === null || item?.categoria !== 'acessorio' || !ehGrampo(item) || !item.dimensoes) continue;
      const q = new THREE.Quaternion(...d.quat);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      lista.push({
        uid,
        pos: new THREE.Vector3(...d.pos).addScaledVector(normal, -item.dimensoes[2] / 2 + raio + FOLGA_DO_GRAMPO),
        normal,
        ex: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
        ey: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
      });
    }
    return lista;
  }

  /** Raio do desenho do cabo, pelo tipo dele. */
  function raioDe(c: Cabo): number {
    const tipo = CATALOGO.get(c.caboId);
    return RAIO[tipo?.categoria === 'cabo' ? tipo.uso : 'ca']!;
  }

  /**
   * Caminho do cabo: do terminal ao primeiro grampo, de grampo em grampo e do último grampo ao outro terminal.
   * O cabo que passa por um quadro entra e sai dele no ponto do caminho que menos o alonga. Nulo se falta uma ponta na cena.
   */
  function percursoDe(c: Cabo): Percurso | null {
    const a = pecas.terminal(c.de.disp, c.de.terminal, c.uid);
    const b = pecas.terminal(c.para.disp, c.para.terminal, c.uid);
    if (!a || !b) return null;
    const raio = raioDe(c);
    const grampos = gramposDe(c, raio);
    type No = { pos: THREE.Vector3; saida: THREE.Vector3 | null; grampo: GrampoNoCabo | null; entraNoQuadro?: boolean };
    const nos: No[] = [{ pos: a.pos, saida: a.saida, grampo: null }, ...grampos.map((g) => ({ pos: g.pos, saida: null, grampo: g })), { pos: b.pos, saida: b.saida, grampo: null }];
    const passagem = c.quadro ? pecas.passagem(c.quadro, c.uid) : null;
    if (passagem) {
      const i = corteDoQuadro(nos.map((n) => n.pos), passagem.entrada, passagem.saida);
      nos.splice(i + 1, 0, { pos: passagem.entrada, saida: passagem.direcao, grampo: null, entraNoQuadro: true }, { pos: passagem.saida, saida: passagem.direcao, grampo: null });
    }
    const trechos: Trecho[] = [];
    for (let i = 0; i + 1 < nos.length; i++) {
      const p = nos[i]!;
      const q = nos[i + 1]!;
      // Dentro do quadro o cabo é o fio que sobe até as proteções: não há trecho entre a entrada e a saída.
      if (p.entraNoQuadro) continue;
      const planos = [p, q].filter((n) => n.grampo).map((n) => ({ ponto: n.pos, normal: n.grampo!.normal }));
      const gp = p.grampo;
      const gq = q.grampo;
      const mesmoPlano = gp !== null && gq !== null && gp.normal.dot(gq.normal) > 0.999 && Math.abs(q.pos.clone().sub(p.pos).dot(gp.normal)) < 0.005;
      // No grampo o cabo solto chega rente à superfície, vindo do lado da outra ponta; entre grampos de superfícies
      // diferentes, sai de cada um pela normal.
      const saidaDo = (n: No, outro: No): THREE.Vector3 => {
        if (n.saida) return n.saida;
        const normal = n.grampo!.normal;
        if (outro.grampo) return normal;
        const rumo = outro.pos.clone().sub(n.pos);
        rumo.addScaledVector(normal, -rumo.dot(normal));
        return rumo.lengthSq() < 1e-8 ? normal : rumo.normalize();
      };
      const entre = gp !== null && gq !== null ? (mesmoPlano ? { linha: [p.pos, q.pos], normais: [gp.normal] } : linhaEntreGrampos(gp, gq)) : null;
      trechos.push({
        a: { pos: p.pos, saida: saidaDo(p, q) },
        b: { pos: q.pos, saida: saidaDo(q, p) },
        reto: mesmoPlano,
        esticado: gp !== null && gq !== null && !mesmoPlano,
        planos,
        linha: entre?.linha ?? null,
        normais: entre?.normais ?? [],
      });
    }
    // O arco de cada grampo fica atravessado sobre o cabo: o cabo passa por ele na direção média de quem chega e de quem sai.
    const angulos = nos.flatMap((n, i) => {
      if (!n.grampo) return [];
      const chega = n.pos.clone().sub(nos[i - 1]!.pos).normalize();
      const sai = nos[i + 1]!.pos.clone().sub(n.pos).normalize();
      const rumo = chega.clone().add(sai);
      if (rumo.lengthSq() < 1e-6) rumo.copy(sai);
      return [Math.atan2(rumo.dot(n.grampo.ey), rumo.dot(n.grampo.ex))];
    });
    return { trechos, grampos, angulos, raio, tipoA: a.tipo, tipoB: b.tipo };
  }

  /**
   * Comprimento do cabo pelo caminho dele. Sem grampo, como sempre foi: a soma dos trechos (um, ou dois com quadro),
   * cada um com o mínimo e o arredondamento. Com grampo: a soma de `(|dx| + |dy| + |dz|) × 1,1` de todos os trechos,
   * com o mínimo e o arredondamento aplicados à soma (grampos próximos não contam 0,3 m cada um).
   */
  function comprimentoDe(p: Percurso): number {
    if (p.grampos.length === 0) return Math.round(p.trechos.reduce((soma, t) => soma + comprimentoDoTrecho(t.a.pos, t.b.pos), 0) * 10) / 10;
    return comprimentoFinal(p.trechos.reduce((soma, t) => soma + brutoDoTrecho(t.a.pos, t.b.pos), 0));
  }

  function pedacosDe(t: Trecho): Pedaco[] {
    if (t.linha) return pedacosDaLinha(t.linha, t.normais);
    return [{ curva: t.planos.length > 0 ? curvaDoTrecho(t.a, t.b, { planos: t.planos, folga: 0 }) : curvaDoTrecho(t.a, t.b), normal: null }];
  }

  function remover(uid: string): void {
    const d = desenhos.get(uid);
    if (!d) return;
    casa.remove(d.grupo);
    d.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.proprio) o.geometry.dispose();
    });
    desenhos.delete(uid);
  }

  /**
   * Põe a peça em um ponto da curva, com o eixo Y dela ao longo do cabo e a frente o mais para cima possível;
   * no cabo que corre rente a uma superfície, a frente fica para fora dela.
   */
  function porNoCabo(peca: THREE.Object3D, { curva, normal }: Pedaco, u: number, escala: number, recuo: number): void {
    const y = curva.getTangentAt(u).normalize();
    const frente = normal ?? CIMA;
    const z = frente.clone().addScaledVector(y, -frente.dot(y));
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    peca.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    peca.position.copy(curva.getPointAt(u)).addScaledVector(z, recuo);
    peca.scale.setScalar(escala);
  }

  /** Pedaço e posição nele (0 a 1) a uma distância do começo do caminho; negativa conta do fim. */
  function noCaminho(pedacos: readonly Pedaco[], distancia: number): [Pedaco, number] {
    const comprimentos = pedacos.map((p) => p.curva.getLength());
    const total = comprimentos.reduce((s, l) => s + l, 0);
    let resto = Math.min(total, Math.max(0, distancia < 0 ? total + distancia : distancia));
    for (let i = 0; i < pedacos.length; i++) {
      const l = comprimentos[i]!;
      if (resto <= l || i === pedacos.length - 1) return [pedacos[i]!, l > 1e-9 ? Math.min(1, resto / l) : 0];
      resto -= l;
    }
    return [pedacos[0]!, 0];
  }

  function desenhar(c: Cabo, percurso: Percurso, cor: string, soltas: { indice: number; item: Protecao }[]): Omit<Desenho, 'assinatura' | 'escondido'> {
    const raio = percurso.raio;
    const grupo = new THREE.Group();
    grupo.name = `cabo-${c.uid}`;
    grupo.userData.cabo = c.uid;
    const queimado = c.queimado !== undefined;
    const material = queimado
      ? liso('cabo-queimado', () => new THREE.MeshStandardMaterial({ color: COR_DO_CABO_QUEIMADO, roughness: 0.96, metalness: 0 }))
      : liso(`cabo-${cor}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.62, metalness: 0 }));
    const protecoes = new Map<number, { item: Protecao; peca: THREE.Object3D }>();
    // Trecho sem tamanho (grampo em cima do terminal) não tem o que desenhar.
    const pedacos = percurso.trechos.filter((t) => t.a.pos.distanceToSquared(t.b.pos) > 1e-8).flatMap((t) => pedacosDe(t));
    const curvas = pedacos.map((p) => p.curva);
    for (const curva of curvas) {
      // O trecho reto, entre dois grampos, é um cilindro só; a dobra em volta de uma quina, um arco curto.
      const reto = curva instanceof THREE.LineCurve3;
      const arco = curva instanceof THREE.QuadraticBezierCurve3;
      const tubo = new THREE.Mesh(
        reto ? new THREE.TubeGeometry(curva, 1, raio, 6, false)
        : arco ? new THREE.TubeGeometry(curva, 6, raio, 6, false)
        : new THREE.TubeGeometry(new PercursoDoTubo(curva as THREE.CatmullRomCurve3), DIVISOES_DO_TUBO, raio, 6, false),
        material,
      );
      // O arco da quina faz parte do trecho reto vizinho: não conta como trecho.
      tubo.name = arco ? 'tubo-da-dobra' : 'tubo';
      tubo.castShadow = true;
      tubo.receiveShadow = true;
      tubo.userData.cabo = c.uid;
      tubo.userData.proprio = true;
      grupo.add(tubo);
      const clique = new THREE.Mesh(new THREE.TubeGeometry(curva, reto ? 1 : arco ? 3 : DIVISOES_DO_CLIQUE, RAIO_DE_CLIQUE_DO_CABO, 5, false), invisivel);
      clique.name = 'tubo-de-clique';
      clique.userData.cabo = c.uid;
      clique.userData.proprio = true;
      grupo.add(clique);
    }
    // Em cada grampo, uma bolinha do raio do cabo fecha a dobra entre os dois trechos.
    for (const g of percurso.grampos) {
      const junta = new THREE.Mesh(geoJunta, material);
      junta.name = 'junta';
      junta.position.copy(g.pos);
      junta.scale.setScalar(raio);
      junta.castShadow = true;
      junta.userData.cabo = c.uid;
      grupo.add(junta);
    }
    if (queimado) {
      // A capa derreteu: bolhas de plástico queimado ao longo do cabo e, entre elas, o cobre à mostra.
      const cobre = liso('cabo-cobre-exposto', () => new THREE.MeshStandardMaterial({ color: COR_DO_COBRE_EXPOSTO, roughness: 0.5, metalness: 0.6 }));
      const comprimento = curvas.reduce((s, x) => s + x.getLength(), 0);
      const n = Math.min(14, Math.max(3, Math.round(comprimento / 0.22)));
      for (let i = 0; i < n; i++) {
        const [pedaco, u] = noCaminho(pedacos, ((i + 0.5) / n) * comprimento);
        const bolha = new THREE.Mesh(geoJunta, i % 3 === 1 ? cobre : material);
        bolha.name = 'bolha';
        bolha.position.copy(pedaco.curva.getPointAt(u));
        // Tamanhos desiguais, sem sorteio: o desenho é o mesmo a cada vez.
        const s = raio * (i % 3 === 1 ? 1.06 : 1.35 + 0.35 * ((i * 7) % 5) / 4);
        bolha.scale.set(s * (i % 3 === 1 ? 1.6 : 1), s, s);
        bolha.castShadow = true;
        bolha.userData.cabo = c.uid;
        grupo.add(bolha);
      }
    }
    // Proteções fora de quadro, desenhadas no próprio cabo.
    const itemDe = (uid: string) => CATALOGO.get(estado.projeto.dispositivos.find((d) => d.uid === uid)?.itemId ?? '');
    const bateriaNoInicio = itemDe(c.de.disp)?.categoria === 'bateria';
    const bateriaNoFim = itemDe(c.para.disp)?.categoria === 'bateria';
    let vaga = 0;
    const presos = percurso.grampos.length > 0;
    const total = presos ? curvas.reduce((s, x) => s + x.getLength(), 0) : 0;
    for (const { indice, item } of soltas) {
      const modelo = modeloDaProtecao(item);
      const peca = modelo.grupo.clone();
      // O porta-fusível cresce até a base dele envolver o cabo, que passa pelo meio dela.
      const fusivel = item.tipo === 'fusivel';
      const escala = fusivel ? Math.max(1, (2 * raio + 0.006) / 0.03) : escalaNoCabo(modelo.largura, raio);
      const recuo = fusivel ? 0.009 * escala : 0;
      peca.name = `protecao-${c.uid}-${indice}`;
      peca.traverse((o) => {
        o.userData.cabo = c.uid;
        o.userData.protecao = indice;
      });
      if (item.tipo === 'fusivel' && (bateriaNoInicio || bateriaNoFim)) {
        // Porta-fusível a 0,2 m do terminal da bateria.
        if (presos) {
          // No cabo preso por grampos a distância conta pelo caminho inteiro, de trecho em trecho.
          const d = Math.min(DISTANCIA_DO_FUSIVEL, total / 2);
          const [pedaco, u] = noCaminho(pedacos, bateriaNoInicio ? d : -d);
          porNoCabo(peca, pedaco, u, escala, recuo);
        } else {
          const pedaco = bateriaNoInicio ? pedacos[0]! : pedacos[pedacos.length - 1]!;
          const u = Math.min(0.5, DISTANCIA_DO_FUSIVEL / pedaco.curva.getLength());
          porNoCabo(peca, pedaco, bateriaNoInicio ? u : 1 - u, escala, recuo);
        }
      } else {
        const fracao = Math.min(0.9, 0.25 + vaga * 0.14);
        if (presos) {
          const [pedaco, u] = noCaminho(pedacos, fracao * total);
          porNoCabo(peca, pedaco, u, escala, recuo);
        } else porNoCabo(peca, pedacos[0]!, fracao, escala, recuo);
        vaga++;
      }
      grupo.add(peca);
      protecoes.set(indice, { item, peca });
    }
    return { grupo, curvas, protecoes };
  }

  function atualizar(): void {
    const comprimentos = new Map<string, number>();
    const vivos = new Set<string>();
    // Projeto trocado (aberto, novo, desfazer): os comprimentos que ele traz valem até alguma peça se mover.
    if (estado.projeto !== projetoVisto) {
      projetoVisto = estado.projeto;
      percursos.clear();
    }
    for (const c of estado.projeto.cabos) {
      const caminho = percursoDe(c);
      if (!caminho) continue;
      vivos.add(c.uid);
      const trechos = caminho.trechos;
      // Com quadro ou com grampo, o comprimento é a soma dos trechos, pela fórmula.
      const numero = (v: THREE.Vector3): string => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      const percurso = trechos.map((t) => `${numero(t.a.pos)};${numero(t.b.pos)}`).join('/');
      const anterior = percursos.get(c.uid);
      // Durante um arraste fica guardado o percurso de antes dele: o comprimento sai ao soltar.
      if (!adiado || anterior === undefined) percursos.set(c.uid, percurso);
      if (!adiado && anterior !== undefined && anterior !== percurso) comprimentos.set(c.uid, comprimentoDe(caminho));
      // O desenho de cada grampo acompanha o cabo: atravessado sobre ele e do tamanho dele.
      caminho.grampos.forEach((g, i) => pecas.ajustarGrampo(g.uid, caminho.angulos[i]!, Math.max(1, caminho.raio / GRAMPO.raioDoCabo)));

      const raio = caminho.raio;
      const cor = corDoCabo(caminho.tipoA, caminho.tipoB);
      const soltas: { indice: number; item: Protecao }[] = [];
      c.protecoes.forEach((id, indice) => {
        const item = CATALOGO.get(id);
        if (item?.categoria === 'protecao' && !pecas.noTrilho(c.uid, indice)) soltas.push({ indice, item });
      });
      const assinatura = [
        raio, cor,
        trechos.map((t) => `${t.reto ? 'r' : t.esticado ? 'e' : 's'}${numero(t.a.pos)};${numero(t.a.saida)};${numero(t.b.pos)};${numero(t.b.saida)};${(t.linha ?? []).length}`).join('/'),
        soltas.map((s) => `${s.indice}:${s.item.id}`).join(','),
        c.queimado ? 'queimado' : '',
      ].join('|');
      let d = desenhos.get(c.uid);
      if (!d || d.assinatura !== assinatura) {
        remover(c.uid);
        d = { ...desenhar(c, caminho, cor, soltas), assinatura, escondido: false };
        desenhos.set(c.uid, d);
        casa.add(d.grupo);
      }
      // A chave de cada proteção (operar.md, seção 2): alavanca, fusível colocado, tirado ou queimado. Não refaz o cabo.
      for (const [indice, { item, peca }] of d.protecoes) aplicarEstadoDaProtecao(peca, item, estadoDaProtecao(c, indice));
      // O cabo some quando as duas pontas estão em peças escondidas pelo modo de visão.
      const escondido = pecas.escondida(c.de.disp) && pecas.escondida(c.para.disp);
      if (escondido !== d.escondido) {
        d.escondido = escondido;
        esconder(d.grupo, escondido);
      }
    }
    for (const uid of [...desenhos.keys()]) if (!vivos.has(uid)) remover(uid);
    for (const uid of [...percursos.keys()]) if (!vivos.has(uid)) percursos.delete(uid);
    if (comprimentos.size > 0) acoes.definirComprimentos(comprimentos);
  }

  function comprimentoEntre(de: PontaCabo, para: PontaCabo): number | null {
    const a = pecas.terminal(de.disp, de.terminal);
    const b = pecas.terminal(para.disp, para.terminal);
    return a && b ? comprimentoDoTrecho(a.pos, b.pos) : null;
  }

  function medir(uids?: readonly string[]): void {
    const comprimentos = new Map<string, number>();
    for (const c of estado.projeto.cabos) {
      if (uids && !uids.includes(c.uid)) continue;
      const caminho = percursoDe(c);
      if (caminho) comprimentos.set(c.uid, comprimentoDe(caminho));
    }
    if (comprimentos.size > 0) acoes.definirComprimentos(comprimentos);
  }

  return {
    atualizar,
    comprimentoEntre,
    adiarComprimentos(adiar) {
      if (adiado === adiar) return;
      adiado = adiar;
      if (!adiar) atualizar();
    },
    medir,
    grupoDe: (uid) => desenhos.get(uid)?.grupo,
    malhas() {
      const lista: THREE.Object3D[] = [];
      for (const d of desenhos.values()) {
        if (d.escondido) continue;
        for (const o of d.grupo.children) if (o.name === 'tubo-de-clique') lista.push(o);
      }
      return lista;
    },
    ponto(uid, fracao = 0.5) {
      const curva = desenhos.get(uid)?.curvas[0];
      return curva ? curva.getPointAt(fracao) : null;
    },
    maisProximo(ponto) {
      let melhor: string | null = null;
      let menor = Infinity;
      // Os cabos à vista valem antes dos que o modo de visão escondeu.
      for (const escondidos of [false, true]) {
        for (const [uid, d] of desenhos) {
          if (d.escondido !== escondidos) continue;
          for (const curva of d.curvas) {
            const pontos = curva instanceof THREE.LineCurve3 ? [curva.v1, curva.v2] : curva.getPoints(24);
            for (let i = 0; i + 1 < pontos.length; i++) {
              const distancia = distanciaAoSegmento(ponto, pontos[i]!, pontos[i + 1]!);
              if (distancia < menor) {
                menor = distancia;
                melhor = uid;
              }
            }
          }
        }
        if (melhor) break;
      }
      return melhor;
    },
    indiceDoGrampo(uid, ponto) {
      const c = estado.projeto.cabos.find((x) => x.uid === uid);
      const a = c ? pecas.terminal(c.de.disp, c.de.terminal, c.uid) : null;
      const b = c ? pecas.terminal(c.para.disp, c.para.terminal, c.uid) : null;
      if (!c || !a || !b) return 0;
      const grampos = gramposDe(c, raioDe(c)).map((g) => g.pos);
      const passagem = c.quadro ? pecas.passagem(c.quadro, c.uid) : null;
      /** Comprimento do caminho pelos pontos dados, em linha reta de um a outro, com a ida ao quadro. */
      const caminho = (pontos: THREE.Vector3[]): number => {
        const corte = passagem ? corteDoQuadro(pontos, passagem.entrada, passagem.saida) : -1;
        let soma = 0;
        for (let i = 0; i + 1 < pontos.length; i++) {
          soma += i === corte ? pontos[i]!.distanceTo(passagem!.entrada) + passagem!.saida.distanceTo(pontos[i + 1]!) : pontos[i]!.distanceTo(pontos[i + 1]!);
        }
        return soma;
      };
      let melhor = 0;
      let menor = Infinity;
      for (let i = 0; i <= grampos.length; i++) {
        const comprimento = caminho([a.pos, ...grampos.slice(0, i), ponto, ...grampos.slice(i), b.pos]);
        if (comprimento < menor - 1e-9) {
          menor = comprimento;
          melhor = i;
        }
      }
      return melhor;
    },
    protecao: (uid, indice) => desenhos.get(uid)?.protecoes.get(indice)?.peca ?? null,
    escondido: (uid) => desenhos.get(uid)?.escondido ?? true,
    pontoNoCaminho(uid, fracao) {
      const curvas = desenhos.get(uid)?.curvas;
      if (!curvas || curvas.length === 0) return null;
      const comprimentos = curvas.map((x) => x.getLength());
      let resto = THREE.MathUtils.clamp(fracao, 0, 1) * comprimentos.reduce((s, l) => s + l, 0);
      for (let i = 0; i < curvas.length; i++) {
        const l = comprimentos[i]!;
        if (resto <= l || i === curvas.length - 1) return curvas[i]!.getPointAt(l > 1e-9 ? Math.min(1, resto / l) : 0);
        resto -= l;
      }
      return null;
    },
    destruir() {
      for (const uid of [...desenhos.keys()]) remover(uid);
      invisivel.dispose();
      geoJunta.dispose();
    },
  };
}
