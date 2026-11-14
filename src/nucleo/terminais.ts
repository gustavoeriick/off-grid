// Terminais de cada tipo de peça. Especificação: docs/especificacao.md, seção 3.

import type { Item } from '../catalogo/tipos';
import type { DefTerminal, TipoTerminal } from './tipos';

const POS: DefTerminal = { id: 'pos', tipo: 'cc+', rotulo: '+' };
const NEG: DefTerminal = { id: 'neg', tipo: 'cc-', rotulo: '−' };
const PV_POS: DefTerminal = { id: 'pvPos', tipo: 'cc+', rotulo: 'PV+' };
const PV_NEG: DefTerminal = { id: 'pvNeg', tipo: 'cc-', rotulo: 'PV−' };
const BAT_POS: DefTerminal = { id: 'batPos', tipo: 'cc+', rotulo: 'BAT+' };
const BAT_NEG: DefTerminal = { id: 'batNeg', tipo: 'cc-', rotulo: 'BAT−' };
const CA_ENTRADA: DefTerminal = { id: 'caEntrada', tipo: 'ca', rotulo: 'Entrada da rede' };
const CA_SAIDA: DefTerminal = { id: 'caSaida', tipo: 'ca', rotulo: 'Saída para os aparelhos' };
const PLUG: DefTerminal = { id: 'plug', tipo: 'ca', rotulo: 'Plugue' };
const TOMADA: DefTerminal = { id: 'tomada', tipo: 'ca', rotulo: 'Tomada da rede' };

/** Terminais de um item, na ordem em que aparecem na peça. Proteções, cabos e acessórios não têm terminais. */
export function terminaisDe(item: Item): DefTerminal[] {
  switch (item.categoria) {
    case 'placa':
    case 'bateria':
      return [POS, NEG];
    case 'inversor': {
      const estacao = item.bateriaInternaWh !== undefined;
      const terminais: DefTerminal[] = [];
      if (item.solar) terminais.push(PV_POS, PV_NEG);
      if (!estacao) terminais.push(BAT_POS, BAT_NEG);
      if (item.solar || estacao) terminais.push(CA_ENTRADA);
      terminais.push(CA_SAIDA);
      return terminais;
    }
    case 'controlador':
      return [PV_POS, PV_NEG, BAT_POS, BAT_NEG];
    case 'aparelho':
      return [PLUG];
    case 'rede':
      return [TOMADA];
    case 'protecao':
    case 'cabo':
    case 'acessorio':
      return [];
  }
}

/** Corrente alternada só liga em corrente alternada. Em corrente contínua qualquer combinação é aceita, para o consultor apontar o erro. */
export function podeLigar(a: TipoTerminal, b: TipoTerminal): boolean {
  return (a === 'ca') === (b === 'ca');
}
