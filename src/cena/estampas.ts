// Texturas desenhadas em canvas para os equipamentos (células, visores, etiquetas) e rótulos que flutuam na cena.
// Não há marca real: o logotipo é um sol genérico e os textos vêm dos dados do catálogo.

import * as THREE from 'three';

export type Pincel = CanvasRenderingContext2D;

interface OpcoesEstampa {
  /** De 0 a 1: quanto a estampa brilha por conta própria (visor aceso). */
  acesa?: number;
  rugosidade?: number;
  transparente?: boolean;
  /** De 0 a 1: força do reflexo do sol. Com este campo, o material é o físico (vidro da placa). */
  reflexo?: number;
}

const estampas = new Map<string, THREE.Material>();
const rotulos = new Map<string, THREE.SpriteMaterial>();

/** Material com a textura desenhada por `desenhar`, guardado por `chave`: peças iguais usam o mesmo. */
export function estampa(chave: string, largura: number, altura: number, desenhar: (g: Pincel, l: number, a: number) => void, o: OpcoesEstampa = {}): THREE.Material {
  let m = estampas.get(chave);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = largura;
  cv.height = altura;
  const g = cv.getContext('2d')!;
  desenhar(g, largura, altura);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const parametros: THREE.MeshStandardMaterialParameters = {
    map: t,
    roughness: o.rugosidade ?? 0.5,
    metalness: 0,
    transparent: o.transparente ?? false,
    ...(o.acesa ? { emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: o.acesa } : {}),
  };
  m = o.reflexo === undefined ? new THREE.MeshStandardMaterial(parametros) : new THREE.MeshPhysicalMaterial({ ...parametros, specularIntensity: o.reflexo });
  if (o.transparente) {
    // Decalque sobre a peça: não grava profundidade e fica um fio à frente dela.
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  estampas.set(chave, m);
  return m;
}

/** Material liso com cor própria, guardado por chave (cabos, anéis dos terminais). */
export function liso(chave: string, criar: () => THREE.Material): THREE.Material {
  let m = estampas.get(chave);
  if (!m) {
    m = criar();
    estampas.set(chave, m);
  }
  return m;
}

// ---------------------------------------------------------------- Desenho

export function retangulo(g: Pincel, x: number, y: number, l: number, a: number, raio: number, cor: string): void {
  g.fillStyle = cor;
  g.beginPath();
  g.roundRect(x, y, l, a, raio);
  g.fill();
}

export function texto(g: Pincel, t: string, x: number, y: number, tamanho: number, cor: string, alinhar: CanvasTextAlign = 'center', peso = 'bold', larguraMax?: number): void {
  g.font = `${peso} ${tamanho}px system-ui, "Segoe UI", Arial, sans-serif`;
  g.textAlign = alinhar;
  g.textBaseline = 'middle';
  g.fillStyle = cor;
  g.fillText(t, x, y, larguraMax);
}

/** Logotipo genérico: um sol de meia-volta sobre uma linha. Não é de nenhuma marca. */
export function logotipo(g: Pincel, x: number, y: number, r: number, cor: string): void {
  g.save();
  g.strokeStyle = cor;
  g.fillStyle = cor;
  g.lineWidth = Math.max(1.5, r * 0.16);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r * 0.5, Math.PI, 0);
  g.closePath();
  g.fill();
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI + (Math.PI * i) / 4;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x - r * 1.05, y + r * 0.2);
  g.lineTo(x + r * 1.05, y + r * 0.2);
  g.stroke();
  g.restore();
}

