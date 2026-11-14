// Placas solares e controladores de carga. Especificação: docs/especificacao/catalogo.md, seção 3.

import type { Controlador, Placa } from './tipos';
import { ref } from './util';

const TIPICO_PLACA = ['isc', 'imp', 'largura', 'altura'];
const OBS_SGV = 'Loja oficial SGV. O frete não é grátis e o valor não aparece no anúncio.';
const OBS_CEP = 'Frete a consultar pelo CEP.';

export const PLACAS: Placa[] = [
  {
    id: 'placa-renepv-585', nome: 'Renepv 585 W bifacial', linha: 'plano', categoria: 'placa',
    detalhe: '585 W, bifacial, Voc 52,01 V, Vmp 43,83 V, 1,13 × 2,28 m',
    ...ref('MLB62243910'), precoMax: 849, obs: OBS_SGV, tipico: TIPICO_PLACA,
    wp: 585, voc: 52.01, vmp: 43.83, isc: 14.2, imp: 13.35, largura: 1.134, altura: 2.278,
  },
  {
    id: 'placa-ronma-585', nome: 'RonMa 585 W bifacial', linha: 'plano', categoria: 'placa',
    detalhe: '585 W, bifacial, Voc 51,50 V, Vmp 43,27 V, 1,13 × 2,28 m',
    ...ref('MLBU5844565353'), obs: OBS_SGV, tipico: TIPICO_PLACA,
    wp: 585, voc: 51.5, vmp: 43.27, isc: 14.3, imp: 13.52, largura: 1.134, altura: 2.278,
  },
  {
    id: 'placa-helius-610', nome: 'Helius 610 W bifacial', linha: 'plano', categoria: 'placa',
    detalhe: '610 W, bifacial, Voc 48,10 V, Vmp 39,74 V, 1,13 × 2,38 m',
    ...ref('MLB49277146'), tipico: TIPICO_PLACA,
    wp: 610, voc: 48.1, vmp: 39.74, isc: 16.3, imp: 15.35, largura: 1.134, altura: 2.382,
  },
  {
    id: 'placa-dasolar-550', nome: 'DA Solar 550 W', linha: 'plano', categoria: 'placa',
    detalhe: '550 W, Voc 49,84 V, Vmp 41,99 V, 1,13 × 2,28 m',
    ...ref('MLBU2861006457'), obs: OBS_CEP, tipico: TIPICO_PLACA,
    wp: 550, voc: 49.84, vmp: 41.99, isc: 13.9, imp: 13.1, largura: 1.134, altura: 2.279,
  },
  {
    id: 'placa-jinko-550', nome: 'Jinko 550 W', linha: 'plano', categoria: 'placa',
    detalhe: '550 W, Voc 49,62 V, Vmp 40,90 V, 1,13 × 2,28 m',
    ...ref('MLBU1740217066'), obs: OBS_CEP, tipico: TIPICO_PLACA,
    wp: 550, voc: 49.62, vmp: 40.9, isc: 14.03, imp: 13.45, largura: 1.134, altura: 2.278,
  },
  {
    id: 'placa-resun-100', nome: 'Resun 100 W policristalina', linha: 'simples', categoria: 'placa',
    detalhe: '100 W, policristalina, 12 V, Voc 21,58 V, Vmp 17,40 V, 0,67 × 1,01 m',
    ...ref('MLB23885816'), tipico: TIPICO_PLACA,
    wp: 100, voc: 21.58, vmp: 17.4, isc: 6.1, imp: 5.75, largura: 0.67, altura: 1.01,
  },
  {
    id: 'placa-solarborn-150', nome: 'SolarBorn 150 W', linha: 'simples', categoria: 'placa',
    detalhe: '150 W, 12 V, Voc 23,90 V, Vmp 20,10 V, 0,67 × 1,48 m',
    ...ref('MLB53292909'), tipico: TIPICO_PLACA,
    wp: 150, voc: 23.9, vmp: 20.1, isc: 7.9, imp: 7.46, largura: 0.67, altura: 1.48,
  },
  {
    id: 'placa-resun-155', nome: 'Resun 155 W', linha: 'simples', categoria: 'placa',
    detalhe: '155 W, 12 V, Voc 24,46 V, Vmp 20,64 V, 0,67 × 1,48 m',
    ...ref('MLBU729540779'), obs: 'O anúncio envia 150, 155 ou 160 W conforme o estoque.', tipico: TIPICO_PLACA,
    wp: 155, voc: 24.46, vmp: 20.64, isc: 7.95, imp: 7.51, largura: 0.67, altura: 1.48,
  },
];

const TIPICO_CTL = ['vMin', 'vMax', 'vocMax', 'potenciaMaxW', 'dimensoes'];

export const CONTROLADORES: Controlador[] = [
  {
    id: 'ctl-epever-xtra4210n', nome: 'Epever XTRA 4210N MPPT 40 A', linha: 'simples', categoria: 'controlador',
    detalhe: 'MPPT, 40 A, 12 e 24 V, até 100 V de Voc e 1.560 W de placas',
    ...ref('MLB45563377'), precoMax: 1149.94, tipico: TIPICO_CTL,
    solar: { tipo: 'mppt', correnteCargaA: 40, vMin: 0, vMax: 92, vocMax: 100, potenciaMaxW: 1560 },
    tensoesBateria: [12, 24], dimensoes: [0.25, 0.18, 0.07],
  },
  {
    id: 'ctl-epever-tracer3210an', nome: 'Epever Tracer 3210AN MPPT 30 A', linha: 'simples', categoria: 'controlador',
    detalhe: 'MPPT, 30 A, 12 e 24 V, até 100 V de Voc e 1.170 W de placas',
    ...ref('MLB67566736'), precoMax: 889, tipico: TIPICO_CTL,
    solar: { tipo: 'mppt', correnteCargaA: 30, vMin: 0, vMax: 92, vocMax: 100, potenciaMaxW: 1170 },
    tensoesBateria: [12, 24], dimensoes: [0.23, 0.17, 0.07],
  },
  {
    id: 'ctl-pwm-30a', nome: 'Controlador PWM 30 A', linha: 'simples', categoria: 'controlador',
    detalhe: 'PWM, 30 A, 12 e 24 V, até 50 V de Voc e 900 W de placas',
    ...ref('MLB2072621103'), precoMax: 44.73, tipico: TIPICO_CTL,
    solar: { tipo: 'pwm', correnteCargaA: 30, vMin: 0, vMax: 50, vocMax: 50, potenciaMaxW: 900 },
    tensoesBateria: [12, 24], dimensoes: [0.13, 0.07, 0.04],
  },
  {
    id: 'ctl-epever-ls2024eu', nome: 'Epever LS2024EU PWM 20 A', linha: 'simples', categoria: 'controlador',
    detalhe: 'PWM, 20 A, 12 e 24 V, até 50 V de Voc e 600 W de placas',
    ...ref('MLB45561817'), tipico: TIPICO_CTL,
    solar: { tipo: 'pwm', correnteCargaA: 20, vMin: 0, vMax: 50, vocMax: 50, potenciaMaxW: 600 },
    tensoesBateria: [12, 24], dimensoes: [0.14, 0.08, 0.04],
  },
];
