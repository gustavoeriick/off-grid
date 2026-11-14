// Camada de cabos: desenha os cabos do projeto e informa o comprimento de cada um.
// Especificação: docs/especificacao/cena-e-interface.md, seção 8, e fase-2.md, seção 1.3.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Protecao } from '../catalogo/tipos';
import { acoes, estado } from '../estado';
import type { Cabo, PontaCabo, Projeto, TipoTerminal } from '../nucleo/tipos';
import type { CamadaDeDispositivos } from './dispositivos';
import { liso } from './estampas';
import { esconder } from './malha';
import { modeloDaProtecao } from './protecoes';

/** Quanto o cabo segue a direção de saída do terminal antes de fazer a curva. */
const SAIDA = 0.12;
const RAIO: Record<string, number> = { solar: 0.012, bateria: 0.022, ca: 0.015 };
/** O porta-fusível da bateria fica a esta distância do terminal dela, ao longo do cabo. */
const DISTANCIA_DO_FUSIVEL = 0.2;
/**
 * Proteção desenhada no cabo, fora de quadro: ampliada até ficar mais larga que o cabo (que a especificação
 * desenha mais grosso que o real), para ser reconhecida.
 */
function escalaNoCabo(larguraDaPeca: number, raio: number): number {
  return Math.max(1.5, (2 * raio + 0.012) / larguraDaPeca);
}

