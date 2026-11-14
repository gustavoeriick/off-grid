// Sugestões sobre a montagem. Especificação: docs/especificacao/consultor.md. Tarefa 1.7.

import type {
  Aparelho, Bateria, Catalogo, Inversor, Item, Placa, Protecao, TipoCabo, TipoProtecao,
} from '../catalogo/tipos';
import { correntesDeProjeto, quedasDeTensao } from './cabos';
import { infoBanco, vmpQuente, vocFrio } from './eletrica';
import type {
  Acao, AnaliseCircuito, Cabo, Circuito, CodigoProblema, Estimativas, InfoBanco, Nivel, PlanoMaisPlaca, Projeto,
  QuedaDeTensao, Sistema, Sugestao,
} from './tipos';

// ---------------------------------------------------------------- Formatação

/** Número com vírgula decimal e ponto de milhar. */
function num(x: number, casas: number): string {
  const s = Math.abs(x).toFixed(casas);
  const [inteiro, fracao] = s.split('.');
  const sinal = x < 0 && Number(s) !== 0 ? '-' : '';
  return sinal + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fracao ? `,${fracao}` : '');
}
/** Potência e porcentagem: sem casas. */
const inteiro = (x: number): string => num(x, 0);
/** Tensão, corrente e seção: uma casa, sem o ",0" quando o valor é redondo. */
const um = (x: number): string => num(x, 1).replace(/,0$/, '');
/** Horas: sempre uma casa. */
const horas = (x: number): string => num(x, 1);
const kwh = (x: number): string => num(x, 2);

/** Primeira letra em minúscula, salvo em siglas (DPS). */
function minuscula(texto: string): string {
  return texto.length > 1 && texto[1] === texto[1].toUpperCase() && texto[1] !== texto[1].toLowerCase()
    ? texto
    : texto.charAt(0).toLowerCase() + texto.slice(1);
}

// ---------------------------------------------------------------- Regras de ligação

const LIGACAO: [CodigoProblema, Nivel, string, string][] = [
  ['sem-inversor', 'dica', 'Falta o inversor',
    'O inversor transforma a energia da bateria na energia das tomadas. Arraste um para a parede do quartinho.'],
  ['varios-inversores', 'alerta', 'Há mais de um inversor',
    'A simulação usa só o primeiro. Remova os outros ou deixe-os sem cabos.'],
  ['sem-bateria', 'erro', 'O inversor está sem bateria',
    'Ligue o positivo da bateria no terminal BAT+ do inversor e o negativo no BAT−. Sem bateria, o inversor não liga.'],
  ['curto-bateria', 'erro', 'Curto-circuito na bateria',
    'O positivo e o negativo da bateria estão ligados entre si. Em uma bateria de verdade isso derrete o cabo em segundos. Desfaça essa ligação.'],
  ['bateria-invertida', 'erro', 'Bateria ligada ao contrário',
    'O positivo da bateria vai no BAT+ e o negativo no BAT−. Invertida, ela queima o inversor na hora.'],
  ['bateria-solta', 'alerta', 'Bateria sem circuito fechado',
    'Esta bateria tem cabo em um polo só. Ligue os dois polos para ela entrar no banco.'],
  ['ramos-desiguais', 'erro', 'Baterias em paralelo com tensões diferentes',
    'Só se liga em paralelo o que tem a mesma tensão. Confira quantas baterias há em cada série.'],
  ['baterias-misturadas', 'alerta', 'Baterias de modelos diferentes',
    'Baterias do mesmo banco devem ser do mesmo modelo e da mesma idade. Misturadas, a mais fraca trabalha demais e estraga antes.'],
  ['curto-placas', 'erro', 'Curto-circuito nas placas',
    'O positivo e o negativo das placas estão ligados entre si. A placa não queima, mas não gera nada. Desfaça essa ligação.'],
  ['placa-invertida', 'erro', 'Placa ligada ao contrário', 'O positivo da fileira vai no PV+ e o negativo no PV−.'],
  ['placa-solta', 'alerta', 'Placa sem circuito fechado', 'Esta placa não está gerando: falta ligar um dos polos.'],
  ['fileiras-desiguais', 'erro', 'Fileiras com número diferente de placas',
    'Fileiras em paralelo precisam ter a mesma quantidade de placas. A fileira menor derruba a tensão das outras.'],
  ['placas-misturadas', 'alerta', 'Placas de modelos diferentes',
    'Em série, a placa de menor corrente limita as outras. Use o mesmo modelo no arranjo.'],
  ['saida-na-rede', 'erro', 'A saída do inversor está ligada na rede da casa',
    'Nunca ligue a saída do inversor em uma tomada da rede. Na queda de luz você manda energia para a rua, onde pode haver alguém trabalhando no fio, e quando a luz volta as duas fontes se chocam. A saída vai só para os aparelhos.'],
];

const CODIGOS_DE_PLACA: CodigoProblema[] = ['curto-placas', 'placa-invertida', 'placa-solta', 'fileiras-desiguais', 'placas-misturadas'];

// ---------------------------------------------------------------- Auxiliares

const ORDEM_NIVEL: Record<Nivel, number> = { erro: 0, alerta: 1, dica: 2 };
const LIMITE_CARREGADOR_REDE_A = 20;
const TIPOS_DE_CORRENTE: TipoProtecao[] = ['fusivel', 'disjuntorCC', 'disjuntorCA'];
const SO_NA_FALTA_DE_ENTRADA = ' Esta entrada não aceita mais placas deste modelo.';

