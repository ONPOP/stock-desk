import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, evaluateStrategy, type TickerDayState } from './strategy';
import type { Candle, StrategyParams } from '@/types';

// 2026-07-10(금) 10:00 KST = 01:00 UTC — 장중, 청산 시각(14:50) 전
const BASE_UTC = Date.parse('2026-07-10T01:00:00Z');
const NOW = new Date('2026-07-10T01:00:00Z');
const NO_DAY: TickerDayState = { entriesToday: 0, lastStopLossAt: null };

/** i번째 분봉 — 과거→최신, 마지막 봉이 NOW 직전이 되도록 역산 */
function mkCandles(closes: number[], vols?: number[]): Candle[] {
  return closes.map((c, i) => {
    const ts = new Date(BASE_UTC - (closes.length - 1 - i) * 60_000).toISOString();
    return { ts, o: c, h: c + 1, l: c - 1, c, volume: vols?.[i] ?? 100 };
  });
}

/** 지그재그(±1) — RSI를 50 부근에 묶어두는 중립 시계열 */
function flat(len: number, base = 1000): number[] {
  return Array.from({ length: len }, (_, i) => base + (i % 2 === 0 ? 1 : -1));
}

describe('evaluateStrategy — 가드', () => {
  it('데이터 부족이면 hold', () => {
    const d = evaluateStrategy({ candles: mkCandles(flat(10)), position: null, day: NO_DAY, params: DEFAULT_PARAMS, now: NOW });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('데이터 부족');
  });

  it('손절 후 쿨다운 중이면 진입 안 함', () => {
    const day: TickerDayState = { entriesToday: 1, lastStopLossAt: new Date(BASE_UTC - 10 * 60_000).toISOString() };
    const d = evaluateStrategy({ candles: mkCandles(flat(60)), position: null, day, params: DEFAULT_PARAMS, now: NOW });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('재진입 대기');
  });

  it('일 진입 한도 도달 시 진입 안 함', () => {
    const day: TickerDayState = { entriesToday: 2, lastStopLossAt: null };
    const d = evaluateStrategy({ candles: mkCandles(flat(60)), position: null, day, params: DEFAULT_PARAMS, now: NOW });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('일 진입 한도');
  });

  it('청산 시각 이후에는 신규 진입 금지', () => {
    const late = new Date('2026-07-10T06:00:00Z'); // 15:00 KST
    const d = evaluateStrategy({ candles: mkCandles(flat(60)), position: null, day: NO_DAY, params: DEFAULT_PARAMS, now: late });
    expect(d.action).toBe('hold');
    expect(d.reason).toContain('신규 진입 금지');
  });
});

