// Conta do enlace, veredito e melhorias. Especificação: seções 4.6 a 4.8.
import { FOLGA_COM_SOBRA_DB, FRACAO_DE_FRESNEL, MODOS } from './constantes';
import { avisosDaRegra } from './regras';
import { difracaoCompleta, geometriaDoEnlace, perdaNoArLivreDb } from './propagacao';
import type {
  Ambiente,
  ContaDoEnlace,
  Geometria,
  Melhoria,
  Perfil,
  Radio,
  ResultadoDoEnlace,
  Veredito,
} from './tipos';

/**
 * Conta de um sentido do enlace, de `tx` para `rx`:
 * `recebido = potência + ganhoTx − caboTx − (arLivre + difração + margem) + ganhoRx − caboRx`.
 */
export function contaDoEnlace(
  tx: Radio,
  rx: Radio,
  distanciaKm: number,
  difracaoDb: number,
  ambiente: Ambiente,
): ContaDoEnlace {
  const arLivreDb = perdaNoArLivreDb(distanciaKm, ambiente.frequenciaMHz);
  const recebidoDbm =
    tx.potenciaDbm +
    tx.ganhoDbi -
    tx.perdaNoCaboDb -
    (arLivreDb + difracaoDb + ambiente.margemDoAmbienteDb) +
    rx.ganhoDbi -
    rx.perdaNoCaboDb;
  return {
    frequenciaMHz: ambiente.frequenciaMHz,
    distanciaKm,
    potenciaDbm: tx.potenciaDbm,
    ganhoTxDbi: tx.ganhoDbi,
    caboTxDb: tx.perdaNoCaboDb,
    arLivreDb,
    difracaoDb,
    margemDoAmbienteDb: ambiente.margemDoAmbienteDb,
    ganhoRxDbi: rx.ganhoDbi,
    caboRxDb: rx.perdaNoCaboDb,
    recebidoDbm,
    sensibilidadeDbm: ambiente.modo.sensibilidadeDbm,
    folgaDb: recebidoDbm - ambiente.modo.sensibilidadeDbm,
  };
}

/** Veredito da seção 4.7. */
export function vereditoDoEnlace(folgaDb: number, zonaLivre: boolean): Veredito {
  if (folgaDb < 0) return 'nao-fecha';
  if (folgaDb >= FOLGA_COM_SOBRA_DB && zonaLivre) return 'folga';
  return 'limite';
}

/** A partir de quantos dB da parcela de terra lisa o texto do veredito comenta o caminho liso. */
const LIMITE_DA_FRASE_DE_CAMINHO_LISO_DB = 3;

function num(n: number, casas = 1): string {
  return n.toFixed(casas).replace('.', ',');
}

/** Descreve a zona de sinal: livre, ou o pior ponto (terreno que corta a linha, ou linha que passa perto demais). */
function descricaoDaZona(g: Geometria): string {
  if (g.zonaLivre || !g.piorPonto) return 'a zona de sinal está livre';
  const p = g.piorPonto;
  const onde = `o terreno a ${num(p.dKm)} km do começo`;
  if (p.folgaM < 0) return `${onde} corta a linha em ${Math.ceil(-p.folgaM)} m`;
  const precisa = Math.ceil(FRACAO_DE_FRESNEL * p.raioDeFresnelM);
  return `${onde} passa a ${Math.floor(p.folgaM)} m da linha, e o sinal precisa de ${precisa} m livres`;
}

function textoDoVeredito(veredito: Veredito, folgaDb: number, g: Geometria): string {
  const zona = descricaoDaZona(g);
  if (veredito === 'folga') {
    return `Fecha com folga: sobram ${num(folgaDb)} dB e ${zona}.`;
  }
  if (veredito === 'nao-fecha') {
    const falta = `faltam ${num(-folgaDb)} dB`;
    return g.zonaLivre ? `Não fecha: ${falta}, mesmo com a zona de sinal livre.` : `Não fecha: ${falta}, e ${zona}.`;
  }
  if (g.zonaLivre) {
    return `Fecha no limite: sobram só ${num(folgaDb)} dB, abaixo dos ${FOLGA_COM_SOBRA_DB} dB de margem para o sinal variar.`;
  }
  if (folgaDb >= FOLGA_COM_SOBRA_DB) {
    return `Fecha no limite: a conta dá ${num(folgaDb)} dB de folga, mas ${zona}. A conta pode estar otimista: teste em campo antes de comprar.`;
  }
  return `Fecha no limite: sobram ${num(folgaDb)} dB e ${zona}.`;
}

/**
 * Enlace completo entre dois rádios. Calcula os dois sentidos e vale o de menor folga
 * (rádios iguais dão o mesmo resultado em qualquer ordem).
 */
