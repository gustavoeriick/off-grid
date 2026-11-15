// "Arrumar os cabos": põe os grampos sozinho, de modo que cada cabo corra rente às superfícies.
// Especificação: docs/especificacao/cena-e-interface.md, seção 8.
//
// Este arquivo mede a cena (paredes, pisos, telhados, peças e terminais) e entrega as medidas a `trajeto.ts`,
// que faz a conta do caminho. O resultado vira uma lista de grampos por cabo, aplicada de uma vez com
// `acoes.definirGramposDosCabos` (um passo só de desfazer). O comprimento é remedido pela camada de cabos.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import { acoes, type Encaixe, estado } from '../estado';
import type { Cabo, Dispositivo } from '../nucleo/tipos';
import { corteDoQuadro } from './cabos';
import type { CamadaDeDispositivos, TerminalNaCasa } from './dispositivos';
import { ehGrampo, encaixar } from './encaixe';
import type { Lugares } from './lugares';
import type { Marca } from './malha';
import { ID_TERRENO } from './terreno';
import {
  apoioMaisPerto, type CaixaDoMundo, type FaceDoMundo, FOLGA_DO_TRAJETO, type GrampoDoTrajeto, larguraDoGrampo, type Mundo, type OpcaoLivre,
  type P3, type PontaDoTrajeto, tracarTrajeto, type TrechoOcupado, type TrianguloDoMundo,
} from './trajeto';

export interface ResultadoDeArrumar {
  /** Cabos que ganharam grampos. */
  arrumados: number;
  /** Cabos sem caminho pelas superfícies: ficaram presos só perto das pontas, com um vão direto no meio. */
  semCaminho: string[];
  /** Grampos postos, no total. */
  grampos: number;
  /** Para conferência: por cabo, os vértices da linha do trajeto sobre as superfícies. */
  trajetos: Record<string, P3[]>;
}

export interface ArrumadorDeCabos {
  /** Refaz o trajeto de todos os cabos. Com o projeto sem cabos, não faz nada e devolve zero. */
  arrumar(): ResultadoDeArrumar;
  /** Tira os grampos de todos os cabos. Devolve quantos cabos foram soltos. */
  soltar(): number;
  /** Para conferência: as medidas da cena que a conta do trajeto recebe. */
  medir(): Mundo;
}

const ID_DO_GRAMPO = 'acc-grampo';
/** Raio do desenho do cabo, como em `cabos.ts`. */
const RAIO: Record<string, number> = { solar: 0.006, bateria: 0.011, ca: 0.007 };
/** Cabo entre dois terminais a menos desta distância é arrumado antes dos outros. */
const CABO_CURTO = 2;
/** Altura mínima de um vão entre a casa e o quartinho: acima da cabeça de quem passa. */
const ALTURA_DO_VAO = 1.8;
/** A folha da porta fechada começa a milímetros do piso: o cabo passa por baixo dela. */
const VAO_SOB_A_PORTA = 0.04;
/** A soleira é a pedra baixa ao pé da porta: até esta altura acima do pé da parede. */
const ALTURA_MAXIMA_DA_SOLEIRA = 0.08;
/** O cabo em cima das telhas é o último recurso: cada metro no telhado custa como dois na parede. */
const PESO_NO_TELHADO = 2;
/** Da borda do telhado, o cabo só alcança a parede logo abaixo do beiral. */
const ALCANCE_SOB_O_BEIRAL = 0.9;
/** Distância máxima entre dois grampos no telhado. */
const VAO_NO_TELHADO = 1.5;
/** No telhado, quanto o cabo passa da borda antes de descer para a parede, e quanto o grampo fica antes dela. */
const ALEM_DA_BORDA = 0.035;
const ANTES_DA_BORDA = 0.03;

const p3 = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];
const v3 = (p: readonly number[]): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

function raioDe(c: Cabo): number {
  const tipo = CATALOGO.get(c.caboId);
  return RAIO[tipo?.categoria === 'cabo' ? tipo.uso : 'ca']!;
}

// ---------------------------------------------------------------- Medir a cena

