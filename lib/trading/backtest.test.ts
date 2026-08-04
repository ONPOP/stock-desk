import { describe, it, expect } from 'vitest';
import { runBacktest } from './backtest';
import { DEFAULT_PARAMS } from './strategy';
import type { Candle, StrategyParams } from '@/types';

const BASE_UTC = Date.parse('2026-07-10T00:30:00Z'); // 09:30 KST 장중 시작

function mkCandles(closes: number[], vols: number[]): Candle[] {
  return closes.map((c, i) => ({
    ts: new Date(BASE_UTC + i * 60_000).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    volume: vols[i],
  }));
}

// 게이트 검증용 완화 파라미터 (튜닝 아님) + 빠른 익절로 사이클 완성 유도
const params: StrategyParams = {
  ...DEFAULT_PARAMS,
  rsiEntryMin: 0,
  rsiEntryMax: 101,
  volMultiplier: 1.2,
  takeProfitPct: 1,
};

describe('runBacktest', () => {
  it('빈 캔들이면 거래 0, 시드 보존', () => {
    const r = runBacktest([], params, 10_000_000);
    expect(r.trades).toHaveLength(0);
    expect(r.stats.endingEquity).toBe(10_000_000);
    expect(r.stats.returnPct).toBe(0);
  });

  it('상승 전환 시계열에서 최소 1회 매매 사이클 완성 + 회계 일관성', () => {
    const closes = [
      ...Array.from({ length: 40 }, () => 10_000),
      ...Array.from({ length: 10 }, (_, i) => 10_000 - (i + 1) * 20), // 얕은 하락 → 9,800
      ...Array.from({ length: 50 }, (_, i) => 9_800 + (i + 1) * 40), // 강한 상승 (+1% 익절 도달)
    ];
    const vols = closes.map((_, i) => (i >= 50 ? 300 : 100));
    const r = runBacktest(mkCandles(closes, vols), params, 10_000_000);

    expect(r.stats.tradeCount).toBeGreaterThan(0);
    // 수수료 없음 → 최종 에쿼티 = 시드 + 총손익 (정수 원 단위)
    expect(r.stats.endingEquity).toBe(10_000_000 + r.stats.totalPnl);
    for (const t of r.trades) {
      expect(t.pnl).toBe((t.exitPrice - t.entryPrice) * t.qty);
      expect(new Date(t.exitTs).getTime()).toBeGreaterThanOrEqual(new Date(t.entryTs).getTime());
    }
  });

  it('잔여 포지션은 마지막 봉에서 강제 청산된다', () => {
    // 진입 후 익절·손절 조건에 안 닿는 완만한 흐름 → 종료 시 강제 청산 발생 가능성 검증
    const closes = [
      ...Array.from({ length: 40 }, () => 10_000),
      ...Array.from({ length: 10 }, (_, i) => 10_000 - (i + 1) * 20),
      ...Array.from({ length: 30 }, (_, i) => 9_800 + (i + 1) * 30), // 상승 (익절 조건은 50%로 꺼둠)
    ];
    const vols = closes.map((_, i) => (i >= 50 ? 300 : 100));
    const noExit: StrategyParams = { ...params, takeProfitPct: 50, stopLossPct: 50, vwapExitBars: 999, rsiExit: 101 };
    const r = runBacktest(mkCandles(closes, vols), noExit, 10_000_000);
    if (r.trades.length > 0) {
      expect(r.trades[r.trades.length - 1].exitReason).toContain('강제 청산');
    }
    expect(r.stats.endingEquity).toBe(10_000_000 + r.stats.totalPnl);
  });

  it('일간 손실 한도 도달 후 신규 진입이 차단된다 (매매 수 감소)', () => {
    // 급등→급락 반복으로 손절 유발
    const seg = [
      ...Array.from({ length: 10 }, (_, i) => 10_000 + i * 20),
      ...Array.from({ length: 10 }, (_, i) => 10_200 - i * 40),
    ];
    const closes = [...Array.from({ length: 40 }, () => 10_000), ...seg, ...seg, ...seg, ...seg];
    const vols = closes.map((_, i) => (i >= 40 ? 300 : 100));
    const loose = { ...params, reentryCooldownMin: 0, maxEntriesPerDay: 99, dailyLossLimitPct: 100 };
    const strictLoss = { ...loose, dailyLossLimitPct: 0.1 };
    const many = runBacktest(mkCandles(closes, vols), loose, 10_000_000);
    const few = runBacktest(mkCandles(closes, vols), strictLoss, 10_000_000);
    expect(few.stats.tradeCount).toBeLessThanOrEqual(many.stats.tradeCount);
  });
});
