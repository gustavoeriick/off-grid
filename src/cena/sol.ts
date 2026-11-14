// Sol, céu e luz na cena. Especificação: docs/especificacao/cena-e-interface.md, seção 4.

import * as THREE from 'three';
import { direcaoSol, posicaoSol } from '../nucleo/sol';
import type { Local } from '../nucleo/tipos';

const DIA_MS = 86_400_000;
const DIST_LUZ = 50;
const DIST_ESFERA = 45;
const RAIO_CEU = 700;

/** Intensidade da luz do sol a pino. */
const SOL_A_PINO = 3.5;

/**
 * Quanto da luz direta do sol chega ao chão, de 0 a 1, conforme a elevação em graus: o caminho pelo ar
 * (massa de ar de Kasten e Young) apaga o sol junto ao horizonte. É só para o desenho; o cálculo de energia
 * usa `irradiancia` do núcleo. A inclinação de cada face já entra pelo ângulo com a luz, e por isso a
 * intensidade não leva o seno da elevação: com ele a sombra da manhã e da tarde quase sumia.
 */
function transmissaoDoAr(elevacao: number): number {
  if (elevacao <= 0) return 0;
  const massa = 1 / (Math.sin(THREE.MathUtils.degToRad(elevacao)) + 0.50572 * Math.pow(elevacao + 6.07995, -1.6364));
  return Math.pow(0.7, Math.pow(massa, 0.678)) / 0.7;
}
/**
 * Luz de hemisfério (o ambiente), da noite ao dia. O valor de dia é o da especificação e deixa a parede branca
 * em sombra perto de `#aeb0a1`. O da noite é o 0,85 da especificação, azulado, como luar,
 * para a casa continuar legível.
 */
const AMBIENTE_NOITE = 0.85;
const AMBIENTE_DIA = 2.2;

const c = (hex: string): THREE.Color => new THREE.Color(hex);

// Cores do céu: zênite e horizonte, de noite, de dia e na hora dourada.
const ZENITE_NOITE = c('#070c22');
const ZENITE_DIA = c('#3f86d8');
const ZENITE_DOURADO = c('#4a6fb0');
const HORIZONTE_NOITE = c('#141c3d');
const HORIZONTE_DIA = c('#b4daf6');
const HORIZONTE_DOURADO = c('#f6b27a');
const CLARAO_DOURADO = c('#ff8a3d');
const CLARAO_DIA = c('#fff3d6');
// Cores da luz.
const SOL_BAIXO = c('#ff8f45');
const SOL_ALTO = c('#fff3e0');
const CEU_NOITE = c('#9aa9dc');
const CEU_DIA = c('#ffffff');
const CEU_DOURADO = c('#ffd9b8');
const SOLO_NOITE = c('#4d5878');
const SOLO_DIA = c('#a8b59a');

function suave(x: number): number {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

const VERTICE_CEU = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // sempre no fundo
  }
