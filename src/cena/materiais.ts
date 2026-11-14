// Materiais da casa e do terreno, com texturas desenhadas em canvas (não há arquivos de imagem).
// As texturas são quase brancas e a cor de cada material vem da especificação (seção 3): a textura só dá a variação.

import * as THREE from 'three';
import { sorteio } from './malha';

type Desenho = (g: CanvasRenderingContext2D, tam: number, r: () => number) => void;

/** Textura que se repete a cada `mx` × `my` metros (as coordenadas de textura das malhas estão em metros). */
function textura(tam: number, mx: number, my: number, semente: number, desenhar: Desenho): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const g = c.getContext('2d')!;
  desenhar(g, tam, sorteio(semente));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / mx, 1 / my);
  // Filtro anisotrópico moderado: segura o desenho do piso visto de lado sem pesar em vídeo fraco.
  t.anisotropy = 2;
  return t;
}

function cinza(v: number): string {
  const n = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
  return `rgb(${n},${n},${n})`;
}

/** Fundo claro com manchas e grãos, para reboco, concreto e grama. */
function granulado(g: CanvasRenderingContext2D, tam: number, r: () => number, base: number, forca: number, graos: number): void {
  g.fillStyle = cinza(base);
  g.fillRect(0, 0, tam, tam);
  // Manchas largas, desenhadas nas quatro repetições para a emenda não aparecer.
  for (let i = 0; i < 26; i++) {
    const x = r() * tam;
    const y = r() * tam;
    const raio = (0.08 + r() * 0.2) * tam;
    const v = base + (r() - 0.5) * forca * 1.6;
    for (const dx of [-tam, 0, tam]) {
      for (const dy of [-tam, 0, tam]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, raio);
        const n = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
        grad.addColorStop(0, `rgba(${n},${n},${n},0.3)`);
        grad.addColorStop(1, `rgba(${n},${n},${n},0)`);
        g.fillStyle = grad;
        g.fillRect(x + dx - raio, y + dy - raio, raio * 2, raio * 2);
      }
    }
  }
  for (let i = 0; i < graos; i++) {
    const v = base + (r() - 0.5) * forca * 2.4;
    g.fillStyle = cinza(v);
    g.globalAlpha = 0.35 + r() * 0.4;
    const s = 1 + Math.floor(r() * 2);
    g.fillRect(r() * tam, r() * tam, s, s);
  }
  g.globalAlpha = 1;
}

const texReboco = textura(256, 2.4, 2.4, 11, (g, tam, r) => granulado(g, tam, r, 0.96, 0.035, 2500));

const texConcreto = textura(256, 2.4, 2.4, 23, (g, tam, r) => {
  granulado(g, tam, r, 0.9, 0.1, 9000);
  // Juntas de dilatação a cada 1,2 m.
  g.strokeStyle = 'rgba(70,66,60,0.55)';
  g.lineWidth = 2;
  for (const p of [0, tam / 2]) {
    g.beginPath();
    g.moveTo(p + 1, 0);
    g.lineTo(p + 1, tam);
    g.moveTo(0, p + 1);
    g.lineTo(tam, p + 1);
    g.stroke();
  }
});

const texCimento = textura(256, 2, 2, 29, (g, tam, r) => granulado(g, tam, r, 0.9, 0.09, 7000));

