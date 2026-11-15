// Camada de dispositivos: um grupo por dispositivo do projeto, filho direto do grupo da casa.
// Especificação: docs/especificacao/fase-2.md, seções 1.3 e 2, e cena-e-interface.md, seção 5.
//
// A camada só desenha o estado: não muda o projeto. Cada grupo leva `userData.dispositivo = uid`,
// uma caixa invisível de clique do tamanho de `dimensoes` e, por terminal, um anel colorido, uma esfera
// invisível de clique (`userData.terminal = { disp, terminal, tipo }`) e um rótulo escondido.

import * as THREE from 'three';
import { CATALOGO } from '../catalogo';
import type { Item } from '../catalogo/tipos';
import { estado } from '../estado';
import type { Dispositivo, TipoTerminal } from '../nucleo/tipos';
import { COR_TERMINAL } from './conectores';
import { criarRotulo, liso } from './estampas';
import { ehGrampo } from './encaixe';
import { esconder } from './malha';
import { type Modelo, modeloDe, type TerminalDoModelo, TRILHO } from './modelos';
import { Molde } from './molde';
import { modeloDaProtecao, PROFUNDIDADE_DA_PROTECAO } from './protecoes';
import { ocupacaoDoQuadro, type OcupacaoDoQuadro } from './quadro';
import { criarSuporte } from './suporte';
import { placaNoChao } from './terreno';

/** Raio da esfera invisível de clique de um terminal. */
export const RAIO_DE_CLIQUE = 0.1;

export interface TerminalNaCasa {
  /** Onde o cabo se liga e para onde sai, em coordenadas da casa. */
  pos: THREE.Vector3;
  saida: THREE.Vector3;
  tipo: TipoTerminal;
  rotulo: string;
  /** Raio do anel colorido. */
  raio: number;
}

/** Como um terminal aparece enquanto um cabo é puxado. */
export type RealceDeTerminal = 'aceso' | 'apagado' | 'normal';

export interface PassagemPeloQuadro {
  /** Pontos em que o cabo entra e sai, na face de baixo da caixa, em coordenadas da casa. */
  entrada: THREE.Vector3;
  saida: THREE.Vector3;
  /** Direção em que os dois trechos deixam a caixa: para baixo dela. */
  direcao: THREE.Vector3;
}

export interface CamadaDeDispositivos {
  /** Refaz o que mudou em `estado.projeto.dispositivos` e, nos quadros, nas proteções dos cabos. */
  atualizar(): void;
  /** Reaplica o modo de visão: peça em superfície escondida some e deixa de receber clique. */
  atualizarVisao(): void;
  /** Grupo de um dispositivo, com `userData.dispositivo`, `userData.dimensoes` e `userData.volume`. */
  grupoDe(uid: string): THREE.Group | undefined;
  /** Verdadeiro se a peça está em uma superfície que o modo de visão esconde. */
  escondida(uid: string): boolean;
  /** Posição e saída de um terminal, em coordenadas da casa, calculadas do estado. Nulo se a peça não está na cena. */
  terminal(uid: string, terminal: string): TerminalNaCasa | null;
  /** Por onde um cabo entra e sai de um quadro. Nulo se o quadro não está na cena. */
  passagem(uidQuadro: string, uidCabo: string): PassagemPeloQuadro | null;
  /** Verdadeiro se a proteção de índice dado do cabo está desenhada no trilho de um quadro. */
  noTrilho(uidCabo: string, indice: number): boolean;
  /** Caixas invisíveis de clique das peças à vista (`userData.dispositivo`). */
  caixasDeClique(): THREE.Object3D[];
  /** Esferas invisíveis de clique dos terminais das peças à vista (`userData.terminal`). */
  alvosDeTerminal(): THREE.Object3D[];
  /**
   * Terminal mais próximo do raio, entre os que o raio alcança (a menos de 0,10 do centro). As esferas de clique de
   * terminais vizinhos se sobrepõem; por isso vale o centro mais perto do raio, e não a primeira esfera tocada.
   */
  terminalNoRaio(raio: THREE.Ray): { disp: string; terminal: string; tipo: TipoTerminal } | null;
  /**
   * Enquanto um cabo é puxado: acende (halo verde) os terminais em que ele pode ser ligado e apaga os outros.
   * Nulo devolve todos ao normal.
   */
  realcarTerminais(realce: ((disp: string, terminal: string, tipo: TipoTerminal) => RealceDeTerminal) | null): void;
  /** Aumenta o anel do terminal sob o ponteiro. Nulo desfaz. */
  destacarTerminal(alvo: { disp: string; terminal: string } | null): void;
  /**
   * Grampo de parede: vira o desenho dele em torno da normal, para o arco ficar atravessado sobre o cabo, e o amplia
   * quando o cabo é mais grosso que o arco. Quem chama é a camada de cabos, que sabe por onde o cabo passa.
   */
  ajustarGrampo(uid: string, angulo: number, escala: number): void;
  /** Mostra ou esconde o rótulo de um terminal (PV+, BAT−, Tomada). */
  mostrarRotulo(uid: string, terminal: string, visivel: boolean): void;
  /** Mostra o nome curto de uma peça acima dela. Nulo esconde. */
  mostrarNome(uid: string | null): void;
  /** Liga ou desliga o que acende na peça (tela, lâmpada, luzes). Vale até a próxima mudança de `ligado`. */
  definirAtivo(uid: string, ativo: boolean): void;
  /** Gira as hélices dos ventiladores ativos. Para o laço de simulação da fase 3. */
  animar(segundos: number): boolean;
  /** Triângulos do modelo de cada item à mostra, para conferir o limite de 3.000 por peça. */
  triangulos(): Record<string, number>;
  destruir(): void;
}