/** Retângulo reto, em coordenadas da casa, de um quadrilátero de malha. Nulo se ele não é reto ou não está alinhado aos eixos. */
function faceDoQuad(v: readonly THREE.Vector3[], normal: THREE.Vector3): { face: Omit<FaceDoMundo, 'apoio'>; inteira: boolean } | null {
  const eixo = ([0, 1, 2] as const).find((e) => Math.abs(normal.getComponent(e)) > 0.9995);
  if (eixo === undefined) return null;
  const plano = v[0]!.getComponent(eixo);
  if (v.some((p) => Math.abs(p.getComponent(eixo) - plano) > 1e-3)) return null;
  const min: P3 = [Infinity, Infinity, Infinity];
  const max: P3 = [-Infinity, -Infinity, -Infinity];
  for (const p of v) {
    for (let e = 0; e < 3; e++) {
      min[e] = Math.min(min[e]!, p.getComponent(e));
      max[e] = Math.max(max[e]!, p.getComponent(e));
    }
  }
  min[eixo] = plano;
  max[eixo] = plano;
  const sinal = normal.getComponent(eixo) > 0 ? 1 : -1;
  const nosCantos = (e: number): boolean => v.every((p) => Math.abs(p.getComponent(e) - min[e]!) < 1e-3 || Math.abs(p.getComponent(e) - max[e]!) < 1e-3);
  const [e1, e2] = eixo === 0 ? [1, 2] : eixo === 1 ? [0, 2] : [0, 1];
  let inteira = true;
  if (!nosCantos(e1!) || !nosCantos(e2!)) {
    // Parede com o topo inclinado (as laterais do quartinho): vale o retângulo até o lado mais baixo.
    if (eixo === 1 || !nosCantos(eixo === 0 ? 2 : 0)) return null;
    const horizontal = eixo === 0 ? 2 : 0;
    const noLado = (lado: number): number[] => v.filter((p) => Math.abs(p.getComponent(horizontal) - lado) < 1e-3).map((p) => p.y);
    const a = noLado(min[horizontal]!);
    const b = noLado(max[horizontal]!);
    if (a.length !== 2 || b.length !== 2) return null;
    min[1] = Math.max(Math.min(...a), Math.min(...b));
    max[1] = Math.min(Math.max(...a), Math.max(...b));
    inteira = false;
  }
  if (max[e1!]! - min[e1!]! < 1e-4 || max[e2!]! - min[e2!]! < 1e-4) return null;
  return { face: { eixo, sinal, min, max }, inteira };
}

interface Telhado {
  id: string;
  triangulos: TrianguloDoMundo[];
}

