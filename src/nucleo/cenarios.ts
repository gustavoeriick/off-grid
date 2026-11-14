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
  varanda: { lado: 'frente', profundidade: 3, inclinacaoPct: 30 },
  quartinho: { x: 6.5, z: -2.0, largura: 2.4, profundidade: 2.0, altura: 2.3, giro: 0 },
  orientacaoGraus: 0,
};

function dispositivo(uid: string, itemId: string): Dispositivo {
  return { uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true };
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
  };
}

const APARELHOS = ['ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv'];
const METROS_ATE_O_APARELHO = [14, 14, 15, 12, 10, 10];

/** O plano elétrico do Gustavo como foi escrito: uma placa, uma bateria, cabo de 25 mm² com fusível de 150 A. */
export function cenarioPlanoNoPapel(): Projeto {
  return {
    versao: 1,
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
  }
  projeto.cabos.push(cabo('c12', 'placa1.neg', 'placa2.pos', 'cabo-solar-6', 1.5));

  return projeto;
}
