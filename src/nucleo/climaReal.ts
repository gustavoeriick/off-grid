// Armazém em memória do clima real (medições horárias). Sem rede: quem baixa os dados fica em src/dados.
//
// Convenção de hora: cada amostra tem `msUtc` igual ao FIM da hora que ela descreve.
// - `ghi`, `dni`, `dhi` (W/m²) são a MÉDIA da hora que termina em `msUtc` (como o Open-Meteo,
//   que carimba a radiação com a hora final do intervalo). Na interpolação, o valor vale no
//   MEIO da hora, isto é, em `msUtc - 30 min`.
// - `tAmb` (°C) é o valor instantâneo em `msUtc`.

export interface AmostraClima {
  /** Fim da hora, em ms UTC. */
  msUtc: number;
  ghi: number;
  dni: number;
  dhi: number;
  tAmb: number;
}

export interface ClimaNoInstante {
  ghi: number;
  dni: number;
  dhi: number;
  tAmb: number;
}

const HORA_MS = 3600000;
const MEIA_HORA_MS = 1800000;

const armazem = new Map<string, AmostraClima[]>();

/** Guarda a série do local. Amostras com o mesmo `msUtc` são substituídas pelas novas; as demais são mantidas. */
export function registrarClimaReal(localId: string, dados: AmostraClima[]): void {
  const porHora = new Map<number, AmostraClima>();
  for (const a of armazem.get(localId) ?? []) porHora.set(a.msUtc, a);
  for (const a of dados) {
    if (![a.msUtc, a.ghi, a.dni, a.dhi, a.tAmb].every(Number.isFinite)) continue;
    porHora.set(a.msUtc, { ...a });
  }
  armazem.set(localId, [...porHora.values()].sort((x, y) => x.msUtc - y.msUtc));
}

/** Apaga o clima real de um local, ou de todos. */
export function limparClimaReal(localId?: string): void {
  if (localId === undefined) armazem.clear();
  else armazem.delete(localId);
}

/** Índice da primeira amostra com `msUtc` maior ou igual a `alvo` (busca binária). */
function primeiroNaoAntes(serie: AmostraClima[], alvo: number): number {
  let a = 0;
  let b = serie.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (serie[m]!.msUtc < alvo) a = m + 1;
    else b = m;
  }
  return a;
}

/**
 * Clima interpolado no instante, ou `undefined` se não há dados que o cubram: o instante precisa
 * estar entre o meio da primeira hora e o meio da última, e as duas horas vizinhas têm de ser consecutivas.
 * Radiação negativa vira zero.
 */
export function climaRealDe(localId: string, msUtc: number): ClimaNoInstante | undefined {
  const serie = armazem.get(localId);
  if (!serie || serie.length === 0) return undefined;
  // Radiação: amostra i vale em serie[i].msUtc − 30 min. Vizinhas: a primeira com centro >= msUtc e a anterior.
  const j = primeiroNaoAntes(serie, msUtc + MEIA_HORA_MS);
  if (j >= serie.length) return undefined;
  const prox = serie[j]!;
  let i = j - 1;
  let ant: AmostraClima;
  let fr: number;
  if (prox.msUtc - MEIA_HORA_MS === msUtc) {
    ant = prox;
    fr = 0;
  } else {
    if (i < 0) return undefined;
    ant = serie[i]!;
    if (prox.msUtc - ant.msUtc !== HORA_MS) return undefined;
    fr = (msUtc - (ant.msUtc - MEIA_HORA_MS)) / HORA_MS;
  }
  const mix = (a: number, b: number) => Math.max(0, a + (b - a) * fr);
  // Temperatura: instantânea em msUtc de cada amostra; interpola entre as vizinhas do instante.
  const k = primeiroNaoAntes(serie, msUtc);
  let tAmb: number;
  if (k >= serie.length) tAmb = serie[serie.length - 1]!.tAmb;
  else if (k === 0 || serie[k]!.msUtc === msUtc) tAmb = serie[k]!.tAmb;
  else {
    const a = serie[k - 1]!;
    const b = serie[k]!;
    tAmb = a.tAmb + ((b.tAmb - a.tAmb) * (msUtc - a.msUtc)) / (b.msUtc - a.msUtc);
  }
  return { ghi: mix(ant.ghi, prox.ghi), dni: mix(ant.dni, prox.dni), dhi: mix(ant.dhi, prox.dhi), tAmb };
}

/** Há dados reais cobrindo o instante? */
export function temClimaReal(localId: string, msUtc: number): boolean {
  return climaRealDe(localId, msUtc) !== undefined;
}
