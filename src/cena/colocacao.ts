// Colocação inicial das peças que chegam sem posição (o cenário "plano no papel" vem do núcleo assim).
// Especificação: docs/especificacao/cena-e-interface.md, seção 13. Conta pura sobre o projeto.

import * as THREE from 'three';
import type { Catalogo, Item } from '../catalogo/tipos';
import type { Encaixe } from '../estado';
import type { CasaConfig, Dispositivo, Projeto } from '../nucleo/tipos';
import { dimensoesDe, ehGrampo, encaixar, superficieAceita } from './encaixe';
import { GIRO_DA_FACHADA, medirVarandas } from './varanda';

const PISO = 0.05;
const ESPESSURA_QUARTINHO = 0.1;
/** Folga entre placas vizinhas. */
const FOLGA_PLACAS = 0.02;

/** Onde ficam, no piso, os aparelhos do plano: andar, fração da largura e da profundidade da casa, e giro. */
const LUGAR_DO_APARELHO: Record<string, [andar: 0 | 1, fx: number, fz: number, giro: number]> = {
  'ap-geladeira': [0, -0.35, -0.35, 0],
  // A TV fica de costas para a fachada, virada para a sala.
  'ap-tv': [0, 0.25, 0.3, 180],
  'ap-ventilador': [0, 0.05, 0.2, 0],
  'ap-rede': [1, -0.3, -0.3, 0],
  'ap-pc-24h': [1, -0.1, -0.3, 0],
  'ap-pc-trabalho': [1, 0.25, -0.25, 0],
};

/** Lugares de sobra no térreo, para aparelhos fora da tabela ou repetidos. */
const LUGARES_DE_SOBRA: [fx: number, fz: number][] = [
  [-0.15, 0.25], [-0.35, 0.25], [-0.15, -0.35], [0.05, -0.35], [-0.35, 0.02], [-0.15, 0.02], [0.05, 0.02], [0.22, 0.02],
];

interface Agua {
  id: string;
  /** Meio da borda de cima, direção da largura, direção da descida e normal, em coordenadas da casa. */
  origem: THREE.Vector3;
  largura: THREE.Vector3;
  descida: THREE.Vector3;
  normal: THREE.Vector3;
  comprimentoDaLargura: number;
  comprimentoDaDescida: number;
}

/** Telhado para as placas: o da varanda da frente; sem ela, o de outra varanda; sem varanda, a água da frente. */
function aguaDasPlacas(casa: CasaConfig): Agua {
  const varandas = medirVarandas(casa);
  const v = varandas.find((x) => x.lado === 'frente') ?? varandas[0];
  if (v) {
    const k = Math.hypot(1, v.inclinacao);
    const m = new THREE.Matrix4().makeRotationY(GIRO_DA_FACHADA[v.lado]);
    const W = casa.largura / 2;
    const D = casa.profundidade / 2;
    m.setPosition(v.lado === 'direita' ? W : v.lado === 'esquerda' ? -W : 0, 0, v.lado === 'frente' ? D : v.lado === 'fundos' ? -D : 0);
    return {
      id: `telhado-varanda-${v.lado}`,
      origem: new THREE.Vector3((v.x0 + v.x1) / 2, v.yParede, 0).applyMatrix4(m),
      largura: new THREE.Vector3(1, 0, 0).transformDirection(m),
      descida: new THREE.Vector3(0, -v.inclinacao / k, 1 / k).transformDirection(m),
      normal: new THREE.Vector3(0, 1 / k, v.inclinacao / k).transformDirection(m),
      comprimentoDaLargura: v.x1 - v.x0,
      comprimentoDaDescida: v.profundidade * k,
    };
  }
  const s = casa.inclinacaoTelhadoPct / 100;
  const k = Math.hypot(1, s);
  return {
    id: 'telhado-frente',
    origem: new THREE.Vector3(0, casa.andares * casa.peDireito + (casa.profundidade / 2) * s, 0),
    largura: new THREE.Vector3(1, 0, 0),
    descida: new THREE.Vector3(0, -s / k, 1 / k),
    normal: new THREE.Vector3(0, 1 / k, s / k),
    comprimentoDaLargura: casa.largura + 2 * casa.beiral,
    comprimentoDaDescida: (casa.profundidade / 2 + casa.beiral) * k,
  };
}

