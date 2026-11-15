// Tutorial "Meu primeiro enlace" do ambiente de LoRa. Tarefas L4.1 e L4.2 (parte de texto).
// Só dados e funções puras: nada de DOM. Segue o formato do `Roteiro` do solar (src/conteudo/roteiros.ts), adaptado.
//
// Como a tela usa:
// - O passo da vez é o primeiro que não está feito (`indiceDoPassoAtual`).
// - Passo de leitura tem `acao: 'continuar'`: a tela mostra o botão "Continuar", e o clique põe o `id` do passo em `vistos`.
// - Passo feito uma vez continua feito: depois de cada mudança, a tela acrescenta a `vistos` os ids de `idsFeitos(...)`.
//   Sem isso, um passo que depende da seleção (selecionar o enlace) voltaria a ficar pendente quando a pessoa
//   clicasse em outro lugar. Todo `feito` olha `vistos` primeiro.
// - Texto que depende do resultado (o enlace fecha ou não fecha) é uma função do projeto e do contexto;
//   `textoDoPasso` resolve as duas formas. Decisão: função em vez de campos `seFecha` e `seNaoFecha`,
//   porque há quatro situações a cobrir (fecha com folga, no limite, não fecha, ainda calculando) e, na rota, seis.
//
// Os pontos do tutorial são lugares quaisquer: o texto não pede para marcar a casa de ninguém.

import type { SelecaoLora } from '../estado';
import type { PontoLora, ProjetoLora, Veredito } from '../nucleo/tipos';

/** Situação da rota entre dois pontos, já resumida pela tela. */
export type SituacaoDaRota = 'fecha' | 'limite' | 'nao-fecha' | 'sem-ligacao' | 'passa-do-limite' | 'calculando';

/** O que o tutorial precisa saber e não está no projeto. */
export interface ContextoDoPasso {
  selecao: SelecaoLora;
  /** Veredito do enlace entre dois pontos; nulo se não há enlace entre eles. */
  vereditoDe(de: string, para: string): Veredito | 'calculando' | 'erro' | null;
  rota(de: string, para: string): SituacaoDaRota;
  /** Ids de passos marcados com "Continuar", ou que já ficaram feitos uma vez. */
  vistos: ReadonlySet<string>;
}

export type TextoDoPasso = string | ((projeto: ProjetoLora, contexto: ContextoDoPasso) => string);

export interface PassoLora {
  id: string;
  titulo: string;
  /** O que fazer e por quê, em 2 a 4 frases. Pode depender do resultado: veja `textoDoPasso`. */
  texto: TextoDoPasso;
  dica?: string;
  feito: (projeto: ProjetoLora, contexto: ContextoDoPasso) => boolean;
  /** Passo de leitura: a tela mostra "Continuar", e o passo fica feito quando o id entra em `vistos`. */
  acao?: 'continuar';
}

export interface RoteiroLora {
  id: string;
  titulo: string;
  paraQuem: string;
  passos: PassoLora[];
}

// ---------------------------------------------------------------- Auxiliares

/**
 * Altura da antena de um ponto novo, em m. É o `PONTO_PADRAO.alturaDaAntenaM` de src/lora/estado.ts
 * (especificação, seção 6), repetido aqui para não carregar o estado, que mexe no armazenamento do navegador.
 */
export const ALTURA_PADRAO_DA_ANTENA_M = 6;

const vizinhos = (projeto: ProjetoLora, id: string): string[] => {
  const ids = new Set<string>();
  for (const e of projeto.enlaces) {
    if (e.de === id && e.para !== id) ids.add(e.para);
    if (e.para === id && e.de !== id) ids.add(e.de);
  }
  return [...ids];
};