interface Peca {
  uid: string;
  item: Item;
  modelo: Modelo;
  grupo: THREE.Group;
  pos: string;
  superficie: string | null;
  ligado: boolean;
  escondida: boolean;
  rotulos: Map<string, THREE.Sprite>;
  helice: THREE.Object3D | null;
  ativo: boolean;
  trilho: THREE.Group | null;
  assinaturaDoTrilho: string;
  ocupacao: OcupacaoDoQuadro | null;
  /** Placa no terreno: o suporte inclinado e a inclinação com que ele foi feito. */
  suporte: THREE.Group | null;
  inclinacaoDoSuporte: number | null;
}

const EIXO_Z = new THREE.Vector3(0, 0, 1);

export function criarCamadaDeDispositivos(casa: THREE.Group): CamadaDeDispositivos {
  const pecas = new Map<string, Peca>();
  let escondidas = new Map<string, boolean>();

  // Geometrias e materiais divididos por todas as peças.
  const geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  const geoEsfera = new THREE.SphereGeometry(RAIO_DE_CLIQUE, 10, 8);
  const geoAnel = new THREE.TorusGeometry(1, 0.2, 6, 24);
  const geoAro = new THREE.TorusGeometry(1.3, 0.07, 4, 24);
  const invisivel = new THREE.MeshBasicMaterial({ visible: false });
  const geoHalo = new THREE.SphereGeometry(1, 14, 10);
  // O halo aparece mesmo atrás de parede: é ele que mostra onde o cabo pode ser ligado.
  const matHalo = new THREE.MeshBasicMaterial({ color: '#5df2a0', transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, toneMapped: false });
  const matApagado = new THREE.MeshBasicMaterial({ color: '#9aa3ab', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
  let realceAtivo: ((disp: string, terminal: string, tipo: TipoTerminal) => RealceDeTerminal) | null = null;
  let destacado: { disp: string; terminal: string } | null = null;
  const matAnel = (tipo: TipoTerminal): THREE.Material =>
    liso(`anel-${tipo}`, () => new THREE.MeshBasicMaterial({ color: COR_TERMINAL[tipo], toneMapped: false }));
  const matAro = (): THREE.Material => liso('aro-claro', () => new THREE.MeshBasicMaterial({ color: '#eceff1', toneMapped: false }));
  let nome: THREE.Sprite | null = null;

  function lerEscondidas(): void {
    const mapa = new Map<string, boolean>();
    casa.traverse((o) => {
      const marca = o.userData.superficie as { id: string } | undefined;
      if (!marca || !(o instanceof THREE.Mesh)) return;
      // Uma superfície pode ter várias malhas (parede interrompida): só está escondida se todas estão.
      mapa.set(marca.id, (mapa.get(marca.id) ?? true) && o.userData.escondido === true);
    });
    escondidas = mapa;
  }

  function criarTerminal(uid: string, t: TerminalDoModelo, rotulos: Map<string, THREE.Sprite>): THREE.Group {
    const g = new THREE.Group();
    g.name = `terminal-${t.id}`;
    g.position.set(t.pos[0], t.pos[1], t.pos[2]);
    const saida = new THREE.Vector3(t.saida[0], t.saida[1], t.saida[2]);
    g.userData.saida = saida;
    const anel = new THREE.Mesh(geoAnel, matAnel(t.tipo));
    anel.name = 'anel';
    anel.quaternion.setFromUnitVectors(EIXO_Z, saida);
    anel.scale.setScalar(t.raio);
    anel.userData.anel = true;
    g.add(anel);
    if (t.tipo === 'cc-') {
      // O negativo é cinza-escuro: um aro claro em volta o separa de peças escuras.
      const aro = new THREE.Mesh(geoAro, matAro());
      aro.name = 'aro';
      aro.quaternion.copy(anel.quaternion);
      aro.scale.setScalar(t.raio);
      g.add(aro);
    }
    const alvo = new THREE.Mesh(geoEsfera, invisivel);
    alvo.name = 'alvo';
    alvo.userData.terminal = { disp: uid, terminal: t.id, tipo: t.tipo };
    g.add(alvo);
    const rotulo = criarRotulo(t.rotulo, COR_TERMINAL[t.tipo]);
    rotulo.name = 'rotulo';
    g.add(rotulo);
    rotulos.set(t.id, rotulo);
    return g;
  }

  /** Aplica ao terminal o realce da puxada de cabo e o destaque do ponteiro. */
  function vestirTerminal(p: Peca, t: TerminalDoModelo): void {
    const g = p.grupo.getObjectByName(`terminal-${t.id}`);
    const anel = g?.getObjectByName('anel') as THREE.Mesh | undefined;
    if (!g || !anel) return;
    const realce = realceAtivo ? realceAtivo(p.uid, t.id, t.tipo) : 'normal';
    const noPonteiro = destacado !== null && destacado.disp === p.uid && destacado.terminal === t.id;
    anel.material = realce === 'apagado' ? matApagado : matAnel(t.tipo);
    anel.scale.setScalar(t.raio * (noPonteiro ? 1.5 : realce === 'aceso' ? 1.2 : 1));
    const aro = g.getObjectByName('aro');
    if (aro) {
      aro.visible = realce !== 'apagado';
      aro.scale.copy(anel.scale);
    }
    let halo = g.getObjectByName('halo');
    if (realce === 'aceso') {
      if (!halo) {
        halo = new THREE.Mesh(geoHalo, matHalo);
        halo.name = 'halo';
        halo.renderOrder = 5;
        (halo as THREE.Mesh).raycast = () => {};
        if (p.escondida) esconder(halo, true);
        g.add(halo);
      }
      halo.scale.setScalar(t.raio * (noPonteiro ? 2.6 : 1.9));
    } else if (halo) g.remove(halo);
  }

  function vestirTerminais(): void {
    for (const p of pecas.values()) for (const t of p.modelo.terminais) vestirTerminal(p, t);
  }

  function aplicarAtivo(p: Peca): void {
    p.grupo.traverse((o) => {
      if (o.name === 'aceso') o.visible = p.ativo;
      else if (o.name === 'apagado') o.visible = !p.ativo;
    });
  }

  function criarPeca(d: Dispositivo, item: Item, modelo: Modelo): Peca {
    const grupo = new THREE.Group();
    grupo.name = `dispositivo-${d.uid}`;
    grupo.userData.dispositivo = d.uid;
    grupo.userData.item = item.id;
    grupo.userData.dimensoes = modelo.dimensoes;
    grupo.userData.volume = modelo.volume;
    const corpo = modelo.grupo.clone();
    corpo.name = 'modelo';
    grupo.add(corpo);
    const caixa = new THREE.Mesh(geoCaixa, invisivel);
    caixa.name = 'caixa-de-clique';
    // O grampo é miúdo e fica dentro do tubo de clique do cabo: a caixa dele tem uma folga, para o ponteiro o acertar.
    const folga = ehGrampo(item) ? FOLGA_DE_CLIQUE_DO_GRAMPO : 0;
    caixa.scale.set(modelo.dimensoes[0] + folga, modelo.dimensoes[1] + folga, modelo.dimensoes[2] + folga);
    caixa.userData.dispositivo = d.uid;
    caixa.userData.caixaDeClique = true;
    grupo.add(caixa);
    const rotulos = new Map<string, THREE.Sprite>();
    for (const t of modelo.terminais) grupo.add(criarTerminal(d.uid, t, rotulos));
    const peca: Peca = {
      uid: d.uid, item, modelo, grupo, pos: '', superficie: null, ligado: d.ligado, escondida: false, rotulos,
      helice: grupo.getObjectByName('helice') ?? null, ativo: d.ligado, trilho: null, assinaturaDoTrilho: '', ocupacao: null,
      suporte: null, inclinacaoDoSuporte: null,
    };
    aplicarAtivo(peca);
    casa.add(grupo);
    return peca;
  }

  function removerTrilho(p: Peca): void {
    if (!p.trilho) return;
    p.grupo.remove(p.trilho);
    // Os fios são só deste quadro; as proteções são cópias de moldes divididos.
    p.trilho.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.proprio) o.geometry.dispose();
    });
    p.trilho = null;
  }

  /** Põe, troca ou tira o suporte inclinado: só a placa no terreno tem um. */
  function refazerSuporte(p: Peca, d: Dispositivo): void {
    const inclinacao = placaNoChao(d, p.item) ? (d.inclinacaoGraus ?? 0) : null;
    if (inclinacao === p.inclinacaoDoSuporte) return;
    if (p.suporte) {
      p.grupo.remove(p.suporte);
      p.suporte.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      p.suporte = null;
    }
    p.inclinacaoDoSuporte = inclinacao;
    if (inclinacao === null) return;
    p.suporte = criarSuporte(p.modelo.dimensoes[0], p.modelo.dimensoes[1], inclinacao);
    p.grupo.add(p.suporte);
    if (p.escondida) esconder(p.suporte, true);
  }

  function removerPeca(p: Peca): void {
    removerTrilho(p);
    if (p.suporte) {
      p.suporte.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      p.suporte = null;
    }
    casa.remove(p.grupo);
    pecas.delete(p.uid);
  }

  /** Proteções no trilho do quadro e os fios que sobem da face de baixo até elas. */
  function refazerTrilho(p: Peca): void {
    const modulos = p.item.categoria === 'acessorio' ? (p.item.modulos ?? 0) : 0;
    if (modulos === 0) return;
    const ocupacao = ocupacaoDoQuadro(estado.projeto, CATALOGO, p.uid, modulos);
    p.ocupacao = ocupacao;
    const assinatura = JSON.stringify([ocupacao.pecas.map((x) => [x.cabo, x.indice, x.item.id, x.x]), [...ocupacao.cabos]]);
    if (assinatura === p.assinaturaDoTrilho) return;
    p.assinaturaDoTrilho = assinatura;
    removerTrilho(p);
    const [, H, D] = p.modelo.dimensoes;
    const trilho = new THREE.Group();
    trilho.name = 'trilho';
    const z = -D / 2 + TRILHO.frente + PROFUNDIDADE_DA_PROTECAO / 2;
    const fundoDaPeca = new Map<string, number>();
    for (const peca of ocupacao.pecas) {
      const modelo = modeloDaProtecao(peca.item);
      const g = modelo.grupo.clone();
      g.name = `protecao-${peca.cabo}-${peca.indice}`;
      g.position.set(peca.x, TRILHO.y, z);
      g.traverse((o) => {
        o.userData.cabo = peca.cabo;
        o.userData.protecao = peca.indice;
      });
      trilho.add(g);
      fundoDaPeca.set(peca.cabo, TRILHO.y - modelo.altura / 2);
    }
    // Fios da face de baixo da caixa até o borne de baixo das peças do cabo.
    const fios = new Molde();
    for (const [cabo, { entrada, saida }] of ocupacao.cabos) {
      const topo = fundoDaPeca.get(cabo);
      if (topo === undefined) continue;
      for (const x of [entrada, saida]) fios.cilindro('plastico', '#4a5158', x, (-H / 2 + topo) / 2, PASSAGEM_Z, 0.0032, topo + H / 2, 'y', 6);
    }
    const malhas = fios.montar();
    malhas.traverse((o) => {
      o.userData.proprio = true;
    });
    trilho.add(malhas);
    p.grupo.add(trilho);
    p.trilho = trilho;
    if (p.escondida) esconder(trilho, true);
  }

  function atualizar(): void {
    const vivos = new Set<string>();
    for (const d of estado.projeto.dispositivos) {
      const item = CATALOGO.get(d.itemId);
      const modelo = item && d.superficie !== null ? modeloDe(item) : null;
      if (!item || !modelo) continue;
      vivos.add(d.uid);
      let p = pecas.get(d.uid);
      if (p && p.item !== item) {
        removerPeca(p);
        p = undefined;
      }
      if (!p) {
        p = criarPeca(d, item, modelo);
        pecas.set(d.uid, p);
      }
      const pos = `${d.pos.join(',')}|${d.quat.join(',')}`;
      if (pos !== p.pos) {
        p.pos = pos;
        p.grupo.position.set(d.pos[0], d.pos[1], d.pos[2]);
        p.grupo.quaternion.set(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
      }
      if (d.ligado !== p.ligado) {
        p.ligado = d.ligado;
        p.ativo = d.ligado;
        aplicarAtivo(p);
      }
      p.superficie = d.superficie;
      refazerTrilho(p);
      refazerSuporte(p, d);
      const escondida = escondidas.get(d.superficie ?? '') ?? false;
      if (escondida !== p.escondida) {
        p.escondida = escondida;
        esconder(p.grupo, escondida);
      }
    }
    for (const p of [...pecas.values()]) if (!vivos.has(p.uid)) removerPeca(p);
    if (nome && nome.visible && !pecas.has(nome.userData.dispositivo as string)) mostrarNome(null);
  }

  function atualizarVisao(): void {
    lerEscondidas();
    for (const p of pecas.values()) {
      const escondida = escondidas.get(p.superficie ?? '') ?? false;
      if (escondida === p.escondida) continue;
      p.escondida = escondida;
      esconder(p.grupo, escondida);
    }
  }

  function dispositivoNaCena(uid: string): { d: Dispositivo; modelo: Modelo; item: Item } | null {
    const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
    if (!d || d.superficie === null) return null;
    const item = CATALOGO.get(d.itemId);
    const modelo = item ? modeloDe(item) : null;
    return item && modelo ? { d, modelo, item } : null;
  }

  function terminal(uid: string, id: string): TerminalNaCasa | null {
    const achado = dispositivoNaCena(uid);
    const t = achado?.modelo.terminais.find((x) => x.id === id);
    if (!achado || !t) return null;
    const q = new THREE.Quaternion(...achado.d.quat);
    return {
      pos: new THREE.Vector3(...t.pos).applyQuaternion(q).add(new THREE.Vector3(...achado.d.pos)),
      saida: new THREE.Vector3(...t.saida).applyQuaternion(q),
      tipo: t.tipo,
      rotulo: t.rotulo,
      raio: t.raio,
    };
  }

  function passagem(uidQuadro: string, uidCabo: string): PassagemPeloQuadro | null {
    const achado = dispositivoNaCena(uidQuadro);
    if (!achado || achado.item.categoria !== 'acessorio' || !achado.item.modulos) return null;
    const ocupacao = pecas.get(uidQuadro)?.ocupacao ?? ocupacaoDoQuadro(estado.projeto, CATALOGO, uidQuadro, achado.item.modulos);
    const x = ocupacao.cabos.get(uidCabo);
    if (!x) return null;
    const q = new THREE.Quaternion(...achado.d.quat);
    const centro = new THREE.Vector3(...achado.d.pos);
    const y = -achado.modelo.dimensoes[1] / 2;
    return {
      entrada: new THREE.Vector3(x.entrada, y, PASSAGEM_Z).applyQuaternion(q).add(centro),
      saida: new THREE.Vector3(x.saida, y, PASSAGEM_Z).applyQuaternion(q).add(centro),
      direcao: new THREE.Vector3(0, -1, 0).applyQuaternion(q),
    };
  }

  function noTrilho(uidCabo: string, indice: number): boolean {
    for (const p of pecas.values()) {
      if (p.ocupacao?.pecas.some((x) => x.cabo === uidCabo && x.indice === indice)) return true;
    }
    return false;
  }

  function mostrarNome(uid: string | null): void {
    const p = uid === null ? undefined : pecas.get(uid);
    if (nome) {
      nome.parent?.remove(nome);
      nome = null;
    }
    if (!p) return;
    nome = criarRotulo(p.item.nome);
    nome.name = 'nome';
    nome.userData.dispositivo = p.uid;
    nome.position.set(0, p.modelo.volume.max.y + 0.08, 0);
    nome.visible = true;
    p.grupo.add(nome);
    if (p.escondida) esconder(nome, true);
  }

  const centro = new THREE.Vector3();

  return {
    atualizar,
    atualizarVisao,
    grupoDe: (uid) => pecas.get(uid)?.grupo,
    escondida: (uid) => pecas.get(uid)?.escondida ?? false,
    terminal,
    passagem,
    noTrilho,
    caixasDeClique() {
      const lista: THREE.Object3D[] = [];
      for (const p of pecas.values()) if (!p.escondida) lista.push(p.grupo.getObjectByName('caixa-de-clique')!);
      return lista;
    },
    alvosDeTerminal() {
      const lista: THREE.Object3D[] = [];
      for (const p of pecas.values()) {
        if (p.escondida) continue;
        for (const t of p.modelo.terminais) lista.push(p.grupo.getObjectByName(`terminal-${t.id}`)!.getObjectByName('alvo')!);
      }
      return lista;
    },
    terminalNoRaio(raio) {
      let melhor: { disp: string; terminal: string; tipo: TipoTerminal } | null = null;
      let menor = RAIO_DE_CLIQUE * RAIO_DE_CLIQUE;
      for (const p of pecas.values()) {
        if (p.escondida) continue;
        for (const t of p.modelo.terminais) {
          p.grupo.getObjectByName(`terminal-${t.id}`)!.getWorldPosition(centro);
          const d2 = raio.distanceSqToPoint(centro);
          if (d2 < menor) {
            menor = d2;
            melhor = { disp: p.uid, terminal: t.id, tipo: t.tipo };
          }
        }
      }
      return melhor;
    },
    realcarTerminais(realce) {
      realceAtivo = realce;
      vestirTerminais();
    },
    destacarTerminal(alvo) {
      const antes = destacado;
      destacado = alvo;
      for (const x of [antes, alvo]) {
        const p = x ? pecas.get(x.disp) : undefined;
        const t = p?.modelo.terminais.find((y) => y.id === x!.terminal);
        if (p && t) vestirTerminal(p, t);
      }
    },
    mostrarRotulo(uid, id, visivel) {
      const rotulo = pecas.get(uid)?.rotulos.get(id);
      if (rotulo) rotulo.visible = visivel;
    },
    ajustarGrampo(uid, angulo, escala) {
      const p = pecas.get(uid);
      const corpo = p?.grupo.getObjectByName('modelo');
      if (!p || !corpo || !ehGrampo(p.item)) return;
      corpo.rotation.set(0, 0, angulo);
      corpo.scale.setScalar(escala);
      // A base continua encostada na superfície.
      corpo.position.set(0, 0, (p.modelo.dimensoes[2] / 2) * (escala - 1));
    },
    mostrarNome,
    definirAtivo(uid, ativo) {
      const p = pecas.get(uid);
      if (!p || p.ativo === ativo) return;
      p.ativo = ativo;
      aplicarAtivo(p);
    },
    animar(segundos) {
      let girou = false;
      for (const p of pecas.values()) {
        if (!p.helice || !p.ativo) continue;
        p.helice.rotation.z -= segundos * 14;
        girou = true;
      }
      return girou;
    },
    triangulos() {
      const t: Record<string, number> = {};
      for (const p of pecas.values()) t[p.item.id] = p.modelo.triangulos;
      return t;
    },
    destruir() {
      for (const p of [...pecas.values()]) removerPeca(p);
      mostrarNome(null);
      geoCaixa.dispose();
      geoEsfera.dispose();
      geoAnel.dispose();
      geoAro.dispose();
      invisivel.dispose();
      geoHalo.dispose();
      matHalo.dispose();
      matApagado.dispose();
    },
  };
}

/** Quanto a caixa de clique do grampo de parede é maior que ele, em cada medida. */
const FOLGA_DE_CLIQUE_DO_GRAMPO = 0.03;

/** Profundidade, em coordenadas do quadro, em que os cabos atravessam a face de baixo da caixa: a dos bornes das proteções. */
const PASSAGEM_Z = 0.008;
