import { describe, it, expect } from 'vitest';
import { computeCashBalance, summarizeAssets } from './cash';
import type { CashTransaction, PortfolioSummary, RealTrade } from '@/types';

let seq = 0;
function tx(p: Partial<CashTransaction> & Pick<CashTransaction, 'currency' | 'type' | 'amount'>): CashTransaction {
  seq += 1;
  return {
    id: `c${seq}`,
    currency: p.currency,
    type: p.type,
    amount: p.amount,
    txDate: p.txDate ?? '2026-01-01',
    memo: p.memo ?? null,
    createdAt: p.createdAt ?? `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
  };
}
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

describe('computeCashBalance', () => {
  it('입금 − 출금', () => {
    const bal = computeCashBalance(
      [tx({ currency: 'KRW', type: 'deposit', amount: 10_000_000 }), tx({ currency: 'KRW', type: 'withdraw', amount: 3_000_000 })],
      [],
    );
    expect(bal.KRW).toBe(7_000_000);
    expect(bal.USD).toBe(0);
  });

  it('매수는 매수금액+수수료를 차감', () => {
    // 입금 1,000,000 − 매수(80,000×10=800,000 + 수수료 800,000×0.018%=144) = 199,856
    const bal = computeCashBalance(
      [tx({ currency: 'KRW', type: 'deposit', amount: 1_000_000 })],
      [tr({ side: 'buy', qty: 10, price: 80_000 })],
    );
    expect(bal.KRW).toBe(199_856);
  });

  it('매도는 매도금액−수수료를 가산(일반주식 거래세 포함)', () => {
    // 매도 80,000×10=800,000 − 수수료 800,000×0.218%=1,744 = +798,256
    const bal = computeCashBalance([], [tr({ side: 'sell', qty: 10, price: 80_000 })]);
    expect(bal.KRW).toBe(798_256);
  });

  it('ETF 매도는 거래세 면제(0.018%)', () => {
    // 800,000 − 800,000×0.018%=144 = +799,856
    const bal = computeCashBalance([], [tr({ side: 'sell', qty: 10, price: 80_000, isEtf: true })]);
    expect(bal.KRW).toBe(799_856);
  });

  it('통화별 분리(USD 매매는 센트)', () => {
    const bal = computeCashBalance(
      [tx({ currency: 'USD', type: 'deposit', amount: 1_000_000 })], // $10,000
      [tr({ side: 'buy', qty: 10, price: 20_000, currency: 'USD', market: 'NASDAQ' })], // $200×10=$2,000=200,000센트, 수수료 200,000×0.25%=500
    );
    expect(bal.USD).toBe(799_500); // 1,000,000 − 200,000 − 500
    expect(bal.KRW).toBe(0);
  });

  it('입금 없이 매수만 있으면 음수 허용', () => {
    const bal = computeCashBalance([], [tr({ side: 'buy', qty: 10, price: 80_000 })]);
    expect(bal.KRW).toBeLessThan(0);
  });
});

describe('summarizeAssets', () => {
  const portfolio: PortfolioSummary = {
    byCurrency: [
      { currency: 'KRW', buyAmount: 800_000, currentValue: 900_000, evalPnl: 100_000, realizedPnl: 0 },
      { currency: 'USD', buyAmount: 200_000, currentValue: 220_000, evalPnl: 20_000, realizedPnl: 0 },
    ],
    krwUnified: { buyAmount: 1_060_000, currentValue: 1_186_000, evalPnl: 126_000, evalRate: 11.89, realizedPnl: 0 },
  };

  it('전체 자산 = 예수금(₩환산) + 평가금액(₩환산)', () => {
    const bal = { KRW: 500_000, USD: 100_000 }; // USD 100,000센트 = $1,000
    const a = summarizeAssets(portfolio, bal, 1300);
    // 예수금 = 500,000 + (1000 * 1300) = 1,800,000
    expect(a.krwUnified.cash).toBe(1_800_000);
    // 전체 = 예수금 1,800,000 + 평가 1,186,000 = 2,986,000
    expect(a.krwUnified.totalAsset).toBe(2_986_000);
    expect(a.krwUnified.evalPnl).toBe(126_000);
  });

  it('통화별 예수금·매입·평가 분리', () => {
    const bal = { KRW: 500_000, USD: 100_000 };
    const a = summarizeAssets(portfolio, bal, 1300);
    const krw = a.byCurrency.find((c) => c.currency === 'KRW')!;
    expect(krw.cash).toBe(500_000);
    expect(krw.buyAmount).toBe(800_000);
    expect(krw.currentValue).toBe(900_000);
  });

  it('환율 0이면 USD 환산 보류(KRW만)', () => {
    const bal = { KRW: 500_000, USD: 100_000 };
    const a = summarizeAssets(portfolio, bal, 0);
    expect(a.krwUnified.cash).toBe(500_000); // USD분은 0
  });

  it('보유·예수금 모두 0인 통화는 byCurrency에서 제외', () => {
    const empty: PortfolioSummary = { byCurrency: [], krwUnified: { buyAmount: 0, currentValue: 0, evalPnl: 0, evalRate: 0, realizedPnl: 0 } };
    const a = summarizeAssets(empty, { KRW: 1000, USD: 0 }, 1300);
    expect(a.byCurrency).toHaveLength(1);
    expect(a.byCurrency[0].currency).toBe('KRW');
  });
});
