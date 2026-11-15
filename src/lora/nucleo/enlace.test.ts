import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, modoDeTeste, perfilDeDistanciaZero, perfilDeTeste, perto, radioDeTeste } from './apoio-de-teste';
import { calcularEnlace, contaDoEnlace, melhorias, vereditoDoEnlace } from './enlace';
import { difracaoDeBullington } from './propagacao';

const sem = radioDeTeste({ alturaDaAntenaM: 8 });

describe('contaDoEnlace', () => {
  it('20 km no ar livre: chega -95,70 dBm, folga 35,30 dB', () => {
    const c = contaDoEnlace(sem, sem, 20, 0, ambienteDeTeste());
    perto(c.arLivreDb, 117.7);
    perto(c.recebidoDbm, -95.7);
    perto(c.folgaDb, 35.3);
    expect(c.sensibilidadeDbm).toBe(-131);
  });

  it('40 km no ar livre: chega -101,72 dBm, folga 29,28 dB', () => {
    const c = contaDoEnlace(sem, sem, 40, 0, ambienteDeTeste());
    perto(c.recebidoDbm, -101.72);
    perto(c.folgaDb, 29.28);
  });

  it('morro de 100 m no meio de 20 km, antenas de 3 dBi e 1 dB de cabo: chega -124,24 dBm, folga 6,76 dB', () => {
    const radio = radioDeTeste({ alturaDaAntenaM: 10, ganhoDbi: 3, perdaNoCaboDb: 0.5 });
    const dif = difracaoDeBullington(perfilDeTeste(20, { 10: 100 }), 10, 10, 915);
    const c = contaDoEnlace(radio, radio, 20, dif.perdaDb, ambienteDeTeste());
    perto(c.recebidoDbm, -124.24);
    perto(c.folgaDb, 6.76);
  });

  it('a margem do ambiente reduz o que chega', () => {
    const a = contaDoEnlace(sem, sem, 20, 0, ambienteDeTeste(915, 0));
    const b = contaDoEnlace(sem, sem, 20, 0, ambienteDeTeste(915, 12));
    perto(a.recebidoDbm - b.recebidoDbm, 12, 1e-9);
  });

  it('distância zero: sem NaN', () => {
    const c = contaDoEnlace(sem, sem, 0, 0, ambienteDeTeste());
    expect(Number.isFinite(c.folgaDb)).toBe(true);
  });
});

describe('vereditoDoEnlace', () => {
  it('limites da tabela', () => {
    expect(vereditoDoEnlace(10, true)).toBe('folga');
    expect(vereditoDoEnlace(9.99, true)).toBe('limite');
    expect(vereditoDoEnlace(50, false)).toBe('limite');
    expect(vereditoDoEnlace(0, false)).toBe('limite');
    expect(vereditoDoEnlace(-0.01, true)).toBe('nao-fecha');
  });
});