/** Primeiro repetidor ligado a pelo menos dois outros pontos, com as duas pontas. */
export function repetidorLigado(projeto: ProjetoLora): { repetidor: PontoLora; pontas: [string, string] } | null {
  for (const p of projeto.pontos) {
    if (p.tipo !== 'repetidor') continue;
    const v = vizinhos(projeto, p.id).filter((id) => projeto.pontos.some((x) => x.id === id));
    if (v.length >= 2) return { repetidor: p, pontas: [v[0]!, v[1]!] };
  }
  return null;
}

/** O enlace de que o texto fala: o selecionado, se há; senão o primeiro do projeto. */
export function enlaceEmFoco(projeto: ProjetoLora, contexto: ContextoDoPasso): { de: string; para: string } | null {
  const s = contexto.selecao;
  if (s?.tipo === 'enlace') return { de: s.de, para: s.para };
  return projeto.enlaces[0] ?? null;
}

function vereditoEmFoco(projeto: ProjetoLora, contexto: ContextoDoPasso): Veredito | 'calculando' | 'erro' | null {
  const e = enlaceEmFoco(projeto, contexto);
  return e ? contexto.vereditoDe(e.de, e.para) : null;
}

const ehVeredito = (v: unknown): v is Veredito => v === 'folga' || v === 'limite' || v === 'nao-fecha';

/** Passo de leitura: feito quando a pessoa clicou em "Continuar". */
const lido =
  (id: string) =>
  (_projeto: ProjetoLora, contexto: ContextoDoPasso): boolean =>
    contexto.vistos.has(id);

/** Condição de um passo de ação, que continua valendo depois de cumprida uma vez. */
const quando =
  (id: string, condicao: (projeto: ProjetoLora, contexto: ContextoDoPasso) => boolean) =>
  (projeto: ProjetoLora, contexto: ContextoDoPasso): boolean =>
    contexto.vistos.has(id) || condicao(projeto, contexto);

// ---------------------------------------------------------------- Textos que dependem do resultado

function textoDoVereditoLido(projeto: ProjetoLora, contexto: ContextoDoPasso): string {
  const v = vereditoEmFoco(projeto, contexto);
  const comeco = 'No alto do painel do enlace está o veredito, com o motivo; abaixo, a conta linha a linha, da potência do rádio até a folga.';
  if (v === 'folga') {
    return `${comeco} O seu deu "fecha com folga": sobram 10 dB ou mais acima do mínimo que o rádio entende, e o caminho está livre. É um bom sinal, mas a conta só enxerga o relevo; nos próximos passos você vê até onde ela aguenta.`;
  }
  if (v === 'limite') {
    return `${comeco} O seu deu "fecha no limite": a conta passa, mas sem os 10 dB de sobra ou com o caminho raspando no terreno. Um enlace assim pode funcionar em um dia e falhar em outro; o corte do terreno, no próximo passo, mostra onde está o aperto.`;
  }
  if (v === 'nao-fecha') {
    return `${comeco} O seu deu "não fecha": o sinal chega abaixo do mínimo que o rádio entende. Quase nunca falta potência; o que derruba é o que está no caminho, e o corte do terreno, no próximo passo, mostra o quê.`;
  }
  return `${comeco} Se ele ainda diz "calculando", espere o relevo do caminho terminar de baixar. Os três vereditos são "fecha com folga", "fecha no limite" e "não fecha".`;
}

function textoDoQueMudar(projeto: ProjetoLora, contexto: ContextoDoPasso): string {
  const v = vereditoEmFoco(projeto, contexto);
  const margem =
    'Em "Configuração da rede" fica a margem do ambiente: um desconto que você escolhe, de 0 a 40 dB, para prédios, árvores e paredes, que o simulador não enxerga.';
  if (v === 'folga') {
    return `Enlace que fecha com folga não mostra a lista "o que mudar para fechar". ${margem} Aumente a margem aos poucos e veja em quantos dB o seu enlace deixa de fechar: essa é a reserva dele para o que o mapa não mostra.`;
  }
  return `A lista "o que mudar para fechar" mostra, uma mudança por vez, a folga e o veredito novos: subir a antena, antena de mais ganho e modo mais lento. Cada uma tem custo: mastro e cabo mais longo, antena que concentra o sinal em menos direções, mensagem mais lenta. ${margem}`;
}

