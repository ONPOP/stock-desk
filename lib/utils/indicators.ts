// 기술지표 계산 (F14, D15 자동매매) — SMA, EMA, RSI(Wilder), MACD, VWAP. 순수 함수.
// 입력 스케일 무관(표시용 숫자·최소단위 정수 모두 허용 — 비율/비교 연산만 수행), 출력은 정렬 보존(없는 구간 null).

/**
 * 캔들을 시각 오름차순 정렬 + 동일 초 중복 제거(마지막 값 우선).
 * lightweight-charts는 '엄격히 증가'하는 시각을 요구 — 중복이 있으면 assert로 차트가 죽는다.
 * 어떤 시세 소스가 중복·역순을 주더라도 표시 경계에서 방어. tsSeconds는 ts→초 변환기.
 */
export function dedupeSortCandles<T>(candles: T[], tsSeconds: (c: T) => number): T[] {
  const byTime = new Map<number, T>();
  for (const c of candles) byTime.set(tsSeconds(c), c);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

/** 단순이동평균 — period 미만 구간은 null */
export function sma(values: number[], period: number): Array<number | null> {
  if (period < 1) throw new Error('period는 1 이상이어야 합니다.');
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** RSI (Wilder smoothing) — period까지는 null, 이후 0~100 */
export function rsi(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** 지수이동평균 — 시드는 첫 period 구간 SMA, 그 이전은 null */
export function ema(values: number[], period: number): Array<number | null> {
  if (period < 1) throw new Error('period는 1 이상이어야 합니다.');
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface MacdSeries {
  macd: Array<number | null>;
  signal: Array<number | null>;
  hist: Array<number | null>;
}

/** MACD(fast,slow,signal) — macd = EMA(fast)-EMA(slow), signal = macd의 EMA, hist = macd-signal */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  if (fast >= slow) throw new Error('fast는 slow보다 작아야 합니다.');
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: Array<number | null> = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );

  // signal = macd 유효 구간(비-null tail)에 대한 EMA
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signal: Array<number | null> = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const tail = macdLine.slice(firstIdx) as number[];
    const sig = ema(tail, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
  }
  const hist = macdLine.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null));
  return { macd: macdLine, signal, hist };
}

export interface VwapCandle {
  ts: string; // UTC ISO
  h: number;
  l: number;
  c: number;
  volume: number;
}

/**
 * VWAP — Σ(전형가격×거래량)/Σ(거래량). dayKeyOf가 주어지면 키가 바뀔 때(=날짜 변경) 누적을 리셋한다.
 * KIS는 계산된 VWAP을 제공하지 않으므로 분봉으로 직접 산출 (인트라데이 기준).
 */
export function vwap(
  candles: VwapCandle[],
  dayKeyOf: (ts: string) => string,
): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  let pv = 0;
  let vol = 0;
  let key = '';
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const k = dayKeyOf(c.ts);
    if (k !== key) {
      key = k;
      pv = 0;
      vol = 0;
    }
    const typical = (c.h + c.l + c.c) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}
