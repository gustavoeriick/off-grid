// Cena 3D. Tarefas 1.10 a 1.12. Especificação: docs/especificacao/cena-e-interface.md, seções 2 a 4.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { acoes, assinar, estado } from '../estado';
import { criarCasa } from './casa';
import { criarChao, criarRosaDosVentos } from './mundo';
import { criarSol } from './sol';

export interface OffgridGlobal {
  pronto: boolean;
  estado: () => typeof estado;
  acoes: typeof acoes;
  /** Auxiliar para o roteiro de verificação: posiciona a câmera. */
  posicionarCamera?: (pos: [number, number, number], alvo: [number, number, number]) => void;
}

declare global {
  interface Window {
    __offgrid?: OffgridGlobal;
  }
}

export function criarCena(container: HTMLElement): { destruir(): void } {
  const renderizador = new THREE.WebGLRenderer({ antialias: true });
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = THREE.PCFShadowMap;
  renderizador.domElement.style.display = 'block';
  container.appendChild(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(14, 11, 16);

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
  const pedirQuadro = () => {
    sujo = true;
  };

  controles.addEventListener('change', () => {
    if (controles.target.y < 0) controles.target.y = 0;
    if (camera.position.y < 0.2) camera.position.y = 0.2;
    pedirQuadro();
  });

  const redimensionar = () => {
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

  const refazerCasa = () => {
    casa.reconstruir(estado.projeto.casa);
    pedirQuadro();
  };
  const refazerVisao = () => {
    casa.aplicarVisao(estado.visao);
    pedirQuadro();
  };
  const refazerSol = () => {
    sol.atualizar(estado.tempo.msUtc);
    pedirQuadro();
  };

  refazerCasa();
  refazerVisao();
  refazerSol();

  const cancelar = [
    assinar('projeto', refazerCasa),
    assinar('visao', refazerVisao),
    assinar('tempo', refazerSol),
  ];

  let quadro = 0;
  const laco = () => {
    quadro = requestAnimationFrame(laco);
    if (!sujo) return;
    sujo = false;
    renderizador.render(cena, camera);
  };
  laco();

  window.__offgrid = {
    pronto: true,
    estado: () => estado,
    acoes,
    posicionarCamera(pos, alvo) {
      camera.position.set(...pos);
      controles.target.set(...alvo);
      controles.update();
      pedirQuadro();
    },
  };

  return {
    destruir() {
      cancelar.forEach((c) => c());
      cancelAnimationFrame(quadro);
      observador.disconnect();
      controles.dispose();
      cena.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      renderizador.dispose();
      renderizador.domElement.remove();
      if (window.__offgrid?.pronto) delete window.__offgrid;
    },
  };
}
