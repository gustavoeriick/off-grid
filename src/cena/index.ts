// Cena 3D. Tarefas 1.10 a 1.12, 1.15 e 2.1. Especificação: docs/especificacao/cena-e-interface.md, seções 2 a 5, 8, 13 e 14,
// e docs/especificacao/fase-2.md, seção 2.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOGO } from '../catalogo';
import { acoes, assinar, type Encaixe, estado } from '../estado';
import { localPorId } from '../nucleo/irradiancia';
import { type CamadaDeCabos, criarCamadaDeCabos } from './cabos';
import { criarCasa } from './casa';
import { colocarIniciais } from './colocacao';
import { type CamadaDeDispositivos, criarCamadaDeDispositivos } from './dispositivos';
import { encaixar, encaixarNoToque } from './encaixe';
import { liberarEstampas } from './estampas';
import { liberar, type TipoSuperficie } from './malha';
import { liberarMateriais } from './materiais';
import { liberarModelos } from './modelos';
import { liberarTintas } from './molde';
import { criarChao, criarRosaDosVentos } from './mundo';
import { liberarProtecoes } from './protecoes';
import { criarSol } from './sol';

export { comprimentoDoTrecho, corDoCabo } from './cabos';
export type { CamadaDeCabos } from './cabos';
export type { CamadaDeDispositivos, PassagemPeloQuadro, TerminalNaCasa } from './dispositivos';
export { alturaDeApoio, dimensoesDe, encaixar, encaixarNoToque, normalizarGiro, superficieAceita } from './encaixe';
export { CAMADA_SO_SOMBRA } from './malha';

export interface OffgridGlobal {
  pronto: boolean;
  estado: () => typeof estado;
  acoes: typeof acoes;
  /** Auxiliar para o roteiro de verificação: posiciona a câmera. */
  posicionarCamera?: (pos: [number, number, number], alvo: [number, number, number]) => void;
  /** Auxiliar de verificação: `id` das superfícies de encaixe que o modo de visão atual deixa à vista. */
  superficies?: () => string[];
  /**
   * Auxiliar de verificação: desenha `n` quadros seguidos e devolve o tempo médio de cada um, em ms, e o que foi desenhado.
   * Com `comSombra` (o padrão) o mapa de sombra é refeito em todo quadro, como quando o tempo corre;
   * sem ele, mede o quadro de quando só a câmera se move.
   */
  medirQuadros?: (n: number, comSombra?: boolean) => { ms: number; chamadas: number; triangulos: number; geometrias: number; texturas: number };
  /** Posição na janela, em pixels (`[x, y]`), do centro de um dispositivo. Nulo se ele não está na cena. */
  telaDe?: (uid: string) => [x: number, y: number] | null;
  /** Posição na janela, em pixels, de um terminal de um dispositivo. */
  telaDoTerminal?: (uid: string, terminal: string) => [x: number, y: number] | null;
  /** Posição na janela do cartão de um item do catálogo. Quem preenche é a interface (`src/ui/catalogo.ts`). */
  telaDoCartao?: (itemId: string) => [x: number, y: number] | null;
  /**
   * Auxiliar de verificação: encaixe de um item em uma superfície, com o ponto e a normal em coordenadas da casa,
   * para o roteiro montar projetos de teste. É a função `encaixar` da cena.
   */
  encaixar?: (itemId: string, superficie: { id: string; tipo: TipoSuperficie }, ponto: [number, number, number], normal: [number, number, number], giro?: number) => Encaixe;
  /** Auxiliar de verificação: triângulos do modelo de cada item à mostra. */
  triangulosDosModelos?: () => Record<string, number>;
  /** Auxiliar de verificação: as camadas de dispositivos e de cabos da cena (rótulos, terminais, grupos). */
  camadas?: { dispositivos: CamadaDeDispositivos; cabos: CamadaDeCabos };
  /** Pede um quadro novo, depois de mexer nas camadas pelo roteiro. */
  pedirQuadro?: () => void;
}

declare global {
  interface Window {
    __offgrid?: OffgridGlobal;
  }
}

