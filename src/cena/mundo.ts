// Chão e rosa dos ventos. Especificação: docs/especificacao/cena-e-interface.md, seção 2.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './materiais';

/** Ruído suave e determinístico, entre 0 e 1, para as manchas do gramado. */
function ruido(x: number, z: number): number {
  const v =
    Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27 - 0.4) +
    0.6 * Math.sin(x * 0.83 - z * 0.61 + 2.1) +
    0.35 * Math.sin(x * 1.1 + 0.7) * Math.sin(z * 1.3 + 1.9);
  return THREE.MathUtils.clamp(0.5 + v / 3.9, 0, 1);
}

/**
 * Gramado de 130 × 130 m, com manchas, e em volta dele o mesmo verde até o horizonte. Cobre os obstáculos e as placas
 * no chão, que ficam a até 30 m do meio da casa em qualquer orientação, e a sombra deles.
 */
export function criarChao(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'terreno';

  const geo = new THREE.PlaneGeometry(130, 130, 78, 78);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const cores = new Float32Array(pos.count * 3);
  const cor = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, x, z); // em metros, como o resto da cena
    // Do verde mais seco ao mais viçoso, em torno da cor da especificação; na borda as manchas somem,
    // para o gramado emendar com o chão de longe.
    const n = THREE.MathUtils.lerp(ruido(x, z), 0.5, THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 52, 65));
    cor.setRGB(0.9 + n * 0.22, 0.88 + n * 0.2, 0.8 + n * 0.3);
    cores[i * 3] = cor.r;
    cores[i * 3 + 1] = cor.g;
    cores[i * 3 + 2] = cor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  const chao = new THREE.Mesh(geo, mat.grama);
  chao.name = 'chao';
  chao.receiveShadow = true;
  g.add(chao);

  // Em volta, o mesmo verde, liso, até o horizonte.
  const longe = new THREE.Mesh(new THREE.CircleGeometry(700, 48), mat.gramaLonge);
  longe.rotation.x = -Math.PI / 2;
  longe.name = 'chao-longe';
  longe.receiveShadow = true;
  longe.position.y = -0.03;
  g.add(longe);
  return g;
}

function letra(texto: string, fundo: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.fillStyle = fundo;
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  // Deitada no chão, com o "alto" da letra apontando para −Z (norte).
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** Letras N, L, S e O a 12 m do centro, um anel com marcas e uma seta para o norte (−Z). Presa ao mundo. */
export function criarRosaDosVentos(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'rosa-dos-ventos';
  const R = 12;
  const branco = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });

  // Anel e marcas dos pontos colaterais em uma malha só (nos pontos cardeais ficam as letras).
  const tracos: THREE.BufferGeometry[] = [new THREE.RingGeometry(R - 0.05, R + 0.05, 96)];
  for (let i = 1; i < 8; i += 2) {
    const a = (i * Math.PI) / 4;
    const marca = new THREE.PlaneGeometry(0.12, 0.9);
    marca.rotateZ(-a);
    marca.translate(Math.sin(a) * R, Math.cos(a) * R, 0); // no plano da forma, o norte é +Y
    tracos.push(marca);
  }
  const anel = new THREE.Mesh(mergeGeometries(tracos), branco);
  anel.rotation.x = -Math.PI / 2; // deita no chão: +Y da forma vira −Z, o norte
  anel.position.y = 0.05;
  anel.renderOrder = 1;
  g.add(anel);

  const pontos: [string, number, number, string][] = [
    ['N', 0, -R, '#c62828'],
    ['L', R, 0, '#263238'],
    ['S', 0, R, '#263238'],
    ['O', -R, 0, '#263238'],
  ];
  for (const [t, x, z, fundo] of pontos) {
    const m = letra(t, fundo);
    m.position.set(x, 0.06, z);
    g.add(m);
  }

  // Seta de z = −8 a z = −10,6, apontando para −Z, com contorno branco.
  const seta = (folga: number): THREE.Shape => {
    const f = new THREE.Shape();
    f.moveTo(-0.13 - folga, -folga);
    f.lineTo(0.13 + folga, -folga);
    f.lineTo(0.13 + folga, 1.8 - folga);
    f.lineTo(0.5 + folga * 2.2, 1.8 - folga);
    f.lineTo(0, 2.6 + folga * 1.8);
    f.lineTo(-0.5 - folga * 2.2, 1.8 - folga);
    f.lineTo(-0.13 - folga, 1.8 - folga);
    f.closePath();
    return f;
  };
  const partes: [number, string, number][] = [
    [0.07, '#ffffff', 0.05],
    [0, '#c62828', 0.06],
  ];
  for (const [folga, cor, y] of partes) {
    const m = new THREE.Mesh(
      new THREE.ShapeGeometry(seta(folga)),
      new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2; // forma (x, y) vira (x, −z): o "alto" aponta para −Z
    m.position.set(0, y, -8);
    g.add(m);
  }
  return g;
}
