// Efeitos breves da operação: fumaça da peça que queima, faísca do arco e o estalo da proteção que abre.
// Especificação: docs/especificacao/operar.md, seção 7. Tarefa 8.3.
//
// Poucas partículas (retângulos sempre de frente para a câmera), que acabam sozinhas. O tempo é o do relógio de verdade,
// e não o da simulação: com o relógio simulado em pausa o efeito termina do mesmo jeito.

import * as THREE from 'three';

export interface Efeitos {
  /** Fumaça que sobe por alguns segundos, a partir de um ponto dado em coordenadas da casa. */
  fumaca(ponto: THREE.Vector3, agoraMs: number): void;
  /** Faísca de arco: clarão, fagulhas e um resto de fumaça. */
  faisca(ponto: THREE.Vector3, agoraMs: number): void;
  /** Estalo curto de proteção que abre ou de inversor que desliga: um anel que se abre e um clarão pequeno. */
  estalo(ponto: THREE.Vector3, agoraMs: number): void;
  /** Avança as partículas. Devolve verdadeiro enquanto houver alguma na tela (a cena precisa de quadros novos). */
  animar(agoraMs: number): boolean;
  /** Quantas partículas estão vivas, para a verificação. */
  vivas(): number;
  destruir(): void;
}

type Desenho = 'fumaca' | 'clarao' | 'anel';

interface Particula {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  /** Instante em que aparece e quanto dura, em milissegundos. */
  nasce: number;
  dura: number;
  origem: THREE.Vector3;
  /** Metros por segundo, em coordenadas da casa. */
  velocidade: THREE.Vector3;
  /** Aceleração para baixo, em m/s². */
  queda: number;
  /** Tamanho no começo e no fim, em metros, e o menor tamanho na tela, em pixels. */
  de: number;
  ate: number;
  minimoPx: number;
  opacidade: number;
  desenho: Desenho;
}

