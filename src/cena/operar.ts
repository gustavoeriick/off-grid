// Camada de operação: o que a cena mostra e deixa manobrar quando o sistema é operado.
// Especificação: docs/especificacao/operar.md, seções 2, 5, 7 e 8. Tarefa 8.3.
//
// - Chaves: acha a proteção sob o ponteiro (no cabo ou no trilho de um quadro) e diz a dica de cada uma.
//   O desenho do estado (alavanca, fusível) é de `protecoes.ts`, aplicado pelas camadas de cabos e de dispositivos.
// - Botão de ligar: um botão redondo, sempre de frente, no canto de cima de cada inversor e de cada aparelho.
// - Visores: números ao vivo no controlador, no inversor e na bateria. O mesmo desenho aparece na face da peça
//   (onde o modelo tem visor) e, quando esse fica pequeno demais na tela, ampliado ao lado ou acima dela, ligado a ela
//   por um fio fino. O ampliado é desenhado por cima das peças e dos cabos, não cai sobre a peça dele nem sobre outro
//   visor (o lugar sai de `lugarDosVisores.ts`) e some quando uma parede, um piso ou um telhado esconde a peça.
// - Queimado: selo "QUEIMADO" sobre a peça, o cabo ou a proteção, enquanto durar; fumaça, faísca e estalo no evento.
//
// A camada só lê o estado. Quem chama as ações é a interação com o ponteiro (`interacao.ts`).

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Protecao } from '../catalogo/tipos';
import { analiseDaSimulacao, assinar, correntesDeOperacaoAgora, estado, type EventoDeOperacao, horaLocalDe } from '../estado';
import { estadoDaProtecao } from '../nucleo/operacao';
import type { Dispositivo } from '../nucleo/tipos';
import { emUso, usoDe } from '../nucleo/uso';
import type { CamadaDeCabos } from './cabos';
import type { CamadaDeDispositivos } from './dispositivos';
import { criarEfeitos } from './efeitos';
import { escolherLugares, type Estorvo, type PedidoDeLugar, pontoMaisPerto, type Retangulo, sobreposicao } from './lugarDosVisores';
import { esconder } from './malha';
import { caixaDaChave } from './protecoes';
import { type ConteudoDoVisor, conteudoDoVisor, desenharVisor, textoDoConteudo, VISOR_ALTURA_PX, VISOR_LARGURA_PX } from './visores';

export interface PartesDaOperacao {
  /** Grupo que gira com a orientação: selos e efeitos são filhos dele, em coordenadas da casa. */
  casa: THREE.Group;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  dispositivos: CamadaDeDispositivos;
  cabos: CamadaDeCabos;
  /** Pede um quadro novo sem refazer o mapa de sombra. */
  pedirQuadroLeve(): void;
}

export interface ChaveNoRaio {
  cabo: string;
  indice: number;
  /** Distância da câmera ao ponto da proteção que o raio toca. */
  distancia: number;
}

export interface BotaoNaTela {
  uid: string;
  /** Distância da câmera ao botão. */
  distancia: number;
}

/** Para a verificação: onde está um visor ampliado, em pixels da janela, e onde o fio dele toca a peça. */
export interface LugarNaJanela {
  uid: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Ponta do fio, sobre a peça. */
  ponta: [x: number, y: number];
}

export interface CamadaDeOperacao {
  /**
   * Chamada a cada volta do laço da cena: põe a camada em dia com o estado, ajusta o tamanho do que é medido em pixels
   * e avança os efeitos. Devolve verdadeiro enquanto há efeito na tela (a cena precisa de quadros novos).
   */
  animar(agoraMs: number): boolean;
  /** Proteção com chave (fusível ou disjuntor) que o raio do ponteiro toca, a mais próxima da câmera. */
  chaveNoRaio(raio: THREE.Ray): ChaveNoRaio | null;
  /** Botão de ligar sob um ponto da janela, em pixels. */
  botaoEm(x: number, y: number): BotaoNaTela | null;
  /** Dica curta para a proteção sob o ponteiro: o estado dela e o que o clique faz. */
  dicaDaChave(cabo: string, indice: number): string | null;
  /** Dica curta para o botão de ligar de uma peça. */
  dicaDoBotao(uid: string): string | null;
  /** Posição na janela, em pixels, de uma proteção desenhada (no cabo ou no trilho de um quadro). */
  telaDaProtecao(cabo: string, indice: number): [x: number, y: number] | null;
  /** Posição na janela do botão de ligar de um inversor ou de um aparelho. */
  telaDoBotao(uid: string): [x: number, y: number] | null;
  /** Texto do visor de uma peça: as linhas separadas por " | ". Vazio com o visor apagado; nulo se a peça não tem visor. */
  textoDoVisor(uid: string): string | null;
  /** Para a verificação: selos de queimado na cena e partículas de efeito vivas. */
  resumo(): { selos: string[]; particulas: number; visoresFlutuando: string[]; lugaresDosVisores: LugarNaJanela[] };
  destruir(): void;
}

/** O visor é lido de novo, no máximo, a cada tanto: o de verdade também não pisca a cada instante. */
const INTERVALO_DOS_VISORES_MS = 120;
/** Visor ampliado: largura no mundo, limites na tela e a distância da câmera a partir da qual some. */
const VISOR_FLUTUANTE = { largura: 0.26, minimoPx: 140, maximoPx: 210, alcance: 16 } as const;
/** Fio que liga o visor ampliado à peça dele: espessura e diâmetro da ponta, na tela. */
const FIO = { espessuraPx: 4, pontaPx: 9, minimoPx: 5 } as const;
/** Tempo que o visor ampliado leva para ir de um lugar a outro, quando muda de lugar. */
const MUDANCA_DE_LUGAR_MS = 180;
/** Quanto o visor ampliado deve evitar cobrir cada coisa (custo de `lugarDosVisores.ts`). */
const PESO = { pecaComVisor: 25, aparelho: 10, botao: 30, protecao: 30, painel: 60 } as const;
/** Meio lado, na tela, da área que uma proteção ocupa para o visor ampliado a evitar. */
const MEIA_PROTECAO_PX = 14;
/** De quanto em quanto tempo são lidos os painéis da página que ficam sobre a cena. */
const INTERVALO_DOS_PAINEIS_MS = 400;
/** Com o visor da face da peça com esta largura na tela, ou mais, o ampliado não aparece. */
const VISOR_LEGIVEL_PX = 120;
/** Botão de ligar: diâmetro no mundo e limites na tela. */
const BOTAO = { diametro: 0.07, minimoPx: 24, maximoPx: 40 } as const;
/** Selo de queimado: altura no mundo e limites na tela. */
const SELO = { altura: 0.07, minimoPx: 18, maximoPx: 28 } as const;
/** Folga do clique em volta de uma proteção, em pixels. */
const FOLGA_DA_CHAVE_PX = 5;

