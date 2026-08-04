import { describe, expect, it } from 'vitest';
import { DEFAULT_WATCH_ZONE, type WatchZoneRules } from './rules';
import { radarCommentTargets, selectRadar } from './radar';
import type { ScoredStock } from './scorer';
import type { SlotIndicators, StockSnapshot } from './types';

const BASE_INDICATORS: SlotIndicators = {
  ma: { ma10: 1_020, ma20: 1_000, ma60: 950, ma120: 900, ma200: 850 },
  disparityBp: { ma10: -200, ma20: 100, ma60: 500, ma120: 1_000, ma200: 1_500 },
  slopeBp: { ma20_5d: 150, ma60_20d: 200 },
  alignment: 'bull',
  rsi14: 45,
  rsiTrend: 'down',
  volumeRatioBp: 9_000,
  turnover: 500_000,
  returnsBp: { m1: 200, m3: 900, m6: 1_500, m12: 2_500, y3: null },
  closePositionBp: 4_000,
  touchBarsAgo: { ma10: 0, ma20: 2, ma60: null },
  recoveredAboveMa10: false,
  phase: { uptrend: true, pullback: false, pullbackWatch: true, overheated: false, downtrend: false },
};

function scored(
  ticker: string,
  overrides: Partial<SlotIndicators> = {},
): ScoredStock {
  const snapshot: StockSnapshot = {
    stock: { stockId: `id-${ticker}`, ticker, name: ticker, market: 'KOSPI', alwaysBrief: false, radarPin: false },
    priceData: {
      currency: 'KRW',
      close: 1_010,
      open: 1_005,
      high: 1_020,
      low: 995,
      prevClose: 1_015,
      changeBp: -49,
      volume: 1_000,
      asOf: '2026-08-04T05:30:00.000Z',
    },
    indicators: { ...BASE_INDICATORS, ...overrides },
    flowData: null,
  };
  return {
    snapshot,
    score: 40,
    grade: 'none',
    detail: { items: [], applicableWeight: 100, earnedWeight: 40, excluded: [] },
  };
}

const EMPTY = new Set<string>();
const zone = (o: Partial<WatchZoneRules> = {}): WatchZoneRules => ({ ...DEFAULT_WATCH_ZONE, ...o });

describe('selectRadar', () => {
  it('조건을 만족하는 종목을 관찰중 상태로 뽑는다', () => {
    const out = selectRadar({
      scored: [scored('A')],
      zone: zone(),
      pinnedStockIds: EMPTY,
      selectedStockIds: EMPTY,
    });
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe('watching');
    expect(out[0].barsSinceTouch).toBe(2);
    expect(out[0].disparityBp).toBe(100);
  });

  it('MA10을 회복했으면 진입임박', () => {
    const out = selectRadar({
      scored: [scored('A', { recoveredAboveMa10: true })],
      zone: zone(),
      pinnedStockIds: EMPTY,
      selectedStockIds: EMPTY,
    });
    expect(out[0].state).toBe('entry_ready');
  });

  it('비활성화하면 아무것도 뽑지 않는다', () => {
    expect(
      selectRadar({ scored: [scored('A')], zone: zone({ enabled: false }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toEqual([]);
  });

  it('strict는 MA 기울기까지 우상향이어야 통과한다', () => {
    // 급락 후 반등: 종가는 MA20 위지만 MA 기울기는 아직 음수
    const bouncing = scored('A', { phase: { ...BASE_INDICATORS.phase, uptrend: false } });
    expect(
      selectRadar({ scored: [bouncing], zone: zone({ trendMode: 'strict' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
    expect(
      selectRadar({ scored: [bouncing], zone: zone({ trendMode: 'loose' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(1);
  });

  it('loose는 종가가 MA20 아래면 제외한다', () => {
    const below = scored('A', {
      phase: { ...BASE_INDICATORS.phase, uptrend: false },
      disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: -50 },
    });
    expect(
      selectRadar({ scored: [below], zone: zone({ trendMode: 'loose' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
    expect(
      selectRadar({ scored: [below], zone: zone({ trendMode: 'off' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(1);
  });

  it('되돌아보기 창 밖에서 터치했으면 제외한다', () => {
    const stale = scored('A', { touchBarsAgo: { ma10: 0, ma20: 9, ma60: null } });
    expect(
      selectRadar({ scored: [stale], zone: zone({ lookbackBars: 5 }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
    expect(
      selectRadar({ scored: [stale], zone: zone({ lookbackBars: 10 }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(1);
  });

  it('이격 밴드를 벗어나면 제외한다', () => {
    const hot = scored('A', {
      disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 900 },
    });
    expect(
      selectRadar({ scored: [hot], zone: zone(), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
  });

  it('RSI 밴드를 벗어나면 제외한다', () => {
    const hot = scored('A', { rsi14: 70 });
    expect(
      selectRadar({ scored: [hot], zone: zone(), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
  });

  it('고정 종목은 조건을 무시하고 항상 포함하며 맨 앞에 온다', () => {
    const out = selectRadar({
      scored: [scored('A'), scored('PIN', { rsi14: 90, phase: { ...BASE_INDICATORS.phase, uptrend: false } })],
      zone: zone(),
      pinnedStockIds: new Set(['id-PIN']),
      selectedStockIds: EMPTY,
    });
    expect(out.map((e) => e.snapshot.stock.ticker)).toEqual(['PIN', 'A']);
    expect(out[0].pinned).toBe(true);
  });

  it('이미 분석 대상으로 선정된 종목은 중복 노출하지 않는다 (고정이라도)', () => {
    const out = selectRadar({
      scored: [scored('A')],
      zone: zone(),
      pinnedStockIds: new Set(['id-A']),
      selectedStockIds: new Set(['id-A']),
    });
    expect(out).toHaveLength(0);
  });

  it('더 많이 눌린 순으로 정렬하고 maxCount로 자른다', () => {
    const out = selectRadar({
      scored: [
        scored('HIGH', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 250 } }),
        scored('LOW', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 30 } }),
        scored('MID', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 150 } }),
      ],
      zone: zone({ maxCount: 2 }),
      pinnedStockIds: EMPTY,
      selectedStockIds: EMPTY,
    });
    expect(out.map((e) => e.snapshot.stock.ticker)).toEqual(['LOW', 'MID']);
  });

  it('loose에서는 밴드 음수 구간이 사실상 닫힌다 — MA20 아래를 보려면 추세 무관으로 둬야 한다', () => {
    const dipped = scored('A', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: -200 } });
    expect(
      selectRadar({ scored: [dipped], zone: zone({ trendMode: 'loose' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(0);
    expect(
      selectRadar({ scored: [dipped], zone: zone({ trendMode: 'off' }), pinnedStockIds: EMPTY, selectedStockIds: EMPTY }),
    ).toHaveLength(1);
  });
});

describe('radarCommentTargets', () => {
  it('진입임박을 우선해 최대 3종목만 넘긴다', () => {
    const entries = selectRadar({
      scored: [
        scored('W1'),
        scored('W2', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 60 } }),
        scored('E1', { recoveredAboveMa10: true, disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 200 } }),
        scored('W3', { disparityBp: { ...BASE_INDICATORS.disparityBp, ma20: 30 } }),
      ],
      zone: zone(),
      pinnedStockIds: EMPTY,
      selectedStockIds: EMPTY,
    });
    const targets = radarCommentTargets(entries);
    expect(targets).toHaveLength(3);
    expect(targets[0].snapshot.stock.ticker).toBe('E1');
  });
});
