// Estimativas do dia: geração, consumo, autonomia e perda por sombra.
// Especificação: docs/especificacao/nucleo.md, seção 10. Tarefa 1.7.

import type { Catalogo, Inversor } from '../catalogo/tipos';
import { infoBanco, saidaArranjo, estadoPlaca } from './eletrica';
import { irradianciaNasPlacas, irradianciaNoPlano, irradiancia, localPorId } from './irradiancia';
import { direcaoSol } from './sol';
import type { AmbientePlacas, AnaliseCircuito, EstadoPlaca, Estimativas, Projeto } from './tipos';
import { horasDeUso, usoDe } from './uso';

const PASSO_MS = 10 * 60000;
const PASSOS_POR_DIA = 144;
const PASSO_H = 1 / 6;

/** Instante da meia-noite local do dia de `msUtc`. */
function meiaNoiteLocal(fuso: number, ms: number): number {
  const d = new Date(ms + fuso * 3600000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - fuso * 3600000;
}

/** Números do dia local de `msUtc` para o projeto. */
export function estimar(
  projeto: Projeto,
  catalogo: Catalogo,
  analise: AnaliseCircuito,
  ambiente: AmbientePlacas,
  msUtc: number,
): Estimativas {
  const local = localPorId(projeto.localId);
  const sistema = analise.sistema;
  const perdaSombra = new Map<string, number>();

  // Perda por sombra: cada placa do projeto, só com `estadoPlaca`.
  if (local) {
    const m0 = meiaNoiteLocal(local.fuso, msUtc);
    const placas = projeto.dispositivos.flatMap((d) => {
      const item = catalogo.get(d.itemId);
      return item && item.categoria === 'placa' ? [{ uid: d.uid, item }] : [];
    });
    const comSombra = new Map<string, number>();
    const semSombra = new Map<string, number>();
    for (let i = 0; i < PASSOS_POR_DIA; i++) {
      const irr = irradiancia(local, m0 + (i + 0.5) * PASSO_MS, projeto.clima);
      const sol = direcaoSol(irr.azimute, irr.elevacao);
      for (const { uid, item } of placas) {
        const normal = ambiente.normal(uid);
        const fSombra = irr.dni > 0 ? ambiente.sombra(uid, sol) : 0;
        const gCom = irradianciaNoPlano(irr, sol, normal, fSombra, ambiente.ceuTapado(uid));
        const gSem = irradianciaNoPlano(irr, sol, normal, 0, 0);
        comSombra.set(uid, (comSombra.get(uid) ?? 0) + estadoPlaca(item, gCom, irr.tAmb).p);
        semSombra.set(uid, (semSombra.get(uid) ?? 0) + estadoPlaca(item, gSem, irr.tAmb).p);
      }
    }
    for (const { uid } of placas) {
      const sem = semSombra.get(uid) ?? 0;
      perdaSombra.set(uid, sem > 0 ? 1 - (comSombra.get(uid) ?? 0) / sem : 0);
    }
  }

  if (!sistema || !local) {
    return { geracaoDiaKwh: 0, consumoDiaKwh: 0, autonomiaHoras: null, perdaSombra };
  }

  const itemInversor = catalogo.get(projeto.dispositivos.find((d) => d.uid === sistema.inversor)?.itemId ?? '');
  const inversor = itemInversor && itemInversor.categoria === 'inversor' ? (itemInversor as Inversor) : null;
  const banco = infoBanco(sistema, projeto, catalogo);

  // Geração: o que o arranjo entrega, sem olhar a bateria.
  let geracaoWh = 0;
  if (banco && sistema.entradaSolar && sistema.fileiras.length > 0) {
    const m0 = meiaNoiteLocal(local.fuso, msUtc);
    for (let i = 0; i < PASSOS_POR_DIA; i++) {
      const condicoes = irradianciaNasPlacas(projeto, catalogo, local, m0 + (i + 0.5) * PASSO_MS, ambiente);
      const fileiras: EstadoPlaca[][] = sistema.fileiras.map((fileira) =>
        fileira.flatMap((uid) => {
          const d = projeto.dispositivos.find((x) => x.uid === uid);
          const item = d ? catalogo.get(d.itemId) : undefined;
          if (!item || item.categoria !== 'placa') return [];
          const c = condicoes.get(uid) ?? { g: 0, tAmb: 25 };
          return [estadoPlaca(item, c.g, c.tAmb)];
        }),
      );
      geracaoWh += saidaArranjo(fileiras, sistema.entradaSolar, banco.tensaoCarga).p * PASSO_H;
    }
  }

  // Consumo e autonomia: cargas ligadas.
  let mediaTotalW = 0;
  let whUso = 0;
  let ligadas = 0;
  for (const uid of sistema.cargas) {
    const d = projeto.dispositivos.find((x) => x.uid === uid);
    const item = d ? catalogo.get(d.itemId) : undefined;
    if (!d || !item || item.categoria !== 'aparelho' || d.ligado !== true) continue;
    ligadas++;
    mediaTotalW += item.mediaW;
    whUso += item.mediaW * horasDeUso(usoDe(d, item));
  }

  let consumoDiaKwh = 0;
  let autonomiaHoras: number | null = null;
  if (inversor) {
    consumoDiaKwh = (whUso / inversor.rendimento + inversor.consumoVazioW * 24) / 1000;
    if (banco && ligadas > 0) {
      autonomiaHoras = (banco.whUtil * banco.rendDescarga) / (mediaTotalW / inversor.rendimento + inversor.consumoVazioW);
    }
  }

  return { geracaoDiaKwh: geracaoWh / 1000, consumoDiaKwh, autonomiaHoras, perdaSombra };
}