/** O que a cena entrega a quem monta a interação (fase 2). */
export interface Cena {
  cena: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controles: OrbitControls;
  renderizador: THREE.WebGLRenderer;
  /** Grupo que gira com a orientação. Equipamentos e cabos são filhos diretos dele, em coordenadas da casa. */
  casa: THREE.Group;
  /**
   * Pede um quadro novo, com o mapa de sombra refeito. A cena só redesenha quando algo muda:
   * quem mexe em equipamentos ou cabos chama esta função.
   */
  pedirQuadro(): void;
  /** Malhas de encaixe (`userData.superficie`) que o modo de visão atual deixa à vista. */
  superficies(): THREE.Mesh[];
  /** Peças do projeto na cena: grupos, terminais, caixas de clique, rótulos. */
  dispositivos: CamadaDeDispositivos;
  /** Cabos do projeto na cena. */
  cabos: CamadaDeCabos;
  /** Encaixe de um item em uma superfície, em coordenadas da casa (função pura), e a versão que parte do toque de um raio. */
  encaixar: typeof encaixar;
  encaixarNoToque: typeof encaixarNoToque;
  /** Posição na janela, em pixels (`[x, y]`), de um ponto dado em coordenadas da casa. */
  naTela(pontoNaCasa: THREE.Vector3): [x: number, y: number];
  destruir(): void;
}

/** Acima deste intervalo entre quadros seguidos (menos de 25 por segundo), a cena entra no modo econômico. */
const QUADRO_LENTO_MS = 40;
/** Um único intervalo acima deste já basta para entrar no modo econômico. */
const QUADRO_MUITO_LENTO_MS = 120;
/** Com intervalos abaixo deste no modo econômico, o próximo movimento volta a tentar a nitidez inteira. */
const QUADRO_FOLGADO_MS = 20;
/** Fração da nitidez usada no modo econômico. */
const NITIDEZ_ECONOMICA = 0.5;
/** No modo econômico, intervalo mínimo entre duas renovações do mapa de sombra. */
const SOMBRA_ECONOMICA_MS = 200;

