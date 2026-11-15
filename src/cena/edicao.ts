// Modo "Editar casa": mover o quartinho, criar e esticar varandas, desenhar paredes internas, dar nome aos cômodos
// e mover os obstáculos que fazem sombra (muro, vizinho, árvore), tudo com o ponteiro.
// Especificação: docs/especificacao/fase-2.md, seção 4. Tarefas 2.6, 2.7b e 5.2.
//
// Só responde com `estado.edicaoCasa.ativa`; fora do modo, quem trata o ponteiro é interacao.ts.
// A cena não muda o projeto direto: tudo aqui termina em uma ação de `src/estado.ts`.
// Eventos na `window`:
//   offgrid:nomear-comodo   { andar, x, z, clientX, clientY }   (emite) clique no piso de uma área; a interface abre o campo do nome
//   offgrid:aviso-edicao    { texto }                            (emite) recado para a faixa de instrução
//   offgrid:apagar-da-casa                                       (ouve) botão "Apagar parede" ou "Remover varanda" do painel

import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { acoes, assinar, estado, type ModoVisao } from '../estado';
import type { CasaConfig, LadoCasa, Obstaculo, ParedeInterna, Varanda } from '../nucleo/tipos';
import type { CamadaDeCabos } from './cabos';
import { alturasDoAndar, vaoDaEscada } from './casa';
import type { Marca } from './malha';
import {
  alternarPassagem, atravessa, avisoDoQuartinho, comprimentoDaParede, distanciaDaParede, LADOS, LARGURA_DA_PASSAGEM, limparComodos, naPlanta, novaVaranda,
  paralelaAX, paredeEntre, paredeEsticada, paredeMovida, type Ponto, quartinhoEm, varandaComPonta, varandaComProfundidade, varandaSobreOQuartinho,
} from './regrasDaCasa';
import { NOME_DO_OBSTACULO, obstaculoEm, obstaculoLivre } from './regrasDosObstaculos';
import { medirVarandas, naFachada, paraACasa } from './varanda';

export interface PartesDaEdicao {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controles: OrbitControls;
  casa: THREE.Group;
  superficies(): THREE.Mesh[];
  cabos: CamadaDeCabos;
  pedirQuadroLeve(): void;
  naTela(pontoNaCasa: THREE.Vector3): [number, number];
}

export interface Edicao {
  /** Para o roteiro de verificação: o que o ponteiro está fazendo na edição da casa e se soltar agora daria certo. */
  situacao(): { modo: string; valido: boolean | null; motivo: string | null };
  /** Posição na janela de uma alça: `nova-{lado}`, `borda-{lado}`, `ponta-{lado}-a`, `ponta-{lado}-b`, `parede-de`, `parede-para`. */
  telaDaAlca(id: string): [x: number, y: number] | null;
  destruir(): void;
}

type Alvo =
  | { tipo: 'alca-nova'; lado: LadoCasa }
  | { tipo: 'alca-borda'; lado: LadoCasa; y: number }
  | { tipo: 'alca-ponta'; lado: LadoCasa; ponta: -1 | 1; y: number }
  | { tipo: 'varanda'; lado: LadoCasa }
  | { tipo: 'quartinho'; y: number }
  | { tipo: 'obstaculo'; uid: string; y: number }
  | { tipo: 'ponta-parede'; uid: string; ponta: 'de' | 'para'; y: number }
  | { tipo: 'parede'; uid: string; d: number; y: number }
  | { tipo: 'piso'; x: number; z: number };

/** Ponto de retorno de um arraste: a casa como estava e se o histórico já foi marcado. */
interface Arraste {
  inicio: string;
  marcado: boolean;
}

type Modo =
  | { tipo: 'ocioso' }
  /** Botão apertado, ainda sem passar dos 4 px. */
  | { tipo: 'apertado'; x: number; y: number; alvo: Alvo | null }
  /** Arraste que não é da edição: a órbita da câmera. */
  | { tipo: 'alheio' }
  | ({ tipo: 'quartinho'; y: number; desvio: Ponto; valido: boolean } & Arraste)
  | ({ tipo: 'obstaculo'; uid: string; y: number; desvio: Ponto; valido: boolean } & Arraste)
  | ({ tipo: 'profundidade'; lado: LadoCasa; base: Varanda; y: number; valido: boolean } & Arraste)
  | ({ tipo: 'ponta-varanda'; lado: LadoCasa; ponta: -1 | 1; base: Varanda; y: number; valido: boolean } & Arraste)
  | { tipo: 'desenhar'; de: Ponto; parede: { de: Ponto; para: Ponto } | null; motivo: string | null }
  | ({ tipo: 'mover-parede'; base: ParedeInterna; y: number; desvio: number; cruzava: boolean; valido: boolean } & Arraste)
  | ({ tipo: 'esticar'; base: ParedeInterna; ponta: 'de' | 'para'; y: number; cruzava: boolean; valido: boolean } & Arraste);

interface Alca {
  id: string;
  alvo: Alvo;
  /** Em coordenadas da casa. */
  pos: THREE.Vector3;
  sprite: THREE.Sprite;
  /** Meia largura e meia altura na tela, em pixels. */
  meiaL: number;
  meiaA: number;
}

const LIMIAR_DE_ARRASTE = 4;
const COR_VALIDO = '#2fbf71';
const COR_INVALIDO = '#e5484d';
const COR_SELECAO = '#ffc21a';
const COR_SOBRE = '#3d9bff';
const ESPESSURA_INTERNA = 0.1;
const ESPESSURA_DE_FORA = 0.15;

const NOME_DO_LADO: Record<LadoCasa, string> = { frente: 'da frente', fundos: 'dos fundos', esquerda: 'da esquerda', direita: 'da direita' };

const metros = (v: number, casas = 1): string => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

