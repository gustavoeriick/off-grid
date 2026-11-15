// Destaques do passo a passo: o que a cena realça para guiar o passo da vez (`estado.destaques`).
// Especificação: docs/especificacao/tutorial.md, seção 3. Tarefa 7.3.
//
// Superfície: véu e contorno verde-claro sobre as malhas dela. Terminal: anel em volta do conector, visível através
// das paredes. Cabo: brilho ao longo dele. Tudo pulsa com período de 1,2 s, não responde ao ponteiro, não faz sombra
// e não tapa o sol no cálculo (as malhas daqui não levam `userData.sombra` nem `userData.superficie`).
// Destaque que aponta para o que não existe, ou para o que o modo de visão escondeu, não é desenhado.

import * as THREE from 'three';
import { assinar, estado } from '../estado';
import type { CamadaDeCabos } from './cabos';
import type { CamadaDeDispositivos } from './dispositivos';
import type { Marca } from './malha';

export interface PartesDosDestaques {
  /** Grupo que gira com a orientação: o realce é filho dele, em coordenadas da casa. */
  casa: THREE.Group;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Malhas de encaixe que o modo de visão deixa à vista. */
  superficies(): THREE.Mesh[];
  dispositivos: CamadaDeDispositivos;
  cabos: CamadaDeCabos;
  /** Superfícies sobre as quais uma peça está sendo arrastada: o realce delas some, para não brigar com o fantasma. */
  superficiesDoArraste(): string[];
  /** Pede um quadro novo sem refazer o mapa de sombra. */
  pedirQuadroLeve(): void;
}

/** O que está realçado de fato na cena. `id` é o da superfície, `{disp}:{terminal}` ou o `uid` do cabo. */
export type DestaqueNaCena =
  | { tipo: 'superficie'; id: string }
  | { tipo: 'terminal'; id: string; disp: string; terminal: string }
  | { tipo: 'cabo'; id: string; uid: string };

export interface CamadaDeDestaques {
  /**
   * Chamada a cada volta do laço da cena: refaz o realce se algo mudou e aplica o pulso.
   * Devolve verdadeiro enquanto há realce na tela, isto é, enquanto a cena precisa de quadros novos para ele pulsar.
   */
  animar(agoraMs: number): boolean;
  /** Lista do que está realçado de fato, para a verificação. */
  naCena(): DestaqueNaCena[];
  destruir(): void;
}

/** Período do pulso, em milissegundos. */
export const PERIODO_DO_PULSO_MS = 1200;
const COR_DO_VEU = '#8dffc0';
const COR_DO_CONTORNO = '#35e98a';
/** Espessura das barras do contorno, em metros. */
const ESPESSURA_DO_CONTORNO = 0.035;
/** Raio do anel do terminal: pelo menos este tanto na tela, em pixels, e este tanto de vezes o raio do conector. */
const RAIO_DO_ANEL_PX = 15;
const RAIO_DO_ANEL_VEZES = 2.4;
/** Fração da largura do desenho do anel em que fica o meio do traço. */
const RAIO_NO_DESENHO = 0.36;

const semRaio = (): void => {};
const EIXO_Y = new THREE.Vector3(0, 1, 0);

