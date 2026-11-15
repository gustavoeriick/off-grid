// Rota com vários saltos e sugestão de ponto de repetidor. Especificação: seção 4.9.
import {
  CANDIDATOS_AVALIADOS,
  DISTANCIA_MINIMA_DAS_PONTAS_KM,
  DISTANCIA_MINIMA_ENTRE_SUGESTOES_KM,
  MARGEM_DA_GRADE_FRACAO,
  MARGEM_MINIMA_DA_GRADE_KM,
  PASSO_DA_GRADE_KM,
  RAIO_MEDIO_DA_TERRA_KM,
  SUGESTOES_MAXIMAS,
} from './constantes';
import { calcularEnlace } from './enlace';
import { distanciaKm, pontoNoCaminho } from './geografia';
import { montarPerfil } from './perfil';
import type { Ambiente, AltitudeEm, Coordenada, Radio, Veredito } from './tipos';

// ---------------------------------------------------------------------------------------------
// Rota
// ---------------------------------------------------------------------------------------------

/** Enlace com resultado pronto, entre dois pontos do projeto. Não tem direção. */
export interface Aresta {
  de: string;
  para: string;
  folgaDb: number;
  veredito: Veredito;
}

/** Caminho de um ponto a outro, passando por outros pontos do projeto. */
export interface Rota {
  /** Os pontos do percurso, da origem ao destino, sem repetir. */
  pontos: string[];
  /** Os trechos, na ordem e no sentido do percurso: `de` é o ponto de onde se sai. */
  trechos: Aresta[];
  /** O trecho de menor folga (o primeiro do percurso, se houver empate). */
  maisFraco: Aresta;
  /** A folga do trecho mais fraco. */
  folgaDb: number;
  /** O pior veredito entre os trechos. */
  veredito: Veredito;
  /** Quantos pontos ficam entre a origem e o destino. */
  pontosNoMeio: number;
}

export type ResultadoDaRota =
  | { rota: Rota }
  | { rota: null; motivo: 'sem-ligacao' }
  /** Só existe caminho com mais pontos no meio que o limite; `pontosNoMeio` é o mínimo preciso. */
  | { rota: null; motivo: 'limite'; pontosNoMeio: number };

/** Quanto maior, pior. */
const POSTO_DO_VEREDITO: Record<Veredito, number> = { folga: 0, limite: 1, 'nao-fecha': 2 };

/** O pior de dois vereditos: 'nao-fecha' pior que 'limite' pior que 'folga'. */
export function piorVeredito(a: Veredito, b: Veredito): Veredito {
  return POSTO_DO_VEREDITO[a] >= POSTO_DO_VEREDITO[b] ? a : b;
}

/** Caminho mais curto (menos saltos) de `origem` a `destino` usando só as arestas que passam no filtro. */
function caminhoMaisCurto(
  arestas: Aresta[],
  origem: string,
  destino: string,
  aceita: (a: Aresta) => boolean,
): { pontos: string[]; trechos: Aresta[] } | null {
  const vizinhos = new Map<string, Aresta[]>();
  for (const a of arestas) {
    if (!aceita(a)) continue;
    (vizinhos.get(a.de) ?? vizinhos.set(a.de, []).get(a.de)!).push(a);
    (vizinhos.get(a.para) ?? vizinhos.set(a.para, []).get(a.para)!).push(a);
  }
  // Busca em largura: o primeiro caminho que chega ao destino tem o menor número de saltos e nunca repete ponto.
  const veioDe = new Map<string, { anterior: string; trecho: Aresta }>();
  const visto = new Set<string>([origem]);
  const fila: string[] = [origem];
  for (let i = 0; i < fila.length && !visto.has(destino); i++) {
    const atual = fila[i]!;
    for (const a of vizinhos.get(atual) ?? []) {
      const outro = a.de === atual ? a.para : a.de;
      if (visto.has(outro)) continue;
      visto.add(outro);
      // O trecho já sai orientado no sentido do percurso.
      veioDe.set(outro, { anterior: atual, trecho: { de: atual, para: outro, folgaDb: a.folgaDb, veredito: a.veredito } });
      fila.push(outro);
    }
  }
  if (!visto.has(destino)) return null;
  const pontos = [destino];
  const trechos: Aresta[] = [];
  for (let p = destino; p !== origem; ) {
    const passo = veioDe.get(p)!;
    trechos.unshift(passo.trecho);
    pontos.unshift(passo.anterior);
    p = passo.anterior;
  }
  return { pontos, trechos };
}