`;

const FRAGMENTO_CEU = /* glsl */ `
  uniform vec3 uZenite;
  uniform vec3 uHorizonte;
  uniform vec3 uClarao;
  uniform vec3 uSol;
  uniform float uEstrelas;
  varying vec3 vDir;

  float acaso(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 cor = mix(uHorizonte, uZenite, pow(h, 0.42));
    // Clarão do lado do sol, mais forte junto ao horizonte.
    vec2 lado = normalize(uSol.xz + vec2(1e-5));
    float rumo = max(dot(normalize(d.xz + vec2(1e-5)), lado), 0.0);
    cor += uClarao * pow(rumo, 3.0) * pow(1.0 - h, 5.0);
    if (uEstrelas > 0.01) {
      vec3 q = d * 190.0;
      vec3 f = fract(q) - 0.5;
      float e = step(0.9975, acaso(floor(q))) * smoothstep(0.4, 0.05, length(f));
      cor += vec3(0.9, 0.93, 1.0) * e * uEstrelas * smoothstep(0.02, 0.25, d.y);
    }
    // Abaixo do horizonte o céu continua com a cor da linha do horizonte.
    gl_FragColor = vec4(cor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function texturaDeBrilho(): THREE.CanvasTexture {
  const t = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = t;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, t, t);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface SolCena {
  grupo: THREE.Group;
  luz: THREE.DirectionalLight;
  /** Reposiciona o sol e ajusta céu e luz para o instante e o local dados. */
  atualizar(msUtc: number, local: Local): void;
  destruir(): void;
}

export function criarSol(cena: THREE.Scene): SolCena {
  const grupo = new THREE.Group();
  grupo.name = 'sol';

  const luz = new THREE.DirectionalLight(SOL_ALTO, SOL_A_PINO);
  luz.castShadow = true;
  luz.shadow.mapSize.set(2048, 2048);
  const cam = luz.shadow.camera;
  cam.left = -18;
  cam.right = 18;
  cam.top = 18;
  cam.bottom = -18;
  cam.near = 20;
  cam.far = 100;
  // A câmera de sombra enxerga todas as camadas: o que o modo de visão esconde continua projetando sombra.
  cam.layers.enableAll();
  luz.shadow.bias = -0.0004;
  luz.shadow.normalBias = 0.03;
  luz.target.position.set(0, 0, 0);
  grupo.add(luz, luz.target);

  const hemisferio = new THREE.HemisphereLight(CEU_DIA, SOLO_DIA, AMBIENTE_DIA);
  grupo.add(hemisferio);

  const uniformes = {
    uZenite: { value: ZENITE_DIA.clone() },
    uHorizonte: { value: HORIZONTE_DIA.clone() },
    uClarao: { value: new THREE.Color(0, 0, 0) },
    uSol: { value: new THREE.Vector3(0, 1, 0) },
    uEstrelas: { value: 0 },
  };
  const materialCeu = new THREE.ShaderMaterial({
    uniforms: uniformes,
    vertexShader: VERTICE_CEU,
    fragmentShader: FRAGMENTO_CEU,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(RAIO_CEU, 32, 16), materialCeu);
  ceu.name = 'ceu';
  ceu.renderOrder = -10;
  ceu.frustumCulled = false;
  grupo.add(ceu);

  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false, toneMapped: false }),
  );
  esfera.name = 'disco-do-sol';
  grupo.add(esfera);

  const texBrilho = texturaDeBrilho();
  const brilho = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texBrilho,
      color: '#ffe9b0',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      transparent: true,
    }),
  );
  brilho.scale.setScalar(13);
  esfera.add(brilho);

  const arco = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ffb300', transparent: true, opacity: 0.7, fog: false, toneMapped: false }),
  );
  arco.name = 'arco-do-sol';
  arco.frustumCulled = false;
  grupo.add(arco);

  const fundo = HORIZONTE_DIA.clone();
  const neblina = new THREE.Fog(fundo.clone(), 110, 620);
  cena.background = fundo;
  cena.fog = neblina;
  cena.add(grupo);

  let chaveDoArco = '';

  function refazerArco(msUtc: number, local: Local): void {
    const fusoMs = local.fuso * 3_600_000;
    const dia = Math.floor((msUtc + fusoMs) / DIA_MS);
    const chave = `${local.id}:${dia}`;
    if (chave === chaveDoArco) return;
    chaveDoArco = chave;
    // Início do dia local, em ms UTC.
    const inicio = dia * DIA_MS - fusoMs;
    const pontos: THREE.Vector3[] = [];
    for (let min = 0; min <= 24 * 60; min += 10) {
      const p = posicaoSol(inicio + min * 60_000, local.lat, local.lon);
      if (p.elevacao < 0) continue;
      const [x, y, z] = direcaoSol(p.azimute, p.elevacao);
      pontos.push(new THREE.Vector3(x, y, z).multiplyScalar(DIST_ESFERA));
    }
    arco.geometry.dispose();
    arco.geometry = new THREE.BufferGeometry().setFromPoints(pontos);
  }

  const dir = new THREE.Vector3();
  const cor = new THREE.Color();

  function atualizar(msUtc: number, local: Local): void {
    const p = posicaoSol(msUtc, local.lat, local.lon);
    const [x, y, z] = direcaoSol(p.azimute, p.elevacao);
    dir.set(x, y, z).normalize();
    const elevacao = p.elevacao;

    /** 0 de noite, 1 de dia: a mesma passagem de −6° a +6° da cor de fundo na especificação. */
    const dia = suave((elevacao + 6) / 12);
    /** 1 com o sol perto do horizonte, 0 com ele alto ou bem abaixo: a hora dourada. */
    const dourado = suave(1 - Math.abs(elevacao - 2) / 16);
    /** 0 com o sol no horizonte, 1 a partir de 35°: quanto a luz já perdeu o tom quente. */
    const alto = suave(elevacao / 35);

    luz.position.copy(dir).multiplyScalar(DIST_LUZ);
    luz.intensity = SOL_A_PINO * transmissaoDoAr(elevacao);
    luz.color.copy(SOL_BAIXO).lerp(SOL_ALTO, alto);

    hemisferio.intensity = AMBIENTE_NOITE + (AMBIENTE_DIA - AMBIENTE_NOITE) * dia;
    hemisferio.color.copy(CEU_NOITE).lerp(CEU_DIA, dia).lerp(CEU_DOURADO, dourado * 0.55);
    hemisferio.groundColor.copy(SOLO_NOITE).lerp(SOLO_DIA, dia);

    uniformes.uZenite.value.copy(ZENITE_NOITE).lerp(ZENITE_DIA, dia).lerp(ZENITE_DOURADO, dourado * 0.6);
    cor.copy(HORIZONTE_NOITE).lerp(HORIZONTE_DIA, dia).lerp(HORIZONTE_DOURADO, dourado * 0.75);
    uniformes.uHorizonte.value.copy(cor);
    uniformes.uClarao.value.copy(CLARAO_DOURADO).lerp(CLARAO_DIA, alto).multiplyScalar(0.15 + 0.75 * dourado).multiplyScalar(suave((elevacao + 8) / 8));
    uniformes.uSol.value.copy(dir);
    uniformes.uEstrelas.value = suave((-elevacao - 1) / 7);
    fundo.copy(cor);
    neblina.color.copy(cor);

    esfera.position.copy(dir).multiplyScalar(DIST_ESFERA);
    esfera.visible = elevacao > -3;
    (esfera.material as THREE.MeshBasicMaterial).color.set('#ff9d57').lerp(cor.set('#fff6d8'), alto);
    brilho.material.color.set('#ff7a30').lerp(cor.set('#ffe9b0'), alto);
    refazerArco(msUtc, local);
  }

  function destruir(): void {
    texBrilho.dispose();
    materialCeu.dispose();
  }

  return { grupo, luz, atualizar, destruir };
}