/** Cerâmica: 2 × 2 peças por repetição, com rejunte. */
function ceramica(lado: number, semente: number, rejunte: string): THREE.CanvasTexture {
  return textura(256, lado * 2, lado * 2, semente, (g, tam, r) => {
    const m = tam / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const v = 0.93 + (r() - 0.5) * 0.06;
        g.fillStyle = cinza(v);
        g.fillRect(i * m, j * m, m, m);
        // Leve nuvem em cada peça.
        for (let k = 0; k < 5; k++) {
          const x = i * m + r() * m;
          const y = j * m + r() * m;
          const raio = (0.15 + r() * 0.3) * m;
          const grad = g.createRadialGradient(x, y, 0, x, y, raio);
          grad.addColorStop(0, `rgba(255,255,255,${0.1 + r() * 0.12})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.save();
          g.beginPath();
          g.rect(i * m, j * m, m, m);
          g.clip();
          g.fillStyle = grad;
          g.fillRect(x - raio, y - raio, raio * 2, raio * 2);
          g.restore();
        }
      }
    }
    g.strokeStyle = rejunte;
    g.lineWidth = 3;
    for (const p of [0, m, tam]) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, tam);
      g.moveTo(0, p);
      g.lineTo(tam, p);
      g.stroke();
    }
  });
}

/** Tábuas corridas: réguas de 12 cm ao longo de X, com emendas desencontradas. */
const texTabuas = textura(512, 1.92, 1.92, 37, (g, tam, r) => {
  const reguas = 16;
  const h = tam / reguas;
  for (let i = 0; i < reguas; i++) {
    let x = -r() * tam * 0.5;
    while (x < tam) {
      const comp = (0.35 + r() * 0.4) * tam;
      const v = 0.86 + (r() - 0.5) * 0.2;
      g.fillStyle = cinza(v);
      g.fillRect(x, i * h, comp, h);
      // Veios.
      g.strokeStyle = `rgba(60,40,20,${0.05 + r() * 0.08})`;
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const y = i * h + 2 + r() * (h - 4);
        g.beginPath();
        g.moveTo(Math.max(0, x), y);
        g.bezierCurveTo(x + comp * 0.3, y + (r() - 0.5) * 3, x + comp * 0.6, y + (r() - 0.5) * 3, x + comp, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,25,10,0.5)';
      g.fillRect(x + comp - 1, i * h, 1.5, h);
      x += comp;
    }
    g.fillStyle = 'rgba(40,25,10,0.45)';
    g.fillRect(0, i * h, tam, 1.5);
  }
});

/** Madeira com veios ao longo de Y (portas, pilares) ou de X (vigas), conforme a repetição. */
const texMadeira = textura(256, 0.8, 0.8, 41, (g, tam, r) => {
  g.fillStyle = cinza(0.9);
  g.fillRect(0, 0, tam, tam);
  for (let i = 0; i < 90; i++) {
    const x = r() * tam;
    g.strokeStyle = r() < 0.5 ? `rgba(50,30,12,${0.05 + r() * 0.12})` : `rgba(255,240,220,${0.04 + r() * 0.08})`;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (r() - 0.5) * 8, tam * 0.33, x + (r() - 0.5) * 8, tam * 0.66, x, tam);
    g.stroke();
  }
});

const texGrama = textura(512, 6, 6, 53, (g, tam, r) => {
  granulado(g, tam, r, 0.86, 0.16, 0);
  // Tufos: riscos curtos, mais claros e mais escuros.
  for (let i = 0; i < 26000; i++) {
    const x = r() * tam;
    const y = r() * tam;
    const claro = r() < 0.5;
    const a = 0.1 + r() * 0.22;
    g.strokeStyle = claro ? `rgba(255,255,225,${a})` : `rgba(30,60,20,${a})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 1.5 - r() * 3);
    g.stroke();
  }
});

/** Média de uma textura, em valores lineares, para pintar de longe uma superfície sem a textura. */
function mediaLinear(t: THREE.CanvasTexture): THREE.Color {
  const cv = t.image as HTMLCanvasElement;
  const dados = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
  const soma = new THREE.Color(0, 0, 0);
  const px = new THREE.Color();
  const passo = 4 * 7; // um a cada sete pontos basta
  let n = 0;
  for (let i = 0; i < dados.length; i += passo) {
    px.setRGB(dados[i]! / 255, dados[i + 1]! / 255, dados[i + 2]! / 255, THREE.SRGBColorSpace);
    soma.add(px);
    n++;
  }
  return soma.multiplyScalar(1 / n);
}

function padrao(cor: string, mapa: THREE.Texture | null, rugosidade: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, map: mapa, roughness: rugosidade, metalness: 0, ...extra });
}

/**
 * Material fosco (reboco, telha, madeira bruta, concreto, grama): só luz difusa, sem brilho.
 * É bem mais leve de desenhar que o material padrão, e nessas superfícies o brilho não faria diferença.
 */
function fosco(cor: string, mapa: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ color: cor, map: mapa, ...extra });
}

