// O tutorial "Meu primeiro enlace" percorrido com um projeto feito à mão: cada passo fica feito quando deveria, e não antes.

import { describe, expect, it } from 'vitest';
import type { SelecaoLora } from '../estado';
import type { PontoLora, ProjetoLora, Veredito } from '../nucleo/tipos';
import {
  idsFeitos,
  indiceDoPassoAtual,
  passosFeitos,
  repetidorLigado,
  textoDoPasso,
  TUTORIAL_LORA,
  type ContextoDoPasso,
  type SituacaoDaRota,
} from './tutorial';

const ponto = (id: string, tipo: PontoLora['tipo'], lat: number, lon: number): PontoLora => ({
  id, nome: id, tipo, lat, lon, alturaDaAntenaM: 6, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0,
});

const vazio = (): ProjetoLora => ({
  versao: 1, nome: 'Teste', regiao: 'ANZ', modo: 'long-fast', margemDoAmbienteDb: 0, limiteDeSaltos: 3, pontos: [], enlaces: [],
});

const ordem = TUTORIAL_LORA.passos.map((p) => p.id);
const indice = (id: string): number => {
  const i = ordem.indexOf(id);
  if (i < 0) throw new Error(`passo ${id} não existe`);
  return i;
};

/** Uma sessão de tela de mentira: projeto, seleção, vereditos e os passos vistos. */
function sessao() {
  const projeto = vazio();
  const vistos = new Set<string>();
  let selecao: SelecaoLora = null;
  const vereditos = new Map<string, Veredito | 'calculando'>();
  let rota: SituacaoDaRota = 'calculando';
  const chave = (a: string, b: string) => [a, b].sort().join('|');
  const contexto = (): ContextoDoPasso => ({
    selecao,
    vereditoDe: (de, para) => vereditos.get(chave(de, para)) ?? null,
    rota: () => rota,
    vistos,
  });
  return {
    projeto,
    contexto,
    selecionar(s: SelecaoLora) { selecao = s; },
    veredito(a: string, b: string, v: Veredito | 'calculando') { vereditos.set(chave(a, b), v); },
    rota(r: SituacaoDaRota) { rota = r; },
    continuar(id: string) { vistos.add(id); },
    /** O que a tela faz depois de cada mudança: guarda os passos feitos. */
    fixar() { for (const id of idsFeitos(projeto, contexto())) vistos.add(id); },
    atual: () => indiceDoPassoAtual(projeto, contexto()),
  };
}

