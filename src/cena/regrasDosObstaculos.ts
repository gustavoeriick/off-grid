// Regras dos obstáculos que fazem sombra (muro, vizinho, árvore) e do terreno em volta da casa.
// Funções puras, sem Three.js e sem DOM: a cena (arraste) e a interface (painel e barra "Acrescentar") usam as mesmas contas.
// Tarefas 5.2 e 5.3 do plano.

import type { CasaConfig, Obstaculo, Projeto, TipoObstaculo } from '../nucleo/tipos';
import { cantosDasVarandas, plantaDaVaranda } from './regrasDaCasa';

/** Limites dos campos do painel e do arraste. */
export const LIMITES_OBSTACULO = {
  alturaMin: 0.5,
  alturaMax: 30,
  medidaMin: 0.1,
  medidaMax: 30,
  posicaoMax: 30,
  /** Grade do arraste, em metros. */
  passo: 0.5,
} as const;

export const NOME_DO_OBSTACULO: Record<TipoObstaculo, string> = { muro: 'Muro', vizinho: 'Casa do vizinho', arvore: 'Árvore' };

/** Retângulo no chão, girado em torno do centro (mesma convenção de `rotation.y` do Three.js). Giro em graus. */
export interface Pegada {
  x: number;
  z: number;
  largura: number;
  profundidade: number;
  giro: number;
}

const entre = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const centavos = (v: number): number => Math.round(v * 100) / 100;
const naGrade = (v: number, passo: number): number => centavos(Math.round(v / passo) * passo);

/** Verdadeiro quando os dois retângulos girados se invadem (área maior que zero). Encostar não conta. */
export function pegadasCruzam(a: Pegada, b: Pegada): boolean {
  const eixosDe = (p: Pegada): [[number, number], [number, number]] => {
    const t = (p.giro * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [[c, -s], [s, c]];
  };
  const [ax, az] = eixosDe(a);
  const [bx, bz] = eixosDe(b);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ex, ez] of [ax, az, bx, bz]) {
    const ra = (a.largura / 2) * Math.abs(ax[0] * ex + ax[1] * ez) + (a.profundidade / 2) * Math.abs(az[0] * ex + az[1] * ez);
    const rb = (b.largura / 2) * Math.abs(bx[0] * ex + bx[1] * ez) + (b.profundidade / 2) * Math.abs(bz[0] * ex + bz[1] * ez);
    if (Math.abs(dx * ex + dz * ez) >= ra + rb - 1e-6) return false;
  }
  return true;
}

/** Raio do tronco de uma árvore, pela altura dela. O desenho usa a mesma conta. */
export function raioDoTronco(altura: number): number {
  return entre(altura * 0.035, 0.08, 0.45);
}

/** Chão ocupado por um obstáculo. Na árvore, o círculo da copa vira um quadrado; com `soTronco`, só o tronco. */
export function pegadaDoObstaculo(o: Omit<Obstaculo, 'uid'>, soTronco = false): Pegada {
  if (o.tipo === 'arvore') {
    const lado = soTronco ? 2 * raioDoTronco(o.altura) : o.largura;
    return { x: o.x, z: o.z, largura: lado, profundidade: lado, giro: 0 };
  }
  return { x: o.x, z: o.z, largura: o.largura, profundidade: o.profundidade, giro: o.giro };
}

/** Chão ocupado pela casa: a planta, cada varanda, o canto entre duas varandas vizinhas e o quartinho. */
export function pegadasDaCasa(casa: CasaConfig): Pegada[] {
  const lista: Pegada[] = [];
  // No tutorial (`soQuartinho`) o corpo da casa e as varandas não existem: só o quartinho ocupa chão.
  if (!casa.soQuartinho) {
    lista.push({ x: 0, z: 0, largura: casa.largura, profundidade: casa.profundidade, giro: 0 });
    for (const v of casa.varandas) {
      const r = plantaDaVaranda(v, casa);
      lista.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, largura: r.x1 - r.x0, profundidade: r.z1 - r.z0, giro: 0 });
    }
    for (const { planta: r } of cantosDasVarandas(casa)) {
      lista.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, largura: r.x1 - r.x0, profundidade: r.z1 - r.z0, giro: 0 });
    }
  }
  const q = casa.quartinho;
  lista.push({ x: q.x, z: q.z, largura: q.largura, profundidade: q.profundidade, giro: q.giro });
  return lista;
}

/** O obstáculo não entra na casa, nas varandas nem no quartinho (pode encostar). */
export function obstaculoLivre(casa: CasaConfig, o: Omit<Obstaculo, 'uid'>): boolean {
  const pegada = pegadaDoObstaculo(o);
  return !pegadasDaCasa(casa).some((p) => pegadasCruzam(pegada, p));
}

