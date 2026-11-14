// Proteções, cabos e acessórios. Especificação: docs/especificacao/catalogo.md, seções 3, 4 e 5.
// Proteções, cabos e acessórios servem a mais de uma linha; ficam em 'plano', salvo os da linha de 48 V.

import type { Acessorio, Protecao, TipoCabo } from './tipos';
import { ref } from './util';

const OBS_VARIACAO = 'O anúncio tem variação de corrente; o preço é o exibido sem escolher a variação.';
const ALUCOBRE =
  'Alucobre é alumínio com uma capa fina de cobre. Conduz cerca de 60% do que conduz o cobre da mesma bitola e não é aceito em instalação elétrica residencial.';

export const PROTECOES: Protecao[] = [
  {
    id: 'prot-fusivel-anl-150', nome: 'Fusível ANL 150 A com porta-fusível', linha: 'plano', categoria: 'protecao',
    detalhe: 'Fusível de faca ANL, 150 A, até 32 V',
    ...ref('MLB53767954'), obs: 'Fusível de som automotivo, para até 32 V. Serve em 12 e 24 V, não em 48 V.', tipico: ['tensaoMaxV'],
    tipo: 'fusivel', correnteA: 150, tensaoMaxV: 32,
  },
  {
    id: 'prot-disjuntor-cc-80', nome: 'Disjuntor CC 80 A', linha: 'plano', categoria: 'protecao',
    detalhe: 'Disjuntor de corrente contínua bipolar, 80 A, 500 V',
    ...ref('MLBU3878288701'), obs: OBS_VARIACAO,
    tipo: 'disjuntorCC', correnteA: 80, tensaoMaxV: 500,
  },
  {
    id: 'prot-disjuntor-cc-100', nome: 'Disjuntor CC 100 A', linha: 'plano', categoria: 'protecao',
    detalhe: 'Disjuntor de corrente contínua bipolar, 100 A, 500 V',
    ...ref('MLBU3878288701'), obs: OBS_VARIACAO,
    tipo: 'disjuntorCC', correnteA: 100, tensaoMaxV: 500,
  },
  {
    id: 'prot-disjuntor-cc-125', nome: 'Disjuntor CC 125 A', linha: 'plano', categoria: 'protecao',
    detalhe: 'Disjuntor de corrente contínua bipolar, 125 A, 500 V',
    ...ref('MLBU3878288701'), obs: OBS_VARIACAO,
    tipo: 'disjuntorCC', correnteA: 125, tensaoMaxV: 500,
  },
  {
    id: 'prot-disjuntor-cc-32', nome: 'Disjuntor CC 32 A', linha: 'plano', categoria: 'protecao',
    detalhe: 'Disjuntor de corrente contínua bipolar, 32 A, 1.000 V',
    ...ref('MLB79328694'),
    tipo: 'disjuntorCC', correnteA: 32, tensaoMaxV: 1000,
  },
  {
    id: 'prot-dps-cc-600', nome: 'DPS de corrente contínua 600 V', linha: 'plano', categoria: 'protecao',
    detalhe: 'Protetor contra surtos (DPS) para as placas, 600 V',
    ...ref('MLBU1096926941'), tipico: ['correnteA'],
    tipo: 'dps', correnteA: 0, tensaoMaxV: 600,
  },
  {
    id: 'prot-disjuntor-ca-16', nome: 'Disjuntor 16 A', linha: 'plano', categoria: 'protecao',
    detalhe: 'Disjuntor de corrente alternada, 16 A',
    ...ref('MLBU5120997993'), tipico: ['tensaoMaxV'],
    tipo: 'disjuntorCA', correnteA: 16, tensaoMaxV: 240,
  },
  {
    id: 'prot-fusivel-mega-125', nome: 'Fusível Mega 125 A com porta-fusível', linha: 'plano', categoria: 'protecao',
    detalhe: 'Fusível Mega, 125 A, até 32 V',
    ...ref('MLBU3910726055'), tipico: ['tensaoMaxV'],
    tipo: 'fusivel', correnteA: 125, tensaoMaxV: 32,
  },
  {
    id: 'prot-fusivel-anl-100', nome: 'Fusível ANL 100 A, 2 peças', linha: 'plano', categoria: 'protecao',
    detalhe: 'Fusível de faca ANL, 100 A, até 32 V, 2 peças',
    ...ref('MLBU5143928892'), obs: 'Vem sem porta-fusível.', tipico: ['tensaoMaxV'],
    tipo: 'fusivel', correnteA: 100, tensaoMaxV: 32,
  },
];

