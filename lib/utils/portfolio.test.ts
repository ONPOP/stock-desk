import { describe, it, expect } from 'vitest';
import { computeHoldings, computeRealized, evalHolding, summarizePortfolio } from './portfolio';
import type { RealTrade } from '@/types';

let seq = 0;
function tr(p: Partial<RealTrade> & Pick<RealTrade, 'side' | 'qty' | 'price'>): RealTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    stockId: p.stockId ?? 's1',
    ticker: p.ticker ?? 'AAA',
    name: p.name ?? '종목',
    market: p.market ?? 'KOSPI',
    currency: p.currency ?? 'KRW',
    side: p.side,
    qty: p.qty,
    price: p.price,
    tradeDate: p.tradeDate ?? '2026-01-01',
    memo: null,
    isEtf: p.isEtf ?? false,
    createdAt: p.createdAt ?? `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
  };
}

describe('computeHoldings', () => {
  it('분할 매수 가중평균 평단가', () => {
    const h = computeHoldings([
      tr({ side: 'buy', qty: 100, price: 1000 }),
      tr({ side: 'buy', qty: 50, price: 1300 }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].qty).toBe(150);
    expect(h[0].avgBuyPrice).toBe(1100); // (100*1000+50*1300)/150
    expect(h[0].buyAmount).toBe(165000);
  });

  it('일부 매도 시 평단 유지·실현손익 누적·보유수량 감소', () => {
    const h = computeHoldings([
      tr({ side: 'buy', qty: 150, price: 1100 }),
      tr({ side: 'sell', qty: 50, price: 1500 }),
    ]);
    expect(h[0].qty).toBe(100);
    expect(h[0].avgBuyPrice).toBe(1100);
    expect(h[0].buyAmount).toBe(110000);
    expect(h[0].realizedPnl).toBe(20000); // (1500-1100)*50
  });

  it('전량 매도하면 보유 목록에서 제외', () => {
    const h = computeHoldings([
      tr({ side: 'buy', qty: 100, price: 1000 }),
      tr({ side: 'sell', qty: 100, price: 1200 }),
    ]);
    expect(h).toHaveLength(0);
  });

  it('보유 초과 매도분은 실현손익에서 제외(데이터 오류 방어)', () => {
    const h = computeHoldings([
      tr({ side: 'buy', qty: 50, price: 1000 }),
      tr({ side: 'sell', qty: 100, price: 1200 }), // 50만 실현
    ]);
    expect(h).toHaveLength(0); // qty 0
  });

  it('빈 입력 → 빈 배열', () => {
    expect(computeHoldings([])).toEqual([]);
  });

  it('여러 종목 분리 집계', () => {
    const h = computeHoldings([
      tr({ stockId: 'a', side: 'buy', qty: 10, price: 100 }),
      tr({ stockId: 'b', side: 'buy', qty: 5, price: 200 }),
    ]);
    expect(h).toHaveLength(2);
  });
});

describe('computeRealized', () => {
  it('매도 건별 실현손익·수익률(%)', () => {
    const r = computeRealized([
      tr({ side: 'buy', qty: 100, price: 1100 }),
      tr({ side: 'sell', qty: 50, price: 1500 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].realizedPnl).toBe(20000); // (1500-1100)*50
    expect(r[0].realizedRate).toBeCloseTo(36.36, 1);
    expect(r[0].avgBuyPrice).toBe(1100);
  });

  it('손실 매도', () => {
    const r = computeRealized([
      tr({ side: 'buy', qty: 10, price: 2000 }),
      tr({ side: 'sell', qty: 10, price: 1800 }),
    ]);
    expect(r[0].realizedPnl).toBe(-2000);
    expect(r[0].realizedRate).toBeCloseTo(-10, 1);
  });

  it('매수 없는 매도(데이터 오류)도 죽지 않음', () => {
    const r = computeRealized([tr({ side: 'sell', qty: 10, price: 1000 })]);
    expect(r).toHaveLength(1);
    expect(r[0].avgBuyPrice).toBe(0);
    expect(r[0].realizedRate).toBe(0);
  });
});

describe('evalHolding', () => {
  it('현재가 기준 평가손익·수익률', () => {
    const [h] = computeHoldings([tr({ side: 'buy', qty: 10, price: 1000 })]);
    const e = evalHolding(h, 1200);
    expect(e.currentValue).toBe(12000);
    expect(e.evalPnl).toBe(2000);
    expect(e.evalRate).toBeCloseTo(20, 1);
  });
});

describe('summarizePortfolio', () => {
  it('KRW·USD 혼재 → 원화 환산 통합 + 통화별 분리', () => {
    const holdings = computeHoldings([
      tr({ stockId: 'kr', currency: 'KRW', side: 'buy', qty: 10, price: 10000 }), // 매입 100,000원
      tr({ stockId: 'us', currency: 'USD', side: 'buy', qty: 2, price: 10000 }), // 매입 $200 = 20000센트
    ]);
    const prices = { kr: 11000, us: 12000 }; // 현재가
    const summary = summarizePortfolio(holdings, prices, [], 1300); // 1달러=1300원
    // KRW: buy 100000, cur 110000, pnl 10000
    // USD: buy 20000센트($200), cur 24000센트($240)
    // 원화환산 buy = 100000 + 200*1300 = 360000
    expect(summary.byCurrency).toHaveLength(2);
    expect(summary.krwUnified.buyAmount).toBe(360000);
    expect(summary.krwUnified.currentValue).toBe(110000 + Math.round((24000 / 100) * 1300)); // 110000+312000=422000
    expect(summary.krwUnified.evalPnl).toBe(summary.krwUnified.currentValue - 360000);
  });

  it('보유 없음 → 0', () => {
    const s = summarizePortfolio([], {}, [], 1300);
    expect(s.krwUnified.buyAmount).toBe(0);
    expect(s.krwUnified.evalRate).toBe(0);
    expect(s.byCurrency).toEqual([]);
  });
});
