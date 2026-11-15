// As peças acompanham a casa: quando as medidas, as varandas, o quartinho ou as paredes internas mudam,
// cada peça é reassentada na superfície dela. Especificação: docs/especificacao/fase-2.md, seção 3.
//
// Antes de a casa ser refeita, `lembrar` guarda onde cada peça está dentro da superfície; depois, `reassentar`
// devolve os encaixes novos. Quem aplica é a cena, com `acoes.moverDispositivos(..., { historico: false })`.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import { type Encaixe, estado } from '../estado';
import type { Dispositivo } from '../nucleo/tipos';
import { colocarIniciais } from './colocacao';
import type { Lugares } from './lugares';

/** Lugar de uma peça dentro da superfície dela, em metros. */
interface Lembranca {
  superficie: string;
  lado: 1 | -1;
  /** Distância ao meio da largura da superfície. */
  du: number;
  /** Ao longo da subida: distância ao meio (piso e telhado) e altura acima do pé (parede). */
  dvDoMeio: number;
  dvDoPe: number;
}

export type Memoria = Map<string, Lembranca>;

export function lembrar(lugares: Lugares): Memoria {
  const memoria: Memoria = new Map();
  for (const d of estado.projeto.dispositivos) {
    const q = lugares.quadroDaPeca(d);
    if (!q || d.superficie === null) continue;
    const u = dot(d.pos, q.u);
    const v = dot(d.pos, q.v);
    memoria.set(d.uid, { superficie: d.superficie, lado: q.lado, du: u - (q.u0 + q.u1) / 2, dvDoMeio: v - (q.v0 + q.v1) / 2, dvDoPe: v - q.v0 });
  }
  return memoria;
}

function mudou(d: Dispositivo, e: Encaixe): boolean {
  if (d.superficie !== e.superficie || d.giro !== e.giro) return true;
  for (let i = 0; i < 3; i++) if (Math.abs(d.pos[i]! - e.pos[i]!) > 1e-5) return true;
  for (let i = 0; i < 4; i++) if (Math.abs(d.quat[i]! - e.quat[i]!) > 1e-6) return true;
  return false;
}

/**
 * Encaixe novo das peças que precisam mudar depois de a casa ser refeita:
 * - a superfície continua existindo: mesma distância ao meio dela (em parede, mesma altura), cortada para caber;
 *   se cair em vão de janela ou porta, o lugar válido mais próximo;
 * - a superfície sumiu: a alternativa da colocação inicial (seção 13), no lugar livre mais próximo;
 * - placas que ficaram umas sobre as outras vão para a próxima posição livre da grade.
 */
export function reassentar(lugares: Lugares, memoria: Memoria): Map<string, Encaixe> {
  const novos = new Map<string, Encaixe>();
  /** As peças como vão ficando, para a conferência de vizinhas. */
  const atuais = estado.projeto.dispositivos.map((d) => ({ ...d }));
  const fixar = (d: Dispositivo, e: Encaixe): void => {
    Object.assign(d, e);
    const original = estado.projeto.dispositivos.find((x) => x.uid === d.uid);
    if (original && mudou(original, e)) novos.set(d.uid, e);
    else novos.delete(d.uid);
  };

  const orfas: Dispositivo[] = [];
  for (const d of atuais) {
    const item = CATALOGO.get(d.itemId);
    const m = memoria.get(d.uid);
    if (!item || !m || m.superficie !== d.superficie) continue;
    const q = lugares.quadro(m.superficie, m.lado);
    if (!q) {
      orfas.push(d);
      continue;
    }
    const u = (q.u0 + q.u1) / 2 + m.du;
    const v = q.marca.tipo === 'parede' ? q.v0 + m.dvDoPe : (q.v0 + q.v1) / 2 + m.dvDoMeio;
    const c = lugares.assentar(item, d.giro, q, u, v, { ignorar: 'todas' });
    // O que não cabe (vão de janela, parede no caminho) procura o lugar válido mais perto; sem lugar, fica cortado para a borda.
    let encaixe = c.valido ? c.encaixe : lugares.lugarLivre(item, d.giro, q, u, v, { ignorar: 'todas' });
    if (!encaixe && item.categoria === 'placa') {
      // A água encolheu e a placa não cabe mais em pé: deitada na mesma água; senão, na água mais próxima com lugar.
      encaixe = lugares.lugarLivre(item, d.giro + 90, q, u, v, { ignorar: 'todas' }) ?? lugares.lugarEmOutraAgua(item, d.giro, new THREE.Vector3(...d.pos), q.marca.id, { ignorar: 'todas' });
    }
    fixar(d, encaixe ?? c.encaixe);
  }

  if (orfas.length > 0) {
    const semLugar = new Set(orfas.map((d) => d.uid));
    const iniciais = colocarIniciais(
      { ...estado.projeto, dispositivos: atuais.map((d) => (semLugar.has(d.uid) ? { ...d, superficie: null } : d)) },
      CATALOGO,
    );
    for (const d of orfas) {
      const item = CATALOGO.get(d.itemId);
      const inicial = iniciais.get(d.uid);
      if (!item || !inicial) continue;
      // Ainda sem lugar: não conta como vizinha de si mesma.
      d.superficie = null;
      let encaixe = inicial;
      const q = lugares.quadroDaPeca({ ...d, ...inicial });
      if (q) {
        const [u, v] = [dot(inicial.pos, q.u), dot(inicial.pos, q.v)];
        const c = lugares.assentar(item, inicial.giro, q, u, v, { pecas: atuais });
        encaixe = c.valido ? c.encaixe : (lugares.lugarLivre(item, inicial.giro, q, u, v, { pecas: atuais }) ?? c.encaixe);
      }
      fixar(d, encaixe);
    }
  }

  // Placas que a casa menor juntou: a de trás na lista procura a próxima posição livre da grade.
  const vistas = new Set<string>();
  for (const d of atuais) {
    const item = CATALOGO.get(d.itemId);
    if (item?.categoria !== 'placa' || d.superficie === null) continue;
    const q = lugares.quadroDaPeca(d);
    if (q) {
      const outras = atuais.filter((x) => vistas.has(x.uid));
      const encaixe: Encaixe = { pos: d.pos, quat: d.quat, superficie: d.superficie, giro: d.giro };
      if (lugares.vizinhaCruzada(item, encaixe, { pecas: outras })) {
        const livre =
          lugares.lugarLivre(item, d.giro, q, dot(d.pos, q.u), dot(d.pos, q.v), { pecas: outras }) ??
          lugares.lugarEmOutraAgua(item, d.giro, new THREE.Vector3(...d.pos), q.marca.id, { pecas: outras });
        if (livre) fixar(d, livre);
      }
    }
    vistas.add(d.uid);
  }
  return novos;
}

function dot(p: readonly number[], e: { x: number; y: number; z: number }): number {
  return p[0]! * e.x + p[1]! * e.y + p[2]! * e.z;
}
