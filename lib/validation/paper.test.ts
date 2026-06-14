import { describe, it, expect } from 'vitest';
import { orderSchema } from './paper';

describe('orderSchema', () => {
  it('정상 매수/매도', () => {
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10 }).success).toBe(true);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'sell', qty: 5, memo: '익절' }).success).toBe(true);
  });
  it('수량 0·음수·소수 거부', () => {
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'buy', qty: 0 }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'buy', qty: -1 }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'buy', qty: 1.5 }).success).toBe(false);
  });
  it('잘못된 side·market·미허용 필드 거부', () => {
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'hold', qty: 1 }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'X', side: 'buy', qty: 1 }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'buy', qty: 1, hack: 1 }).success).toBe(false);
  });
});