export const CABOS: TipoCabo[] = [
  {
    id: 'cabo-solar-6', nome: 'Cabo solar 6 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 6 mm², para as placas, 54 A',
    ...ref('MLBU4365246482', 20), tipico: ['ampacidade'],
    uso: 'solar', secao: 6, ampacidade: 54, cobre: true,
  },
  {
    id: 'cabo-bat-35', nome: 'Cabo de bateria 35 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 35 mm², para a bateria, 155 A',
    ...ref('MLB4849524870'), tipico: ['ampacidade'],
    uso: 'bateria', secao: 35, ampacidade: 155, cobre: true,
  },
  {
    id: 'cabo-bat-25-alucobre', nome: 'Cabo 25 mm² alucobre', linha: 'plano', categoria: 'cabo',
    detalhe: 'Alucobre, 25 mm², para a bateria, 75 A',
    ...ref('MLB26524841', 10), naoRecomendado: ALUCOBRE, tipico: ['ampacidade'],
    uso: 'bateria', secao: 25, ampacidade: 75, cobre: false,
  },
  {
    id: 'cabo-ca-2p5-alucobre', nome: 'Cabo 2,5 mm² alucobre', linha: 'plano', categoria: 'cabo',
    detalhe: 'Alucobre, 2,5 mm², circuito CA de três condutores, 14 A',
    ...ref('MLBU5101262487', 100, 3), naoRecomendado: ALUCOBRE, tipico: ['ampacidade'],
    uso: 'ca', secao: 2.5, ampacidade: 14, cobre: false,
  },
  {
    id: 'cabo-ca-2p5', nome: 'Circuito CA 2,5 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 2,5 mm², circuito CA de três condutores, 24 A',
    ...ref('MLBU3374542876', 100, 3), tipico: ['ampacidade'],
    uso: 'ca', secao: 2.5, ampacidade: 24, cobre: true,
  },
  {
    id: 'cabo-ca-4', nome: 'Circuito CA 4 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 4 mm², circuito CA de três condutores, 32 A',
    ...ref('MLB23927199', 100, 3), tipico: ['ampacidade'],
    uso: 'ca', secao: 4, ampacidade: 32, cobre: true,
  },
  // Sem anúncio na coleta: preço estimado.
  {
    id: 'cabo-solar-4', nome: 'Cabo solar 4 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 4 mm², para as placas, 42 A', preco: 6, tipico: ['preco', 'ampacidade'],
    uso: 'solar', secao: 4, ampacidade: 42, cobre: true,
  },
  {
    id: 'cabo-solar-10', nome: 'Cabo solar 10 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 10 mm², para as placas, 75 A', preco: 14, tipico: ['preco', 'ampacidade'],
    uso: 'solar', secao: 10, ampacidade: 75, cobre: true,
  },
  {
    id: 'cabo-solar-16', nome: 'Cabo solar 16 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 16 mm², para as placas, 100 A', preco: 22, tipico: ['preco', 'ampacidade'],
    uso: 'solar', secao: 16, ampacidade: 100, cobre: true,
  },
  {
    id: 'cabo-bat-16', nome: 'Cabo de bateria 16 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 16 mm², para a bateria, 90 A', preco: 36, tipico: ['preco', 'ampacidade'],
    uso: 'bateria', secao: 16, ampacidade: 90, cobre: true,
  },
  {
    id: 'cabo-bat-25', nome: 'Cabo de bateria 25 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 25 mm², para a bateria, 125 A', preco: 55, tipico: ['preco', 'ampacidade'],
    uso: 'bateria', secao: 25, ampacidade: 125, cobre: true,
  },
  {
    id: 'cabo-bat-50', nome: 'Cabo de bateria 50 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 50 mm², para a bateria, 190 A', preco: 110, tipico: ['preco', 'ampacidade'],
    uso: 'bateria', secao: 50, ampacidade: 190, cobre: true,
  },
  {
    id: 'cabo-ca-1p5', nome: 'Circuito CA 1,5 mm²', linha: 'plano', categoria: 'cabo',
    detalhe: 'Cobre, 1,5 mm², circuito CA de três condutores, 17,5 A', preco: 4.2, tipico: ['preco', 'ampacidade'],
    uso: 'ca', secao: 1.5, ampacidade: 17.5, cobre: true,
  },
];