/** Corta as medidas e a posição para os limites. Na árvore a copa não passa de três vezes a altura. */
export function limitarObstaculo<T extends Omit<Obstaculo, 'uid'>>(o: T): T {
  const L = LIMITES_OBSTACULO;
  const altura = entre(o.altura, L.alturaMin, L.alturaMax);
  let giro = ((o.giro % 360) + 360) % 360;
  if (giro > 180) giro -= 360;
  return {
    ...o,
    x: entre(o.x, -L.posicaoMax, L.posicaoMax),
    z: entre(o.z, -L.posicaoMax, L.posicaoMax),
    largura: entre(o.largura, L.medidaMin, o.tipo === 'arvore' ? Math.min(L.medidaMax, altura * 3) : L.medidaMax),
    profundidade: entre(o.profundidade, L.medidaMin, L.medidaMax),
    altura,
    giro: o.tipo === 'arvore' ? 0 : giro,
  };
}

/** Obstáculo levado até (x, z), preso à grade de 0,5 m e aos limites do terreno. */
export function obstaculoEm<T extends Omit<Obstaculo, 'uid'>>(o: T, x: number, z: number): T {
  const L = LIMITES_OBSTACULO;
  return { ...o, x: entre(naGrade(x, L.passo), -L.posicaoMax, L.posicaoMax), z: entre(naGrade(z, L.passo), -L.posicaoMax, L.posicaoMax) };
}

/** Medidas iniciais de cada tipo, e a distância da casa em que ele nasce. */
const INICIAL: Record<TipoObstaculo, { largura: number; profundidade: number; altura: number; distancia: number }> = {
  muro: { largura: 6, profundidade: 0.15, altura: 2.2, distancia: 3 },
  vizinho: { largura: 8, profundidade: 8, altura: 6, distancia: 5 },
  arvore: { largura: 4, profundidade: 4, altura: 6, distancia: 3 },
};

/** Lados da casa em que cada tipo tenta nascer, na ordem: [direção x, direção z]. */
const LADOS_DE_NASCER: Record<TipoObstaculo, [number, number][]> = {
  muro: [[0, -1], [-1, 0], [1, 0], [0, 1]],
  vizinho: [[1, 0], [-1, 0], [0, -1], [0, 1]],
  arvore: [[-1, 1], [1, 1], [-1, -1], [1, -1], [-1, 0], [0, -1]],
};

/**
 * Obstáculo novo, com as medidas iniciais, em um lugar livre perto da casa: fora da casa, das varandas, do quartinho
 * e dos outros obstáculos. O muro nasce paralelo à fachada mais próxima; o vizinho, a 5 m da lateral.
 */
export function novoObstaculo(tipo: TipoObstaculo, projeto: Pick<Projeto, 'casa' | 'obstaculos'>): Omit<Obstaculo, 'uid'> {
  const casa = projeto.casa;
  const m = INICIAL[tipo];
  const L = LIMITES_OBSTACULO;
  const outros = (projeto.obstaculos ?? []).map((o) => pegadaDoObstaculo(o));
  const paraFora = (v: number): number => Math.sign(v) * Math.ceil(Math.abs(v) / L.passo - 1e-9) * L.passo;
  // No tutorial o obstáculo nasce em volta do quartinho, que é a única construção.
  const q = casa.quartinho;
  const meioQ = Math.hypot(q.largura, q.profundidade) / 2;
  const [cx, cz, meiaL, meiaP] = casa.soQuartinho ? [q.x, q.z, meioQ, meioQ] : [0, 0, casa.largura / 2, casa.profundidade / 2];
  let reserva: Omit<Obstaculo, 'uid'> | null = null;
  for (let extra = 0; extra <= 24; extra += 1) {
    for (const [dx, dz] of LADOS_DE_NASCER[tipo]) {
      // Muro ao lado da casa corre ao longo da lateral.
      const giro = tipo === 'muro' && dx !== 0 ? 90 : 0;
      const meiaX = (giro === 90 ? m.profundidade : m.largura) / 2;
      const meiaZ = (giro === 90 ? m.largura : m.profundidade) / 2;
      const candidato = limitarObstaculo({
        tipo,
        x: centavos(cx + paraFora(dx * (meiaL + m.distancia + extra + meiaX))),
        z: centavos(cz + paraFora(dz * (meiaP + m.distancia + extra + meiaZ))),
        largura: m.largura,
        profundidade: m.profundidade,
        altura: m.altura,
        giro,
      });
      if (!obstaculoLivre(casa, candidato)) continue;
      reserva ??= candidato;
      const pegada = pegadaDoObstaculo(candidato);
      if (!outros.some((p) => pegadasCruzam(pegada, p))) return candidato;
    }
  }
  // Terreno cheio: o primeiro lugar fora da casa, mesmo em cima de outro obstáculo.
  return reserva ?? limitarObstaculo({ tipo, x: L.posicaoMax, z: L.posicaoMax, largura: m.largura, profundidade: m.profundidade, altura: m.altura, giro: 0 });
}

/** O retângulo de chão dado está livre: fora da casa, das varandas, do quartinho e dos obstáculos (da árvore conta só o tronco). */
export function terrenoLivre(projeto: Pick<Projeto, 'casa' | 'obstaculos'>, pegada: Pegada): boolean {
  if (pegadasDaCasa(projeto.casa).some((p) => pegadasCruzam(pegada, p))) return false;
  return !(projeto.obstaculos ?? []).some((o) => pegadasCruzam(pegada, pegadaDoObstaculo(o, true)));
}
