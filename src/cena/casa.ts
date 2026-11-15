// Casa paramétrica. Especificação: docs/especificacao/cena-e-interface.md, seção 3.
// Coordenadas da casa: origem no centro da planta, no chão; frente em +Z; +X à direita de quem olha a frente.
//
// O plano de cada água da especificação é a crista das telhas (ver telhado.ts). O madeiramento fica abaixo dele,
// e por isso as paredes do último andar param um pouco abaixo de `hTopo`: o que falta até o telhado
// (respaldo e oitões) faz parte do telhado e some com ele nos modos de visão.

import * as THREE from 'three';
import type { ModoVisao } from '../estado';
import type { CasaConfig, LadoCasa } from '../nucleo/tipos';
import { construirParedesInternas, criarNomeDoComodo } from './comodos';
import { Construtor, esconder, liberar, type Marca, marcarSolido } from './malha';
import { cor, mat } from './materiais';
import { type Abertura, criarParede } from './paredes';
import { CAIBRO, criarAgua, criarCumeeira, FUNDO_RIPA } from './telhado';
import { MARCA_DO_TERRENO, MEIO_TERRENO } from './terreno';
import { construirVaranda, cortarAgua, cumeeiraSemPonta, GIRO_DA_FACHADA, type MedidaVaranda, medirVarandas, type Planta } from './varanda';

const ESPESSURA_PAREDE = 0.15;
const PISO = 0.05;
const LAJE = 0.12;
const FORRO = 0.08;
const BARRADO = 0.6;
const CALCADA = 0.8;
const CAIBRO_QUARTINHO = 0.06;

function solido(c: Construtor, material: THREE.Material | THREE.Material[], nome: string, superficie?: Marca): THREE.Mesh {
  const m = marcarSolido(c.malha(material), superficie);
  m.name = nome;
  return m;
}

