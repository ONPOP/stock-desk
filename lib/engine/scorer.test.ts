import { describe, expect, it } from 'vitest';
import type { Market } from '@/types';
import { DEFAULT_SIGNAL_RULES } from './rules';
import { scoreStock, selectForSlot, type ScoreContext, type ScoredStock } from './scorer';
import type { SlotIndicators, StockSnapshot } from './types';

const PERFECT_INDICATORS: SlotIndicators = {
  ma: { ma10: 950, ma20: 900, ma60: 850, ma120: 800, ma200: 750 },
  disparityBp: { ma10: 500, ma20: 1_100, ma60: 1_700, ma120: 2_500, ma200: 3_300 },
  slopeBp: { ma20_5d: 200, ma60_20d: 300 },
  alignment: 'bull',
  rsi14: 55,
  rsiTrend: 'up',
  volumeRatioBp: 15_000,
  turnover: 1_000_000,
  returnsBp: { m1: 500, m3: 1_000, m6: 2_000, m12: 3_000, y3: null },
  closePositionBp: 8_000,
  touchBarsAgo: { ma10: 1, ma20: 2, ma60: null },
  recoveredAboveMa10: true,
  phase: { uptrend: true, pullback: true, pullbackWatch: false, overheated: false, downtrend: false },
};

function snapshotOf(
  overrides: {
    market?: Market;
    alwaysBrief?: boolean;
    ticker?: string;
    indicators?: Partial<SlotIndicators>;
    changeBp?: number | null;
    close?: number;
  } = {},
): StockSnapshot {
  const market = overrides.market ?? 'KOSPI';
  return {
    stock: {
      stockId: `id-${overrides.ticker ?? '005930'}`,
      ticker: overrides.ticker ?? '005930',
      name: '테스트종목',
      market,
      alwaysBrief: overrides.alwaysBrief ?? false,
      radarPin: false,
    },
    priceData: {
      currency: market === 'KOSPI' || market === 'KOSDAQ' ? 'KRW' : 'USD',
      close: overrides.close ?? 1_000,
      open: 980,
      high: 1_010,
      low: 970,
      prevClose: 990,
      changeBp: overrides.changeBp === undefined ? 100 : overrides.changeBp,
      volume: 5_000,
      asOf: '2026-08-04T05:30:00.000Z',
    },
    indicators: { ...PERFECT_INDICATORS, ...overrides.indicators },
    flowData: null,
  };
}

const KR_NET_BUY: ScoreContext = { earningsTonight: false, netBuyKr: true };

describe('scoreStock', () => {
  it('모든 조건 충족 시 100점', () => {
    const r = scoreStock(snapshotOf(), DEFAULT_SIGNAL_RULES, KR_NET_BUY);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('strong_buy');
    expect(r.detail.excluded).toEqual([]);
  });

  it('미국 종목은 수급 항목을 분모에서 제외해 KR과 같은 척도로 비교된다', () => {
    const us = scoreStock(
      snapshotOf({ market: 'NASDAQ', ticker: 'NVDA' }),
      DEFAULT_SIGNAL_RULES,
      { earningsTonight: false, netBuyKr: null },
    );
    expect(us.detail.items.some((i) => i.key === 'flowKr')).toBe(false);
    expect(us.detail.applicableWeight).toBe(85);
    expect(us.score).toBe(100);
  });

  it('KR 수급 미수집은 미충족으로 처리한다', () => {
    const r = scoreStock(snapshotOf(), DEFAULT_SIGNAL_RULES, {
      earningsTonight: false,
      netBuyKr: null,
    });
    expect(r.score).toBe(85);
    expect(r.detail.items.find((i) => i.key === 'flowKr')?.note).toContain('미수집');
  });

  it('RSI가 밴드를 벗어나면 해당 가중치만 잃는다', () => {
    const r = scoreStock(
      snapshotOf({ indicators: { rsi14: 80 } }),
      DEFAULT_SIGNAL_RULES,
      KR_NET_BUY,
    );
    expect(r.score).toBe(85);
    expect(r.grade).toBe('strong_buy');
  });

  it('당일 밤 실적발표는 하드 제외 — 점수 0', () => {
    const r = scoreStock(snapshotOf(), DEFAULT_SIGNAL_RULES, {
      earningsTonight: true,
      netBuyKr: true,
    });
    expect(r.score).toBe(0);
    expect(r.grade).toBe('none');
    expect(r.detail.excluded).toContain('당일 밤 실적발표');
  });

  it('MA200 하회 + 역배열은 하드 제외', () => {
    const r = scoreStock(
      snapshotOf({
        close: 700,
        indicators: { alignment: 'bear' },
      }),
      DEFAULT_SIGNAL_RULES,
      KR_NET_BUY,
    );
    expect(r.detail.excluded).toContain('MA200 하회 + 역배열');
    expect(r.score).toBe(0);
  });

  it('당일 -5% 이상 급락은 하드 제외', () => {
    const r = scoreStock(snapshotOf({ changeBp: -600 }), DEFAULT_SIGNAL_RULES, KR_NET_BUY);
    expect(r.detail.excluded[0]).toContain('당일 급락');
  });

  it('watch 임계 구간은 watch 등급', () => {
    const r = scoreStock(
      snapshotOf({
        indicators: { phase: { ...PERFECT_INDICATORS.phase, pullback: false }, rsi14: 80 },
      }),
      DEFAULT_SIGNAL_RULES,
      KR_NET_BUY,
    );
    expect(r.score).toBe(65);
    expect(r.grade).toBe('watch');
  });
});

describe('selectForSlot', () => {
  function scored(ticker: string, score: number, alwaysBrief = false): ScoredStock {
    return {
      snapshot: snapshotOf({ ticker, alwaysBrief }),
      score,
      grade: 'watch',
      detail: { items: [], applicableWeight: 100, earnedWeight: score, excluded: [] },
    };
  }

  it('always_brief 종목을 먼저 채우고 남은 자리를 점수 상위로 채운다', () => {
    const result = selectForSlot(
      [scored('A', 10, true), scored('B', 90), scored('C', 80), scored('D', 70)],
      3,
    );
    expect(result.selected.map((s) => s.snapshot.stock.ticker)).toEqual(['A', 'B', 'C']);
    expect(result.dropped.map((s) => s.snapshot.stock.ticker)).toEqual(['D']);
  });

  it('하드 제외(0점) 종목으로는 빈자리를 채우지 않는다', () => {
    const result = selectForSlot([scored('A', 50), scored('B', 0), scored('C', 0)], 8);
    expect(result.selected.map((s) => s.snapshot.stock.ticker)).toEqual(['A']);
    expect(result.dropped).toHaveLength(2);
  });

  it('always_brief만으로 예산을 넘으면 점수 상위로 자르고 나머지를 보고한다', () => {
    const result = selectForSlot(
      [scored('A', 10, true), scored('B', 90, true), scored('C', 50, true)],
      2,
    );
    expect(result.selected.map((s) => s.snapshot.stock.ticker)).toEqual(['B', 'C']);
    expect(result.dropped.map((s) => s.snapshot.stock.ticker)).toEqual(['A']);
  });

  it('maxStocks가 0 이하면 예외', () => {
    expect(() => selectForSlot([], 0)).toThrow();
  });
});
