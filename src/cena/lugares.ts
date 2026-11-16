// Onde uma peça cabe: medidas de cada superfície de encaixe, grade das placas, borda, parede e peça vizinha.
// Especificação: docs/especificacao/fase-2.md, seção 3, e cena-e-interface.md, seções 5 e 6.
//
// Tudo em coordenadas da casa. Quem usa é o arraste com o ponteiro (interacao.ts), o reassentamento das peças
// quando a casa muda (reassentar.ts) e as ações do consultor que acrescentam peças (consultor.ts).

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Item } from '../catalogo/tipos';
import { type Encaixe, estado } from '../estado';
import type { Dispositivo } from '../nucleo/tipos';
import { ehGrampo, encaixar, superficieAceita } from './encaixe';
import { ancoraDaFileira, cabeSeArrumar, centimetrosQueFaltam, FOLGA_ENTRE_PLACAS, passaDaBorda } from './gradeDasPlacas';
import type { Marca, TipoSuperficie } from './malha';
import { modeloDe } from './modelos';
import { type Pegada, terrenoLivre } from './regrasDosObstaculos';
import { aceitaNoTerreno, encaixarNoTerreno, ID_TERRENO, inclinacaoPadrao, pegadaDaPlacaNoChao } from './terreno';

export { FOLGA_ENTRE_PLACAS };
/** Altura, acima do piso do andar, em que ficam a lâmpada e o chuveiro. */
const ALTURA_DE_LAMPADA = 2.1;
/** Topo da laje do térreo e do piso do quartinho. */
const PISO = 0.05;

/** Uma superfície de encaixe vista como um retângulo: eixos, limites e o plano em que a peça encosta. */
export interface Quadro {
  marca: Marca;
  malhas: THREE.Mesh[];
  /** Normal, eixo ao longo da largura e eixo de subida (no piso, os eixos X e Z da malha). */
  n: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Posição do plano de contato ao longo da normal. */
  w: number;
  /** Em parede: de que lado do eixo fino da malha fica esta face. Nas demais, 1. */
  lado: 1 | -1;
}

