import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../catalogo';
import type { Aparelho, Catalogo, EntradaSolar, Inversor, Item, Placa } from '../catalogo/tipos';
import { cenarioPlanoCorrigido, cenarioPlanoNoPapel } from './cenarios';
import { estadoInicial, estadoPlaca, infoBanco, passoSimulacao, saidaArranjo, vmpQuente, vocFrio } from './eletrica';
import type { AnaliseCircuito, CondicaoPlaca, Dispositivo, EntradaPasso, EstadoPlaca, EstadoSim, Projeto, Sistema } from './tipos';

const placa = CATALOGO.get('placa-renepv-585') as Placa;
const anenji = CATALOGO.get('inv-anenji-3kw-24v-127') as Inversor;
const ANENJI = anenji.solar as EntradaSolar;
const EPEVER = (CATALOGO.get('ctl-epever-xtra4210n') as unknown as { solar: EntradaSolar }).solar;
const PWM = (CATALOGO.get('ctl-pwm-30a') as unknown as { solar: EntradaSolar }).solar;
const TENSAO_CARGA = 28.08;

function perto(real: number, esperado: number, tol?: number) {
  const t = tol ?? Math.max(Math.abs(esperado) * 0.005, 0.01);
  expect(Math.abs(real - esperado), `${real} vs ${esperado}`).toBeLessThanOrEqual(t);
}

describe('estadoPlaca', () => {
  it.each([
    [1000, 25, 58.8, 479.8, 39.39, 12.18],
    [800, 20, 47.0, 401.7, 40.94, 9.81],
    [500, 30, 46.9, 251.2, 40.95, 6.13],
    [200, 25, 31.8, 106.2, 42.94, 2.47],
  ])('%d W/m² a %d °C', (g, t, tCel, p, v, i) => {
    const e = estadoPlaca(placa, g, t);
    perto(e.tCel, tCel, 0.06); // a tabela traz a célula com uma casa decimal
    perto(e.p, p);
    perto(e.v, v);
    perto(e.i, i);
  });

  it('abaixo de 20 W/m² não gera', () => {
    expect(estadoPlaca(placa, 10, 25)).toEqual({ p: 0, v: 0, i: 0, tCel: 25 });
  });
});

describe('vocFrio e vmpQuente', () => {
  it.each([
    [1, 54.12, 37.91],
    [2, 108.23, 75.83],
    [3, 162.35, 113.74],
  ])('%d placa(s) em série', (n, voc, vmp) => {
    perto(vocFrio(placa, n), voc);
    perto(vmpQuente(placa, n), vmp);
  });

  it('o padrão é uma placa', () => {
    expect(vocFrio(placa)).toBe(vocFrio(placa, 1));
    expect(vmpQuente(placa)).toBe(vmpQuente(placa, 1));
  });
});

