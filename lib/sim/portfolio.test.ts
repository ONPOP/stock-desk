import { describe, expect, it } from 'vitest';
import { computeSimPortfolio, type SimTradeLite } from '@/lib/sim/portfolio';

const SEED = 1_000_000; // $10,000 = 1,000,000센트

describe('computeSimPortfolio', () => {
  it('단순 매수: 현금 차감·보유 생성', () => {
    const trades: SimTradeLite[] = [{ ticker: 'NVDA', side: 'buy', qty: 10, priceCents: 5000 }];
    const r = computeSimPortfolio(SEED, trades);
    expect(r.cashCents).toBe(SEED - 50_000);
    expect(r.positions).toEqual([{ ticker: 'NVDA', qty: 10, avgCostCents: 5000 }]);
    expect(r.realizedPnlCents).toBe(0);
  });

  it('분할 매수: 가중평균 평단가', () => {
    const trades: SimTradeLite[] = [
      { ticker: 'NVDA', side: 'buy', qty: 10, priceCents: 5000 },
      { ticker: 'NVDA', side: 'buy', qty: 30, priceCents: 9000 },
    ];
    const r = computeSimPortfolio(SEED, trades);
    // (10*5000 + 30*9000)/40 = 320000/40 = 8000
    expect(r.positions[0]).toEqual({ ticker: 'NVDA', qty: 40, avgCostCents: 8000 });
  });

  it('매도: 실현손익 = 수량×(매도가−평단)·잔여수량 유지', () => {
    const trades: SimTradeLite[] = [
      { ticker: 'NVDA', side: 'buy', qty: 10, priceCents: 5000 },
      { ticker: 'NVDA', side: 'sell', qty: 4, priceCents: 8000 },
    ];
    const r = computeSimPortfolio(SEED, trades);
    expect(r.realizedPnlCents).toBe(4 * (8000 - 5000)); // 12000
    expect(r.positions[0]).toEqual({ ticker: 'NVDA', qty: 6, avgCostCents: 5000 });
    expect(r.cashCents).toBe(SEED - 50_000 + 32_000);
  });

  it('전량 매도 시 포지션 제거', () => {
    const trades: SimTradeLite[] = [
      { ticker: 'AMD', side: 'buy', qty: 5, priceCents: 10000 },
      { ticker: 'AMD', side: 'sell', qty: 5, priceCents: 12000 },
    ];
    const r = computeSimPortfolio(SEED, trades);
    expect(r.positions).toEqual([]);
    expect(r.realizedPnlCents).toBe(5 * 2000);
  });
});