export interface Toque {
  marca: Marca;
  ponto: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface Candidato {
  encaixe: Encaixe;
  valido: boolean;
  /** Por que não pode ficar aqui, em palavras para a tela. Nulo quando pode. */
  motivo: string | null;
}

export interface OpcoesDeAssento {
  /** Peças que não contam como obstáculo (a que está sendo movida). `'todas'` desliga a conferência com as vizinhas. */
  ignorar?: ReadonlySet<string> | 'todas';
  /** Lista de peças a considerar. O padrão é a do projeto. */
  pecas?: readonly Dispositivo[];
  /** Prende a placa à grade das vizinhas de mesma medida (ou, sem vizinha, à grade em que cabem mais placas na água). */
  prender?: boolean;
  /** Placa no terreno: inclinação do suporte, em graus. O padrão é a latitude do local. Nela, `giro` é o ângulo em torno da vertical. */
  inclinacao?: number;
}

export interface OpcoesDaBusca extends OpcoesDeAssento {
  /** O próprio ponto de partida não vale (é onde está a peça de referência). */
  pularOrigem?: boolean;
  /** Passo da busca ao longo de u e de v. */
  passo?: [number, number];
  /** Prefere andar ao longo de u (peças em fila, lado a lado) antes de abrir outra fila. */
  emFila?: boolean;
}

export interface Lugares {
  /** Esquece as medidas guardadas. A cena chama depois de refazer a casa. */
  invalidar(): void;
  /** Medidas da superfície. Em parede, `lado` diz a face: a normal dela ou o sinal guardado de um `Quadro` anterior. */
  quadro(id: string, lado?: THREE.Vector3 | 1 | -1): Quadro | null;
  /** Quadro da superfície em que a peça está, do lado em que ela está. */
  quadroDaPeca(d: Dispositivo): Quadro | null;
  /** Coordenadas (u, v) de um ponto no quadro. */
  noQuadro(q: Quadro, ponto: THREE.Vector3): [u: number, v: number];
  /** Primeira superfície que o raio do ponteiro toca de frente, entre as malhas dadas. */
  toque(raio: THREE.Raycaster, malhas: THREE.Object3D[]): (Toque & { distancia: number }) | null;
  /**
   * Para a peça de piso apontada para uma parede: o piso ao pé dela, do lado tocado. Assim, levar a geladeira
   * até a parede a encosta nela. Nulo se não há piso à vista ali.
   */
  pisoAoPe(toque: Toque, malhas: THREE.Object3D[]): Toque | null;
  /**
   * Para a lâmpada e o chuveiro apontados para um piso: a parede mais próxima em volta desse ponto do piso, na altura
   * em que eles ficam. Assim, soltar a lâmpada dentro do quartinho a prende na parede mais perto. Com `olhar` (direção
   * do raio do ponteiro, no mundo), a parede que está de frente para quem olha vale antes da que é vista por trás.
   * Nulo se não há parede à vista ali.
   */
  paredeAoLado(toque: Toque, malhas: THREE.Object3D[], olhar?: THREE.Vector3): Toque | null;
  /** Encaixe da peça sob o ponteiro, com tudo o que a especificação pede: tipo de superfície, grade, borda, vizinhas. */
  candidato(item: Item, giro: number, toque: Toque, opcoes?: OpcoesDeAssento): Candidato;
  /** Encaixe da peça no ponto (u, v) do quadro, cortado para caber. */
  assentar(item: Item, giro: number, q: Quadro, u: number, v: number, opcoes?: OpcoesDeAssento): Candidato;
  /**
   * Lugar válido mais próximo de (u, v), andando em passos. Nas placas o passo é a medida da placa mais a folga.
   * Com `pularOrigem`, o próprio (u, v) não vale (é onde está a peça de referência).
   */
  lugarLivre(item: Item, giro: number, q: Quadro, u: number, v: number, opcoes?: OpcoesDaBusca): Encaixe | null;
  /**
   * Lugar para uma placa na água de telhado mais próxima de `centro` que tenha espaço, fora a de id `fora`.
   * Tenta a placa com o giro dado e, se não couber, deitada.
   */
  lugarEmOutraAgua(item: Item, giro: number, centro: THREE.Vector3, fora: string | null, opcoes?: OpcoesDeAssento): Encaixe | null;
  /** Medida da peça ao longo de u e de v, com o giro dado. */
  medida(item: Item, giro: number, q: Quadro, opcoes?: OpcoesDeAssento): [u: number, v: number];
  /** Peça no terreno que ficou em cima da casa, de uma varanda, do quartinho ou de um obstáculo. */
  terrenoOcupado(item: Item, encaixe: Encaixe): boolean;
  /** `uid` de uma peça da mesma superfície que a caixa desta cruzaria. Nulo se não cruza. */
  vizinhaCruzada(item: Item, encaixe: Encaixe, opcoes?: OpcoesDeAssento): string | null;
  /** Ids das superfícies de um tipo, com as que o modo de visão esconde. */
  idsDoTipo(tipo: TipoSuperficie): string[];
}

const CIMA = new THREE.Vector3(0, 1, 0);

/** Tira da posição o ruído de conta (0,7000000007): fica em décimos de milímetro. */
function limpo(e: Encaixe): Encaixe {
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  return { ...e, pos: [r(e.pos[0]), r(e.pos[1]), r(e.pos[2])] };
}

/** Caixa de uma peça, em coordenadas dela: a placa pela medida exata (a folga de 2 cm conta daí); as demais, com os móveis. */
function caixaDe(item: Item): THREE.Box3 | null {
  const modelo = modeloDe(item);
  if (!modelo) return null;
  if (item.categoria === 'placa') {
    const [l, a, p] = modelo.dimensoes;
    return new THREE.Box3(new THREE.Vector3(-l / 2, -a / 2, -p / 2), new THREE.Vector3(l / 2, a / 2, p / 2));
  }
  return modelo.volume;
}

const CANTOS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

function cantos(caixa: THREE.Box3): THREE.Vector3[] {
  return CANTOS.map(([i, j, k]) => new THREE.Vector3(i ? caixa.max.x : caixa.min.x, j ? caixa.max.y : caixa.min.y, k ? caixa.max.z : caixa.min.z));
}

function normalDaPeca(d: { quat: readonly number[] }, tipo: TipoSuperficie): THREE.Vector3 {
  if (tipo === 'piso') return CIMA.clone();
  return new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(d.quat[0], d.quat[1], d.quat[2], d.quat[3]));
}

const NOME_DO_TIPO: Record<TipoSuperficie, string> = { telhado: 'no telhado', parede: 'em parede', piso: 'no piso' };

