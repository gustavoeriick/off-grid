// Cena 3D. Tarefas 1.10 a 1.12, 1.15 e 2.1 a 2.4. Especificação: docs/especificacao/cena-e-interface.md, seções 2 a 8, 13 e 14,
// e docs/especificacao/fase-2.md, seções 2 e 3. Modo tutorial (tarefa 7.3): docs/especificacao/tutorial.md, seção 3.
// Operar o sistema (tarefa 8.3): docs/especificacao/operar.md, seções 2, 7 e 8 (chaves, visores, peça queimada).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOGO } from '../catalogo';
import { criarArrumador, type ResultadoDeArrumar } from './arrumar';
import { acoes, assinar, type Encaixe, estado, recalcularAgora, registrarAmbiente } from '../estado';
import { localDoProjeto } from '../nucleo/irradiancia';
import { type CamadaDeCabos, criarCamadaDeCabos } from './cabos';
import { criarCasa } from './casa';
import { colocarIniciais } from './colocacao';
import { criarCamadaDeDestaques, type DestaqueNaCena } from './destaques';
import { type CamadaDeDispositivos, criarCamadaDeDispositivos, type VidaDoAparelho } from './dispositivos';
import { criarEdicao } from './edicao';
import { encaixar, encaixarNoToque } from './encaixe';
import { liberarEstampas } from './estampas';
import { criarInteracao } from './interacao';
import { criarLugares } from './lugares';
import { liberar, type TipoSuperficie } from './malha';
import { liberarMateriais } from './materiais';
import { liberarModelos } from './modelos';
import { criarCamadaDeObstaculos } from './obstaculos';
import { type CamadaDeOperacao, criarCamadaDeOperacao } from './operar';
import { liberarTintas } from './molde';
import { criarChao, criarRosaDosVentos } from './mundo';
import { liberarProtecoes } from './protecoes';
import { lembrar, reassentar } from './reassentar';
import { criarSol } from './sol';
import { criarSombra } from './sombra';
import { ID_TERRENO } from './terreno';

export { comprimentoDoTrecho, corDoCabo } from './cabos';
export type { CamadaDeCabos } from './cabos';
export type { CamadaDeDispositivos, PassagemPeloQuadro, TerminalNaCasa, VidaDoAparelho } from './dispositivos';
export { alturaDeApoio, dimensoesDe, encaixar, encaixarNoToque, normalizarGiro, superficieAceita } from './encaixe';
export { CAMADA_SO_SOMBRA } from './malha';
export type { DestaqueNaCena } from './destaques';
export type { ResultadoDeArrumar } from './arrumar';