const semRaio = (): void => {};

interface Visor {
  uid: string;
  itemId: string;
  grupo: THREE.Group;
  pincel: CanvasRenderingContext2D;
  textura: THREE.CanvasTexture;
  /** Visor na face da frente da peça. Nulo na peça cujo modelo não tem visor. */
  face: THREE.Mesh | null;
  larguraDaFace: number;
  flutuante: THREE.Sprite;
  /** Fio do visor ampliado até a peça, e a ponta dele sobre a peça. */
  fio: THREE.Mesh;
  ponta: THREE.Sprite;
  /** Lugar do visor ampliado no último quadro: candidato escolhido e retângulo na tela. Nulo se não estava à mostra. */
  candidato: number | null;
  ret: Retangulo | null;
  pontaNaTela: [number, number];
  /** Centro do visor ampliado em relação ao meio do topo da caixa da peça na tela, como foi desenhado. */
  desvio: [number, number];
  /** Mudança de lugar em curso: quanto falta do caminho, em pixels, e quando começou. */
  mudanca: { dx: number; dy: number; inicio: number } | null;
  /** Última conferência de parede na frente: de onde a câmera olhava, onde a peça estava e o resultado. */
  vista: { chave: string; livre: boolean };
  conteudo: ConteudoDoVisor | null;
  /** Texto e estado do último desenho: o desenho só é refeito quando isto muda. */
  desenhado: string;
}

interface Botao {
  uid: string;
  grupo: THREE.Group;
  sprite: THREE.Sprite;
  /** Raio na tela, em pixels, no último quadro. */
  raioPx: number;
}

interface Selo {
  id: string;
  sprite: THREE.Sprite;
  /** Altura em relação ao selo de uma peça: o da proteção é menor. */
  fator: number;
}

interface Chave {
  cabo: string;
  indice: number;
  item: Protecao;
  peca: THREE.Object3D;
}

type SituacaoDoBotao = 'ligado' | 'desligado' | 'falha';

