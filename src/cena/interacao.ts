// Interação com o ponteiro: arrastar do catálogo, selecionar, mover, girar, apagar e puxar cabos.
// Especificação: docs/especificacao/cena-e-interface.md, seções 6 a 8, e fase-2.md, seção 3. Tarefas 2.2 a 2.4.
//
// A cena não muda o projeto direto: tudo aqui termina em uma ação de `src/estado.ts`.
// Eventos que a interface emite na `window`:
//   offgrid:arrastar-item      { itemId, clientX, clientY }   apertou um cartão do catálogo
//   offgrid:girar-selecionado                                  botão "Girar" do painel do item
//   offgrid:acao               Acao ('mais-placa' ou 'mais-bateria') botão de uma sugestão do consultor
//   offgrid:placa-no-chao      { inclinacao?, azimute? }       campos "Inclinação" e "Direção" da placa selecionada no terreno

import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOGO } from '../catalogo';
import type { Item, Protecao } from '../catalogo/tipos';
import { acoes, assinar, type Encaixe, estado, motivoParaNaoLigar } from '../estado';
import type { Acao, PontaCabo, TipoTerminal } from '../nucleo/tipos';
import { type CamadaDeCabos, corDoCabo } from './cabos';
import { type CamadaDeDispositivos, RAIO_DE_CLIQUE } from './dispositivos';
import { superficieAceita } from './encaixe';
import type { Candidato, Lugares, Toque } from './lugares';
import { acrescentarBateria, acrescentarPlaca } from './maisPecas';
import type { TipoSuperficie } from './malha';
import { modeloDe } from './modelos';
import { azimutePadrao, giroParaOAzimute, ID_TERRENO, limitarInclinacao, placaNoChao } from './terreno';

export interface PartesDaCena {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controles: OrbitControls;
  casa: THREE.Group;
  superficies(): THREE.Mesh[];
  dispositivos: CamadaDeDispositivos;
  cabos: CamadaDeCabos;
  lugares: Lugares;
  /** Quadro novo com a sombra refeita (uma peça mudou de lugar). */
  pedirQuadro(): void;
  /** Quadro novo sem refazer a sombra (fantasma, destaque, rótulo). */
  pedirQuadroLeve(): void;
  naTela(pontoNaCasa: THREE.Vector3): [number, number];
}

export interface Interacao {
  /** Para o roteiro de verificação: o que o ponteiro está fazendo e se soltar agora daria certo. */
  situacao(): { modo: string; valido: boolean | null; motivo: string | null };
  /** `id` das superfícies sobre as quais uma peça está sendo arrastada (do catálogo ou movida): a apontada e a do encaixe. Vazio fora de um arraste. */
  superficiesDoArraste(): string[];
  destruir(): void;
}

type Alvo =
  | { tipo: 'terminal'; disp: string; terminal: string; tipoDoTerminal: TipoTerminal }
  | { tipo: 'dispositivo'; uid: string }
  | { tipo: 'cabo'; uid: string };

/** Placa levada ao terreno: giro em torno da vertical e inclinação do suporte. Nulo usa o padrão (face para o norte, latitude do local). */
interface NoChao {
  giro: number | null;
  inclinacao: number | null;
}

type Modo =
  | { tipo: 'ocioso' }
  /** Botão apertado na cena, ainda sem passar dos 4 px. */
  | { tipo: 'apertado'; x: number; y: number; alvo: Alvo | null }
  /** Arraste que não é da interação: a órbita da câmera, ou um cabo apertado e arrastado. */
  | { tipo: 'alheio' }
  | { tipo: 'catalogo'; item: Item; giro: number; chao: NoChao; candidato: Candidato | null }
  | { tipo: 'protecao'; item: Protecao; cabo: string | null }
  | { tipo: 'mover'; uid: string; item: Item; giro: number; chao: NoChao; desvio: [number, number]; marcado: boolean; candidato: Candidato | null }
  /**
   * Cabo sendo puxado. `fixo` é o cabo começado com um clique no terminal, sem arrastar: ele segue o ponteiro com o botão solto,
   * a câmera continua livre (girar, deslizar, aproximar, trocar a visão) e um clique no terminal de destino o liga.
   * É o jeito de ligar duas peças que não aparecem juntas na tela, como um aparelho da sala e o inversor do quartinho.
   */
  | { tipo: 'cabo'; de: PontaCabo; tipoDoTerminal: TipoTerminal; x: number; y: number; moveu: boolean; fixo: boolean; para: PontaCabo | null; motivo: string | null };

/** Distância, em pixels, a partir da qual apertar e mexer vira arraste. */
const LIMIAR_DE_ARRASTE = 4;
/** Sem cabo sendo puxado, o terminal responde até esta distância do centro dele, em pixels (e nunca mais que os 0,10 m). */
const ALCANCE_DO_TERMINAL_PX = 12;

const COR_VALIDO = '#2fbf71';
const COR_INVALIDO = '#e5484d';
const COR_SELECAO = '#ffc21a';

const NOME_DA_SUPERFICIE: Record<TipoSuperficie, string> = { telhado: 'um telhado', parede: 'uma parede', piso: 'um piso' };

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT') return true;
  // Controle deslizante, caixa de marcar e botão não recebem texto: com o foco neles, os atalhos continuam valendo.
  return alvo instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'file'].includes(alvo.type);
}

