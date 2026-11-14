// Chão e rosa dos ventos. Especificação: docs/especificacao/cena-e-interface.md, seção 2.

import * as THREE from 'three';

export function criarChao(): THREE.Mesh {
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: '#7fae6b', roughness: 1 }),
  );
  chao.name = 'chao';
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  return chao;
}

function letra(texto: string, cor: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = cor;
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  // Deitada no chão, com o "alto" da letra apontando para −Z (norte).
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Letras N, L, S e O a 12 m do centro e uma seta para o norte (−Z). Presa ao mundo. */
export function criarRosaDosVentos(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'rosa-dos-ventos';
  const R = 12;
  const pontos: [string, number, number, string][] = [
    ['N', 0, -R, '#c62828'],
    ['L', R, 0, '#ffffff'],
    ['S', 0, R, '#ffffff'],
    ['O', -R, 0, '#ffffff'],
  ];
  for (const [t, x, z, cor] of pontos) {
    const m = letra(t, cor);
    m.position.set(x, 0.04, z);
    g.add(m);
  }
  // Seta de z = −8 a z = −11, apontando para −Z.
  const forma = new THREE.Shape();
  forma.moveTo(-0.12, 0);
  forma.lineTo(0.12, 0);
  forma.lineTo(0.12, 2.2);
  forma.lineTo(0.45, 2.2);
  forma.lineTo(0, 3.0);
  forma.lineTo(-0.45, 2.2);
  forma.lineTo(-0.12, 2.2);
  forma.closePath();
  const seta = new THREE.Mesh(
    new THREE.ShapeGeometry(forma),
    new THREE.MeshBasicMaterial({ color: '#c62828', side: THREE.DoubleSide }),
  );
  seta.rotation.x = -Math.PI / 2; // forma (x, y) vira (x, −z): o "alto" aponta para −Z
  seta.position.set(0, 0.04, -8);
  g.add(seta);
  return g;
}