describe('saidaArranjo', () => {
  const a = (g: number): EstadoPlaca => estadoPlaca(placa, g, 25);

  it('1 placa no Anenji: tensão baixa', () => {
    const s = saidaArranjo([[a(1000)]], ANENJI, TENSAO_CARGA);
    expect(s.p).toBe(0);
    expect(s.avisos).toEqual(['placas-tensao-baixa']);
  });

  it('2 em série no Anenji', () => {
    const s = saidaArranjo([[a(1000), a(1000)]], ANENJI, TENSAO_CARGA);
    perto(s.v, 78.78);
    perto(s.i, 12.18);
    perto(s.v * s.i, 959.6);
    perto(s.p, 930.8);
    expect(s.avisos).toEqual([]);
  });

  it('2 em série, uma sombreada: o diodo de desvio preserva a fileira', () => {
    const s = saidaArranjo([[a(1000), a(200)]], ANENJI, TENSAO_CARGA);
    perto(s.v, 39.39);
    perto(s.i, 12.18);
    perto(s.v * s.i, 479.8);
    expect(s.p).toBe(0);
    expect(s.avisos).toEqual(['placas-tensao-baixa']);
    // Sem desvio, a corrente seria a da placa fraca.
    const fraca = a(200);
    perto(fraca.i * (a(1000).v + fraca.v), 203.7);
  });

  it('2 fileiras de 1 placa em paralelo no Anenji', () => {
    const s = saidaArranjo([[a(1000)], [a(1000)]], ANENJI, TENSAO_CARGA);
    expect(s.p).toBe(0);
    expect(s.avisos).toEqual(['placas-tensao-baixa']);
  });

  it('1 placa no Epever MPPT', () => {
    const s = saidaArranjo([[a(1000)]], EPEVER, TENSAO_CARGA);
    perto(s.p, 465.4);
    expect(s.avisos).toEqual([]);
  });

  it('1 placa no PWM entrega 26,5% menos que o MPPT', () => {
    const s = saidaArranjo([[a(1000)]], PWM, TENSAO_CARGA);
    perto(s.p, 342.0);
    perto(1 - s.p / 465.4, 0.265, 0.005);
    expect(s.avisos).toEqual([]);
  });

  it('3 em série no Epever: tensão alta', () => {
    const s = saidaArranjo([[a(1000), a(1000), a(1000)]], EPEVER, TENSAO_CARGA);
    expect(s.p).toBe(0);
    expect(s.avisos).toEqual(['placas-tensao-alta']);
    perto(s.v, 118.2, 0.1);
  });

  it('sem fileiras ou sem sol: zero e sem aviso', () => {
    for (const solar of [ANENJI, EPEVER, PWM]) {
      expect(saidaArranjo([], solar, TENSAO_CARGA)).toMatchObject({ p: 0, avisos: [] });
      expect(saidaArranjo([[a(0)]], solar, TENSAO_CARGA)).toMatchObject({ p: 0, avisos: [] });
    }
  });

  it('limita pela corrente de entrada (2 fileiras de 2 no Anenji)', () => {
    const s = saidaArranjo([[a(1000), a(1000)], [a(1000), a(1000)]], ANENJI, TENSAO_CARGA);
    perto(s.i, 24.36);
    expect(s.avisos).toEqual(['placas-limitadas']);
    perto(s.p, (1919.2 * 0.97 * 18) / 24.36, 2);
  });

  it('limita pela potência máxima da entrada', () => {
    const solar: EntradaSolar = { ...ANENJI, correnteEntradaMaxA: undefined, potenciaMaxW: 500 };
    const s = saidaArranjo([[a(1000), a(1000)]], solar, TENSAO_CARGA);
    expect(s.p).toBe(500);
    expect(s.avisos).toEqual(['placas-limitadas']);
  });

  it('PWM limita pela corrente de carga', () => {
    const solar: EntradaSolar = { ...PWM, correnteCargaA: 10 };
    const s = saidaArranjo([[a(1000)]], solar, TENSAO_CARGA);
    expect(s.avisos).toEqual(['placas-limitadas']);
    perto(s.p, 280.8);
  });
});

// ---------------------------------------------------------------- Banco

/** A análise do "plano no papel", escrita à mão. */
function analisePapel(extra: Partial<Sistema> = {}): AnaliseCircuito {
  return {
    sistema: {
      inversor: 'inversor',
      controlador: null,
      entradaSolar: ANENJI,
      fileiras: [['placa1']],
      banco: [['bateria1']],
      cargas: ['ap-rede', 'ap-pc-24h', 'ap-pc-trabalho', 'ap-geladeira', 'ap-ventilador', 'ap-tv'],
      redeLigada: true,
      ...extra,
    },
    problemas: [],
    naRede: [],
  };
}

function disp(uid: string, itemId: string): Dispositivo {
  return { uid, itemId, pos: [0, 0, 0], quat: [0, 0, 0, 1], superficie: null, giro: 0, ligado: true, uso: null };
}