export function criarInteracao(c: PartesDaCena): Interacao {
  let modo: Modo = { tipo: 'ocioso' };
  const raio = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ---------------------------------------------------------------- Dica perto do ponteiro

  const dica = document.createElement('div');
  dica.setAttribute('role', 'status');
  dica.dataset.offgridDica = '';
  Object.assign(dica.style, {
    position: 'fixed', zIndex: '1000', pointerEvents: 'none', display: 'none', maxWidth: '260px',
    padding: '5px 9px', borderRadius: '8px', font: '600 13px system-ui, "Segoe UI", Arial, sans-serif', lineHeight: '1.3',
    color: '#ffffff', background: '#1f2933', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(dica);
  const TOM = { neutro: '#1f2933', bom: '#1b7f4b', ruim: '#b3261e' };
  let esperaDaDica: ReturnType<typeof setTimeout> | null = null;

  function mostrarDica(texto: string | null, x = 0, y = 0, tom: keyof typeof TOM = 'neutro'): void {
    if (esperaDaDica) {
      clearTimeout(esperaDaDica);
      esperaDaDica = null;
    }
    if (texto === null) {
      dica.style.display = 'none';
      return;
    }
    if (dica.textContent !== texto) dica.textContent = texto;
    dica.style.background = TOM[tom];
    dica.style.display = 'block';
    // À direita e abaixo do ponteiro, sem sair da janela.
    const l = dica.offsetWidth;
    const a = dica.offsetHeight;
    dica.style.left = `${Math.max(4, Math.min(window.innerWidth - l - 4, x + 16))}px`;
    dica.style.top = `${Math.max(4, Math.min(window.innerHeight - a - 4, y + 18))}px`;
  }

  /** Aviso que some sozinho (resposta a uma tecla ou a um botão, sem ponteiro parado em cima). */
  function avisar(texto: string, x: number, y: number, tom: keyof typeof TOM = 'ruim'): void {
    mostrarDica(texto, x, y, tom);
    esperaDaDica = setTimeout(() => mostrarDica(null), 2600);
  }

  // ---------------------------------------------------------------- Raio do ponteiro

  /** Aponta o raio para a posição da janela. Falso se ela está fora da cena. */
  function mirar(x: number, y: number): boolean {
    const r = c.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    c.camera.updateMatrixWorld();
    c.casa.updateWorldMatrix(true, false);
    raio.setFromCamera(ndc, c.camera);
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** O ponteiro está sobre a cena, e não sobre um painel que a cobre. */
  function sobreACena(x: number, y: number): boolean {
    return document.elementFromPoint(x, y) === c.canvas;
  }

  const paraOMundo = (p: THREE.Vector3): THREE.Vector3 => p.clone().applyMatrix4(c.casa.matrixWorld);
  const paraACasa = (p: THREE.Vector3): THREE.Vector3 => p.clone().applyMatrix4(new THREE.Matrix4().copy(c.casa.matrixWorld).invert());

  /** Distância da primeira superfície que o raio toca, ou infinito. */
  function distanciaDaSuperficie(): number {
    return raio.intersectObjects(c.superficies(), false)[0]?.distance ?? Infinity;
  }

  /**
   * Terminal sob o ponteiro. Com `folgado` (cabo sendo puxado) valem os 0,10 m da esfera de clique; sem ele,
   * o alcance encolhe com o zoom, para o resto da peça continuar podendo ser agarrado.
   */
  function terminalSob(folgado: boolean): (Alvo & { tipo: 'terminal' }) | null {
    const t = c.dispositivos.terminalNoRaio(raio.ray);
    const info = t ? c.dispositivos.terminal(t.disp, t.terminal) : null;
    if (!t || !info) return null;
    const centro = paraOMundo(info.pos);
    const distancia = raio.ray.origin.distanceTo(centro);
    if (!folgado) {
      const metrosPorPixel = (2 * distancia * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
      const alcance = Math.min(RAIO_DE_CLIQUE, Math.max(info.raio * 1.6, ALCANCE_DO_TERMINAL_PX * metrosPorPixel));
      if (raio.ray.distanceSqToPoint(centro) > alcance * alcance) return null;
    }
    // Parede ou telhado na frente: o terminal não está à vista.
    if (distanciaDaSuperficie() < distancia - 0.12) return null;
    return { tipo: 'terminal', disp: t.disp, terminal: t.terminal, tipoDoTerminal: t.tipo };
  }

  function caboSob(): { uid: string; distancia: number } | null {
    const t = raio.intersectObjects(c.cabos.malhas(), false)[0];
    if (!t || distanciaDaSuperficie() < t.distance - 0.06) return null;
    return { uid: t.object.userData.cabo as string, distancia: t.distance };
  }

  /** O que está sob o ponteiro: terminal, depois a peça ou o cabo que estiver mais perto da câmera. */
  function alvoSob(): Alvo | null {
    const terminal = terminalSob(false);
    if (terminal) return terminal;
    const peca = raio.intersectObjects(c.dispositivos.caixasDeClique(), false)[0];
    const pecaAVista = peca && distanciaDaSuperficie() >= peca.distance - 0.02 ? peca : null;
    const cabo = caboSob();
    if (cabo && (!pecaAVista || cabo.distancia < pecaAVista.distance)) return { tipo: 'cabo', uid: cabo.uid };
    return pecaAVista ? { tipo: 'dispositivo', uid: pecaAVista.object.userData.dispositivo as string } : null;
  }

  // ---------------------------------------------------------------- Fantasma

  const matFantasma = new THREE.MeshLambertMaterial({ color: COR_VALIDO, emissive: COR_VALIDO, emissiveIntensity: 0.45, transparent: true, opacity: 0.62, depthWrite: false });
  const matMolduraDoFantasma = new THREE.MeshBasicMaterial({ color: COR_VALIDO, toneMapped: false });
  const matSelecao = new THREE.MeshBasicMaterial({ color: COR_SELECAO, toneMapped: false });
  const matHaloDoCabo = new THREE.MeshBasicMaterial({ color: COR_SELECAO, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const matCaboNoAlvo = new THREE.MeshBasicMaterial({ color: COR_VALIDO, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
  const geoBarra = new THREE.BoxGeometry(1, 1, 1);
  const semRaio = (): void => {};

  /** Contorno de uma caixa, com barras de espessura real (a linha de 1 px some de longe). */
  function criarMoldura(caixa: THREE.Box3, material: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const folga = 0.012;
    const min = caixa.min.clone().subScalar(folga);
    const max = caixa.max.clone().addScalar(folga);
    const t = max.clone().sub(min);
    const e = THREE.MathUtils.clamp(Math.max(t.x, t.y, t.z) * 0.012, 0.006, 0.016);
    const eixos = ['x', 'y', 'z'] as const;
    for (const a of eixos) {
      const [b, d] = eixos.filter((x) => x !== a) as ['x' | 'y' | 'z', 'x' | 'y' | 'z'];
      for (const vb of [min[b], max[b]]) {
        for (const vd of [min[d], max[d]]) {
          const barra = new THREE.Mesh(geoBarra, material);
          barra.raycast = semRaio;
          barra.scale[a] = t[a] + e;
          barra.scale[b] = e;
          barra.scale[d] = e;
          barra.position[a] = (min[a] + max[a]) / 2;
          barra.position[b] = vb;
          barra.position[d] = vd;
          g.add(barra);
        }
      }
    }
    return g;
  }

  let fantasma: { itemId: string; grupo: THREE.Group } | null = null;

  function esconderFantasma(): void {
    if (fantasma?.grupo.visible) {
      fantasma.grupo.visible = false;
      c.pedirQuadroLeve();
    }
  }

  function removerFantasma(): void {
    if (!fantasma) return;
    c.casa.remove(fantasma.grupo);
    fantasma = null;
    c.pedirQuadroLeve();
  }

  /** Mostra o fantasma do item no encaixe dado, verde ou vermelho. */
  function mostrarFantasma(item: Item, encaixe: Encaixe, valido: boolean): void {
    if (fantasma?.itemId !== item.id) {
      removerFantasma();
      const modelo = modeloDe(item);
      if (!modelo) return;
      const grupo = new THREE.Group();
      grupo.name = 'fantasma';
      const corpo = modelo.grupo.clone();
      corpo.traverse((o) => {
        o.raycast = semRaio;
        if (o instanceof THREE.Mesh) {
          o.material = matFantasma;
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      grupo.add(corpo, criarMoldura(modelo.volume, matMolduraDoFantasma));
      c.casa.add(grupo);
      fantasma = { itemId: item.id, grupo };
    }
    const cor = valido ? COR_VALIDO : COR_INVALIDO;
    matFantasma.color.set(cor);
    matFantasma.emissive.set(cor);
    matMolduraDoFantasma.color.set(cor);
    fantasma.grupo.visible = true;
    fantasma.grupo.position.set(encaixe.pos[0], encaixe.pos[1], encaixe.pos[2]);
    fantasma.grupo.quaternion.set(encaixe.quat[0], encaixe.quat[1], encaixe.quat[2], encaixe.quat[3]);
    c.pedirQuadroLeve();
  }

  // ---------------------------------------------------------------- Destaque da seleção e do cabo sob o ponteiro

  const realces = new THREE.Group();
  realces.name = 'realces';
  c.casa.add(realces);
  let molduraDaSelecao: THREE.Group | null = null;
  let caboNoAlvo: string | null = null;
  let realceSujo = false;

  function haloDoCabo(uid: string, material: THREE.Material): void {
    const grupo = c.cabos.grupoDe(uid);
    if (!grupo) return;
    for (const o of grupo.children) {
      if (o.name !== 'tubo-de-clique' || o.userData.escondido) continue;
      const halo = new THREE.Mesh((o as THREE.Mesh).geometry, material);
      halo.raycast = semRaio;
      halo.renderOrder = 3;
      realces.add(halo);
    }
  }

  function refazerRealce(): void {
    realceSujo = false;
    molduraDaSelecao?.parent?.remove(molduraDaSelecao);
    molduraDaSelecao = null;
    realces.clear();
    const s = estado.selecao;
    if (s?.tipo === 'dispositivo') {
      const grupo = c.dispositivos.grupoDe(s.uid);
      if (grupo && !c.dispositivos.escondida(s.uid)) {
        // Só a moldura: a peça selecionada continua opaca, com as cores dela.
        molduraDaSelecao = criarMoldura(grupo.userData.volume as THREE.Box3, matSelecao);
        molduraDaSelecao.name = 'realce';
        grupo.add(molduraDaSelecao);
      }
    } else if (s?.tipo === 'cabo' && s.uid !== caboNoAlvo) haloDoCabo(s.uid, matHaloDoCabo);
    // O cabo sob a proteção arrastada acende em verde.
    if (caboNoAlvo) haloDoCabo(caboNoAlvo, matCaboNoAlvo);
    c.pedirQuadroLeve();
  }

  /** O destaque usa a geometria dos cabos, que é refeita quando eles mudam: espera a cena terminar de se atualizar. */
  function pedirRealce(): void {
    if (realceSujo) return;
    realceSujo = true;
    queueMicrotask(() => {
      if (realceSujo) refazerRealce();
    });
  }

  // ---------------------------------------------------------------- Ponteiro parado sobre a cena (sem botão)

  let sobTerminal: { disp: string; terminal: string } | null = null;
  let sobPeca: string | null = null;

  function mostrarTerminal(alvo: { disp: string; terminal: string } | null): void {
    if (sobTerminal?.disp === alvo?.disp && sobTerminal?.terminal === alvo?.terminal) return;
    if (sobTerminal) c.dispositivos.mostrarRotulo(sobTerminal.disp, sobTerminal.terminal, false);
    sobTerminal = alvo;
    c.dispositivos.destacarTerminal(alvo);
    if (alvo) c.dispositivos.mostrarRotulo(alvo.disp, alvo.terminal, true);
    c.pedirQuadroLeve();
  }

  function mostrarNomeDaPeca(uid: string | null): void {
    if (sobPeca === uid) return;
    sobPeca = uid;
    c.dispositivos.mostrarNome(uid);
    c.pedirQuadroLeve();
  }

  function limparPairar(): void {
    mostrarTerminal(null);
    mostrarNomeDaPeca(null);
    c.canvas.style.cursor = '';
  }

  function pairar(x: number, y: number): void {
    // Em "Editar casa" quem cuida do ponteiro, do cursor e da dica é edicao.ts.
    if (estado.edicaoCasa.ativa) return;
    if (!sobreACena(x, y) || !mirar(x, y)) {
      limparPairar();
      mostrarDica(null);
      return;
    }
    const alvo = alvoSob();
    mostrarTerminal(alvo?.tipo === 'terminal' ? alvo : null);
    mostrarNomeDaPeca(alvo?.tipo === 'dispositivo' ? alvo.uid : null);
    c.canvas.style.cursor = alvo?.tipo === 'terminal' ? 'crosshair' : alvo?.tipo === 'dispositivo' ? 'grab' : alvo?.tipo === 'cabo' ? 'pointer' : '';
    if (alvo?.tipo === 'terminal') mostrarDica('Arraste até outro terminal para puxar um cabo. Ou clique aqui e depois no outro terminal: assim dá para mexer a câmera no caminho.', x, y);
    else if (alvo?.tipo === 'cabo') {
      const cabo = estado.projeto.cabos.find((k) => k.uid === alvo.uid);
      const tipo = cabo ? CATALOGO.get(cabo.caboId) : undefined;
      mostrarDica(cabo && tipo ? `${tipo.nome} · ${cabo.comprimento.toLocaleString('pt-BR')} m` : null, x, y);
    } else mostrarDica(null);
  }

  // ---------------------------------------------------------------- Arrastar do catálogo e mover

  function nomeCurto(item: Item): string {
    return item.nome;
  }

  /** Candidato do item sob o ponteiro, ou nulo quando o ponteiro não está sobre uma superfície à vista. */
  /** Giro, no quadro da casa, da placa que chega ao terreno sem direção escolhida: a face olha para o norte do mundo (no hemisfério norte, para o sul). */
  const giroPadraoNoChao = (): number => giroParaOAzimute(estado.projeto.casa.orientacaoGraus, azimutePadrao(estado.projeto));

  /** Superfície para a qual o ponteiro aponta durante um arraste de peça (pode não ser a do encaixe: a geladeira apontada para a parede vai para o piso). */
  let apontada: string | null = null;

  function candidatoSob(item: Item, giro: number, chao: NoChao, x: number, y: number, ignorar?: ReadonlySet<string>): Candidato | null {
    apontada = null;
    if (!sobreACena(x, y)) return null;
    mirar(x, y);
    let toque: Toque | null = c.lugares.toque(raio, c.superficies());
    apontada = toque?.marca.id ?? null;
    // Peça de piso apontada para uma parede: vale o piso ao pé dela, e a peça encosta na parede.
    if (toque?.marca.tipo === 'parede' && superficieAceita(item) === 'piso') toque = c.lugares.pisoAoPe(toque, c.superficies()) ?? toque;
    // Lâmpada ou chuveiro apontado para um piso de dentro: vale a parede mais próxima, na altura em que eles ficam.
    else if (toque?.marca.tipo === 'piso' && toque.marca.id !== ID_TERRENO && item.categoria === 'aparelho' && superficieAceita(item) === 'parede') {
      toque = c.lugares.paredeAoLado(toque, c.superficies(), raio.ray.direction) ?? toque;
    }
    if (!toque) return null;
    // Placa no terreno: fica sobre o suporte, com a direção e a inclinação dela.
    if (toque.marca.id === ID_TERRENO && item.categoria === 'placa') {
      return c.lugares.candidato(item, chao.giro ?? giroPadraoNoChao(), toque, { ...(ignorar ? { ignorar } : {}), ...(chao.inclinacao === null ? {} : { inclinacao: chao.inclinacao }) });
    }
    return c.lugares.candidato(item, giro, toque, ignorar ? { ignorar } : {});
  }

  /** O candidato é uma placa sobre suporte, no terreno. */
  const noChao = (item: Item, candidato: Candidato | null): boolean => item.categoria === 'placa' && candidato?.encaixe.superficie === ID_TERRENO;

  function ondeLevar(item: Item): string {
    if (item.categoria === 'placa') return `${nomeCurto(item)}: leve até um telhado ou até o terreno`;
    const tipo = superficieAceita(item);
    return tipo ? `${nomeCurto(item)}: leve até ${NOME_DA_SUPERFICIE[tipo]}` : nomeCurto(item);
  }

  function atualizarCatalogo(m: Modo & { tipo: 'catalogo' }, x: number, y: number): void {
    m.candidato = candidatoSob(m.item, m.giro, m.chao, x, y);
    if (!m.candidato) {
      esconderFantasma();
      mostrarDica(ondeLevar(m.item), x, y);
      return;
    }
    mostrarFantasma(m.item, m.candidato.encaixe, m.candidato.valido);
    if (m.candidato.valido) mostrarDica(noChao(m.item, m.candidato) ? 'Solte para pôr no chão, sobre suporte (R muda a direção)' : 'Solte para colocar (R gira)', x, y, 'bom');
    else mostrarDica(m.candidato.motivo, x, y, 'ruim');
  }

  /** "Cabo de + (placa) até PV+ (inversor)": diz em qual cabo a proteção vai cair, quando dois passam juntos. */
  function descricaoDoCabo(uid: string): string {
    const cabo = estado.projeto.cabos.find((k) => k.uid === uid);
    if (!cabo) return '';
    const ponta = (p: PontaCabo): string => `${c.dispositivos.terminal(p.disp, p.terminal)?.rotulo ?? p.terminal} (${nomeDaPeca(p.disp)})`;
    return `Cabo de ${ponta(cabo.de)} até ${ponta(cabo.para)}.`;
  }

  function atualizarProtecao(m: Modo & { tipo: 'protecao' }, x: number, y: number): void {
    const cabo = sobreACena(x, y) && mirar(x, y) ? (caboSob()?.uid ?? null) : null;
    if (cabo !== caboNoAlvo) {
      caboNoAlvo = cabo;
      refazerRealce();
    }
    m.cabo = cabo;
    if (cabo) mostrarDica(`Solte para instalar: ${m.item.nome}. ${descricaoDoCabo(cabo)}`, x, y, 'bom');
    else mostrarDica(`${m.item.nome}: leve até um cabo`, x, y);
  }

  function mesmoEncaixe(a: Encaixe, uid: string): boolean {
    const d = estado.projeto.dispositivos.find((k) => k.uid === uid);
    if (!d || d.superficie !== a.superficie || d.giro !== a.giro) return false;
    return a.pos.every((v, i) => Math.abs(v - d.pos[i]!) < 1e-6) && a.quat.every((v, i) => Math.abs(v - d.quat[i]!) < 1e-7);
  }

  function atualizarMover(m: Modo & { tipo: 'mover' }, x: number, y: number): void {
    m.candidato = candidatoSob(m.item, m.giro, m.chao, x - m.desvio[0], y - m.desvio[1], new Set([m.uid]));
    if (!m.candidato) {
      esconderFantasma();
      mostrarDica(ondeLevar(m.item), x, y);
      return;
    }
    if (!m.candidato.valido) {
      // A peça fica no último lugar válido; o fantasma vermelho mostra onde o ponteiro está pedindo.
      mostrarFantasma(m.item, m.candidato.encaixe, false);
      mostrarDica(m.candidato.motivo, x, y, 'ruim');
      return;
    }
    esconderFantasma();
    mostrarDica(null);
    if (mesmoEncaixe(m.candidato.encaixe, m.uid)) return;
    if (!m.marcado) {
      m.marcado = true;
      acoes.marcarHistorico();
      c.cabos.adiarComprimentos(true);
    }
    acoes.moverDispositivo(m.uid, m.candidato.encaixe, { historico: false });
  }

  function comecarAMover(uid: string, x: number, y: number): void {
    const d = estado.projeto.dispositivos.find((k) => k.uid === uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    const q = d ? c.lugares.quadroDaPeca(d) : null;
    if (!d || !item || !q) {
      modo = { tipo: 'alheio' };
      return;
    }
    // O ponto de contato da peça fica onde estava em relação ao ponteiro: a peça não pula ao ser agarrada.
    const centro = new THREE.Vector3(...d.pos);
    const contato = centro.clone().addScaledVector(q.n, q.w - centro.dot(q.n));
    const [sx, sy] = c.naTela(contato);
    // A placa que está no terreno leva a direção e a inclinação dela; se subir para um telhado, entra em pé.
    const doChao = placaNoChao(d, item);
    const chao: NoChao = doChao ? { giro: d.giro, inclinacao: d.inclinacaoGraus ?? null } : { giro: null, inclinacao: null };
    modo = { tipo: 'mover', uid, item, giro: doChao ? 0 : d.giro, chao, desvio: [x - sx, y - sy], marcado: false, candidato: null };
    if (estado.selecao?.tipo !== 'dispositivo' || estado.selecao.uid !== uid) acoes.selecionar({ tipo: 'dispositivo', uid });
    limparPairar();
    c.canvas.style.cursor = 'grabbing';
  }

  // ---------------------------------------------------------------- Cabos

  const elastico = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false }),
  );
  elastico.name = 'elastico';
  elastico.renderOrder = 6;
  elastico.visible = false;
  elastico.raycast = semRaio;
  c.casa.add(elastico);
  const EIXO_Y = new THREE.Vector3(0, 1, 0);

  function esticar(de: THREE.Vector3, ate: THREE.Vector3, cor: string): void {
    const d = ate.clone().sub(de);
    const comprimento = d.length();
    if (comprimento < 1e-4) {
      elastico.visible = false;
      return;
    }
    // Espessura constante na tela, perto de 3 px.
    const distancia = c.camera.position.distanceTo(paraOMundo(de.clone().add(ate).multiplyScalar(0.5)));
    const metrosPorPixel = (2 * distancia * Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2))) / Math.max(1, c.canvas.clientHeight);
    const r = THREE.MathUtils.clamp(1.6 * metrosPorPixel, 0.004, 0.08);
    elastico.position.copy(de).addScaledVector(d, 0.5);
    elastico.quaternion.setFromUnitVectors(EIXO_Y, d.normalize());
    elastico.scale.set(r, comprimento, r);
    (elastico.material as THREE.MeshBasicMaterial).color.set(cor);
    elastico.visible = true;
  }

  function nomeDaPeca(uid: string): string {
    const d = estado.projeto.dispositivos.find((k) => k.uid === uid);
    return (d && CATALOGO.get(d.itemId)?.nome) ?? uid;
  }

  function comecarCabo(alvo: Alvo & { tipo: 'terminal' }, x: number, y: number): void {
    const de = { disp: alvo.disp, terminal: alvo.terminal };
    modo = { tipo: 'cabo', de, tipoDoTerminal: alvo.tipoDoTerminal, x, y, moveu: false, fixo: false, para: null, motivo: null };
    mostrarNomeDaPeca(null);
    mostrarTerminal(de);
    c.dispositivos.realcarTerminais((disp, terminal) => {
      if (disp === de.disp && terminal === de.terminal) return 'normal';
      return motivoParaNaoLigar(de, { disp, terminal }) === null ? 'aceso' : 'apagado';
    });
    c.canvas.style.cursor = 'crosshair';
    c.pedirQuadroLeve();
  }

  function atualizarCabo(m: Modo & { tipo: 'cabo' }, x: number, y: number): void {
    const origem = c.dispositivos.terminal(m.de.disp, m.de.terminal);
    if (!origem) {
      // A peça de origem sumiu (desfazer, apagar): o cabo em andamento acaba.
      if (m.fixo) encerrar();
      return;
    }
    mirar(x, y);
    const alvo = sobreACena(x, y) ? terminalSob(true) : null;
    const outro = alvo && !(alvo.disp === m.de.disp && alvo.terminal === m.de.terminal) ? alvo : null;
    m.para = null;
    m.motivo = null;
    let ponta: THREE.Vector3 | null = null;
    let cor = corDoCabo(m.tipoDoTerminal, m.tipoDoTerminal);
    if (outro) {
      const destino = { disp: outro.disp, terminal: outro.terminal };
      const info = c.dispositivos.terminal(outro.disp, outro.terminal);
      m.motivo = motivoParaNaoLigar(m.de, destino);
      if (m.motivo === null) {
        m.para = destino;
        cor = corDoCabo(m.tipoDoTerminal, outro.tipoDoTerminal);
        ponta = info?.pos ?? null;
        mostrarDica(`${m.fixo ? 'Clique' : 'Solte'} para ligar em ${info?.rotulo ?? outro.terminal} (${nomeDaPeca(outro.disp)})`, x, y, 'bom');
      } else mostrarDica(m.motivo, x, y, 'ruim');
      // O rótulo do terminal de destino aparece no lugar do de origem.
      if (sobTerminal && !(sobTerminal.disp === destino.disp && sobTerminal.terminal === destino.terminal)) c.dispositivos.mostrarRotulo(sobTerminal.disp, sobTerminal.terminal, false);
      sobTerminal = destino;
      c.dispositivos.destacarTerminal(destino);
      c.dispositivos.mostrarRotulo(destino.disp, destino.terminal, true);
    } else {
      if (sobTerminal && !(sobTerminal.disp === m.de.disp && sobTerminal.terminal === m.de.terminal)) {
        c.dispositivos.mostrarRotulo(sobTerminal.disp, sobTerminal.terminal, false);
        sobTerminal = m.de;
        c.dispositivos.destacarTerminal(m.de);
        c.dispositivos.mostrarRotulo(m.de.disp, m.de.terminal, true);
      }
      // Com o cabo preso ao ponteiro, a dica não acompanha o ponteiro por cima dos painéis.
      if (m.fixo && !sobreACena(x, y)) mostrarDica(null);
      else mostrarDica(m.fixo ? 'Clique em um terminal aceso para ligar. Dá para girar e aproximar a câmera. Esc cancela.' : 'Leve até um terminal aceso', x, y);
    }
    if (!ponta) {
      // Ponta solta: no plano que passa pelo terminal de origem e fica de frente para a câmera.
      const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(c.camera.getWorldDirection(new THREE.Vector3()), paraOMundo(origem.pos));
      const p = raio.ray.intersectPlane(plano, new THREE.Vector3());
      ponta = p ? paraACasa(p) : null;
    }
    if (ponta) esticar(origem.pos, ponta, m.motivo ? COR_INVALIDO : cor);
    else elastico.visible = false;
    c.pedirQuadroLeve();
  }

  // ---------------------------------------------------------------- Fim de um arraste

  function encerrar(): void {
    modo = { tipo: 'ocioso' };
    c.controles.enabled = true;
    removerFantasma();
    elastico.visible = false;
    c.dispositivos.realcarTerminais(null);
    if (caboNoAlvo) {
      caboNoAlvo = null;
      refazerRealce();
    }
    limparPairar();
    mostrarDica(null);
    c.pedirQuadroLeve();
  }

  /** Desiste do arraste em andamento. Verdadeiro se havia um. */
  function cancelar(): boolean {
    const m = modo;
    if (m.tipo === 'ocioso' || m.tipo === 'alheio' || m.tipo === 'apertado') return false;
    if (m.tipo === 'mover' && m.marcado) {
      // Volta ao ponto marcado no começo do arraste, sem deixar nada para refazer.
      acoes.cancelarArraste();
      c.cabos.adiarComprimentos(false);
    }
    encerrar();
    return true;
  }

  function soltar(x: number, y: number): void {
    const m = modo;
    if (m.tipo === 'apertado') {
      if (m.alvo?.tipo === 'dispositivo') acoes.selecionar({ tipo: 'dispositivo', uid: m.alvo.uid });
      else if (m.alvo?.tipo === 'cabo') acoes.selecionar({ tipo: 'cabo', uid: m.alvo.uid });
      else if (estado.selecao && !estado.edicaoCasa.ativa) acoes.selecionar(null);
    } else if (m.tipo === 'catalogo') {
      atualizarCatalogo(m, x, y);
      if (m.candidato?.valido) {
        const uid = acoes.adicionarDispositivo(m.item.id, m.candidato.encaixe);
        acoes.selecionar({ tipo: 'dispositivo', uid });
      }
    } else if (m.tipo === 'protecao') {
      atualizarProtecao(m, x, y);
      if (m.cabo) {
        acoes.instalarProtecao(m.cabo, m.item.id);
        acoes.selecionar({ tipo: 'cabo', uid: m.cabo });
      }
    } else if (m.tipo === 'mover') {
      atualizarMover(m, x, y);
      // Os comprimentos dos cabos da peça saem agora, de uma vez.
      c.cabos.adiarComprimentos(false);
    } else if (m.tipo === 'cabo') {
      if (m.fixo) {
        // Cabo começado com clique: soltar o botão depois de girar a câmera não acaba com ele; um clique no vazio, sim.
        if (cliqueNoVazio && Math.hypot(x - cliqueNoVazio[0], y - cliqueNoVazio[1]) <= LIMIAR_DE_ARRASTE) {
          cliqueNoVazio = null;
          encerrar();
          if (sobreACena(x, y)) pairar(x, y);
        }
        cliqueNoVazio = null;
        return;
      }
      if (!m.moveu) {
        // Clique no terminal, sem arrastar: a peça fica selecionada (é assim que se seleciona uma tomada, que é quase só terminal)
        // e o cabo fica preso ao ponteiro até o clique no destino.
        acoes.selecionar({ tipo: 'dispositivo', uid: m.de.disp });
        m.fixo = true;
        m.moveu = true;
        c.controles.enabled = true;
        atualizarCabo(m, x, y);
        return;
      } else {
        atualizarCabo(m, x, y);
        if (m.para) {
          const uid = acoes.adicionarCabo(m.de, m.para, c.cabos.comprimentoEntre(m.de, m.para) ?? 0.3);
          if (uid) acoes.selecionar({ tipo: 'cabo', uid });
        }
      }
    }
    encerrar();
    if (sobreACena(x, y)) pairar(x, y);
  }

  // ---------------------------------------------------------------- Eventos do ponteiro

  /** Último movimento ainda não tratado: no máximo um por quadro. */
  let pendente: [number, number] | null = null;
  let quadroPendente = 0;

  function tratarMovimento(x: number, y: number): void {
    const m = modo;
    if (m.tipo === 'ocioso') pairar(x, y);
    else if (m.tipo === 'catalogo') atualizarCatalogo(m, x, y);
    else if (m.tipo === 'protecao') atualizarProtecao(m, x, y);
    else if (m.tipo === 'mover') atualizarMover(m, x, y);
    else if (m.tipo === 'cabo') atualizarCabo(m, x, y);
  }

  function despachar(): void {
    cancelAnimationFrame(quadroPendente);
    quadroPendente = 0;
    const p = pendente;
    pendente = null;
    if (p) tratarMovimento(p[0], p[1]);
  }

  /** Com um cabo preso ao ponteiro, onde o botão foi apertado fora de um terminal: se soltar no mesmo lugar, o cabo é cancelado. */
  let cliqueNoVazio: [number, number] | null = null;

  /** Clique com um cabo preso ao ponteiro: liga no terminal sob o ponteiro, ou deixa a câmera girar. */
  function apertarComCaboFixo(m: Modo & { tipo: 'cabo' }, e: PointerEvent): void {
    cliqueNoVazio = null;
    if (e.button !== 0 || e.target !== c.canvas) return;
    atualizarCabo(m, e.clientX, e.clientY);
    if (modo !== m) return;
    if (m.para) {
      // O controle da câmera não vê este clique.
      e.stopPropagation();
      const uid = acoes.adicionarCabo(m.de, m.para, c.cabos.comprimentoEntre(m.de, m.para) ?? 0.3);
      if (uid) acoes.selecionar({ tipo: 'cabo', uid });
      encerrar();
      pairar(e.clientX, e.clientY);
    } else if (m.motivo) {
      e.stopPropagation();
    } else cliqueNoVazio = [e.clientX, e.clientY];
  }

  function aoApertar(e: PointerEvent): void {
    if (modo.tipo === 'cabo' && modo.fixo) {
      if (!estado.edicaoCasa.ativa) apertarComCaboFixo(modo, e);
      return;
    }
    if (e.button !== 0 || modo.tipo !== 'ocioso' || e.target !== c.canvas) return;
    if (estado.edicaoCasa.ativa) return; // a edição da casa trata o ponteiro
    mirar(e.clientX, e.clientY);
    const alvo = alvoSob();
    mostrarDica(null);
    if (alvo?.tipo === 'terminal') {
      // A órbita é desligada antes de o controle da câmera ver o evento (este ouvinte roda na captura).
      c.controles.enabled = false;
      comecarCabo(alvo, e.clientX, e.clientY);
    } else {
      if (alvo) c.controles.enabled = false;
      modo = { tipo: 'apertado', x: e.clientX, y: e.clientY, alvo };
    }
  }

  function aoMover(e: PointerEvent): void {
    const m = modo;
    if (m.tipo === 'alheio') return;
    if (m.tipo === 'apertado') {
      if (Math.hypot(e.clientX - m.x, e.clientY - m.y) <= LIMIAR_DE_ARRASTE) return;
      if (m.alvo?.tipo === 'dispositivo') comecarAMover(m.alvo.uid, m.x, m.y);
      else {
        modo = { tipo: 'alheio' };
        limparPairar();
        return;
      }
    } else if (m.tipo === 'cabo' && !m.moveu) {
      if (Math.hypot(e.clientX - m.x, e.clientY - m.y) <= LIMIAR_DE_ARRASTE) return;
      m.moveu = true;
    }
    pendente = [e.clientX, e.clientY];
    if (!quadroPendente) quadroPendente = requestAnimationFrame(despachar);
  }

  function aoSoltar(e: PointerEvent): void {
    if (modo.tipo === 'ocioso') return;
    if (e.type === 'pointerup' && e.button !== 0) return;
    pendente = null;
    if (e.type === 'pointercancel') {
      if (!cancelar()) encerrar();
      return;
    }
    if (modo.tipo === 'alheio') {
      encerrar();
      return;
    }
    if (modo.tipo === 'cabo' && modo.fixo && e.target !== c.canvas && !cliqueNoVazio) return; // clique em um painel, com o cabo preso ao ponteiro
    soltar(e.clientX, e.clientY);
  }

  function aoArrastarItem(e: Event): void {
    const detalhe = (e as CustomEvent<{ itemId: string; clientX: number; clientY: number }>).detail;
    const item = detalhe ? CATALOGO.get(detalhe.itemId) : undefined;
    // Pegar uma peça do catálogo larga o cabo que estava preso ao ponteiro.
    if (modo.tipo === 'cabo' && modo.fixo) encerrar();
    if (!item || modo.tipo !== 'ocioso') return;
    if (estado.edicaoCasa.ativa) {
      avisar('Saia de "Editar casa" para pôr equipamentos', detalhe.clientX, detalhe.clientY);
      return;
    }
    if (item.categoria === 'protecao') modo = { tipo: 'protecao', item, cabo: null };
    else if (superficieAceita(item) && modeloDe(item)) modo = { tipo: 'catalogo', item, giro: 0, chao: { giro: null, inclinacao: null }, candidato: null };
    else return;
    limparPairar();
    c.controles.enabled = false;
    tratarMovimento(detalhe.clientX, detalhe.clientY);
  }

  // ---------------------------------------------------------------- Teclas e botões dos painéis

  /** Onde mostrar um aviso sobre a peça: a posição dela na janela. */
  function telaDaPeca(uid: string): [number, number] {
    const d = estado.projeto.dispositivos.find((k) => k.uid === uid);
    return d ? c.naTela(new THREE.Vector3(...d.pos)) : [window.innerWidth / 2, window.innerHeight / 2];
  }

  function girarSelecionado(): void {
    const s = estado.selecao;
    if (s?.tipo !== 'dispositivo' || estado.edicaoCasa.ativa) return;
    const d = estado.projeto.dispositivos.find((k) => k.uid === s.uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    const q = d ? c.lugares.quadroDaPeca(d) : null;
    if (!d || !item || !q) return;
    const centro = new THREE.Vector3(...d.pos);
    // Placa no terreno: a face anda 15° no sentido dos ponteiros do relógio, com a mesma inclinação.
    const girado = placaNoChao(d, item)
      ? c.lugares.assentar(item, d.giro - 15, q, centro.dot(q.u), centro.dot(q.v), { ignorar: new Set([d.uid]), ...(d.inclinacaoGraus === undefined ? {} : { inclinacao: d.inclinacaoGraus }) })
      : c.lugares.assentar(item, d.giro + 90, q, centro.dot(q.u), centro.dot(q.v), { ignorar: new Set([d.uid]) });
    if (girado.valido) acoes.moverDispositivo(d.uid, girado.encaixe);
    else avisar(`Girada, a peça não cabe aqui. ${girado.motivo ?? ''}`.trim(), ...telaDaPeca(d.uid));
  }

  /** Campos "Inclinação" e "Direção" do painel da placa selecionada no terreno. */
  function ajustarPlacaNoChao(e: Event): void {
    const pedido = (e as CustomEvent<{ inclinacao?: number; azimute?: number }>).detail ?? {};
    const s = estado.selecao;
    if (s?.tipo !== 'dispositivo' || estado.edicaoCasa.ativa) return;
    const d = estado.projeto.dispositivos.find((k) => k.uid === s.uid);
    const item = d ? CATALOGO.get(d.itemId) : undefined;
    const q = d ? c.lugares.quadroDaPeca(d) : null;
    if (!d || !item || !q || !placaNoChao(d, item)) return;
    const giro = pedido.azimute === undefined ? d.giro : giroParaOAzimute(estado.projeto.casa.orientacaoGraus, pedido.azimute);
    const inclinacao = limitarInclinacao(pedido.inclinacao ?? d.inclinacaoGraus ?? 0);
    const centro = new THREE.Vector3(...d.pos);
    const novo = c.lugares.assentar(item, giro, q, centro.dot(q.u), centro.dot(q.v), { ignorar: new Set([d.uid]), inclinacao });
    if (!novo.valido) avisar(`Assim a placa não cabe aqui. ${novo.motivo ?? ''}`.trim(), ...telaDaPeca(d.uid));
    else if (!mesmoEncaixe(novo.encaixe, d.uid)) acoes.moverDispositivo(d.uid, novo.encaixe);
  }

  function apagarSelecionado(): void {
    const s = estado.selecao;
    if (estado.edicaoCasa.ativa) return;
    if (s?.tipo === 'dispositivo') {
      // Os cabos da peça vão junto: o aviso diz quantos foram e como voltar atrás.
      const cabos = estado.projeto.cabos.filter((k) => k.de.disp === s.uid || k.para.disp === s.uid).length;
      const nome = nomeDaPeca(s.uid);
      const [x, y] = telaDaPeca(s.uid);
      acoes.removerDispositivo(s.uid);
      if (cabos > 0) avisar(`${nome}: apagou a peça e ${cabos === 1 ? 'o cabo ligado' : `os ${cabos} cabos ligados`} a ela. Ctrl+Z desfaz.`, x, y, 'neutro');
    } else if (s?.tipo === 'cabo') acoes.removerCabo(s.uid);
  }

  function aoTeclar(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || emCampoDeTexto(e.target)) return;
    if (e.key === 'Escape') {
      if (!cancelar() && modo.tipo === 'ocioso' && estado.selecao && !estado.edicaoCasa.ativa) acoes.selecionar(null);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      const m = modo;
      if (m.tipo === 'catalogo' || m.tipo === 'mover') {
        // No terreno, R vira a face da placa 15° no sentido dos ponteiros do relógio; nas outras superfícies, gira 90°.
        if (noChao(m.item, m.candidato)) m.chao.giro = (m.chao.giro ?? m.candidato!.encaixe.giro) - 15;
        else m.giro = (m.giro + 90) % 360;
        if (ultimo) tratarMovimento(ultimo[0], ultimo[1]);
      } else if (m.tipo === 'ocioso') girarSelecionado();
      else if (m.tipo === 'cabo' && m.fixo) {
        // Com o cabo preso ao ponteiro a peça clicada está selecionada: R larga o cabo e gira a peça.
        encerrar();
        girarSelecionado();
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && estado.selecao && (modo.tipo === 'ocioso' || (modo.tipo === 'cabo' && modo.fixo))) {
      e.preventDefault();
      if (modo.tipo !== 'ocioso') encerrar();
      apagarSelecionado();
    }
  }

  function aoAgir(e: Event): void {
    const acao = (e as CustomEvent<Acao>).detail;
    if (!acao) return;
    const r = acao.tipo === 'mais-placa' ? acrescentarPlaca(c.lugares, c.cabos) : acao.tipo === 'mais-bateria' ? acrescentarBateria(c.lugares, c.cabos) : null;
    if (r && r.uid === null && r.motivo) avisar(r.motivo, window.innerWidth / 2 - 120, 90);
  }

  /** Posição mais recente do ponteiro, para a tecla R redesenhar o fantasma sem esperar o próximo movimento. */
  let ultimo: [number, number] | null = null;
  const guardarUltimo = (e: PointerEvent): void => {
    ultimo = [e.clientX, e.clientY];
  };
  const aoSair = (): void => {
    if (modo.tipo === 'ocioso') {
      pendente = null;
      limparPairar();
      mostrarDica(null);
    }
  };
  const aoPerderAJanela = (): void => {
    if (!cancelar() && modo.tipo !== 'ocioso') encerrar();
  };

  c.container.addEventListener('pointerdown', aoApertar, true);
  c.canvas.addEventListener('pointerleave', aoSair);
  window.addEventListener('pointermove', guardarUltimo, true);
  window.addEventListener('pointermove', aoMover);
  window.addEventListener('pointerup', aoSoltar);
  window.addEventListener('pointercancel', aoSoltar);
  window.addEventListener('blur', aoPerderAJanela);
  window.addEventListener('keydown', aoTeclar);
  window.addEventListener('offgrid:arrastar-item', aoArrastarItem);
  window.addEventListener('offgrid:girar-selecionado', girarSelecionado);
  window.addEventListener('offgrid:acao', aoAgir);
  window.addEventListener('offgrid:placa-no-chao', ajustarPlacaNoChao);

  const cancelarAssinaturas = [
    assinar('selecao', pedirRealce),
    assinar('dispositivos', pedirRealce),
    assinar('cabos', pedirRealce),
    assinar('visao', pedirRealce),
    assinar('casa', pedirRealce),
    // Entrar em "Editar casa" larga o que o ponteiro estava fazendo com os equipamentos.
    assinar('edicao', () => {
      if (!cancelar() && modo.tipo !== 'ocioso') encerrar();
      limparPairar();
    }),
  ];
  refazerRealce();

  return {
    situacao() {
      const m = modo;
      if (m.tipo === 'catalogo' || m.tipo === 'mover') return { modo: m.tipo, valido: m.candidato ? m.candidato.valido : null, motivo: m.candidato?.motivo ?? null };
      if (m.tipo === 'protecao') return { modo: m.tipo, valido: m.cabo !== null, motivo: null };
      if (m.tipo === 'cabo') return { modo: m.tipo, valido: m.para !== null, motivo: m.motivo };
      return { modo: m.tipo, valido: null, motivo: null };
    },
    superficiesDoArraste() {
      const m = modo;
      if (m.tipo !== 'catalogo' && m.tipo !== 'mover') return [];
      return [apontada, m.candidato?.encaixe.superficie ?? null].filter((id): id is string => id !== null);
    },
    destruir() {
      cancelarAssinaturas.forEach((f) => f());
      cancelAnimationFrame(quadroPendente);
      if (esperaDaDica) clearTimeout(esperaDaDica);
      c.container.removeEventListener('pointerdown', aoApertar, true);
      c.canvas.removeEventListener('pointerleave', aoSair);
      window.removeEventListener('pointermove', guardarUltimo, true);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      window.removeEventListener('blur', aoPerderAJanela);
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('offgrid:arrastar-item', aoArrastarItem);
      window.removeEventListener('offgrid:girar-selecionado', girarSelecionado);
      window.removeEventListener('offgrid:acao', aoAgir);
      window.removeEventListener('offgrid:placa-no-chao', ajustarPlacaNoChao);
      removerFantasma();
      molduraDaSelecao?.parent?.remove(molduraDaSelecao);
      c.casa.remove(realces, elastico);
      dica.remove();
      elastico.geometry.dispose();
      (elastico.material as THREE.Material).dispose();
      geoBarra.dispose();
      for (const m of [matFantasma, matMolduraDoFantasma, matSelecao, matHaloDoCabo, matCaboNoAlvo]) m.dispose();
    },
  };
}