function textoDoRepetidor(projeto: ProjetoLora, contexto: ContextoDoPasso): string {
  const v = vereditoEmFoco(projeto, contexto);
  const como =
    "Use 'Sugerir ponto de repetidor': o simulador procura lugares altos com boa ligação para as duas pontas e mostra até 5; em um deles, clique em 'Pôr um repetidor aqui'. Também dá para usar 'Novo repetidor' e ligar o repetidor às duas pontas com 'Ligar dois pontos'.";
  const abertura =
    v === 'folga'
      ? 'O seu enlace já fecha direto, mas vale ver como um repetidor funciona: é ele que resolve quando um morro fica no meio.'
      : 'Quando o caminho direto não fecha com folga, a saída costuma ser um repetidor: um rádio em lugar alto que enxerga as duas pontas.';
  return `${abertura} ${como} O repetidor não amplifica: recebe a mensagem inteira e transmite de novo, e por isso cada trecho precisa fechar sozinho.`;
}

function textoDaRota(projeto: ProjetoLora, contexto: ContextoDoPasso): string {
  const comeco =
    'Na lista "Rotas entre as casas" aparece o caminho que a mensagem faz de rádio em rádio. A rota vale o que vale o trecho mais fraco, e cada rádio no meio conta um salto: o Meshtastic aceita 3 por padrão e 7 no máximo.';
  const r = repetidorLigado(projeto);
  const situacao = r ? contexto.rota(r.pontas[0], r.pontas[1]) : 'sem-ligacao';
  switch (situacao) {
    case 'fecha':
      return `${comeco} A sua rota fecha com folga: cada trecho tem sobra. É o resultado a levar para o teste de campo.`;
    case 'limite':
      return `${comeco} A sua rota fecha no limite: algum trecho tem pouca sobra ou passa raspando no terreno. Veja no painel qual é o trecho mais fraco; é nele que vale mexer.`;
    case 'nao-fecha':
      return `${comeco} A sua rota não fecha: algum trecho derruba a mensagem. Abra o trecho mais fraco e veja o corte dele; pode ser preciso outro lugar para o repetidor, ou dois repetidores.`;
    case 'passa-do-limite':
      return `${comeco} A sua rota passa do limite de saltos: a mensagem pararia antes de chegar. O limite muda em "Configuração da rede".`;
    case 'calculando':
      return `${comeco} A sua rota ainda está sendo calculada; espere o relevo dos trechos terminar de baixar.`;
    case 'sem-ligacao':
      return `${comeco} Se a sua rota não aparece, confira se as duas pontas são do tipo casa e se as duas estão ligadas ao repetidor.`;
  }
}

// ---------------------------------------------------------------- O roteiro