/** Desenho do anel: traço verde-claro com borda escura, para aparecer sobre parede branca e sobre peça escura. */
function texturaDoAnel(): THREE.CanvasTexture {
  const lado = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = lado;
  const g = cv.getContext('2d')!;
  const traco = (largura: number, cor: string): void => {
    g.beginPath();
    g.arc(lado / 2, lado / 2, lado * RAIO_NO_DESENHO, 0, Math.PI * 2);
    g.lineWidth = largura;
    g.strokeStyle = cor;
    g.stroke();
  };
  traco(17, 'rgba(6, 70, 38, 0.75)');
  traco(10, '#7dffb4');
  traco(3, '#ffffff');
  const textura = new THREE.CanvasTexture(cv);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

interface RealceDeSuperficie {
  id: string;
  grupo: THREE.Group;
}

interface RealceDeTerminal {
  disp: string;
  terminal: string;
  anel: THREE.Sprite;
  raio: number;
}

export function criarCamadaDeDestaques(c: PartesDosDestaques): CamadaDeDestaques {
  const camada = new THREE.Group();
  camada.name = 'destaques';
  c.casa.add(camada);

  // O véu é desenhado rente à superfície: o deslocamento de profundidade evita que ele brigue com ela.
  const matVeu = new THREE.MeshBasicMaterial({
    color: COR_DO_VEU, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
  const matContorno = new THREE.MeshBasicMaterial({ color: COR_DO_CONTORNO, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const matBrilho = new THREE.MeshBasicMaterial({ color: COR_DO_VEU, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const desenhoDoAnel = texturaDoAnel();
  // O anel aparece mesmo atrás de parede ou de telhado: é ele que diz onde está o conector.
  const matAnel = new THREE.SpriteMaterial({ map: desenhoDoAnel, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const geoBarra = new THREE.BoxGeometry(1, 1, 1);

  let sujo = true;
  let superficies: RealceDeSuperficie[] = [];
  let terminais: RealceDeTerminal[] = [];
  let cabos: string[] = [];
  /** Barras de contorno do realce atual: são próprias dele e saem da placa de vídeo quando ele é refeito. */
  let contornos: THREE.InstancedMesh[] = [];

  function limpar(): void {
    for (const m of contornos) m.dispose();
    contornos = [];
    camada.clear();
    superficies = [];
    terminais = [];
    cabos = [];
  }

  /** O realce usa geometrias da casa e dos cabos, que são trocadas quando eles mudam: sai na hora e volta no próximo quadro. */
  function invalidar(): void {
    const havia = camada.children.length > 0;
    limpar();
    sujo = true;
    // Sem realce novo não há pulso para pedir quadros: o que saiu precisa de um quadro para sumir da tela.
    if (havia) c.pedirQuadroLeve();
  }

  const relativa = new THREE.Matrix4();
  const inversaDaCasa = new THREE.Matrix4();

  function realcarSuperficie(id: string): void {
    const malhas = c.superficies().filter((m) => (m.userData.superficie as Marca | undefined)?.id === id);
    if (malhas.length === 0) return;
    const grupo = new THREE.Group();
    grupo.name = `destaque-superficie-${id}`;
    c.casa.updateWorldMatrix(true, false);
    inversaDaCasa.copy(c.casa.matrixWorld).invert();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const meio = new THREE.Vector3();
    const giro = new THREE.Quaternion();
    const escala = new THREE.Vector3();
    const matriz = new THREE.Matrix4();
    for (const malha of malhas) {
      malha.updateWorldMatrix(true, false);
      relativa.multiplyMatrices(inversaDaCasa, malha.matrixWorld);

      // Véu: a própria geometria da superfície, com o material translúcido.
      const veu = new THREE.Mesh(malha.geometry, matVeu);
      veu.name = 'veu';
      veu.matrixAutoUpdate = false;
      veu.matrix.copy(relativa);
      veu.matrixWorldNeedsUpdate = true;
      veu.renderOrder = 4;
      veu.raycast = semRaio;
      grupo.add(veu);

      // Contorno: uma barra em cada aresta viva da superfície (a linha de 1 px some de longe).
      const arestas = new THREE.EdgesGeometry(malha.geometry, 30);
      const pos = arestas.getAttribute('position');
      const n = pos.count / 2;
      if (n > 0) {
        const barras = new THREE.InstancedMesh(geoBarra, matContorno, n);
        barras.name = 'contorno';
        for (let i = 0; i < n; i++) {
          a.fromBufferAttribute(pos, i * 2).applyMatrix4(relativa);
          b.fromBufferAttribute(pos, i * 2 + 1).applyMatrix4(relativa);
          const comprimento = a.distanceTo(b);
          meio.copy(a).add(b).multiplyScalar(0.5);
          if (comprimento > 1e-6) giro.setFromUnitVectors(EIXO_Y, b.sub(a).divideScalar(comprimento));
          else giro.identity();
          escala.set(ESPESSURA_DO_CONTORNO, comprimento + ESPESSURA_DO_CONTORNO, ESPESSURA_DO_CONTORNO);
          barras.setMatrixAt(i, matriz.compose(meio, giro, escala));
        }
        barras.instanceMatrix.needsUpdate = true;
        barras.computeBoundingSphere();
        barras.renderOrder = 5;
        barras.raycast = semRaio;
        contornos.push(barras);
        grupo.add(barras);
      }
      arestas.dispose();
    }
    camada.add(grupo);
    superficies.push({ id, grupo });
  }

  function realcarTerminal(disp: string, terminal: string): void {
    const t = c.dispositivos.terminal(disp, terminal);
    // Peça em superfície que o modo de visão escondeu: o anel ficaria solto no ar.
    if (!t || !c.dispositivos.grupoDe(disp) || c.dispositivos.escondida(disp)) return;
    const anel = new THREE.Sprite(matAnel);
    anel.name = `destaque-terminal-${disp}-${terminal}`;
    anel.position.copy(t.pos);
    anel.renderOrder = 30;
    anel.raycast = semRaio;
    camada.add(anel);
    terminais.push({ disp, terminal, anel, raio: t.raio });
  }

  function realcarCabo(uid: string): void {
    const grupo = c.cabos.grupoDe(uid);
    if (!grupo) return;
    let desenhou = false;
    for (const o of grupo.children) {
      if (o.name !== 'tubo-de-clique' || o.userData.escondido) continue;
      const brilho = new THREE.Mesh((o as THREE.Mesh).geometry, matBrilho);
      brilho.name = `destaque-cabo-${uid}`;
      brilho.renderOrder = 4;
      brilho.raycast = semRaio;
      camada.add(brilho);
      desenhou = true;
    }
    if (desenhou) cabos.push(uid);
  }

  function refazer(): void {
    limpar();
    sujo = false;
    const feitos = new Set<string>();
    for (const d of estado.destaques) {
      const chave = d.tipo === 'superficie' ? `s|${d.id}` : d.tipo === 'terminal' ? `t|${d.disp}|${d.terminal}` : `c|${d.uid}`;
      if (feitos.has(chave)) continue;
      feitos.add(chave);
      if (d.tipo === 'superficie') realcarSuperficie(d.id);
      else if (d.tipo === 'terminal') realcarTerminal(d.disp, d.terminal);
      else realcarCabo(d.uid);
    }
    aplicarArraste();
  }

  /** Esconde o realce da superfície sobre a qual uma peça está sendo arrastada. */
  function aplicarArraste(): void {
    if (superficies.length === 0) return;
    const sobre = c.superficiesDoArraste();
    for (const s of superficies) s.grupo.visible = !sobre.includes(s.id);
  }

  const noMundo = new THREE.Vector3();

  function animar(agoraMs: number): boolean {
    if (sujo) refazer();
    if (superficies.length === 0 && terminais.length === 0 && cabos.length === 0) return false;
    aplicarArraste();
    // Vai de 0 a 1 e volta, uma vez a cada 1,2 s.
    const pulso = 0.5 - 0.5 * Math.cos((2 * Math.PI * agoraMs) / PERIODO_DO_PULSO_MS);
    matVeu.opacity = 0.2 + 0.32 * pulso;
    matContorno.opacity = 0.55 + 0.45 * pulso;
    matBrilho.opacity = 0.3 + 0.55 * pulso;
    matAnel.opacity = 0.65 + 0.35 * pulso;
    if (terminais.length > 0) {
      c.camera.updateMatrixWorld();
      const porPixel = (2 * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
      for (const t of terminais) {
        const distancia = t.anel.getWorldPosition(noMundo).distanceTo(c.camera.position);
        const raio = Math.max(t.raio * RAIO_DO_ANEL_VEZES, RAIO_DO_ANEL_PX * porPixel * distancia) * (1 + 0.22 * pulso);
        t.anel.scale.setScalar(raio / RAIO_NO_DESENHO);
      }
    }
    return true;
  }

  const cancelar = [
    assinar('destaques', invalidar),
    assinar('casa', invalidar),
    assinar('dispositivos', invalidar),
    assinar('cabos', invalidar),
    assinar('visao', invalidar),
  ];

  return {
    animar,
    naCena() {
      if (sujo) refazer();
      const sobre = c.superficiesDoArraste();
      return [
        ...superficies.filter((s) => !sobre.includes(s.id)).map((s) => ({ tipo: 'superficie' as const, id: s.id })),
        ...terminais.map((t) => ({ tipo: 'terminal' as const, id: `${t.disp}:${t.terminal}`, disp: t.disp, terminal: t.terminal })),
        ...cabos.map((uid) => ({ tipo: 'cabo' as const, id: uid, uid })),
      ];
    },
    destruir() {
      cancelar.forEach((f) => f());
      limpar();
      c.casa.remove(camada);
      geoBarra.dispose();
      desenhoDoAnel.dispose();
      for (const m of [matVeu, matContorno, matBrilho, matAnel]) m.dispose();
    },
  };
}