/** Faces, triângulos e telhados da casa, em coordenadas dela. */
function medirCasa(casa: THREE.Group): { faces: FaceDoMundo[]; triangulos: TrianguloDoMundo[]; telhados: Map<string, Telhado> } {
  const faces: FaceDoMundo[] = [];
  const triangulos: TrianguloDoMundo[] = [];
  const telhados = new Map<string, Telhado>();
  casa.updateWorldMatrix(true, true);
  const inversa = new THREE.Matrix4().copy(casa.matrixWorld).invert();
  const matriz = new THREE.Matrix4();

  const ler = (malha: THREE.Mesh, cada: (v: THREE.Vector3[], normal: THREE.Vector3) => void): void => {
    const pos = malha.geometry.getAttribute('position');
    if (!pos) return;
    matriz.multiplyMatrices(inversa, malha.matrixWorld);
    const pontos: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) pontos.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matriz));
    const indice = malha.geometry.getIndex();
    const n = indice ? indice.count : pos.count;
    const em = (i: number): number => (indice ? indice.getX(i) : i);
    const normalDe = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 => new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    for (let i = 0; i + 2 < n; ) {
      // O `Construtor` grava cada quadrilátero como dois triângulos (a, b, c) e (a, c, d).
      if (i + 5 < n && em(i) === em(i + 3) && em(i + 2) === em(i + 4)) {
        const v = [pontos[em(i)]!, pontos[em(i + 1)]!, pontos[em(i + 2)]!, pontos[em(i + 5)]!];
        cada(v, normalDe(v[0]!, v[1]!, v[3]!));
        i += 6;
      } else {
        const v = [pontos[em(i)]!, pontos[em(i + 1)]!, pontos[em(i + 2)]!];
        cada(v, normalDe(v[0]!, v[1]!, v[2]!));
        i += 3;
      }
    }
  };
  const emTriangulos = (v: readonly THREE.Vector3[]): TrianguloDoMundo[] =>
    v.length === 4 ? [[p3(v[0]!), p3(v[1]!), p3(v[2]!)], [p3(v[0]!), p3(v[2]!), p3(v[3]!)]] : [[p3(v[0]!), p3(v[1]!), p3(v[2]!)]];

  const visitar = (o: THREE.Object3D): void => {
    // Água de telhado: do grupo dela só interessa o plano de encaixe (telhas, ripas e caibros ficam de fora).
    const plano = o.children.find((x) => x instanceof THREE.Mesh && (x.userData.superficie as Marca | undefined)?.tipo === 'telhado') as THREE.Mesh | undefined;
    if (plano) {
      const id = (plano.userData.superficie as Marca).id;
      const lista: TrianguloDoMundo[] = [];
      ler(plano, (v) => lista.push(...emTriangulos(v)));
      telhados.set(id, { id, triangulos: lista });
      triangulos.push(...lista);
      return;
    }
    if (o.name === 'cumeeira') return;
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
      const marca = o.userData.superficie as Marca | undefined;
      const solido = o.userData.sombra === true || o.name === 'vidros';
      if (!o.userData.soEncaixe && !o.userData.nomeDeComodo && (solido || marca)) {
        const apoia = marca !== undefined || o.name === 'frente-quartinho';
        // Soleira de pedra das portas (na malha dos peitoris): o cabo passa por cima dela, por baixo da folha.
        const paredeDaSoleira = o.name === 'peitoris-e-ferragens' ? (o.parent?.children.find((x) => (x.userData.superficie as Marca | undefined)?.tipo === 'parede')?.userData.superficie as Marca | undefined) : undefined;
        const peDaSoleira = paredeDaSoleira && o.parent ? new THREE.Vector3().setFromMatrixPosition(matriz.multiplyMatrices(inversa, o.parent.matrixWorld)).y : null;
        const superficie = marca?.id ?? paredeDaSoleira?.id ?? 'parede-quartinho-fundo';
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        matriz.multiplyMatrices(inversa, o.matrixWorld);
        const topo = o.geometry.boundingBox!.clone().applyMatrix4(matriz).max.y;
        // Folha de porta (malha das esquadrias): começa a milímetros do piso do andar. O cabo passa por baixo.
        const pe = o.name === 'esquadrias' && o.parent ? new THREE.Vector3().setFromMatrixPosition(matriz.multiplyMatrices(inversa, o.parent.matrixWorld)).y : null;
        ler(o, (v, normal) => {
          const reta = faceDoQuad(v, normal);
          if (!reta || !reta.inteira) triangulos.push(...emTriangulos(v));
          if (!reta) return;
          const f = reta.face;
          if (pe !== null) {
            const piso = pe + 0.05;
            const baixo = f.min[1];
            if (baixo > piso + 0.002 && baixo < piso + 0.03) {
              if (f.eixo === 1) return;
              f.min[1] = piso + VAO_SOB_A_PORTA;
              if (f.max[1] <= f.min[1]) return;
            }
          }
          // O topo de uma parede não é caminho: ali ficam a laje, o forro ou o telhado.
          const topoDeParede = marca?.tipo !== 'piso' && f.eixo === 1 && f.sinal > 0 && f.min[1] > topo - 0.002;
          const soleira = peDaSoleira !== null && f.min[1] > peDaSoleira - 0.002 && f.max[1] < peDaSoleira + ALTURA_MAXIMA_DA_SOLEIRA;
          const serve = soleira || (apoia && !topoDeParede);
          faces.push({ ...f, apoio: serve, ...(serve ? { superficie } : {}) });
        });
      }
    }
    for (const filho of o.children) visitar(filho);
  };
  const estrutura = casa.getObjectByName('estrutura');
  if (estrutura) visitar(estrutura);
  // O chão: nada passa por baixo da casa.
  faces.push({ eixo: 1, sinal: 1, min: [-200, 0, -200], max: [200, 0, 200], apoio: false });
  return { faces, triangulos, telhados };
}

