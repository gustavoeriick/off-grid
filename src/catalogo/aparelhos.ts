// Aparelhos da casa e a tomada da rede. Especificação: docs/especificacao/catalogo.md, seção 6.
// As potências são valores típicos de cada tipo de aparelho, não medições, e por isso entram em `tipico`.

import type { Aparelho, Dimensoes, FormaAparelho, Rede, TensaoRede, Uso } from './tipos';

interface Dados {
  id: string;
  nome: string;
  detalhe: string;
  potenciaW: number;
  mediaW: number;
  picoW: number;
  uso: [inicio: number, fim: number];
  tensao: TensaoRede | 'bivolt';
  motor: boolean;
  eletronico: boolean;
  forma: FormaAparelho;
  dimensoes: Dimensoes;
}

function aparelho(d: Dados): Aparelho {
  const usoPadrao: Uso = { inicio: d.uso[0], fim: d.uso[1] };
  return {
    id: d.id, nome: d.nome, detalhe: d.detalhe, linha: 'plano', preco: 0, categoria: 'aparelho',
    tipico: ['potenciaW', 'mediaW', 'picoW'],
    potenciaW: d.potenciaW, mediaW: d.mediaW, picoW: d.picoW, usoPadrao,
    tensao: d.tensao, motor: d.motor, eletronico: d.eletronico, forma: d.forma, dimensoes: d.dimensoes,
  };
}

