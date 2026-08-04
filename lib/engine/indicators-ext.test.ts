import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import {
  changeBp,
  closePositionBp,
  computeSlotIndicators,
  disparityBp,
  maAlignment,
  maSet,
  periodReturnsBp,
  volumeRatioBp,
} from './indicators-ext';

/** 종가 시계열로 일봉 생성 — 고저는 종가 ±spread, 거래량은 고정 */
function candlesOf(closes: number[], opts: { spread?: number; volume?: number } = {}): Candle[] {
  const spread = opts.spread ?? 5;
  const volume = opts.volume ?? 1_000;
  return closes.map((c, i) => ({
    ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + spread,
    l: c - spread,
    c,
    volume,
  }));
}

/** 완만한 상승 추세 (봉당 +1) — 지표가 전부 계산되도록 300봉 */
function risingCloses(n = 300, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => 1_000 + i * step);
}

describe('changeBp', () => {
  it('변화율을 bp 정수로 변환한다', () => {
    expect(changeBp(110, 100)).toBe(1_000);
    expect(changeBp(95, 100)).toBe(-500);
  });

  it('기준값이 0이거나 없으면 null', () => {
    expect(changeBp(110, 0)).toBeNull();
    expect(changeBp(null, 100)).toBeNull();
    expect(changeBp(110, null)).toBeNull();
  });
});

describe('maSet', () => {
  it('데이터가 부족한 기간은 null', () => {
    const ma = maSet(Array.from({ length: 30 }, () => 1_000));
    expect(ma.ma10).toBe(1_000);
    expect(ma.ma20).toBe(1_000);
    expect(ma.ma60).toBeNull();
    expect(ma.ma200).toBeNull();
  });

  it('금액 스케일 유지를 위해 정수로 반올림한다', () => {
    const ma = maSet([1_000, 1_001, 1_001]);
    expect(Number.isInteger(ma.ma10 ?? 0)).toBe(true);
  });
});

describe('maAlignment', () => {
  it('단기가 장기보다 높으면 정배열', () => {
    expect(maAlignment({ ma10: 120, ma20: 110, ma60: 100, ma120: 90, ma200: 80 })).toBe('bull');
  });

  it('단기가 장기보다 낮으면 역배열', () => {
    expect(maAlignment({ ma10: 80, ma20: 90, ma60: 100, ma120: 110, ma200: 120 })).toBe('bear');
  });

  it('뒤섞였거나 비교 대상이 부족하면 mixed', () => {
    expect(maAlignment({ ma10: 120, ma20: 90, ma60: 100, ma120: null, ma200: null })).toBe('mixed');
    expect(maAlignment({ ma10: 120, ma20: null, ma60: null, ma120: null, ma200: null })).toBe('mixed');
  });
});

describe('disparityBp', () => {
  it('종가 대비 MA 이격률을 bp로 낸다', () => {
    const d = disparityBp(110, { ma10: 100, ma20: 100, ma60: null, ma120: null, ma200: null });
    expect(d.ma10).toBe(1_000);
    expect(d.ma60).toBeNull();
  });
});

describe('periodReturnsBp', () => {
  it('룩백이 부족한 구간은 null', () => {
    const r = periodReturnsBp(risingCloses(100));
    expect(r.m1).not.toBeNull();
    expect(r.m3).not.toBeNull();
    expect(r.m6).toBeNull();
    expect(r.y3).toBeNull();
  });

  it('1개월(21거래일) 수익률을 계산한다', () => {
    const closes = [...Array.from({ length: 21 }, () => 1_000), 1_100];
    expect(periodReturnsBp(closes).m1).toBe(1_000);
  });
});

describe('volumeRatioBp', () => {
  it('당일 거래량을 직전 20일 평균과 비교한다 (당일 제외)', () => {
    const volumes = [...Array.from({ length: 20 }, () => 100), 200];
    expect(volumeRatioBp(volumes)).toBe(20_000);
  });

  it('20봉 미만이면 null', () => {
    expect(volumeRatioBp([100, 200])).toBeNull();
  });
});

describe('closePositionBp', () => {
  it('고가 마감은 10000, 저가 마감은 0', () => {
    expect(closePositionBp({ ts: '', o: 100, h: 110, l: 100, c: 110, volume: 1 })).toBe(10_000);
    expect(closePositionBp({ ts: '', o: 100, h: 110, l: 100, c: 100, volume: 1 })).toBe(0);
  });

  it('고저가 같으면(상한가 등) null', () => {
    expect(closePositionBp({ ts: '', o: 100, h: 100, l: 100, c: 100, volume: 1 })).toBeNull();
  });
});

describe('computeSlotIndicators', () => {
  it('빈 캔들은 예외', () => {
    expect(() => computeSlotIndicators([])).toThrow();
  });

  it('상승 추세를 uptrend + 정배열로 판정한다', () => {
    const ind = computeSlotIndicators(candlesOf(risingCloses()));
    expect(ind.phase.uptrend).toBe(true);
    expect(ind.phase.downtrend).toBe(false);
    expect(ind.alignment).toBe('bull');
    expect(ind.slopeBp.ma20_5d).toBeGreaterThan(0);
  });

  it('하락 추세를 downtrend로 판정한다', () => {
    const falling = risingCloses().map((_, i) => 2_000 - i);
    const ind = computeSlotIndicators(candlesOf(falling));
    expect(ind.phase.downtrend).toBe(true);
    expect(ind.phase.uptrend).toBe(false);
    expect(ind.alignment).toBe('bear');
  });

  it('추세 중 저가가 20MA까지 밀렸다가 종가가 10MA 위면 눌림목', () => {
    const candles = candlesOf(risingCloses());
    const lastIdx = candles.length - 1;
    // 마지막 봉만 20MA(≈1289.5) 아래까지 밀렸다가 종가는 10MA(≈1294.5) 위에서 마감
    candles[lastIdx] = { ...candles[lastIdx], l: 1_285 };

    const ind = computeSlotIndicators(candles);
    expect(ind.phase.uptrend).toBe(true);
    expect(ind.phase.pullback).toBe(true);
  });

  it('일중 변동폭만으로는 눌림목이 되지 않는다 (10MA 근접은 노이즈)', () => {
    const ind = computeSlotIndicators(candlesOf(risingCloses()));
    expect(ind.phase.pullback).toBe(false);
  });

  it('거래대금은 종가 × 거래량', () => {
    const ind = computeSlotIndicators(candlesOf(risingCloses(), { volume: 10 }));
    expect(ind.turnover).toBe(1_299 * 10);
  });
});