/** Caixa de cada peça que ocupa lugar (fora grampos e placas), em coordenadas da casa. */
function caixasDasPecas(pecas: CamadaDeDispositivos): CaixaDoMundo[] {
  const lista: CaixaDoMundo[] = [];
  for (const d of estado.projeto.dispositivos) {
    const item = CATALOGO.get(d.itemId);
    const grupo = pecas.grupoDe(d.uid);
    const volume = grupo?.userData.volume as THREE.Box3 | undefined;
    if (!item || !volume || ehGrampo(item) || item.categoria === 'placa') continue;
    const q = new THREE.Quaternion(...d.quat);
    const centro = new THREE.Vector3(...d.pos);
    const caixa = new THREE.Box3();
    for (const x of [volume.min.x, volume.max.x]) for (const y of [volume.min.y, volume.max.y]) for (const z of [volume.min.z, volume.max.z]) caixa.expandByPoint(new THREE.Vector3(x, y, z).applyQuaternion(q).add(centro));
    lista.push({ min: p3(caixa.min), max: p3(caixa.max) });
  }
  return lista;
}

// ---------------------------------------------------------------- Pontas

/** Ponta em uma peça de telhado: o cabo corre pelo telhado até a borda, ou vai direto a uma parede que esteja à vista. */
function pontaNoTelhado(lugares: Lugares, d: Dispositivo, t: TerminalNaCasa): { ponta: PontaDoTrajeto; noTelhado: GrampoDoTrajeto } | null {
  const q = d.superficie ? lugares.quadro(d.superficie) : null;
  if (!q || q.marca.tipo !== 'telhado') return null;
  const naAgua = (u: number, v: number, altura = 0): THREE.Vector3 => new THREE.Vector3().addScaledVector(q.u, u).addScaledVector(q.v, v).addScaledVector(q.n, q.w + altura);
  const u = THREE.MathUtils.clamp(t.pos.dot(q.u), q.u0 + ANTES_DA_BORDA, q.u1 - ANTES_DA_BORDA);
  const v = THREE.MathUtils.clamp(t.pos.dot(q.v), q.v0 + ANTES_DA_BORDA, q.v1 - ANTES_DA_BORDA);
  const grampo = (pu: number, pv: number): GrampoDoTrajeto => ({ pos: p3(naAgua(pu, pv)), normal: p3(q.n), superficie: q.marca.id });
  const junto = grampo(u, v);
  const opcoes: OpcaoLivre[] = [{ grampos: [junto], partida: p3(naAgua(u, v, FOLGA_DO_TRAJETO)), custo: 0, aCeuAberto: true }];
  const bordas: [number, number, number, number][] = [
    [q.u0 - ALEM_DA_BORDA, v, q.u0 + ANTES_DA_BORDA, v],
    [q.u1 + ALEM_DA_BORDA, v, q.u1 - ANTES_DA_BORDA, v],
    [u, q.v0 - ALEM_DA_BORDA, u, q.v0 + ANTES_DA_BORDA],
    [u, q.v1 + ALEM_DA_BORDA, u, q.v1 - ANTES_DA_BORDA],
  ];
  for (const [fu, fv, gu, gv] of bordas) {
    const comprimento = Math.hypot(gu - u, gv - v);
    const grampos = [junto];
    // Grampos pelo caminho até a borda, a cada 1,5 m no máximo.
    const partes = Math.max(1, Math.ceil(comprimento / VAO_NO_TELHADO));
    if (comprimento > 0.05) for (let k = 1; k <= partes; k++) grampos.push(grampo(u + ((gu - u) * k) / partes, v + ((gv - v) * k) / partes));
    opcoes.push({ grampos, partida: p3(naAgua(fu, fv, FOLGA_DO_TRAJETO)), custo: comprimento * PESO_NO_TELHADO, alcance: ALCANCE_SOB_O_BEIRAL });
  }
  return { ponta: { tipo: 'livre', opcoes }, noTelhado: junto };
}

interface PontaMedida {
  ponta: PontaDoTrajeto;
  /** Onde o cabo se liga, para as contas de distância. */
  pos: THREE.Vector3;
  /** Grampo junto do terminal quando a peça está em um telhado. */
  noTelhado: GrampoDoTrajeto | null;
  superficie: string | null;
}

