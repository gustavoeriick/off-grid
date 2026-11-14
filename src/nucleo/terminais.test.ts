import { describe, expect, it } from 'vitest';
import type { Aparelho, Bateria, Controlador, EntradaSolar, Inversor, Placa, Rede } from '../catalogo/tipos';
import { podeLigar, terminaisDe } from './terminais';

const base = { nome: 'teste', detalhe: '', linha: 'plano', preco: 0 } as const;
const solar: EntradaSolar = { tipo: 'mppt', correnteCargaA: 100, vMin: 60, vMax: 450, vocMax: 500, potenciaMaxW: 4000 };

const placa: Placa = { ...base, id: 'p', categoria: 'placa', wp: 585, voc: 52.01, vmp: 43.83, isc: 14.2, imp: 13.35, largura: 1.134, altura: 2.278 };
const bateria: Bateria = { ...base, id: 'b', categoria: 'bateria', quimica: 'lifepo4', tensao: 24, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.52, 0.22, 0.24] };
const inversorBase: Omit<Inversor, 'id'> = { ...base, categoria: 'inversor', onda: 'pura', potenciaW: 3000, picoW: 6000, tensaoBateria: 24, saidaV: 127, rendimento: 0.92, consumoVazioW: 45, montagem: 'parede', dimensoes: [0.3, 0.42, 0.12] };
const hibrido: Inversor = { ...inversorBase, id: 'h', solar, carregadorRedeA: 80 };
const simples: Inversor = { ...inversorBase, id: 's' };
const estacao: Inversor = { ...inversorBase, id: 'e', solar, bateriaInternaWh: 1024, montagem: 'piso' };
const controlador: Controlador = { ...base, id: 'c', categoria: 'controlador', solar, tensoesBateria: [12, 24], dimensoes: [0.25, 0.18, 0.07] };
const aparelho: Aparelho = { ...base, id: 'a', categoria: 'aparelho', potenciaW: 150, mediaW: 90, picoW: 900, horasDia: 24, tensao: 127, motor: true, eletronico: false, forma: 'geladeira', dimensoes: [0.7, 1.75, 0.7] };
const rede: Rede = { ...base, id: 'r', categoria: 'rede' };

const ids = (item: Parameters<typeof terminaisDe>[0]) => terminaisDe(item).map((t) => t.id);

describe('terminaisDe', () => {
  it('placa e bateria têm positivo e negativo', () => {
    expect(ids(placa)).toEqual(['pos', 'neg']);
    expect(ids(bateria)).toEqual(['pos', 'neg']);
  });

  it('inversor híbrido tem placas, bateria, entrada e saída', () => {
    expect(ids(hibrido)).toEqual(['pvPos', 'pvNeg', 'batPos', 'batNeg', 'caEntrada', 'caSaida']);
  });

  it('inversor simples tem só bateria e saída', () => {
    expect(ids(simples)).toEqual(['batPos', 'batNeg', 'caSaida']);
  });

  it('estação portátil não tem terminais de bateria', () => {
    expect(ids(estacao)).toEqual(['pvPos', 'pvNeg', 'caEntrada', 'caSaida']);
  });

  it('controlador, aparelho e tomada da rede', () => {
    expect(ids(controlador)).toEqual(['pvPos', 'pvNeg', 'batPos', 'batNeg']);
    expect(ids(aparelho)).toEqual(['plug']);
    expect(ids(rede)).toEqual(['tomada']);
  });

  it('marca o tipo de cada terminal', () => {
    expect(terminaisDe(hibrido).map((t) => t.tipo)).toEqual(['cc+', 'cc-', 'cc+', 'cc-', 'ca', 'ca']);
  });
});

describe('podeLigar', () => {
  it('corrente alternada só liga em corrente alternada', () => {
    expect(podeLigar('ca', 'ca')).toBe(true);
    expect(podeLigar('ca', 'cc+')).toBe(false);
    expect(podeLigar('cc-', 'ca')).toBe(false);
  });

  it('em corrente contínua qualquer combinação é aceita', () => {
    expect(podeLigar('cc+', 'cc+')).toBe(true);
    expect(podeLigar('cc+', 'cc-')).toBe(true);
    expect(podeLigar('cc-', 'cc-')).toBe(true);
  });
});