/** Redes elétricas: terminais ligados por cabos. */
function montarRedes(projeto: Projeto): (disp: string, terminal: string) => string {
  const pai = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    for (let p = pai.get(r); p !== undefined && p !== r; p = pai.get(r)) r = p;
    return r;
  };
  for (const c of projeto.cabos) {
    const ra = raiz(`${c.de.disp}:${c.de.terminal}`);
    const rb = raiz(`${c.para.disp}:${c.para.terminal}`);
    if (ra !== rb) pai.set(ra, rb);
  }
  return (disp, terminal) => raiz(`${disp}:${terminal}`);
}

function itensDe<T extends Item>(catalogo: Catalogo, categoria: T['categoria']): T[] {
  return [...catalogo.values()].filter((i): i is T => i.categoria === categoria);
}

/** Cabos de cobre sem restrição do mesmo uso, do mais fino ao mais grosso. */
function cabosDoUso(catalogo: Catalogo, uso: TipoCabo['uso']): TipoCabo[] {
  return itensDe<TipoCabo>(catalogo, 'cabo')
    .filter((c) => c.uso === uso && c.cobre && c.naoRecomendado === undefined)
    .sort((a, b) => a.secao - b.secao);
}

/** O primeiro que satisfaz; se nenhum, o último (o maior). */
function primeiroOuMaior<T>(lista: T[], atende: (x: T) => boolean): T | undefined {
  return lista.find(atende) ?? lista[lista.length - 1];
}

/** Proteções de um conjunto de tipos, da menor para a maior corrente (e tensão). */
function protecoesDe(catalogo: Catalogo, tipos: TipoProtecao[]): Protecao[] {
  return itensDe<Protecao>(catalogo, 'protecao')
    .filter((p) => tipos.includes(p.tipo))
    .sort((a, b) => a.correnteA - b.correnteA || a.tensaoMaxV - b.tensaoMaxV);
}

const acaoVerCatalogo = (categoria: 'inversor' | 'controlador' | 'placa' | 'bateria'): Acao => ({
  tipo: 'ver-catalogo',
  rotulo: { inversor: 'Ver inversores', controlador: 'Ver controladores', placa: 'Ver placas', bateria: 'Ver baterias' }[categoria],
  categoria,
});

const acaoMaisPlaca = (plano: PlanoMaisPlaca): Acao => ({ tipo: 'mais-placa', rotulo: `Acrescentar placa em ${plano.modo === 'serie' ? 'série' : 'paralelo'}` });

interface InfoCabo {
  cabo: Cabo;
  tipo: TipoCabo;
  /** Corrente de projeto, em A. */
  i: number;
  /** Menor proteção de corrente instalada, se houver. */
  protecao: Protecao | null;
  /** Capacidade exigida: o maior entre a corrente de projeto e a da proteção. */
  exigida: number;
}

const NOME_CIRCUITO: Record<Circuito, string> = { bateria: 'da bateria', placas: 'das placas', saida: 'dos aparelhos', entrada: 'da entrada' };
const CIRCUITOS: Circuito[] = ['bateria', 'placas', 'saida', 'entrada'];

// ---------------------------------------------------------------- Consultor