export const APARELHOS: Aparelho[] = [
  // Do plano elétrico do Gustavo.
  aparelho({
    id: 'ap-rede', nome: 'Modem, roteador e mini PC', detalhe: '40 W o dia inteiro',
    potenciaW: 40, mediaW: 40, picoW: 60, uso: [0, 24], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'roteador', dimensoes: [0.35, 0.2, 0.2],
  }),
  aparelho({
    id: 'ap-pc-24h', nome: 'PC ligado 24 h', detalhe: '70 W o dia inteiro',
    potenciaW: 70, mediaW: 70, picoW: 150, uso: [0, 24], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'pc', dimensoes: [0.2, 0.45, 0.45],
  }),
  aparelho({
    id: 'ap-pc-trabalho', nome: 'PC de trabalho do plano (RX 580)', detalhe: '135 W, das 8 às 18 h',
    potenciaW: 135, mediaW: 135, picoW: 300, uso: [8, 18], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'pc', dimensoes: [0.2, 0.45, 0.45],
  }),
  aparelho({
    id: 'ap-geladeira', nome: 'Geladeira grande', detalhe: '150 W com o motor ligado, 90 W de média',
    potenciaW: 150, mediaW: 90, picoW: 900, uso: [0, 24], tensao: 127, motor: true, eletronico: false,
    forma: 'geladeira', dimensoes: [0.75, 1.8, 0.75],
  }),
  aparelho({
    id: 'ap-ventilador', nome: 'Ventilador', detalhe: '50 W, das 10 às 22 h',
    potenciaW: 50, mediaW: 50, picoW: 100, uso: [10, 22], tensao: 127, motor: true, eletronico: false,
    forma: 'ventilador', dimensoes: [0.45, 1.3, 0.45],
  }),
  aparelho({
    id: 'ap-tv', nome: 'TV', detalhe: '80 W, das 18 às 23 h',
    potenciaW: 80, mediaW: 80, picoW: 100, uso: [18, 23], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'tv', dimensoes: [1.1, 0.7, 0.25],
  }),
  // Computadores.
  aparelho({
    id: 'ap-pc-escritorio', nome: 'PC de trabalho, sem placa de vídeo', detalhe: '90 W, 60 W de média, das 8 às 18 h',
    potenciaW: 90, mediaW: 60, picoW: 150, uso: [8, 18], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'pc', dimensoes: [0.2, 0.45, 0.45],
  }),
  aparelho({
    id: 'ap-pc-gamer', nome: 'PC gamer, com placa de vídeo', detalhe: '450 W, 350 W de média em jogo, das 19 às 23 h',
    potenciaW: 450, mediaW: 350, picoW: 600, uso: [19, 23], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'pc', dimensoes: [0.22, 0.5, 0.48],
  }),
  aparelho({
    id: 'ap-notebook', nome: 'Notebook de trabalho', detalhe: '65 W, 45 W de média, das 8 às 18 h',
    potenciaW: 65, mediaW: 45, picoW: 65, uso: [8, 18], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'notebook', dimensoes: [0.36, 0.25, 0.25],
  }),
  aparelho({
    id: 'ap-notebook-gamer', nome: 'Notebook com placa de vídeo', detalhe: '190 W, 150 W de média em jogo, das 19 às 23 h. Referência: Asus TUF Gaming F16 com RTX 5050, fonte de 280 W',
    potenciaW: 190, mediaW: 150, picoW: 280, uso: [19, 23], tensao: 'bivolt', motor: false, eletronico: true,
    forma: 'notebook', dimensoes: [0.38, 0.27, 0.27],
  }),
  // Geladeiras.
  aparelho({
    id: 'ap-frigobar', nome: 'Frigobar', detalhe: '70 W, 25 W de média, o dia inteiro',
    potenciaW: 70, mediaW: 25, picoW: 400, uso: [0, 24], tensao: 127, motor: true, eletronico: false,
    forma: 'geladeira', dimensoes: [0.48, 0.85, 0.52],
  }),
  aparelho({
    id: 'ap-geladeira-normal', nome: 'Geladeira normal, de uma porta', detalhe: '100 W, 45 W de média, o dia inteiro',
    potenciaW: 100, mediaW: 45, picoW: 600, uso: [0, 24], tensao: 127, motor: true, eletronico: false,
    forma: 'geladeira', dimensoes: [0.6, 1.55, 0.65],
  }),
  aparelho({
    id: 'ap-geladeira-maior', nome: 'Geladeira maior, duplex', detalhe: '130 W, 65 W de média, o dia inteiro',
    potenciaW: 130, mediaW: 65, picoW: 800, uso: [0, 24], tensao: 127, motor: true, eletronico: false,
    forma: 'geladeira', dimensoes: [0.68, 1.7, 0.7],
  }),
  // Outros.
  aparelho({
    id: 'ap-lampada', nome: 'Lâmpada LED', detalhe: '9 W, das 18 às 24 h',
    potenciaW: 9, mediaW: 9, picoW: 9, uso: [18, 24], tensao: 'bivolt', motor: false, eletronico: false,
    forma: 'lampada', dimensoes: [0.12, 0.12, 0.12],
  }),
  aparelho({
    id: 'ap-microondas', nome: 'Micro-ondas', detalhe: '1.300 W, das 12 às 13 h',
    potenciaW: 1300, mediaW: 1300, picoW: 1500, uso: [12, 13], tensao: 127, motor: false, eletronico: false,
    forma: 'microondas', dimensoes: [0.5, 0.3, 0.4],
  }),
  aparelho({
    id: 'ap-bomba', nome: "Bomba d'água de 1/2 cv", detalhe: '400 W, pico de partida de 1.500 W, das 7 às 8 h',
    potenciaW: 400, mediaW: 400, picoW: 1500, uso: [7, 8], tensao: 127, motor: true, eletronico: false,
    forma: 'caixa', dimensoes: [0.3, 0.25, 0.2],
  }),
  aparelho({
    id: 'ap-chuveiro', nome: 'Chuveiro elétrico', detalhe: '5.500 W, das 19 às 20 h',
    potenciaW: 5500, mediaW: 5500, picoW: 5500, uso: [19, 20], tensao: 127, motor: false, eletronico: false,
    forma: 'chuveiro', dimensoes: [0.25, 0.25, 0.25],
  }),
];

/** A tomada da rede da casa. Preço zero, e o zero não é estimativa. */
export const REDE: Rede[] = [
  {
    id: 'rede-tomada', nome: 'Tomada da rede da casa', detalhe: 'Rede elétrica de 127 V da casa', linha: 'plano', preco: 0,
    categoria: 'rede',
  },
];