export function criarArrumador(casa: THREE.Group, pecas: CamadaDeDispositivos, lugares: Lugares): ArrumadorDeCabos {
  const itemDoGrampo = CATALOGO.get(ID_DO_GRAMPO);

  function pontaDe(disp: string, terminal: string): PontaMedida | null {
    const t = pecas.terminal(disp, terminal);
    const d = estado.projeto.dispositivos.find((x) => x.uid === disp);
    if (!t || !d) return null;
    const telhado = pontaNoTelhado(lugares, d, t);
    if (telhado) return { ponta: telhado.ponta, pos: t.pos, noTelhado: telhado.noTelhado, superficie: d.superficie };
    // Peça no terreno: não há superfície por perto; o cabo vai direto do terminal à parede mais próxima que esteja à vista.
    if (d.superficie === ID_TERRENO) {
      return { ponta: { tipo: 'livre', opcoes: [{ grampos: [], partida: p3(t.pos.clone().addScaledVector(t.saida, 0.05)), custo: 0, aCeuAberto: true }] }, pos: t.pos, noTelhado: null, superficie: d.superficie };
    }
    return { ponta: { tipo: 'terminal', pos: p3(t.pos), saida: p3(t.saida) }, pos: t.pos, noTelhado: null, superficie: d.superficie };
  }

  /** Ponta que é a passagem do cabo pela face de baixo de um quadro de energia. */
  const pontaNoQuadro = (pos: THREE.Vector3, direcao: THREE.Vector3): PontaMedida => ({ ponta: { tipo: 'terminal', pos: p3(pos), saida: p3(direcao) }, pos, noTelhado: null, superficie: null });

  function encaixeDo(g: GrampoDoTrajeto): Encaixe {
    // Com o tipo `telhado`, `encaixar` deita a base do grampo em qualquer face, de pé, deitada ou inclinada.
    return encaixar(itemDoGrampo!, { id: g.superficie ?? 'parede-quartinho-fundo', tipo: 'telhado' }, g.pos, g.normal, 0);
  }

  /** Ponto por onde o cabo passa em um grampo, como a camada de cabos desenha. */
  const noGrampo = (g: GrampoDoTrajeto, raio: number): THREE.Vector3 => v3(g.pos).addScaledVector(v3(g.normal), raio + 0.0005);

  function arrumar(): ResultadoDeArrumar {
    const lista = estado.projeto.cabos;
    if (lista.length === 0 || itemDoGrampo?.categoria !== 'acessorio') return { arrumados: 0, semCaminho: [], grampos: 0, trajetos: {} };
    const mundo = medir();
    const ocupados: (TrechoOcupado & { cabo: string })[] = [];
    /** Cabos do mesmo par de peças do cabo da vez (o positivo e o negativo de uma ligação). */
    let doPar = new Set<string>();
    const rotas = new Map<string, Encaixe[]>();
    const semCaminho: string[] = [];
    const trajetos: Record<string, P3[]> = {};
    let cabo = '';

    /** Trajeto entre duas pontas; sem caminho, um grampo perto de cada ponta e o vão direto. Devolve se achou caminho. */
    const ligar = (a: PontaMedida, b: PontaMedida, largura: number, grampos: GrampoDoTrajeto[]): boolean => {
      // Duas placas na mesma água: o cabo curto entre elas fica preso no telhado, junto de cada terminal.
      if (a.noTelhado && b.noTelhado && a.superficie === b.superficie) {
        const longe = v3(a.noTelhado.pos).distanceTo(v3(b.noTelhado.pos)) > 0.3;
        if (longe) grampos.push(a.noTelhado, b.noTelhado);
        else grampos.push({ ...a.noTelhado, pos: p3(v3(a.noTelhado.pos).add(v3(b.noTelhado.pos)).multiplyScalar(0.5)) });
        return true;
      }
      const trajeto = tracarTrajeto(mundo, a.ponta, b.ponta, { largura, ocupados: ocupados.map((t) => ({ ...t, par: doPar.has(t.cabo) })), alturaMinimaDoVao: ALTURA_DO_VAO });
      if (trajeto) {
        grampos.push(...trajeto.grampos);
        trajetos[cabo] = [...(trajetos[cabo] ?? []), ...trajeto.pontos];
        for (const t of trajeto.trechos) ocupados.push({ ...t, largura, cabo });
        return true;
      }
      for (const x of [a, b]) {
        const g = x.noTelhado ?? (x.ponta.tipo === 'terminal' ? apoioMaisPerto(mundo, x.ponta.pos, x.ponta.saida) : null);
        if (g) grampos.push(g);
      }
      return false;
    };

    // Ordem: primeiro os cabos curtos (ficam com o caminho direto); depois os de corrente contínua, que andam em par
    // (positivo e negativo ficam com duas faixas vizinhas); por fim os de corrente alternada, do mais curto ao mais
    // comprido. Os de mesmo par de peças vão sempre um depois do outro.
    const medida = (c: Cabo): number => {
      const a = pecas.terminal(c.de.disp, c.de.terminal);
      const b = pecas.terminal(c.para.disp, c.para.terminal);
      return a && b ? a.pos.distanceTo(b.pos) : Infinity;
    };
    const turno = (c: Cabo): number => {
      if (medida(c) < CABO_CURTO) return 0;
      const a = pecas.terminal(c.de.disp, c.de.terminal);
      const b = pecas.terminal(c.para.disp, c.para.terminal);
      return a?.tipo === 'ca' || b?.tipo === 'ca' ? 2 : 1;
    };
    const par = (c: Cabo): string => [c.de.disp, c.para.disp].sort().join('|');
    const chaveDoPar = new Map<string, [number, number]>();
    for (const c of lista) {
      const atual = chaveDoPar.get(par(c));
      const nova: [number, number] = [turno(c), medida(c)];
      if (!atual || nova[0] < atual[0] || (nova[0] === atual[0] && nova[1] < atual[1])) chaveDoPar.set(par(c), nova);
    }
    const ordem = lista
      .map((c, i) => ({ c, i, chave: chaveDoPar.get(par(c))! }))
      .sort((x, y) => x.chave[0] - y.chave[0] || x.chave[1] - y.chave[1] || par(x.c).localeCompare(par(y.c)) || x.i - y.i);

    let total = 0;
    for (const { c } of ordem) {
      const a = pontaDe(c.de.disp, c.de.terminal);
      const b = pontaDe(c.para.disp, c.para.terminal);
      if (!a || !b) continue;
      const raio = raioDe(c);
      const largura = larguraDoGrampo(raio);
      cabo = c.uid;
      doPar = new Set(lista.filter((x) => x.uid !== c.uid && par(x) === par(c)).map((x) => x.uid));
      const passagem = c.quadro ? pecas.passagem(c.quadro, c.uid) : null;
      let grampos: GrampoDoTrajeto[] = [];
      let achou: boolean;
      if (passagem) {
        // O cabo que passa por um quadro é arrumado em duas partes: até a entrada dele e da saída em diante.
        const ate: GrampoDoTrajeto[] = [];
        const depois: GrampoDoTrajeto[] = [];
        const primeira = ligar(a, pontaNoQuadro(passagem.entrada, passagem.direcao), largura, ate);
        const segunda = ligar(pontaNoQuadro(passagem.saida, passagem.direcao), b, largura, depois);
        achou = primeira && segunda;
        // O desenho põe a ida ao quadro onde ela menos alonga o cabo: tem de ser entre as duas partes.
        // Se cair em outro lugar, sai o grampo vizinho do quadro, até acertar.
        for (let volta = 0; volta < 8; volta++) {
          const pontos = [a.pos, ...[...ate, ...depois].map((g) => noGrampo(g, raio)), b.pos];
          const corte = corteDoQuadro(pontos, passagem.entrada, passagem.saida);
          if (corte === ate.length) break;
          if (corte < ate.length) ate.pop();
          else depois.shift();
        }
        grampos = [...ate, ...depois];
      } else {
        achou = ligar(a, b, largura, grampos);
      }
      if (!achou) semCaminho.push(c.uid);
      if (grampos.length === 0) continue;
      rotas.set(c.uid, grampos.map(encaixeDo));
      total += grampos.length;
    }
    // Cabo que já tinha grampos e ficou sem trajeto (uma ponta fora da cena) é solto: nada de grampo velho perdido.
    for (const c of lista) if (!rotas.has(c.uid) && (c.grampos ?? []).length > 0) rotas.set(c.uid, []);
    if (rotas.size > 0) acoes.definirGramposDosCabos(rotas);
    return { arrumados: [...rotas.values()].filter((r) => r.length > 0).length, semCaminho, grampos: total, trajetos };
  }

  function soltar(): number {
    const rotas = new Map<string, Encaixe[]>();
    for (const c of estado.projeto.cabos) if ((c.grampos ?? []).length > 0) rotas.set(c.uid, []);
    if (rotas.size > 0) acoes.definirGramposDosCabos(rotas);
    return rotas.size;
  }

  function medir(): Mundo {
    const medido = medirCasa(casa);
    return { faces: medido.faces, caixas: caixasDasPecas(pecas), triangulos: medido.triangulos, telhados: [...medido.telhados.values()].flatMap((t) => t.triangulos) };
  }
  return { arrumar, soltar, medir };
}