describe('tutorial "Meu primeiro enlace"', () => {
  it('todo passo tem título e texto, e leitura tem "Continuar"', () => {
    for (const p of TUTORIAL_LORA.passos) {
      expect(p.titulo.length).toBeGreaterThan(0);
      if (p.acao === 'continuar') {
        const s = sessao();
        expect(p.feito(s.projeto, s.contexto())).toBe(false);
        s.continuar(p.id);
        expect(p.feito(s.projeto, s.contexto())).toBe(true);
      }
    }
  });

  it('percorre os passos na ordem', () => {
    const s = sessao();
    const p = s.projeto;

    expect(passosFeitos(p, s.contexto()).every((f) => !f)).toBe(true);
    expect(s.atual()).toBe(indice('o-que-e'));
    s.continuar('o-que-e');
    expect(s.atual()).toBe(indice('primeiro-ponto'));

    p.pontos.push(ponto('a', 'casa', -10, -50));
    s.fixar();
    expect(s.atual()).toBe(indice('segundo-ponto'));

    p.pontos.push(ponto('b', 'casa', -10.1, -50.1));
    s.fixar();
    expect(s.atual()).toBe(indice('ligar'));

    p.enlaces.push({ de: 'a', para: 'b' });
    s.veredito('a', 'b', 'calculando');
    s.fixar();
    expect(s.atual()).toBe(indice('selecionar-enlace'));

    // Selecionar um ponto, ou o enlace ainda calculando, não conta.
    s.selecionar({ tipo: 'ponto', id: 'a' });
    s.fixar();
    expect(s.atual()).toBe(indice('selecionar-enlace'));
    s.selecionar({ tipo: 'enlace', de: 'a', para: 'b' });
    s.fixar();
    expect(s.atual()).toBe(indice('selecionar-enlace'));
    s.veredito('a', 'b', 'nao-fecha');
    s.fixar();
    expect(s.atual()).toBe(indice('ler-veredito'));

    // Tirar a seleção não volta o passo.
    s.selecionar(null);
    s.fixar();
    expect(s.atual()).toBe(indice('ler-veredito'));

    s.continuar('ler-veredito');
    expect(s.atual()).toBe(indice('ler-corte'));
    s.continuar('ler-corte');
    expect(s.atual()).toBe(indice('mudar-altura'));

    p.pontos[0] = { ...p.pontos[0]!, alturaDaAntenaM: 15 };
    s.fixar();
    expect(s.atual()).toBe(indice('o-que-mudar'));
    s.continuar('o-que-mudar');
    expect(s.atual()).toBe(indice('repetidor'));

    // Um repetidor solto, ou ligado a uma ponta só, não conta.
    p.pontos.push(ponto('r', 'repetidor', -10.05, -50.05));
    s.fixar();
    expect(s.atual()).toBe(indice('repetidor'));
    p.enlaces.push({ de: 'a', para: 'r' });
    s.fixar();
    expect(s.atual()).toBe(indice('repetidor'));
    p.enlaces.push({ de: 'b', para: 'r' });
    s.fixar();
    expect(s.atual()).toBe(indice('ler-rota'));

    s.continuar('ler-rota');
    expect(s.atual()).toBe(indice('repetidor-solar'));
    s.continuar('repetidor-solar');
    expect(s.atual()).toBe(indice('proximos-passos'));
    s.continuar('proximos-passos');
    expect(s.atual()).toBe(-1);
  });

  it('a altura padrão não conta como mudança, e voltar a 6 m depois não desfaz o passo', () => {
    const s = sessao();
    const passo = TUTORIAL_LORA.passos[indice('mudar-altura')]!;
    s.projeto.pontos.push(ponto('a', 'casa', -10, -50), ponto('b', 'casa', -10.1, -50.1));
    expect(passo.feito(s.projeto, s.contexto())).toBe(false);
    s.projeto.pontos[1] = { ...s.projeto.pontos[1]!, alturaDaAntenaM: 10 };
    s.fixar();
    s.projeto.pontos[1] = { ...s.projeto.pontos[1]!, alturaDaAntenaM: 6 };
    expect(passo.feito(s.projeto, s.contexto())).toBe(true);
  });

  it('o repetidor precisa ser do tipo repetidor', () => {
    const p = vazio();
    p.pontos.push(ponto('a', 'casa', 0, 0), ponto('b', 'casa', 0, 1), ponto('c', 'casa', 0, 2));
    p.enlaces.push({ de: 'a', para: 'b' }, { de: 'b', para: 'c' });
    expect(repetidorLigado(p)).toBeNull();
    p.pontos[1] = { ...p.pontos[1]!, tipo: 'repetidor' };
    expect(repetidorLigado(p)?.pontas.sort()).toEqual(['a', 'c']);
  });

  it('os textos mudam com o resultado do enlace e da rota', () => {
    const s = sessao();
    s.projeto.pontos.push(ponto('a', 'casa', -10, -50), ponto('b', 'casa', -10.1, -50.1), ponto('r', 'repetidor', -10.05, -50.05));
    s.projeto.enlaces.push({ de: 'a', para: 'b' }, { de: 'a', para: 'r' }, { de: 'b', para: 'r' });
    const veredito = TUTORIAL_LORA.passos[indice('ler-veredito')]!;
    const rota = TUTORIAL_LORA.passos[indice('ler-rota')]!;

    s.veredito('a', 'b', 'folga');
    const comFolga = textoDoPasso(veredito, s.projeto, s.contexto());
    s.veredito('a', 'b', 'nao-fecha');
    const semFechar = textoDoPasso(veredito, s.projeto, s.contexto());
    expect(comFolga).toContain('fecha com folga');
    expect(semFechar).toContain('não fecha');
    expect(comFolga).not.toBe(semFechar);

    s.rota('passa-do-limite');
    expect(textoDoPasso(rota, s.projeto, s.contexto())).toContain('limite de saltos');
    s.rota('fecha');
    expect(textoDoPasso(rota, s.projeto, s.contexto())).toContain('fecha com folga');
  });
});
