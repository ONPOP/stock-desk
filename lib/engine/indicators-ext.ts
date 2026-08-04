// 슬롯 분석용 지표 확장 (D16) — 기존 lib/utils/indicators.ts(sma/rsi)를 재사용하고
// 슬롯 판단에만 필요한 파생값(MA120·200, 이격률, 기울기, 기간수익률, 국면 플래그)만 여기서 계산한다.
// 순수 함수. 입력 캔들은 시각 오름차순 정렬 상태를 전제로 한다 (dedupeSortCandles로 보장).

import type { Candle } from '@/types';
import { sma, rsi } from '@/lib/utils/indicators';
import type {
  DisparityBp,
  MaAlignment,
  MaSet,
  PeriodReturnsBp,
  PhaseFlags,
  SlotIndicators,
} from '@/lib/engine/types';

/** 거래일 기준 룩백 — 달력일이 아니라 봉 개수. 미국·한국 공통 근사치 */
const LOOKBACK = { m1: 21, m3: 63, m6: 126, m12: 252, y3: 756 } as const;

const MA_PERIODS = { ma10: 10, ma20: 20, ma60: 60, ma120: 120, ma200: 200 } as const;

const VOLUME_AVG_PERIOD = 20;
const RSI_TREND_LOOKBACK = 5;
/** 눌림목 판정 시 되돌아보는 봉 수 (기본 국면 플래그용) */
const PULLBACK_WINDOW = 5;
/** MA 터치 추적 창 — watchZone.lookbackBars의 상한과 같아야 규칙 재평가가 가능하다 */
export const TOUCH_WINDOW = 20;
/** 과열 판정 임계 — RSI와 20MA 이격률(bp)을 AND 조건으로 본다 */
const OVERHEAT_RSI = 70;
const OVERHEAT_DISPARITY_BP = 1000;
/** RSI 방향을 flat으로 볼 허용 폭 */
const RSI_FLAT_EPSILON = 1;

/** 변화율을 bp 정수로. base가 0이거나 값이 없으면 null */
export function changeBp(value: number | null | undefined, base: number | null | undefined): number | null {
  if (value == null || base == null || base === 0) return null;
  return Math.round(((value - base) / base) * 10_000);
}

/** 배열의 마지막 유효값 */
function last<T>(arr: Array<T | null>): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i] as T;
  }
  return null;
}

/** 시리즈의 n봉 전 대비 기울기(bp) — 마지막 값 기준 */
function slopeBp(series: Array<number | null>, lookback: number): number | null {
  const i = series.length - 1;
  const j = i - lookback;
  if (j < 0) return null;
  return changeBp(series[i], series[j]);
}

/** MA 집합 — 값은 최소 통화 단위 정수로 반올림 (금액 스케일 유지) */
export function maSet(closes: number[]): MaSet {
  const out = {} as MaSet;
  for (const [key, period] of Object.entries(MA_PERIODS) as Array<[keyof MaSet, number]>) {
    const v = last(sma(closes, period));
    out[key] = v === null ? null : Math.round(v);
  }
  return out;
}

/** 종가 대비 각 MA 이격률 (bp) */
export function disparityBp(close: number, ma: MaSet): DisparityBp {
  const out = {} as DisparityBp;
  for (const key of Object.keys(MA_PERIODS) as Array<keyof MaSet>) {
    out[key] = changeBp(close, ma[key]);
  }
  return out;
}

/**
 * MA 배열 상태. 계산 가능한(=null 아닌) MA만 비교하며, 2개 미만이면 mixed.
 * 단기→장기 순으로 단조 감소면 bull(정배열), 단조 증가면 bear(역배열).
 */
export function maAlignment(ma: MaSet): MaAlignment {
  const ordered = (Object.keys(MA_PERIODS) as Array<keyof MaSet>)
    .map((k) => ma[k])
    .filter((v): v is number => v !== null);
  if (ordered.length < 2) return 'mixed';

  let bull = true;
  let bear = true;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i - 1] <= ordered[i]) bull = false;
    if (ordered[i - 1] >= ordered[i]) bear = false;
  }
  if (bull) return 'bull';
  if (bear) return 'bear';
  return 'mixed';
}

/** 타임프레임별 수익률 (bp) — 봉이 부족한 구간은 null */
export function periodReturnsBp(closes: number[]): PeriodReturnsBp {
  const i = closes.length - 1;
  const at = (lookback: number) => {
    const j = i - lookback;
    return j < 0 ? null : changeBp(closes[i], closes[j]);
  };
  return {
    m1: at(LOOKBACK.m1),
    m3: at(LOOKBACK.m3),
    m6: at(LOOKBACK.m6),
    m12: at(LOOKBACK.m12),
    y3: at(LOOKBACK.y3),
  };
}

/** 당일 거래량 / 직전 20일 평균 (bp). 당일 봉은 평균에서 제외해 자기참조를 피한다 */
export function volumeRatioBp(volumes: number[]): number | null {
  const i = volumes.length - 1;
  if (i < VOLUME_AVG_PERIOD) return null;
  let sum = 0;
  for (let k = i - VOLUME_AVG_PERIOD; k < i; k++) sum += volumes[k];
  const avg = sum / VOLUME_AVG_PERIOD;
  if (avg === 0) return null;
  return Math.round((volumes[i] / avg) * 10_000);
}