/** Comprimento de um trecho entre dois pontos, em coordenadas da casa: `(|dx| + |dy| + |dz|) × 1,1`, mínimo de 0,3 m, arredondado a 0,1 m. */
export function comprimentoDoTrecho(a: THREE.Vector3, b: THREE.Vector3): number {
  const bruto = (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) * 1.1;
  return Math.round(Math.max(0.3, bruto) * 10) / 10;
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

/** Curva suave de um trecho: ponta A; A mais a saída; meio rebaixado; B mais a saída; ponta B. */
export function curvaDoTrecho(a: Ponta, b: Ponta): THREE.CatmullRomCurve3 {
  const dist = a.pos.distanceTo(b.pos);
  // Em trecho curto a saída encolhe, para a curva não dar laço.
  const s = Math.min(SAIDA, dist * 0.3);
  const meio = a.pos.clone().add(b.pos).multiplyScalar(0.5);
  meio.y -= Math.min(0.6, dist * 0.12);
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
  /** Grupo de um cabo: os tubos e as proteções desenhadas nele, todos com `userData.cabo`. */
  grupoDe(uid: string): THREE.Group | undefined;
  /** Tubos dos cabos à vista (`userData.cabo`), para o raio do ponteiro. */
  malhas(): THREE.Object3D[];
  destruir(): void;
}

interface Desenho {
  grupo: THREE.Group;
  assinatura: string;
  escondido: boolean;
}

const CIMA = new THREE.Vector3(0, 1, 0);

export function criarCamadaDeCabos(casa: THREE.Group, pecas: CamadaDeDispositivos): CamadaDeCabos {
  const desenhos = new Map<string, Desenho>();
  /** Por cabo, onde estavam as pontas e a passagem pelo quadro na última vez. */
  const percursos = new Map<string, string>();
  let projetoVisto: Projeto | null = null;

  function remover(uid: string): void {
    const d = desenhos.get(uid);
    if (!d) return;
    casa.remove(d.grupo);
    d.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.proprio) o.geometry.dispose();
    });
    desenhos.delete(uid);
  }

  /** Põe a peça em um ponto da curva, com o eixo Y dela ao longo do cabo e a frente o mais para cima possível. */
  function porNoCabo(peca: THREE.Object3D, curva: THREE.Curve<THREE.Vector3>, u: number, escala: number, recuo: number): void {
    const y = curva.getTangentAt(u).normalize();
    const z = CIMA.clone().addScaledVector(y, -CIMA.dot(y));
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    peca.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    peca.position.copy(curva.getPointAt(u)).addScaledVector(z, recuo);
    peca.scale.setScalar(escala);
  }

  function desenhar(c: Cabo, trechos: [Ponta, Ponta][], raio: number, cor: string, soltas: { indice: number; item: Protecao }[]): THREE.Group {
    const grupo = new THREE.Group();
    grupo.name = `cabo-${c.uid}`;
    grupo.userData.cabo = c.uid;
    const material = liso(`cabo-${cor}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.62, metalness: 0 }));
    const curvas = trechos.map(([a, b]) => curvaDoTrecho(a, b));
    for (const curva of curvas) {
      const tubo = new THREE.Mesh(new THREE.TubeGeometry(new PercursoDoTubo(curva), DIVISOES_DO_TUBO, raio, 6, false), material);
      tubo.name = 'tubo';
      tubo.castShadow = true;
      tubo.receiveShadow = true;
      tubo.userData.cabo = c.uid;
      tubo.userData.proprio = true;
      grupo.add(tubo);
    }
    // Proteções fora de quadro, desenhadas no próprio cabo.
    const itemDe = (uid: string) => CATALOGO.get(estado.projeto.dispositivos.find((d) => d.uid === uid)?.itemId ?? '');
    const bateriaNoInicio = itemDe(c.de.disp)?.categoria === 'bateria';
    const bateriaNoFim = itemDe(c.para.disp)?.categoria === 'bateria';
    let vaga = 0;
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
        const curva = bateriaNoInicio ? curvas[0]! : curvas[curvas.length - 1]!;
        const u = Math.min(0.5, DISTANCIA_DO_FUSIVEL / curva.getLength());
        porNoCabo(peca, curva, bateriaNoInicio ? u : 1 - u, escala, recuo);
      } else {
        porNoCabo(peca, curvas[0]!, Math.min(0.9, 0.25 + vaga * 0.14), escala, recuo);
        vaga++;
      }
      grupo.add(peca);
    }
    return grupo;
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
      const a = pecas.terminal(c.de.disp, c.de.terminal);
      const b = pecas.terminal(c.para.disp, c.para.terminal);
      if (!a || !b) continue;
      vivos.add(c.uid);
      const passagem = c.quadro ? pecas.passagem(c.quadro, c.uid) : null;
      const trechos: [Ponta, Ponta][] = passagem
        ? [
            [a, { pos: passagem.entrada, saida: passagem.direcao }],
            [{ pos: passagem.saida, saida: passagem.direcao }, b],
          ]
        : [[a, b]];
      // Com quadro, o comprimento é a soma dos dois trechos, cada um pela fórmula.
      const numero = (v: THREE.Vector3): string => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      const percurso = trechos.map(([p, q]) => `${numero(p.pos)};${numero(q.pos)}`).join('/');
      const anterior = percursos.get(c.uid);
      percursos.set(c.uid, percurso);
      if (anterior !== undefined && anterior !== percurso) {
        const comprimento = trechos.reduce((soma, [p, q]) => soma + comprimentoDoTrecho(p.pos, q.pos), 0);
        comprimentos.set(c.uid, Math.round(comprimento * 10) / 10);
      }

      const tipo = CATALOGO.get(c.caboId);
      const raio = RAIO[tipo?.categoria === 'cabo' ? tipo.uso : 'ca']!;
      const cor = corDoCabo(a.tipo, b.tipo);
      const soltas: { indice: number; item: Protecao }[] = [];
      c.protecoes.forEach((id, indice) => {
        const item = CATALOGO.get(id);
        if (item?.categoria === 'protecao' && !pecas.noTrilho(c.uid, indice)) soltas.push({ indice, item });
      });
      const assinatura = [
        raio, cor,
        trechos.map(([p, q]) => `${numero(p.pos)};${numero(p.saida)};${numero(q.pos)};${numero(q.saida)}`).join('/'),
        soltas.map((s) => `${s.indice}:${s.item.id}`).join(','),
      ].join('|');
      let d = desenhos.get(c.uid);
      if (!d || d.assinatura !== assinatura) {
        remover(c.uid);
        d = { grupo: desenhar(c, trechos, raio, cor, soltas), assinatura, escondido: false };
        desenhos.set(c.uid, d);
        casa.add(d.grupo);
      }
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

  return {
    atualizar,
    comprimentoEntre,
    grupoDe: (uid) => desenhos.get(uid)?.grupo,
    malhas() {
      const lista: THREE.Object3D[] = [];
      for (const d of desenhos.values()) {
        if (d.escondido) continue;
        for (const o of d.grupo.children) if (o.name === 'tubo') lista.push(o);
      }
      return lista;
    },
    destruir() {
      for (const uid of [...desenhos.keys()]) remover(uid);
    },
  };
}