export function criarCena(container: HTMLElement): Cena {
  const renderizador = new THREE.WebGLRenderer({ antialias: true });
  const nitidezCheia = Math.min(window.devicePixelRatio || 1, 2);
  renderizador.setPixelRatio(nitidezCheia);
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = THREE.PCFShadowMap;
  // O mapa de sombra só é refeito quando algo além da câmera muda (ver `pedirQuadro`).
  renderizador.shadowMap.autoUpdate = false;
  // Curva que não mexe nos tons médios e só comprime os claros: a parede branca ao sol não estoura
  // e a parede em sombra continua com o tom que a luz de hemisfério lhe dá.
  renderizador.toneMapping = THREE.NeutralToneMapping;
  renderizador.toneMappingExposure = 1;
  renderizador.domElement.style.display = 'block';
  container.appendChild(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  // Com a orientação inicial (frente para o norte), esta é a vista da frente.
  camera.position.set(-14, 11, -16);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.target.set(0, 2.5, 0);
  // A especificação da fase 1 pedia 4 m; para reconhecer um borne ou um disjuntor é preciso chegar mais perto.
  controles.minDistance = 0.8;
  controles.maxDistance = 60;
  controles.maxPolarAngle = Math.PI / 2 - 0.02;
  controles.update();

  cena.add(criarChao());
  cena.add(criarRosaDosVentos());
  const casa = criarCasa();
  cena.add(casa.grupo);
  const sol = criarSol(cena);

  let sujo = true;
  let sombraSuja = true;
  /** Algo mudou na cena (casa, sol, equipamentos): redesenha e refaz o mapa de sombra. */
  const pedirQuadro = (): void => {
    sujo = true;
    sombraSuja = true;
  };

  // Só a câmera mexeu: a sombra continua a mesma, e girar a vista fica mais leve.
  controles.addEventListener('change', () => {
    if (controles.target.y < 0) controles.target.y = 0;
    if (camera.position.y < 0.2) camera.position.y = 0.2;
    sujo = true;
  });

  const redimensionar = (): void => {
    const l = Math.max(1, container.clientWidth);
    const a = Math.max(1, container.clientHeight);
    renderizador.setSize(l, a);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
    pedirQuadro();
  };
  const observador = new ResizeObserver(redimensionar);
  observador.observe(container);
  redimensionar();

  const dispositivos = criarCamadaDeDispositivos(casa.grupo);
  const cabos = criarCamadaDeCabos(casa.grupo, dispositivos);

  /**
   * Leva o estado do projeto para a cena: coloca as peças que chegaram sem posição, refaz os dispositivos e os cabos
   * que mudaram e informa o comprimento dos cabos cujas pontas se moveram. As ações chamadas aqui avisam de novo;
   * o pedido fica guardado e roda em seguida.
   */
  let sincronizando = false;
  let pendente = false;
  const sincronizar = (): void => {
    if (sincronizando) {
      pendente = true;
      return;
    }
    sincronizando = true;
    try {
      do {
        pendente = false;
        const iniciais = colocarIniciais(estado.projeto, CATALOGO);
        if (iniciais.size > 0) acoes.moverDispositivos(iniciais, { historico: false });
        dispositivos.atualizar();
        cabos.atualizar();
      } while (pendente);
    } finally {
      sincronizando = false;
    }
    pedirQuadro();
  };

  const caixaDaCasa = new THREE.Box3();
  const refazerCasa = (): void => {
    casa.reconstruir(estado.projeto.casa);
    dispositivos.atualizarVisao();
    sincronizar();
    // O mapa de sombra acompanha a casa: cobre tudo que ela tem, onde quer que o quartinho esteja.
    sol.enquadrar(caixaDaCasa.setFromObject(casa.grupo));
    pedirQuadro();
  };
  const refazerVisao = (): void => {
    casa.aplicarVisao(estado.visao);
    dispositivos.atualizarVisao();
    cabos.atualizar();
    pedirQuadro();
  };
  const refazerSol = (): void => {
    const local = localPorId(estado.projeto.localId);
    if (!local) throw new Error(`Local desconhecido no projeto: "${estado.projeto.localId}"`);
    sol.atualizar(estado.tempo.msUtc, local);
    pedirQuadro();
  };

  refazerCasa();
  refazerVisao();
  refazerSol();

  const cancelar = [
    // A casa só é refeita quando as medidas ou a orientação mudam; equipamentos e cabos não passam por aqui.
    assinar('casa', refazerCasa),
    assinar('dispositivos', sincronizar),
    assinar('cabos', sincronizar),
    assinar('visao', refazerVisao),
    assinar('tempo', refazerSol),
    // O local do projeto pode mudar (projeto carregado): o sol acompanha.
    assinar('projeto', refazerSol),
  ];

  // Modo econômico, para vídeo fraco ou por software. Se a cena está em movimento (tempo correndo, câmera girando)
  // e os quadros saem a menos de 25 por segundo, ela passa a ser desenhada com metade da nitidez e com o mapa
  // de sombra refeito só de vez em quando. Assim que o movimento para, sai um quadro com a nitidez inteira.
  let economico = false;
  /** O aparelho já precisou do modo econômico: o próximo movimento entra nele logo no segundo quadro. */
  let aparelhoLento = false;
  /** Quadros desenhados em voltas seguidas do laço, e quantos dos últimos intervalos foram lentos ou folgados. */
  let seguidos = 0;
  let lentos = 0;
  let folgados = 0;
  let anterior = 0;
  let ultimaSombra = 0;
  let sondado = false;

  /** Tempo de um quadro inteiro, com o mapa de sombra, lido só depois de a placa de vídeo terminar. */
  const cronometrar = (): number => {
    const gl = renderizador.getContext();
    const ponto = new Uint8Array(4);
    const inicio = performance.now();
    renderizador.shadowMap.needsUpdate = true;
    renderizador.render(cena, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ponto);
    return performance.now() - inicio;
  };

  let quadro = 0;
  const laco = (agora: number): void => {
    quadro = requestAnimationFrame(laco);
    if (!sujo) {
      seguidos = 0;
      lentos = 0;
      folgados = 0;
      if (!sondado) {
        // Primeira pausa depois de abrir: mede um quadro para já saber se o aparelho é lento.
        sondado = true;
        aparelhoLento = cronometrar() > QUADRO_LENTO_MS;
      }
      if (!economico) return;
      // O movimento parou: volta a nitidez inteira e sai o quadro final.
      economico = false;
      renderizador.setPixelRatio(nitidezCheia);
      sombraSuja = true;
    } else {
      if (seguidos > 0) {
        const intervalo = agora - anterior;
        lentos = intervalo > QUADRO_MUITO_LENTO_MS ? 3 : intervalo > QUADRO_LENTO_MS ? lentos + 1 : 0;
        folgados = intervalo < QUADRO_FOLGADO_MS ? folgados + 1 : 0;
      }
      seguidos++;
      anterior = agora;
      if (!economico && (lentos >= 3 || (aparelhoLento && seguidos >= 2))) {
        economico = true;
        aparelhoLento = true;
        renderizador.setPixelRatio(nitidezCheia * NITIDEZ_ECONOMICA);
      }
      // Com metade da nitidez os quadros saem folgados: no próximo movimento, tenta de novo a nitidez inteira.
      if (economico && folgados >= 20) aparelhoLento = false;
    }
    sujo = false;
    if (sombraSuja && (!economico || agora - ultimaSombra >= SOMBRA_ECONOMICA_MS)) {
      renderizador.shadowMap.needsUpdate = true;
      sombraSuja = false;
      ultimaSombra = agora;
    }
    renderizador.render(cena, camera);
  };
  laco(performance.now());

  const projetado = new THREE.Vector3();
  /** Posição na janela de um ponto do mundo. */
  const mundoNaTela = (ponto: THREE.Vector3): [number, number] => {
    camera.updateMatrixWorld();
    projetado.copy(ponto).project(camera);
    const r = renderizador.domElement.getBoundingClientRect();
    return [r.left + ((projetado.x + 1) / 2) * r.width, r.top + ((1 - projetado.y) / 2) * r.height];
  };
  const naTela = (pontoNaCasa: THREE.Vector3): [number, number] => {
    casa.grupo.updateWorldMatrix(true, false);
    return mundoNaTela(pontoNaCasa.clone().applyMatrix4(casa.grupo.matrixWorld));
  };

  window.__offgrid = {
    // A interface pode ter registrado auxiliares antes da cena (`telaDoCartao`): eles continuam.
    ...window.__offgrid,
    pronto: true,
    estado: () => estado,
    acoes,
    posicionarCamera(pos, alvo) {
      camera.position.set(...pos);
      controles.target.set(...alvo);
      controles.update();
      sujo = true;
    },
    superficies: () => casa.superficies().map((m) => (m.userData.superficie as { id: string }).id),
    telaDe(uid) {
      const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
      return d && dispositivos.grupoDe(uid) ? naTela(new THREE.Vector3(...d.pos)) : null;
    },
    telaDoTerminal(uid, terminal) {
      const t = dispositivos.terminal(uid, terminal);
      return t ? naTela(t.pos) : null;
    },
    encaixar(itemId, superficie, ponto, normal, giro = 0) {
      const item = CATALOGO.get(itemId);
      if (!item) throw new Error(`Item desconhecido no catálogo: "${itemId}"`);
      return encaixar(item, superficie, ponto, normal, giro);
    },
    triangulosDosModelos: () => dispositivos.triangulos(),
    camadas: { dispositivos, cabos },
    pedirQuadro,
    medirQuadros(n, comSombra = true) {
      const gl = renderizador.getContext();
      const ponto = new Uint8Array(4);
      // Ler um ponto obriga a placa de vídeo a terminar o quadro antes de o relógio ser lido.
      const desenhar = (): void => {
        if (comSombra) renderizador.shadowMap.needsUpdate = true;
        renderizador.render(cena, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ponto);
      };
      desenhar();
      const inicio = performance.now();
      for (let i = 0; i < n; i++) desenhar();
      const ms = (performance.now() - inicio) / n;
      sujo = true; // o quadro da tela volta a ser o do laço
      const { render, memory } = renderizador.info;
      return { ms, chamadas: render.calls, triangulos: render.triangles, geometrias: memory.geometries, texturas: memory.textures };
    },
  };

  return {
    cena,
    camera,
    controles,
    renderizador,
    casa: casa.grupo,
    pedirQuadro,
    superficies: () => casa.superficies(),
    dispositivos,
    cabos,
    encaixar,
    encaixarNoToque,
    naTela,
    destruir() {
      cancelar.forEach((c) => c());
      cancelAnimationFrame(quadro);
      observador.disconnect();
      controles.dispose();
      // Geometrias, materiais, texturas e mapa de sombra de tudo: casa, terreno, rosa dos ventos e sol.
      dispositivos.destruir();
      cabos.destruir();
      liberar(cena, true);
      sol.destruir();
      liberarMateriais();
      // Moldes, tintas e estampas dos equipamentos: uma cena nova os refaz.
      liberarModelos();
      liberarProtecoes();
      liberarTintas();
      liberarEstampas();
      cena.clear();
      renderizador.dispose();
      renderizador.domElement.remove();
      if (window.__offgrid?.pronto) delete window.__offgrid;
    },
  };
}