export interface OffgridGlobal {
  pronto: boolean;
  estado: () => typeof estado;
  acoes: typeof acoes;
  /** Auxiliar para o roteiro de verificação: posiciona a câmera. */
  posicionarCamera?: (pos: [number, number, number], alvo: [number, number, number]) => void;
  /** Auxiliar de verificação: `id` das superfícies de encaixe que o modo de visão atual deixa à vista. */
  superficies?: () => string[];
  /**
   * Auxiliar de verificação: desenha `n` quadros seguidos e devolve o tempo médio de cada um, em ms, e o que foi desenhado.
   * Com `comSombra` (o padrão) o mapa de sombra é refeito em todo quadro, como quando o tempo corre;
   * sem ele, mede o quadro de quando só a câmera se move.
   */
  medirQuadros?: (n: number, comSombra?: boolean) => { ms: number; chamadas: number; triangulos: number; geometrias: number; texturas: number };
  /** Posição na janela, em pixels (`[x, y]`), do centro de um dispositivo. Nulo se ele não está na cena. */
  telaDe?: (uid: string) => [x: number, y: number] | null;
  /** Posição na janela, em pixels, de um terminal de um dispositivo. */
  telaDoTerminal?: (uid: string, terminal: string) => [x: number, y: number] | null;
  /** Posição na janela do cartão de um item do catálogo. Quem preenche é a interface (`src/ui/catalogo.ts`). */
  telaDoCartao?: (itemId: string) => [x: number, y: number] | null;
  /**
   * Auxiliar de verificação: encaixe de um item em uma superfície, com o ponto e a normal em coordenadas da casa,
   * para o roteiro montar projetos de teste. É a função `encaixar` da cena.
   */
  encaixar?: (itemId: string, superficie: { id: string; tipo: TipoSuperficie }, ponto: [number, number, number], normal: [number, number, number], giro?: number) => Encaixe;
  /** Auxiliar de verificação: triângulos do modelo de cada item à mostra. */
  triangulosDosModelos?: () => Record<string, number>;
  /** Auxiliar de verificação: as camadas de dispositivos e de cabos da cena (rótulos, terminais, grupos). */
  camadas?: { dispositivos: CamadaDeDispositivos; cabos: CamadaDeCabos };
  /** Pede um quadro novo, depois de mexer nas camadas pelo roteiro. */
  pedirQuadro?: () => void;
  /** Posição na janela de um ponto dado em coordenadas da casa. */
  telaDoPonto?: (pontoNaCasa: [number, number, number]) => [x: number, y: number];
  /** Posição na janela de um ponto de um cabo, a uma fração do comprimento (0,5 é o meio). Nulo se o cabo não está desenhado. */
  telaDoCabo?: (uid: string, fracao?: number) => [x: number, y: number] | null;
  /** O que o ponteiro está fazendo (`ocioso`, `catalogo`, `mover`, `cabo`, `protecao`) e se soltar agora daria certo. */
  interacao?: () => { modo: string; valido: boolean | null; motivo: string | null };
  /** Recalcula análise, sugestões e orçamento na hora, sem esperar os 150 ms. */
  recalcular?: () => void;
  /** Auxiliar de verificação: o cálculo de sombra das placas que a cena entrega ao núcleo (`cena/sombra.ts`). */
  ambiente?: () => import('../nucleo/tipos').AmbientePlacas;
  /** Auxiliar de verificação: quantas malhas e triângulos tapam o sol no cálculo (casa e obstáculos). */
  resumoDaSombra?: () => { malhas: number; triangulos: number };
  /** O que o ponteiro está fazendo em "Editar casa" (`ocioso`, `quartinho`, `profundidade`, `ponta-varanda`, `desenhar`, `mover-parede`, `esticar`). */
  edicao?: () => { modo: string; valido: boolean | null; motivo: string | null };
  /** Posição na janela de uma alça de "Editar casa": `nova-{lado}`, `borda-{lado}`, `ponta-{lado}-a`, `ponta-{lado}-b`, `parede-de`, `parede-para`. */
  telaDaAlca?: (id: string) => [x: number, y: number] | null;
  /** Posição e alvo da câmera, no mundo. */
  camera?: () => { pos: [number, number, number]; alvo: [number, number, number] };
  /**
   * O que o passo a passo está realçando de fato na cena (`estado.destaques` menos o que não existe ou está escondido):
   * `{ tipo: 'superficie', id }`, `{ tipo: 'terminal', id: '{disp}:{terminal}', disp, terminal }` ou `{ tipo: 'cabo', id: uid, uid }`.
   */
  destaquesNaCena?: () => DestaqueNaCena[];
  /**
   * "Arrumar os cabos": põe os grampos sozinho, com cada cabo rente às superfícies (cena-e-interface.md, seção 8).
   * Um passo só de desfazer. Devolve quantos cabos foram arrumados e os que ficaram sem caminho pelas superfícies.
   */
  arrumarCabos?: () => ResultadoDeArrumar;
  /** "Soltar os cabos": tira os grampos de todos os cabos, em um passo só de desfazer. Devolve quantos cabos foram soltos. */
  soltarCabos?: () => number;
  /** Auxiliar de verificação: as medidas da cena (faces, caixas das peças, telhados) que a conta do trajeto dos cabos recebe. */
  mundoDosCabos?: () => import('./trajeto').Mundo;
  /**
   * Posição na janela, em pixels, da proteção de índice dado de um cabo (no cabo ou no trilho de um quadro): um clique
   * ali abre ou fecha a chave dela. Nulo se a proteção não está desenhada ou está escondida pelo modo de visão.
   */
  telaDaProtecao?: (caboUid: string, indice: number) => [x: number, y: number] | null;
  /** Posição na janela do botão de ligar de um inversor ou de um aparelho. Nulo se a peça não tem botão (as demais, e a queimada). */
  telaDoBotao?: (uid: string) => [x: number, y: number] | null;
  /**
   * Texto que o visor de um controlador, de um inversor ou de uma bateria mostra agora: as linhas separadas por " | ".
   * Vazio com o visor apagado; nulo se a peça não tem visor.
   */
  textoDoVisor?: (uid: string) => string | null;
  /** Auxiliar de verificação: selos de queimado na cena (`uid` da peça ou do cabo, ou `{cabo}:{indice}` da proteção), partículas de efeito vivas e visores ampliados à mostra. */
  operacaoNaCena?: () => { selos: string[]; particulas: number; visoresFlutuando: string[] };
  /**
   * Auxiliar de verificação: se o aparelho recebe energia agora (ligado, no horário de uso e atendido pelo sistema ou
   * pela tomada da rede), se o que acende nele está aceso e se a hélice gira. Nulo se a peça não é um aparelho na cena.
   */
  vidaDoAparelho?: (uid: string) => VidaDoAparelho | null;
}