/** Tomada do padrão brasileiro: rebaixo em losango arredondado com três furos. */
export function tomadaBR(g: Pincel, x: number, y: number, r: number, fundo = '#f4f4f1', rebaixo = '#dcdcd6'): void {
  g.save();
  g.translate(x, y);
  retangulo(g, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5, r * 0.3, fundo);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = Math.max(1, r * 0.06);
  g.strokeRect(-r * 1.25, -r * 1.25, r * 2.5, r * 2.5);
  // Rebaixo sextavado.
  g.fillStyle = rebaixo;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r * 0.78;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.stroke();
  g.fillStyle = '#2a2a2a';
  for (const [fx, fy] of [[-0.48, 0], [0.48, 0], [0, 0.14]] as const) {
    g.beginPath();
    g.arc(fx * r, fy * r, r * 0.11, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Visor de cristal líquido aceso, com um valor grande e uma linha pequena. */
export function visor(g: Pincel, x: number, y: number, l: number, a: number, grande: string, pequeno: string, fundo = '#bfe6ff', tinta = '#10324a'): void {
  retangulo(g, x - 3, y - 3, l + 6, a + 6, 5, '#0a0c0e');
  const grad = g.createLinearGradient(x, y, x, y + a);
  grad.addColorStop(0, fundo);
  grad.addColorStop(1, '#8fc8ee');
  g.fillStyle = grad;
  g.fillRect(x, y, l, a);
  texto(g, grande, x + l / 2, y + a * 0.42, a * 0.5, tinta, 'center', 'bold', l * 0.9);
  texto(g, pequeno, x + l / 2, y + a * 0.82, a * 0.2, tinta, 'center', '600', l * 0.92);
}

/**
 * Lugar do visor na estampa da peça: só a moldura e o vidro apagado. Os números ao vivo são desenhados por cima,
 * em uma textura de cada peça (`visores.ts`), que cobre este retângulo.
 */
export function visorApagado(g: Pincel, x: number, y: number, l: number, a: number): void {
  retangulo(g, x - 3, y - 3, l + 6, a + 6, 5, '#0a0c0e');
  g.fillStyle = '#1a211f';
  g.fillRect(x, y, l, a);
}

// ---------------------------------------------------------------- Rótulos

/**
 * Rótulo que flutua na cena, sempre de frente e do mesmo tamanho na tela (PV+, BAT−, nome da peça).
 * O material é guardado por texto. O rótulo nasce escondido e não responde ao raio do ponteiro.
 */
export function criarRotulo(textoDoRotulo: string, fundo = '#1f2933'): THREE.Sprite {
  const chave = `${fundo}|${textoDoRotulo}`;
  let m = rotulos.get(chave);
  if (!m) {
    const alturaPx = 64;
    const fonte = 'bold 34px system-ui, "Segoe UI", Arial, sans-serif';
    const cv = document.createElement('canvas');
    let g = cv.getContext('2d')!;
    g.font = fonte;
    cv.width = Math.min(1024, Math.ceil(g.measureText(textoDoRotulo).width) + 36);
    cv.height = alturaPx;
    g = cv.getContext('2d')!;
    retangulo(g, 1, 1, cv.width - 2, alturaPx - 2, 14, fundo);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(2, 2, cv.width - 4, alturaPx - 4, 13);
    g.stroke();
    g.font = fonte;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(textoDoRotulo, cv.width / 2, alturaPx / 2 + 2, cv.width - 20);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true });
    m.userData.proporcao = cv.width / alturaPx;
    rotulos.set(chave, m);
  }
  const s = new THREE.Sprite(m);
  // Com `sizeAttenuation` desligado, a escala é fração da altura da tela: cerca de 22 px em uma tela de 800.
  const altura = 0.024;
  s.scale.set(altura * (m.userData.proporcao as number), altura, 1);
  s.center.set(0.5, -0.6);
  s.renderOrder = 10;
  s.visible = false;
  s.raycast = () => {};
  return s;
}

/** Libera texturas e materiais das estampas e dos rótulos. As próximas peças os criam de novo. */
export function liberarEstampas(): void {
  for (const m of [...estampas.values(), ...rotulos.values()]) {
    const mapa = (m as THREE.MeshStandardMaterial).map;
    if (mapa) mapa.dispose();
    m.dispose();
  }
  estampas.clear();
  rotulos.clear();
}