/**
 * Melhor rota de `origem` a `destino` (seção 4.9).
 *
 * Regras: caminho sem repetir ponto; no máximo `limiteDeSaltos` pontos no meio; folga da rota = a do pior
 * trecho; veredito da rota = o pior dos trechos. Entre as rotas que cabem, vale a de melhor veredito, depois a de
 * maior folga, depois a de menos pontos no meio.
 *
 * Não percorre todos os caminhos (explodiria em malha densa). Como as três regras são "gargalos", resolve em
 * ordem com buscas em largura: (1) o menor veredito pior que ainda dá caminho dentro do limite; (2) a maior folga
 * mínima, por busca binária sobre as folgas das arestas; (3) o caminho de menos saltos nesse corte.
 *
 * Decisões onde a especificação não diz:
 * - `origem` igual a `destino`, ou ponto que não está em `pontos`: devolve `sem-ligacao` (não há rota a calcular).
 * - Aresta com ponto fora de `pontos`, ou de um ponto para ele mesmo: ignorada.
 * - Arestas repetidas entre o mesmo par: vale a que passa no corte da busca; sem empate de escolha relevante.
 * - Empate total: vale o primeiro caminho achado, na ordem das arestas.
 */
export function melhorRota(
  pontos: string[],
  arestas: Aresta[],
  origem: string,
  destino: string,
  limiteDeSaltos: number,
): ResultadoDaRota {
  const conhecidos = new Set(pontos);
  if (origem === destino || !conhecidos.has(origem) || !conhecidos.has(destino)) {
    return { rota: null, motivo: 'sem-ligacao' };
  }
  const validas = arestas.filter((a) => a.de !== a.para && conhecidos.has(a.de) && conhecidos.has(a.para));

  const qualquer = caminhoMaisCurto(validas, origem, destino, () => true);
  if (!qualquer) return { rota: null, motivo: 'sem-ligacao' };
  const noMeio = (c: { trechos: Aresta[] }) => c.trechos.length - 1;
  if (noMeio(qualquer) > limiteDeSaltos) {
    return { rota: null, motivo: 'limite', pontosNoMeio: noMeio(qualquer) };
  }
  const cabe = (c: { trechos: Aresta[] } | null) => c !== null && noMeio(c) <= limiteDeSaltos;

  // 1. Melhor veredito do pior trecho.
  let postoMaximo = 2;
  for (const posto of [0, 1]) {
    if (cabe(caminhoMaisCurto(validas, origem, destino, (a) => POSTO_DO_VEREDITO[a.veredito] <= posto))) {
      postoMaximo = posto;
      break;
    }
  }
  const noVeredito = validas.filter((a) => POSTO_DO_VEREDITO[a.veredito] <= postoMaximo);

  // 2. Maior folga mínima: busca binária sobre as folgas (do maior para o menor). Menos folga mínima, mais arestas.
  const folgas = [...new Set(noVeredito.map((a) => a.folgaDb))].sort((x, y) => y - x);
  let baixo = 0;
  let alto = folgas.length - 1; // com a menor folga, todas as arestas do veredito entram: cabe, pelo passo 1
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (cabe(caminhoMaisCurto(noVeredito, origem, destino, (a) => a.folgaDb >= folgas[meio]!))) alto = meio;
    else baixo = meio + 1;
  }

  // 3. Menos pontos no meio nesse corte.
  const escolhido = caminhoMaisCurto(noVeredito, origem, destino, (a) => a.folgaDb >= folgas[baixo]!)!;
  let maisFraco = escolhido.trechos[0]!;
  let veredito: Veredito = 'folga';
  for (const t of escolhido.trechos) {
    if (t.folgaDb < maisFraco.folgaDb) maisFraco = t;
    veredito = piorVeredito(veredito, t.veredito);
  }
  return {
    rota: {
      pontos: escolhido.pontos,
      trechos: escolhido.trechos,
      maisFraco,
      folgaDb: maisFraco.folgaDb,
      veredito,
      pontosNoMeio: noMeio(escolhido),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Sugestão de ponto de repetidor
// ---------------------------------------------------------------------------------------------

export interface CandidatoARepetidor extends Coordenada {
  /** Altitude do terreno no candidato, em m. */
  altM: number;
}

/** Resultado de um trecho da sugestão: de uma ponta ao candidato. */
export interface TrechoDaSugestao {
  distanciaKm: number;
  folgaDb: number;
  veredito: Veredito;
}

export interface SugestaoDeRepetidor extends CandidatoARepetidor {
  /** Da ponta A ao candidato. */
  trechoA: TrechoDaSugestao;
  /** Do candidato à ponta B. */
  trechoB: TrechoDaSugestao;
  /** A folga do pior trecho. */
  folgaDb: number;
  /** O pior veredito dos dois trechos. */
  veredito: Veredito;
}

/**
 * Folga de 1 m na exclusão perto das pontas. A grade cai a exatamente 1 km de uma ponta quando a ponta está em um
 * ponto da grade; sem esta folga, o ruído de arredondamento decidiria sozinho quem fica, e a grade perderia a simetria.
 */
const TOLERANCIA_DA_GRADE_KM = 0.001;

const KM_POR_GRAU = (RAIO_MEDIO_DA_TERRA_KM * Math.PI) / 180;

/**
 * Grade de candidatos a repetidor entre `a` e `b` (seção 4.9), já filtrada.
 *
 * Geometria: plano local em km em torno do ponto médio do caminho (`x` a leste, `y` ao norte, com a longitude
 * encolhida pelo cosseno da latitude do ponto médio). Eixo `u` ao longo do caminho de A para B, eixo `v`
 * perpendicular. A grade tem passo de 0,5 km e vai de `−(D/2 + margem)` a `+(D/2 + margem)` em `u` e de `−margem`
 * a `+margem` em `v`, centrada no ponto médio: por isso é simétrica nos dois eixos. `margem` é 30% da distância
 * `D`, com mínimo de 3 km.
 *
 * Erro esperado: a aproximação de plano local erra a posição por menos de 0,1 km em grades de até 100 km em
 * latitudes do Brasil, abaixo do passo da grade. Não trata a linha de data (antimeridiano).
 * Caminho de comprimento zero: o eixo `u` aponta para leste.
 *
 * Ficam de fora os pontos a menos de 1 km de uma ponta (com folga de 1 m: o ponto a exatamente 1 km fica). Dos restantes, só os 300 de terreno mais alto
 * (empate: o que vem antes na varredura da grade), ordenados do mais alto ao mais baixo.
 * Cada ponto da grade chama `altitudeEm` uma vez.
 */
export function candidatosARepetidor(a: Coordenada, b: Coordenada, altitudeEm: AltitudeEm): CandidatoARepetidor[] {
  const total = distanciaKm(a, b);
  const meio = pontoNoCaminho(a, b, 0.5);
  const cosLat = Math.cos((meio.lat * Math.PI) / 180);
  const paraPlano = (p: Coordenada) => ({
    x: (p.lon - meio.lon) * cosLat * KM_POR_GRAU,
    y: (p.lat - meio.lat) * KM_POR_GRAU,
  });
  const dePlano = (x: number, y: number): Coordenada => ({
    lat: meio.lat + y / KM_POR_GRAU,
    lon: meio.lon + x / (cosLat * KM_POR_GRAU),
  });

  const pa = paraPlano(a);
  const pb = paraPlano(b);
  const comprimento = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const ux = comprimento > 1e-9 ? (pb.x - pa.x) / comprimento : 1;
  const uy = comprimento > 1e-9 ? (pb.y - pa.y) / comprimento : 0;
  const vx = -uy;
  const vy = ux;

  const margem = Math.max(MARGEM_MINIMA_DA_GRADE_KM, MARGEM_DA_GRADE_FRACAO * total);
  const passosU = Math.floor((total / 2 + margem) / PASSO_DA_GRADE_KM);
  const passosV = Math.floor(margem / PASSO_DA_GRADE_KM);

  const candidatos: CandidatoARepetidor[] = [];
  for (let i = -passosU; i <= passosU; i++) {
    for (let j = -passosV; j <= passosV; j++) {
      const u = i * PASSO_DA_GRADE_KM;
      const v = j * PASSO_DA_GRADE_KM;
      const p = dePlano(u * ux + v * vx, u * uy + v * vy);
      if (
        distanciaKm(p, a) < DISTANCIA_MINIMA_DAS_PONTAS_KM - TOLERANCIA_DA_GRADE_KM ||
        distanciaKm(p, b) < DISTANCIA_MINIMA_DAS_PONTAS_KM - TOLERANCIA_DA_GRADE_KM
      ) {
        continue;
      }
      candidatos.push({ lat: p.lat, lon: p.lon, altM: altitudeEm(p) });
    }
  }
  // A ordenação do JavaScript é estável: o empate de altitude fica na ordem da varredura.
  candidatos.sort((x, y) => y.altM - x.altM);
  return candidatos.slice(0, CANDIDATOS_AVALIADOS);
}

/**
 * Calcula os dois trechos de um candidato: da ponta A ao candidato e do candidato à ponta B, cada um com
 * `montarPerfil` e `calcularEnlace`. O candidato leva o rádio `radioDoRepetidor`.
 */
export function avaliarCandidato(
  a: Coordenada & Radio,
  b: Coordenada & Radio,
  candidato: CandidatoARepetidor,
  radioDoRepetidor: Radio,
  altitudeEm: AltitudeEm,
  ambiente: Ambiente,
): SugestaoDeRepetidor {
  const trecho = (ponta: Coordenada & Radio): TrechoDaSugestao => {
    const r = calcularEnlace(ponta, radioDoRepetidor, montarPerfil(ponta, candidato, altitudeEm), ambiente);
    return { distanciaKm: r.geometria.distanciaKm, folgaDb: r.conta.folgaDb, veredito: r.veredito };
  };
  const trechoA = trecho(a);
  const trechoB = trecho(b);
  return {
    lat: candidato.lat,
    lon: candidato.lon,
    altM: candidato.altM,
    trechoA,
    trechoB,
    folgaDb: Math.min(trechoA.folgaDb, trechoB.folgaDb),
    veredito: piorVeredito(trechoA.veredito, trechoB.veredito),
  };
}

/**
 * Ordena os avaliados (melhor veredito do pior trecho, depois maior folga do pior trecho) e devolve até 5,
 * cada um a mais de 1 km dos já escolhidos. Não altera a lista recebida.
 */
export function escolherSugestoes(avaliados: SugestaoDeRepetidor[]): SugestaoDeRepetidor[] {
  const ordenados = [...avaliados].sort(
    (x, y) => POSTO_DO_VEREDITO[x.veredito] - POSTO_DO_VEREDITO[y.veredito] || y.folgaDb - x.folgaDb,
  );
  const escolhidos: SugestaoDeRepetidor[] = [];
  for (const s of ordenados) {
    if (escolhidos.length >= SUGESTOES_MAXIMAS) break;
    if (escolhidos.every((e) => distanciaKm(e, s) > DISTANCIA_MINIMA_ENTRE_SUGESTOES_KM)) escolhidos.push(s);
  }
  return escolhidos;
}

/** Tudo de uma vez: candidatos, avaliação e escolha. A tela usa as três funções em pedaços; os testes, esta. */
export function sugerirRepetidores(
  a: Coordenada & Radio,
  b: Coordenada & Radio,
  radioDoRepetidor: Radio,
  altitudeEm: AltitudeEm,
  ambiente: Ambiente,
): SugestaoDeRepetidor[] {
  const avaliados = candidatosARepetidor(a, b, altitudeEm).map((c) =>
    avaliarCandidato(a, b, c, radioDoRepetidor, altitudeEm, ambiente),
  );
  return escolherSugestoes(avaliados);
}