declare global {
  interface Window {
    __offgrid?: OffgridGlobal;
  }
}

/** O que a cena entrega a quem monta a interação (fase 2). */
export interface Cena {
  cena: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controles: OrbitControls;
  renderizador: THREE.WebGLRenderer;
  /** Grupo que gira com a orientação. Equipamentos e cabos são filhos diretos dele, em coordenadas da casa. */
  casa: THREE.Group;
  /**
   * Pede um quadro novo, com o mapa de sombra refeito. A cena só redesenha quando algo muda:
   * quem mexe em equipamentos ou cabos chama esta função.
   */
  pedirQuadro(): void;
  /** Pede um quadro novo sem refazer o mapa de sombra: para o que não projeta sombra (fantasma, destaque, rótulo). */
  pedirQuadroLeve(): void;
  /** Malhas de encaixe (`userData.superficie`) que o modo de visão atual deixa à vista. */
  superficies(): THREE.Mesh[];
  /** Peças do projeto na cena: grupos, terminais, caixas de clique, rótulos. */
  dispositivos: CamadaDeDispositivos;
  /** Cabos do projeto na cena. */
  cabos: CamadaDeCabos;
  /** Encaixe de um item em uma superfície, em coordenadas da casa (função pura), e a versão que parte do toque de um raio. */
  encaixar: typeof encaixar;
  encaixarNoToque: typeof encaixarNoToque;
  /** Posição na janela, em pixels (`[x, y]`), de um ponto dado em coordenadas da casa. */
  naTela(pontoNaCasa: THREE.Vector3): [x: number, y: number];
  destruir(): void;
}

/** Acima deste intervalo entre quadros seguidos (menos de 25 por segundo), a cena entra no modo econômico. */
const QUADRO_LENTO_MS = 40;
/** Um único intervalo acima deste já basta para entrar no modo econômico. */
const QUADRO_MUITO_LENTO_MS = 120;
/** Com intervalos abaixo deste no modo econômico, o próximo movimento volta a tentar a nitidez inteira. */
const QUADRO_FOLGADO_MS = 20;
/** Fração da nitidez usada no modo econômico. */
const NITIDEZ_ECONOMICA = 0.5;
/** No modo econômico, intervalo mínimo entre duas renovações do mapa de sombra. */
const SOMBRA_ECONOMICA_MS = 200;
/** Em aparelho lento, intervalo mínimo entre dois quadros desenhados só para o realce do passo a passo pulsar. */
const PULSO_ECONOMICO_MS = 150;
/** Vista de abertura do tutorial: ângulo para o lado da frente do quartinho, altura do olhar e folga em volta dele. */
const VISTA_DO_QUARTINHO = { ladoGraus: 28, alturaGraus: 24, folga: 1.1 } as const;