/** Desenho de uma alça: botão "+ Varanda", ou um botão redondo com a cor dada. */
function texturaDaAlca(tipo: 'nova' | 'redonda', cor: string): { textura: THREE.CanvasTexture; largura: number; altura: number } {
  const escala = 2;
  const [largura, altura] = tipo === 'nova' ? [96, 28] : [22, 22];
  const cv = document.createElement('canvas');
  cv.width = largura * escala;
  cv.height = altura * escala;
  const g = cv.getContext('2d')!;
  g.scale(escala, escala);
  if (tipo === 'nova') {
    g.fillStyle = cor;
    g.beginPath();
    g.roundRect(1.5, 1.5, largura - 3, altura - 3, 13);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 14px system-ui, "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('+ Varanda', largura / 2, altura / 2 + 1);
  } else {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(largura / 2, altura / 2, largura / 2 - 1.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = cor;
    g.beginPath();
    g.arc(largura / 2, altura / 2, largura / 2 - 5, 0, Math.PI * 2);
    g.fill();
  }
  const textura = new THREE.CanvasTexture(cv);
  textura.colorSpace = THREE.SRGBColorSpace;
  return { textura, largura, altura };
}

export function criarEdicao(c: PartesDaEdicao): Edicao {
  let modo: Modo = { tipo: 'ocioso' };
  const raio = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const semRaio = (): void => {};

  // ---------------------------------------------------------------- Medida perto do ponteiro

  const dica = document.createElement('div');
  dica.setAttribute('role', 'status');
  dica.dataset.offgridMedida = '';
  Object.assign(dica.style, {
    position: 'fixed', zIndex: '1000', pointerEvents: 'none', display: 'none', maxWidth: '280px',
    padding: '5px 9px', borderRadius: '8px', font: '600 13px system-ui, "Segoe UI", Arial, sans-serif', lineHeight: '1.3',
    color: '#ffffff', background: '#1f2933', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(dica);
  const TOM = { neutro: '#1f2933', bom: '#1b7f4b', ruim: '#b3261e' };

  function mostrarDica(texto: string | null, x = 0, y = 0, tom: keyof typeof TOM = 'neutro'): void {
    if (texto === null) {
      dica.style.display = 'none';
      return;
    }
    if (dica.textContent !== texto) dica.textContent = texto;
    dica.style.background = TOM[tom];
    dica.style.display = 'block';
    const l = dica.offsetWidth;
    const a = dica.offsetHeight;
    dica.style.left = `${Math.max(4, Math.min(window.innerWidth - l - 4, x + 16))}px`;
    dica.style.top = `${Math.max(4, Math.min(window.innerHeight - a - 4, y + 18))}px`;
  }

  /** Recado na faixa de instrução, no alto da cena. */
  function avisarNaFaixa(texto: string): void {
    window.dispatchEvent(new CustomEvent('offgrid:aviso-edicao', { detail: { texto } }));
  }

  // ---------------------------------------------------------------- Raio do ponteiro e pontos da casa

  function mirar(x: number, y: number): boolean {
    const r = c.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    c.camera.updateMatrixWorld();
    c.casa.updateWorldMatrix(true, false);
    raio.setFromCamera(ndc, c.camera);
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  const sobreACena = (x: number, y: number): boolean => document.elementFromPoint(x, y) === c.canvas;
  const inversa = new THREE.Matrix4();
  const paraACasaDoMundo = (p: THREE.Vector3): THREE.Vector3 => p.clone().applyMatrix4(inversa.copy(c.casa.matrixWorld).invert());
  const plano = new THREE.Plane();
  const noPlano = new THREE.Vector3();

  /** Ponto da casa, na altura dada, sob o ponteiro. Nulo quando o ponteiro aponta para o céu. */
  function pontoNaAltura(x: number, y: number, altura: number): Ponto | null {
    mirar(x, y);
    plano.set(new THREE.Vector3(0, 1, 0), -altura);
    if (!raio.ray.intersectPlane(plano, noPlano)) return null;
    const p = paraACasaDoMundo(noPlano);
    return [p.x, p.z];
  }

  /** Quantos metros valem um pixel da tela, a esta distância da câmera. */
  function metrosPorPixel(distancia: number): number {
    return (2 * distancia * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
  }

  const paredesDoAndar = (): ParedeInterna[] => estado.projeto.casa.paredesInternas.filter((p) => p.andar === estado.edicaoCasa.andar);
  const paredeDe = (uid: string): ParedeInterna | undefined => estado.projeto.casa.paredesInternas.find((p) => p.uid === uid);
  const obstaculoDe = (uid: string): Obstaculo | undefined => (estado.projeto.obstaculos ?? []).find((o) => o.uid === uid);
  /** Medidas de um obstáculo no chão, antes do giro: na árvore, o quadrado em volta da copa. */
  const ladosDe = (o: Obstaculo): [largura: number, profundidade: number, giro: number] =>
    o.tipo === 'arvore' ? [o.largura, o.largura, 0] : [o.largura, o.profundidade, THREE.MathUtils.degToRad(o.giro)];

  /** Trecho da parede que aparece: as pontas que vão até o limite da planta ficam dentro da parede de fora. */
  function trechoAVista(p: ParedeInterna): [d0: number, d1: number] {
    const casa = estado.projeto.casa;
    const i = paralelaAX(p) ? 0 : 1;
    const lim = (i === 0 ? casa.largura : casa.profundidade) / 2;
    const noLimite = (v: number): boolean => Math.abs(Math.abs(v) - lim) < 1e-6;
    const comp = comprimentoDaParede(p);
    return [noLimite(p.de[i]) ? ESPESSURA_DE_FORA : 0, comp - (noLimite(p.para[i]) ? ESPESSURA_DE_FORA : 0)];
  }

  /** Ponto da parede a `d` metros da ponta `de`. */
  function pontoDaParede(p: Pick<ParedeInterna, 'de' | 'para'>, d: number): Ponto {
    const comp = Math.hypot(p.para[0] - p.de[0], p.para[1] - p.de[1]) || 1;
    return [p.de[0] + ((p.para[0] - p.de[0]) * d) / comp, p.de[1] + ((p.para[1] - p.de[1]) * d) / comp];
  }

  // ---------------------------------------------------------------- Desenho por cima da casa: alças, contornos e fantasmas

  const camada = new THREE.Group();
  camada.name = 'edicao-da-casa';
  c.casa.add(camada);
  /** O que é refeito a cada mudança (alças, contornos, volumes de clique). */
  const variavel = new THREE.Group();
  camada.add(variavel);

  const geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  const porCima = { depthTest: false, depthWrite: false, transparent: true, toneMapped: false } as const;
  const matSelecao = new THREE.MeshBasicMaterial({ color: COR_SELECAO, opacity: 0.95, ...porCima });
  const matSobre = new THREE.MeshBasicMaterial({ color: COR_SOBRE, opacity: 0.8, ...porCima });
  const matFantasma = new THREE.MeshBasicMaterial({ color: COR_VALIDO, opacity: 0.55, ...porCima });
  const matInvisivel = new THREE.MeshBasicMaterial({ visible: false });
  const desenhos = {
    nova: texturaDaAlca('nova', '#1b7f4b'),
    varanda: texturaDaAlca('redonda', '#1565c0'),
    parede: texturaDaAlca('redonda', '#e08a00'),
  };
  const matAlca = {
    nova: new THREE.SpriteMaterial({ map: desenhos.nova.textura, sizeAttenuation: false, ...porCima }),
    varanda: new THREE.SpriteMaterial({ map: desenhos.varanda.textura, sizeAttenuation: false, ...porCima }),
    parede: new THREE.SpriteMaterial({ map: desenhos.parede.textura, sizeAttenuation: false, ...porCima }),
  };

  /** Fantasma de parede (ao desenhar, ou no lugar que não serve) e do quartinho em lugar que não serve. */
  const fantasma = new THREE.Mesh(geoCaixa, matFantasma);
  fantasma.name = 'fantasma-da-edicao';
  fantasma.renderOrder = 14;
  fantasma.visible = false;
  fantasma.raycast = semRaio;
  camada.add(fantasma);

  let alcas: Alca[] = [];
  /** Volumes invisíveis que respondem ao raio: o quartinho e as varandas. */
  let volumes: THREE.Mesh[] = [];
  /** O que está sob o ponteiro parado, para acender. */
  let sobre: string | null = null;

  function caixa(material: THREE.Material, cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, ordem = 15): THREE.Mesh {
    const m = new THREE.Mesh(geoCaixa, material);
    m.position.set(cx, cy, cz);
    m.scale.set(lx, ly, lz);
    m.renderOrder = ordem;
    m.raycast = semRaio;
    return m;
  }

  /** Contorno de um retângulo deitado, com barras de espessura real (a linha de 1 px some de longe). */
  function contorno(material: THREE.Material, lx: number, lz: number, y: number, espessura = 0.07): THREE.Group {
    const g = new THREE.Group();
    const e = espessura;
    g.add(
      caixa(material, 0, y, -lz / 2, lx + e, e, e),
      caixa(material, 0, y, lz / 2, lx + e, e, e),
      caixa(material, -lx / 2, y, 0, e, e, lz - e),
      caixa(material, lx / 2, y, 0, e, e, lz - e),
    );
    return g;
  }

  function alca(id: string, alvo: Alvo, tipo: keyof typeof matAlca, pos: THREE.Vector3): void {
    const sprite = new THREE.Sprite(matAlca[tipo]);
    sprite.position.copy(pos);
    sprite.renderOrder = 20;
    sprite.raycast = semRaio;
    variavel.add(sprite);
    alcas.push({ id, alvo, pos, sprite, meiaL: desenhos[tipo].largura / 2, meiaA: desenhos[tipo].altura / 2 });
  }

  /** As alças têm o mesmo tamanho na tela a qualquer distância: a escala depende só da altura da tela. */
  function ajustarAlcas(): void {
    const porPixel = (2 * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
    for (const a of alcas) a.sprite.scale.set(2 * a.meiaL * porPixel, 2 * a.meiaA * porPixel, 1);
  }

  function volume(alvo: Alvo, cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, giro = 0): void {
    const m = new THREE.Mesh(geoCaixa, matInvisivel);
    m.position.set(cx, cy, cz);
    m.scale.set(lx, ly, lz);
    m.rotation.y = giro;
    m.userData.edicao = alvo;
    variavel.add(m);
    volumes.push(m);
  }

  function barraDaParede(p: Pick<ParedeInterna, 'de' | 'para'>, material: THREE.Material, y: number, altura: number, largura: number, d0 = 0, d1 = Infinity): THREE.Mesh {
    const comp = Math.hypot(p.para[0] - p.de[0], p.para[1] - p.de[1]);
    const a = Math.max(0, d0);
    const b = Math.min(comp, d1);
    const [mx, mz] = pontoDaParede(p, (a + b) / 2);
    const x = paralelaAX(p);
    return caixa(material, mx, y, mz, x ? b - a : largura, altura, x ? largura : b - a);
  }

  function refazer(): void {
    sujo = false;
    variavel.clear();
    alcas = [];
    volumes = [];
    if (!estado.edicaoCasa.ativa) {
      c.pedirQuadroLeve();
      return;
    }
    const casa = estado.projeto.casa;
    const s = estado.selecao;

    // ---- Quartinho: volume de clique e contorno quando está sob o ponteiro ou selecionado.
    const q = casa.quartinho;
    const giro = THREE.MathUtils.degToRad(q.giro);
    const alturaQ = q.altura + 0.75;
    volume({ tipo: 'quartinho', y: 0 }, q.x, alturaQ / 2, q.z, q.largura + 0.4, alturaQ, q.profundidade + 0.4, giro);
    const quartinhoAceso = s?.tipo === 'quartinho' || sobre === 'quartinho' || modo.tipo === 'quartinho';
    if (quartinhoAceso) {
      // Na altura do telhado: é ele que aparece na vista de cima.
      const g = contorno(s?.tipo === 'quartinho' || modo.tipo === 'quartinho' ? matSelecao : matSobre, q.largura + 0.5, q.profundidade + 0.5, q.altura + 0.3);
      g.position.set(q.x, 0, q.z);
      g.rotation.y = giro;
      variavel.add(g);
    }

    // ---- Obstáculos (muro, vizinho, árvore): volume de clique e contorno no alto, como o quartinho.
    for (const o of estado.projeto.obstaculos ?? []) {
      const [lx, lz, giroDoObstaculo] = ladosDe(o);
      // Muro fino: o volume de clique tem pelo menos 0,6 m, para ser agarrado na vista de cima.
      volume({ tipo: 'obstaculo', uid: o.uid, y: 0 }, o.x, o.altura / 2, o.z, Math.max(lx, 0.6), o.altura, Math.max(lz, 0.6), giroDoObstaculo);
      const selecionado = (s?.tipo === 'obstaculo' && s.uid === o.uid) || (modo.tipo === 'obstaculo' && modo.uid === o.uid);
      if (!selecionado && sobre !== `obstaculo-${o.uid}`) continue;
      const g = contorno(selecionado ? matSelecao : matSobre, Math.max(lx, 0.3) + 0.2, Math.max(lz, 0.3) + 0.2, o.altura + 0.05, 0.09);
      g.position.set(o.x, 0, o.z);
      g.rotation.y = giroDoObstaculo;
      variavel.add(g);
    }

    // ---- Varandas: em cada fachada, o botão de criar ou as alças da borda de fora e das pontas.
    const medidas = medirVarandas(casa);
    for (const lado of LADOS) {
      const m = medidas.find((v) => v.lado === lado);
      if (!m) {
        const [x, z] = paraACasa(casa, lado, 0, 1.7);
        alca(`nova-${lado}`, { tipo: 'alca-nova', lado }, 'nova', new THREE.Vector3(x, 0.4, z));
        continue;
      }
      const p = m.planta;
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      volume({ tipo: 'varanda', lado }, cx, m.yParede / 2, cz, p.x1 - p.x0, m.yParede, p.z1 - p.z0);
      const yBeira = m.yParede - m.profundidade * m.inclinacao;
      const yMeio = m.yParede - (m.profundidade / 2) * m.inclinacao;
      const selecionada = s?.tipo === 'varanda' && s.lado === lado;
      if (selecionada || sobre === `varanda-${lado}`) {
        const g = contorno(selecionada ? matSelecao : matSobre, p.x1 - p.x0, p.z1 - p.z0, yMeio);
        g.position.set(cx, 0, cz);
        variavel.add(g);
      }
      const meio = (m.x0 + m.x1) / 2;
      const [bx, bz] = paraACasa(casa, lado, meio, m.profundidade);
      alca(`borda-${lado}`, { tipo: 'alca-borda', lado, y: yBeira }, 'varanda', new THREE.Vector3(bx, yBeira, bz));
      for (const [ponta, t, nome] of [[-1, m.x0, 'a'], [1, m.x1, 'b']] as const) {
        const [px, pz] = paraACasa(casa, lado, t, m.profundidade / 2);
        alca(`ponta-${lado}-${nome}`, { tipo: 'alca-ponta', lado, ponta, y: yMeio }, 'varanda', new THREE.Vector3(px, yMeio, pz));
      }
    }

    // ---- Paredes internas do andar: a selecionada e a que está sob o ponteiro acendem, com as pontas à mostra.
    const { yTeto } = alturasDoAndar(casa, estado.edicaoCasa.andar);
    for (const p of paredesDoAndar()) {
      const selecionada = s?.tipo === 'parede' && s.uid === p.uid;
      if (!selecionada && sobre !== `parede-${p.uid}`) continue;
      const [d0, d1] = trechoAVista(p);
      // A barra acende a parede e deixa as passagens abertas.
      const cortes = [d0, ...[...p.passagens].sort((a, b) => a - b).flatMap((d) => [d - LARGURA_DA_PASSAGEM / 2, d + LARGURA_DA_PASSAGEM / 2]), d1];
      for (let i = 0; i + 1 < cortes.length; i += 2) {
        if (cortes[i + 1]! - cortes[i]! > 0.02) variavel.add(barraDaParede(p, selecionada ? matSelecao : matSobre, yTeto + 0.02, 0.04, ESPESSURA_INTERNA + 0.06, cortes[i], cortes[i + 1]));
      }
      if (!selecionada) continue;
      for (const [ponta, d] of [['de', d0], ['para', d1]] as const) {
        const [x, z] = pontoDaParede(p, d);
        alca(`parede-${ponta}`, { tipo: 'ponta-parede', uid: p.uid, ponta, y: yTeto }, 'parede', new THREE.Vector3(x, yTeto + 0.02, z));
      }
    }
    ajustarAlcas();
    // A casa cresceu (varanda nova, quartinho mais longe): a vista de cima acompanha, se ninguém mexeu na câmera.
    if (modo.tipo === 'ocioso' && enquadrado && c.camera.position.distanceTo(enquadrado) < 1e-3) verDeCima();
    c.pedirQuadroLeve();
  }

  let sujo = false;
  /** A casa é refeita por outro ouvinte do mesmo aviso: espera ela terminar. */
  function pedirRefazer(): void {
    if (sujo) return;
    sujo = true;
    queueMicrotask(() => {
      if (sujo) refazer();
    });
  }

  function mostrarFantasmaDeParede(p: { de: Ponto; para: Ponto }, valido: boolean): void {
    const { yPe, yTeto } = alturasDoAndar(estado.projeto.casa, estado.edicaoCasa.andar);
    const comp = Math.max(0.05, Math.hypot(p.para[0] - p.de[0], p.para[1] - p.de[1]));
    const x = Math.abs(p.para[0] - p.de[0]) >= Math.abs(p.para[1] - p.de[1]);
    fantasma.position.set((p.de[0] + p.para[0]) / 2, (yPe + yTeto) / 2, (p.de[1] + p.para[1]) / 2);
    fantasma.rotation.y = 0;
    fantasma.scale.set(x ? comp : ESPESSURA_INTERNA + 0.02, yTeto - yPe, x ? ESPESSURA_INTERNA + 0.02 : comp);
    matFantasma.color.set(valido ? COR_VALIDO : COR_INVALIDO);
    fantasma.visible = true;
    c.pedirQuadroLeve();
  }

  function mostrarFantasmaDoQuartinho(q: CasaConfig['quartinho']): void {
    fantasma.position.set(q.x, (q.altura + 0.4) / 2, q.z);
    fantasma.rotation.y = THREE.MathUtils.degToRad(q.giro);
    fantasma.scale.set(q.largura + 0.1, q.altura + 0.4, q.profundidade + 0.1);
    matFantasma.color.set(COR_INVALIDO);
    fantasma.visible = true;
    c.pedirQuadroLeve();
  }

  function mostrarFantasmaDoObstaculo(o: Obstaculo): void {
    const [lx, lz, giro] = ladosDe(o);
    fantasma.position.set(o.x, o.altura / 2, o.z);
    fantasma.rotation.y = giro;
    fantasma.scale.set(lx + 0.05, o.altura, lz + 0.05);
    matFantasma.color.set(COR_INVALIDO);
    fantasma.visible = true;
    c.pedirQuadroLeve();
  }

  function esconderFantasma(): void {
    if (!fantasma.visible) return;
    fantasma.visible = false;
    c.pedirQuadroLeve();
  }

  // ---------------------------------------------------------------- O que está sob o ponteiro

  /** Parede tocada no ponto (x, z): a ponta, se o toque foi perto de uma, ou o corpo. */
  function alvoDaParede(p: ParedeInterna, x: number, z: number, y: number, mpp: number): Alvo {
    const { d } = distanciaDaParede(p, x, z);
    const [d0, d1] = trechoAVista(p);
    const alcance = Math.min(Math.max(0.3, 12 * mpp), (d1 - d0) / 3);
    if (d <= d0 + alcance) return { tipo: 'ponta-parede', uid: p.uid, ponta: 'de', y };
    if (d >= d1 - alcance) return { tipo: 'ponta-parede', uid: p.uid, ponta: 'para', y };
    return { tipo: 'parede', uid: p.uid, d, y };
  }

  function alvoSob(x: number, y: number): Alvo | null {
    if (!sobreACena(x, y) || !mirar(x, y)) return null;
    // As alças ficam por cima de tudo e têm tamanho fixo na tela: valem pela distância em pixels.
    ajustarAlcas();
    let melhor: Alca | null = null;
    let menor = Infinity;
    for (const a of alcas) {
      const [sx, sy] = c.naTela(a.pos);
      const dx = Math.abs(x - sx);
      const dy = Math.abs(y - sy);
      if (dx > a.meiaL + 4 || dy > a.meiaA + 4) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < menor) {
        menor = dist;
        melhor = a;
      }
    }
    if (melhor) return melhor.alvo;

    const t = raio.intersectObjects([...volumes, ...c.superficies()], false)[0];
    if (!t) return null;
    const p = paraACasaDoMundo(t.point);
    const doVolume = t.object.userData.edicao as Alvo | undefined;
    if (doVolume) return doVolume.tipo === 'quartinho' ? { tipo: 'quartinho', y: p.y } : doVolume.tipo === 'obstaculo' ? { ...doVolume, y: p.y } : doVolume;
    const id = (t.object.userData.superficie as Marca | undefined)?.id ?? '';
    const andar = estado.edicaoCasa.andar;
    const mpp = metrosPorPixel(t.distance);
    if (id.startsWith('parede-interna-')) {
      const parede = paredeDe(id.slice('parede-interna-'.length));
      return parede && parede.andar === andar ? alvoDaParede(parede, p.x, p.z, p.y, mpp) : null;
    }
    if (id !== (andar === 0 ? 'piso-terreo' : 'piso-superior') || !naPlanta(estado.projeto.casa, p.x, p.z)) return null;
    // No piso, bem junto de uma parede: vale a parede (vista de cima ela tem poucos pixels de largura).
    let perto: ParedeInterna | null = null;
    let distancia = Math.max(ESPESSURA_INTERNA / 2 + 0.03, 6 * mpp);
    for (const w of paredesDoAndar()) {
      const r = distanciaDaParede(w, p.x, p.z);
      if (r.distancia < distancia) {
        distancia = r.distancia;
        perto = w;
      }
    }
    return perto ? alvoDaParede(perto, p.x, p.z, p.y, mpp) : { tipo: 'piso', x: p.x, z: p.z };
  }

  const chaveDoAlvo = (a: Alvo | null): string | null =>
    !a ? null
    : a.tipo === 'quartinho' ? 'quartinho'
    : a.tipo === 'obstaculo' ? `obstaculo-${a.uid}`
    : a.tipo === 'parede' || a.tipo === 'ponta-parede' ? `parede-${a.uid}`
    : a.tipo === 'varanda' || a.tipo === 'alca-borda' || a.tipo === 'alca-ponta' ? `varanda-${a.lado}`
    : null;

  function pairar(x: number, y: number): void {
    const alvo = alvoSob(x, y);
    const chave = chaveDoAlvo(alvo);
    if (chave !== sobre) {
      sobre = chave;
      refazer();
    }
    const selecionada = alvo?.tipo === 'parede' && estado.selecao?.tipo === 'parede' && estado.selecao.uid === alvo.uid;
    const texto =
      !alvo ? null
      : alvo.tipo === 'alca-nova' ? `Clique para criar uma varanda na fachada ${NOME_DO_LADO[alvo.lado]}`
      : alvo.tipo === 'alca-borda' ? 'Arraste para mudar a profundidade da varanda'
      : alvo.tipo === 'alca-ponta' ? 'Arraste para mudar a largura da varanda'
      : alvo.tipo === 'varanda' ? 'Clique para ver as medidas da varanda'
      : alvo.tipo === 'quartinho' ? 'Arraste para mudar o quartinho de lugar'
      : alvo.tipo === 'obstaculo' ? `${NOME_DO_OBSTACULO[obstaculoDe(alvo.uid)?.tipo ?? 'muro']}: arraste para mudar de lugar, clique para ver as medidas`
      : alvo.tipo === 'ponta-parede' ? 'Arraste a ponta para encurtar ou esticar a parede'
      : alvo.tipo === 'parede' ? (selecionada ? 'Clique para pôr ou tirar uma passagem aqui. Arraste para mover a parede.' : 'Arraste para mover a parede. Clique para selecionar.')
      : 'Arraste para desenhar uma parede. Clique para dar nome ao cômodo.';
    mostrarDica(texto, x, y);
    c.canvas.style.cursor =
      !alvo ? ''
      : alvo.tipo === 'piso' ? 'crosshair'
      : alvo.tipo === 'alca-nova' || alvo.tipo === 'varanda' ? 'pointer'
      : 'grab';
  }

  function limparPairar(): void {
    mostrarDica(null);
    c.canvas.style.cursor = '';
    if (sobre !== null) {
      sobre = null;
      refazer();
    }
  }

  // ---------------------------------------------------------------- Arrastes

  /** A casa e os obstáculos como estão, para saber se um arraste mudou alguma coisa. */
  const retrato = (): string => JSON.stringify([estado.projeto.casa, estado.projeto.obstaculos ?? []]);
  const arraste = (): Arraste => ({ inicio: retrato(), marcado: false });

  /** Marca o ponto de desfazer do arraste, uma vez só, na primeira mudança. */
  function marcar(m: Arraste): void {
    if (m.marcado) return;
    m.marcado = true;
    acoes.marcarHistorico();
    c.cabos.adiarComprimentos(true);
  }

  /** Tira do projeto os cômodos que uma mudança de parede deixou sem lugar e avisa na faixa. */
  function arrumarComodos(): void {
    const casa = estado.projeto.casa;
    const r = limparComodos(casa);
    if (r.comodos === casa.comodos) return;
    acoes.alterarCasa({ comodos: r.comodos }, { historico: false });
    const recados = [
      ...r.juntados.map((j) => `Os cômodos "${j.ficou}" e "${j.saiu}" viraram um só: ficou o nome "${j.ficou}".`),
      ...r.removidos.map((nome) => `O nome "${nome}" foi tirado: o lugar dele ficou dentro de uma parede.`),
    ];
    avisarNaFaixa(recados.join(' '));
  }

  function comecar(alvo: Alvo, x: number, y: number): void {
    const casa = estado.projeto.casa;
    if (alvo.tipo === 'quartinho') {
      const p = pontoNaAltura(x, y, alvo.y);
      if (!p) return void (modo = { tipo: 'alheio' });
      modo = { tipo: 'quartinho', y: alvo.y, desvio: [casa.quartinho.x - p[0], casa.quartinho.z - p[1]], valido: true, ...arraste() };
      if (estado.selecao?.tipo !== 'quartinho') acoes.selecionar({ tipo: 'quartinho' });
    } else if (alvo.tipo === 'obstaculo') {
      const o = obstaculoDe(alvo.uid);
      const p = pontoNaAltura(x, y, alvo.y);
      if (!o || !p) return void (modo = { tipo: 'alheio' });
      modo = { tipo: 'obstaculo', uid: o.uid, y: alvo.y, desvio: [o.x - p[0], o.z - p[1]], valido: true, ...arraste() };
      if (estado.selecao?.tipo !== 'obstaculo' || estado.selecao.uid !== o.uid) acoes.selecionar({ tipo: 'obstaculo', uid: o.uid });
    } else if (alvo.tipo === 'alca-borda' || alvo.tipo === 'alca-ponta') {
      const base = casa.varandas.find((v) => v.lado === alvo.lado);
      if (!base) return void (modo = { tipo: 'alheio' });
      modo = alvo.tipo === 'alca-borda'
        ? { tipo: 'profundidade', lado: alvo.lado, base, y: alvo.y, valido: true, ...arraste() }
        : { tipo: 'ponta-varanda', lado: alvo.lado, ponta: alvo.ponta, base, y: alvo.y, valido: true, ...arraste() };
      if (estado.selecao?.tipo !== 'varanda' || estado.selecao.lado !== alvo.lado) acoes.selecionar({ tipo: 'varanda', lado: alvo.lado });
    } else if (alvo.tipo === 'parede' || alvo.tipo === 'ponta-parede') {
      const base = paredeDe(alvo.uid);
      const p = pontoNaAltura(x, y, alvo.y);
      if (!base || !p) return void (modo = { tipo: 'alheio' });
      const vao = vaoDaEscada(casa, base.andar);
      const cruzava = vao !== null && atravessa(base, vao);
      modo = alvo.tipo === 'parede'
        ? { tipo: 'mover-parede', base, y: alvo.y, desvio: (paralelaAX(base) ? base.de[1] - p[1] : base.de[0] - p[0]), cruzava, valido: true, ...arraste() }
        : { tipo: 'esticar', base, ponta: alvo.ponta, y: alvo.y, cruzava, valido: true, ...arraste() };
      if (estado.selecao?.tipo !== 'parede' || estado.selecao.uid !== base.uid) acoes.selecionar({ tipo: 'parede', uid: base.uid });
    } else if (alvo.tipo === 'piso') {
      modo = { tipo: 'desenhar', de: [alvo.x, alvo.z], parede: null, motivo: null };
      if (estado.selecao) acoes.selecionar(null);
    } else {
      // Botão de criar varanda ou o corpo de uma varanda: não se arrasta; vale como clique ao soltar.
      return;
    }
    mostrarDica(null);
    c.canvas.style.cursor = modo.tipo === 'desenhar' ? 'crosshair' : 'grabbing';
  }

  function atualizarQuartinho(m: Modo & { tipo: 'quartinho' }, x: number, y: number): void {
    const p = pontoNaAltura(x, y, m.y);
    if (!p) return;
    const casa = estado.projeto.casa;
    const novo = quartinhoEm(casa.quartinho, p[0] + m.desvio[0], p[1] + m.desvio[1]);
    m.valido = avisoDoQuartinho({ ...casa, quartinho: novo }) === null;
    if (!m.valido) {
      // O quartinho fica no último lugar válido; o vulto vermelho mostra o lugar pedido.
      mostrarFantasmaDoQuartinho(novo);
      mostrarDica('Aqui não dá: o quartinho ficaria em cima da casa ou de uma varanda', x, y, 'ruim');
      return;
    }
    esconderFantasma();
    mostrarDica(`Quartinho em x ${metros(novo.x)} m, z ${metros(novo.z)} m`, x, y, 'bom');
    if (novo.x === casa.quartinho.x && novo.z === casa.quartinho.z) return;
    marcar(m);
    acoes.alterarCasa({ quartinho: novo }, { historico: false });
  }

  function atualizarObstaculo(m: Modo & { tipo: 'obstaculo' }, x: number, y: number): void {
    const p = pontoNaAltura(x, y, m.y);
    const atual = obstaculoDe(m.uid);
    if (!p || !atual) return;
    const novo = obstaculoEm(atual, p[0] + m.desvio[0], p[1] + m.desvio[1]);
    m.valido = obstaculoLivre(estado.projeto.casa, novo);
    if (!m.valido) {
      // O obstáculo fica no último lugar válido; o vulto vermelho mostra o lugar pedido.
      mostrarFantasmaDoObstaculo(novo);
      mostrarDica('Aqui não dá: ficaria em cima da casa, de uma varanda ou do quartinho', x, y, 'ruim');
      return;
    }
    esconderFantasma();
    mostrarDica(`${NOME_DO_OBSTACULO[novo.tipo]} em x ${metros(novo.x)} m, z ${metros(novo.z)} m`, x, y, 'bom');
    if (novo.x === atual.x && novo.z === atual.z) return;
    marcar(m);
    acoes.alterarObstaculo(m.uid, { x: novo.x, z: novo.z }, { historico: false });
  }

  /** Tecla R: gira 90° o muro ou o vizinho selecionado, se couber girado. */
  function girarObstaculo(): void {
    const s = estado.selecao;
    const o = s?.tipo === 'obstaculo' ? obstaculoDe(s.uid) : undefined;
    if (!o || o.tipo === 'arvore') return;
    let giro = (((o.giro + 90) % 360) + 360) % 360;
    if (giro > 180) giro -= 360;
    if (obstaculoLivre(estado.projeto.casa, { ...o, giro })) acoes.alterarObstaculo(o.uid, { giro });
    else avisarNaFaixa(`Girado, o ${o.tipo === 'muro' ? 'muro' : 'vizinho'} ficaria em cima da casa, de uma varanda ou do quartinho. Afaste-o primeiro.`);
  }

  function atualizarVaranda(m: Modo & { tipo: 'profundidade' | 'ponta-varanda' }, x: number, y: number): void {
    const p = pontoNaAltura(x, y, m.y);
    if (!p) return;
    const casa = estado.projeto.casa;
    const [ao, fora] = naFachada(casa, m.lado, p[0], p[1]);
    const nova = m.tipo === 'profundidade' ? varandaComProfundidade(m.base, fora, casa) : varandaComPonta(m.base, m.ponta, ao, casa);
    // A varanda não cresce para cima do quartinho: fica no último tamanho que cabe.
    m.valido = !varandaSobreOQuartinho(casa, nova) || varandaSobreOQuartinho(casa, m.base);
    if (!m.valido) {
      mostrarDica('Aqui não dá: a varanda ficaria em cima do quartinho. Mude o quartinho de lugar primeiro.', x, y, 'ruim');
      return;
    }
    if (m.tipo === 'profundidade') {
      const cortada = nova.inclinacaoPct < m.base.inclinacaoPct ? ' (reduzida para a beira do telhado não ficar abaixo de 2 m)' : '';
      mostrarDica(`Profundidade ${metros(nova.profundidade)} m, inclinação ${nova.inclinacaoPct}%${cortada}`, x, y, 'bom');
    } else {
      mostrarDica(nova.largura === null ? 'Fachada inteira' : `Largura ${metros(nova.largura)} m`, x, y, 'bom');
    }
    const atual = casa.varandas.find((v) => v.lado === m.lado);
    if (JSON.stringify(atual) === JSON.stringify(nova)) return;
    marcar(m);
    acoes.definirVaranda(nova, { historico: false });
  }

  function atualizarParede(m: Modo & { tipo: 'mover-parede' | 'esticar' }, x: number, y: number): void {
    const p = pontoNaAltura(x, y, m.y);
    const atual = paredeDe(m.base.uid);
    if (!p || !atual) return;
    const casa = estado.projeto.casa;
    const aoLongoDeX = paralelaAX(m.base);
    const nova = m.tipo === 'mover-parede'
      ? { ...paredeMovida(m.base, (aoLongoDeX ? p[1] : p[0]) + m.desvio, casa), passagens: m.base.passagens }
      : paredeEsticada(m.base, m.ponta, aoLongoDeX ? p[0] : p[1], casa);
    const vao = vaoDaEscada(casa, m.base.andar);
    m.valido = m.cruzava || vao === null || !atravessa(nova, vao);
    if (!m.valido) {
      mostrarFantasmaDeParede(nova, false);
      mostrarDica('Aqui não dá: a parede passaria por cima da escada', x, y, 'ruim');
      return;
    }
    esconderFantasma();
    mostrarDica(`Parede de ${metros(comprimentoDaParede(nova))} m`, x, y, 'bom');
    if (JSON.stringify([atual.de, atual.para, atual.passagens]) === JSON.stringify([nova.de, nova.para, nova.passagens])) return;
    marcar(m);
    acoes.alterarParede(m.base.uid, nova, { historico: false });
  }

  function atualizarDesenho(m: Modo & { tipo: 'desenhar' }, x: number, y: number): void {
    const casa = estado.projeto.casa;
    const andar = estado.edicaoCasa.andar;
    const p = pontoNaAltura(x, y, alturasDoAndar(casa, andar).yPe);
    if (!p) return;
    m.parede = paredeEntre(m.de, p, casa, andar);
    const comp = comprimentoDaParede(m.parede);
    const vao = vaoDaEscada(casa, andar);
    m.motivo = comp < 0.5 - 1e-6 ? 'Parede curta demais: o mínimo é 0,5 m' : vao && atravessa(m.parede, vao) ? 'A parede não pode passar por cima da escada' : null;
    mostrarFantasmaDeParede(m.parede, m.motivo === null);
    if (m.motivo) mostrarDica(`${metros(comp)} m. ${m.motivo}`, x, y, 'ruim');
    else mostrarDica(`${metros(comp)} m. Solte para criar a parede`, x, y, 'bom');
  }

  function tratarMovimento(x: number, y: number): void {
    const m = modo;
    if (m.tipo === 'ocioso') pairar(x, y);
    else if (m.tipo === 'quartinho') atualizarQuartinho(m, x, y);
    else if (m.tipo === 'obstaculo') atualizarObstaculo(m, x, y);
    else if (m.tipo === 'profundidade' || m.tipo === 'ponta-varanda') atualizarVaranda(m, x, y);
    else if (m.tipo === 'mover-parede' || m.tipo === 'esticar') atualizarParede(m, x, y);
    else if (m.tipo === 'desenhar') atualizarDesenho(m, x, y);
  }

  function encerrar(): void {
    modo = { tipo: 'ocioso' };
    c.controles.enabled = true;
    esconderFantasma();
    mostrarDica(null);
    c.canvas.style.cursor = '';
    pedirRefazer();
  }

  /** Fecha um arraste que mudou a casa: mede os cabos de uma vez e não deixa no histórico um passo que não mudou nada. */
  function fecharArraste(m: Arraste): void {
    if (!m.marcado) return;
    c.cabos.adiarComprimentos(false);
    if (retrato() === m.inicio) acoes.cancelarArraste();
  }

  /** Desiste do arraste em andamento. Verdadeiro se havia um. */
  function cancelar(): boolean {
    const m = modo;
    if (m.tipo === 'ocioso' || m.tipo === 'alheio' || m.tipo === 'apertado') return false;
    if (m.tipo !== 'desenhar' && m.marcado) {
      acoes.cancelarArraste();
      c.cabos.adiarComprimentos(false);
    }
    encerrar();
    return true;
  }

  function clicar(alvo: Alvo | null, x: number, y: number): void {
    const casa = estado.projeto.casa;
    if (!alvo) {
      if (estado.selecao) acoes.selecionar(null);
    } else if (alvo.tipo === 'alca-nova') {
      const nova = novaVaranda(alvo.lado, casa);
      if (varandaSobreOQuartinho(casa, nova)) {
        const recado = 'Não dá para criar a varanda aqui: o quartinho está no caminho. Arraste o quartinho para outro lugar e tente de novo.';
        mostrarDica(recado, x, y, 'ruim');
        avisarNaFaixa(recado);
        return;
      }
      acoes.definirVaranda(nova);
      acoes.selecionar({ tipo: 'varanda', lado: alvo.lado });
    } else if (alvo.tipo === 'alca-borda' || alvo.tipo === 'alca-ponta' || alvo.tipo === 'varanda') {
      acoes.selecionar({ tipo: 'varanda', lado: alvo.lado });
    } else if (alvo.tipo === 'quartinho') {
      acoes.selecionar({ tipo: 'quartinho' });
    } else if (alvo.tipo === 'obstaculo') {
      acoes.selecionar({ tipo: 'obstaculo', uid: alvo.uid });
    } else if (alvo.tipo === 'ponta-parede') {
      acoes.selecionar({ tipo: 'parede', uid: alvo.uid });
    } else if (alvo.tipo === 'parede') {
      const parede = paredeDe(alvo.uid);
      const jaSelecionada = estado.selecao?.tipo === 'parede' && estado.selecao.uid === alvo.uid;
      if (!parede || !jaSelecionada) acoes.selecionar({ tipo: 'parede', uid: alvo.uid });
      else {
        const passagens = alternarPassagem(parede, alvo.d);
        if (passagens) acoes.alterarParede(parede.uid, { passagens });
        else mostrarDica('Aqui não cabe uma passagem de 0,8 m', x, y, 'ruim');
      }
    } else {
      if (estado.selecao) acoes.selecionar(null);
      window.dispatchEvent(new CustomEvent('offgrid:nomear-comodo', { detail: { andar: estado.edicaoCasa.andar, x: alvo.x, z: alvo.z, clientX: x, clientY: y } }));
    }
  }

  function soltar(x: number, y: number): void {
    const m = modo;
    if (m.tipo === 'apertado') {
      encerrar();
      clicar(m.alvo, x, y);
      return;
    }
    if (m.tipo === 'desenhar') {
      atualizarDesenho(m, x, y);
      const parede = m.parede;
      const valido = parede !== null && m.motivo === null;
      encerrar();
      if (valido) {
        const uid = acoes.adicionarParede({ andar: estado.edicaoCasa.andar, de: parede.de, para: parede.para, passagens: [] });
        arrumarComodos();
        acoes.selecionar({ tipo: 'parede', uid });
      }
      return;
    }
    if (m.tipo === 'ocioso' || m.tipo === 'alheio') {
      encerrar();
      return;
    }
    if (m.tipo === 'quartinho') atualizarQuartinho(m, x, y);
    else if (m.tipo === 'obstaculo') atualizarObstaculo(m, x, y);
    else if (m.tipo === 'profundidade' || m.tipo === 'ponta-varanda') atualizarVaranda(m, x, y);
    else atualizarParede(m, x, y);
    fecharArraste(m);
    if ((m.tipo === 'mover-parede' || m.tipo === 'esticar') && m.marcado) arrumarComodos();
    encerrar();
    if (sobreACena(x, y)) pairar(x, y);
  }

  // ---------------------------------------------------------------- Apagar

  function apagarSelecionado(): void {
    const s = estado.selecao;
    const pecasEm = (superficies: string[]): number => estado.projeto.dispositivos.filter((d) => d.superficie !== null && superficies.includes(d.superficie)).length;
    const quantos = (n: number): string => (n === 1 ? '1 equipamento' : `${n} equipamentos`);
    if (s?.tipo === 'parede') {
      const n = pecasEm([`parede-interna-${s.uid}`]);
      if (n > 0 && !window.confirm(`Esta parede tem ${quantos(n)} preso nela. Apagar a parede apaga também o que está nela e os cabos ligados. Apagar?`)) return;
      acoes.removerParede(s.uid);
      arrumarComodos();
    } else if (s?.tipo === 'varanda') {
      const n = pecasEm([`telhado-varanda-${s.lado}`, `piso-varanda-${s.lado}`]);
      if (n > 0 && !window.confirm(`Esta varanda tem ${quantos(n)}. Remover a varanda remove também o que está nela e os cabos ligados. Remover?`)) return;
      acoes.removerVaranda(s.lado);
    } else if (s?.tipo === 'obstaculo') {
      acoes.removerObstaculo(s.uid);
    }
  }

  // ---------------------------------------------------------------- Câmera: de cima, no andar escolhido, sem telhado

  let guardado: { pos: THREE.Vector3; alvo: THREE.Vector3; visao: ModoVisao } | null = null;
  /** Onde `verDeCima` deixou a câmera. Enquanto ela continua aí, a vista acompanha a casa. */
  let enquadrado: THREE.Vector3 | null = null;

  function verDeCima(): void {
    const casa = estado.projeto.casa;
    // Enquadra a casa, as varandas, os botões de criar varanda e o quartinho.
    const folga = 3.2;
    let x0 = -casa.largura / 2 - folga;
    let x1 = casa.largura / 2 + folga;
    let z0 = -casa.profundidade / 2 - folga;
    let z1 = casa.profundidade / 2 + folga;
    for (const v of medirVarandas(casa)) {
      x0 = Math.min(x0, v.planta.x0 - 1);
      x1 = Math.max(x1, v.planta.x1 + 1);
      z0 = Math.min(z0, v.planta.z0 - 1);
      z1 = Math.max(z1, v.planta.z1 + 1);
    }
    const q = casa.quartinho;
    const r = Math.hypot(q.largura, q.profundidade) / 2 + 1;
    x0 = Math.min(x0, q.x - r);
    x1 = Math.max(x1, q.x + r);
    z0 = Math.min(z0, q.z - r);
    z1 = Math.max(z1, q.z + r);
    // Os obstáculos também: é na vista de cima que eles são postos no lugar.
    let maisAlto = 0;
    for (const o of estado.projeto.obstaculos ?? []) {
      const [lx, lz] = ladosDe(o);
      const ro = Math.hypot(lx, lz) / 2 + 1;
      x0 = Math.min(x0, o.x - ro);
      x1 = Math.max(x1, o.x + ro);
      z0 = Math.min(z0, o.z - ro);
      z1 = Math.max(z1, o.z + ro);
      maisAlto = Math.max(maisAlto, o.altura);
    }
    const tangente = Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2));
    // Os telhados das varandas e do quartinho ficam uns 3 m mais perto da câmera e aparecem maiores: a altura conta a partir deles.
    // A faixa de instrução cobre o alto da cena: sobra um pouco mais em cima.
    const altura = Math.min(c.controles.maxDistance - 1, Math.max(((z1 - z0) / 2 / tangente) * 1.16, (x1 - x0) / 2 / (tangente * c.camera.aspect)) + Math.max(3.5, maisAlto));
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2 - altura * tangente * 0.1;
    c.casa.updateWorldMatrix(true, false);
    // Um fio para o lado da frente: a frente da casa fica embaixo na tela, como em uma planta.
    c.camera.position.set(cx, altura, cz + 0.02).applyMatrix4(c.casa.matrixWorld);
    c.controles.target.set(cx, 0, cz).applyMatrix4(c.casa.matrixWorld);
    c.controles.update();
    enquadrado = c.camera.position.clone();
    c.pedirQuadroLeve();
  }

  /** Visão em que o andar em edição fica aberto: sem o andar de cima no térreo, sem telhado em cima. */
  function visaoDoAndar(): ModoVisao {
    return estado.edicaoCasa.andar === 0 && estado.projeto.casa.andares === 2 ? 'terreo' : 'sem-telhado';
  }

  function aoMudarEdicao(): void {
    if (!cancelar() && modo.tipo !== 'ocioso') encerrar();
    limparPairar();
    if (estado.edicaoCasa.ativa) {
      const entrando = guardado === null;
      if (!guardado) guardado = { pos: c.camera.position.clone(), alvo: c.controles.target.clone(), visao: estado.visao };
      if (estado.visao !== visaoDoAndar()) acoes.definirVisao(visaoDoAndar());
      if (entrando) verDeCima();
    } else if (guardado) {
      const g = guardado;
      guardado = null;
      enquadrado = null;
      if (estado.visao !== g.visao) acoes.definirVisao(g.visao);
      c.camera.position.copy(g.pos);
      c.controles.target.copy(g.alvo);
      c.controles.update();
    }
    pedirRefazer();
  }

  // ---------------------------------------------------------------- Eventos

  let pendente: [number, number] | null = null;
  let quadroPendente = 0;

  function despachar(): void {
    cancelAnimationFrame(quadroPendente);
    quadroPendente = 0;
    const p = pendente;
    pendente = null;
    if (p) tratarMovimento(p[0], p[1]);
  }

  function aoApertar(e: PointerEvent): void {
    if (!estado.edicaoCasa.ativa || e.button !== 0 || modo.tipo !== 'ocioso' || e.target !== c.canvas) return;
    const alvo = alvoSob(e.clientX, e.clientY);
    mostrarDica(null);
    // A órbita é desligada antes de o controle da câmera ver o evento (este ouvinte roda na captura).
    if (alvo) c.controles.enabled = false;
    modo = { tipo: 'apertado', x: e.clientX, y: e.clientY, alvo };
  }

  function aoMover(e: PointerEvent): void {
    if (!estado.edicaoCasa.ativa) return;
    const m = modo;
    if (m.tipo === 'alheio') return;
    if (m.tipo === 'apertado') {
      if (Math.hypot(e.clientX - m.x, e.clientY - m.y) <= LIMIAR_DE_ARRASTE) return;
      if (!m.alvo) {
        modo = { tipo: 'alheio' };
        limparPairar();
        return;
      }
      comecar(m.alvo, m.x, m.y);
      if (modo.tipo === 'apertado') return;
    }
    pendente = [e.clientX, e.clientY];
    if (!quadroPendente) quadroPendente = requestAnimationFrame(despachar);
  }

  function aoSoltar(e: PointerEvent): void {
    if (modo.tipo === 'ocioso') return;
    if (e.type === 'pointerup' && e.button !== 0) return;
    pendente = null;
    if (e.type === 'pointercancel') {
      if (!cancelar()) encerrar();
      return;
    }
    if (modo.tipo === 'alheio') {
      encerrar();
      return;
    }
    soltar(e.clientX, e.clientY);
  }

  function aoTeclar(e: KeyboardEvent): void {
    if (!estado.edicaoCasa.ativa || e.ctrlKey || e.metaKey || e.altKey || emCampoDeTexto(e.target)) return;
    if (e.key === 'Escape') {
      // Com arraste, Esc desiste dele; sem arraste, sai do modo de edição.
      if (!cancelar() && modo.tipo === 'ocioso') acoes.definirEdicaoDaCasa(false);
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && modo.tipo === 'ocioso') {
      girarObstaculo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && modo.tipo === 'ocioso' && estado.selecao) apagarSelecionado();
  }

  const aoSair = (): void => {
    if (estado.edicaoCasa.ativa && modo.tipo === 'ocioso') {
      pendente = null;
      limparPairar();
    }
  };
  const aoPerderAJanela = (): void => {
    if (!cancelar() && modo.tipo !== 'ocioso') encerrar();
  };
  const aoPedirParaApagar = (): void => {
    if (estado.edicaoCasa.ativa && modo.tipo === 'ocioso') apagarSelecionado();
  };

  c.container.addEventListener('pointerdown', aoApertar, true);
  c.canvas.addEventListener('pointerleave', aoSair);
  window.addEventListener('pointermove', aoMover);
  window.addEventListener('pointerup', aoSoltar);
  window.addEventListener('pointercancel', aoSoltar);
  window.addEventListener('blur', aoPerderAJanela);
  window.addEventListener('keydown', aoTeclar);
  window.addEventListener('resize', ajustarAlcas);
  window.addEventListener('offgrid:apagar-da-casa', aoPedirParaApagar);

  const cancelarAssinaturas = [
    assinar('edicao', aoMudarEdicao),
    assinar('casa', pedirRefazer),
    assinar('selecao', pedirRefazer),
    assinar('visao', pedirRefazer),
  ];
  aoMudarEdicao();

  return {
    situacao() {
      const m = modo;
      if (m.tipo === 'desenhar') return { modo: m.tipo, valido: m.parede !== null && m.motivo === null, motivo: m.motivo };
      if (m.tipo === 'quartinho' || m.tipo === 'obstaculo' || m.tipo === 'mover-parede' || m.tipo === 'esticar' || m.tipo === 'profundidade' || m.tipo === 'ponta-varanda') return { modo: m.tipo, valido: m.valido, motivo: null };
      return { modo: m.tipo, valido: null, motivo: null };
    },
    telaDaAlca(id) {
      if (sujo) refazer();
      const a = alcas.find((x) => x.id === id);
      return a ? c.naTela(a.pos) : null;
    },
    destruir() {
      cancelarAssinaturas.forEach((f) => f());
      cancelAnimationFrame(quadroPendente);
      c.container.removeEventListener('pointerdown', aoApertar, true);
      c.canvas.removeEventListener('pointerleave', aoSair);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      window.removeEventListener('blur', aoPerderAJanela);
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('resize', ajustarAlcas);
      window.removeEventListener('offgrid:apagar-da-casa', aoPedirParaApagar);
      c.casa.remove(camada);
      dica.remove();
      geoCaixa.dispose();
      for (const m of [matSelecao, matSobre, matFantasma, matInvisivel, ...Object.values(matAlca)]) m.dispose();
      for (const d of Object.values(desenhos)) d.textura.dispose();
    },
  };
}