/** Malha que só recebe sombra: calçada, caminho, detalhes rentes ao chão. */
function rasteiro(c: Construtor, material: THREE.Material | THREE.Material[], nome: string): THREE.Mesh {
  const m = c.malha(material);
  m.name = nome;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- Vãos das fachadas

/**
 * Portas e janelas de uma fachada, distribuídas em vãos iguais ao longo do comprimento.
 * `xEntrada` é onde a porta de entrada deve cair, ao longo da fachada da frente.
 */
function vaosDaFachada(lado: LadoCasa, andar: number, comp: number, altura: number, xEntrada: number): Abertura[] {
  const piso = andar === 0 ? PISO : 0;
  const n = THREE.MathUtils.clamp(Math.round(comp / 2.7), 1, 6);
  const vao = comp / n;
  const larguraJanela = Math.min(1.2, vao - 0.9);
  const peitoril = piso + 1.0;
  const alturaJanela = Math.min(1.15, altura - peitoril - 0.3);
  const larguraPorta = Math.min(0.9, vao - 0.5);
  const alturaPorta = Math.min(piso + 2.1, altura - 0.2);

  let iPorta = -1;
  if (andar === 0 && larguraPorta >= 0.6 && alturaPorta >= 1.6) {
    // A porta de entrada fica na frente, sob a varanda da frente quando há uma; a da cozinha, nos fundos, do lado do quartinho.
    if (lado === 'frente') iPorta = THREE.MathUtils.clamp(Math.floor((xEntrada + comp / 2) / vao), 0, n - 1);
    else if (lado === 'fundos') iPorta = 0;
  }
  const lista: Abertura[] = [];
  for (let i = 0; i < n; i++) {
    const x = -comp / 2 + (i + 0.5) * vao;
    if (i === iPorta) lista.push({ tipo: 'porta', x, largura: larguraPorta, y: 0, altura: alturaPorta });
    else if (larguraJanela >= 0.5 && alturaJanela >= 0.45) {
      lista.push({ tipo: 'janela', x, largura: larguraJanela, y: peitoril, altura: alturaJanela });
    }
  }
  return lista;
}

// ---------------------------------------------------------------- Escada

interface Escada {
  degraus: number;
  espelho: number;
  pisada: number;
  x0: number;
  x1: number;
  /** Onde a escada começa (embaixo) e onde chega (em cima), em Z. Ela sobe da frente para os fundos. */
  zPe: number;
  zTopo: number;
  buraco: { x0: number; x1: number; z0: number; z1: number };
}

/** Escada reta encostada na parede da direita. Nula quando a casa é térrea ou pequena demais. */
function medidasDaEscada(casa: CasaConfig): Escada | null {
  if (casa.andares !== 2) return null;
  const t = ESPESSURA_PAREDE;
  const n = Math.max(2, Math.round(casa.peDireito / 0.175));
  const pisada = 0.26;
  const lance = (n - 1) * pisada;
  if (casa.profundidade - 2 * t < lance + 1.7 || casa.largura < 5.5) return null;
  const x1 = casa.largura / 2 - t - 0.02;
  const x0 = x1 - 0.85;
  const zPe = casa.profundidade / 2 - t - 0.95;
  const zTopo = zPe - lance;
  return {
    degraus: n,
    espelho: casa.peDireito / n,
    pisada,
    x0,
    x1,
    zPe,
    zTopo,
    buraco: { x0: x0 - 0.06, x1: casa.largura / 2 - t, z0: zTopo, z1: zTopo + lance * 0.8 },
  };
}

/** Pé das paredes internas de um andar (o piso acabado) e altura do teto dele. */
export function alturasDoAndar(casa: CasaConfig, andar: 0 | 1): { yPe: number; yTeto: number } {
  const k = Math.hypot(1, casa.inclinacaoTelhadoPct / 100);
  const yT = casa.andares * casa.peDireito - (FUNDO_RIPA + CAIBRO) * k - 0.02;
  return { yPe: andar === 0 ? PISO : casa.peDireito, yTeto: andar === 0 && casa.andares === 2 ? casa.peDireito - LAJE : yT - FORRO };
}

/**
 * Onde uma parede interna não passa, em um andar: no térreo, a escada; em cima, o vão dela com a mureta.
 * Nulo quando a casa não tem escada.
 */
export function vaoDaEscada(casa: CasaConfig, andar: 0 | 1): Planta | null {
  const escada = medidasDaEscada(casa);
  if (!escada) return null;
  const xb = casa.largura / 2 - ESPESSURA_PAREDE;
  return andar === 0
    ? { x0: escada.x0 - 0.15, x1: xb, z0: escada.zTopo, z1: escada.zPe }
    : { x0: escada.buraco.x0 - 0.08, x1: xb, z0: escada.buraco.z0, z1: escada.buraco.z1 + 0.08 };
}

// ---------------------------------------------------------------- Quartinho

function construirQuartinho(casa: CasaConfig): THREE.Group {
  const q = casa.quartinho;
  const g = new THREE.Group();
  g.name = 'quartinho';
  g.position.set(q.x, 0, q.z);
  g.rotation.y = THREE.MathUtils.degToRad(q.giro);
  const e = 0.1;
  const l = q.largura;
  const p = q.profundidade;
  const b = 0.2;
  const s = 0.15;
  const k = Math.hypot(1, s);
  const zFundo = -p / 2 - b;
  const zFrente = p / 2 + b;
  const yFrente = q.altura + (zFrente - zFundo) * s;
  /** Altura da face de baixo das ripas: as paredes sobem até aí, com os caibros embutidos, e não sobra fresta. */
  const yApoio = (z: number): number => q.altura + (z - zFundo) * s - FUNDO_RIPA * k - 0.002;

  const piso = new Construtor();
  piso.caixa(-l / 2, 0, -p / 2, l / 2, PISO, p / 2, 0);
  g.add(solido(piso, mat.cimento, 'piso-quartinho', { id: 'piso-quartinho', tipo: 'piso' }));

  const fundo = new Construtor();
  fundo.caixa(-l / 2, 0, -p / 2, l / 2, yApoio(-p / 2), -p / 2 + e, 0);
  g.add(solido(fundo, mat.quartinho, 'parede-quartinho-fundo', { id: 'parede-quartinho-fundo', tipo: 'parede' }));

  // Laterais: o topo acompanha a queda do telhado.
  const z0 = -p / 2 + e;
  const z1 = p / 2;
  const h0 = yApoio(z0);
  const h1 = yApoio(z1);
  for (const [nome, xa, xb] of [
    ['esquerda', -l / 2, -l / 2 + e],
    ['direita', l / 2 - e, l / 2],
  ] as const) {
    const c = new Construtor();
    c.quad([xa, 0, z0], [xa, 0, z1], [xa, h1, z1], [xa, h0, z0]);
    c.quad([xb, 0, z1], [xb, 0, z0], [xb, h0, z0], [xb, h1, z1]);
    c.quad([xa, h1, z1], [xb, h1, z1], [xb, h0, z0], [xa, h0, z0]);
    c.quad([xa, 0, z1], [xb, 0, z1], [xb, h1, z1], [xa, h1, z1]);
    const id = `parede-quartinho-${nome}`;
    g.add(solido(c, mat.quartinho, id, { id, tipo: 'parede' }));
  }

  // Frente: ombreiras estreitas e verga, com a porta larga de duas folhas aberta.
  const ombreira = THREE.MathUtils.clamp(l * 0.12, 0.15, 0.3);
  const yVerga = yApoio(p / 2);
  const alturaPorta = Math.min(2.05, yVerga - 0.18);
  const xPorta = l / 2 - ombreira;
  if (alturaPorta > 1.2 && xPorta > 0.3) {
    const frente = new Construtor();
    frente.caixa(-l / 2 + e, 0, p / 2 - e, -xPorta, yVerga, p / 2, 0);
    frente.caixa(xPorta, 0, p / 2 - e, l / 2 - e, yVerga, p / 2, 0);
    frente.caixa(-xPorta, alturaPorta, p / 2 - e, xPorta, yVerga, p / 2, 0);
    g.add(solido(frente, mat.quartinho, 'frente-quartinho'));

    const abertura = THREE.MathUtils.degToRad(150);
    for (const lado of [-1, 1] as const) {
      const folha = new Construtor();
      const lf = xPorta - 0.01;
      const hf = alturaPorta - 0.03;
      folha.caixa(0, PISO + 0.01, -0.017, lf, hf, 0.017, 0);
      // Travessas, do lado de fora da folha fechada.
      for (const y of [PISO + 0.2, (PISO + hf) / 2, hf - 0.2]) folha.caixa(0.03, y - 0.05, 0.017, lf - 0.03, y + 0.05, 0.035, 1);
      const m = marcarSolido(folha.malhaColorida(mat.madeiraCores, [cor.porta, cor.esquadria]));
      m.name = 'folha-quartinho';
      const pivo = new THREE.Group();
      pivo.name = 'porta-quartinho';
      pivo.position.set(lado * xPorta, 0, p / 2 + 0.02);
      // A folha nasce ao longo de +X. À esquerda gira −φ; à direita, π + φ: as duas abrem para fora.
      pivo.rotation.y = lado === -1 ? -abertura : Math.PI + abertura;
      pivo.add(m);
      g.add(pivo);
    }
  }

  // Prateleira na parede da esquerda, com uma caixa de ferramentas e uma lata.
  if (p > 1.3 && h0 > 1.9 && l > 1.4) {
    const xa = -l / 2 + e;
    const za = -p / 2 + e + 0.12;
    const zb = Math.min(za + 1.3, p / 2 - 0.5);
    const y = 1.62;
    const c = new Construtor();
    c.caixa(xa, y, za, xa + 0.28, y + 0.03, zb, 0);
    for (const z of [za + 0.12, zb - 0.12]) {
      c.caixa(xa, y - 0.2, z - 0.015, xa + 0.03, y, z + 0.015, 0);
      c.caixa(xa, y - 0.03, z - 0.015, xa + 0.24, y, z + 0.015, 0);
    }
    c.caixa(xa + 0.04, y + 0.03, za + 0.1, xa + 0.24, y + 0.19, za + 0.52, 1);
    c.caixa(xa + 0.11, y + 0.19, za + 0.2, xa + 0.17, y + 0.215, za + 0.42, 3);
    if (zb - za > 0.95) c.caixa(xa + 0.06, y + 0.03, za + 0.68, xa + 0.22, y + 0.21, za + 0.84, 2);
    const m = marcarSolido(c.malhaColorida(mat.lisoCores, [cor.madeira, cor.caixaDeFerramentas, cor.lata, cor.metal]));
    m.name = 'prateleira-quartinho';
    g.add(m);
  }

  // Uma água de 15%, caindo para os fundos (−Z), com beiral de 0,2.
  const agua = criarAgua({
    largura: l + 2 * b,
    comprimento: (zFrente - zFundo) * k,
    superficie: { id: 'telhado-quartinho', tipo: 'telhado' },
    caibro: CAIBRO_QUARTINHO,
    semente: 404,
  });
  agua.position.set(0, yFrente, zFrente);
  agua.rotation.order = 'YXZ';
  agua.rotation.set(Math.atan(s), Math.PI, 0);
  g.add(agua);

  // Calçadinha na frente da porta.
  const soleira = new Construtor();
  soleira.caixa(-l / 2, 0, p / 2, l / 2, 0.04, p / 2 + 1, 0);
  g.add(rasteiro(soleira, mat.calcada, 'calcada-quartinho'));
  return g;
}

// ---------------------------------------------------------------- Calçada e caminho

function construirCalcada(casa: CasaConfig, varandas: readonly MedidaVaranda[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'calcada';
  // A calçada contorna a casa e cada varanda: é o que está a até 0,8 m delas e fora delas.
  const cheios: Planta[] = [
    { x0: -casa.largura / 2, x1: casa.largura / 2, z0: -casa.profundidade / 2, z1: casa.profundidade / 2 },
    ...varandas.map((v) => v.planta),
  ];
  const largos = cheios.map((r) => ({ x0: r.x0 - CALCADA, x1: r.x1 + CALCADA, z0: r.z0 - CALCADA, z1: r.z1 + CALCADA }));
  const dentro = (lista: Planta[], x: number, z: number): boolean => lista.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const cortes = (eixo: 'x' | 'z'): number[] =>
    [...new Set([...cheios, ...largos].flatMap((r) => [r[`${eixo}0`], r[`${eixo}1`]]).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const xs = cortes('x');
  const zs = cortes('z');
  const c = new Construtor();
  const h = 0.04;
  for (let j = 0; j + 1 < zs.length; j++) {
    const zm = (zs[j]! + zs[j + 1]!) / 2;
    const tem = (i: number): boolean => {
      const xm = (xs[i]! + xs[i + 1]!) / 2;
      return dentro(largos, xm, zm) && !dentro(cheios, xm, zm);
    };
    // Células vizinhas na mesma faixa viram uma peça só.
    let inicio = -1;
    for (let i = 0; i < xs.length; i++) {
      const cheia = i + 1 < xs.length && tem(i);
      if (cheia && inicio < 0) inicio = i;
      if (!cheia && inicio >= 0) {
        c.caixa(xs[inicio]!, 0, zs[j]!, xs[i]!, h, zs[j + 1]!, 0, { ny: null });
        inicio = -1;
      }
    }
  }
  g.add(rasteiro(c, mat.calcada, 'calcada-casa'));

  // Caminho reto da calçada até a frente do quartinho.
  const q = casa.quartinho;
  const giro = THREE.MathUtils.degToRad(q.giro);
  const d = q.profundidade / 2 + 0.5;
  const alvo = new THREE.Vector2(q.x + Math.sin(giro) * d, q.z + Math.cos(giro) * d);
  // Sai do ponto da calçada mais próximo.
  const origem = new THREE.Vector2();
  let dist = Infinity;
  for (const r of largos) {
    const ponto = new THREE.Vector2(THREE.MathUtils.clamp(alvo.x, r.x0, r.x1), THREE.MathUtils.clamp(alvo.y, r.z0, r.z1));
    const d2 = ponto.distanceTo(alvo);
    if (d2 < dist) {
      dist = d2;
      origem.copy(ponto);
    }
  }
  if (dist > 0.3) {
    const caminho = new Construtor();
    caminho.caixa(-0.4, 0, -0.2, 0.4, h - 0.005, dist, 0);
    const m = rasteiro(caminho, mat.calcada, 'caminho-quartinho');
    m.position.set(origem.x, 0, origem.y);
    m.rotation.y = Math.atan2(alvo.x - origem.x, alvo.y - origem.y);
    g.add(m);
  }
  return g;
}

/**
 * Terreno em volta da casa como superfície de encaixe (placas sobre suporte e estação portátil): um plano que não é
 * desenhado, ao nível do chão. Dentro da casa, das varandas e do quartinho o raio do ponteiro acha antes o piso deles.
 */
function criarTerreno(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2 * MEIO_TERRENO, 2 * MEIO_TERRENO);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat.encaixe);
  m.name = 'terreno-de-encaixe';
  m.userData.superficie = MARCA_DO_TERRENO;
  m.userData.soEncaixe = true;
  return m;
}

// ---------------------------------------------------------------- Casa

export interface CasaCena {
  /** Grupo que gira com a orientação. Equipamentos e cabos entram aqui como filhos diretos e sobrevivem à reconstrução. */
  grupo: THREE.Group;
  /** Refaz a estrutura a partir da configuração e aplica a rotação. */
  reconstruir(casa: CasaConfig): void;
  aplicarVisao(modo: ModoVisao): void;
  /** Malhas de encaixe (`userData.superficie`) que o modo de visão atual não esconde. */
  superficies(): THREE.Mesh[];
  /** Todas as malhas de encaixe, também as que o modo de visão esconde. */
  todasAsSuperficies(): THREE.Mesh[];
}

export function criarCasa(): CasaCena {
  const grupo = new THREE.Group();
  grupo.name = 'casa';
  let estrutura = new THREE.Group();
  grupo.add(estrutura);
  let telhado = new THREE.Group();
  let superior = new THREE.Group();
  /** Água do quartinho (telhas, madeiramento, encaixe e laje de sombra): some nos modos sem telhado. */
  let telhadoQuartinho: THREE.Object3D | null = null;
  let modo: ModoVisao = 'completa';
  let medidas = '';
  let encaixes: THREE.Mesh[] | null = null;
  let todas: THREE.Mesh[] | null = null;
  let nomes: THREE.Mesh[] = [];

  function aplicarVisao(novo: ModoVisao): void {
    modo = novo;
    // Primeiro o andar de cima, que contém o telhado; depois o telhado, que vale por último.
    esconder(superior, modo === 'terreo');
    esconder(telhado, modo !== 'completa');
    // O telhado do quartinho some junto: é lá dentro que ficam o inversor, a bateria e os quadros. As paredes ficam.
    if (telhadoQuartinho) esconder(telhadoQuartinho, modo !== 'completa');
    // Os nomes dos cômodos só aparecem com a casa aberta; os do andar de cima somem com ele.
    for (const n of nomes) n.visible = modo !== 'completa';
    encaixes = null;
  }

  function superficies(): THREE.Mesh[] {
    if (!encaixes) {
      const lista: THREE.Mesh[] = [];
      estrutura.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.superficie && !o.userData.escondido) lista.push(o);
      });
      encaixes = lista;
    }
    return encaixes;
  }

  function todasAsSuperficies(): THREE.Mesh[] {
    if (!todas) {
      const lista: THREE.Mesh[] = [];
      estrutura.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.superficie) lista.push(o);
      });
      todas = lista;
    }
    return todas;
  }

  /** Tutorial: só o quartinho, com a calçadinha dele, e o terreno. Não há corpo da casa, varandas, cômodos nem calçada. */
  function construirSoQuartinho(casa: CasaConfig): void {
    superior = new THREE.Group();
    superior.name = 'andar-superior';
    telhado = new THREE.Group();
    telhado.name = 'telhado';
    nomes = [];
    const quartinho = construirQuartinho(casa);
    telhadoQuartinho = quartinho.getObjectByName('telhado-quartinho') ?? null;
    estrutura.add(quartinho);
    estrutura.add(criarTerreno());
  }

  function construir(casa: CasaConfig): void {
    if (casa.soQuartinho) return construirSoQuartinho(casa);
    const { largura: W, profundidade: D, peDireito: pd, andares } = casa;
    const t = ESPESSURA_PAREDE;
    const hTopo = andares * pd;
    const s = casa.inclinacaoTelhadoPct / 100;
    const k = Math.hypot(1, s);
    const cume = hTopo + (D / 2) * s;
    /** Quanto a face de baixo das ripas fica abaixo do plano da água, na vertical. */
    const cRipa = FUNDO_RIPA * k;
    /** Topo das paredes do último andar: abaixo dos caibros. */
    const yT = hTopo - (FUNDO_RIPA + CAIBRO) * k - 0.02;
    const varandas = medirVarandas(casa);
    const daFrente = varandas.find((v) => v.lado === 'frente');
    const xEntrada = daFrente ? (daFrente.x0 + daFrente.x1) / 2 : 0;
    const escada = medidasDaEscada(casa);

    superior = new THREE.Group();
    superior.name = 'andar-superior';
    telhado = new THREE.Group();
    telhado.name = 'telhado';

    // ---- Piso do térreo.
    const pisoTerreo = new Construtor();
    pisoTerreo.caixa(-W / 2 + 0.004, 0, -D / 2 + 0.004, W / 2 - 0.004, PISO, D / 2 - 0.004, 1, { py: 0 });
    estrutura.add(solido(pisoTerreo, [mat.pisoTerreo, mat.cimento], 'piso-terreo', { id: 'piso-terreo', tipo: 'piso' }));

    // ---- Paredes de fora, andar por andar.
    for (let i = 0; i < andares; i++) {
      const andar = i === 0 ? estrutura : superior;
      const altura = (i === andares - 1 ? yT : (i + 1) * pd) - i * pd;
      for (const lado of ['frente', 'fundos', 'esquerda', 'direita'] as const) {
        const lateral = lado === 'esquerda' || lado === 'direita';
        const comp = lateral ? D - 2 * t : W;
        const parede = criarParede({
          comprimento: comp,
          altura,
          espessura: t,
          aberturas: vaosDaFachada(lado, i, comp, altura, xEntrada),
          superficie: { id: `parede-${lado}-${i}`, tipo: 'parede' },
          barrado: i === 0 ? BARRADO : 0,
          piso: i === 0 ? PISO : 0,
        });
        parede.rotation.y = GIRO_DA_FACHADA[lado];
        parede.position.set(
          lado === 'direita' ? W / 2 : lado === 'esquerda' ? -W / 2 : 0,
          i * pd,
          lado === 'frente' ? D / 2 : lado === 'fundos' ? -D / 2 : 0,
        );
        andar.add(parede);
      }
    }

    // ---- Piso de cima, com o vão da escada.
    const xa = -W / 2 + t;
    const xb = W / 2 - t;
    const za = -D / 2 + t;
    const zb = D / 2 - t;
    if (andares === 2) {
      const laje = new Construtor();
      const y0 = pd - LAJE;
      if (escada) {
        const b = escada.buraco;
        laje.caixa(xa, y0, za, b.x0, pd, zb, 1, { py: 0 });
        laje.caixa(b.x0, y0, za, xb, pd, b.z0, 1, { py: 0, nx: null });
        laje.caixa(b.x0, y0, b.z1, xb, pd, zb, 1, { py: 0, nx: null });
      } else {
        laje.caixa(xa, y0, za, xb, pd, zb, 1, { py: 0 });
      }
      superior.add(solido(laje, [mat.pisoSuperior, mat.teto], 'piso-superior', { id: 'piso-superior', tipo: 'piso' }));
    }

    // ---- Escada de alvenaria e a mureta em volta do vão.
    if (escada) {
      const c = new Construtor();
      for (let i = 0; i < escada.degraus - 1; i++) {
        const z1 = escada.zPe - i * escada.pisada;
        c.caixa(escada.x0, PISO, z1 - escada.pisada, escada.x1, (i + 1) * escada.espelho, z1, 0, { ny: null });
      }
      estrutura.add(solido(c, mat.degrau, 'escada'));
      const b = escada.buraco;
      const mureta = new Construtor();
      mureta.caixa(b.x0 - 0.08, pd, b.z0, b.x0, pd + 0.9, b.z1 + 0.08, 0);
      mureta.caixa(b.x0, pd, b.z1, xb, pd + 0.9, b.z1 + 0.08, 0);
      const m = marcarSolido(mureta.malhaColorida(mat.reboco, [cor.dentro]));
      m.name = 'mureta-escada';
      superior.add(m);
    }

    // ---- Paredes internas e nomes dos cômodos, a partir dos dados da casa. Com 1 andar, os do andar 1 são ignorados.
    nomes = [];
    const interior: Planta = { x0: xa, x1: xb, z0: za, z1: zb };
    for (const andar of (andares === 2 ? [0, 1] : [0]) as (0 | 1)[]) {
      const pai = andar === 0 ? estrutura : superior;
      const { yPe, yTeto } = alturasDoAndar(casa, andar);
      // No térreo a parede para antes da escada; em cima, antes da mureta do vão.
      const vedado = vaoDaEscada(casa, andar);
      for (const parede of construirParedesInternas(casa, { andar, yPe, altura: yTeto - yPe, interior, vedado })) pai.add(parede);
      for (const comodo of casa.comodos) {
        if (comodo.andar !== andar || comodo.nome.trim() === '') continue;
        const nome = criarNomeDoComodo(comodo.nome.trim());
        nome.position.set(comodo.ponto[0], yPe + 0.012, comodo.ponto[1]);
        nomes.push(nome);
        pai.add(nome);
      }
    }

    // ---- Telhado principal: duas águas com a cumeeira paralela à frente.
    // Em casa térrea, o beiral some no trecho em que uma varanda encosta: o telhado dela nasce logo abaixo dessa borda.
    const b = casa.beiral;
    const larguraTelhado = W + 2 * b;
    const inclinacao = Math.atan(s);

    const aguaFrente = criarAgua({
      largura: larguraTelhado,
      comprimento: (D / 2 + b) * k,
      superficie: { id: 'telhado-frente', tipo: 'telhado' },
      caibro: CAIBRO,
      semente: 101,
      ...cortarAgua(casa, varandas, 1),
    });
    aguaFrente.position.set(0, cume, 0);
    aguaFrente.rotation.x = inclinacao;
    const aguaFundos = criarAgua({
      largura: larguraTelhado,
      comprimento: (D / 2 + b) * k,
      superficie: { id: 'telhado-fundos', tipo: 'telhado' },
      caibro: CAIBRO,
      semente: 202,
      ...cortarAgua(casa, varandas, -1),
    });
    aguaFundos.position.set(0, cume, 0);
    aguaFundos.rotation.order = 'YXZ';
    aguaFundos.rotation.set(inclinacao, Math.PI, 0);
    const xCumeE = -W / 2 - (cumeeiraSemPonta(casa, varandas, 'esquerda') ? 0 : b);
    const xCumeD = W / 2 + (cumeeiraSemPonta(casa, varandas, 'direita') ? 0 : b);
    const cumeeira = criarCumeeira(xCumeD - xCumeE, 505);
    cumeeira.position.set((xCumeE + xCumeD) / 2, cume, 0);
    telhado.add(aguaFrente, aguaFundos, cumeeira);

    // Alvenaria que some com o telhado: oitões, respaldo e forro, em uma malha só.
    const alvenaria = new Construtor();
    const yBeira = hTopo - cRipa;
    const yCume = cume - cRipa;
    // Oitões: fecham as laterais do topo das paredes até a face de baixo das ripas.
    for (const lado of [1, -1] as const) {
      for (const [x, paraFora] of [
        [(lado * W) / 2, true],
        [lado * (W / 2 - t), false],
      ] as const) {
        // A face olha para +X quando é a de fora do lado direito ou a de dentro do lado esquerdo.
        if ((lado === 1) === paraFora) {
          alvenaria.quad([x, yT, D / 2], [x, yT, -D / 2], [x, yBeira, -D / 2], [x, yBeira, D / 2]);
          alvenaria.tri([x, yBeira, D / 2], [x, yBeira, -D / 2], [x, yCume, 0]);
        } else {
          alvenaria.quad([x, yT, -D / 2], [x, yT, D / 2], [x, yBeira, D / 2], [x, yBeira, -D / 2]);
          alvenaria.tri([x, yBeira, -D / 2], [x, yBeira, D / 2], [x, yCume, 0]);
        }
      }
    }
    // Respaldo: o que falta das paredes da frente e dos fundos até o telhado.
    for (const sg of [1, -1] as const) {
      const zo = (sg * D) / 2;
      const zi = sg * (D / 2 - t);
      const yi = yBeira + t * s;
      type P = [number, number, number];
      const face = (a: P, b: P, c: P, d: P): void => {
        if (sg === 1) alvenaria.quad(a, b, c, d);
        else alvenaria.quad(d, c, b, a);
      };
      face([xa, yT, zo], [xb, yT, zo], [xb, yBeira, zo], [xa, yBeira, zo]);
      face([xb, yT, zi], [xa, yT, zi], [xa, yi, zi], [xb, yi, zi]);
      face([xa, yBeira, zo], [xb, yBeira, zo], [xb, yi, zi], [xa, yi, zi]);
    }
    // Forro do último andar.
    alvenaria.caixa(xa, yT - FORRO, za, xb, yT, zb, 1);
    const malhaAlvenaria = marcarSolido(alvenaria.malhaColorida(mat.reboco, [cor.parede, cor.teto]));
    malhaAlvenaria.name = 'oitoes-respaldo-forro';
    telhado.add(malhaAlvenaria);

    superior.add(telhado);
    estrutura.add(superior);

    for (const v of varandas) estrutura.add(construirVaranda(casa, v));
    const quartinho = construirQuartinho(casa);
    telhadoQuartinho = quartinho.getObjectByName('telhado-quartinho') ?? null;
    estrutura.add(quartinho);
    estrutura.add(construirCalcada(casa, varandas));
    estrutura.add(criarTerreno());
  }

  function reconstruir(casa: CasaConfig): void {
    grupo.rotation.y = Math.PI - THREE.MathUtils.degToRad(casa.orientacaoGraus);
    // Girar a casa não muda a estrutura: só refaz quando alguma medida muda.
    const novas = JSON.stringify({ ...casa, orientacaoGraus: 0 });
    if (novas === medidas) return;
    medidas = novas;

    grupo.remove(estrutura);
    liberar(estrutura);
    estrutura = new THREE.Group();
    estrutura.name = 'estrutura';
    todas = null;
    encaixes = null;
    grupo.add(estrutura);
    construir(casa);
    aplicarVisao(modo);
  }

  return { grupo, reconstruir, aplicarVisao, superficies, todasAsSuperficies };
}