/** Cores da seção 3 da especificação. */
export const COR = {
  parede: '#f2efe6',
  telha: '#b5532d',
  pisoTerreo: '#cfc8b8',
  pisoSuperior: '#b08d62',
  pilar: '#e8e2d2',
  quartinho: '#e6dfcf',
  grama: '#7fae6b',
};

/** Cores por faixa das malhas de um material só (ver `Construtor.malhaColorida`). */
export const cor = {
  parede: new THREE.Color(COR.parede),
  /** Barrado: faixa pintada no pé da parede de fora, que disfarça respingo de chuva. */
  barrado: new THREE.Color('#cdbfa6'),
  dentro: new THREE.Color('#f4f1e9'),
  rodape: new THREE.Color('#6d4a2c'),
  teto: new THREE.Color('#f6f4ee'),
  esquadria: new THREE.Color('#5d3d24'),
  porta: new THREE.Color('#6b4426'),
  almofada: new THREE.Color('#7a4f2d'),
  pedra: new THREE.Color('#8d8a84'),
  metal: new THREE.Color('#b9b4a8'),
  madeira: new THREE.Color('#84593a'),
  caixaDeFerramentas: new THREE.Color('#b3261e'),
  lata: new THREE.Color('#3f6f9f'),
};

export const mat = {
  /** Reboco pintado; a cor de cada faixa (parede, barrado, parede de dentro, rodapé) vai nos vértices. */
  reboco: fosco('#ffffff', texReboco, { vertexColors: true }),
  /** Madeira envernizada de portas e caixilhos; a cor vai nos vértices. */
  madeiraCores: padrao('#ffffff', texMadeira, 0.62, { vertexColors: true }),
  /** Peças lisas (pedra, ferragens, miudezas); a cor vai nos vértices. */
  lisoCores: padrao('#ffffff', null, 0.5, { vertexColors: true }),
  teto: fosco('#f6f4ee', null),
  /** A cor de cada telha vai por instância; a base fica branca. */
  telha: fosco('#ffffff', null, { side: THREE.DoubleSide }),
  argamassa: fosco('#d9d2c3', texReboco),
  madeiramento: fosco('#7b5433', null),
  madeira: fosco('#84593a', texMadeira),
  vidro: padrao('#a9cbdc', null, 0.08, { transparent: true, opacity: 0.32, depthWrite: false }),
  pisoTerreo: padrao(COR.pisoTerreo, ceramica(0.45, 61, 'rgba(105,98,86,0.8)'), 0.55),
  pisoVaranda: padrao('#c9b199', ceramica(0.3, 67, 'rgba(90,78,66,0.8)'), 0.75),
  pisoSuperior: padrao(COR.pisoSuperior, texTabuas, 0.6),
  degrau: fosco('#c3bbab', texCimento),
  pilar: fosco(COR.pilar, texReboco),
  quartinho: fosco(COR.quartinho, texReboco),
  cimento: fosco('#aeaaa1', texCimento),
  calcada: fosco('#c2beb4', texConcreto),
  grama: fosco(COR.grama, texGrama, { vertexColors: true }),
  /** O gramado visto de longe: a mesma cor, sem a textura, que a essa distância só faria desenhos repetidos. */
  gramaLonge: fosco(COR.grama, null),
  /** Malha de encaixe: não é desenhada, mas o raio do ponteiro a acerta. */
  encaixe: new THREE.MeshBasicMaterial({ visible: false }),
  /** Laje só de sombra, na camada que a câmera da tela não enxerga. */
  soSombra: new THREE.MeshBasicMaterial({ color: '#000000' }),
};

/**
 * Libera da placa de vídeo os materiais e as texturas compartilhados. Eles continuam valendo:
 * se uma cena nova os usar, o Three.js os envia de novo.
 */
export function liberarMateriais(): void {
  for (const m of Object.values(mat)) {
    if ('map' in m && m.map) m.map.dispose();
    m.dispose();
  }
}

// Cor média do gramado: a da especificação vezes a média da textura e a média das manchas (ver mundo.ts).
mat.gramaLonge.color.multiply(mediaLinear(texGrama)).multiply(new THREE.Color(1.01, 0.98, 0.95));
