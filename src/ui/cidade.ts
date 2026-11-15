// Seletor de cidade na aba Sistema (tarefa 5.1). O Rio de Janeiro da lista fixa usa o local fixo, sem baixar nada;
// as outras capitais baixam as médias mensais da NASA POWER e, só se der certo, a cidade do projeto muda.

import { CIDADES, type Cidade } from '../dados/cidades';
import { baixarLocal } from '../dados/nasaPower';
import { acoes, assinar, estado } from '../estado';
import { localDoProjeto, localPorId } from '../nucleo/irradiancia';
import { el, h } from './formato';

const ID_RIO = 'rio';

const rotulo = (c: Cidade): string => `${c.nome} (${c.uf})`;
const idDaCidade = (c: Cidade): string => `local-${c.lat.toFixed(2)}-${c.lon.toFixed(2)}`;

/** Índice, em `CIDADES`, da cidade do projeto. -1 se for outro local (um projeto importado, por exemplo). */
function indiceAtual(): number {
  const id = estado.projeto.localId;
  if (id === ID_RIO) return CIDADES.findIndex((c) => c.nome === 'Rio de Janeiro');
  return CIDADES.findIndex((c) => idDaCidade(c) === id);
}

export function montarCidade(): void {
  const seletor = h('select', { id: 'seletor-cidade', 'aria-label': 'Cidade' });
  CIDADES.forEach((c, i) => seletor.append(new Option(rotulo(c), String(i))));
  const fora = new Option('', 'fora');
  fora.hidden = true;
  seletor.append(fora);

  const situacao = h('p', { id: 'cidade-situacao', class: 'detalhe', role: 'status' });
  el('#sistema-cidade').replaceChildren(
    h('h4', null, 'Cidade'),
    seletor,
    situacao,
    h('p', { class: 'detalhe' }, 'Muda a luz do sol (a irradiação média de cada mês), a temperatura e o fuso. As médias vêm da NASA POWER; só a latitude e a longitude da cidade são enviadas.'),
  );

  let pedido = 0;
  let mensagem = '';
  let baixando = false;

  const desenhar = (): void => {
    const i = indiceAtual();
    if (i >= 0) seletor.value = String(i);
    else {
      fora.textContent = localDoProjeto(estado.projeto)?.nome ?? estado.projeto.localId;
      seletor.value = 'fora';
    }
    seletor.disabled = baixando;
    const texto = baixando ? 'baixando…' : mensagem;
    situacao.hidden = texto === '';
    situacao.classList.toggle('erro', !baixando && mensagem !== '');
    if (situacao.textContent !== texto) situacao.textContent = texto;
  };

  seletor.addEventListener('change', () => {
    const cidade = CIDADES[Number(seletor.value)];
    if (!cidade) return;
    mensagem = '';
    if (cidade.nome === 'Rio de Janeiro') {
      const rio = localPorId(ID_RIO);
      pedido += 1;
      baixando = false;
      if (rio) acoes.definirLocal(rio);
      desenhar();
      return;
    }
    const meu = ++pedido;
    baixando = true;
    desenhar();
    baixarLocal(cidade.nome, cidade.lat, cidade.lon, cidade.fuso).then(
      (local) => {
        if (meu !== pedido) return;
        baixando = false;
        acoes.definirLocal(local);
        desenhar();
      },
      (erro: unknown) => {
        if (meu !== pedido) return;
        baixando = false;
        mensagem = `${erro instanceof Error ? erro.message : 'Não consegui baixar os dados da cidade.'} A cidade continua ${localDoProjeto(estado.projeto)?.nome ?? 'a mesma'}.`;
        desenhar();
      },
    );
  });

  assinar('projeto', desenhar);
  desenhar();
}