export const ACESSORIOS: Acessorio[] = [
  {
    id: 'acc-ganchos-8', nome: 'Kit de 8 ganchos para telha colonial', linha: 'plano', categoria: 'acessorio',
    detalhe: '8 ganchos de fixação para telha colonial',
    ...ref('MLBU3342297951'), obs: 'Vem sem trilhos e sem grampos.', tipo: 'estrutura',
  },
  {
    id: 'acc-mc4-10', nome: 'Kit de 10 pares de conector MC4', linha: 'plano', categoria: 'acessorio',
    detalhe: '10 pares de conector MC4 para as placas',
    ...ref('MLBU2199270183'), tipo: 'conector',
  },
  {
    id: 'acc-haste', nome: 'Haste de aterramento com conector', linha: 'plano', categoria: 'acessorio',
    detalhe: 'Haste de cobre de 1,20 m com conector',
    ...ref('MLBU4070087836'), tipo: 'aterramento',
  },
  {
    id: 'acc-multimetro', nome: 'Multímetro Minipa ET-1507B', linha: 'plano', categoria: 'acessorio',
    detalhe: 'Multímetro digital True RMS, para medir tensão e corrente',
    ...ref('MLB22546788'), tipo: 'medicao',
  },
  {
    id: 'acc-wattimetro', nome: 'Medidor de consumo de tomada', linha: 'plano', categoria: 'acessorio',
    detalhe: 'Mede o consumo em watts de um aparelho ligado na tomada',
    ...ref('MLB24123784'), obs: 'Serve para medir o consumo real de cada aparelho antes de dimensionar.', tipo: 'medicao',
  },
  {
    id: 'acc-kit-2x155-pwm', nome: 'Kit 2 placas de 155 W com PWM', linha: 'simples', categoria: 'acessorio',
    detalhe: 'Duas placas de 155 W e controlador PWM',
    ...ref('MLBU1718449056'), obs: 'Sem inversor e sem bateria.', tipo: 'kit',
  },
  {
    id: 'acc-trilhos', nome: 'Kit de trilhos para 2 placas', linha: 'plano', categoria: 'acessorio',
    detalhe: '4 trilhos de 1,18 m e 4 grampos finais, para moldura de 30 ou 35 mm',
    ...ref('MLBU5083389403'), tipo: 'estrutura',
  },
  {
    id: 'acc-tomadas-5', nome: 'Kit de 5 tomadas duplas de sobrepor', linha: 'plano', categoria: 'acessorio',
    detalhe: '5 tomadas duplas de sobrepor, com caixa',
    ...ref('MLB56649232'), tipo: 'estrutura',
  },
  {
    id: 'acc-terminais-35', nome: 'Kit de 20 terminais olhal de 35 mm²', linha: 'plano', categoria: 'acessorio',
    detalhe: '20 terminais olhal de compressão para cabo de 35 mm²',
    ...ref('MLB45564347'), tipo: 'conector',
  },
  {
    id: 'acc-quadro-8', nome: 'Quadro de sobrepor para 8 disjuntores', linha: 'plano', categoria: 'acessorio',
    detalhe: 'Quadro de distribuição de sobrepor para 8 disjuntores',
    ...ref('MLB36945875'), tipo: 'estrutura',
  },
];