/** 종가의 당일 고저 범위 내 위치 (bp). 10000 = 고가 마감, 0 = 저가 마감 */
export function closePositionBp(candle: Candle): number | null {
  const range = candle.h - candle.l;
  if (range <= 0) return null;
  return Math.round(((candle.c - candle.l) / range) * 10_000);
}

function rsiTrendOf(series: Array<number | null>): SlotIndicators['rsiTrend'] {
  const i = series.length - 1;
  const j = i - RSI_TREND_LOOKBACK;
  if (j < 0 || series[i] === null || series[j] === null) return null;
  const diff = (series[i] as number) - (series[j] as number);
  if (diff > RSI_FLAT_EPSILON) return 'up';
  if (diff < -RSI_FLAT_EPSILON) return 'down';
  return 'flat';
}

/**
 * 해당 MA를 저가로 마지막에 터치(하회)한 시점을 '몇 봉 전'으로 반환. 없으면 null.
 *
 * 터치 기준을 10MA가 아닌 20MA로 잡는 이유(기본 국면 플래그): 완만한 상승 구간에서는 10MA가
 * 종가 바로 아래에 붙어 일중 변동폭만으로도 매번 '터치'가 성립해 판정이 무의미해진다.
 * 여기서는 세 MA를 모두 기록해 두고, 어떤 기준선을 쓸지는 관찰 규칙이 정한다.
 */
function lastTouchBarsAgo(candles: Candle[], maSeries: Array<number | null>): number | null {
  const i = candles.length - 1;
  for (let k = i; k >= Math.max(0, i - TOUCH_WINDOW + 1); k--) {
    const ma = maSeries[k];
    if (ma !== null && candles[k].l <= ma) return i - k;
  }
  return null;
}

/**
 * 일봉 캔들로 슬롯 지표 전체를 산출한다.
 * 캔들이 비어 있으면 예외 — 호출부(파이프라인)가 종목 단위로 스킵 처리한다.
 */
export function computeSlotIndicators(candles: Candle[]): SlotIndicators {
  if (candles.length === 0) throw new Error('캔들이 비어 있어 지표를 계산할 수 없습니다.');

  const closes = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.volume);
  const i = candles.length - 1;
  const close = closes[i];

  const ma = maSet(closes);
  const ma20Series = sma(closes, MA_PERIODS.ma20);
  const ma60Series = sma(closes, MA_PERIODS.ma60);
  const ma10Series = sma(closes, MA_PERIODS.ma10);
  const rsiSeries = rsi(closes, 14);

  const slope = {
    ma20_5d: slopeBp(ma20Series, 5),
    ma60_20d: slopeBp(ma60Series, 20),
  };
  const disparity = disparityBp(close, ma);

  // 상승추세: 20MA 위 + 20MA 단기 우상향 + 60MA 중기 우상향 (설계서 §5 trend 조건)
  const uptrend =
    ma.ma20 !== null && close > ma.ma20 && (slope.ma20_5d ?? 0) > 0 && (slope.ma60_20d ?? 0) > 0;
  const downtrend = ma.ma60 !== null && close < ma.ma60 && (slope.ma60_20d ?? 0) < 0;
  const rsi14Raw = last(rsiSeries);
  const rsi14 = rsi14Raw === null ? null : Math.round(rsi14Raw * 100) / 100;
  const overheated =
    rsi14 !== null && rsi14 > OVERHEAT_RSI && (disparity.ma20 ?? 0) > OVERHEAT_DISPARITY_BP;

  const touchBarsAgo = {
    ma10: lastTouchBarsAgo(candles, ma10Series),
    ma20: lastTouchBarsAgo(candles, ma20Series),
    ma60: lastTouchBarsAgo(candles, ma60Series),
  };
  const ma10Now = ma10Series[i];
  const recoveredAboveMa10 = ma10Now !== null && close > ma10Now;
  // 기본 국면 플래그는 규칙과 무관하게 20MA·5봉 기준으로 고정한다(스냅샷의 안정적 기준선)
  const touchedRecently = touchBarsAgo.ma20 !== null && touchBarsAgo.ma20 < PULLBACK_WINDOW;

  const phase: PhaseFlags = {
    uptrend,
    pullback: uptrend && touchedRecently && recoveredAboveMa10,
    pullbackWatch: uptrend && touchedRecently && !recoveredAboveMa10,
    overheated,
    downtrend,
  };

  return {
    ma,
    disparityBp: disparity,
    slopeBp: slope,
    alignment: maAlignment(ma),
    rsi14,
    rsiTrend: rsiTrendOf(rsiSeries),
    volumeRatioBp: volumeRatioBp(volumes),
    turnover: Math.round(close * candles[i].volume),
    returnsBp: periodReturnsBp(closes),
    closePositionBp: closePositionBp(candles[i]),
    touchBarsAgo,
    recoveredAboveMa10,
    phase,
  };
}