describe('evaluateStrategy — 청산', () => {
  it('시간 청산: 14:50 KST 이후 무조건 매도', () => {
    const late = new Date('2026-07-10T06:00:00Z'); // 15:00 KST
    const d = evaluateStrategy({
      candles: mkCandles(flat(60)),
      position: { qty: 10, avgPrice: 1000 },
      day: NO_DAY,
      params: DEFAULT_PARAMS,
      now: late,
    });
    expect(d.action).toBe('sell');
    expect(d.reason).toContain('시간 청산');
  });

  it('손절: 진입가 대비 -2% 이하', () => {
    const d = evaluateStrategy({
      candles: mkCandles(flat(60)), // 현재가 ~1000
      position: { qty: 10, avgPrice: 1100 }, // 약 -9%
      day: NO_DAY,
      params: DEFAULT_PARAMS,
      now: NOW,
    });
    expect(d.action).toBe('sell');
    expect(d.reason).toContain('손절');
  });

  it('익절: 진입가 대비 +3% 이상', () => {
    const d = evaluateStrategy({
      candles: mkCandles(flat(60)),
      position: { qty: 10, avgPrice: 900 }, // 약 +11%
      day: NO_DAY,
      params: DEFAULT_PARAMS,
      now: NOW,
    });
    expect(d.action).toBe('sell');
    expect(d.reason).toContain('익절');
  });

  it('VWAP 하향 이탈 연속 봉 → 매도 (손익 중립 상태)', () => {
    // 앞은 1000 부근, 마지막 5봉 하락 → 종가 < 누적 VWAP. 평단 = 현재가(손익 0%)로 손절·익절 미발동.
    const closes = [...flat(55), 996, 994, 992, 991, 990];
    const d = evaluateStrategy({
      candles: mkCandles(closes),
      position: { qty: 10, avgPrice: 990 },
      day: NO_DAY,
      params: DEFAULT_PARAMS,
      now: NOW,
    });
    expect(d.action).toBe('sell');
    expect(d.reason).toContain('VWAP 하향 이탈');
  });

  it('avgPrice 0(오염 데이터)이면 가짜 익절/손절이 발동하지 않는다', () => {
    // retPct=Infinity 회귀 방지 — 손익 판정은 중립(0%)으로 처리되어야 함
    const closes = [...flat(40), ...Array.from({ length: 20 }, (_, i) => 1000 + (i + 1) * 2)];
    const d = evaluateStrategy({
      candles: mkCandles(closes),
      position: { qty: 10, avgPrice: 0 },
      day: NO_DAY,
      params: { ...DEFAULT_PARAMS, rsiExit: 101 },
      now: NOW,
    });
    expect(d.action).toBe('hold');
    expect(d.reason).toBe('보유 유지');
  });

  it('조건 미충족이면 보유 유지', () => {
    // 완만한 상승 지속: VWAP 상방·MACD 양(+) 유지·손익 0% — RSI 과열만 파라미터로 끔
    const closes = [...flat(40), ...Array.from({ length: 20 }, (_, i) => 1000 + (i + 1) * 2)];
    const last = closes[closes.length - 1];
    const d = evaluateStrategy({
      candles: mkCandles(closes),
      position: { qty: 10, avgPrice: last },
      day: NO_DAY,
      params: { ...DEFAULT_PARAMS, rsiExit: 101 },
      now: NOW,
    });
    expect(d.action).toBe('hold');
    expect(d.reason).toBe('보유 유지');
  });
});

describe('evaluateStrategy — 진입 (4조건 AND)', () => {
  // RSI·거래량 밴드를 넓혀 크로스·VWAP·거래량 게이트 자체를 검증 (튜닝 아님)
  const wide: StrategyParams = { ...DEFAULT_PARAMS, rsiEntryMin: 0, rsiEntryMax: 101, volMultiplier: 1.2 };

  /** 평탄 → 얕은 하락 → 강한 상승(고거래량) — VWAP 돌파 후 MACD 전환 창(4봉) 안에서 진입이 나오는 시계열 */
  function trendSeries(): { closes: number[]; vols: number[] } {
    const closes = [
      ...Array.from({ length: 40 }, () => 1000),
      ...Array.from({ length: 10 }, (_, i) => 1000 - (i + 1) * 2), // → 980
      ...Array.from({ length: 30 }, (_, i) => 980 + (i + 1) * 4), // 상승
    ];
    const vols = closes.map((_, i) => (i >= 50 ? 300 : 100));
    return { closes, vols };
  }

  function countBuys(params: StrategyParams): number {
    const { closes, vols } = trendSeries();
    const candles = mkCandles(closes, vols);
    let buys = 0;
    for (let i = 45; i <= candles.length; i++) {
      const d = evaluateStrategy({ candles: candles.slice(0, i), position: null, day: NO_DAY, params, now: NOW });
      if (d.action === 'buy') buys++;
    }
    return buys;
  }

  it('상승 전환 + 거래량 급증 구간에서 진입이 발생한다', () => {
    expect(countBuys(wide)).toBeGreaterThan(0);
  });

  it('거래량 게이트: 배수를 올리면 같은 시계열에서 진입 0', () => {
    expect(countBuys({ ...wide, volMultiplier: 10 })).toBe(0);
  });

  it('MACD 창 게이트: 창을 1봉으로 좁히면 같은 시계열에서 진입 0', () => {
    expect(countBuys({ ...wide, macdCrossWithinBars: 1 })).toBe(0);
  });

  it('하락 추세(가격 < VWAP)에서는 진입하지 않는다', () => {
    const closes = Array.from({ length: 70 }, (_, i) => 1100 - i); // 단조 하락
    const d = evaluateStrategy({ candles: mkCandles(closes), position: null, day: NO_DAY, params: wide, now: NOW });
    expect(d.action).toBe('hold');
  });
});