export function criarCena(container: HTMLElement): Cena {
  const renderizador = new THREE.WebGLRenderer({ antialias: true });
  const nitidezCheia = Math.min(window.devicePixelRatio || 1, 2);
  renderizador.setPixelRatio(nitidezCheia);
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = THREE.PCFShadowMap;
  // O mapa de sombra só é refeito quando algo além da câmera muda (ver `pedirQuadro`).
  renderizador.shadowMap.autoUpdate = false;
  // Curva que não mexe nos tons médios e só comprime os claros: a parede branca ao sol não estoura
  // e a parede em sombra continua com o tom que a luz de hemisfério lhe dá.
  renderizador.toneMapping = THREE.NeutralToneMapping;
  renderizador.toneMappingExposure = 1;
  renderizador.domElement.style.display = 'block';
  container.appendChild(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  // Com a orientação inicial (frente para o norte), esta é a vista da frente.
  camera.position.set(-14, 11, -16);

  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.target.set(0, 2.5, 0);
  // A especificação da fase 1 pedia 4 m; para reconhecer um borne ou um disjuntor é preciso chegar mais perto.
  controles.minDistance = 0.8;
  controles.maxDistance = 60;
  controles.maxPolarAngle = Math.PI / 2 - 0.02;
  // A roda aproxima do ponto sob o ponteiro, e não do meio da casa: é assim que se chega ao quartinho ou a um borne.
  controles.zoomToCursor = true;
  controles.update();

  const chao = criarChao();
  cena.add(chao);
  cena.add(criarRosaDosVentos());
  const casa = criarCasa();
  cena.add(casa.grupo);
  const sol = criarSol(cena);

  let sujo = true;
  let sombraSuja = true;
  /** Algo mudou na cena (casa, sol, equipamentos): redesenha e refaz o mapa de sombra. */
  const pedirQuadro = (): void => {
    sujo = true;
    sombraSuja = true;
  };

  const pedirQuadroLeve = (): void => {
    sujo = true;
  };

  // Só a câmera mexeu: a sombra continua a mesma, e girar a vista fica mais leve.
  controles.addEventListener('change', () => {
    if (controles.target.y < 0) controles.target.y = 0;
    if (camera.position.y < 0.2) camera.position.y = 0.2;
    sujo = true;
  });

  const redimensionar = (): void => {
    const l = Math.max(1, container.clientWidth);
    const a = Math.max(1, container.clientHeight);
    renderizador.setSize(l, a);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
    pedirQuadro();
  };
  const observador = new ResizeObserver(redimensionar);
  observador.observe(container);
  redimensionar();

  const obstaculos = criarCamadaDeObstaculos(casa.grupo);
  const dispositivos = criarCamadaDeDispositivos(casa.grupo);
  const cabos = criarCamadaDeCabos(casa.grupo, dispositivos);
  const lugares = criarLugares(casa.grupo, () => casa.todasAsSuperficies());
  const arrumador = criarArrumador(casa.grupo, dispositivos, lugares);

  /**
   * Leva o estado do projeto para a cena: coloca as peças que chegaram sem posição, refaz os dispositivos e os cabos
   * que mudaram e informa o comprimento dos cabos cujas pontas se moveram. As ações chamadas aqui avisam de novo;
   * o pedido fica guardado e roda em seguida.
   */
  let sincronizando = false;
  let pendente = false;
  const sincronizar = (): void => {
    if (sincronizando) {
      pendente = true;
      return;
    }
    sincronizando = true;
    try {
      do {
        pendente = false;
        const iniciais = colocarIniciais(estado.projeto, CATALOGO);
        if (iniciais.size > 0) acoes.moverDispositivos(iniciais, { historico: false });
        dispositivos.atualizar();
        cabos.atualizar();
      } while (pendente);
    } finally {
      sincronizando = false;
    }
    enquadrarSombra();
    pedirQuadro();
  };

  // O mapa de sombra da tela cobre tudo o que projeta sombra: a casa, o quartinho, os obstáculos em volta e as peças.
  // A caixa da casa e dos obstáculos é medida quando eles mudam; as peças no terreno, que podem ficar longe, entram a cada mudança delas.
  const caixaDaCasa = new THREE.Box3();
  const caixaDaSombra = new THREE.Box3();
  const caixaDaMalha = new THREE.Box3();
  let noTerreno = '';
  const medirCasa = (): void => {
    caixaDaCasa.makeEmpty();
    casa.grupo.updateWorldMatrix(true, true);
    casa.grupo.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.castShadow) return;
      if (o instanceof THREE.InstancedMesh) {
        if (o.boundingBox === null) o.computeBoundingBox();
        caixaDaMalha.copy(o.boundingBox!);
      } else {
        if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
        caixaDaMalha.copy(o.geometry.boundingBox!);
      }
      if (!caixaDaMalha.isEmpty()) caixaDaCasa.union(caixaDaMalha.applyMatrix4(o.matrixWorld));
    });
    noTerreno = '';
  };
  const pontoDaPeca = new THREE.Vector3();
  const enquadrarSombra = (): void => {
    const pecas = estado.projeto.dispositivos.filter((d) => d.superficie === ID_TERRENO);
    const chave = pecas.map((d) => d.pos.join(',')).join('|');
    if (chave === noTerreno && !caixaDaSombra.isEmpty()) return;
    noTerreno = chave;
    caixaDaSombra.copy(caixaDaCasa);
    for (const d of pecas) {
      pontoDaPeca.set(d.pos[0], d.pos[1], d.pos[2]).applyMatrix4(casa.grupo.matrixWorld);
      caixaDaSombra.expandByPoint(pontoDaPeca.clone().addScalar(1.6)).expandByPoint(pontoDaPeca.addScalar(-1.6));
    }
    sol.enquadrar(caixaDaSombra);
  };

  /**
   * Vista de abertura. Da casa: a frente, de cima e de lado. No tutorial (só o quartinho): a frente dele, de lado e
   * um pouco de cima, de modo que apareçam a porta aberta, o piso lá dentro e o telhado, onde vai a placa.
   */
  const irParaAVistaInicial = (): void => {
    const q = estado.projeto.casa.quartinho;
    if (estado.projeto.casa.soQuartinho) {
      casa.grupo.updateWorldMatrix(true, false);
      const doQuartinho = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(q.giro)).setPosition(q.x, 0, q.z).premultiply(casa.grupo.matrixWorld);
      // Esfera em volta do quartinho com as folhas da porta abertas; a distância é a que a põe inteira na tela.
      const raio = Math.hypot(q.largura / 2 + 0.9, q.altura / 2 + 0.3, q.profundidade / 2 + 0.5);
      const meioCampoV = THREE.MathUtils.degToRad(camera.fov / 2);
      const meioCampo = Math.min(meioCampoV, Math.atan(Math.tan(meioCampoV) * camera.aspect));
      const distancia = THREE.MathUtils.clamp((raio / Math.sin(meioCampo)) * VISTA_DO_QUARTINHO.folga, controles.minDistance + 1, controles.maxDistance);
      const lado = THREE.MathUtils.degToRad(VISTA_DO_QUARTINHO.ladoGraus);
      const altura = THREE.MathUtils.degToRad(VISTA_DO_QUARTINHO.alturaGraus);
      // O alvo fica abaixo do meio: o quartinho sobe na tela e o cartão do passo a passo, embaixo, não cobre a porta.
      const alvo = new THREE.Vector3(0, q.altura * 0.25, 0);
      const olho = new THREE.Vector3(Math.sin(lado) * Math.cos(altura), Math.sin(altura), Math.cos(lado) * Math.cos(altura)).multiplyScalar(distancia).add(alvo);
      camera.position.copy(olho.applyMatrix4(doQuartinho));
      controles.target.copy(alvo.applyMatrix4(doQuartinho));
    } else {
      camera.position.set(-14, 11, -16);
      controles.target.set(0, 2.5, 0);
    }
    controles.update();
    sujo = true;
  };

  /** Medidas da casa e projeto vistos na última reconstrução, para saber quando as peças têm de acompanhar a casa. */
  let medidasVistas = '';
  let projetoVisto: typeof estado.projeto | null = null;
  /** Se a última casa construída era a do tutorial. Nulo antes da primeira. */
  let tutorialVisto: boolean | null = null;
  const refazerCasa = (): void => {
    // Os obstáculos (muro, vizinho, árvore) contam como parte da casa: uma peça no terreno sai de baixo deles.
    const medidas = JSON.stringify([{ ...estado.projeto.casa, orientacaoGraus: 0 }, estado.projeto.obstaculos ?? []]);
    // As peças acompanham a casa quando ela muda no mesmo projeto. Projeto trocado (aberto, novo, desfazer)
    // já traz as peças no lugar; girar a casa não mexe em nada.
    const acompanhar = projetoVisto === estado.projeto && medidas !== medidasVistas;
    const memoria = acompanhar ? lembrar(lugares) : null;
    medidasVistas = medidas;
    projetoVisto = estado.projeto;
    casa.reconstruir(estado.projeto.casa);
    obstaculos.atualizar();
    lugares.invalidar();
    dispositivos.atualizarVisao();
    if (memoria) {
      const novos = reassentar(lugares, memoria);
      if (novos.size > 0) acoes.moverDispositivos(novos, { historico: false });
    }
    sincronizar();
    // O mapa de sombra acompanha a casa: cobre tudo que ela tem, onde quer que o quartinho e os obstáculos estejam.
    medirCasa();
    enquadrarSombra();
    pedirQuadro();
    // Entrar no tutorial ou sair dele troca a casa inteira: a câmera vai para a vista de abertura da que chegou.
    const tutorial = estado.projeto.casa.soQuartinho === true;
    if (tutorial !== tutorialVisto) {
      const abrindo = tutorialVisto === null;
      tutorialVisto = tutorial;
      // "Editar casa" não acompanha a troca: a vista de cima dela foi enquadrada para a outra casa.
      if (!abrindo && estado.edicaoCasa.ativa) acoes.definirEdicaoDaCasa(false);
      irParaAVistaInicial();
    }
  };
  const refazerVisao = (): void => {
    casa.aplicarVisao(estado.visao);
    dispositivos.atualizarVisao();
    cabos.atualizar();
    pedirQuadro();
  };
  const refazerSol = (): void => {
    const local = localDoProjeto(estado.projeto);
    if (!local) throw new Error(`Local desconhecido no projeto: "${estado.projeto.localId}"`);
    sol.atualizar(estado.tempo.msUtc, local);
    pedirQuadro();
  };

  refazerCasa();
  refazerVisao();
  refazerSol();

  // Sombra para o cálculo (tarefa 3.1): a partir daqui o núcleo pergunta à cena a sombra e o céu tapado de cada placa.
  const sombra = criarSombra(casa.grupo);
  registrarAmbiente(sombra.ambiente);

  const cancelar = [
    assinar('casa', sombra.invalidar),
    assinar('dispositivos', sombra.invalidar),
    // A casa só é refeita quando as medidas ou a orientação mudam; equipamentos e cabos não passam por aqui.
    assinar('casa', refazerCasa),
    assinar('dispositivos', sincronizar),
    assinar('cabos', sincronizar),
    assinar('visao', refazerVisao),
    assinar('tempo', refazerSol),
    // O local do projeto pode mudar (projeto carregado): o sol acompanha.
    assinar('projeto', refazerSol),
  ];

  // Modo econômico, para vídeo fraco ou por software. Se a cena está em movimento (tempo correndo, câmera girando)
  // e os quadros saem a menos de 25 por segundo, ela passa a ser desenhada com metade da nitidez e com o mapa
  // de sombra refeito só de vez em quando. Assim que o movimento para, sai um quadro com a nitidez inteira.
  let economico = false;
  /** O aparelho já precisou do modo econômico: o próximo movimento entra nele logo no segundo quadro. */
  let aparelhoLento = false;
  /** Quadros desenhados em voltas seguidas do laço, e quantos dos últimos intervalos foram lentos ou folgados. */
  let seguidos = 0;
  let lentos = 0;
  let folgados = 0;
  let anterior = 0;
  let ultimaSombra = 0;
  let sondado = false;

  /** Tempo de um quadro inteiro, com o mapa de sombra, lido só depois de a placa de vídeo terminar. */
  const cronometrar = (): number => {
    const gl = renderizador.getContext();
    const ponto = new Uint8Array(4);
    const inicio = performance.now();
    renderizador.shadowMap.needsUpdate = true;
    renderizador.render(cena, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ponto);
    return performance.now() - inicio;
  };

  let quadro = 0;
  let ultimoPulso = 0;
  /** Tempo que o último quadro de pulso levou até o laço voltar, e se esse tempo ainda está para ser medido. */
  let custoDoPulso = 0;
  let pulsoPendente = false;
  /** Realce do passo a passo. É criado depois da interação, mais abaixo; o laço começa antes. */
  let destaques: ReturnType<typeof criarCamadaDeDestaques> | null = null;
  /** Visores, botões de ligar, selos de queimado e efeitos. Também é criada mais abaixo. */
  let operacao: CamadaDeOperacao | null = null;
  const laco = (agora: number): void => {
    quadro = requestAnimationFrame(laco);
    // O realce do passo a passo pulsa: enquanto ele está na tela, saem quadros mesmo com a cena parada.
    // O mesmo vale para a fumaça e a faísca de um evento da operação, que correm no tempo de verdade.
    const realcando = destaques?.animar(agora) ?? false;
    const operando = operacao?.animar(agora) ?? false;
    // O aparelho que recebe energia ganha vida: hélice girando e LED piscando correm no tempo de verdade, mesmo com o
    // relógio da simulação em pausa. Sem aparelho assim, a cena continua parada.
    const vida = dispositivos.animar(agora);
    if (vida.mudou) sujo = true;
    const pulsando = realcando || operando || vida.animando;
    if (!sujo) {
      seguidos = 0;
      lentos = 0;
      folgados = 0;
      if (!sondado) {
        // Primeira pausa depois de abrir: mede um quadro para já saber se o aparelho é lento.
        sondado = true;
        aparelhoLento = cronometrar() > QUADRO_LENTO_MS;
      }
      if (economico) {
        // O movimento parou: volta a nitidez inteira e sai o quadro final.
        economico = false;
        renderizador.setPixelRatio(nitidezCheia);
        sombraSuja = true;
      } else {
        // Quadro só para o pulso: não conta como movimento (não liga o modo econômico). Em aparelho lento sai mais
        // espaçado, a três vezes o tempo que o quadro de pulso anterior levou, para o ponteiro não engasgar.
        // O custo do quadro de pulso é medido na volta seguinte do laço, haja ou não outro pulso: o LED que pisca pede
        // um quadro de vez em quando, e o intervalo até o próximo não é custo.
        if (pulsoPendente) {
          custoDoPulso = Math.min(500, agora - ultimoPulso);
          pulsoPendente = false;
        }
        if (!pulsando) return;
        if (aparelhoLento && agora - ultimoPulso < Math.max(PULSO_ECONOMICO_MS, 3 * custoDoPulso)) return;
        ultimoPulso = agora;
        pulsoPendente = true;
      }
    } else {
      pulsoPendente = false;
      if (seguidos > 0) {
        const intervalo = agora - anterior;
        lentos = intervalo > QUADRO_MUITO_LENTO_MS ? 3 : intervalo > QUADRO_LENTO_MS ? lentos + 1 : 0;
        folgados = intervalo < QUADRO_FOLGADO_MS ? folgados + 1 : 0;
      }
      seguidos++;
      anterior = agora;
      if (!economico && (lentos >= 3 || (aparelhoLento && seguidos >= 2))) {
        economico = true;
        aparelhoLento = true;
        renderizador.setPixelRatio(nitidezCheia * NITIDEZ_ECONOMICA);
      }
      // Com metade da nitidez os quadros saem folgados: no próximo movimento, tenta de novo a nitidez inteira.
      if (economico && folgados >= 20) aparelhoLento = false;
    }
    sujo = false;
    if (sombraSuja && (!economico || agora - ultimaSombra >= SOMBRA_ECONOMICA_MS)) {
      renderizador.shadowMap.needsUpdate = true;
      sombraSuja = false;
      ultimaSombra = agora;
    }
    renderizador.render(cena, camera);
  };
  laco(performance.now());

  const projetado = new THREE.Vector3();
  /** Posição na janela de um ponto do mundo. */
  const mundoNaTela = (ponto: THREE.Vector3): [number, number] => {
    camera.updateMatrixWorld();
    projetado.copy(ponto).project(camera);
    const r = renderizador.domElement.getBoundingClientRect();
    return [r.left + ((projetado.x + 1) / 2) * r.width, r.top + ((1 - projetado.y) / 2) * r.height];
  };
  const naTela = (pontoNaCasa: THREE.Vector3): [number, number] => {
    casa.grupo.updateWorldMatrix(true, false);
    return mundoNaTela(pontoNaCasa.clone().applyMatrix4(casa.grupo.matrixWorld));
  };

  // Duplo clique: o ponto clicado vira o centro da órbita, e a câmera chega mais perto dele.
  const raioDoFoco = new THREE.Raycaster();
  const aVista = (o: THREE.Object3D | null): boolean => {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  const focar = (e: MouseEvent): void => {
    if (estado.edicaoCasa.ativa || e.target !== renderizador.domElement) return;
    // Dois cliques seguidos em uma chave ou em um botão de ligar são duas manobras, e não um pedido de aproximar a câmera.
    if (interacao.manobraEm(e.clientX, e.clientY)) return;
    const r = renderizador.domElement.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    camera.updateMatrixWorld();
    raioDoFoco.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const toque = raioDoFoco.intersectObjects([casa.grupo, chao], true).find((t) => aVista(t.object) && t.distance < 200);
    if (!toque) return;
    const direcao = camera.position.clone().sub(controles.target).normalize();
    // No tutorial tudo é pequeno e fica perto: o duplo clique chega mais perto da peça.
    const distancia = THREE.MathUtils.clamp(toque.distance * 0.6, estado.projeto.casa.soQuartinho ? 1.2 : 2, 14);
    controles.target.copy(toque.point);
    camera.position.copy(toque.point).addScaledVector(direcao, distancia);
    controles.update();
    sujo = true;
  };
  const vistaInicial = (): void => {
    if (estado.edicaoCasa.ativa) return;
    irParaAVistaInicial();
  };
  renderizador.domElement.addEventListener('dblclick', focar);
  window.addEventListener('offgrid:vista-inicial', vistaInicial);

  const camadaDeOperacao = criarCamadaDeOperacao({ casa: casa.grupo, camera, canvas: renderizador.domElement, dispositivos, cabos, pedirQuadroLeve });
  operacao = camadaDeOperacao;

  const interacao = criarInteracao({
    container,
    canvas: renderizador.domElement,
    camera,
    controles,
    casa: casa.grupo,
    superficies: () => casa.superficies(),
    dispositivos,
    cabos,
    lugares,
    operacao: camadaDeOperacao,
    pedirQuadro,
    pedirQuadroLeve,
    naTela,
  });

  destaques = criarCamadaDeDestaques({
    casa: casa.grupo,
    camera,
    canvas: renderizador.domElement,
    superficies: () => casa.superficies(),
    dispositivos,
    cabos,
    superficiesDoArraste: () => interacao.superficiesDoArraste(),
    pedirQuadroLeve,
  });
  const camadaDeDestaques = destaques;

  const edicao = criarEdicao({
    container,
    canvas: renderizador.domElement,
    camera,
    controles,
    casa: casa.grupo,
    superficies: () => casa.superficies(),
    cabos,
    pedirQuadroLeve,
    naTela,
  });

  window.__offgrid = {
    // A interface pode ter registrado auxiliares antes da cena (`telaDoCartao`): eles continuam.
    ...window.__offgrid,
    pronto: true,
    estado: () => estado,
    acoes,
    posicionarCamera(pos, alvo) {
      camera.position.set(...pos);
      controles.target.set(...alvo);
      controles.update();
      sujo = true;
    },
    superficies: () => casa.superficies().map((m) => (m.userData.superficie as { id: string }).id),
    telaDe(uid) {
      const d = estado.projeto.dispositivos.find((x) => x.uid === uid);
      return d && dispositivos.grupoDe(uid) ? naTela(new THREE.Vector3(...d.pos)) : null;
    },
    telaDoTerminal(uid, terminal) {
      const t = dispositivos.terminal(uid, terminal);
      return t ? naTela(t.pos) : null;
    },
    encaixar(itemId, superficie, ponto, normal, giro = 0) {
      const item = CATALOGO.get(itemId);
      if (!item) throw new Error(`Item desconhecido no catálogo: "${itemId}"`);
      return encaixar(item, superficie, ponto, normal, giro);
    },
    telaDoPonto: (p) => naTela(new THREE.Vector3(...p)),
    telaDoCabo(uid, fracao = 0.5) {
      const p = cabos.ponto(uid, fracao);
      return p ? naTela(p) : null;
    },
    interacao: () => interacao.situacao(),
    edicao: () => edicao.situacao(),
    telaDaAlca: (id) => edicao.telaDaAlca(id),
    camera: () => ({ pos: camera.position.toArray(), alvo: controles.target.toArray() }),
    destaquesNaCena: () => camadaDeDestaques.naCena(),
    arrumarCabos: () => arrumador.arrumar(),
    soltarCabos: () => arrumador.soltar(),
    mundoDosCabos: () => arrumador.medir(),
    telaDaProtecao: (caboUid, indice) => camadaDeOperacao.telaDaProtecao(caboUid, indice),
    telaDoBotao: (uid) => camadaDeOperacao.telaDoBotao(uid),
    textoDoVisor: (uid) => camadaDeOperacao.textoDoVisor(uid),
    operacaoNaCena: () => camadaDeOperacao.resumo(),
    vidaDoAparelho: (uid) => dispositivos.vida(uid),
    recalcular: recalcularAgora,
    ambiente: () => sombra.ambiente,
    resumoDaSombra: () => sombra.resumo(),
    triangulosDosModelos: () => dispositivos.triangulos(),
    camadas: { dispositivos, cabos },
    pedirQuadro,
    medirQuadros(n, comSombra = true) {
      const gl = renderizador.getContext();
      const ponto = new Uint8Array(4);
      // Ler um ponto obriga a placa de vídeo a terminar o quadro antes de o relógio ser lido.
      const desenhar = (): void => {
        if (comSombra) renderizador.shadowMap.needsUpdate = true;
        renderizador.render(cena, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ponto);
      };
      desenhar();
      const inicio = performance.now();
      for (let i = 0; i < n; i++) desenhar();
      const ms = (performance.now() - inicio) / n;
      sujo = true; // o quadro da tela volta a ser o do laço
      const { render, memory } = renderizador.info;
      return { ms, chamadas: render.calls, triangulos: render.triangles, geometrias: memory.geometries, texturas: memory.textures };
    },
  };

  return {
    cena,
    camera,
    controles,
    renderizador,
    casa: casa.grupo,
    pedirQuadro,
    pedirQuadroLeve,
    superficies: () => casa.superficies(),
    dispositivos,
    cabos,
    encaixar,
    encaixarNoToque,
    naTela,
    destruir() {
      cancelar.forEach((c) => c());
      registrarAmbiente(null);
      camadaDeDestaques.destruir();
      interacao.destruir();
      camadaDeOperacao.destruir();
      edicao.destruir();
      cancelAnimationFrame(quadro);
      window.removeEventListener('offgrid:vista-inicial', vistaInicial);
      observador.disconnect();
      controles.dispose();
      // Geometrias, materiais, texturas e mapa de sombra de tudo: casa, terreno, rosa dos ventos e sol.
      dispositivos.destruir();
      cabos.destruir();
      obstaculos.destruir();
      liberar(cena, true);
      sol.destruir();
      liberarMateriais();
      // Moldes, tintas e estampas dos equipamentos: uma cena nova os refaz.
      liberarModelos();
      liberarProtecoes();
      liberarTintas();
      liberarEstampas();
      cena.clear();
      renderizador.dispose();
      renderizador.domElement.remove();
      if (window.__offgrid?.pronto) delete window.__offgrid;
    },
  };
}