export function criarLugares(casa: THREE.Group, todas: () => THREE.Mesh[]): Lugares {
  const quadros = new Map<string, Quadro | null>();
  let porId: Map<string, THREE.Mesh[]> | null = null;
  const raio = new THREE.Raycaster();
  // As superfícies que o modo de visão esconde ficam na camada só de sombra: aqui elas contam.
  raio.layers.enableAll();
  const relativa = new THREE.Matrix4();
  const inversaDaCasa = new THREE.Matrix4();

  function malhasDe(id: string): THREE.Mesh[] {
    if (!porId) {
      porId = new Map();
      for (const m of todas()) {
        const marca = m.userData.superficie as Marca;
        const lista = porId.get(marca.id);
        if (lista) lista.push(m);
        else porId.set(marca.id, [m]);
      }
    }
    return porId.get(id) ?? [];
  }

  /** Matriz que leva da malha para as coordenadas da casa. */
  function daMalha(m: THREE.Mesh): THREE.Matrix4 {
    casa.updateWorldMatrix(true, false);
    m.updateWorldMatrix(true, false);
    inversaDaCasa.copy(casa.matrixWorld).invert();
    return relativa.multiplyMatrices(inversaDaCasa, m.matrixWorld);
  }

  /** Eixo fino de uma parede (o da espessura), em coordenadas da casa. */
  function eixoFino(m: THREE.Mesh): THREE.Vector3 {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const t = m.geometry.boundingBox!.getSize(new THREE.Vector3());
    const local = t.x < t.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    return local.transformDirection(daMalha(m));
  }

  function quadro(id: string, lado: THREE.Vector3 | 1 | -1 = 1): Quadro | null {
    const malhas = malhasDe(id);
    const primeira = malhas[0];
    if (!primeira) return null;
    const marca = primeira.userData.superficie as Marca;
    const n = new THREE.Vector3();
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    let sinal: 1 | -1 = 1;
    if (marca.tipo === 'parede') {
      const eixo = eixoFino(primeira);
      sinal = typeof lado === 'number' ? lado : lado.dot(eixo) >= 0 ? 1 : -1;
    }
    const chave = `${id}|${sinal}`;
    const guardado = quadros.get(chave);
    if (guardado !== undefined) return guardado;

    if (marca.tipo === 'piso') {
      const m = daMalha(primeira);
      n.copy(CIMA);
      u.set(1, 0, 0).transformDirection(m);
      v.set(0, 0, 1).transformDirection(m);
    } else if (marca.tipo === 'parede') {
      n.copy(eixoFino(primeira)).multiplyScalar(sinal);
      n.y = 0;
      n.normalize();
      v.copy(CIMA);
      u.crossVectors(v, n);
    } else {
      // Telhado: a normal do primeiro triângulo da malha plana, virada para cima.
      const pos = primeira.geometry.getAttribute('position');
      const indice = primeira.geometry.getIndex();
      const m = daMalha(primeira);
      const p = [0, 1, 2].map((i) => new THREE.Vector3().fromBufferAttribute(pos, indice ? indice.getX(i) : i).applyMatrix4(m));
      n.crossVectors(p[1]!.clone().sub(p[0]!), p[2]!.clone().sub(p[0]!)).normalize();
      if (n.y < 0) n.negate();
      v.copy(CIMA).addScaledVector(n, -CIMA.dot(n));
      if (v.lengthSq() < 1e-8) v.set(0, 0, -1).addScaledVector(n, n.z);
      v.normalize();
      u.crossVectors(v, n);
    }

    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    let w = -Infinity;
    const p = new THREE.Vector3();
    for (const malha of malhas) {
      const m = daMalha(malha);
      const pos = malha.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        const pu = p.dot(u);
        const pv = p.dot(v);
        if (pu < u0) u0 = pu;
        if (pu > u1) u1 = pu;
        if (pv < v0) v0 = pv;
        if (pv > v1) v1 = pv;
        const pn = p.dot(n);
        if (pn > w) w = pn;
      }
    }
    const q: Quadro = { marca, malhas, n, u, v, u0, u1, v0, v1, w, lado: sinal };
    quadros.set(chave, q);
    return q;
  }

  function quadroDaPeca(d: Dispositivo): Quadro | null {
    if (d.superficie === null) return null;
    const marca = malhasDe(d.superficie)[0]?.userData.superficie as Marca | undefined;
    return marca ? quadro(d.superficie, normalDaPeca(d, marca.tipo)) : null;
  }

  const noQuadro = (q: Quadro, ponto: THREE.Vector3): [number, number] => [ponto.dot(q.u), ponto.dot(q.v)];

  /** Ponto do plano de contato do quadro. */
  function noPlano(q: Quadro, pu: number, pv: number): THREE.Vector3 {
    return new THREE.Vector3().addScaledVector(q.u, pu).addScaledVector(q.v, pv).addScaledVector(q.n, q.w);
  }

  /** Limites da caixa da peça ao longo de u e de v, a partir do centro dela. */
  function pegada(item: Item, quat: THREE.Quaternion, q: Quadro): [u0: number, u1: number, v0: number, v1: number] {
    const caixa = caixaDe(item);
    if (!caixa) return [0, 0, 0, 0];
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const c of cantos(caixa)) {
      c.applyQuaternion(quat);
      const pu = c.dot(q.u);
      const pv = c.dot(q.v);
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      v0 = Math.min(v0, pv);
      v1 = Math.max(v1, pv);
    }
    return [u0, u1, v0, v1];
  }

  const quatDe = (e: { quat: readonly number[] }): THREE.Quaternion => new THREE.Quaternion(e.quat[0], e.quat[1], e.quat[2], e.quat[3]);
  const posDe = (e: { pos: readonly number[] }): THREE.Vector3 => new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);

  /** A pegada inteira da peça está sobre a superfície: não passa da borda nem cai em vão de janela, porta ou escada. */
  function cabe(item: Item, encaixe: Encaixe, q: Quadro): boolean {
    const [a0, a1, b0, b1] = pegada(item, quatDe(encaixe), q);
    const centro = posDe(encaixe);
    const cu = centro.dot(q.u);
    const cv = centro.dot(q.v);
    const margem = 0.008;
    const nu = Math.max(2, Math.ceil((a1 - a0) / 0.3) + 1);
    const nv = Math.max(2, Math.ceil((b1 - b0) / 0.3) + 1);
    const recuo = 0.3;
    casa.updateWorldMatrix(true, false);
    const direcao = q.n.clone().negate().transformDirection(casa.matrixWorld);
    raio.far = recuo * 2;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const pu = cu + a0 + margem + ((a1 - a0 - 2 * margem) * i) / (nu - 1);
        const pv = cv + b0 + margem + ((b1 - b0 - 2 * margem) * j) / (nv - 1);
        const origem = noPlano(q, pu, pv).addScaledVector(q.n, recuo).applyMatrix4(casa.matrixWorld);
        raio.set(origem, direcao);
        const acertou = raio.intersectObjects(q.malhas, false).some((t) => Math.abs(t.distance - recuo) < 0.03);
        if (!acertou) return false;
      }
    }
    return true;
  }

  function vizinhaCruzada(item: Item, encaixe: Encaixe, opcoes: OpcoesDeAssento = {}): string | null {
    if (opcoes.ignorar === 'todas') return null;
    const minha = caixaDe(item);
    if (!minha) return null;
    const inverso = quatDe(encaixe).invert();
    const centro = posDe(encaixe);
    const outra = new THREE.Box3();
    for (const d of opcoes.pecas ?? estado.projeto.dispositivos) {
      if (d.superficie !== encaixe.superficie || opcoes.ignorar?.has(d.uid)) continue;
      const outroItem = CATALOGO.get(d.itemId);
      const caixa = outroItem ? caixaDe(outroItem) : null;
      if (!outroItem || !caixa) continue;
      // O grampo de parede é miúdo e não atrapalha: só outro grampo conta como vizinho dele.
      if (ehGrampo(outroItem) && !ehGrampo(item)) continue;
      const q = quatDe(d);
      const p = posDe(d);
      outra.makeEmpty();
      for (const c of cantos(caixa)) outra.expandByPoint(c.applyQuaternion(q).add(p).sub(centro).applyQuaternion(inverso));
      // Entre placas valem os 2 cm de folga, no plano do telhado; nas demais, encostar pode.
      const folga = item.categoria === 'placa' && outroItem.categoria === 'placa' ? FOLGA_ENTRE_PLACAS - 0.0005 : -0.002;
      const separadas =
        outra.min.x >= minha.max.x + folga || outra.max.x <= minha.min.x - folga ||
        outra.min.y >= minha.max.y + folga || outra.max.y <= minha.min.y - folga ||
        outra.min.z >= minha.max.z - 0.002 || outra.max.z <= minha.min.z + 0.002;
      if (!separadas) return d.uid;
    }
    return null;
  }

  /** Parede que a caixa da peça atravessa, e quanto empurrar a peça para sair dela (ao longo da espessura da parede). */
  function paredeCruzada(item: Item, encaixe: Encaixe): THREE.Vector3 | null {
    const minha = caixaDe(item);
    if (!minha) return null;
    const q = quatDe(encaixe);
    const centro = posDe(encaixe);
    const meus = cantos(minha).map((c) => c.applyQuaternion(q).add(centro));
    const naParede = new THREE.Box3();
    const inversa = new THREE.Matrix4();
    for (const m of todas()) {
      const marca = m.userData.superficie as Marca;
      if (marca.tipo !== 'parede' || marca.id === encaixe.superficie) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const parede = m.geometry.boundingBox!;
      const matriz = daMalha(m).clone();
      inversa.copy(matriz).invert();
      naParede.makeEmpty();
      for (const c of meus) naParede.expandByPoint(c.clone().applyMatrix4(inversa));
      const folga = 0.004;
      if (
        naParede.max.x <= parede.min.x + folga || naParede.min.x >= parede.max.x - folga ||
        naParede.max.y <= parede.min.y + folga || naParede.min.y >= parede.max.y - folga ||
        naParede.max.z <= parede.min.z + folga || naParede.min.z >= parede.max.z - folga
      ) continue;
      const t = parede.getSize(new THREE.Vector3());
      const eixo = t.x < t.z ? 'x' : 'z';
      const paraMais = parede.max[eixo] - naParede.min[eixo];
      const paraMenos = naParede.max[eixo] - parede.min[eixo];
      const quanto = Math.min(paraMais, paraMenos) + 0.001;
      const local = new THREE.Vector3();
      local[eixo] = paraMais <= paraMenos ? 1 : -1;
      return local.transformDirection(matriz).multiplyScalar(quanto);
    }
    return null;
  }

  /** Encaixe no ponto dado do quadro: a placa no terreno vai sobre o suporte inclinado; o resto segue a regra da superfície. */
  function encaixarNo(item: Item, q: Quadro, ponto: THREE.Vector3, giro: number, opcoes: OpcoesDeAssento): Encaixe {
    if (q.marca.id === ID_TERRENO && item.categoria === 'placa') return encaixarNoTerreno(item, ponto, giro, opcoes.inclinacao ?? inclinacaoPadrao(estado.projeto));
    // `inclinacaoGraus` vai sem valor para apagar o da placa que saiu do terreno.
    return { ...encaixar(item, q.marca, ponto, q.n, giro), inclinacaoGraus: undefined };
  }

  /** Chão que a peça ocupa no terreno. */
  function pegadaNoTerreno(item: Item, e: Encaixe): Pegada {
    if (item.categoria === 'placa') return pegadaDaPlacaNoChao(item, e);
    const caixa = caixaDe(item);
    const t = caixa ? caixa.getSize(new THREE.Vector3()) : new THREE.Vector3();
    return { x: e.pos[0], z: e.pos[2], largura: t.x, profundidade: t.z, giro: e.giro };
  }

  function terrenoOcupado(item: Item, e: Encaixe): boolean {
    return !terrenoLivre(estado.projeto, pegadaNoTerreno(item, e));
  }

  function medida(item: Item, giro: number, q: Quadro, opcoes: OpcoesDeAssento = {}): [number, number] {
    const e = encaixarNo(item, q, noPlano(q, 0, 0), giro, opcoes);
    const [a0, a1, b0, b1] = pegada(item, quatDe(e), q);
    return [a1 - a0, b1 - b0];
  }

  /**
   * Medidas, ao longo do outro eixo, das placas da água que ficam na mesma faixa: as que cruzam o trecho de `de` a
   * `ate` do eixo dado. São as que disputam o comprimento da fileira (eixo 'v') ou da coluna (eixo 'u') com a placa nova.
   */
  function placasNaFaixa(q: Quadro, opcoes: OpcoesDeAssento, eixo: 'u' | 'v', de: number, ate: number): number[] {
    const medidas: number[] = [];
    for (const d of opcoes.pecas ?? estado.projeto.dispositivos) {
      if (d.superficie !== q.marca.id || (opcoes.ignorar !== 'todas' && opcoes.ignorar?.has(d.uid))) continue;
      const outro = CATALOGO.get(d.itemId);
      if (outro?.categoria !== 'placa') continue;
      const [c0, c1, d0, d1] = pegada(outro, quatDe(d), q);
      const [ou, ov] = noQuadro(q, posDe(d));
      const [min, max] = eixo === 'v' ? [ov + d0, ov + d1] : [ou + c0, ou + c1];
      if (max <= de + 1e-6 || min >= ate - 1e-6) continue;
      medidas.push(eixo === 'v' ? c1 - c0 : d1 - d0);
    }
    return medidas;
  }

  function assentar(item: Item, giro: number, q: Quadro, pu: number, pv: number, opcoes: OpcoesDeAssento = {}): Candidato {
    const terreno = q.marca.id === ID_TERRENO;
    // O grampo de parede prende o cabo em qualquer parede, piso ou telhado, e também no chão do terreno.
    const aceita = ehGrampo(item) || (terreno ? aceitaNoTerreno(item) : superficieAceita(item) === q.marca.tipo);
    let e = encaixarNo(item, q, noPlano(q, pu, pv), giro, opcoes);
    if (!aceita) {
      if (terreno) return { encaixe: e, valido: false, motivo: 'No terreno só ficam placas (sobre suporte) e estação portátil. Leve esta peça para dentro da casa ou do quartinho.' };
      if (item.categoria === 'placa') return { encaixe: e, valido: false, motivo: 'Placa fica em um telhado ou no terreno, sobre suporte.' };
      const onde = superficieAceita(item);
      // Com a casa inteira à vista, o telhado tapa os pisos e as paredes de dentro: a dica diz como chegar neles.
      const tapado = q.marca.tipo === 'telhado' && estado.visao === 'completa' ? ' Para ver dentro da casa, troque a visão para "Sem telhado".' : '';
      return { encaixe: e, valido: false, motivo: onde ? `Esta peça só fica ${NOME_DO_TIPO[onde]}.${tapado}` : 'Esta peça não vai para a cena.' };
    }
    const [a0, a1, b0, b1] = pegada(item, quatDe(e), q);

    /** Casa da grade que passa da borda da água: onde fica e quanto passa, ao longo de u e de v. */
    let foraDaAgua: { pu: number; pv: number; passaU: number; passaV: number } | null = null;
    if (item.categoria === 'placa' && opcoes.prender && !terreno) {
      // Grade alinhada à água: parte da placa vizinha mais próxima de mesma medida (as placas já postas não mudam de
      // lugar). Sem vizinha, a grade é a que faz caber mais placas desta medida: fileira e coluna centradas na água.
      const passoU = a1 - a0 + FOLGA_ENTRE_PLACAS;
      const passoV = b1 - b0 + FOLGA_ENTRE_PLACAS;
      let ancoraU = ancoraDaFileira(q.u0, q.u1, a1 - a0);
      let ancoraV = ancoraDaFileira(q.v0, q.v1, b1 - b0);
      let menor = Infinity;
      for (const d of opcoes.pecas ?? estado.projeto.dispositivos) {
        if (d.superficie !== q.marca.id || (opcoes.ignorar !== 'todas' && opcoes.ignorar?.has(d.uid))) continue;
        const outro = CATALOGO.get(d.itemId);
        if (outro?.categoria !== 'placa') continue;
        const [c0, c1, d0, d1] = pegada(outro, quatDe(d), q);
        if (Math.abs(c1 - c0 - (a1 - a0)) > 0.002 || Math.abs(d1 - d0 - (b1 - b0)) > 0.002) continue;
        const [ou, ov] = noQuadro(q, posDe(d));
        const dist = Math.hypot(ou - pu, ov - pv);
        if (dist < menor) {
          menor = dist;
          ancoraU = ou;
          ancoraV = ov;
        }
      }
      pu = ancoraU + Math.round((pu - ancoraU) / passoU) * passoU;
      pv = ancoraV + Math.round((pv - ancoraV) / passoV) * passoV;
      const passaU = passaDaBorda(pu, a1 - a0, q.u0, q.u1);
      const passaV = passaDaBorda(pv, b1 - b0, q.v0, q.v1);
      if (passaU > 0 || passaV > 0) foraDaAgua = { pu, pv, passaU, passaV };
    }
    if (q.marca.tipo === 'parede' && item.categoria === 'aparelho') {
      // Lâmpada e chuveiro: a 2,1 m do piso do andar.
      pv = (q.v0 < PISO + 0.001 ? PISO : q.v0) + ALTURA_DE_LAMPADA;
    }
    // Não passa da borda: o centro é cortado para a pegada ficar dentro do retângulo da superfície.
    const cortar = (x: number, min: number, max: number): number => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, x)));
    pu = cortar(pu, q.u0 - a0, q.u1 - a1);
    pv = cortar(pv, q.v0 - b0, q.v1 - b1);
    const ponto = noPlano(q, pu, pv);
    e = encaixarNo(item, q, ponto, giro, opcoes);

    // Encostar na parede: a peça para na face dela em vez de entrar.
    let atravessa: THREE.Vector3 | null = null;
    if (q.marca.tipo !== 'telhado') {
      for (let i = 0; i < 3; i++) {
        atravessa = paredeCruzada(item, e);
        if (!atravessa) break;
        ponto.add(atravessa);
        e = encaixarNo(item, q, ponto, giro, opcoes);
      }
      if (atravessa) atravessa = paredeCruzada(item, e);
    }

    let motivo: string | null = null;
    if (atravessa) motivo = 'Atravessa uma parede';
    else if (terreno && terrenoOcupado(item, e)) motivo = 'Aqui não dá: fica em cima da casa, da varanda, do quartinho, de um muro, do vizinho ou do tronco de uma árvore';
    else if (vizinhaCruzada(item, e, opcoes)) {
      if (foraDaAgua) {
        // A casa da grade não cabe até a borda, e trazer a placa para dentro a poria em cima da vizinha. O que falta é
        // telhado: o fantasma fica na casa da grade, e o motivo diz quanto falta, ou que basta arrumar as outras.
        const f = foraDaAgua;
        e = encaixarNo(item, q, noPlano(q, f.pu, f.pv), giro, opcoes);
        const arrumando =
          (f.passaU === 0 || cabeSeArrumar(q.u1 - q.u0, placasNaFaixa(q, opcoes, 'v', pv + b0, pv + b1), a1 - a0)) &&
          (f.passaV === 0 || cabeSeArrumar(q.v1 - q.v0, placasNaFaixa(q, opcoes, 'u', pu + a0, pu + a1), b1 - b0));
        motivo = arrumando
          ? 'Cabe mais uma placa nesta fileira se as outras forem para o lado: use "Arrumar as placas" (ou arraste com Shift)'
          : `Não cabe: faltam ${centimetrosQueFaltam(Math.max(f.passaU, f.passaV))} cm até a borda do telhado`;
      } else motivo = item.categoria === 'placa' ? 'Fica em cima de outra placa (deixe 2 cm de folga)' : 'Já tem uma peça neste lugar';
    }
    else if (!cabe(item, e, q)) {
      motivo = q.marca.tipo === 'telhado' ? 'Passa da borda do telhado' : q.marca.tipo === 'parede' ? 'Não cabe aqui: tem porta, janela ou o fim da parede' : terreno ? 'Longe demais da casa' : 'Passa da borda do piso';
    }
    return { encaixe: limpo(e), valido: motivo === null, motivo };
  }

  function candidato(item: Item, giro: number, t: Toque, opcoes: OpcoesDeAssento = {}): Candidato {
    const q = quadro(t.marca.id, t.normal);
    if (!q) return { encaixe: encaixar(item, t.marca, t.ponto, t.normal, giro), valido: false, motivo: 'Aqui não dá para encaixar' };
    const [pu, pv] = noQuadro(q, t.ponto);
    return assentar(item, giro, q, pu, pv, { prender: true, ...opcoes });
  }

  function lugarLivre(item: Item, giro: number, q: Quadro, pu: number, pv: number, opcoes: OpcoesDaBusca = {}): Encaixe | null {
    const [l, a] = medida(item, giro, q, opcoes);
    const placa = item.categoria === 'placa';
    const [passoU, passoV] = opcoes.passo ?? (placa ? [l + FOLGA_ENTRE_PLACAS, a + FOLGA_ENTRE_PLACAS] : q.marca.id === ID_TERRENO ? [0.25, 0.25] : [0.1, 0.1]);
    const nu = Math.min(40, Math.ceil((q.u1 - q.u0) / passoU) + 1);
    const nv = Math.min(40, Math.ceil((q.v1 - q.v0) / passoV) + 1);
    const casas: [number, number, number][] = [];
    for (let i = -nu; i <= nu; i++) {
      for (let j = -nv; j <= nv; j++) {
        if (opcoes.pularOrigem && i === 0 && j === 0) continue;
        const x = pu + i * passoU;
        const y = pv + j * passoV;
        // Só as casas em que a peça inteira cabe no retângulo: nada de cortar para a borda e cair em cima da vizinha.
        if (x - l / 2 < q.u0 - 1e-6 || x + l / 2 > q.u1 + 1e-6 || y - a / 2 < q.v0 - 1e-6 || y + a / 2 > q.v1 + 1e-6) continue;
        // No empate, vale primeiro o lado direito (u positivo).
        const distancia = opcoes.emFila ? Math.abs(j) * 1000 + Math.abs(i * passoU) : Math.hypot(i * passoU, j * passoV);
        casas.push([x, y, distancia - (i > 0 ? 1e-4 : 0)]);
      }
    }
    casas.sort((p, r) => p[2] - r[2]);
    for (const [x, y] of casas) {
      const c = assentar(item, giro, q, x, y, { ...opcoes, prender: false });
      if (c.valido) return c.encaixe;
    }
    return null;
  }

  function lugarEmOutraAgua(item: Item, giro: number, centro: THREE.Vector3, fora: string | null, opcoes: OpcoesDeAssento = {}): Encaixe | null {
    const aguas = idsDoTipo('telhado')
      .filter((id) => id !== fora)
      .map((id) => quadro(id))
      .filter((x) => x !== null)
      .map((x) => {
        // Ponto da água mais perto do centro dado.
        const u = Math.min(x.u1, Math.max(x.u0, centro.dot(x.u)));
        const v = Math.min(x.v1, Math.max(x.v0, centro.dot(x.v)));
        return { x, u, v, dist: noPlano(x, u, v).distanceTo(centro) };
      })
      .sort((a, b) => a.dist - b.dist);
    for (const { x, u, v } of aguas) {
      const encaixe = lugarLivre(item, giro, x, u, v, opcoes) ?? lugarLivre(item, giro + 90, x, u, v, opcoes);
      if (encaixe) return encaixe;
    }
    return null;
  }

  function idsDoTipo(tipo: TipoSuperficie): string[] {
    const ids = new Set<string>();
    for (const m of todas()) {
      const marca = m.userData.superficie as Marca;
      if (marca.tipo === tipo) ids.add(marca.id);
    }
    return [...ids];
  }

  const normalDoToque = new THREE.Vector3();
  function toque(raioDoPonteiro: THREE.Raycaster, malhas: THREE.Object3D[]): (Toque & { distancia: number }) | null {
    casa.updateWorldMatrix(true, false);
    inversaDaCasa.copy(casa.matrixWorld).invert();
    for (const t of raioDoPonteiro.intersectObjects(malhas, false)) {
      const marca = t.object.userData.superficie as Marca | undefined;
      if (!marca || !t.face) continue;
      normalDoToque.copy(t.face.normal).transformDirection(t.object.matrixWorld);
      // Só a face de frente para o ponteiro, e só a face própria da superfície: o topo de uma parede
      // ou o requadro de uma janela não recebem peça.
      if (normalDoToque.dot(raioDoPonteiro.ray.direction) >= 0) continue;
      const normal = normalDoToque.clone().transformDirection(inversaDaCasa);
      if (marca.tipo === 'piso' ? normal.y < 0.9 : marca.tipo === 'parede' ? Math.abs(normal.y) > 0.2 : normal.y < 0.2) continue;
      if (marca.tipo === 'parede') {
        const q = quadro(marca.id, normal);
        if (!q || q.n.dot(normal) < 0.9) continue;
      }
      return { marca, ponto: t.point.clone().applyMatrix4(inversaDaCasa), normal, distancia: t.distance };
    }
    return null;
  }

  function pisoAoPe(t: Toque, malhas: THREE.Object3D[]): Toque | null {
    casa.updateWorldMatrix(true, false);
    inversaDaCasa.copy(casa.matrixWorld).invert();
    const origem = t.ponto.clone().addScaledVector(t.normal, 0.06).applyMatrix4(casa.matrixWorld);
    const paraBaixo = new THREE.Raycaster(origem, new THREE.Vector3(0, -1, 0), 0, 6);
    for (const x of paraBaixo.intersectObjects(malhas, false)) {
      const marca = x.object.userData.superficie as Marca | undefined;
      if (marca?.tipo !== 'piso' || !x.face || x.face.normal.y < 0.9) continue;
      return { marca, ponto: x.point.clone().applyMatrix4(inversaDaCasa), normal: CIMA.clone() };
    }
    return null;
  }

  function paredeAoLado(t: Toque, malhas: THREE.Object3D[], olhar?: THREE.Vector3): Toque | null {
    casa.updateWorldMatrix(true, false);
    inversaDaCasa.copy(casa.matrixWorld).invert();
    const piso = quadro(t.marca.id);
    if (!piso) return null;
    // Raios na horizontal, na altura em que a peça fica, ao longo dos dois eixos do piso e das diagonais.
    const naCasa = t.ponto.clone().addScaledVector(CIMA, ALTURA_DE_LAMPADA);
    const origem = naCasa.clone().applyMatrix4(casa.matrixWorld);
    const horizontal = new THREE.Raycaster(origem, new THREE.Vector3(), 0, 8);
    const olharNaCasa = olhar ? olhar.clone().transformDirection(inversaDaCasa) : null;
    let melhor: Toque | null = null;
    let menor = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const direcao = piso.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(piso.v, Math.sin(a)).transformDirection(casa.matrixWorld);
      horizontal.set(origem, direcao);
      const achado = toque(horizontal, malhas);
      if (!achado || achado.marca.tipo !== 'parede') continue;
      // Vale a parede cujo plano está mais perto do ponto, e nela o ponto bem em frente ao do piso.
      // Parede vista por trás (a peça ficaria escondida atrás dela) só vale se não houver outra: perde por 100 m.
      const deCostas = olharNaCasa !== null && achado.normal.dot(olharNaCasa) > 0;
      const distancia = naCasa.clone().sub(achado.ponto).dot(achado.normal);
      if (distancia + (deCostas ? 100 : 0) < menor - 1e-6) {
        menor = distancia + (deCostas ? 100 : 0);
        melhor = { marca: achado.marca, ponto: naCasa.clone().addScaledVector(achado.normal, -distancia), normal: achado.normal };
      }
    }
    return melhor;
  }

  return {
    pisoAoPe,
    paredeAoLado,
    invalidar() {
      quadros.clear();
      porId = null;
    },
    quadro,
    quadroDaPeca,
    noQuadro,
    toque,
    candidato,
    assentar,
    lugarLivre,
    lugarEmOutraAgua,
    medida,
    terrenoOcupado,
    vizinhaCruzada,
    idsDoTipo,
  };
}