export function calcularEnlace(
  inicio: Radio,
  fim: Radio,
  perfil: Perfil,
  ambiente: Ambiente,
): ResultadoDoEnlace {
  const geometria = geometriaDoEnlace(perfil, inicio.alturaDaAntenaM, fim.alturaDaAntenaM, ambiente.frequenciaMHz);
  const difracao = difracaoCompleta(perfil, inicio.alturaDaAntenaM, fim.alturaDaAntenaM, ambiente.frequenciaMHz);
  const ida = contaDoEnlace(inicio, fim, geometria.distanciaKm, difracao.perdaDb, ambiente);
  const volta = contaDoEnlace(fim, inicio, geometria.distanciaKm, difracao.perdaDb, ambiente);
  const conta = volta.folgaDb < ida.folgaDb ? volta : ida;
  const veredito = vereditoDoEnlace(conta.folgaDb, geometria.zonaLivre);
  let texto = textoDoVeredito(veredito, conta.folgaDb, geometria);
  if (difracao.terraLisaDb >= LIMITE_DA_FRASE_DE_CAMINHO_LISO_DB) {
    texto += ` O caminho é liso (mar, baía ou planície) e a curva da Terra tira ${Math.round(difracao.terraLisaDb)} dB do sinal.`;
  }
  return { geometria, difracao, conta, veredito, texto };
}

const ALTURAS_DE_ANTENA_M = [6, 10, 15, 20];
const GANHOS_DE_ANTENA_DBI = [3, 6, 9];

/**
 * O que mudar para fechar (seção 4.8). Só para enlace que não fecha com folga; cada mudança é testada
 * sozinha e recalcula o enlace. Não repete mudança que não altera nada (altura igual ou menor que a atual,
 * ganho igual ou menor que o atual).
 *
 * Decisão sobre o modo: "o seguinte mais lento" é o próximo da tabela de `MODOS` com sensibilidade melhor
 * que a atual (a tabela não é monotônica: Medium Turbo é menos sensível que Short Slow). Só uma sugestão de modo.
 */
export function melhorias(
  inicio: Radio,
  fim: Radio,
  nomes: [string, string],
  perfil: Perfil,
  ambiente: Ambiente,
): Melhoria[] {
  const base = calcularEnlace(inicio, fim, perfil, ambiente);
  if (base.veredito === 'folga') return [];

  const lista: Melhoria[] = [];
  const registrar = (rotulo: string, novoInicio: Radio, novoFim: Radio, novoAmbiente: Ambiente) => {
    const r = calcularEnlace(novoInicio, novoFim, perfil, novoAmbiente);
    const antes = [...avisosDaRegra(inicio, ambiente.modo), ...avisosDaRegra(fim, ambiente.modo)];
    const depois = [...avisosDaRegra(novoInicio, novoAmbiente.modo), ...avisosDaRegra(novoFim, novoAmbiente.modo)];
    const novos = depois.filter((a) => !antes.includes(a));
    const melhoria: Melhoria = { rotulo, folgaDb: r.conta.folgaDb, veredito: r.veredito };
    if (novos.length > 0) melhoria.aviso = novos.join(' ');
    lista.push(melhoria);
  };

  const pontas: [Radio, string, number][] = [
    [inicio, nomes[0], 0],
    [fim, nomes[1], 1],
  ];
  const trocar = (indice: number, mudanca: Partial<Radio>): [Radio, Radio] =>
    indice === 0 ? [{ ...inicio, ...mudanca }, fim] : [inicio, { ...fim, ...mudanca }];

  for (const [radio, nome, i] of pontas) {
    for (const altura of ALTURAS_DE_ANTENA_M) {
      if (altura <= radio.alturaDaAntenaM) continue;
      const [a, b] = trocar(i, { alturaDaAntenaM: altura });
      registrar(`Subir a antena de ${nome} para ${altura} m`, a, b, ambiente);
    }
  }

  const atual = MODOS.findIndex((m) => m.id === ambiente.modo.id);
  if (atual >= 0) {
    const seguinte = MODOS.slice(atual + 1).find((m) => m.sensibilidadeDbm < ambiente.modo.sensibilidadeDbm);
    if (seguinte) registrar(`Trocar o modo para ${seguinte.nome}`, inicio, fim, { ...ambiente, modo: seguinte });
  }

  for (const [radio, nome, i] of pontas) {
    for (const ganho of GANHOS_DE_ANTENA_DBI) {
      if (ganho <= radio.ganhoDbi) continue;
      const [a, b] = trocar(i, { ganhoDbi: ganho });
      registrar(`Usar antena de ${ganho} dBi em ${nome}`, a, b, ambiente);
    }
  }

  return lista;
}
