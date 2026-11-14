// Baterias. Especificação: docs/especificacao/catalogo.md, seção 3 (e parte D para 48 V).

import type { Bateria } from './tipos';
import { ref } from './util';

const T_LITIO = ['cargaMaxA', 'dimensoes'];
const T_CHUMBO = ['descargaMaxA', 'cargaMaxA', 'ciclos', 'dimensoes'];

export const BATERIAS: Bateria[] = [
  {
    id: 'bat-alfx-24v-100', nome: 'Alfx 24 V 100 Ah lítio', linha: 'plano', categoria: 'bateria',
    detalhe: 'LiFePO4, 24 V, 100 Ah, descarga de até 100 A, 6.000 ciclos',
    ...ref('MLB2073543374'), obs: 'Garantia de 1 ano. O título diz Alfx e a ficha diz Enershare.', tipico: T_LITIO,
    quimica: 'lifepo4', tensao: 24, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.52, 0.22, 0.24],
  },
  {
    id: 'bat-moura-24msl100', nome: 'Moura 24MSL100 lítio', linha: 'plano', categoria: 'bateria',
    detalhe: 'LiFePO4, 24 V, 100 Ah, descarga de até 100 A, 6.000 ciclos',
    ...ref('MLB2051879022'),
    obs: 'Garantia de 5 anos. Aceita até 15 em paralelo. A descarga recomendada é de 20 A, cerca de 500 W.', tipico: T_LITIO,
    quimica: 'lifepo4', tensao: 24, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.52, 0.22, 0.24],
  },
  {
    id: 'bat-epever-24v-100', nome: 'Epever 24 V 100 Ah lítio', linha: 'plano', categoria: 'bateria',
    detalhe: 'LiFePO4, 24 V, 100 Ah, 5.000 ciclos',
    ...ref('MLB48467675'), precoMax: 5750, obs: 'A ficha diz 5.000 ciclos e o título diz 6.000.', tipico: ['descargaMaxA', 'cargaMaxA', 'dimensoes'],
    quimica: 'lifepo4', tensao: 24, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 5000, dimensoes: [0.52, 0.22, 0.24],
  },
  {
    id: 'bat-belifou-12v-100', nome: 'Belifou 12 V 100 Ah lítio', linha: 'simples', categoria: 'bateria',
    detalhe: 'LiFePO4, 12 V, 100 Ah, descarga de até 100 A, 6.000 ciclos',
    ...ref('MLB75984919'), tipico: T_LITIO,
    quimica: 'lifepo4', tensao: 12, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.33, 0.22, 0.17],
  },
  {
    id: 'bat-auxom-12v-100', nome: 'Auxom 12 V 100 Ah lítio', linha: 'simples', categoria: 'bateria',
    detalhe: 'LiFePO4, 12 V, 100 Ah, 6.000 ciclos',
    ...ref('MLB2084822100'), precoMax: 2139.9, obs: 'Garantia do vendedor de 60 dias.', tipico: ['descargaMaxA', 'cargaMaxA', 'dimensoes'],
    quimica: 'lifepo4', tensao: 12, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.33, 0.22, 0.17],
  },
  {
    id: 'bat-moura-12mn220', nome: 'Moura 12MN220 chumbo', linha: 'simples', categoria: 'bateria',
    detalhe: 'Chumbo estacionária, 12 V, 220 Ah',
    ...ref('MLB2066985564'), precoMax: 2149.99, obs: 'Há anúncio a R$ 1.469,99 com frete a combinar.', tipico: T_CHUMBO,
    quimica: 'chumbo', tensao: 12, ah: 220, descargaMaxA: 110, cargaMaxA: 33, ciclos: 500, dimensoes: [0.52, 0.24, 0.27],
  },
  {
    id: 'bat-freedom-df2000', nome: 'Freedom DF2000 chumbo', linha: 'simples', categoria: 'bateria',
    detalhe: 'Chumbo estacionária, 12 V, 105 Ah (C20)',
    ...ref('MLB37916775'), obs: '115 Ah é a capacidade em 100 horas; em 20 horas são 105 Ah.', tipico: T_CHUMBO,
    quimica: 'chumbo', tensao: 12, ah: 105, descargaMaxA: 52, cargaMaxA: 16, ciclos: 500, dimensoes: [0.33, 0.24, 0.17],
  },
  {
    id: 'bat-moura-12mn105', nome: 'Moura 12MN105 chumbo', linha: 'simples', categoria: 'bateria',
    detalhe: 'Chumbo estacionária, 12 V, 105 Ah (C20)',
    ...ref('MLBU1405378204'), precoMax: 729.99, tipico: T_CHUMBO,
    quimica: 'chumbo', tensao: 12, ah: 105, descargaMaxA: 52, cargaMaxA: 16, ciclos: 500, dimensoes: [0.33, 0.24, 0.17],
  },
  {
    id: 'bat-freedom-df1000', nome: 'Freedom DF1000 chumbo', linha: 'simples', categoria: 'bateria',
    detalhe: 'Chumbo estacionária, 12 V, cerca de 60 Ah (C20)',
    ...ref('MLBU1944357801'), obs: 'O anúncio diz 70 Ah, medida em 100 horas; em 20 horas são cerca de 60 Ah.', tipico: ['ah', ...T_CHUMBO],
    quimica: 'chumbo', tensao: 12, ah: 60, descargaMaxA: 30, cargaMaxA: 9, ciclos: 500, dimensoes: [0.24, 0.2, 0.175],
  },
  {
    id: 'bat-powertek-100', nome: 'PowerTek 100 Ah selada', linha: 'simples', categoria: 'bateria',
    detalhe: 'Chumbo selada, 12 V, 100 Ah, 300 ciclos',
    ...ref('MLB2067485691'), precoMax: 798.9, tipico: ['descargaMaxA', 'cargaMaxA', 'dimensoes'],
    quimica: 'chumbo', tensao: 12, ah: 100, descargaMaxA: 50, cargaMaxA: 15, ciclos: 300, dimensoes: [0.33, 0.22, 0.17],
  },
  {
    id: 'bat-automotiva-60', nome: 'Bateria de carro 60 Ah', linha: 'simples', categoria: 'bateria',
    detalhe: 'Automotiva, 12 V, 60 Ah, cerca de 80 ciclos',
    ...ref('MLBU4907518725'), tipico: T_CHUMBO,
    naoRecomendado:
      'Bateria de carro foi feita para dar partida. Em descarga funda dura poucas dezenas de ciclos. Está no catálogo só para comparação.',
    quimica: 'automotiva', tensao: 12, ah: 60, descargaMaxA: 30, cargaMaxA: 6, ciclos: 80, dimensoes: [0.24, 0.19, 0.175],
  },
  {
    id: 'bat-felicity-48v-100', nome: 'Felicity FLA48100 48 V 100 Ah', linha: 'avancada', categoria: 'bateria',
    detalhe: 'LiFePO4, 48 V, 100 Ah, descarga de até 100 A, 4.000 ciclos',
    ...ref('MLB2118643980'), obs: 'A ficha diz 4.000 ciclos e a descrição diz 6.000. Garantia do vendedor de 90 dias.', tipico: T_LITIO,
    quimica: 'lifepo4', tensao: 48, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 4000, dimensoes: [0.48, 0.22, 0.55],
  },
  {
    id: 'bat-dyness-48v-100', nome: 'Dyness DLC5.0C 48 V 100 Ah', linha: 'avancada', categoria: 'bateria',
    detalhe: 'LiFePO4, 48 V, 100 Ah, descarga de até 100 A, 6.000 ciclos',
    ...ref('MLB2044882917'), obs: 'Garantia de 7 anos. Aceita até 50 em paralelo.', tipico: T_LITIO,
    quimica: 'lifepo4', tensao: 48, ah: 100, descargaMaxA: 100, cargaMaxA: 50, ciclos: 6000, dimensoes: [0.48, 0.22, 0.55],
  },
];