export const TUTORIAL_LORA: RoteiroLora = {
  id: 'meu-primeiro-enlace',
  titulo: 'Meu primeiro enlace',
  paraQuem: 'Para quem nunca mexeu com rádio: você marca dois pontos quaisquer, lê a conta e vê o que um repetidor muda.',
  passos: [
    {
      id: 'o-que-e',
      titulo: 'O que é LoRa e o que este ambiente faz',
      texto:
        'LoRa é um rádio de longo alcance e baixo consumo: manda mensagens de texto curtas e posição, não voz nem internet. Ele alcança longe porque troca velocidade por alcance. Aqui você marca pontos no mapa, liga dois deles e o simulador diz se o rádio de um alcança o do outro, levando em conta o relevo do caminho.',
      dica: 'Cada termo de rádio é explicado na primeira vez em que aparece.',
      feito: lido('o-que-e'),
      acao: 'continuar',
    },
    {
      id: 'primeiro-ponto',
      titulo: 'Marque o primeiro ponto',
      texto:
        "Clique em 'Novo ponto' e depois em qualquer lugar do mapa. Escolha um lugar qualquer, não precisa ser a sua casa: agora o objetivo é aprender a ler a conta. Os pontos ficam só no seu navegador; o serviço que desenha o mapa de fundo fica sabendo a área que aparece na tela.",
      dica: 'Cada ponto é um rádio. Ele começa com antena a 6 m do chão, mais ou menos a altura do telhado de um sobrado.',
      feito: quando('primeiro-ponto', (p) => p.pontos.length >= 1),
    },
    {
      id: 'segundo-ponto',
      titulo: 'Marque um segundo ponto, a alguns quilômetros',
      texto:
        "Use 'Novo ponto' de novo e marque outro lugar a alguns quilômetros do primeiro, de preferência com um morro no meio ou do outro lado de uma baía. Assim a conta tem o que mostrar. Para ter uma ideia, relatos de uso real, de fóruns e guias, falam em 1 a 3 km na cidade sem visada e em 10 a 20 km com visada e antena comum.",
      dica: 'Visada quer dizer que uma antena "enxerga" a outra, sem nada no meio da linha reta.',
      feito: quando('segundo-ponto', (p) => p.pontos.length >= 2),
    },
    {
      id: 'ligar',
      titulo: 'Ligue os dois pontos',
      texto:
        "Clique em 'Ligar dois pontos' e depois nos dois pontos. A linha que aparece é um enlace: a ligação de rádio direta entre eles, sem nada no meio. O simulador baixa o relevo do caminho e faz a conta; a cor da linha e o texto ao lado dizem o resultado.",
      dica: 'Com só dois pontos no projeto, a barra do mapa mostra um botão que liga os dois de uma vez.',
      feito: quando('ligar', (p) => p.enlaces.length >= 1),
    },
    {
      id: 'selecionar-enlace',
      titulo: 'Abra o enlace',
      texto:
        'Clique na linha do enlace, ou no rótulo dela, para abrir o painel do enlace. Espere sair o "calculando": o relevo é baixado em blocos de uns 18 km de lado, que só revelam a região, nunca os pontos.',
      feito: quando('selecionar-enlace', (_p, c) => {
        const s = c.selecao;
        return s?.tipo === 'enlace' && ehVeredito(c.vereditoDe(s.de, s.para));
      }),
    },
    {
      id: 'ler-veredito',
      titulo: 'Leia o veredito',
      texto: textoDoVereditoLido,
      dica: 'Folga é o quanto o sinal que chega passa do mínimo que o rádio entende, em dB. Cada 3 dB dobram o sinal; 10 dB multiplicam por dez.',
      feito: lido('ler-veredito'),
      acao: 'continuar',
    },
    {
      id: 'ler-corte',
      titulo: 'Leia o corte do terreno',
      texto:
        'O corte é o chão visto de lado, de uma antena à outra: a parte cheia é o terreno, já com a curva da Terra somada, e a reta é a linha entre as duas antenas. Em volta da linha fica a zona de sinal (zona de Fresnel): o sinal ocupa esse espaço em forma de charuto, e a faixa mais escura, de 60%, precisa ficar livre. O pior ponto fica marcado, e passar o ponteiro mostra a folga em metros em cada lugar.',
      dica: 'Em terreno plano, para a zona ficar livre, as duas antenas precisariam de uns 30 m em 20 km e uns 58 m em 40 km.',
      feito: lido('ler-corte'),
      acao: 'continuar',
    },
    {
      id: 'mudar-altura',
      titulo: 'Mude a altura de uma antena',
      texto:
        'Clique em um dos pontos e mude a altura da antena, por exemplo de 6 m para 15 m. Depois volte ao enlace: a linha sobe no corte, a folga muda e, às vezes, o veredito também. Antena mais alta tira o terreno do caminho do sinal, e por isso costuma ser a mudança que mais rende.',
      dica: 'No mundo real, altura pede mastro e trabalho em altura, e cabo de antena mais longo, que perde parte do sinal.',
      feito: quando('mudar-altura', (p) => p.pontos.some((x) => x.alturaDaAntenaM !== ALTURA_PADRAO_DA_ANTENA_M)),
    },
    {
      id: 'o-que-mudar',
      titulo: 'O que mudar para fechar, e o que o mapa não vê',
      texto: textoDoQueMudar,
      dica: 'O simulador não sugere um valor para a margem do ambiente: só o teste de campo diz quanto os prédios e as árvores tiram.',
      feito: lido('o-que-mudar'),
      acao: 'continuar',
    },
    {
      id: 'repetidor',
      titulo: 'Ponha um repetidor',
      texto: textoDoRepetidor,
      dica: 'A sugestão só olha o relevo. Ela não sabe se o lugar tem dono, acesso, energia ou autorização.',
      feito: quando('repetidor', (p) => repetidorLigado(p) !== null),
    },
    {
      id: 'ler-rota',
      titulo: 'Leia a rota',
      texto: textoDaRota,
      feito: lido('ler-rota'),
      acao: 'continuar',
    },
    {
      id: 'repetidor-solar',
      titulo: 'O repetidor solar',
      texto:
        'Um repetidor em lugar alto costuma ficar longe de tomada. Clique no repetidor: o painel dele mostra o mínimo de placa solar e de bateria para ele ficar ligado dia e noite, com a mesma conta do simulador solar. O resultado é uma faixa, porque o consumo do rádio, de 5 a 40 mA, é uma estimativa de um guia de montagem, sem medição publicada.',
      dica: 'Com o rádio na mão, meça o consumo e ponha o seu número no painel.',
      feito: lido('repetidor-solar'),
      acao: 'continuar',
    },
    {
      id: 'proximos-passos',
      titulo: 'Próximos passos, fora do simulador',
      texto:
        'O simulador prevê o relevo, não a cidade, e não substitui o teste de campo. Antes de comprar o resto, compre dois rádios homologados pela Anatel e teste com um em cada ponta, ou um no lugar do repetidor, antes de instalar qualquer coisa em telhado ou morro. Para o repetidor, o simulador acha o ponto, mas conseguir o lugar é outra história: dono, autorização e acesso para manutenção.',
      dica: 'Nunca ligue o rádio sem a antena conectada: pode queimar o transmissor. Em telhado ou morro, vá acompanhado, fique longe da rede elétrica e não suba com tempestade à vista.',
      feito: lido('proximos-passos'),
      acao: 'continuar',
    },
  ],
};