describe('infoBanco', () => {
  it('plano no papel', () => {
    const b = infoBanco(analisePapel().sistema as Sistema, cenarioPlanoNoPapel(), CATALOGO);
    expect(b).not.toBeNull();
    expect(b).toMatchObject({ tensao: 24, ah: 100, socMin: 0.1, descargaMaxA: 100, cargaMaxA: 50, quimica: 'lifepo4', ramos: 1 });
    perto(b!.tensaoRef, 25.6);
    perto(b!.tensaoCarga, 28.08);
    perto(b!.wh, 2560);
    perto(b!.whUtil, 2304);
  });

  it('duas Moura 12 V em série', () => {
    const p = cenarioPlanoNoPapel();
    p.dispositivos.push(disp('bateria2', 'bat-moura-12mn105'));
    p.dispositivos.find((d) => d.uid === 'bateria1')!.itemId = 'bat-moura-12mn105';
    const b = infoBanco(analisePapel({ banco: [['bateria1', 'bateria2']] }).sistema as Sistema, p, CATALOGO)!;
    expect(b).toMatchObject({ tensao: 24, ah: 105, socMin: 0.5, quimica: 'chumbo' });
    perto(b.tensaoRef, 24);
    perto(b.wh, 2520);
    perto(b.whUtil, 1260);
  });

  it('duas Alfx em paralelo', () => {
    const p = cenarioPlanoNoPapel();
    p.dispositivos.push(disp('bateria2', 'bat-alfx-24v-100'));
    const b = infoBanco(analisePapel({ banco: [['bateria1'], ['bateria2']] }).sistema as Sistema, p, CATALOGO)!;
    expect(b).toMatchObject({ tensao: 24, ah: 200, descargaMaxA: 200, cargaMaxA: 100, ramos: 2 });
  });

  it('sem banco, nulo', () => {
    expect(infoBanco(analisePapel({ banco: [] }).sistema as Sistema, cenarioPlanoNoPapel(), CATALOGO)).toBeNull();
  });

  it('estação portátil usa a bateria interna', () => {
    const estacao: Inversor = { ...anenji, id: 'inv-teste-estacao', bateriaInternaWh: 1000 };
    const catalogo: Catalogo = new Map<string, Item>(CATALOGO).set(estacao.id, estacao);
    const p = cenarioPlanoNoPapel();
    p.dispositivos.find((d) => d.uid === 'inversor')!.itemId = estacao.id;
    const b = infoBanco(analisePapel({ banco: [] }).sistema as Sistema, p, catalogo)!;
    expect(b).toMatchObject({ wh: 1000, quimica: 'lifepo4', tensao: 24, descargaMaxA: Infinity, cargaMaxA: Infinity });
    perto(b.whUtil, 900);
  });
});

describe('autonomia de 1 bateria Alfx no Anenji', () => {
  it.each([
    [465, 550.4, 21.5, 4.08],
    [300, 371.1, 14.5, 6.05],
    [200, 262.4, 10.2, 8.56],
    [110, 164.6, 6.4, 13.65],
    [40, 88.5, 3.5, 25.39],
  ])('%d W em CA', (ca, wBat, amp, horas) => {
    const b = infoBanco(analisePapel().sistema as Sistema, cenarioPlanoNoPapel(), CATALOGO)!;
    const w = ca / anenji.rendimento + anenji.consumoVazioW;
    perto(w, wBat);
    perto(w / b.tensaoRef, amp, 0.05);
    perto((b.whUtil * b.rendDescarga) / w, horas);
  });
});

// ---------------------------------------------------------------- Passo

const DT = 1 / 12;
const SEM_PLACAS: ReadonlyMap<string, CondicaoPlaca> = new Map();

function entrada(extra: Partial<EntradaPasso> = {}): EntradaPasso {
  return { dtHoras: DT, redeDisponivel: false, horaLocal: null, placas: SEM_PLACAS, ...extra };
}

function rodar(n: number, estado: EstadoSim, projeto: Projeto, analise: AnaliseCircuito, e: EntradaPasso, catalogo: Catalogo = CATALOGO) {
  let s = passoSimulacao(projeto, catalogo, analise, estado, e);
  for (let k = 1; k < n; k++) s = passoSimulacao(projeto, catalogo, analise, s.estado, e);
  return s;
}

/** Catálogo com um aparelho de teste, que também entra no projeto e na lista de cargas. */
function comAparelhoDeTeste(w: number, soEle: boolean) {
  const base = CATALOGO.get('ap-geladeira') as Aparelho;
  const teste: Aparelho = { ...base, id: 'ap-teste', potenciaW: w, mediaW: w };
  const catalogo: Catalogo = new Map<string, Item>(CATALOGO).set(teste.id, teste);
  const projeto = cenarioPlanoNoPapel();
  projeto.dispositivos.push(disp('ap-teste', teste.id));
  if (soEle) for (const d of projeto.dispositivos) if (d.uid.startsWith('ap-') && d.uid !== 'ap-teste') d.ligado = false;
  const analise = analisePapel();
  analise.sistema!.cargas.push('ap-teste');
  return { catalogo, projeto, analise };
}