/** Lista de sugestões: erros, depois alertas, depois dicas. */
export function analisarConsultor(
  projeto: Projeto,
  catalogo: Catalogo,
  analise: AnaliseCircuito,
  estimativas: Estimativas,
): Sugestao[] {
  const lista: Sugestao[] = [];
  const sistema = analise.sistema;
  const sugerir = (s: Sugestao): void => void lista.push(s);

  // Regras de ligação (a única que vale sem sistema é `sem-inversor`).
  for (const [codigo, nivel, titulo, texto] of LIGACAO) {
    if (sistema === null && codigo !== 'sem-inversor') continue;
    for (const p of analise.problemas.filter((x) => x.codigo === codigo)) {
      sugerir({ regra: codigo, nivel, titulo, texto, alvos: [...p.dispositivos, ...p.cabos] });
    }
  }
  if (sistema === null) return lista;

  const dispositivo = (uid: string) => projeto.dispositivos.find((d) => d.uid === uid);
  const itemDe = (uid: string): Item | undefined => {
    const d = dispositivo(uid);
    return d ? catalogo.get(d.itemId) : undefined;
  };
  const inversorItem = itemDe(sistema.inversor);
  if (inversorItem?.categoria !== 'inversor') return lista;
  const inversor: Inversor = inversorItem;
  const banco: InfoBanco | null = infoBanco(sistema, projeto, catalogo);

  const cargas = sistema.cargas.flatMap((uid) => {
    const item = itemDe(uid);
    const d = dispositivo(uid);
    return item?.categoria === 'aparelho' && d ? [{ uid, item: item as Aparelho, ligado: d.ligado }] : [];
  });
  const ligadas = cargas.filter((c) => c.ligado);
  const bateriasDoBanco = sistema.banco.flat();
  const baterias = (): Bateria[] =>
    bateriasDoBanco.flatMap((uid) => {
      const i = itemDe(uid);
      return i?.categoria === 'bateria' ? [i] : [];
    });

  const fileiras = sistema.fileiras;
  const solar = sistema.entradaSolar;
  const comFileira = solar !== null && fileiras.length > 0;
  const placaDe = (uid: string): Placa | null => {
    const i = itemDe(uid);
    return i?.categoria === 'placa' ? i : null;
  };
  const placa = comFileira ? placaDe(fileiras[0][0]) : null;
  const donoSolar = sistema.controlador ?? sistema.inversor;
  const placasDaFileira = fileiras.flat();

  // ---------------------------------------------------------------- Compatibilidade

  if (banco !== null && banco.tensao !== inversor.tensaoBateria) {
    const primeira = baterias()[0];
    const titulo = `Bateria de ${inteiro(banco.tensao)} V em inversor de ${inteiro(inversor.tensaoBateria)} V`;
    let texto: string;
    if (banco.tensao < inversor.tensaoBateria && primeira) {
      texto =
        `O inversor precisa de ${inteiro(inversor.tensaoBateria)} V. Ligue ${inteiro(inversor.tensaoBateria / primeira.tensao)} baterias de ` +
        `${inteiro(primeira.tensao)} V em série, o negativo de uma no positivo da outra, ou troque por uma bateria de ${inteiro(inversor.tensaoBateria)} V.`;
    } else {
      texto = 'A tensão do banco é maior que a do inversor e pode queimá-lo. Refaça a ligação.';
    }
    sugerir({ regra: 'tensao-do-banco', nivel: 'erro', titulo, texto, alvos: [sistema.inversor, ...bateriasDoBanco] });
  }

  if (inversor.saidaV !== projeto.tensaoRede) {
    sugerir({
      regra: 'tensao-de-saida',
      nivel: 'erro',
      titulo: `Inversor de ${inteiro(inversor.saidaV)} V em casa de ${inteiro(projeto.tensaoRede)} V`,
      texto:
        inversor.saidaV === 220
          ? 'Aparelho de 127 V queima em 220 V. Use um inversor com saída de 110 a 127 V.'
          : 'Aparelho de 220 V não funciona direito em 127 V. Use um inversor com saída de 220 V.',
      alvos: [sistema.inversor],
      acao: acaoVerCatalogo('inversor'),
    });
  }

  for (const c of cargas) {
    if (c.item.tensao === 'bivolt' || c.item.tensao === inversor.saidaV) continue;
    sugerir({
      regra: 'aparelho-tensao',
      nivel: 'erro',
      titulo: `${c.item.nome} é de ${inteiro(c.item.tensao)} V e o inversor entrega ${inteiro(inversor.saidaV)} V`,
      texto: 'Ligar um aparelho na tensão errada queima o aparelho ou o deixa sem força.',
      alvos: [c.uid],
    });
  }

  if (inversor.onda === 'modificada') {
    for (const c of ligadas) {
      if (!c.item.eletronico && !c.item.motor) continue;
      sugerir({
        regra: 'onda-modificada',
        nivel: 'alerta',
        titulo: `Inversor de onda modificada com ${c.item.nome}`,
        texto:
          'Onda modificada esquenta motores e pode travar ou danificar fontes de computador e nobreaks. Para esses aparelhos use inversor de onda senoidal pura.',
        alvos: [sistema.inversor, c.uid],
        acao: acaoVerCatalogo('inversor'),
      });
    }
  }

  const automotivas = baterias().map((b, i) => ({ b, uid: bateriasDoBanco[i] })).filter((x) => x.b.quimica === 'automotiva');
  if (automotivas.length > 0) {
    sugerir({
      regra: 'bateria-automotiva',
      nivel: 'alerta',
      titulo: 'Bateria de carro não serve para este uso',
      texto:
        'Ela foi feita para dar partida, com descargas curtas. Descarregada a fundo algumas dezenas de vezes, perde a capacidade. Use bateria estacionária ou de lítio.',
      alvos: automotivas.map((x) => x.uid),
      acao: acaoVerCatalogo('bateria'),
    });
  }

  // Itens não recomendados: uma sugestão por item, com todos os dispositivos ou cabos dele.
  const itensRuins = new Map<string, { item: Item; dispositivos: string[]; cabos: string[] }>();
  const ruim = (item: Item | undefined) => {
    if (!item || item.naoRecomendado === undefined) return undefined;
    let r = itensRuins.get(item.id);
    if (!r) itensRuins.set(item.id, (r = { item, dispositivos: [], cabos: [] }));
    return r;
  };
  for (const d of projeto.dispositivos) ruim(catalogo.get(d.itemId))?.dispositivos.push(d.uid);
  for (const c of projeto.cabos) ruim(catalogo.get(c.caboId))?.cabos.push(c.uid);
  for (const { item, dispositivos, cabos } of itensRuins.values()) {
    const sugestao: Sugestao = {
      regra: 'item-nao-recomendado',
      nivel: 'alerta',
      titulo: `${item.nome}: não recomendado`,
      texto: item.naoRecomendado ?? '',
      alvos: [...dispositivos, ...cabos],
    };
    if (item.categoria === 'cabo' && cabos.length > 0) {
      const igual = itensDe<TipoCabo>(catalogo, 'cabo').find((c) => c.uso === item.uso && c.cobre && c.secao === item.secao);
      if (igual) {
        sugestao.acao = { tipo: 'trocar-cabos', rotulo: `Trocar por ${minuscula(igual.nome)}`, cabos, caboId: igual.id };
      }
    }
    sugerir(sugestao);
  }

  // ---------------------------------------------------------------- Placas e entrada solar

  const plano = planejarMaisPlaca(projeto, catalogo, analise);

  if (comFileira && solar !== null && placa !== null) {
    const nMin = Math.min(...fileiras.map((f) => f.length));
    const nMax = Math.max(...fileiras.map((f) => f.length));
    const f = fileiras.length;
    const tensaoCarga = banco?.tensaoCarga ?? null;
    const alvosPlacas = [donoSolar, ...placasDaFileira];

    // Tensão mínima que a entrada exige das placas no calor.
    let minima: number | null = null;
    if (solar.tipo === 'mppt') minima = tensaoCarga === null ? solar.vMin : Math.max(solar.vMin, tensaoCarga + 2);
    else if (tensaoCarga !== null) minima = tensaoCarga + 1;

    if (minima !== null && vmpQuente(placa, nMin) < minima) {
      let m = nMin + 1;
      while (vmpQuente(placa, m) < minima && m < 1000) m++;
      const naoCombina = vocFrio(placa, m) > solar.vocMax;
      const prefixo = nMin === 1 ? 'Uma placa entrega' : `${inteiro(nMin)} placas em série entregam`;
      const base = `${prefixo} cerca de ${um(vmpQuente(placa, nMin))} V no calor, e esta entrada só trabalha a partir de ${um(minima)} V.`;
      let texto: string;
      let acao: Acao | undefined;
      const verCatalogo = acaoVerCatalogo(sistema.controlador !== null ? 'controlador' : 'inversor');
      if (naoCombina) {
        texto = 'Esta entrada não combina com esta placa. Escolha outro inversor ou controlador.';
        acao = verCatalogo;
      } else {
        texto = `${base} Com ${inteiro(m)} placas em série a tensão sobe para ${um(vmpQuente(placa, m))} V.`;
        if (plano?.modo === 'serie') acao = acaoMaisPlaca(plano);
        else {
          acao = verCatalogo;
          if (plano === null) texto += SO_NA_FALTA_DE_ENTRADA;
        }
      }
      const s: Sugestao = {
        regra: 'placas-abaixo-da-tensao',
        nivel: 'erro',
        titulo: 'As placas não alcançam a tensão mínima da entrada',
        texto,
        alvos: alvosPlacas,
      };
      if (acao) s.acao = acao;
      sugerir(s);
    }

    const acimaDoLimite = vocFrio(placa, nMax) > solar.vocMax;
    if (acimaDoLimite) {
      sugerir({
        regra: 'placas-acima-do-limite',
        nivel: 'erro',
        titulo: 'Tensão das placas acima do limite da entrada',
        texto:
          `Em manhã fria esta fileira chega a ${um(vocFrio(placa, nMax))} V e a entrada aguenta ${um(solar.vocMax)} V. ` +
          'Isso queima o equipamento. Use menos placas em série.',
        alvos: alvosPlacas,
      });
    }

    if (solar.correnteEntradaMaxA !== undefined && f * placa.isc > solar.correnteEntradaMaxA) {
      sugerir({
        regra: 'corrente-das-placas',
        nivel: 'erro',
        titulo: 'Corrente das placas acima do que a entrada aceita',
        texto:
          `${f === 1 ? 'Uma fileira soma' : `${inteiro(f)} fileiras em paralelo somam`} ${um(f * placa.isc)} A e a entrada aceita ` +
          `${um(solar.correnteEntradaMaxA)} A. Ligue as placas em série: a corrente fica a de uma placa e a tensão soma.`,
        alvos: alvosPlacas,
      });
    }

    if (!acimaDoLimite && nMax * placa.vmp > solar.vMax) {
      sugerir({
        regra: 'placas-acima-da-faixa',
        nivel: 'alerta',
        titulo: 'Tensão das placas acima da faixa de trabalho',
        texto:
          `A fileira trabalha em ${um(nMax * placa.vmp)} V e a entrada aproveita até ${um(solar.vMax)} V. ` +
          'Parte da geração se perde. Use menos placas em série.',
        alvos: alvosPlacas,
      });
    }

    const potenciaPlacas = placasDaFileira.reduce((s, uid) => s + (placaDe(uid)?.wp ?? 0), 0);
    if (potenciaPlacas > solar.potenciaMaxW) {
      sugerir({
        regra: 'potencia-das-placas',
        nivel: 'alerta',
        titulo: 'Placas além da potência da entrada',
        texto:
          `São ${inteiro(potenciaPlacas)} W de placas para uma entrada de ${inteiro(solar.potenciaMaxW)} W. ` +
          'Funciona, mas o que passar disso é desperdiçado.',
        alvos: alvosPlacas,
      });
    }

    if (solar.tipo === 'pwm' && tensaoCarga !== null) {
      const alvoV = nMax * placa.vmp * 0.9;
      const desperdicio = 1 - tensaoCarga / alvoV;
      if (desperdicio > 0.15) {
        sugerir({
          regra: 'pwm-desperdica',
          nivel: 'alerta',
          titulo: `O controlador PWM desperdiça cerca de ${inteiro(desperdicio * 100)}% desta placa`,
          texto:
            `O PWM prende a placa na tensão da bateria, ${um(tensaoCarga)} V, e esta placa rende mais perto de ${inteiro(alvoV)} V. ` +
            'Um controlador MPPT aproveita essa diferença.',
          alvos: alvosPlacas,
          acao: acaoVerCatalogo('controlador'),
        });
      }
    }

    for (const uid of placasDaFileira) {
      const perda = estimativas.perdaSombra.get(uid) ?? 0;
      if (perda > 0.2) {
        sugerir({
          regra: 'placa-na-sombra',
          nivel: 'alerta',
          titulo: `Esta placa perde ${inteiro(perda * 100)}% da geração para a sombra`,
          texto:
            'A sombra da casa cobre a placa em parte do dia. Mude a placa de lugar ou gire a casa para testar outra posição do telhado.',
          alvos: [uid],
        });
      }
    }
  }

  if (solar !== null && fileiras.length === 0 && !analise.problemas.some((p) => CODIGOS_DE_PLACA.includes(p.codigo))) {
    sugerir({
      regra: 'sem-placas',
      nivel: 'dica',
      titulo: 'Sem placas, a bateria só recarrega pela rede',
      texto: 'Arraste uma placa para o telhado e ligue o positivo no PV+ e o negativo no PV−.',
      alvos: [donoSolar],
      acao: acaoVerCatalogo('placa'),
    });
  }

  // ---------------------------------------------------------------- Cargas e inversor

  const somaPotencia = ligadas.reduce((s, c) => s + c.item.potenciaW, 0);

  if (somaPotencia > inversor.potenciaW) {
    const maior = ligadas.reduce((a, b) => (b.item.potenciaW > a.item.potenciaW ? b : a));
    sugerir({
      regra: 'sobrecarga',
      nivel: 'erro',
      titulo: 'Aparelhos demais para o inversor',
      texto:
        `O que está ligado soma ${inteiro(somaPotencia)} W e o inversor entrega ${inteiro(inversor.potenciaW)} W. ` +
        'Ele desarma. Desligue algo ou use um inversor maior.',
      alvos: [sistema.inversor, ...ligadas.map((c) => c.uid)],
      acao: { tipo: 'desligar', rotulo: `Desligar ${minuscula(maior.item.nome)}`, dispositivo: maior.uid },
    });
  }

  for (const c of ligadas) {
    if (!c.item.motor) continue;
    const partida = somaPotencia - c.item.potenciaW + c.item.picoW;
    if (partida <= inversor.picoW) continue;
    sugerir({
      regra: 'pico-de-partida',
      nivel: 'alerta',
      titulo: `O inversor pode não aguentar a partida de ${c.item.nome}`,
      texto:
        'Motor puxa várias vezes a potência normal no instante em que liga. ' +
        `Aqui a partida chega a ${inteiro(partida)} W e o inversor aguenta ${inteiro(inversor.picoW)} W de pico.`,
      alvos: [sistema.inversor, c.uid],
    });
  }

  if (banco !== null) {
    const iBanco = (somaPotencia / inversor.rendimento + inversor.consumoVazioW) / banco.tensaoRef;
    if (iBanco > banco.descargaMaxA) {
      sugerir({
        regra: 'corrente-da-bateria',
        nivel: 'alerta',
        titulo: 'A bateria desliga com esta carga',
        texto:
          `Os aparelhos ligados puxam ${um(iBanco)} A da bateria, e a proteção interna dela corta em ${um(banco.descargaMaxA)} A. ` +
          'Acrescente uma bateria em paralelo ou desligue algo.',
        alvos: [...bateriasDoBanco, ...ligadas.map((c) => c.uid)],
        acao: { tipo: 'mais-bateria', rotulo: 'Acrescentar bateria em paralelo' },
      });
    }
  }

  if (inversor.carregadorRedeA !== undefined && !sistema.redeLigada) {
    sugerir({
      regra: 'rede-desligada',
      nivel: 'dica',
      titulo: 'O inversor não está ligado na rede',
      texto:
        'Com a entrada CA ligada na rede, o inversor mantém a bateria cheia e passa a energia direto para os aparelhos. ' +
        'Na queda de luz ele assume sozinho.',
      alvos: [sistema.inversor],
    });
  }

  if (banco !== null) {
    const daPlaca = comFileira && solar !== null ? solar.correnteCargaA : 0;
    const daRede = sistema.redeLigada ? Math.min(inversor.carregadorRedeA ?? 0, LIMITE_CARREGADOR_REDE_A) : 0;
    if (daPlaca + daRede > banco.cargaMaxA) {
      sugerir({
        regra: 'carga-acima-da-bateria',
        nivel: 'dica',
        titulo: 'Limite a corrente de carga no inversor',
        texto:
          `As placas e a rede juntas podem carregar a ${um(daPlaca + daRede)} A e esta bateria aceita ${um(banco.cargaMaxA)} A. ` +
          'Ajuste o limite de carga no menu do inversor.',
        alvos: [sistema.inversor, ...bateriasDoBanco],
      });
    }
  }

  // ---------------------------------------------------------------- Proteção e cabos

  regrasDeCabos(projeto, catalogo, analise, sistema, inversor, banco, placa, sugerir);

  // ---------------------------------------------------------------- Autonomia e energia

  if (estimativas.autonomiaHoras !== null && estimativas.autonomiaHoras < 8 && banco !== null) {
    const autonomia = estimativas.autonomiaHoras;
    const ultima = baterias()[baterias().length - 1];
    const partes = ['Para atravessar uma noite são umas 12 horas.'];
    if (ultima) {
      partes.push(
        `Com mais uma bateria igual em paralelo, a autonomia vai para ${horas((autonomia * (banco.ah + ultima.ah)) / banco.ah)} horas.`,
      );
    }
    if (ligadas.length > 1) {
      const maior = ligadas.reduce((a, b) => (b.item.mediaW > a.item.mediaW ? b : a));
      const total = ligadas.reduce((s, c) => s + c.item.mediaW, 0);
      const antes = total / inversor.rendimento + inversor.consumoVazioW;
      const depois = (total - maior.item.mediaW) / inversor.rendimento + inversor.consumoVazioW;
      partes.push(`Desligar ${maior.item.nome} sozinho leva a ${horas((autonomia * antes) / depois)} horas.`);
    }
    const s: Sugestao = {
      regra: 'autonomia-curta',
      nivel: 'alerta',
      titulo: `Com o que está ligado, a bateria dura ${horas(autonomia)} horas`,
      texto: partes.join(' '),
      alvos: bateriasDoBanco,
    };
    if (ultima) s.acao = { tipo: 'mais-bateria', rotulo: 'Acrescentar bateria em paralelo' };
    sugerir(s);
  }

  if (estimativas.geracaoDiaKwh > 0 && estimativas.geracaoDiaKwh < estimativas.consumoDiaKwh) {
    const { geracaoDiaKwh: gera, consumoDiaKwh: consome } = estimativas;
    const porPlaca = gera / Math.max(1, placasDaFileira.length);
    const faltam = Math.ceil((consome - gera) / porPlaca - 1e-9);
    let texto =
      `Geração do dia: ${kwh(gera)} kWh. Consumo: ${kwh(consome)} kWh. A diferença sai da bateria e depois da rede. ` +
      `Para fechar a conta ${faltam === 1 ? 'falta cerca de 1 placa' : `faltam cerca de ${inteiro(faltam)} placas`}.`;
    const s: Sugestao = {
      regra: 'geracao-menor-que-o-consumo',
      nivel: 'alerta',
      titulo: `As placas repõem ${inteiro((gera / consome) * 100)}% do que os aparelhos gastam em um dia`,
      texto,
      alvos: placasDaFileira,
    };
    if (plano !== null) s.acao = acaoMaisPlaca(plano);
    else s.texto = texto += SO_NA_FALTA_DE_ENTRADA;
    sugerir(s);
  }

  return lista
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ORDEM_NIVEL[a.s.nivel] - ORDEM_NIVEL[b.s.nivel] || a.i - b.i)
    .map((x) => x.s);
}