// ---------------------------------------------------------------- Funções da tela

/** O texto do passo, já resolvido para o projeto e o contexto. */
export function textoDoPasso(passo: PassoLora, projeto: ProjetoLora, contexto: ContextoDoPasso): string {
  return typeof passo.texto === 'function' ? passo.texto(projeto, contexto) : passo.texto;
}

/** Quais passos estão feitos, na ordem. */
export function passosFeitos(projeto: ProjetoLora, contexto: ContextoDoPasso, roteiro: RoteiroLora = TUTORIAL_LORA): boolean[] {
  return roteiro.passos.map((p) => p.feito(projeto, contexto));
}

/** Índice do primeiro passo que não está feito; −1 quando todos estão. */
export function indiceDoPassoAtual(projeto: ProjetoLora, contexto: ContextoDoPasso, roteiro: RoteiroLora = TUTORIAL_LORA): number {
  return passosFeitos(projeto, contexto, roteiro).indexOf(false);
}

/** Ids dos passos feitos agora, para a tela acrescentar a `vistos` e o passo não voltar a ficar pendente. */
export function idsFeitos(projeto: ProjetoLora, contexto: ContextoDoPasso, roteiro: RoteiroLora = TUTORIAL_LORA): string[] {
  return roteiro.passos.filter((p) => p.feito(projeto, contexto)).map((p) => p.id);
}