describe('passoSimulacao: plano no papel', () => {
  const projeto = cenarioPlanoNoPapel();
  const analise = analisePapel();

  it('queda de luz: bateria descarrega', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, estadoInicial(), entrada());
    perto(s.cargaAtendidaW, 465);
    perto(s.cargaPedidaW, 465);
    perto(s.bateriaW, -550.4);
    expect(s.origem).toBe('bateria');
    perto(1 - s.estado.soc, 0.018377, 0.00005);
    expect(s.avisos).toEqual([]);
    perto(rodar(12, estadoInicial(), projeto, analise, entrada()).estado.soc, 0.7795, 0.0005);
    perto(rodar(24, estadoInicial(), projeto, analise, entrada()).estado.soc, 0.559, 0.0005);
    perto(rodar(48, estadoInicial(), projeto, analise, entrada()).estado.soc, 0.1179, 0.0005);
  });

  it('bateria vazia no 49º passo e carga zero no 50º', () => {
    const p48 = rodar(48, estadoInicial(), projeto, analise, entrada());
    const p49 = passoSimulacao(projeto, CATALOGO, analise, p48.estado, entrada());
    expect(p49.avisos).toContain('bateria-vazia');
    expect(p49.estado.cortado).toBe(true);
    perto(p49.estado.soc, 0.1, 1e-9);
    perto(p49.cargaAtendidaW / 465, 0.975, 0.005);
    const p50 = passoSimulacao(projeto, CATALOGO, analise, p49.estado, entrada());
    expect(p50.cargaAtendidaW).toBe(0);
    expect(p50.estado.cortado).toBe(true);
  });

  it('rede presente: as cargas vão pela rede e a bateria carrega', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.5, cortado: false, emRede: false }, entrada({ redeDisponivel: true }));
    expect(s.origem).toBe('rede');
    perto(s.cargaAtendidaW, 465);
    perto(s.bateriaW, 561.6);
    perto(s.estado.soc - 0.5, 0.017824, 0.00005);
    perto(s.redeW, 1071.6);
  });

  it('rede presente com bateria cheia', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, estadoInicial(), entrada({ redeDisponivel: true }));
    expect(s.bateriaW).toBe(0);
    perto(s.redeW, 510);
    expect(s.estado.soc).toBe(1);
  });

  it('sobrecarga: nada é atendido', () => {
    const t = comAparelhoDeTeste(3200, false);
    const s = passoSimulacao(t.projeto, t.catalogo, t.analise, estadoInicial(), entrada());
    expect(s.avisos).toContain('sobrecarga');
    expect(s.cargaAtendidaW).toBe(0);
  });

  it('limite de corrente da bateria (BMS)', () => {
    const t = comAparelhoDeTeste(2400, true);
    const s = passoSimulacao(t.projeto, t.catalogo, t.analise, estadoInicial(), entrada());
    expect(s.avisos).toContain('bms');
    expect(s.cargaAtendidaW).toBe(0);
    expect(s.estado.soc).toBe(1);
    perto((2400 / anenji.rendimento + anenji.consumoVazioW) / 25.6, 103.7, 0.1);
  });

  it('sem sistema: tudo zero', () => {
    const s = passoSimulacao(projeto, CATALOGO, { sistema: null, problemas: [], naRede: [] }, estadoInicial(), entrada());
    expect(s).toMatchObject({ pvW: 0, cargaPedidaW: 0, cargaAtendidaW: 0, bateriaW: 0, redeW: 0, origem: 'nenhuma', avisos: [] });
    expect(s.estado).toEqual(estadoInicial());
  });

  it('sem banco: aviso e nada é alimentado', () => {
    const s = passoSimulacao(projeto, CATALOGO, analisePapel({ banco: [] }), estadoInicial(), entrada());
    expect(s.avisos).toEqual(['sem-bateria']);
    expect(s.cargaAtendidaW).toBe(0);
    expect(s.origem).toBe('nenhuma');
  });
});