// ---------------------------------------------------------------- Regras de proteção e de cabos

function regrasDeCabos(
  projeto: Projeto,
  catalogo: Catalogo,
  analise: AnaliseCircuito,
  sistema: Sistema,
  inversor: Inversor,
  banco: InfoBanco | null,
  placa: Placa | null,
  sugerir: (s: Sugestao) => void,
): void {
  const rede = montarRedes(projeto);
  const correntes = correntesDeProjeto(projeto, catalogo, analise);
  const donoSolar = sistema.controlador ?? sistema.inversor;
  const comFileira = sistema.entradaSolar !== null && sistema.fileiras.length > 0;

  // Redes de cada circuito.
  const redesDe: Record<Circuito, Set<string>> = { bateria: new Set(), placas: new Set(), saida: new Set(), entrada: new Set() };
  if (sistema.banco.length > 0) {
    redesDe.bateria.add(rede(sistema.inversor, 'batPos')).add(rede(sistema.inversor, 'batNeg'));
    for (const uid of sistema.banco.flat()) redesDe.bateria.add(rede(uid, 'pos')).add(rede(uid, 'neg'));
  }
  if (comFileira) {
    redesDe.placas.add(rede(donoSolar, 'pvPos')).add(rede(donoSolar, 'pvNeg'));
    for (const uid of sistema.fileiras.flat()) redesDe.placas.add(rede(uid, 'pos')).add(rede(uid, 'neg'));
  }
  redesDe.saida.add(rede(sistema.inversor, 'caSaida'));
  if (sistema.redeLigada) redesDe.entrada.add(rede(sistema.inversor, 'caEntrada'));

  const circuitos: Record<Circuito, InfoCabo[]> = { bateria: [], placas: [], saida: [], entrada: [] };
  for (const cabo of projeto.cabos) {
    const tipo = catalogo.get(cabo.caboId);
    if (tipo?.categoria !== 'cabo') continue;
    const r = rede(cabo.de.disp, cabo.de.terminal);
    const circuito = CIRCUITOS.find((c) => redesDe[c].has(r));
    if (circuito === undefined) continue;
    const instaladas = cabo.protecoes.flatMap((id) => {
      const p = catalogo.get(id);
      return p?.categoria === 'protecao' && TIPOS_DE_CORRENTE.includes(p.tipo) ? [p] : [];
    });
    const protecao = instaladas.length > 0 ? instaladas.reduce((a, b) => (b.correnteA < a.correnteA ? b : a)) : null;
    const i = correntes.get(cabo.uid) ?? 0;
    circuitos[circuito].push({ cabo, tipo, i, protecao, exigida: Math.max(i, protecao?.correnteA ?? 0) });
  }

  const umCabo = (c: InfoCabo): string => c.cabo.uid;
  /** Menor cabo de cobre do mesmo uso com ampacidade para `amperes`. */
  const caboPara = (uso: TipoCabo['uso'], amperes: number): TipoCabo | undefined =>
    primeiroOuMaior(cabosDoUso(catalogo, uso), (c) => c.ampacidade >= amperes);
  const acaoTrocar = (cabos: string[], novo: TipoCabo | undefined): Acao | undefined =>
    novo ? { tipo: 'trocar-cabos', rotulo: `Trocar por ${minuscula(novo.nome)}`, cabos, caboId: novo.id } : undefined;

  const iBateria = banco ? inversor.potenciaW / (inversor.rendimento * banco.tensaoRef) : 0;
  const protecoesCorrente = protecoesDe(catalogo, ['fusivel', 'disjuntorCC']);
  const cabosComEnd = (disp: string, terminal: string): Cabo[] =>
    projeto.cabos.filter(
      (c) => (c.de.disp === disp && c.de.terminal === terminal) || (c.para.disp === disp && c.para.terminal === terminal),
    );

  // sem-protecao-da-bateria
  if (banco !== null && sistema.banco.length > 0) {
    const positivos = circuitos.bateria.filter((c) => rede(c.cabo.de.disp, c.cabo.de.terminal) === rede(sistema.inversor, 'batPos'));
    if (!positivos.some((c) => c.protecao !== null)) {
      const escolhida = primeiroOuMaior(
        protecoesCorrente,
        (p) => p.correnteA >= 1.1 * iBateria && p.tensaoMaxV >= banco.tensaoCarga,
      );
      const cabos = [...new Set(sistema.banco.flatMap((ramo) => cabosComEnd(ramo[0], 'pos').map((c) => c.uid)))];
      const s: Sugestao = {
        regra: 'sem-protecao-da-bateria',
        nivel: 'erro',
        titulo: 'Falta fusível entre a bateria e o inversor',
        texto:
          'Em um curto, uma bateria de lítio entrega centenas de ampères. O fusível fica no cabo positivo, o mais perto possível da bateria, ' +
          'e é ele que abre antes de o cabo pegar fogo.',
        alvos: positivos.length > 0 ? positivos.map(umCabo) : [sistema.inversor],
      };
      if (escolhida && cabos.length > 0) {
        s.acao = { tipo: 'proteger-cabos', rotulo: `Instalar ${minuscula(escolhida.nome)}`, cabos, protecaoId: escolhida.id };
      }
      sugerir(s);
    }
  }

  // protecao-maior-que-o-cabo e cabo-fino
  for (const circuito of CIRCUITOS) {
    const infos = circuitos[circuito];
    const maiorQueCabo = infos.filter((c) => c.protecao !== null && c.protecao.correnteA > c.tipo.ampacidade);
    if (maiorQueCabo.length > 0) {
      const pior = maiorQueCabo.reduce((a, b) => (b.protecao!.correnteA > a.protecao!.correnteA ? b : a));
      const afetados = infos.filter((c) => c.tipo.ampacidade < c.exigida);
      const exigida = Math.max(...afetados.map((c) => c.exigida));
      const cabos = afetados.map(umCabo);
      const s: Sugestao = {
        regra: 'protecao-maior-que-o-cabo',
        nivel: 'erro',
        titulo: `${pior.protecao!.tipo === 'fusivel' ? 'Fusível' : 'Disjuntor'} de ${um(pior.protecao!.correnteA)} A em cabo que aguenta ${um(pior.tipo.ampacidade)} A`,
        texto:
          'O fusível existe para abrir antes de o cabo esquentar. Aqui o cabo esquenta primeiro. Use um cabo mais grosso ou um fusível menor.',
        alvos: cabos,
      };
      const acao = acaoTrocar(cabos, caboPara(pior.tipo.uso, exigida));
      if (acao) s.acao = acao;
      sugerir(s);
      continue;
    }
    const finos = infos.filter((c) => c.tipo.ampacidade < c.i);
    if (finos.length > 0) {
      const pior = finos.reduce((a, b) => (b.i > a.i ? b : a));
      const cabos = finos.map(umCabo);
      const s: Sugestao = {
        regra: 'cabo-fino',
        nivel: 'erro',
        titulo: 'Cabo fino para a corrente',
        texto: `Por este cabo passam até ${um(pior.i)} A e ele aguenta ${um(pior.tipo.ampacidade)} A. Cabo sobrecarregado esquenta e derrete a capa.`,
        alvos: cabos,
      };
      const acao = acaoTrocar(cabos, caboPara(pior.tipo.uso, Math.max(...finos.map((c) => c.i))));
      if (acao) s.acao = acao;
      sugerir(s);
    }
  }

  // protecao-pequena
  for (const circuito of CIRCUITOS) {
    const fator = circuito === 'bateria' ? 1.1 : 1;
    const pequenas = circuitos[circuito].filter((c) => c.protecao !== null && c.protecao.correnteA < fator * c.i);
    if (pequenas.length === 0) continue;
    const pior = pequenas.reduce((a, b) => (b.i / b.protecao!.correnteA > a.i / a.protecao!.correnteA ? b : a));
    sugerir({
      regra: 'protecao-pequena',
      nivel: 'alerta',
      titulo: 'A proteção vai abrir em uso normal',
      texto:
        `Com tudo na potência máxima passam ${um(pior.i)} A por aqui, e esta proteção é de ${um(pior.protecao!.correnteA)} A. ` +
        'Ela serve se o uso ficar abaixo disso.',
      alvos: pequenas.map(umCabo),
    });
  }

  // queda-de-tensao
  const quedas = quedasDeTensao(projeto, catalogo, analise).filter((q) => q.fracao > q.limite);
  for (const circuito of ['bateria', 'placas', 'saida'] as const) {
    const grupo = quedas.filter((q) => q.circuito === circuito);
    if (grupo.length === 0) continue;
    const pior = grupo.reduce((a, b) => (b.fracao > a.fracao ? b : a));
    const cabos = [...new Set(grupo.flatMap((q) => q.cabos))];
    const tipos = cabos.flatMap((uid) => {
      const c = projeto.cabos.find((x) => x.uid === uid);
      const t = c ? catalogo.get(c.caboId) : undefined;
      return t?.categoria === 'cabo' ? [t] : [];
    });
    const escolha = tipos.length > 0 ? caboDentroDoLimite(projeto, catalogo, analise, grupo, cabos, tipos[0].uso) : undefined;
    const novo = escolha?.cabo;
    let texto = `Este trecho perde ${um(pior.fracao * 100)}% da energia no caminho, e o recomendado é até ${um(pior.limite * 100)}%.`;
    if (novo && escolha?.resolve) texto += ` Um cabo de ${um(novo.secao)} mm² resolve.`;
    if (circuito === 'placas') texto += ' Nas placas, ligar em série também resolve, porque a corrente cai.';
    const s: Sugestao = {
      regra: 'queda-de-tensao',
      nivel: 'alerta',
      titulo: `Perda alta no cabo ${NOME_CIRCUITO[circuito]}`,
      texto,
      alvos: cabos,
    };
    const acao = acaoTrocar(cabos, novo);
    if (acao) s.acao = acao;
    sugerir(s);
  }

  // Proteções das placas e da saída.
  if (comFileira && placa !== null) {
    const vocFileira = vocFrio(placa, Math.max(...sistema.fileiras.map((f) => f.length)));
    const doPv = cabosComEnd(donoSolar, 'pvPos')[0];
    const infoPv = doPv ? circuitos.placas.find((c) => c.cabo.uid === doPv.uid) : undefined;
    const tem = (tipo: TipoProtecao): boolean =>
      circuitos.placas.some((c) =>
        c.cabo.protecoes.some((id) => {
          const p = catalogo.get(id);
          return p?.categoria === 'protecao' && p.tipo === tipo;
        }),
      );

    if (!tem('dps')) {
      const dps = protecoesDe(catalogo, ['dps']).sort((a, b) => a.tensaoMaxV - b.tensaoMaxV);
      const escolhido = primeiroOuMaior(dps, (p) => p.tensaoMaxV >= vocFileira);
      const s: Sugestao = {
        regra: 'sem-dps-nas-placas',
        nivel: 'dica',
        titulo: 'Proteja a entrada das placas contra raios',
        texto:
          'Placa no telhado capta surtos de raios que caem por perto. ' +
          'O DPS de corrente contínua desvia o surto para o aterramento antes de ele chegar ao inversor.',
        alvos: circuitos.placas.map(umCabo),
      };
      if (escolhido && doPv) {
        s.acao = { tipo: 'proteger-cabos', rotulo: `Instalar ${minuscula(escolhido.nome)}`, cabos: [doPv.uid], protecaoId: escolhido.id };
      }
      sugerir(s);
    }

    if (!tem('disjuntorCC')) {
      const disjuntores = protecoesDe(catalogo, ['disjuntorCC']);
      const escolhido = primeiroOuMaior(disjuntores, (p) => p.correnteA >= (infoPv?.i ?? 0) && p.tensaoMaxV >= vocFileira);
      const s: Sugestao = {
        regra: 'sem-disjuntor-nas-placas',
        nivel: 'dica',
        titulo: 'Ponha um disjuntor entre as placas e o inversor',
        texto:
          'Placa não tem botão de desligar: enquanto houver sol, há tensão no cabo. ' +
          'O disjuntor de corrente contínua deixa você desligar as placas para mexer no inversor com segurança.',
        alvos: circuitos.placas.map(umCabo),
      };
      if (escolhido && doPv) {
        s.acao = { tipo: 'proteger-cabos', rotulo: `Instalar ${minuscula(escolhido.nome)}`, cabos: [doPv.uid], protecaoId: escolhido.id };
      }
      sugerir(s);
    }
  }

  if (sistema.cargas.length > 0) {
    const daSaida = cabosComEnd(sistema.inversor, 'caSaida');
    const semDisjuntor = daSaida.filter(
      (c) =>
        !c.protecoes.some((id) => {
          const p = catalogo.get(id);
          return p?.categoria === 'protecao' && p.tipo === 'disjuntorCA';
        }),
    );
    if (semDisjuntor.length > 0) {
      const exigida = Math.max(...semDisjuntor.map((c) => 1.25 * (correntes.get(c.uid) ?? 0)));
      const escolhido = primeiroOuMaior(protecoesDe(catalogo, ['disjuntorCA']), (p) => p.correnteA >= exigida);
      const cabos = semDisjuntor.map((c) => c.uid);
      const s: Sugestao = {
        regra: 'sem-disjuntor-na-saida',
        nivel: 'dica',
        titulo: 'Ponha disjuntor nos circuitos de saída',
        texto:
          'Cada circuito que sai do inversor precisa de um disjuntor, como no quadro de luz da casa. ' +
          'Ele desliga o circuito se um aparelho entrar em curto.',
        alvos: cabos,
      };
      if (escolhido) {
        s.acao = { tipo: 'proteger-cabos', rotulo: 'Instalar disjuntor em cada cabo da saída', cabos, protecaoId: escolhido.id };
      }
      sugerir(s);
    }
  }
}

