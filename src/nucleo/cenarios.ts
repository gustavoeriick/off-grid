// Cenários de referência. Especificação: docs/especificacao/casos-de-teste.md, seção 1.
// No núcleo as posições são zero; a cena coloca as peças na casa.

import type { Cabo, CasaConfig, Dispositivo, Projeto } from './tipos';

export const CASA_INICIAL: CasaConfig = {
  largura: 8,
  profundidade: 7,
  andares: 2,
  peDireito: 2.8,
  inclinacaoTelhadoPct: 35,
  beiral: 0.5,
  varandas: [{ lado: 'frente', profundidade: 3, inclinacaoPct: 30, largura: null, deslocamento: 0 }],
  // As três paredes internas fixas da fase 1 (os uids dão os ids de superfície que a fase 1 já usava), na grade de 0,1 m. Elas vão de limite a limite da planta (as pontas
  // ficam em ±4,0 e -3,5) para fechar os cômodos; a cena as encosta na escada e na parede externa.
  paredesInternas: [
    { uid: 'terreo', andar: 0, de: [-4, -0.7], para: [4, -0.7], passagens: [4.3] },
    { uid: 'superior-frente', andar: 1, de: [-4, 0.4], para: [4, 0.4], passagens: [5.7] },
    { uid: 'superior-meio', andar: 1, de: [0.6, -3.5], para: [0.6, 0.4], passagens: [3.0] },
  ],
  comodos: [
    { uid: 'cm-sala', andar: 0, nome: 'Sala', ponto: [0, 1.5] },
    { uid: 'cm-cozinha', andar: 0, nome: 'Cozinha', ponto: [0, -2.0] },
    { uid: 'cm-quarto-1', andar: 1, nome: 'Quarto 1', ponto: [0, 2.0] },
    { uid: 'cm-quarto-2', andar: 1, nome: 'Quarto 2', ponto: [-2.0, -1.5] },
    { uid: 'cm-corredor', andar: 1, nome: 'Corredor', ponto: [2.2, -1.5] },
  ],
  quartinho: { x: 6.5, z: -2.0, largura: 2.4, profundidade: 2.0, altura: 2.3, giro: 0 },
  orientacaoGraus: 0,
};

function dispositivo(uid: string, itemId: string): Dispositivo {
  return { uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null };
}

function cabo(uid: string, de: string, para: string, caboId: string, comprimento: number, protecoes: string[] = []): Cabo {
  const [dispDe, terminalDe] = de.split('.');
  const [dispPara, terminalPara] = para.split('.');
  return {
    uid,
    de: { disp: dispDe, terminal: terminalDe },
    para: { disp: dispPara, terminal: terminalPara },
    caboId,
    comprimento,
    protecoes,
    quadro: null,
  };
}

const APARELHOS = ['ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv'];
const METROS_ATE_O_APARELHO = [14, 14, 15, 12, 10, 10];

/** O plano elétrico do Gustavo como foi escrito: uma placa, uma bateria, cabo de 25 mm² com fusível de 150 A. */
export function cenarioPlanoNoPapel(): Projeto {
  return {
    versao: 2,
    nome: 'Plano no papel',
    casa: structuredClone(CASA_INICIAL),
    localId: 'rio',
    clima: 'tipico',
    tensaoRede: 127,
    prioridade: 'rede',
    dispositivos: [
      dispositivo('placa1', 'placa-renepv-585'),
      dispositivo('inversor', 'inv-anenji-3kw-24v-127'),
      dispositivo('bateria1', 'bat-alfx-24v-100'),
      dispositivo('rede', 'rede-tomada'),
      ...APARELHOS.map((id) => dispositivo(id, id)),
    ],
    cabos: [
      cabo('c1', 'placa1.pos', 'inversor.pvPos', 'cabo-solar-6', 12, ['prot-disjuntor-cc-32']),
      cabo('c2', 'placa1.neg', 'inversor.pvNeg', 'cabo-solar-6', 12),
      cabo('c3', 'bateria1.pos', 'inversor.batPos', 'cabo-bat-25', 1, ['prot-fusivel-anl-150']),
      cabo('c4', 'bateria1.neg', 'inversor.batNeg', 'cabo-bat-25', 1),
      cabo('c5', 'inversor.caEntrada', 'rede.tomada', 'cabo-ca-2p5', 2),
      ...APARELHOS.map((id, i) => cabo(`c${6 + i}`, 'inversor.caSaida', `${id}.plug`, 'cabo-ca-2p5', METROS_ATE_O_APARELHO[i])),
    ],
  };
}

/** O cenário anterior depois das correções que o consultor propõe. */
export function cenarioPlanoCorrigido(): Projeto {
  const projeto = cenarioPlanoNoPapel();
  projeto.nome = 'Plano corrigido';

  const posDaPlaca1 = projeto.dispositivos.findIndex((d) => d.uid === 'placa1');
  projeto.dispositivos.splice(posDaPlaca1 + 1, 0, dispositivo('placa2', 'placa-renepv-585'));

  for (const c of projeto.cabos) {
    if (c.uid === 'c1') c.protecoes.push('prot-dps-cc-600');
    if (c.uid === 'c2') c.de = { disp: 'placa2', terminal: 'neg' };
    if (c.uid === 'c3' || c.uid === 'c4') c.caboId = 'cabo-bat-35';
    if (c.de.terminal === 'caSaida') c.protecoes.push('prot-disjuntor-ca-16');
    // As proteções somam 10 módulos: um quadro para a corrente contínua (4) e outro para a saída (6).
    if (c.uid === 'c1') c.quadro = 'quadro-cc';
    if (c.de.terminal === 'caSaida') c.quadro = 'quadro-ca';
  }
  projeto.dispositivos.push(dispositivo('quadro-cc', 'acc-quadro-8'), dispositivo('quadro-ca', 'acc-quadro-8'));
  projeto.cabos.push(cabo('c12', 'placa1.neg', 'placa2.pos', 'cabo-solar-6', 1.5));

  return projeto;
}
