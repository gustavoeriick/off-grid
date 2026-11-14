// Casa paramétrica. Especificação: docs/especificacao/cena-e-interface.md, seção 3.
// Coordenadas da casa: origem no centro da planta, no chão; frente em +Z; +X à direita de quem olha a frente.

import * as THREE from 'three';
import type { ModoVisao } from '../estado';
import type { CasaConfig, LadoCasa } from '../nucleo/tipos';

const ESPESSURA_PAREDE = 0.15;

const COR = {
  parede: '#f2efe6',
  telha: '#b5532d',
  pisoTerreo: '#cfc8b8',
  pisoSuperior: '#b08d62',
  pilar: '#e8e2d2',
  quartinho: '#e6dfcf',
};

const mat = {
  parede: new THREE.MeshStandardMaterial({ color: COR.parede, roughness: 0.9 }),
  telha: new THREE.MeshStandardMaterial({ color: COR.telha, roughness: 0.8, side: THREE.DoubleSide }),
  pisoTerreo: new THREE.MeshStandardMaterial({ color: COR.pisoTerreo, roughness: 0.9 }),
  pisoSuperior: new THREE.MeshStandardMaterial({ color: COR.pisoSuperior, roughness: 0.8 }),
  pilar: new THREE.MeshStandardMaterial({ color: COR.pilar, roughness: 0.9 }),
  quartinho: new THREE.MeshStandardMaterial({ color: COR.quartinho, roughness: 0.9 }),
  oitao: new THREE.MeshStandardMaterial({ color: COR.parede, roughness: 0.9, side: THREE.DoubleSide }),
};

type Tipo = 'telhado' | 'parede' | 'piso';

interface Marca {
  id: string;
  tipo: Tipo;
}

function marcar(m: THREE.Mesh, superficie?: Marca): THREE.Mesh {
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.sombra = true;
  if (superficie) m.userData.superficie = superficie;
  return m;
}

function caixa(
  l: number,
  a: number,
  p: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  superficie?: Marca,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, a, p), material);
  m.position.set(x, y, z);
  return marcar(m, superficie);
}

/**
 * Lâmina inclinada que desce da linha (z0, y0) até (z1, y1), com a face de cima passando por essa reta.
 * Largura em X; espessura `esp` para baixo.
 */
function agua(
  largura: number,
  z0: number,
  y0: number,
  z1: number,
  y1: number,
  esp: number,
  material: THREE.Material,
  superficie: Marca,
): THREE.Mesh {
  const dz = z1 - z0;
  const dy = y1 - y0;
  const comp = Math.hypot(dz, dy);
  const m = new THREE.Mesh(new THREE.BoxGeometry(largura, esp, comp), material);
  // Rotação em X: o eixo local Z vira (0, −sen φ, cos φ). Para dz < 0 o eixo é invertido, o que dá o mesmo segmento.
  m.rotation.x = dz >= 0 ? Math.atan2(-dy, dz) : Math.atan2(dy, -dz);
  // Normal da face de cima, depois de girar.
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(m.rotation);
  m.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(normal, -esp / 2);
  return marcar(m, superficie);
}

function oitao(casa: CasaConfig, lado: 1 | -1, hTopo: number, cumeeira: number): THREE.Mesh {
  const meia = casa.profundidade / 2;
  const t = ESPESSURA_PAREDE;
  const forma = new THREE.Shape();
  forma.moveTo(-meia, 0);
  forma.lineTo(meia, 0);
  forma.lineTo(0, cumeeira - hTopo - 0.05); // um pouco abaixo da face do telhado, para não brigar com ela
  forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: t, bevelEnabled: false });
  // Forma em (z, y) com extrusão em x; ordem dos eixos: (u, v, w) -> (z, y, -x).
  geo.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat.oitao);
  m.position.set(lado * (casa.largura / 2) + (lado === -1 ? t : 0), hTopo, 0);
  return marcar(m);
}

function construirVaranda(casa: CasaConfig): THREE.Group {
  const v = casa.varanda!;
  const lado: LadoCasa = v.lado;
  const ehLateral = lado === 'esquerda' || lado === 'direita';
  const comp = ehLateral ? casa.profundidade : casa.largura;
  const recuo = ehLateral ? casa.largura / 2 : casa.profundidade / 2;
  const g = new THREE.Group();
  g.name = `varanda-${lado}`;
  // Quadro local: o "fora" é +Z, o comprimento da fachada é X.
  const giro = { frente: 0, fundos: Math.PI, direita: Math.PI / 2, esquerda: -Math.PI / 2 }[lado];
  g.rotation.y = giro;
  g.position.set(
    lado === 'direita' ? recuo : lado === 'esquerda' ? -recuo : 0,
    0,
    lado === 'frente' ? recuo : lado === 'fundos' ? -recuo : 0,
  );

  const prof = v.profundidade;
  const s = v.inclinacaoPct / 100;
  const yParede = casa.andares === 2 ? casa.peDireito + 0.25 : casa.peDireito - 0.1;
  const yFora = yParede - prof * s;
  const esp = 0.07;

  g.add(caixa(comp, 0.05, prof, mat.pisoTerreo, 0, 0.025, prof / 2, { id: 'piso-varanda', tipo: 'piso' }));
  g.add(agua(comp, 0, yParede, prof, yFora, esp, mat.telha, { id: 'telhado-varanda', tipo: 'telhado' }));

  const alturaPilar = yFora - esp - 0.05;
  if (alturaPilar > 0.3) {
    const xs = [-comp / 2 + 0.06, comp / 2 - 0.06];
    if (comp > 5) xs.push(0);
    for (const x of xs) {
      g.add(caixa(0.12, alturaPilar, 0.12, mat.pilar, x, 0.05 + alturaPilar / 2, prof - 0.06));
    }
  }
  return g;
}