/**
 * Encaixe das peças do projeto que estão sem superfície, pela tabela da seção 13:
 * placas no telhado da varanda da frente; inversor, tomada e quadros na parede dos fundos do quartinho;
 * bateria no piso do quartinho, abaixo do inversor; aparelhos nos pisos da casa.
 * Quando a superfície da tabela não existe na casa, vale a alternativa mais próxima.
 */
export function colocarIniciais(projeto: Projeto, catalogo: Catalogo): Map<string, Encaixe> {
  const mapa = new Map<string, Encaixe>();
  const casa = projeto.casa;
  const pendentes: [Dispositivo, Item][] = [];
  for (const d of projeto.dispositivos) {
    const item = catalogo.get(d.itemId);
    // O grampo de parede nasce já encaixado, junto do cabo dele: não tem lugar de tabela.
    if (d.superficie === null && item && !ehGrampo(item) && dimensoesDe(item) && superficieAceita(item)) pendentes.push([d, item]);
  }
  if (pendentes.length === 0) return mapa;

  // ---- Quartinho: do quadro dele para as coordenadas da casa.
  const q = casa.quartinho;
  const giro = THREE.MathUtils.degToRad(q.giro);
  const doQuartinho = new THREE.Matrix4().makeRotationY(giro).setPosition(q.x, 0, q.z);
  const ponto = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(doQuartinho);
  const normalDoFundo = new THREE.Vector3(0, 0, 1).transformDirection(doQuartinho);
  const zParede = -q.profundidade / 2 + ESPESSURA_QUARTINHO;
  const meiaLargura = q.largura / 2 - ESPESSURA_QUARTINHO;
  const topoDaParede = q.altura - 0.1;
  const fundo = { id: 'parede-quartinho-fundo', tipo: 'parede' } as const;
  const naParede = (d: Dispositivo, item: Item, x: number, y: number): void => {
    const [l, a] = dimensoesDe(item)!;
    const limite = Math.max(0, meiaLargura - l / 2 - 0.02);
    const xc = THREE.MathUtils.clamp(x, -limite, limite);
    const yc = Math.min(y, topoDaParede - a / 2 - 0.02);
    mapa.set(d.uid, encaixar(item, fundo, ponto(xc, yc, zParede), normalDoFundo, 0));
  };

  const inversores = pendentes.filter(([, i]) => i.categoria === 'inversor' && i.montagem === 'parede');
  const larguraDoInversor = inversores[0] ? dimensoesDe(inversores[0][1])![0] : 0.3;
  // Inversor centralizado a 1,3 m do chão; os demais, se houver, seguem para a direita, mais acima.
  inversores.forEach(([d, item], i) => naParede(d, item, i === 0 ? 0 : 0.6 + (i - 1) * 0.4, PISO + (i === 0 ? 1.3 : 1.85)));
  // Tomada da rede 0,6 m à direita do inversor, a 1,2 m do chão.
  pendentes.filter(([, i]) => i.categoria === 'rede').forEach(([d, item], i) => naParede(d, item, 0.6 + i * 0.2, PISO + 1.2));
  // Quadros à esquerda do inversor.
  let xQuadro = -larguraDoInversor / 2 - 0.12;
  for (const [d, item] of pendentes.filter(([, i]) => i.categoria === 'acessorio')) {
    const l = dimensoesDe(item)![0];
    naParede(d, item, xQuadro - l / 2, PISO + 1.35);
    xQuadro -= l + 0.06;
  }
  // Controladores à esquerda, abaixo dos quadros; lâmpadas e chuveiros no alto.
  pendentes.filter(([, i]) => i.categoria === 'controlador').forEach(([d, item], i) => naParede(d, item, -0.5 - i * 0.32, PISO + 0.95));
  pendentes
    .filter(([, i]) => i.categoria === 'aparelho' && superficieAceita(i) === 'parede')
    .forEach(([d, item], i) => naParede(d, item, (i % 2 === 0 ? -1 : 1) * (0.3 + Math.floor(i / 2) * 0.35), PISO + 2.1));

  // ---- Piso do quartinho: baterias em fila, encostadas na parede e centradas sob o inversor; depois inversores de piso e estações.
  const noPisoDoQuartinho = pendentes.filter(([, i]) => i.categoria === 'bateria' || (i.categoria === 'inversor' && i.montagem === 'piso'));
  const pisoDoQuartinho = { id: 'piso-quartinho', tipo: 'piso' } as const;
  let fila: [Dispositivo, Item][] = [];
  let zFila = zParede + 0.03;
  const assentarFila = (): void => {
    const larguras = fila.map(([, i]) => dimensoesDe(i)![0]);
    const total = larguras.reduce((s, l) => s + l, 0) + 0.04 * (fila.length - 1);
    let x = -total / 2;
    let maior = 0;
    fila.forEach(([d, item], i) => {
      const prof = dimensoesDe(item)![2];
      maior = Math.max(maior, prof);
      mapa.set(d.uid, encaixar(item, pisoDoQuartinho, ponto(x + larguras[i]! / 2, PISO, zFila + prof / 2), [0, 1, 0], 0));
      x += larguras[i]! + 0.04;
    });
    zFila += maior + 0.06;
    fila = [];
  };
  let ocupado = 0;
  for (const par of noPisoDoQuartinho) {
    const l = dimensoesDe(par[1])![0];
    if (fila.length > 0 && ocupado + l > 2 * meiaLargura - 0.1) {
      assentarFila();
      ocupado = 0;
    }
    fila.push(par);
    ocupado += l + 0.04;
  }
  if (fila.length > 0) assentarFila();

  // ---- Placas: lado a lado no meio do telhado, em pé; deitadas se não couberem na descida.
  const placas = pendentes.filter(([, i]) => i.categoria === 'placa');
  if (placas.length > 0) {
    const agua = aguaDasPlacas(casa);
    const marca = { id: agua.id, tipo: 'telhado' } as const;
    const medidas = placas.map(([, item]) => {
      const [l, a] = dimensoesDe(item)!;
      const deitada = a > agua.comprimentoDaDescida - 0.1 && l <= agua.comprimentoDaDescida - 0.1;
      return { l: deitada ? a : l, a: deitada ? l : a, giro: deitada ? 90 : 0 };
    });
    // Fileiras que cabem na largura da água.
    const fileiras: number[][] = [[]];
    let soma = 0;
    medidas.forEach((mdd, i) => {
      if (fileiras[fileiras.length - 1]!.length > 0 && soma + mdd.l > agua.comprimentoDaLargura - 0.2) {
        fileiras.push([]);
        soma = 0;
      }
      fileiras[fileiras.length - 1]!.push(i);
      soma += mdd.l + FOLGA_PLACAS;
    });
    const alturas = fileiras.map((f) => Math.max(...f.map((i) => medidas[i]!.a)));
    const alturaTotal = alturas.reduce((s, a) => s + a, 0) + FOLGA_PLACAS * (fileiras.length - 1);
    let v = agua.comprimentoDaDescida / 2 - alturaTotal / 2;
    fileiras.forEach((f, j) => {
      const total = f.reduce((s, i) => s + medidas[i]!.l, 0) + FOLGA_PLACAS * (f.length - 1);
      let u = -total / 2;
      for (const i of f) {
        const mdd = medidas[i]!;
        const p = agua.origem.clone().addScaledVector(agua.largura, u + mdd.l / 2).addScaledVector(agua.descida, v + alturas[j]! / 2);
        mapa.set(placas[i]![0].uid, encaixar(placas[i]![1], marca, p, agua.normal, mdd.giro));
        u += mdd.l + FOLGA_PLACAS;
      }
      v += alturas[j]! + FOLGA_PLACAS;
    });
  }

  // ---- Aparelhos de piso: os do plano nos lugares da tabela; os outros, nos lugares de sobra do térreo.
  const usados = new Set<string>();
  let sobra = 0;
  for (const [d, item] of pendentes) {
    if (item.categoria !== 'aparelho' || superficieAceita(item) !== 'piso') continue;
    let lugar: (typeof LUGAR_DO_APARELHO)[string] | undefined = LUGAR_DO_APARELHO[item.id];
    if (lugar && usados.has(item.id)) lugar = undefined;
    usados.add(item.id);
    if (!lugar) {
      const [fx, fz] = LUGARES_DE_SOBRA[sobra % LUGARES_DE_SOBRA.length]!;
      sobra++;
      lugar = [0, fx, fz, 0];
    }
    const [andar, fx, fz, giroDaPeca] = lugar;
    const emCima = andar === 1 && casa.andares === 2;
    const marca = { id: emCima ? 'piso-superior' : 'piso-terreo', tipo: 'piso' } as const;
    mapa.set(d.uid, encaixar(item, marca, [fx * casa.largura, emCima ? casa.peDireito : PISO, fz * casa.profundidade], [0, 1, 0], giroDaPeca));
  }
  return mapa;
}
