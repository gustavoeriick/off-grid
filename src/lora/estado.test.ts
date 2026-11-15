// Testes do estado do ambiente de rádio LoRa. Os pontos ficam em lugares neutros, sem relação com casa nenhuma.

import { beforeEach, describe, expect, it } from 'vitest';
import { acoesLora, conferirProjeto, estadoLora, PONTO_PADRAO } from './estado';

describe('estado do LoRa', () => {
  beforeEach(() => {
    for (const p of acoesLora.listarProjetos().filter((x) => !x.atual)) acoesLora.apagarProjeto(p.id);
    acoesLora.criarProjeto('Teste', 'vazio');
    for (const p of acoesLora.listarProjetos().filter((x) => !x.atual)) acoesLora.apagarProjeto(p.id);
  });

  it('o projeto novo começa sem ponto nenhum, no modo e na região padrão', () => {
    expect(estadoLora.projeto.pontos).toEqual([]);
    expect(estadoLora.projeto.enlaces).toEqual([]);
    expect(estadoLora.projeto.regiao).toBe('ANZ');
    expect(estadoLora.projeto.modo).toBe('long-fast');
    expect(estadoLora.projeto.limiteDeSaltos).toBe(3);
  });

  it('pontos, enlaces, desfazer e refazer', () => {
    const a = acoesLora.adicionarPonto(-10, -50, 'casa', 'A');
    const b = acoesLora.adicionarPonto(-10.2, -50.3, 'casa');
    expect(estadoLora.projeto.pontos[0]).toMatchObject({ id: a, nome: 'A', tipo: 'casa', ...PONTO_PADRAO });
    expect(estadoLora.projeto.pontos[1]!.nome).toBe('Ponto 2');
    expect(acoesLora.ligar(a, b)).toBe(true);
    expect(acoesLora.ligar(b, a)).toBe(false);
    expect(acoesLora.ligar(a, a)).toBe(false);
    expect(acoesLora.ligar(a, 'nao-existe')).toBe(false);
    acoesLora.selecionar({ tipo: 'enlace', de: a, para: b });
    acoesLora.removerPonto(b);
    expect(estadoLora.projeto.enlaces).toEqual([]);
    expect(estadoLora.selecao).toBeNull();
    acoesLora.desfazer();
    expect(estadoLora.projeto.pontos).toHaveLength(2);
    expect(estadoLora.projeto.enlaces).toEqual([{ de: a, para: b }]);
    acoesLora.refazer();
    expect(estadoLora.projeto.pontos).toHaveLength(1);
  });

  it('valores fora dos limites são cortados; arraste sem histórico volta em um desfazer', () => {
    const a = acoesLora.adicionarPonto(0, 0, 'repetidor');
    acoesLora.alterarPonto(a, { potenciaDbm: 99, alturaDaAntenaM: -3, ganhoDbi: Number.NaN });
    expect(estadoLora.projeto.pontos[0]).toMatchObject({ potenciaDbm: 30, alturaDaAntenaM: 1, ganhoDbi: 0, nome: 'Repetidor 1' });
    acoesLora.marcarHistorico();
    acoesLora.alterarPonto(a, { lat: 1 }, { historico: false });
    acoesLora.alterarPonto(a, { lat: 2 }, { historico: false });
    acoesLora.desfazer();
    expect(estadoLora.projeto.pontos[0]!.lat).toBe(0);
    acoesLora.configurar({ margemDoAmbienteDb: 500, limiteDeSaltos: 0, regiao: 'BR_902' });
    expect(estadoLora.projeto).toMatchObject({ margemDoAmbienteDb: 40, limiteDeSaltos: 1, regiao: 'BR_902' });
  });

  it('pôr um repetidor cria o ponto e os dois enlaces em um passo só de desfazer', () => {
    const a = acoesLora.adicionarPonto(-10, -50, 'casa', 'A');
    const b = acoesLora.adicionarPonto(-10.2, -50.3, 'casa', 'B');
    acoesLora.ligar(a, b);
    const antes = JSON.stringify(estadoLora.projeto);
    const r = acoesLora.porRepetidor(-10.1, -50.1, a, b)!;
    expect(estadoLora.projeto.pontos.find((p) => p.id === r)).toMatchObject({ tipo: 'repetidor', nome: 'Repetidor 1', ...PONTO_PADRAO });
    expect(estadoLora.projeto.enlaces).toEqual([{ de: a, para: b }, { de: a, para: r }, { de: b, para: r }]);
    acoesLora.desfazer();
    expect(JSON.stringify(estadoLora.projeto)).toBe(antes);
    expect(acoesLora.porRepetidor(0, 0, a, 'nao-existe')).toBeNull();
    expect(acoesLora.porRepetidor(0, 0, a, a)).toBeNull();
  });

  it('arquivo que não é projeto de rádio é recusado; ponto sem posição também', () => {
    expect(() => conferirProjeto({ versao: 2, nome: 'solar', casa: {} })).toThrow();
    expect(() => conferirProjeto({ versao: 1, pontos: [{ id: 'x', lat: 200, lon: 0 }], enlaces: [] })).toThrow();
    const antes = acoesLora.listarProjetos().length;
    expect(() => acoesLora.importarProjeto({ nada: true })).toThrow();
    expect(acoesLora.listarProjetos()).toHaveLength(antes);
  });

  it('meus projetos: criar, trocar, renomear, duplicar, importar e apagar', () => {
    const primeiro = acoesLora.listarProjetos().find((p) => p.atual)!.id;
    // O nome do primeiro projeto depende da ordem dos testes: fixa um, para o teste não depender dela.
    acoesLora.renomearProjeto(primeiro, 'Rede A');
    acoesLora.adicionarPonto(-10, -50, 'casa', 'A');
    const daPrimeira = JSON.stringify(estadoLora.projeto);
    const segundo = acoesLora.criarProjeto('Outra rede', 'vazio');
    expect(estadoLora.projeto.pontos).toEqual([]);
    acoesLora.desfazer();
    expect(estadoLora.projeto.nome).toBe('Outra rede');
    expect(acoesLora.abrirProjeto(primeiro)).toBe(true);
    expect(JSON.stringify(estadoLora.projeto)).toBe(daPrimeira);
    acoesLora.renomearProjeto(segundo, 'Rede A');
    const copia = acoesLora.duplicarProjeto(primeiro)!;
    const nomes = Object.fromEntries(acoesLora.listarProjetos().map((p) => [p.id, p.nome]));
    expect(nomes[segundo]).toBe('Rede A (2)');
    expect(nomes[copia]).toBe('Rede A (cópia)');
    acoesLora.importarProjeto(JSON.parse(acoesLora.exportarProjeto()));
    expect(acoesLora.listarProjetos()).toHaveLength(4);
    expect(estadoLora.projeto.pontos).toHaveLength(1);
    for (const p of acoesLora.listarProjetos()) acoesLora.apagarProjeto(p.id);
    expect(acoesLora.listarProjetos()).toHaveLength(1);
    expect(estadoLora.projeto.pontos).toEqual([]);
  });
});