function construirQuartinho(casa: CasaConfig): THREE.Group {
  const q = casa.quartinho;
  const g = new THREE.Group();
  g.name = 'quartinho';
  g.position.set(q.x, 0, q.z);
  g.rotation.y = THREE.MathUtils.degToRad(q.giro);
  const e = 0.1;
  const l = q.largura;
  const p = q.profundidade;
  g.add(caixa(l, 0.05, p, mat.pisoTerreo, 0, 0.025, 0, { id: 'piso-quartinho', tipo: 'piso' }));
  g.add(caixa(l, q.altura, e, mat.quartinho, 0, q.altura / 2, -p / 2 + e / 2, { id: 'parede-quartinho-fundo', tipo: 'parede' }));
  g.add(caixa(e, q.altura, p - e, mat.quartinho, -l / 2 + e / 2, q.altura / 2, e / 2, { id: 'parede-quartinho-esquerda', tipo: 'parede' }));
  g.add(caixa(e, q.altura, p - e, mat.quartinho, l / 2 - e / 2, q.altura / 2, e / 2, { id: 'parede-quartinho-direita', tipo: 'parede' }));
  // Uma água de 15%, caindo para os fundos (−Z), beiral de 0,2.
  const b = 0.2;
  const zFundo = -p / 2 - b;
  const zFrente = p / 2 + b;
  const yFundo = q.altura;
  const yFrente = yFundo + (zFrente - zFundo) * 0.15;
  g.add(agua(l + 2 * b, zFrente, yFrente, zFundo, yFundo, 0.08, mat.telha, { id: 'telhado-quartinho', tipo: 'telhado' }));
  return g;
}

export interface CasaCena {
  /** Grupo que gira com a orientação. Equipamentos e cabos entram aqui como filhos. */
  grupo: THREE.Group;
  /** Refaz a estrutura a partir da configuração e aplica a rotação. */
  reconstruir(casa: CasaConfig): void;
  aplicarVisao(modo: ModoVisao): void;
}

function liberar(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

export function criarCasa(): CasaCena {
  const grupo = new THREE.Group();
  grupo.name = 'casa';
  let estrutura = new THREE.Group();
  grupo.add(estrutura);
  let telhado = new THREE.Group();
  let superior = new THREE.Group();
  let modo: ModoVisao = 'completa';

  function aplicarVisao(novo: ModoVisao): void {
    modo = novo;
    telhado.visible = modo === 'completa';
    superior.visible = modo !== 'terreo';
  }

  function reconstruir(casa: CasaConfig): void {
    grupo.remove(estrutura);
    liberar(estrutura);
    estrutura = new THREE.Group();
    estrutura.name = 'estrutura';
    grupo.add(estrutura);
    grupo.rotation.y = Math.PI - THREE.MathUtils.degToRad(casa.orientacaoGraus);

    const { largura: W, profundidade: D, peDireito: pd, andares } = casa;
    const t = ESPESSURA_PAREDE;
    const hTopo = andares * pd;
    const s = casa.inclinacaoTelhadoPct / 100;
    const beiral = casa.beiral;

    estrutura.add(caixa(W, 0.05, D, mat.pisoTerreo, 0, 0.025, 0, { id: 'piso-terreo', tipo: 'piso' }));

    superior = new THREE.Group();
    superior.name = 'andar-superior';
    for (let i = 0; i < andares; i++) {
      const andar = i === 0 ? estrutura : superior;
      const yc = i * pd + pd / 2;
      const idp = (n: string) => ({ id: `parede-${n}-${i}`, tipo: 'parede' as const });
      andar.add(caixa(W, pd, t, mat.parede, 0, yc, D / 2 - t / 2, idp('frente')));
      andar.add(caixa(W, pd, t, mat.parede, 0, yc, -D / 2 + t / 2, idp('fundos')));
      andar.add(caixa(t, pd, D - 2 * t, mat.parede, -W / 2 + t / 2, yc, 0, idp('esquerda')));
      andar.add(caixa(t, pd, D - 2 * t, mat.parede, W / 2 - t / 2, yc, 0, idp('direita')));
    }
    if (andares === 2) {
      superior.add(
        caixa(W - 2 * t, 0.12, D - 2 * t, mat.pisoSuperior, 0, pd - 0.06, 0, { id: 'piso-superior', tipo: 'piso' }),
      );
    }
    estrutura.add(superior);

    telhado = new THREE.Group();
    telhado.name = 'telhado';
    const cumeeira = hTopo + (D / 2) * s;
    const yBeiral = hTopo - beiral * s;
    const larguraTelhado = W + 2 * beiral;
    telhado.add(agua(larguraTelhado, 0, cumeeira, D / 2 + beiral, yBeiral, 0.08, mat.telha, { id: 'telhado-frente', tipo: 'telhado' }));
    telhado.add(agua(larguraTelhado, 0, cumeeira, -D / 2 - beiral, yBeiral, 0.08, mat.telha, { id: 'telhado-fundos', tipo: 'telhado' }));
    telhado.add(oitao(casa, 1, hTopo, cumeeira));
    telhado.add(oitao(casa, -1, hTopo, cumeeira));
    estrutura.add(telhado);

    if (casa.varanda) estrutura.add(construirVaranda(casa));
    estrutura.add(construirQuartinho(casa));

    aplicarVisao(modo);
  }

  return { grupo, reconstruir, aplicarVisao };
}
