// Paredes internas e nomes dos cômodos. Especificação: docs/especificacao/fase-2.md, seção 1.2.

import * as THREE from 'three';
import type { CasaConfig } from '../nucleo/tipos';
import { criarParede } from './paredes';
import type { Planta } from './varanda';

export const ESPESSURA_INTERNA = 0.1;
const paraCima = new THREE.Vector3();
const inversa = new THREE.Matrix4();
const LARGURA_PASSAGEM = 0.8;
const ALTURA_PASSAGEM = 2.1;
/** Pedaço de parede menor que isto, entre a escada e outra parede, não é desenhado. */
const TRECHO_MINIMO = 0.2;

export interface OpcoesInternas {
  andar: 0 | 1;
  /** Altura do pé das paredes (o piso acabado do andar) e altura delas até o teto. */
  yPe: number;
  altura: number;
  /** Face de dentro das paredes de fora: as internas param aí. */
  interior: Planta;
  /** Escada ou vão da escada neste andar: a parede interna é interrompida onde passaria por ali. */
  vedado: Planta | null;
}

/**
 * Paredes internas de um andar, a partir de `casa.paredesInternas`. Nos dados elas vão até o limite da planta;
 * aqui cada uma é cortada na face de dentro da parede de fora e interrompida na escada.
 * Cada trecho é uma malha de encaixe com as duas faces e o id `parede-interna-{uid}`.
 */
export function construirParedesInternas(casa: CasaConfig, o: OpcoesInternas): THREE.Group[] {
  const e = ESPESSURA_INTERNA;
  const lista: THREE.Group[] = [];
  if (o.altura < 0.5) return lista;
  for (const p of casa.paredesInternas) {
    if (p.andar !== o.andar) continue;
    const dx = p.para[0] - p.de[0];
    const dz = p.para[1] - p.de[1];
    const aoLongoDeX = Math.abs(dx) >= Math.abs(dz);
    const comp = Math.abs(aoLongoDeX ? dx : dz);
    if (comp < 0.05) continue;
    const sentido = Math.sign(aoLongoDeX ? dx : dz);
    /** Coordenada ao longo da parede na ponta `de`, e a coordenada fixa, de través. */
    const u0 = aoLongoDeX ? p.de[0] : p.de[1];
    const w = aoLongoDeX ? p.de[1] : p.de[0];
    const [ua, ub, wa, wb] = aoLongoDeX
      ? [o.interior.x0, o.interior.x1, o.interior.z0, o.interior.z1]
      : [o.interior.z0, o.interior.z1, o.interior.x0, o.interior.x1];
    if (w < wa + e / 2 - 1e-6 || w > wb - e / 2 + 1e-6) continue; // dentro da parede de fora
    /** Distância até a ponta `de` de um ponto de coordenada `u`. */
    const t = (u: number): number => (u - u0) * sentido;
    const ta = Math.max(0, Math.min(t(ua), t(ub)));
    const tb = Math.min(comp, Math.max(t(ua), t(ub)));
    let pedacos: [number, number][] = [[ta, tb]];
    const v = o.vedado;
    if (v) {
      const [va, vb, vwa, vwb] = aoLongoDeX ? [v.x0, v.x1, v.z0, v.z1] : [v.z0, v.z1, v.x0, v.x1];
      if (w > vwa - e / 2 && w < vwb + e / 2) {
        const c0 = Math.min(t(va), t(vb));
        const c1 = Math.max(t(va), t(vb));
        pedacos = [
          [ta, Math.min(tb, c0)],
          [Math.max(ta, c1), tb],
        ];
      }
    }
    const giro = Math.atan2(aoLongoDeX ? 0 : -sentido, aoLongoDeX ? sentido : 0);
    for (const [t0, t1] of pedacos) {
      if (t1 - t0 < TRECHO_MINIMO) continue;
      const meio = (t0 + t1) / 2;
      const parede = criarParede({
        comprimento: t1 - t0,
        altura: o.altura,
        espessura: e,
        aberturas: p.passagens.map((d) => ({
          tipo: 'vao' as const,
          x: d - meio,
          largura: LARGURA_PASSAGEM,
          y: 0,
          altura: Math.min(ALTURA_PASSAGEM, o.altura - 0.15),
        })),
        superficie: { id: `parede-interna-${p.uid}`, tipo: 'parede' },
        interna: true,
      });
      // O quadro da parede tem a face da frente em z = 0: recua meia espessura para o eixo cair na linha dos dados.
      const u = u0 + sentido * meio;
      const x = aoLongoDeX ? u : w;
      const z = aoLongoDeX ? w : u;
      parede.position.set(x + (e / 2) * Math.sin(giro), o.yPe, z + (e / 2) * Math.cos(giro));
      parede.rotation.y = giro;
      lista.push(parede);
    }
  }
  return lista;
}

/**
 * Nome de um cômodo escrito no piso, deitado. A cada quadro o nome gira no piso para ficar de pé na tela,
 * de onde quer que a câmera olhe. Não é superfície de encaixe, não projeta sombra e não responde ao raio do ponteiro.
 */
export function criarNomeDoComodo(nome: string): THREE.Mesh {
  const alturaPx = 128;
  const fonte = 'bold 76px system-ui, "Segoe UI", sans-serif';
  const cv = document.createElement('canvas');
  let g = cv.getContext('2d')!;
  g.font = fonte;
  cv.width = Math.min(2048, Math.ceil(g.measureText(nome).width) + 48);
  cv.height = alturaPx;
  g = cv.getContext('2d')!;
  g.font = fonte;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.strokeText(nome, cv.width / 2, alturaPx / 2 + 4, cv.width - 24);
  g.fillStyle = '#3a342b';
  g.fillText(nome, cv.width / 2, alturaPx / 2 + 4, cv.width - 24);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // Letras com cerca de 0,35 m de altura; nome comprido encolhe para caber em 3 m.
  const altura = 0.6;
  const escala = Math.min(1, 3 / ((altura * cv.width) / alturaPx));
  const geo = new THREE.PlaneGeometry(((altura * cv.width) / alturaPx) * escala, altura * escala);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
  m.name = `nome-${nome}`;
  m.renderOrder = 1;
  m.userData.nomeDeComodo = true;
  // Material e textura são só desta malha: saem junto com ela na reconstrução.
  m.userData.materialProprio = true;
  m.raycast = () => {};
  m.onBeforeRender = (_r, _c, camera) => {
    // O "para cima" da tela, deitado no chão e levado ao quadro do pai (a casa gira).
    const e = camera.matrixWorld.elements;
    paraCima.set(e[4]!, 0, e[6]!);
    if (paraCima.lengthSq() < 1e-4) paraCima.set(-e[8]!, 0, -e[10]!);
    if (m.parent) paraCima.transformDirection(inversa.copy(m.parent.matrixWorld).invert());
    m.rotation.y = Math.atan2(-paraCima.x, -paraCima.z);
    m.updateMatrixWorld();
  };
  return m;
}
