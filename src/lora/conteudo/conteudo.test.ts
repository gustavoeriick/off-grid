// Conferência do conteúdo de LoRa: ids únicos, referências que existem, nenhum texto vazio e nenhum termo proibido.

import { describe, expect, it } from 'vitest';
import type { ProjetoLora, Veredito } from '../nucleo/tipos';
import { GLOSSARIO_LORA, LINK_MESHBRASIL, termoLora } from './glossario';
import { PORQUE_LORA } from './porque';
import { REGRAS_DA_ANATEL } from './regras';
import { TUTORIAL_LORA, textoDoPasso, type ContextoDoPasso, type SituacaoDaRota } from './tutorial';

const PROIBIDOS = ['—', 'basicamente', 'simplesmente', 'é importante notar', 'vale ressaltar'];

/** Um projeto com duas casas, um repetidor ligado às duas e o enlace direto. */
const projeto: ProjetoLora = {
  versao: 1,
  nome: 'Teste',
  regiao: 'ANZ',
  modo: 'long-fast',
  margemDoAmbienteDb: 0,
  limiteDeSaltos: 3,
  pontos: [
    { id: 'a', nome: 'Ponto 1', tipo: 'casa', lat: -10, lon: -50, alturaDaAntenaM: 6, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0 },
    { id: 'b', nome: 'Ponto 2', tipo: 'casa', lat: -10.1, lon: -50.1, alturaDaAntenaM: 6, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0 },
    { id: 'r', nome: 'Repetidor 1', tipo: 'repetidor', lat: -10.05, lon: -50.05, alturaDaAntenaM: 6, potenciaDbm: 22, ganhoDbi: 0, perdaNoCaboDb: 0 },
  ],
  enlaces: [
    { de: 'a', para: 'b' },
    { de: 'a', para: 'r' },
    { de: 'b', para: 'r' },
  ],
};

/** Todos os textos que o conteúdo pode mostrar, com o lugar de onde vêm. */
function todosOsTextos(): [string, string][] {
  const textos: [string, string][] = [];
  for (const t of GLOSSARIO_LORA) textos.push([`termo ${t.id}`, t.termo], [`curto ${t.id}`, t.curto], [`texto ${t.id}`, t.texto]);
  for (const t of GLOSSARIO_LORA) if (t.link) textos.push([`link ${t.id}`, t.link.rotulo], [`link ${t.id}`, t.link.nota ?? 'x']);
  for (const [id, p] of Object.entries(PORQUE_LORA)) textos.push([`porque ${id}`, p.texto]);
  for (const b of REGRAS_DA_ANATEL) textos.push([`regra ${b.titulo}`, b.titulo], [`regra ${b.titulo}`, b.texto]);
  textos.push(['tutorial titulo', TUTORIAL_LORA.titulo], ['tutorial paraQuem', TUTORIAL_LORA.paraQuem]);
  const vereditos: (Veredito | 'calculando' | 'erro' | null)[] = ['folga', 'limite', 'nao-fecha', 'calculando', 'erro', null];
  const rotas: SituacaoDaRota[] = ['fecha', 'limite', 'nao-fecha', 'sem-ligacao', 'passa-do-limite', 'calculando'];
  for (const p of TUTORIAL_LORA.passos) {
    textos.push([`passo ${p.id} titulo`, p.titulo]);
    if (p.dica !== undefined) textos.push([`passo ${p.id} dica`, p.dica]);
    for (const v of vereditos) {
      for (const r of rotas) {
        for (const selecao of [null, { tipo: 'enlace' as const, de: 'a', para: 'b' }]) {
          const c: ContextoDoPasso = { selecao, vereditoDe: () => v, rota: () => r, vistos: new Set() };
          textos.push([`passo ${p.id} (${v}, ${r})`, textoDoPasso(p, projeto, c)]);
          textos.push([`passo ${p.id} sem repetidor (${v}, ${r})`, textoDoPasso(p, { ...projeto, pontos: projeto.pontos.slice(0, 2), enlaces: projeto.enlaces.slice(0, 1) }, c)]);
        }
      }
    }
  }
  return textos;
}

