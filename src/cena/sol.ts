// Sol na cena. Especificação: docs/especificacao/cena-e-interface.md, seção 4.

import * as THREE from 'three';
import { direcaoSol, posicaoSol } from '../nucleo/sol';

/** Local fixo: Rio de Janeiro. */
const LAT = -22.9;
const LON = -43.2;
const FUSO_H = -3;

const DIA_MS = 86_400_000;
const DIST_LUZ = 50;
const DIST_ESFERA = 45;
const COR_NOITE = new THREE.Color('#0b1026');
const COR_DIA = new THREE.Color('#9fd0f5');
/** Luz de hemisfério (ambiente) à noite e de dia. A especificação diz 0,5 de dia; subi para as faces em sombra lerem como parede clara. */
const AMBIENTE_NOITE = 0.12;
const AMBIENTE_DIA = 2.2;

export interface LeituraSol {
  /** Vetor unitário que aponta para o sol (X leste, Y cima, Z sul). */
  dir: THREE.Vector3;
  elevacao: number;
  /** Falso quando o núcleo ainda não calcula o sol e a cena usa um sol fixo provisório. */
  real: boolean;
}

/** Sol do meio-dia de inverno no Rio, usado enquanto `posicaoSol` não existe. */
const PROVISORIO: LeituraSol = {
  dir: new THREE.Vector3(0, Math.sin(0.75), -Math.cos(0.75)),
  elevacao: 43,
  real: false,
};

function ler(msUtc: number): LeituraSol {
  try {
    const p = posicaoSol(msUtc, LAT, LON);
    const [x, y, z] = direcaoSol(p.azimute, p.elevacao);
    return { dir: new THREE.Vector3(x, y, z).normalize(), elevacao: p.elevacao, real: true };
  } catch {
    return PROVISORIO;
  }
}

function suave(x: number): number {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

export interface SolCena {
  grupo: THREE.Group;
  luz: THREE.DirectionalLight;
  atualizar(msUtc: number): void;
}

export function criarSol(cena: THREE.Scene): SolCena {
  const grupo = new THREE.Group();
  grupo.name = 'sol';

  const luz = new THREE.DirectionalLight('#fff4e0', 3.5);
  luz.castShadow = true;
  luz.shadow.mapSize.set(2048, 2048);
  const cam = luz.shadow.camera;
  cam.left = -18;
  cam.right = 18;
  cam.top = 18;
  cam.bottom = -18;
  cam.near = 20;
  cam.far = 100;
  luz.shadow.bias = -0.0004;
  luz.shadow.normalBias = 0.03;
  luz.target.position.set(0, 0, 0);
  grupo.add(luz, luz.target);

  const hemisferio = new THREE.HemisphereLight('#ffffff', '#a8b59a', AMBIENTE_DIA);
  grupo.add(hemisferio);

  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#ffd54f', fog: false }),
  );
  grupo.add(esfera);

  const arco = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ffb300', transparent: true, opacity: 0.7 }),
  );
  arco.frustumCulled = false;
  grupo.add(arco);

  cena.background = COR_NOITE.clone();
  cena.add(grupo);

  let diaDoArco = Number.NaN;

  function refazerArco(msUtc: number): void {
    // Início do dia local, em ms UTC.
    const dia = Math.floor((msUtc + FUSO_H * 3_600_000) / DIA_MS);
    if (dia === diaDoArco) return;
    diaDoArco = dia;
    const inicio = dia * DIA_MS - FUSO_H * 3_600_000;
    const pontos: THREE.Vector3[] = [];
    for (let min = 0; min <= 24 * 60; min += 10) {
      const l = ler(inicio + min * 60_000);
      if (l.real && l.elevacao >= 0) pontos.push(l.dir.clone().multiplyScalar(DIST_ESFERA));
    }
    arco.geometry.dispose();
    arco.geometry = new THREE.BufferGeometry().setFromPoints(pontos);
  }

  function atualizar(msUtc: number): void {
    const l = ler(msUtc);
    luz.position.copy(l.dir).multiplyScalar(DIST_LUZ);
    luz.intensity = 3.5 * Math.max(0, Math.sin(THREE.MathUtils.degToRad(l.elevacao)));
    const dia = suave((l.elevacao + 6) / 12);
    hemisferio.intensity = AMBIENTE_NOITE + (AMBIENTE_DIA - AMBIENTE_NOITE) * dia;
    (cena.background as THREE.Color).copy(COR_NOITE).lerp(COR_DIA, dia);
    esfera.position.copy(l.dir).multiplyScalar(DIST_ESFERA);
    esfera.visible = l.elevacao > -3;
    refazerArco(msUtc);
  }

  return { grupo, luz, atualizar };
}
