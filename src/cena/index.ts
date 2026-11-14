// Cena 3D. Tarefas 1.10 a 1.12 e 1.15. Especificação: docs/especificacao/cena-e-interface.md, seções 2 a 4.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { acoes, assinar, estado } from '../estado';
import { localPorId } from '../nucleo/irradiancia';
import { criarCasa } from './casa';
import { criarChao, criarRosaDosVentos } from './mundo';
import { criarSol } from './sol';

export { CAMADA_SO_SOMBRA } from './malha';

export interface OffgridGlobal {
  pronto: boolean;
  estado: () => typeof estado;
  acoes: typeof acoes;
  /** Auxiliar para o roteiro de verificação: posiciona a câmera. */
  posicionarCamera?: (pos: [number, number, number], alvo: [number, number, number]) => void;
  /**
   * Auxiliar de verificação: desenha `n` quadros seguidos e devolve o tempo médio de cada um, em ms, e o que foi desenhado.
   * Com `comSombra` (o padrão) o mapa de sombra é refeito em todo quadro, como quando o tempo corre;
   * sem ele, mede o quadro de quando só a câmera se move.
   */
  /** Auxiliar de verificação: `id` das superfícies de encaixe que o modo de visão atual deixa à vista. */
  superficies?: () => string[];
  medirQuadros?: (n: number, comSombra?: boolean) => { ms: number; chamadas: number; triangulos: number; geometrias: number; texturas: number };
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
  controles.minDistance = 4;
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

  const refazerCasa = (): void => {
    casa.reconstruir(estado.projeto.casa);
    pedirQuadro();
  };
  const refazerVisao = (): void => {
    casa.aplicarVisao(estado.visao);
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

  window.__offgrid = {
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
    destruir() {
      cancelar.forEach((c) => c());
      cancelAnimationFrame(quadro);
      observador.disconnect();
      controles.dispose();
      sol.destruir();
      cena.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      renderizador.dispose();
      renderizador.domElement.remove();
      if (window.__offgrid?.pronto) delete window.__offgrid;
    },
  };
}