function tela(lado: number, desenhar: (g: CanvasRenderingContext2D, l: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = lado;
  desenhar(cv.getContext('2d')!, lado);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function criarEfeitos(pai: THREE.Group, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): Efeitos {
  const grupo = new THREE.Group();
  grupo.name = 'efeitos';
  pai.add(grupo);

  const texturas: Record<Desenho, THREE.CanvasTexture> = {
    // Tufo de fumaça: vários borrões cinzentos, mais fechados no meio.
    fumaca: tela(96, (g, l) => {
      for (const [dx, dy, r, a] of [[0, 0, 0.46, 0.8], [-0.14, 0.08, 0.3, 0.6], [0.15, -0.06, 0.28, 0.6], [0.04, 0.16, 0.26, 0.5], [-0.06, -0.15, 0.24, 0.5]] as const) {
        const x = l * (0.5 + dx);
        const y = l * (0.5 + dy);
        const grad = g.createRadialGradient(x, y, 0, x, y, l * r);
        grad.addColorStop(0, `rgba(44,41,39,${a})`);
        grad.addColorStop(0.6, `rgba(52,49,46,${a * 0.55})`);
        grad.addColorStop(1, 'rgba(58,54,51,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, l, l);
      }
    }),
    // Clarão: miolo branco, borda amarelada e quatro raios.
    clarao: tela(96, (g, l) => {
      const grad = g.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.22, 'rgba(255,244,190,0.95)');
      grad.addColorStop(0.5, 'rgba(255,170,40,0.45)');
      grad.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, l, l);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 4) * i + 0.3;
        g.beginPath();
        g.moveTo(l / 2 - Math.cos(a) * l * 0.46, l / 2 - Math.sin(a) * l * 0.46);
        g.lineTo(l / 2 + Math.cos(a) * l * 0.46, l / 2 + Math.sin(a) * l * 0.46);
        g.stroke();
      }
    }),
    // Anel do estalo: traço claro com borda escura, para aparecer sobre peça clara e sobre peça escura.
    anel: tela(96, (g, l) => {
      for (const [largura, cor] of [[11, 'rgba(60,20,0,0.7)'], [6, '#ffb020'], [2, '#ffffff']] as const) {
        g.beginPath();
        g.arc(l / 2, l / 2, l * 0.4, 0, Math.PI * 2);
        g.lineWidth = largura;
        g.strokeStyle = cor;
        g.stroke();
      }
    }),
  };

  let particulas: Particula[] = [];

  function soltar(desenho: Desenho, origem: THREE.Vector3, p: Omit<Particula, 'sprite' | 'material' | 'origem' | 'desenho'>): void {
    const material = new THREE.SpriteMaterial({
      map: texturas[desenho], transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      // O clarão soma luz; a fumaça e o anel cobrem. Só a fumaça fica atrás de parede: clarão e anel dizem onde foi.
      blending: desenho === 'clarao' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthTest: desenho === 'fumaca',
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `efeito-${desenho}`;
    sprite.visible = false;
    sprite.renderOrder = desenho === 'fumaca' ? 20 : 21;
    sprite.raycast = () => {};
    grupo.add(sprite);
    particulas.push({ ...p, sprite, material, origem: origem.clone(), desenho });
  }

  const acaso = (de: number, ate: number): number => de + Math.random() * (ate - de);

  function tufos(ponto: THREE.Vector3, agora: number, quantos: number, intervalo: number, tamanho: number): void {
    for (let i = 0; i < quantos; i++) {
      soltar('fumaca', ponto, {
        nasce: agora + i * intervalo,
        dura: acaso(1700, 2300),
        velocidade: new THREE.Vector3(acaso(-0.06, 0.06), acaso(0.2, 0.34), acaso(-0.06, 0.06)),
        queda: 0,
        de: 0.09 * tamanho,
        ate: acaso(0.34, 0.46) * tamanho,
        minimoPx: 16,
        opacidade: 0.9,
      });
    }
  }

  function fagulhas(ponto: THREE.Vector3, agora: number, quantas: number, forca: number): void {
    for (let i = 0; i < quantas; i++) {
      const direcao = new THREE.Vector3(acaso(-1, 1), acaso(-0.2, 1), acaso(-1, 1)).normalize().multiplyScalar(acaso(0.5, 1.3) * forca);
      soltar('clarao', ponto, { nasce: agora, dura: acaso(300, 520), velocidade: direcao, queda: 3.2, de: 0.03, ate: 0.012, minimoPx: 4, opacidade: 1 });
    }
  }

  const noMundo = new THREE.Vector3();

  return {
    fumaca(ponto, agora) {
      tufos(ponto, agora, 14, 230, 1);
    },
    faisca(ponto, agora) {
      soltar('clarao', ponto, { nasce: agora, dura: 260, velocidade: new THREE.Vector3(), queda: 0, de: 0.08, ate: 0.34, minimoPx: 34, opacidade: 1 });
      fagulhas(ponto, agora, 9, 1);
      tufos(ponto, agora + 120, 3, 200, 0.6);
    },
    estalo(ponto, agora) {
      soltar('anel', ponto, { nasce: agora, dura: 380, velocidade: new THREE.Vector3(), queda: 0, de: 0.03, ate: 0.24, minimoPx: 30, opacidade: 1 });
      soltar('clarao', ponto, { nasce: agora, dura: 170, velocidade: new THREE.Vector3(), queda: 0, de: 0.05, ate: 0.12, minimoPx: 18, opacidade: 0.9 });
      fagulhas(ponto, agora, 4, 0.6);
    },
    animar(agora) {
      if (particulas.length === 0) return false;
      const porPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, canvas.clientHeight);
      const vivas: Particula[] = [];
      for (const p of particulas) {
        const t = (agora - p.nasce) / p.dura;
        if (t >= 1) {
          grupo.remove(p.sprite);
          p.material.dispose();
          continue;
        }
        vivas.push(p);
        if (t < 0) continue;
        const s = (agora - p.nasce) / 1000;
        p.sprite.visible = true;
        p.sprite.position.copy(p.origem).addScaledVector(p.velocidade, s);
        p.sprite.position.y -= 0.5 * p.queda * s * s;
        // Cresce depressa no começo e devagar no fim.
        const tamanho = p.de + (p.ate - p.de) * (1 - (1 - t) * (1 - t));
        const distancia = p.sprite.getWorldPosition(noMundo).distanceTo(camera.position);
        const minimo = p.minimoPx * porPixel * distancia * (p.desenho === 'anel' ? 0.3 + 0.7 * t : 1);
        p.sprite.scale.setScalar(Math.max(tamanho, minimo));
        // A fumaça aparece aos poucos e se desfaz; clarão e anel nascem fortes e somem.
        p.material.opacity = p.opacidade * (p.desenho === 'fumaca' ? Math.min(1, t / 0.12) * Math.sqrt(1 - t) : 1 - t * t);
        if (p.desenho === 'fumaca') p.material.rotation = s * 0.35;
      }
      particulas = vivas;
      return true;
    },
    vivas: () => particulas.length,
    destruir() {
      for (const p of particulas) p.material.dispose();
      particulas = [];
      pai.remove(grupo);
      for (const t of Object.values(texturas)) t.dispose();
    },
  };
}