/** Desenho do botão de ligar: disco com o símbolo de liga e desliga. Ligado é cheio e verde; desligado, vazado e cinza; em falha, âmbar com "!". */
function texturaDoBotao(situacao: SituacaoDoBotao): THREE.CanvasTexture {
  const lado = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = lado;
  const g = cv.getContext('2d')!;
  const meio = lado / 2;
  const fundo = situacao === 'ligado' ? '#1b9a52' : situacao === 'falha' ? '#e08a00' : '#2b333b';
  const traco = situacao === 'desligado' ? '#c3cbd2' : '#ffffff';
  g.beginPath();
  g.arc(meio, meio, meio - 3, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fill();
  g.beginPath();
  g.arc(meio, meio, meio - 8, 0, Math.PI * 2);
  g.fillStyle = fundo;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = situacao === 'desligado' ? '#8e98a2' : '#ffffff';
  g.stroke();
  g.lineCap = 'round';
  g.strokeStyle = traco;
  g.lineWidth = 7;
  if (situacao === 'falha') {
    // Ponto de exclamação: o inversor desligou sozinho e espera ser religado.
    g.beginPath();
    g.moveTo(meio, meio - 20);
    g.lineTo(meio, meio + 6);
    g.stroke();
    g.beginPath();
    g.arc(meio, meio + 20, 4.5, 0, Math.PI * 2);
    g.fillStyle = traco;
    g.fill();
  } else {
    g.beginPath();
    g.arc(meio, meio + 2, 19, -Math.PI / 2 + 0.62, -Math.PI / 2 - 0.62 + Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(meio, meio - 24);
    g.lineTo(meio, meio - 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Selo de queimado: etiqueta escura de borda laranja, com uma chama e a palavra. Não depende só de cor. */
function texturaDoSelo(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 272;
  cv.height = 72;
  const g = cv.getContext('2d')!;
  g.beginPath();
  g.roundRect(3, 3, cv.width - 6, cv.height - 6, 16);
  g.fillStyle = '#1b1210';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#ff7a1a';
  g.stroke();
  // Chama.
  const x = 40;
  const y = 38;
  g.beginPath();
  g.moveTo(x, y - 26);
  g.bezierCurveTo(x + 22, y - 6, x + 20, y + 22, x, y + 22);
  g.bezierCurveTo(x - 20, y + 22, x - 20, y, x - 8, y - 10);
  g.bezierCurveTo(x - 6, y - 2, x, y - 2, x, y - 26);
  g.closePath();
  g.fillStyle = '#ff7a1a';
  g.fill();
  g.beginPath();
  g.moveTo(x + 1, y - 4);
  g.bezierCurveTo(x + 10, y + 6, x + 9, y + 18, x, y + 18);
  g.bezierCurveTo(x - 9, y + 18, x - 8, y + 8, x + 1, y - 4);
  g.fillStyle = '#ffd24a';
  g.fill();
  g.font = 'bold 34px system-ui, "Segoe UI", Arial, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffe3cc';
  g.fillText('QUEIMADO', 70, cv.height / 2 + 2, cv.width - 84);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fio do visor ampliado: traço escuro no meio, com borda clara dos dois lados. */
function texturaDoFio(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 8;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 0, 4, 8);
  g.fillStyle = '#10202e';
  g.fillRect(0, 2, 4, 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ponta do fio, sobre a peça: disco escuro de aro claro. */
function texturaDaPonta(): THREE.CanvasTexture {
  const lado = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = lado;
  const g = cv.getContext('2d')!;
  g.beginPath();
  g.arc(lado / 2, lado / 2, lado / 2 - 1, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fill();
  g.beginPath();
  g.arc(lado / 2, lado / 2, lado / 2 - 6, 0, Math.PI * 2);
  g.fillStyle = '#10202e';
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function criarCamadaDeOperacao(c: PartesDaOperacao): CamadaDeOperacao {
  const camada = new THREE.Group();
  camada.name = 'operacao';
  c.casa.add(camada);
  const efeitos = criarEfeitos(camada, c.camera, c.canvas);

  const geoFace = new THREE.PlaneGeometry(1, 1);
  const desenhosDoBotao: Record<SituacaoDoBotao, THREE.CanvasTexture> = {
    ligado: texturaDoBotao('ligado'),
    desligado: texturaDoBotao('desligado'),
    falha: texturaDoBotao('falha'),
  };
  const materiaisDoBotao = Object.fromEntries(
    (Object.keys(desenhosDoBotao) as SituacaoDoBotao[]).map((s) => [s, new THREE.SpriteMaterial({ map: desenhosDoBotao[s], transparent: true, depthWrite: false, toneMapped: false })]),
  ) as Record<SituacaoDoBotao, THREE.SpriteMaterial>;
  const desenhoDoSelo = texturaDoSelo();
  // O selo aparece mesmo atrás de parede ou de telhado: uma peça queimada precisa ser achada de longe.
  const matSelo = new THREE.SpriteMaterial({ map: desenhoDoSelo, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const PROPORCAO_DO_SELO = 272 / 72;
  // Fio do visor ampliado: traço escuro com borda clara, para aparecer sobre peça escura e sobre parede clara.
  const desenhoDoFio = texturaDoFio();
  const matFio = new THREE.MeshBasicMaterial({ map: desenhoDoFio, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const desenhoDaPonta = texturaDaPonta();
  const matPonta = new THREE.SpriteMaterial({ map: desenhoDaPonta, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });

  const visores = new Map<string, Visor>();
  const botoes = new Map<string, Botao>();
  let selos: Selo[] = [];
  let chaves: Chave[] | null = null;
  /** Cresce a cada vez que as peças, os cabos, a casa ou o modo de visão mudam: invalida o que foi medido antes. */
  let versaoDaEstrutura = 0;

  /** A estrutura (que peças têm visor, botão e selo) precisa ser conferida com o projeto. */
  let estruturaSuja = true;
  /** Os números dos visores precisam ser lidos de novo. */
  let visoresSujos = true;
  let ultimaLeitura = -Infinity;
  /** Eventos da operação já mostrados, e os que esperam o próximo quadro para virar efeito. */
  const mostrados = new WeakSet<EventoDeOperacao>();
  for (const e of estado.simulacao.eventos) mostrados.add(e);
  let aMostrar: EventoDeOperacao[] = [];

  const dispositivoDe = (uid: string): Dispositivo | undefined => estado.projeto.dispositivos.find((d) => d.uid === uid);

  // ---------------------------------------------------------------- Medidas na tela

  const noMundo = new THREE.Vector3();
  const projetado = new THREE.Vector3();

  /** Metros que um pixel cobre, a uma distância da câmera. */
  function metrosPorPixel(distancia: number): number {
    return (2 * distancia * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
  }

  /** Posição na janela de um ponto do mundo. Nulo se ele está atrás da câmera. */
  function mundoNaTela(ponto: THREE.Vector3): [number, number] | null {
    c.camera.updateMatrixWorld();
    projetado.copy(ponto).project(c.camera);
    if (projetado.z > 1) return null;
    const r = c.canvas.getBoundingClientRect();
    return [r.left + ((projetado.x + 1) / 2) * r.width, r.top + ((1 - projetado.y) / 2) * r.height];
  }

  // ---------------------------------------------------------------- Visores

  function criarVisor(d: Dispositivo, grupo: THREE.Group): Visor | null {
    const peca = c.dispositivos.pecaNaCena(d.uid);
    if (!peca) return null;
    const cv = document.createElement('canvas');
    cv.width = VISOR_LARGURA_PX;
    cv.height = VISOR_ALTURA_PX;
    const pincel = cv.getContext('2d')!;
    const textura = new THREE.CanvasTexture(cv);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    let face: THREE.Mesh | null = null;
    const lugar = peca.modelo.visor;
    if (lugar) {
      // O visor de verdade, na face da peça: cobre o retângulo escuro pintado na estampa dela.
      face = new THREE.Mesh(geoFace, new THREE.MeshBasicMaterial({ map: textura, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      face.name = 'visor';
      face.position.set(lugar.centro[0], lugar.centro[1], lugar.centro[2]);
      face.scale.set(lugar.largura, lugar.altura, 1);
      face.raycast = semRaio;
      grupo.add(face);
    }
    // O mesmo desenho, ampliado e sempre de frente: é o que se lê da distância de trabalho. É desenhado sem teste de
    // profundidade, por cima da peça dele, dos cabos e das outras peças; o lugar na tela é posto a cada quadro por
    // `arrumarVisores`, que também o esconde quando uma parede, um piso ou um telhado tapa a peça.
    const flutuante = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    flutuante.name = 'visor-ampliado';
    flutuante.renderOrder = 8;
    flutuante.raycast = semRaio;
    flutuante.visible = false;
    const fio = new THREE.Mesh(geoFace, matFio);
    fio.name = 'fio-do-visor';
    fio.renderOrder = 7;
    fio.raycast = semRaio;
    fio.frustumCulled = false;
    fio.visible = false;
    const ponta = new THREE.Sprite(matPonta);
    ponta.name = 'ponta-do-fio';
    ponta.renderOrder = 7;
    ponta.raycast = semRaio;
    ponta.visible = false;
    grupo.add(fio, ponta, flutuante);
    if (c.dispositivos.escondida(d.uid)) {
      if (face) esconder(face, true);
      for (const o of [flutuante, fio, ponta]) esconder(o, true);
    }
    return {
      uid: d.uid, itemId: d.itemId, grupo, pincel, textura, face, larguraDaFace: lugar?.largura ?? 0, flutuante, fio, ponta,
      candidato: null, ret: null, pontaNaTela: [0, 0], desvio: [0, 0], mudanca: null, vista: { chave: '', livre: true }, conteudo: null, desenhado: '',
    };
  }

  function removerVisor(v: Visor): void {
    if (v.face) {
      v.face.parent?.remove(v.face);
      (v.face.material as THREE.Material).dispose();
    }
    for (const o of [v.flutuante, v.fio, v.ponta]) o.parent?.remove(o);
    v.flutuante.material.dispose();
    v.textura.dispose();
    visores.delete(v.uid);
  }

  /** Lê de novo os números de todos os visores. Só redesenha os que mudaram. */
  function lerVisores(): void {
    visoresSujos = false;
    if (visores.size === 0) return;
    const leitura = { projeto: estado.projeto, catalogo: CATALOGO, viva: analiseDaSimulacao(), saida: estado.simulacao.saida, correntes: correntesDeOperacaoAgora() };
    let mudou = false;
    for (const v of visores.values()) {
      const d = dispositivoDe(v.uid);
      const item = d ? CATALOGO.get(d.itemId) : undefined;
      const conteudo = d && item ? conteudoDoVisor(d, item, leitura) : null;
      if (!conteudo) continue;
      v.conteudo = conteudo;
      const chave = JSON.stringify(conteudo);
      if (chave === v.desenhado) continue;
      v.desenhado = chave;
      desenharVisor(v.pincel, conteudo);
      v.textura.needsUpdate = true;
      mudou = true;
    }
    if (mudou) c.pedirQuadroLeve();
  }

  // ---------------------------------------------------------------- Botões de ligar

  function situacaoDoBotao(d: Dispositivo): SituacaoDoBotao {
    if (d.falha === 'sobrecarga') return 'falha';
    return d.ligado ? 'ligado' : 'desligado';
  }

  function criarBotao(d: Dispositivo, grupo: THREE.Group): Botao | null {
    const peca = c.dispositivos.pecaNaCena(d.uid);
    if (!peca) return null;
    const [W, H, D] = peca.modelo.dimensoes;
    const sprite = new THREE.Sprite(materiaisDoBotao[situacaoDoBotao(d)]);
    sprite.name = 'botao-de-ligar';
    // No canto de cima, à direita de quem olha a peça de frente, um pouco para fora dela.
    sprite.position.set(W / 2 + 0.03, H / 2 - 0.02, D / 2 + 0.012);
    sprite.renderOrder = 9;
    sprite.raycast = semRaio;
    grupo.add(sprite);
    if (c.dispositivos.escondida(d.uid)) esconder(sprite, true);
    return { uid: d.uid, grupo, sprite, raioPx: BOTAO.minimoPx / 2 };
  }

  function removerBotao(b: Botao): void {
    b.sprite.parent?.remove(b.sprite);
    botoes.delete(b.uid);
  }

  // ---------------------------------------------------------------- Selos de queimado

  function porSelo(id: string, pai: THREE.Object3D, posicao: THREE.Vector3, fator: number, escondido: boolean, acima = false): void {
    const sprite = new THREE.Sprite(matSelo);
    sprite.name = `selo-${id}`;
    sprite.position.copy(posicao);
    // O selo da proteção e o do cabo ficam logo acima deles: o fusível rompido e a capa queimada continuam à vista.
    if (acima) sprite.center.set(0.5, -1.1);
    sprite.renderOrder = 12;
    sprite.raycast = semRaio;
    pai.add(sprite);
    if (escondido) esconder(sprite, true);
    selos.push({ id, sprite, fator });
  }

  const inversaDaCasa = new THREE.Matrix4();

  /** Centro de um objeto da cena, em coordenadas da casa. */
  function naCasa(o: THREE.Object3D, alvo = new THREE.Vector3()): THREE.Vector3 {
    c.casa.updateWorldMatrix(true, false);
    inversaDaCasa.copy(c.casa.matrixWorld).invert();
    return o.getWorldPosition(alvo).applyMatrix4(inversaDaCasa);
  }

  /** Proteção desenhada, no cabo ou no trilho de um quadro à vista. */
  function desenhoDaProtecao(cabo: string, indice: number): THREE.Object3D | null {
    const noCabo = c.cabos.protecao(cabo, indice);
    if (noCabo) return c.cabos.escondido(cabo) ? null : noCabo;
    return c.dispositivos.protecaoNoTrilho(cabo, indice);
  }

  function refazerSelos(): void {
    for (const s of selos) s.sprite.parent?.remove(s.sprite);
    selos = [];
    for (const d of estado.projeto.dispositivos) {
      if (d.queimado === undefined) continue;
      const grupo = c.dispositivos.grupoDe(d.uid);
      const peca = c.dispositivos.pecaNaCena(d.uid);
      if (!grupo || !peca) continue;
      // Sobre a frente da peça, no meio dela.
      porSelo(d.uid, grupo, new THREE.Vector3(0, 0, peca.modelo.dimensoes[2] / 2 + 0.02), 1, c.dispositivos.escondida(d.uid));
    }
    for (const cabo of estado.projeto.cabos) {
      if (cabo.queimado !== undefined && !c.cabos.escondido(cabo.uid)) {
        const meio = c.cabos.pontoNoCaminho(cabo.uid, 0.5);
        if (meio) porSelo(cabo.uid, camada, meio, 1, false, true);
      }
      cabo.protecoes.forEach((_, indice) => {
        if (estadoDaProtecao(cabo, indice) !== 'queimada') return;
        const desenho = desenhoDaProtecao(cabo.uid, indice);
        if (desenho) porSelo(`${cabo.uid}:${indice}`, camada, naCasa(desenho), 0.8, false, true);
      });
    }
  }

  // ---------------------------------------------------------------- Estrutura

  /** Confere com o projeto quais peças têm visor, botão e selo. As camadas de dispositivos e de cabos já estão em dia. */
  function conferirEstrutura(): void {
    estruturaSuja = false;
    versaoDaEstrutura++;
    chaves = null;
    const comVisor = new Set<string>();
    const comBotao = new Set<string>();
    for (const d of estado.projeto.dispositivos) {
      const grupo = c.dispositivos.grupoDe(d.uid);
      const categoria = c.dispositivos.pecaNaCena(d.uid)?.item.categoria;
      if (!grupo || !categoria) continue;
      if (categoria === 'controlador' || categoria === 'inversor' || categoria === 'bateria') {
        let v = visores.get(d.uid);
        // Peça refeita (modelo trocado): o visor antigo foi embora com o grupo dela.
        if (v && (v.grupo !== grupo || v.itemId !== d.itemId)) {
          removerVisor(v);
          v = undefined;
        }
        v ??= criarVisor(d, grupo) ?? undefined;
        if (v) {
          visores.set(d.uid, v);
          comVisor.add(d.uid);
        }
      }
      // Peça queimada não liga: o botão dá lugar ao selo.
      if ((categoria === 'inversor' || categoria === 'aparelho') && d.queimado === undefined) {
        let b = botoes.get(d.uid);
        if (b && b.grupo !== grupo) {
          removerBotao(b);
          b = undefined;
        }
        b ??= criarBotao(d, grupo) ?? undefined;
        if (b) {
          b.sprite.material = materiaisDoBotao[situacaoDoBotao(d)];
          botoes.set(d.uid, b);
          comBotao.add(d.uid);
        }
      }
    }
    for (const v of [...visores.values()]) if (!comVisor.has(v.uid)) removerVisor(v);
    for (const b of [...botoes.values()]) if (!comBotao.has(b.uid)) removerBotao(b);
    refazerSelos();
    visoresSujos = true;
    ultimaLeitura = -Infinity;
    c.pedirQuadroLeve();
  }

  function emDia(): void {
    if (estruturaSuja) conferirEstrutura();
    if (visoresSujos) lerVisores();
  }

  // ---------------------------------------------------------------- Tamanhos e lugares na tela, a cada quadro

  const normal = new THREE.Vector3();
  const paraACamera = new THREE.Vector3();
  const canto = new THREE.Vector3();
  const quatDoGrupo = new THREE.Quaternion();
  const giroNaTela = new THREE.Quaternion();
  const EIXO_DA_VISTA = new THREE.Vector3(0, 0, 1);
  const raioDeVista = new THREE.Raycaster();
  const alvoDaVista = new THREE.Vector3();
  let listaDeTapumes: THREE.Mesh[] = [];
  let tapumesDaVersao = -1;
  let paineis: Retangulo[] = [];
  let paineisLidosEm = -Infinity;

  interface CaixaNaTela {
    ret: Retangulo;
    /** Distância do meio da peça ao plano da câmera. */
    profundidade: number;
  }

  /** Ponto do mundo em pixels da cena (origem no canto de cima, à esquerda). Nulo se está atrás da câmera. */
  function pontoNaCena(ponto: THREE.Vector3, L: number, A: number): [number, number] | null {
    canto.copy(ponto).applyMatrix4(c.camera.matrixWorldInverse);
    if (canto.z > -c.camera.near) return null;
    canto.applyMatrix4(c.camera.projectionMatrix);
    return [((canto.x + 1) / 2) * L, ((1 - canto.y) / 2) * A];
  }

  /** Caixa de uma peça na tela, em pixels da cena. Nulo se algum canto dela está atrás da câmera. */
  function caixaNaTela(grupo: THREE.Object3D, volume: THREE.Box3, L: number, A: number): CaixaNaTela | null {
    grupo.updateWorldMatrix(true, false);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let profundidade = 0;
    for (let i = 0; i < 8; i++) {
      canto
        .set(i & 1 ? volume.max.x : volume.min.x, i & 2 ? volume.max.y : volume.min.y, i & 4 ? volume.max.z : volume.min.z)
        .applyMatrix4(grupo.matrixWorld)
        .applyMatrix4(c.camera.matrixWorldInverse);
      if (canto.z > -c.camera.near) return null;
      profundidade -= canto.z / 8;
      canto.applyMatrix4(c.camera.projectionMatrix);
      const x = ((canto.x + 1) / 2) * L;
      const y = ((1 - canto.y) / 2) * A;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { ret: { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }, profundidade };
  }

  /** Põe um objeto, filho do grupo de uma peça, em um ponto da tela, à profundidade dada (em coordenadas da tela, de −1 a 1). */
  function porNaTela(o: THREE.Object3D, x: number, y: number, z: number, L: number, A: number): void {
    o.position.set((x / L) * 2 - 1, 1 - (y / A) * 2, z).unproject(c.camera);
    o.parent?.worldToLocal(o.position);
  }

  /**
   * O que da casa tapa a vista de uma peça: paredes, pisos, lajes, portas, a prateleira e o plano de cada água de
   * telhado, só o que o modo de visão deixa à mostra. As telhas (malha instanciada) ficam de fora: o plano da água vale por elas.
   */
  function tapumes(): THREE.Mesh[] {
    if (tapumesDaVersao === versaoDaEstrutura) return listaDeTapumes;
    tapumesDaVersao = versaoDaEstrutura;
    listaDeTapumes = [];
    c.casa.getObjectByName('estrutura')?.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || o.userData.escondido || o.userData.soSombra) return;
      if (o.userData.sombra === true || o.userData.superficie) listaDeTapumes.push(o);
    });
    return listaDeTapumes;
  }

  /**
   * Verdadeiro se nada da casa fica entre a câmera e a peça: é quando o visor ampliado dela aparece. Olha o meio da
   * peça, o meio da frente e o meio do topo; basta um deles livre. Peças e cabos não contam: o visor é desenhado por
   * cima deles.
   */
  function pecaAVista(v: Visor, volume: THREE.Box3): boolean {
    const m = v.grupo.matrixWorld.elements;
    const p = c.camera.position;
    const chave = `${versaoDaEstrutura}|${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}|${m[12]!.toFixed(3)},${m[13]!.toFixed(3)},${m[14]!.toFixed(3)}`;
    if (v.vista.chave === chave) return v.vista.livre;
    const naFrente = tapumes();
    const cx = (volume.min.x + volume.max.x) / 2;
    const cy = (volume.min.y + volume.max.y) / 2;
    const cz = (volume.min.z + volume.max.z) / 2;
    let livre = false;
    for (let i = 0; i < 3 && !livre; i++) {
      if (i === 0) alvoDaVista.set(cx, cy, cz);
      else if (i === 1) alvoDaVista.set(cx, cy, volume.max.z + 0.03);
      else alvoDaVista.set(cx, volume.max.y + 0.03, cz);
      alvoDaVista.applyMatrix4(v.grupo.matrixWorld);
      const distancia = alvoDaVista.distanceTo(p);
      raioDeVista.set(p, alvoDaVista.sub(p).normalize());
      raioDeVista.far = Math.max(0, distancia - 0.02);
      livre = raioDeVista.intersectObjects(naFrente, false).length === 0;
    }
    v.vista = { chave, livre };
    return livre;
  }

  /** Painéis da página que ficam por cima da cena (a ajuda da câmera, o cartão do passo a passo), em pixels da cena. */
  function paineisSobreACena(agora: number, L: number, A: number): Retangulo[] {
    if (Math.abs(agora - paineisLidosEm) < INTERVALO_DOS_PAINEIS_MS) return paineis;
    paineisLidosEm = agora;
    paineis = [];
    const moldura = c.canvas.parentElement;
    const pai = moldura?.parentElement;
    if (!moldura || !pai) return paineis;
    const r = c.canvas.getBoundingClientRect();
    const tela = { x: 0, y: 0, largura: L, altura: A };
    for (const el of Array.from(pai.children)) {
      if (el === moldura || !(el instanceof HTMLElement) || el.hidden) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1 || q.height < 1) continue;
      const ret = { x: q.left - r.left, y: q.top - r.top, largura: q.width, altura: q.height };
      if (sobreposicao(ret, tela) > 0) paineis.push(ret);
    }
    return paineis;
  }

  function esconderAmpliado(v: Visor): void {
    v.flutuante.visible = false;
    v.fio.visible = false;
    v.ponta.visible = false;
    v.candidato = null;
    v.ret = null;
    v.mudanca = null;
  }

  /**
   * Visores ampliados: quais aparecem, de que tamanho e em que lugar da tela. O lugar é escolhido em pixels
   * (`lugarDosVisores.ts`) e levado para o mundo à profundidade da peça. Devolve verdadeiro enquanto algum visor está
   * a caminho de um lugar novo (a cena precisa de quadros).
   */
  function arrumarVisores(agora: number, L: number, A: number): boolean {
    const tela = { x: 0, y: 0, largura: L, altura: A };
    const pedidos: PedidoDeLugar[] = [];
    const estorvos: Estorvo[] = [];
    const medidos = new Map<string, { v: Visor; caixa: CaixaNaTela; porPixel: number }>();
    for (const v of visores.values()) {
      let mostrar = false;
      const peca = c.dispositivos.pecaNaCena(v.uid);
      const caixa = peca && !c.dispositivos.escondida(v.uid) ? caixaNaTela(v.grupo, peca.modelo.volume, L, A) : null;
      if (peca && caixa && sobreposicao(caixa.ret, tela) > 0) {
        estorvos.push({ ret: caixa.ret, peso: PESO.pecaComVisor, tipo: 'coberto', dono: v.uid });
        let legivelNaFace = false;
        if (v.face) {
          // O visor da face basta quando está de frente para a câmera e largo o bastante na tela.
          v.face.getWorldPosition(noMundo);
          paraACamera.copy(c.camera.position).sub(noMundo);
          const distancia = paraACamera.length();
          paraACamera.normalize();
          normal.set(0, 0, 1).transformDirection(v.face.matrixWorld);
          const deFrente = normal.dot(paraACamera);
          legivelNaFace = deFrente > 0.35 && (v.larguraDaFace * deFrente) / metrosPorPixel(distancia) >= VISOR_LEGIVEL_PX;
        }
        mostrar = !legivelNaFace && caixa.profundidade <= VISOR_FLUTUANTE.alcance && pecaAVista(v, peca.modelo.volume);
        if (mostrar) {
          const porPixel = metrosPorPixel(caixa.profundidade);
          // Apagado, o visor ampliado fica menor: diz que a peça está sem energia sem tomar o lugar dos que têm números.
          const largura = THREE.MathUtils.clamp(VISOR_FLUTUANTE.largura / porPixel, VISOR_FLUTUANTE.minimoPx, VISOR_FLUTUANTE.maximoPx) * (v.conteudo?.aceso === false ? 0.65 : 1);
          pedidos.push({ id: v.uid, peca: caixa.ret, largura, altura: (largura * VISOR_ALTURA_PX) / VISOR_LARGURA_PX, anterior: v.candidato });
          medidos.set(v.uid, { v, caixa, porPixel });
        }
      }
      if (!mostrar) esconderAmpliado(v);
    }
    if (pedidos.length === 0) return false;

    // O que o visor evita cobrir: os aparelhos, os botões de ligar e as proteções; e os painéis da página, que o cobririam.
    for (const d of estado.projeto.dispositivos) {
      if (visores.has(d.uid) || c.dispositivos.escondida(d.uid)) continue;
      const peca = c.dispositivos.pecaNaCena(d.uid);
      const grupo = c.dispositivos.grupoDe(d.uid);
      if (!grupo || peca?.item.categoria !== 'aparelho') continue;
      const caixa = caixaNaTela(grupo, peca.modelo.volume, L, A);
      if (caixa && sobreposicao(caixa.ret, tela) > 0) estorvos.push({ ret: caixa.ret, peso: PESO.aparelho, tipo: 'coberto' });
    }
    for (const b of botoes.values()) {
      if (c.dispositivos.escondida(b.uid)) continue;
      const p = pontoNaCena(b.sprite.getWorldPosition(noMundo), L, A);
      if (p) estorvos.push({ ret: { x: p[0] - b.raioPx, y: p[1] - b.raioPx, largura: 2 * b.raioPx, altura: 2 * b.raioPx }, peso: PESO.botao, tipo: 'coberto' });
    }
    for (const ch of listaDeChaves()) {
      const p = pontoNaCena(ch.peca.getWorldPosition(noMundo), L, A);
      if (p) estorvos.push({ ret: { x: p[0] - MEIA_PROTECAO_PX, y: p[1] - MEIA_PROTECAO_PX, largura: 2 * MEIA_PROTECAO_PX, altura: 2 * MEIA_PROTECAO_PX }, peso: PESO.protecao, tipo: 'coberto' });
    }
    for (const ret of paineisSobreACena(agora, L, A)) estorvos.push({ ret, peso: PESO.painel, tipo: 'cobre' });

    const lugares = escolherLugares(pedidos, estorvos, { largura: L, altura: A });
    let mudando = false;
    for (const pedido of pedidos) {
      const { v, caixa, porPixel } = medidos.get(pedido.id)!;
      const lugar = lugares.get(pedido.id);
      if (!lugar) {
        esconderAmpliado(v);
        continue;
      }
      const { largura, altura } = pedido;
      // O lugar é guardado em relação ao meio do topo da caixa da peça: é o que acompanha a peça quando a câmera se move.
      const refX = pedido.peca.x + pedido.peca.largura / 2;
      const refY = pedido.peca.y;
      let dx = lugar.ret.x + largura / 2 - refX;
      let dy = lugar.ret.y + altura / 2 - refY;
      // Mudou de lugar: desliza do lugar em que estava até o novo, em vez de saltar.
      if (v.candidato !== null && v.candidato !== lugar.candidato) v.mudanca = { dx: v.desvio[0] - dx, dy: v.desvio[1] - dy, inicio: agora };
      v.candidato = lugar.candidato;
      if (v.mudanca) {
        const t = (agora - v.mudanca.inicio) / MUDANCA_DE_LUGAR_MS;
        if (t < 0 || t >= 1) v.mudanca = null;
        else {
          const falta = (1 - t) ** 3;
          dx += v.mudanca.dx * falta;
          dy += v.mudanca.dy * falta;
          mudando = true;
        }
      }
      v.desvio = [dx, dy];
      const cx = refX + dx;
      const cy = refY + dy;
      const ret = { x: cx - largura / 2, y: cy - altura / 2, largura, altura };
      v.ret = ret;
      // Tudo no plano que passa pelo meio da peça, de frente para a câmera: ali um pixel mede `porPixel` metros.
      const z = canto.set(0, 0, -caixa.profundidade).applyMatrix4(c.camera.projectionMatrix).z;
      porNaTela(v.flutuante, cx, cy, z, L, A);
      v.flutuante.scale.set(largura * porPixel, altura * porPixel, 1);
      v.flutuante.visible = true;
      // O fio vai da borda do visor a um ponto bem dentro da caixa da peça, o mais perto do visor.
      const [qx, qy] = pontoMaisPerto(pedido.peca, cx, cy, 0.3);
      const [sx, sy] = pontoMaisPerto(ret, qx, qy);
      v.pontaNaTela = [qx, qy];
      const comprimento = Math.hypot(qx - sx, qy - sy);
      const comFio = comprimento >= FIO.minimoPx;
      v.fio.visible = comFio;
      v.ponta.visible = comFio;
      if (!comFio) continue;
      porNaTela(v.fio, (qx + sx) / 2, (qy + sy) / 2, z, L, A);
      v.fio.scale.set(comprimento * porPixel, FIO.espessuraPx * porPixel, 1);
      // De frente para a câmera e deitado ao longo do fio (na tela, o y cresce para baixo).
      giroNaTela.setFromAxisAngle(EIXO_DA_VISTA, Math.atan2(sy - qy, qx - sx));
      v.fio.quaternion.copy(v.grupo.getWorldQuaternion(quatDoGrupo).invert()).multiply(c.camera.quaternion).multiply(giroNaTela);
      porNaTela(v.ponta, qx, qy, z, L, A);
      v.ponta.scale.setScalar(FIO.pontaPx * porPixel);
    }
    return mudando;
  }

  function ajustar(agora: number): boolean {
    c.camera.updateMatrixWorld();
    for (const b of botoes.values()) {
      const porPixel = metrosPorPixel(b.sprite.getWorldPosition(noMundo).distanceTo(c.camera.position));
      const px = THREE.MathUtils.clamp(BOTAO.diametro / porPixel, BOTAO.minimoPx, BOTAO.maximoPx);
      b.raioPx = px / 2;
      b.sprite.scale.setScalar(px * porPixel);
    }
    for (const s of selos) {
      const porPixel = metrosPorPixel(s.sprite.getWorldPosition(noMundo).distanceTo(c.camera.position));
      const altura = THREE.MathUtils.clamp(SELO.altura / porPixel, SELO.minimoPx, SELO.maximoPx) * porPixel * s.fator;
      s.sprite.scale.set(altura * PROPORCAO_DO_SELO, altura, 1);
    }
    return arrumarVisores(agora, Math.max(1, c.canvas.clientWidth), Math.max(1, c.canvas.clientHeight));
  }

  // ---------------------------------------------------------------- Efeitos dos eventos

  /** Ponto de uma peça para os efeitos: o meio da frente dela, em coordenadas da casa. */
  function pontoDaPeca(uid: string): THREE.Vector3 | null {
    const d = dispositivoDe(uid);
    const peca = c.dispositivos.pecaNaCena(uid);
    if (!d || !peca || c.dispositivos.escondida(uid)) return null;
    return new THREE.Vector3(0, peca.modelo.dimensoes[1] * 0.25, peca.modelo.dimensoes[2] / 2).applyQuaternion(new THREE.Quaternion(...d.quat)).add(new THREE.Vector3(...d.pos));
  }

  /** Transforma um evento da operação em fumaça, faísca ou estalo, no lugar de cada peça e de cada cabo envolvido. */
  function mostrarEvento(e: EventoDeOperacao, agora: number): void {
    for (const uid of e.uids) {
      const d = dispositivoDe(uid);
      if (d) {
        const ponto = pontoDaPeca(uid);
        if (!ponto) continue;
        if (e.codigo === 'sobrecarga') efeitos.estalo(ponto, agora);
        else if (e.codigo === 'arco-no-conector') {
          efeitos.faisca(ponto, agora);
          if (d.queimado !== undefined) efeitos.fumaca(ponto, agora + 150);
        } else if (d.queimado !== undefined) {
          efeitos.faisca(ponto, agora);
          efeitos.fumaca(ponto, agora + 150);
        } else if (e.codigo === 'curto-na-bateria') efeitos.faisca(ponto, agora); // a bateria que deu o curto
        continue;
      }
      const cabo = estado.projeto.cabos.find((k) => k.uid === uid);
      if (!cabo || c.cabos.escondido(uid)) continue;
      if (cabo.queimado !== undefined) {
        // O cabo inteiro queimou: fumaça em três pontos dele.
        [0.2, 0.5, 0.8].forEach((fracao, i) => {
          const ponto = c.cabos.pontoNoCaminho(uid, fracao);
          if (!ponto) return;
          if (i === 1) efeitos.faisca(ponto, agora);
          efeitos.fumaca(ponto, agora + i * 180);
        });
      }
      // A proteção do cabo que abriu ou queimou: arco é faísca; desarme e fusível queimado, um estalo.
      cabo.protecoes.forEach((id, indice) => {
        const item = CATALOGO.get(id);
        const situacao = estadoDaProtecao(cabo, indice);
        if (item?.categoria !== 'protecao' || item.tipo === 'dps' || situacao === 'fechada') return;
        const desenho = desenhoDaProtecao(uid, indice);
        if (!desenho) return;
        const ponto = naCasa(desenho);
        if (e.codigo === 'arco-no-disjuntor-ca') {
          efeitos.faisca(ponto, agora);
          efeitos.fumaca(ponto, agora + 150);
        } else {
          efeitos.estalo(ponto, agora);
          if (situacao === 'queimada') efeitos.fumaca(ponto, agora + 100);
        }
      });
    }
  }

  // ---------------------------------------------------------------- Chaves sob o ponteiro

  function listaDeChaves(): Chave[] {
    if (chaves) return chaves;
    chaves = [];
    for (const cabo of estado.projeto.cabos) {
      cabo.protecoes.forEach((id, indice) => {
        const item = CATALOGO.get(id);
        // O DPS não tem chave.
        if (item?.categoria !== 'protecao' || item.tipo === 'dps') return;
        const peca = desenhoDaProtecao(cabo.uid, indice);
        if (peca) chaves!.push({ cabo: cabo.uid, indice, item, peca });
      });
    }
    return chaves;
  }

  const inversa = new THREE.Matrix4();
  const raioLocal = new THREE.Ray();
  const caixa = new THREE.Box3();
  const toque = new THREE.Vector3();

  function chaveNoRaio(raio: THREE.Ray): ChaveNoRaio | null {
    emDia();
    let melhor: ChaveNoRaio | null = null;
    for (const ch of listaDeChaves()) {
      const cabo = estado.projeto.cabos.find((k) => k.uid === ch.cabo);
      if (!cabo) continue;
      ch.peca.updateWorldMatrix(true, false);
      const m = ch.peca.matrixWorld;
      const longe = noMundo.setFromMatrixPosition(m).distanceTo(raio.origin);
      // A caixa da peça, em coordenadas dela, com uma folga de alguns pixels: de longe a proteção é miúda.
      const folga = Math.max(0.003, FOLGA_DA_CHAVE_PX * metrosPorPixel(longe)) / Math.max(1e-6, m.getMaxScaleOnAxis());
      caixaDaChave(ch.item, estadoDaProtecao(cabo, ch.indice), caixa).expandByScalar(folga);
      raioLocal.copy(raio).applyMatrix4(inversa.copy(m).invert());
      if (!raioLocal.intersectBox(caixa, toque)) continue;
      const distancia = toque.applyMatrix4(m).distanceTo(raio.origin);
      if (!melhor || distancia < melhor.distancia) melhor = { cabo: ch.cabo, indice: ch.indice, distancia };
    }
    return melhor;
  }

  function botaoEm(x: number, y: number): BotaoNaTela | null {
    emDia();
    let melhor: (BotaoNaTela & { px: number }) | null = null;
    for (const b of botoes.values()) {
      if (c.dispositivos.escondida(b.uid)) continue;
      const tela = mundoNaTela(b.sprite.getWorldPosition(noMundo));
      if (!tela) continue;
      const px = Math.hypot(tela[0] - x, tela[1] - y);
      if (px > b.raioPx + 3 || (melhor && px >= melhor.px)) continue;
      melhor = { uid: b.uid, distancia: noMundo.distanceTo(c.camera.position), px };
    }
    return melhor ? { uid: melhor.uid, distancia: melhor.distancia } : null;
  }

  // ---------------------------------------------------------------- Dicas

  function dicaDaChave(uidCabo: string, indice: number): string | null {
    const cabo = estado.projeto.cabos.find((k) => k.uid === uidCabo);
    const item = cabo ? CATALOGO.get(cabo.protecoes[indice] ?? '') : undefined;
    if (!cabo || item?.categoria !== 'protecao' || item.tipo === 'dps') return null;
    const situacao = estadoDaProtecao(cabo, indice);
    if (item.tipo === 'fusivel') {
      if (situacao === 'queimada') return `Fusível de ${item.correnteA} A queimado. Clique para ver como trocar.`;
      return situacao === 'aberta'
        ? `Fusível de ${item.correnteA} A fora do porta-fusível: o cabo não conduz. Clique para pôr o fusível.`
        : `Fusível de ${item.correnteA} A colocado. Clique para tirar o fusível (de verdade, só sem corrente passando).`;
    }
    const nome = item.tipo === 'disjuntorCC' ? `Disjuntor CC de ${item.correnteA} A` : `Disjuntor de ${item.correnteA} A`;
    if (situacao === 'queimada') return `${nome} queimado. Clique para ver o conserto.`;
    return situacao === 'aberta'
      ? `${nome} aberto (desligado): alavanca para baixo, janela verde. Clique para fechar o disjuntor.`
      : `${nome} fechado (ligado): alavanca para cima, janela vermelha. Clique para abrir o disjuntor.`;
  }

  function dicaDoBotao(uid: string): string | null {
    const d = dispositivoDe(uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    if (!d || !item) return null;
    if (item.categoria === 'inversor') {
      if (d.falha === 'sobrecarga') return 'Inversor em falha por sobrecarga. Clique para desligar; depois, com menos aparelhos, clique de novo para ligar o inversor.';
      return d.ligado ? 'Inversor ligado. Clique para desligar o inversor.' : 'Inversor desligado. Clique para ligar o inversor.';
    }
    if (!d.ligado) return `${item.nome}: desligado. Clique para ligar.`;
    // Botão ligado e aparelho parado: a dica diz por quê, para o botão verde ao lado da tela apagada não parecer defeito.
    if (item.categoria === 'aparelho' && c.dispositivos.vida(uid)?.comEnergia === false) {
      const uso = usoDe(d, item);
      if (!emUso(uso, horaLocalDe(estado.projeto, estado.tempo.msUtc))) {
        return `${item.nome}: ligado, mas parado: está fora do horário de uso dele (das ${uso.inicio} às ${uso.fim} h). Clique para desligar.`;
      }
      return `${item.nome}: ligado, mas sem energia chegando ao plugue. Clique para desligar.`;
    }
    return `${item.nome}: ligado. Clique para desligar.`;
  }

  // ---------------------------------------------------------------- Estado

  const sujarEstrutura = (): void => {
    estruturaSuja = true;
  };
  const cancelar = [
    assinar('dispositivos', sujarEstrutura),
    assinar('cabos', sujarEstrutura),
    assinar('casa', sujarEstrutura),
    assinar('visao', sujarEstrutura),
    assinar('simulacao', () => {
      visoresSujos = true;
    }),
    assinar('derivados', () => {
      visoresSujos = true;
    }),
    assinar('operacao', () => {
      for (const e of estado.simulacao.eventos) {
        if (mostrados.has(e)) continue;
        mostrados.add(e);
        aMostrar.push(e);
      }
      if (aMostrar.length > 0) c.pedirQuadroLeve();
    }),
  ];

  return {
    animar(agora) {
      if (estruturaSuja) conferirEstrutura();
      if (visoresSujos && agora - ultimaLeitura >= INTERVALO_DOS_VISORES_MS) {
        ultimaLeitura = agora;
        lerVisores();
      }
      if (aMostrar.length > 0) {
        const eventos = aMostrar;
        aMostrar = [];
        for (const e of eventos) mostrarEvento(e, agora);
      }
      const mudandoDeLugar = ajustar(agora);
      return efeitos.animar(agora) || mudandoDeLugar;
    },
    chaveNoRaio,
    botaoEm,
    dicaDaChave,
    dicaDoBotao,
    telaDaProtecao(cabo, indice) {
      emDia();
      const desenho = desenhoDaProtecao(cabo, indice);
      return desenho ? mundoNaTela(desenho.getWorldPosition(noMundo)) : null;
    },
    telaDoBotao(uid) {
      emDia();
      const b = botoes.get(uid);
      return b && !c.dispositivos.escondida(uid) ? mundoNaTela(b.sprite.getWorldPosition(noMundo)) : null;
    },
    textoDoVisor(uid) {
      emDia();
      // Fora do laço da cena, a leitura é feita na hora: quem pergunta quer o número deste instante.
      lerVisores();
      const conteudo = visores.get(uid)?.conteudo;
      return conteudo ? textoDoConteudo(conteudo) : null;
    },
    resumo() {
      emDia();
      // Para quem pergunta, os visores já chegaram ao lugar: a mudança de lugar em curso, ou a que começa agora, é dada por terminada.
      const agora = performance.now();
      if (ajustar(agora)) {
        for (const v of visores.values()) v.mudanca = null;
        ajustar(agora);
      }
      c.pedirQuadroLeve();
      const r = c.canvas.getBoundingClientRect();
      return {
        selos: selos.map((s) => s.id),
        particulas: efeitos.vivas(),
        visoresFlutuando: [...visores.values()].filter((v) => v.flutuante.visible).map((v) => v.uid),
        lugaresDosVisores: [...visores.values()]
          .filter((v) => v.flutuante.visible && v.ret)
          .map((v) => ({ uid: v.uid, x: r.left + v.ret!.x, y: r.top + v.ret!.y, largura: v.ret!.largura, altura: v.ret!.altura, ponta: [r.left + v.pontaNaTela[0], r.top + v.pontaNaTela[1]] as [number, number] })),
      };
    },
    destruir() {
      cancelar.forEach((f) => f());
      for (const v of [...visores.values()]) removerVisor(v);
      for (const b of [...botoes.values()]) removerBotao(b);
      for (const s of selos) s.sprite.parent?.remove(s.sprite);
      selos = [];
      efeitos.destruir();
      c.casa.remove(camada);
      geoFace.dispose();
      for (const t of Object.values(desenhosDoBotao)) t.dispose();
      for (const m of Object.values(materiaisDoBotao)) m.dispose();
      desenhoDoSelo.dispose();
      matSelo.dispose();
      desenhoDoFio.dispose();
      matFio.dispose();
      desenhoDaPonta.dispose();
      matPonta.dispose();
    },
  };
}