describe('calcularEnlace', () => {
  it('plano de 20 km com antenas de 60 m: fecha com folga e diz que a zona está livre', () => {
    const r = calcularEnlace(radioDeTeste({ alturaDaAntenaM: 60 }), radioDeTeste({ alturaDaAntenaM: 60 }), perfilDeTeste(20), ambienteDeTeste());
    expect(r.veredito).toBe('folga');
    perto(r.conta.folgaDb, 35.3);
    expect(r.geometria.zonaLivre).toBe(true);
    expect(r.texto).toContain('Fecha com folga');
    expect(r.texto).toContain('35,3 dB');
    expect(r.texto).toContain('livre');
  });

  it('morro de 100 m no meio de 20 km, 3 dBi e 1 dB de cabo: fecha no limite, folga 6,76', () => {
    const radio = radioDeTeste({ alturaDaAntenaM: 10, ganhoDbi: 3, perdaNoCaboDb: 0.5 });
    const r = calcularEnlace(radio, radio, perfilDeTeste(20, { 10: 100 }), ambienteDeTeste());
    expect(r.veredito).toBe('limite');
    perto(r.conta.folgaDb, 6.76);
    expect(r.difracao.visada).toBe(false);
    expect(r.texto).toContain('6,8 dB');
    expect(r.texto).toContain('o terreno a 10,0 km do começo corta a linha em');
  });

  it('terreno que corta a linha: o texto diz quantos metros', () => {
    const r = calcularEnlace(sem, sem, perfilDeTeste(20, { 10: 48 }), ambienteDeTeste());
    // linha a 8 m, curva 5,89 m, terreno 48 m: corta em 45,89 m, arredonda para cima
    expect(r.texto).toContain('o terreno a 10,0 km do começo corta a linha em 46 m');
  });

  it('linha que passa perto demais: o texto diz a distância e o que o sinal precisa', () => {
    const r = calcularEnlace(radioDeTeste({ alturaDaAntenaM: 20 }), radioDeTeste({ alturaDaAntenaM: 20 }), perfilDeTeste(20), ambienteDeTeste());
    // folga no meio 20 − 5,89 = 14,11 m; 60% de 40,49 m = 24,29 m
    expect(r.geometria.zonaLivre).toBe(false);
    expect(r.texto).toContain('passa a 14 m da linha, e o sinal precisa de 25 m livres');
  });

  it('limite com folga de 10 dB ou mais e zona não livre: avisa que a conta pode estar otimista', () => {
    const r = calcularEnlace(sem, sem, perfilDeTeste(20), ambienteDeTeste());
    expect(r.veredito).toBe('limite');
    expect(r.conta.folgaDb).toBeGreaterThanOrEqual(10);
    expect(r.texto).toContain('otimista');
    expect(r.texto).toContain('teste em campo');
  });

  it('não fecha: o texto diz quantos dB faltam', () => {
    const r = calcularEnlace(sem, sem, perfilDeTeste(20, { 10: 100 }), ambienteDeTeste(915, 20));
    expect(r.veredito).toBe('nao-fecha');
    expect(r.conta.folgaDb).toBeLessThan(0);
    expect(r.texto).toContain('Não fecha');
    expect(r.texto).toContain('faltam');
  });

  it('rádios iguais: mesmo resultado trocando as pontas (perfil espelhado)', () => {
    const picos = { 5: 80, 14: 120 };
    const ida = perfilDeTeste(20, picos);
    const volta = ida.map((p) => ({ dKm: 20 - p.dKm, altM: p.altM })).reverse();
    const radio = radioDeTeste({ alturaDaAntenaM: 10 });
    const r1 = calcularEnlace(radio, radio, ida, ambienteDeTeste());
    const r2 = calcularEnlace(radio, radio, volta, ambienteDeTeste());
    expect(r2.veredito).toBe(r1.veredito);
    perto(r2.conta.folgaDb, r1.conta.folgaDb, 1e-6);
    expect(r2.geometria.zonaLivre).toBe(r1.geometria.zonaLivre);
  });

  it('rádios diferentes: vale a menor folga, nos dois sentidos', () => {
    const forte = radioDeTeste({ alturaDaAntenaM: 60, potenciaDbm: 27 });
    const fraco = radioDeTeste({ alturaDaAntenaM: 60, potenciaDbm: 17 });
    const r = calcularEnlace(forte, fraco, perfilDeTeste(20), ambienteDeTeste());
    perto(r.conta.folgaDb, 35.3 - 5);
    expect(r.conta.potenciaDbm).toBe(17);
    const invertido = calcularEnlace(fraco, forte, perfilDeTeste(20), ambienteDeTeste());
    perto(invertido.conta.folgaDb, r.conta.folgaDb, 1e-9);
  });

  it('antenas de alturas diferentes: a geometria usa as duas', () => {
    const r = calcularEnlace(radioDeTeste({ alturaDaAntenaM: 6 }), radioDeTeste({ alturaDaAntenaM: 30 }), perfilDeTeste(20), ambienteDeTeste());
    expect(r.geometria.antenaInicioM).toBe(6);
    expect(r.geometria.antenaFimM).toBe(30);
    perto(r.geometria.pontos[100].linhaM, 18);
  });

  it('perfil de dois pontos: sem pontos do meio, zona livre, sem NaN', () => {
    const r = calcularEnlace(
      sem,
      sem,
      [
        { dKm: 0, altM: 0 },
        { dKm: 5, altM: 0 },
      ],
      ambienteDeTeste(),
    );
    expect(r.geometria.zonaLivre).toBe(true);
    expect(r.veredito).toBe('folga');
    expect(Number.isFinite(r.conta.folgaDb)).toBe(true);
    expect(r.texto).not.toContain('NaN');
  });

  it('pontos coincidentes (distância zero): decisão documentada, sem NaN nem erro', () => {
    const r = calcularEnlace(sem, sem, perfilDeDistanciaZero(), ambienteDeTeste());
    expect(r.conta.arLivreDb).toBe(0);
    expect(Number.isFinite(r.conta.folgaDb)).toBe(true);
    expect(r.texto).not.toContain('NaN');
  });
});

