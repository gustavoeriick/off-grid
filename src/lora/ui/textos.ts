// Textos e formatação dos painéis de LoRa: funções puras, sem DOM, para poderem ser testadas.
// Nenhum número de rádio nasce aqui: tudo vem do núcleo, do estado e do cálculo.

import type { ContaDoEnlace, Geometria, Veredito } from '../nucleo/tipos';

const MENOS = '−';

/** Número com vírgula decimal e separador de milhar, como se escreve no Brasil. */
export function numeroBr(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** `n` com sinal explícito: "+3,5" ou "−3,5" (sinal de menos de verdade). Zero, depois de arredondar, fica sem sinal. */
export function comSinal(n: number, casas = 1): string {
  const texto = numeroBr(Math.abs(n), casas);
  const zero = Number(Math.abs(n).toFixed(casas)) === 0;
  if (zero) return texto;
  return `${n < 0 ? MENOS : '+'}${texto}`;
}

/** Número que pode ser negativo, com o sinal de menos de verdade: "−95,3". */
export function comMenos(n: number, casas = 1): string {
  const zero = Number(Math.abs(n).toFixed(casas)) === 0;
  return `${n < 0 && !zero ? MENOS : ''}${numeroBr(Math.abs(n), casas)}`;
}

/** Valor em dB com sinal: "+3,5 dB". */
export const dbComSinal = (n: number, casas = 1): string => `${comSinal(n, casas)} dB`;

/** Valor em dB sem sinal obrigatório: "12,0 dB". */
export const dbTexto = (n: number, casas = 1): string => `${comMenos(n, casas)} dB`;

/** Valor em dBm: "−95,3 dBm". */
export const dbmTexto = (n: number, casas = 1): string => `${comMenos(n, casas)} dBm`;

/** Distância: metros abaixo de 1 km, quilômetros acima. */
export function distanciaTexto(km: number): string {
  return km < 1 ? `${numeroBr(km * 1000, 0)} m` : `${numeroBr(km, km < 10 ? 2 : 1)} km`;
}

/** Corta o número entre o mínimo e o máximo. Valor que não é número vira o mínimo. */
export function cortar(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Lê o que a pessoa digitou em um campo numérico, com vírgula ou ponto decimal.
 * Devolve nulo se o texto está vazio ou não é número.
 */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (limpo === '' || !/^[-+]?\d*\.?\d+$|^[-+]?\d+\.$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export const VEREDITO_PALAVRAS: Record<Veredito, string> = {
  folga: 'fecha com folga',
  limite: 'fecha no limite',
  'nao-fecha': 'não fecha',
};

/** Veredito em palavras, no meio de uma frase: "fecha com folga". */
export const textoDoVeredito = (v: Veredito): string => VEREDITO_PALAVRAS[v];

/** Veredito com a primeira letra maiúscula, para destaque: "Fecha com folga". */
export function vereditoEmDestaque(v: Veredito): string {
  const t = VEREDITO_PALAVRAS[v];
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** O que cada veredito quer dizer, em uma frase para quem está começando. */
export const EXPLICACAO_DO_VEREDITO: Record<Veredito, string> = {
  folga: 'O sinal chega com 10 dB ou mais acima do mínimo e o caminho está livre: sobra reserva para o sinal variar. Prédios e árvores não entram na conta.',
  limite: 'O sinal chega acima do mínimo, mas sem grande sobra: pode falhar quando o sinal variar ou surgir um obstáculo novo.',
  'nao-fecha': 'O sinal chega abaixo do mínimo que o rádio consegue entender.',
};

export interface LinhaDaConta {
  rotulo: string;
  /** Valor já com sinal e unidade, pronto para a tela. */
  valor: string;
  explicacao: string;
  /** 'soma' e 'perda' entram na conta; 'total' são as linhas de resultado. */
  tipo: 'soma' | 'perda' | 'total';
}

/** A conta do enlace linha a linha, com o sinal de cada parcela. `sentido` diz quem transmite e quem recebe. */
export function linhasDaConta(c: ContaDoEnlace, quemTransmite = 'quem transmite', quemRecebe = 'quem recebe'): LinhaDaConta[] {
  const soma = (rotulo: string, db: number, explicacao: string, un = 'dB'): LinhaDaConta => ({ rotulo, valor: `${comSinal(db)} ${un}`, explicacao, tipo: 'soma' });
  const perda = (rotulo: string, db: number, explicacao: string): LinhaDaConta => ({ rotulo, valor: `${comSinal(-db)} dB`, explicacao, tipo: 'perda' });
  return [
    soma(`Potência de ${quemTransmite}`, c.potenciaDbm, 'dBm é a unidade de potência do rádio: 0 dBm é 1 milésimo de watt e cada 3 dBm a mais dobra a potência.', 'dBm'),
    soma('Ganho da antena de quem transmite', c.ganhoTxDbi, 'dBi mede o quanto a antena concentra o sinal na direção certa, em comparação com uma antena ideal que irradia igual para todo lado.'),
    perda('Perda no cabo de quem transmite', c.caboTxDb, 'O que se perde no cabo entre o rádio e a antena.'),
    perda('Perda no ar livre', c.arLivreDb, 'O sinal se espalha e enfraquece com a distância, mesmo sem obstáculo. Cresce com a distância e com a frequência.'),
    perda('Perda no relevo', c.difracaoDb, 'O que morros e a curva da Terra tiram do sinal quando ficam no caminho (difração: o sinal contorna o obstáculo e perde força).'),
    perda('Margem do ambiente', c.margemDoAmbienteDb, 'O que o relevo não mostra: prédios, árvores e paredes. É um valor que você escolhe na configuração da rede.'),
    soma(`Ganho da antena de ${quemRecebe}`, c.ganhoRxDbi, 'A antena de quem recebe também concentra o sinal que chega.'),
    perda('Perda no cabo de quem recebe', c.caboRxDb, 'O que se perde no cabo entre a antena e o rádio de quem recebe.'),
    { rotulo: 'Chega ao receptor', valor: dbmTexto(c.recebidoDbm), explicacao: 'A soma de tudo acima: a potência do sinal quando entra no rádio de quem recebe.', tipo: 'total' },
    { rotulo: 'O rádio precisa de', valor: dbmTexto(c.sensibilidadeDbm), explicacao: 'Sensibilidade: o sinal mais fraco que o rádio, neste modo, ainda consegue entender.', tipo: 'total' },
    { rotulo: 'Folga', valor: dbComSinal(c.folgaDb), explicacao: 'O quanto o sinal que chega passa do mínimo. Abaixo de zero, o rádio não entende a mensagem.', tipo: 'total' },
  ];
}

/** Frase sobre a zona de Fresnel. */
export function textoDaZona(g: Geometria): string {
  if (g.zonaLivre) return 'A zona de Fresnel está livre (pelo menos 60% dela, em todo o caminho).';
  const p = g.piorPonto;
  if (!p) return 'A zona de Fresnel não está livre.';
  const ideal = 0.6 * p.raioDeFresnelM;
  const posicao = p.folgaM < 0 ? `o terreno passa ${numeroBr(-p.folgaM, 1)} m acima da linha` : `a linha passa ${numeroBr(p.folgaM, 1)} m acima do terreno`;
  return `A zona de Fresnel não está livre. O pior ponto fica a ${distanciaTexto(p.dKm)} do começo: ${posicao}, e o ideal seria ${numeroBr(ideal, 1)} m de folga.`;
}

/** Resumo de um enlace para a lista da rede: "fecha com folga, 20,3 km, folga +12,4 dB". */
export function resumoDoEnlace(
  situacao: { estado: 'calculando' } | { estado: 'erro'; mensagem: string } | { estado: 'pronto'; veredito: Veredito; distanciaKm: number; folgaDb: number } | null,
): { veredito: string; detalhe: string; classe: Veredito | 'calculando' | 'erro' } {
  if (!situacao || situacao.estado === 'calculando') return { veredito: 'calculando…', detalhe: '', classe: 'calculando' };
  if (situacao.estado === 'erro') return { veredito: 'sem resultado', detalhe: situacao.mensagem, classe: 'erro' };
  return {
    veredito: textoDoVeredito(situacao.veredito),
    detalhe: `${distanciaTexto(situacao.distanciaKm)}, folga ${dbComSinal(situacao.folgaDb)}`,
    classe: situacao.veredito,
  };
}

/** Aviso fixo da especificação, seção 7. */
export const AVISO_FIXO =
  'O simulador considera o relevo, não prédios nem árvores. Na cidade, o resultado real costuma ser pior. Teste em campo antes de comprar e instalar.';

export const TEXTO_MARGEM_DO_AMBIENTE =
  'É o que o relevo não mostra: prédios, árvores e paredes. O simulador não sugere um número; escolha com base no que existe entre os pontos.';

export const TEXTO_DO_MODO =
  'O modo do rádio troca velocidade por alcance: modo mais lento (taxa menor) entende sinais mais fracos e por isso alcança mais longe, mas demora mais para mandar cada mensagem.';

export const TEXTO_DE_SALTOS =
  'Um salto é uma repetição da mensagem por outro rádio da rede. Quanto mais saltos, mais longe a mensagem vai, mas mais ocupa o ar.';

export const TEXTO_SEM_PONTOS =
  "Use 'Novo ponto' na barra do mapa e clique no lugar da primeira casa. Depois marque o segundo ponto e use 'Ligar dois pontos' para ver se o rádio fecha o enlace entre eles (enlace é a ligação de rádio entre dois pontos).";

export const GLOSSARIO = {
  enlace: 'Enlace: a ligação de rádio entre dois pontos.',
  altura: 'Altura da antena acima do terreno. Antena mais alta enxerga mais longe e passa por cima de obstáculos.',
  potencia: 'Potência do rádio, em dBm (decibel-miliwatt). 22 dBm são cerca de 160 milésimos de watt. A regra da Anatel limita o máximo.',
  ganho: 'Ganho da antena, em dBi: o quanto ela concentra o sinal na direção certa. Antena maior costuma ter ganho maior.',
  cabo: 'Perda no cabo, em dB (decibel): o que o cabo entre o rádio e a antena consome do sinal. Cabo longo ou fino perde mais.',
  altitude: 'Altitude do terreno acima do nível do mar, lida do mapa de relevo no lugar do ponto.',
  repetidor: 'Repetidor: um rádio igual aos outros, posto por você em um lugar alto, que recebe a mensagem inteira e a transmite de novo, para chegar onde o sinal direto não chega. Ele não amplifica o sinal.',
  fresnel: 'Zona de Fresnel: um espaço em forma de charuto em volta da linha reta entre as antenas. Se algo entra nela, o sinal enfraquece mesmo sem tapar a linha.',
  folga: 'Folga: o quanto o sinal que chega passa do mínimo que o rádio entende, em dB. Quanto maior, mais seguro.',
  sensibilidade: 'Sensibilidade: o sinal mais fraco, em dBm, que o rádio ainda consegue entender neste modo.',
} as const;

// ---------------------------------------------------------------- Rotas e repetidores (fase L3, especificação 4.9)

/** O que é rota e o que é salto, para quem está começando. */
export const TEXTO_DE_ROTA =
  'Rota é o caminho que a mensagem faz de uma casa à outra, passando de rádio em rádio. Cada rádio no meio do caminho, que recebe a mensagem e a transmite de novo, conta um salto. A rota vale o que vale o trecho mais fraco dela.';

/** Cada linha do mapa é uma ligação direta: o simulador não põe rádio nenhum no meio. */
export const TEXTO_DA_LINHA = 'Cada linha do mapa é uma ligação direta entre dois rádios, sem nada no meio. O simulador não imagina antena no caminho: repetidor só existe onde você puser um.';

/** O que é e o que não é um repetidor, em frases curtas. */
export const TEXTO_DO_REPETIDOR: readonly string[] = [
  'É um rádio igual aos outros, que você põe em um lugar alto.',
  'Ele não amplifica o sinal: recebe a mensagem inteira e transmite de novo.',
  'Só serve se fechar enlace com os dois lados: precisa "enxergar" o rádio de cada ponta, ou outro repetidor.',
];

export const TEXTO_SEM_LIGACAO = "Não há ligação desenhada entre estas casas. Use 'Ligar dois pontos' ou 'Sugerir ponto de repetidor'.";

export const TEXTO_DA_BUSCA = 'Baixando o relevo da região e procurando lugares altos…';

export const AVISO_DA_SUGESTAO =
  'A sugestão só olha o relevo: procura terreno alto com boa ligação para os dois lados. Não sabe se o lugar tem acesso, dono, energia ou autorização.';

/** Quantos rádios ficam entre as duas pontas de uma rota, em palavras. */
export function radiosNoMeio(n: number): string {
  if (n <= 0) return 'ligação direta, sem rádio no meio';
  return n === 1 ? '1 rádio no meio' : `${n} rádios no meio`;
}

/** O caminho de uma rota pelos nomes: "Minha casa → Repetidor 1 → Casa dos pais". */
export const caminhoDaRota = (nomes: string[]): string => nomes.join(' → ');

/** O que a tela precisa saber de uma rota; é a parte de `ResultadoDaRota` (núcleo) que vira texto. */
export type RotaParaTexto =
  | { rota: { pontos: string[]; maisFraco: { de: string; para: string }; folgaDb: number; veredito: Veredito; pontosNoMeio: number } }
  | { rota: null; motivo: 'sem-ligacao' }
  | { rota: null; motivo: 'limite'; pontosNoMeio: number };

export interface ResumoDaRota {
  /** Palavras do selo: o veredito, "calculando…", "sem ligação" ou "passa do limite de saltos". */
  veredito: string;
  classe: Veredito | 'calculando' | 'erro';
  /** O caminho pelos nomes; vazio quando não há rota. */
  caminho: string;
  /** A frase que explica: o trecho mais fraco e os rádios no meio, ou por que não há rota. */
  detalhe: string;
}

/**
 * Resumo da rota entre duas casas para a lista da rede. `resultado` nulo quer dizer que ainda há enlace sendo calculado.
 * `nome` devolve o nome de um ponto pelo `id`; `limiteDeSaltos` é o do projeto.
 */
export function resumoDaRota(resultado: RotaParaTexto | null, nome: (id: string) => string, limiteDeSaltos: number): ResumoDaRota {
  if (resultado === null) return { veredito: 'calculando…', classe: 'calculando', caminho: '', detalhe: 'Esperando o cálculo dos enlaces.' };
  if (resultado.rota === null) {
    if (resultado.motivo === 'sem-ligacao') return { veredito: 'sem ligação', classe: 'erro', caminho: '', detalhe: TEXTO_SEM_LIGACAO };
    return {
      veredito: 'passa do limite de saltos',
      classe: 'erro',
      caminho: '',
      detalhe: `Há caminho desenhado, mas ele precisa de ${radiosNoMeio(resultado.pontosNoMeio)} e o limite de saltos deste projeto é ${limiteDeSaltos}. A mensagem pararia antes de chegar. O limite muda em "Configuração da rede", aqui embaixo.`,
    };
  }
  const r = resultado.rota;
  const fraco = `${nome(r.maisFraco.de)} ↔ ${nome(r.maisFraco.para)}`;
  const direta = r.pontosNoMeio === 0;
  let detalhe: string;
  if (r.veredito === 'nao-fecha') {
    detalhe = direta
      ? `A ligação direta não fecha: folga ${dbComSinal(r.folgaDb)}.`
      : `O trecho ${fraco} derruba a rota: folga ${dbComSinal(r.folgaDb)}. Passa por ${radiosNoMeio(r.pontosNoMeio)}.`;
  } else {
    detalhe = direta ? `Ligação direta, sem rádio no meio. Folga ${dbComSinal(r.folgaDb)}.` : `Passa por ${radiosNoMeio(r.pontosNoMeio)}. Trecho mais fraco: ${fraco}, folga ${dbComSinal(r.folgaDb)}.`;
  }
  return { veredito: textoDoVeredito(r.veredito), classe: r.veredito, caminho: caminhoDaRota(r.pontos.map(nome)), detalhe };
}

/** Um trecho de uma sugestão de repetidor: "Minha casa ↔ repetidor: 15,9 km, folga +21,3 dB". */
export function trechoDaSugestaoTexto(ponta: string, t: { distanciaKm: number; folgaDb: number }): string {
  return `${ponta} ↔ repetidor: ${distanciaTexto(t.distanciaKm)}, folga ${dbComSinal(t.folgaDb)}`;
}

/**
 * Texto para quando nenhuma sugestão fecha os dois trechos. `melhor` é a primeira da lista; `nomeA` e `nomeB` são as pontas.
 * Devolve nulo quando alguma sugestão fecha (o chamador confere antes) ou a lista está vazia.
 */
export function textoSemSugestaoQueFecha(melhor: { trechoA: { veredito: Veredito }; trechoB: { veredito: Veredito } } | undefined, nomeA: string, nomeB: string): string | null {
  if (!melhor) return null;
  const faltaA = melhor.trechoA.veredito === 'nao-fecha';
  const faltaB = melhor.trechoB.veredito === 'nao-fecha';
  if (!faltaA && !faltaB) return null;
  const inicio = 'Um repetidor só não resolve: em nenhum destes lugares os dois trechos fecham. Abaixo estão os melhores que o relevo oferece.';
  if (faltaA && faltaB) return `${inicio} Nem o melhor fecha com alguma das pontas; vale tentar antena mais alta ou um modo mais lento antes de pensar em dois repetidores.`;
  const semLigacao = faltaA ? nomeA : nomeB;
  return `${inicio} Uma saída é pôr um repetidor no lugar 1 e repetir a busca entre ele e ${semLigacao}, a ponta que ficou sem ligação.`;
}