/** Menor cabo de cobre do mesmo uso que leva todas as quedas do grupo para dentro do limite. */
function caboDentroDoLimite(
  projeto: Projeto,
  catalogo: Catalogo,
  analise: AnaliseCircuito,
  grupo: QuedaDeTensao[],
  cabos: string[],
  uso: TipoCabo['uso'],
): { cabo: TipoCabo; resolve: boolean } | undefined {
  const troca = new Set(cabos);
  const resolve = (candidato: TipoCabo): boolean => {
    const clone: Projeto = {
      ...projeto,
      cabos: projeto.cabos.map((c) => (troca.has(c.uid) ? { ...c, caboId: candidato.id } : c)),
    };
    const depois = quedasDeTensao(clone, catalogo, analise);
    return grupo.every((g) => {
      const q = depois.find((x) => x.circuito === g.circuito && x.alvo === g.alvo);
      return q !== undefined && q.fracao <= q.limite;
    });
  };
  const lista = cabosDoUso(catalogo, uso);
  const certo = lista.find(resolve);
  const cabo = certo ?? lista[lista.length - 1];
  return cabo ? { cabo, resolve: certo !== undefined } : undefined;
}

// ---------------------------------------------------------------- Mais uma placa

/** Como uma placa a mais entra no arranjo: em série, em paralelo, ou nulo se a entrada não aceita. */
export function planejarMaisPlaca(projeto: Projeto, catalogo: Catalogo, analise: AnaliseCircuito): PlanoMaisPlaca | null {
  const sistema = analise.sistema;
  const solar = sistema?.entradaSolar;
  if (!sistema || !solar) return null;
  if (sistema.fileiras.length === 0) return { modo: 'serie' };

  const dispositivo = projeto.dispositivos.find((d) => d.uid === sistema.fileiras[0][0]);
  const item = dispositivo ? catalogo.get(dispositivo.itemId) : undefined;
  if (item?.categoria !== 'placa') return null;

  const n = sistema.fileiras[0].length;
  const f = sistema.fileiras.length;
  if (solar.tipo === 'mppt' && f === 1 && vocFrio(item, n + 1) <= solar.vocMax && (n + 1) * item.vmp <= solar.vMax) {
    return { modo: 'serie' };
  }
  if (n === 1) {
    const cabeNaCorrente = solar.correnteEntradaMaxA === undefined || (f + 1) * item.isc <= solar.correnteEntradaMaxA;
    const cabeNoPwm = solar.tipo !== 'pwm' || (f + 1) * item.imp <= solar.correnteCargaA;
    if (cabeNaCorrente && cabeNoPwm) return { modo: 'paralelo' };
  }
  return null;
}