describe('melhorias', () => {
  const nomes: [string, string] = ['Casa A', 'Casa B'];

  it('enlace que fecha com folga: nenhuma melhoria', () => {
    const alto = radioDeTeste({ alturaDaAntenaM: 60 });
    expect(melhorias(alto, alto, nomes, perfilDeTeste(20), ambienteDeTeste())).toEqual([]);
  });

  it('enlace no limite: antenas mais altas, modo seguinte e ganhos, cada um recalculado', () => {
    const lista = melhorias(sem, sem, nomes, perfilDeTeste(20, { 10: 100 }), ambienteDeTeste(915, 20));
    const rotulos = lista.map((m) => m.rotulo);
    expect(rotulos).toContain('Subir a antena de Casa A para 10 m');
    expect(rotulos).toContain('Subir a antena de Casa B para 20 m');
    expect(rotulos).toContain('Trocar o modo para Long Moderate');
    expect(rotulos).toContain('Usar antena de 6 dBi em Casa A');
    // 8 m: 6 m é menor que a altura atual e não aparece
    expect(rotulos).not.toContain('Subir a antena de Casa A para 6 m');
    // 4 alturas (3 válidas) x 2 pontas + modo + 3 ganhos x 2 pontas
    expect(lista).toHaveLength(3 * 2 + 1 + 3 * 2);
    // conferir uma conta: modo Long Moderate dá 3 dB a mais de folga
    const base = calcularEnlace(sem, sem, perfilDeTeste(20, { 10: 100 }), ambienteDeTeste(915, 20));
    const modo = lista.find((m) => m.rotulo === 'Trocar o modo para Long Moderate')!;
    perto(modo.folgaDb, base.conta.folgaDb + 3);
    // 3 dBi em uma ponta soma 3 dB nos dois sentidos
    const ganho = lista.find((m) => m.rotulo === 'Usar antena de 3 dBi em Casa A')!;
    perto(ganho.folgaDb, base.conta.folgaDb + 3);
    // 20 m em uma ponta dá mais folga que 10 m
    const h10 = lista.find((m) => m.rotulo === 'Subir a antena de Casa A para 10 m')!;
    const h20 = lista.find((m) => m.rotulo === 'Subir a antena de Casa A para 20 m')!;
    expect(h20.folgaDb).toBeGreaterThan(h10.folgaDb);
  });

  it('não repete mudança que não altera nada', () => {
    const alta = radioDeTeste({ alturaDaAntenaM: 20, ganhoDbi: 9 });
    const lista = melhorias(alta, alta, nomes, perfilDeTeste(20, { 10: 300 }), ambienteDeTeste(915, 0, 'long-moderate'));
    // altura 20 m e ganho 9 dBi já são o máximo da lista; Long Moderate é o último modo
    expect(lista).toEqual([]);
  });

  it('modo de entrada que não está na tabela: não sugere troca de modo', () => {
    const modoEstranho = { ...modoDeTeste(), id: 'outro' };
    const lista = melhorias(sem, sem, nomes, perfilDeTeste(20, { 10: 100 }), { ...ambienteDeTeste(915, 20), modo: modoEstranho });
    expect(lista.some((m) => m.rotulo.startsWith('Trocar o modo'))).toBe(false);
  });

  it('antena de 9 dBi com potência 30 dBm dispara o aviso da regra, só nas mudanças que disparam', () => {
    const forte = radioDeTeste({ alturaDaAntenaM: 8, potenciaDbm: 30, ganhoDbi: 0 });
    const lista = melhorias(forte, forte, nomes, perfilDeTeste(20, { 10: 100 }), ambienteDeTeste(915, 25, 'long-turbo'));
    const nove = lista.find((m) => m.rotulo === 'Usar antena de 9 dBi em Casa A')!;
    expect(nove.aviso).toContain('27 dBm');
    expect(nove.aviso).toContain('Confira a regra vigente na Anatel.');
    const tres = lista.find((m) => m.rotulo === 'Usar antena de 3 dBi em Casa A')!;
    expect(tres.aviso).toBeUndefined();
  });
});
