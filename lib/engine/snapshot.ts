// 스냅샷 조립 (D16) — 일봉 캔들 + 종목 메타 → market_snapshots에 적재할 단일 행 형태.
// 시세 조회는 여기서 하지 않는다(호출부가 lib/providers/quote-source로 주입) — 순수 함수로 테스트 가능하게 유지.

import type { Candle } from '@/types';
import { dedupeSortCandles, sma } from '@/lib/utils/indicators';
import { currencyOf } from '@/lib/providers/yahoo/symbol';
import { changeBp, computeSlotIndicators } from '@/lib/engine/indicators-ext';
import type { EngineStock, SlotPriceData, StockSnapshot } from '@/lib/engine/types';

/** MA200·3년 수익률까지 계산하려면 최소 이만큼의 일봉이 필요하다(부족하면 해당 지표만 null) */
export const MIN_CANDLES = 20;
export const PREFERRED_CANDLE_COUNT = 800;

export class InsufficientCandlesError extends Error {
  constructor(ticker: string, got: number) {
    super(`${ticker}: 일봉이 부족합니다 (${got}개, 최소 ${MIN_CANDLES}개 필요)`);
    this.name = 'InsufficientCandlesError';
  }
}

/** 슬라이드 차트용 시계열 — 최근 bars봉의 종가·MA20·MA60. MA는 전 구간으로 계산 후 잘라낸다 */
export function chartSeries(
  rawCandles: Candle[],
  bars = 120,
): { closes: number[]; ma20: Array<number | null>; ma60: Array<number | null> } | null {
  const candles = dedupeSortCandles(rawCandles, (c) => Math.floor(new Date(c.ts).getTime() / 1000));
  if (candles.length < 2) return null;
  const closes = candles.map((c) => c.c);
  const from = Math.max(0, closes.length - bars);
  return {
    closes: closes.slice(from),
    ma20: sma(closes, 20).slice(from),
    ma60: sma(closes, 60).slice(from),
  };
}

export function buildPriceData(candles: Candle[], market: EngineStock['market']): SlotPriceData {
  const i = candles.length - 1;
  const cur = candles[i];
  const prevClose = i > 0 ? candles[i - 1].c : null;
  return {
    currency: currencyOf(market),
    close: cur.c,
    open: cur.o,
    high: cur.h,
    low: cur.l,
    prevClose,
    changeBp: changeBp(cur.c, prevClose),
    volume: cur.volume,
    asOf: cur.ts,
  };
}

/**
 * 종목 1개의 스냅샷 조립.
 * 캔들은 정렬·중복 제거 후 사용한다 — 시세 소스가 역순·중복을 주더라도 지표가 오염되지 않게.
 */
export function buildSnapshot(
  stock: EngineStock,
  rawCandles: Candle[],
  flowData: Record<string, unknown> | null = null,
): StockSnapshot {
  const candles = dedupeSortCandles(rawCandles, (c) => Math.floor(new Date(c.ts).getTime() / 1000));
  if (candles.length < MIN_CANDLES) throw new InsufficientCandlesError(stock.ticker, candles.length);

  return {
    stock,
    priceData: buildPriceData(candles, stock.market),
    indicators: computeSlotIndicators(candles),
    flowData,
  };
}
