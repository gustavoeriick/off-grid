// Campo do nome de um cômodo, aberto sobre a cena por um clique no piso em "Editar casa". Tarefa 2.6, parte de interface.
// Especificação: docs/especificacao/fase-2.md, seção 4. A cena avisa com o evento `offgrid:nomear-comodo`.

import { comodoNoPonto, NOMES_DE_COMODO, pontoDoNome } from '../cena/regrasDaCasa';
import { acoes, assinar, estado } from '../estado';
import { el, h } from './formato';

interface Pedido {
  andar: 0 | 1;
  x: number;
  z: number;
  clientX: number;
  clientY: number;
}

interface Alvo {
  /** `uid` do cômodo que já dá nome a esta área, ou nulo para criar um. */
  uid: string | null;
  andar: 0 | 1;
  ponto: [number, number];
  nomeAtual: string;
}

/** "Quarto" vira "Quarto 2" quando já existe um cômodo com esse nome em outro lugar da casa. */
function nomeLivre(nome: string, fora: string | null): string {
  const usados = new Set(estado.projeto.casa.comodos.filter((c) => c.uid !== fora).map((c) => c.nome));
  if (!usados.has(nome)) return nome;
  let n = 2;
  while (usados.has(`${nome} ${n}`)) n += 1;
  return `${nome} ${n}`;
}

export function montarCampoDoComodo(): void {
  const centro = el<HTMLElement>('#centro');
  const campo = h('input', { type: 'text', id: 'nome-comodo', maxlength: '30', autocomplete: 'off', placeholder: 'Ex.: Sala' });
  const sugestoes = h('div', { class: 'sugestoes-comodo', role: 'group', 'aria-label': 'Sugestões de nome' });
  for (const nome of NOMES_DE_COMODO) {
    const b = h('button', { type: 'button', 'data-nome': nome }, nome);
    b.addEventListener('click', () => {
      campo.value = nomeLivre(nome, alvo?.uid ?? null);
      confirmar();
    });
    sugestoes.append(b);
  }
  const titulo = h('label', { for: 'nome-comodo' }, 'Nome do cômodo');
  const cancelar = h('button', { type: 'button' }, 'Cancelar');
  const caixa = h(
    'form',
    { id: 'campo-comodo', class: 'campo-comodo', hidden: true, 'aria-label': 'Nome do cômodo' },
    titulo,
    h('div', { class: 'linha-comodo' }, campo, h('button', { type: 'submit', class: 'principal' }, 'OK'), cancelar),
    sugestoes,
    h('p', { class: 'detalhe' }, 'Enter confirma. Deixe vazio para tirar o nome. Esc cancela.'),
  );
  centro.append(caixa);

  let alvo: Alvo | null = null;

  const fechar = (): void => {
    alvo = null;
    caixa.hidden = true;
  };

  const confirmar = (): void => {
    const a = alvo;
    if (!a) return;
    const nome = campo.value.trim();
    fechar();
    // Nada a fazer: área sem nome que continua sem nome, ou o mesmo nome de antes.
    if ((a.uid === null && nome === '') || nome === a.nomeAtual) return;
    acoes.nomearComodo(a.uid, a.andar, a.ponto, nome);
  };

  const abrir = (p: Pedido): void => {
    const casa = estado.projeto.casa;
    const existente = comodoNoPonto(casa, p.andar, p.x, p.z);
    alvo = existente
      ? { uid: existente.uid, andar: p.andar, ponto: existente.ponto, nomeAtual: existente.nome }
      : { uid: null, andar: p.andar, ponto: pontoDoNome(casa, p.andar, p.x, p.z), nomeAtual: '' };
    titulo.textContent = existente ? `Nome do cômodo (hoje: ${existente.nome})` : 'Nome do cômodo';
    campo.value = existente?.nome ?? '';
    caixa.hidden = false;
    // Perto do clique, sem sair da área da cena.
    const r = centro.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.width - caixa.offsetWidth - 8, p.clientX - r.left + 12));
    const y = Math.max(8, Math.min(r.height - caixa.offsetHeight - 8, p.clientY - r.top + 12));
    caixa.style.left = `${x}px`;
    caixa.style.top = `${y}px`;
    campo.focus();
    campo.select();
  };

  caixa.addEventListener('submit', (e) => {
    e.preventDefault();
    confirmar();
  });
  cancelar.addEventListener('click', fechar);
  caixa.addEventListener('keydown', (e) => {
    // As teclas digitadas aqui não chegam aos atalhos da cena (Esc sairia do modo de edição).
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    }
  });
  // Apertar fora do campo desiste dele.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (alvo && e.target instanceof Node && !caixa.contains(e.target)) fechar();
    },
    true,
  );
  window.addEventListener('offgrid:nomear-comodo', (e) => {
    const pedido = (e as CustomEvent<Pedido>).detail;
    if (pedido && estado.edicaoCasa.ativa) abrir(pedido);
  });
  assinar('edicao', fechar);
  // A casa mudou por outro caminho (desfazer, formulário): o campo aberto já não vale.
  assinar('casa', fechar);
}