describe('passoSimulacao: plano corrigido com sol', () => {
  const projeto = cenarioPlanoCorrigido();
  const analise = analisePapel({ fileiras: [['placa1', 'placa2']] });
  const sol: ReadonlyMap<string, CondicaoPlaca> = new Map([
    ['placa1', { g: 1000, tAmb: 25 }],
    ['placa2', { g: 1000, tAmb: 25 }],
  ]);

  it('sol sobrando carrega a bateria', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.5, cortado: false, emRede: false }, entrada({ placas: sol }));
    perto(s.pvW, 930.8);
    perto(s.cargaAtendidaW, 465);
    perto(s.bateriaW, 380.4);
    expect(s.origem).toBe('solar');
    expect(s.estado.soc).toBeGreaterThan(0.5);
  });

  it('com sol e o inversor cortado, nada é atendido e a origem é nenhuma', () => {
    // soc 0,10 < 0,15: o inversor segue cortado; o sol só carrega a bateria.
    const s = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.1, cortado: true, emRede: false }, entrada({ placas: sol }));
    expect(s.cargaPedidaW).toBeGreaterThan(0);
    expect(s.cargaAtendidaW).toBe(0);
    expect(s.bateriaW).toBeGreaterThan(0);
    expect(s.origem).toBe('nenhuma');
  });

  it('religamento: cortado volta a falso quando o soc chega a 0,15', () => {
    const semCarga = cenarioPlanoCorrigido();
    for (const d of semCarga.dispositivos) if (d.uid.startsWith('ap-')) d.ligado = false;
    let s = { soc: 0.1, cortado: true, emRede: false } as EstadoSim;
    let passos = 0;
    // Enquanto o soc está abaixo de 0,15 no início do passo, o inversor segue cortado.
    while (s.soc < 0.15 && passos < 500) {
      const r = passoSimulacao(semCarga, CATALOGO, analise, s, entrada({ placas: sol }));
      expect(r.estado.cortado).toBe(true);
      expect(r.cargaAtendidaW).toBe(0);
      s = r.estado;
      passos++;
    }
    expect(passos).toBeLessThan(500);
    const religou = passoSimulacao(semCarga, CATALOGO, analise, s, entrada({ placas: sol }));
    expect(religou.estado.cortado).toBe(false);
  });
});

describe('passoSimulacao: horário de uso', () => {
  const projeto = cenarioPlanoNoPapel();
  const analise = analisePapel();

  it('às 20:00 o PC de trabalho está fora do horário', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, estadoInicial(), entrada({ horaLocal: 20 }));
    perto(s.cargaPedidaW, 330);
    perto(s.bateriaW, -403.7);
  });

  it('às 23:30 ficam modem, PC 24 h e geladeira', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, estadoInicial(), entrada({ horaLocal: 23.5 }));
    perto(s.cargaPedidaW, 200);
    perto(s.bateriaW, -262.4);
  });

  it('o horário definido pelo usuário vale mais que o do catálogo', () => {
    const p = cenarioPlanoNoPapel();
    p.dispositivos.find((d) => d.uid === 'ap-tv')!.uso = { inicio: 20, fim: 2 };
    const s = passoSimulacao(p, CATALOGO, analise, estadoInicial(), entrada({ horaLocal: 23.5 }));
    perto(s.cargaPedidaW, 280);
  });

  it('aparelho desligado não consome em hora nenhuma', () => {
    const p = cenarioPlanoNoPapel();
    p.dispositivos.find((d) => d.uid === 'ap-tv')!.ligado = false;
    const s = passoSimulacao(p, CATALOGO, analise, estadoInicial(), entrada({ horaLocal: 20 }));
    perto(s.cargaPedidaW, 250);
  });
});

describe('passoSimulacao: modo solar primeiro', () => {
  const projeto = cenarioPlanoNoPapel();
  projeto.prioridade = 'solar';
  const analise = analisePapel();

  it('usa a bateria enquanto ela está acima de socMin + 0,10', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.5, cortado: false, emRede: false }, entrada({ redeDisponivel: true }));
    expect(s.origem).toBe('bateria');
    expect(s.estado.emRede).toBe(false);
  });

  it('entra na rede em soc <= 0,20 e sai em soc >= 0,90', () => {
    const s = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.2, cortado: false, emRede: false }, entrada({ redeDisponivel: true }));
    expect(s.origem).toBe('rede');
    expect(s.estado.emRede).toBe(true);
    const t = passoSimulacao(projeto, CATALOGO, analise, { soc: 0.9, cortado: false, emRede: true }, entrada({ redeDisponivel: true }));
    expect(t.estado.emRede).toBe(false);
    expect(t.origem).toBe('bateria');
  });
});