describe('conteúdo de LoRa', () => {
  const ids = new Set(GLOSSARIO_LORA.map((t) => t.id));

  it('ids únicos', () => {
    expect(ids.size).toBe(GLOSSARIO_LORA.length);
    expect(new Set(TUTORIAL_LORA.passos.map((p) => p.id)).size).toBe(TUTORIAL_LORA.passos.length);
    expect(new Set(REGRAS_DA_ANATEL.map((b) => b.titulo)).size).toBe(REGRAS_DA_ANATEL.length);
  });

  it('todo "veja" aponta para um termo que existe, e nenhum aponta para si mesmo', () => {
    const ruins: string[] = [];
    for (const t of GLOSSARIO_LORA) for (const v of t.veja ?? []) if (!ids.has(v) || v === t.id) ruins.push(`${t.id} → ${v}`);
    expect(ruins).toEqual([]);
  });

  it('todo termo citado em um "por quê?" existe, e todo "por quê?" cita algum', () => {
    const ruins: string[] = [];
    for (const [id, p] of Object.entries(PORQUE_LORA)) {
      if (p.termos.length === 0) ruins.push(`${id}: sem termos`);
      for (const t of p.termos) if (!ids.has(t)) ruins.push(`${id}: ${t}`);
    }
    expect(ruins).toEqual([]);
  });

  it('links para fora: só https, com rótulo, e o da MeshBrasil está em "rede em malha"', () => {
    for (const t of GLOSSARIO_LORA) {
      if (!t.link) continue;
      expect(t.link.url.startsWith('https://')).toBe(true);
      expect(t.link.rotulo.trim()).not.toBe('');
    }
    expect(LINK_MESHBRASIL.url).toBe('https://www.meshbrasil.com/mapa-meshtastic-brasil.html');
    expect(LINK_MESHBRASIL.rotulo).toBe('Ver nós ativos no Brasil (MeshBrasil)');
    expect(termoLora('rede-em-malha')?.link).toBe(LINK_MESHBRASIL);
  });

  it('termoLora acha pelo id', () => {
    expect(termoLora('zona-de-fresnel')?.termo).toBe('Zona de Fresnel');
    expect(termoLora('nao-existe')).toBeUndefined();
  });

  it('o glossário cobre os termos pedidos', () => {
    const pedidos = [
      'lora', 'meshtastic', 'radio', 'frequencia', 'regiao', 'modo', 'potencia', 'decibel', 'antena', 'ganho', 'cabo-coaxial',
      'conector', 'enlace', 'visada', 'perda-no-ar-livre', 'relevo', 'corte-do-terreno', 'curva-da-terra', 'zona-de-fresnel',
      'difracao', 'folga', 'sensibilidade', 'veredito', 'margem-do-ambiente', 'repetidor', 'salto', 'rota', 'rede-em-malha',
      'homologacao', 'radiacao-restrita', 'repetidor-solar', 'teste-de-campo',
    ];
    expect(pedidos.filter((p) => !ids.has(p))).toEqual([]);
  });

  it('nenhum texto vazio', () => {
    expect(todosOsTextos().filter(([, t]) => t.trim().length === 0).map(([onde]) => onde)).toEqual([]);
  });

  it('nenhum texto com termo proibido', () => {
    const ruins: string[] = [];
    for (const [onde, t] of todosOsTextos()) {
      const baixo = t.toLowerCase();
      for (const p of PROIBIDOS) if (baixo.includes(p)) ruins.push(`${onde}: "${p}"`);
    }
    expect(ruins).toEqual([]);
  });

  it('o repetidor nunca aparece como quem amplifica', () => {
    const ruins = todosOsTextos().filter(([, t]) => /repetidor[^.]*\bamplifica/i.test(t) && !/não amplifica/i.test(t));
    expect(ruins.map(([onde]) => onde)).toEqual([]);
  });
});
