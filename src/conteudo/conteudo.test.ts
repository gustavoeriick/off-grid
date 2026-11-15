// Conferência do conteúdo didático: toda regra do consultor tem "Por quê?",
// todo termo citado existe no glossário, ids únicos e textos dentro do tamanho.

import { describe, expect, it } from 'vitest';
import fonteDoConsultor from '../nucleo/consultor.ts?raw';
import { GLOSSARIO } from './glossario';
import { PORQUE } from './porque';
import { AVISOS_DE_SEGURANCA } from './seguranca';

const LIMITE = 600;

/** Regras que consultor.ts emite, lidas do código-fonte. */
function regrasDoConsultor(fonte: string): string[] {
  const regras = new Set<string>();
  // sugerir({ regra: 'nome-da-regra', ... })
  for (const m of fonte.matchAll(/regra:\s*'([a-z0-9-]+)'/g)) regras.add(m[1]);
  // Tabela LIGACAO: ['codigo', 'nivel', titulo, texto], emitida com `regra: codigo`.
  for (const m of fonte.matchAll(/\[\s*'([a-z0-9-]+)',\s*'(?:erro|alerta|dica)'/g)) regras.add(m[1]);
  return [...regras];
}

describe('conteúdo', () => {
  const regras = regrasDoConsultor(fonteDoConsultor);
  const ids = new Set(GLOSSARIO.map((t) => t.id));

  it('a leitura de consultor.ts não deixa forma de `regra:` desconhecida', () => {
    const formas = [...fonteDoConsultor.matchAll(/\bregra:\s*([^,}\s]+)/g)].map((m) => m[1]);
    // `regra: string` é a declaração do tipo; `regra: codigo` vem da tabela LIGACAO.
    const outras = formas.filter((f) => !f.startsWith("'") && f !== 'codigo' && f !== 'string');
    expect(outras).toEqual([]);
    expect(regras.length).toBeGreaterThan(40);
    expect(regras).toContain('sem-inversor');
    expect(regras).toContain('quadro-cheio');
  });

  it('toda regra do consultor tem "Por quê?"', () => {
    expect(regras.filter((r) => !(r in PORQUE))).toEqual([]);
  });

  it('PORQUE não tem regra que o consultor não emite', () => {
    expect(Object.keys(PORQUE).filter((r) => !regras.includes(r))).toEqual([]);
  });

  it('todo termo citado existe no glossário', () => {
    const faltam: string[] = [];
    for (const [regra, p] of Object.entries(PORQUE)) for (const t of p.termos) if (!ids.has(t)) faltam.push(`${regra}: ${t}`);
    for (const g of GLOSSARIO) for (const t of g.veja ?? []) if (!ids.has(t)) faltam.push(`${g.id}: ${t}`);
    expect(faltam).toEqual([]);
  });

  it('ids únicos', () => {
    expect(ids.size).toBe(GLOSSARIO.length);
    expect(new Set(AVISOS_DE_SEGURANCA.map((a) => a.id)).size).toBe(AVISOS_DE_SEGURANCA.length);
  });

  it('nenhum termo aponta para si mesmo', () => {
    expect(GLOSSARIO.filter((g) => g.veja?.includes(g.id)).map((g) => g.id)).toEqual([]);
  });

  it('nenhum texto vazio nem com mais de 600 caracteres', () => {
    const textos: [string, string][] = [
      ...Object.entries(PORQUE).map(([r, p]): [string, string] => [`porque ${r}`, p.texto]),
      ...GLOSSARIO.flatMap((g): [string, string][] => [
        [`termo ${g.id}`, g.termo],
        [`curto ${g.id}`, g.curto],
        [`texto ${g.id}`, g.texto],
      ]),
      ...AVISOS_DE_SEGURANCA.flatMap((a): [string, string][] => [
        [`titulo ${a.id}`, a.titulo],
        [`texto ${a.id}`, a.texto],
        [`quando ${a.id}`, a.quando],
      ]),
    ];
    const ruins = textos
      .filter(([, t]) => t.trim().length === 0 || t.length > LIMITE)
      .map(([onde, t]) => `${onde} (${t.length})`);
    expect(ruins).toEqual([]);
  });

  it('todo "Por quê?" cita pelo menos um termo', () => {
    expect(Object.entries(PORQUE).filter(([, p]) => p.termos.length === 0).map(([r]) => r)).toEqual([]);
  });

  it('os avisos cobrem os cinco temas', () => {
    const temas = new Set(AVISOS_DE_SEGURANCA.map((a) => a.tema));
    expect([...temas].sort()).toEqual(['bateria', 'corrente-alternada', 'geral', 'placas', 'telhado']);
  });
});
