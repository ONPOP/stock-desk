import { describe, it, expect } from 'vitest';
import { orderSchema, cancelSchema, newSeasonSchema } from './paper';

describe('orderSchema', () => {
  it('정상 매수/매도', () => {
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10 }).success).toBe(true);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'sell', qty: 5, memo: '익절' }).success).toBe(true);
  });
  it('orderType 미지정 시 기본값 market', () => {
    const r = orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10 });
    expect(r.success && r.data.orderType).toBe('market');
  });
  it('지정가 주문 — limitPrice 동반 시 정상(KRW 정수·USD 소수)', () => {
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10, orderType: 'limit', limitPrice: '340000' }).success).toBe(true);
    expect(orderSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', side: 'sell', qty: 5, orderType: 'limit', limitPrice: '253.76' }).success).toBe(true);
  });
  it('지정가인데 limitPrice 누락·0·형식오류 거부', () => {
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10, orderType: 'limit' }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10, orderType: 'limit', limitPrice: '0' }).success).toBe(false);
    expect(orderSchema.safeParse({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 10, orderType: 'limit', limitPrice: 'abc' }).success).toBe(false);
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

describe('cancelSchema', () => {
  it('uuid 정상 / 비uuid 거부', () => {
    expect(cancelSchema.safeParse({ tradeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }).success).toBe(true);
    expect(cancelSchema.safeParse({ tradeId: 'not-a-uuid' }).success).toBe(false);
    expect(cancelSchema.safeParse({ tradeId: null }).success).toBe(false);
  });
});

describe('newSeasonSchema', () => {
  it('정상 입력(기간 포함) 통과', () => {
    expect(
      newSeasonSchema.safeParse({ seedKrw: 10_000_000, seedUsd: 10_000, startDate: '2026-06-16', endDate: '2026-12-31' })
        .success,
    ).toBe(true);
  });
  it('기간 생략해도 통과', () => {
    expect(newSeasonSchema.safeParse({ seedKrw: 5_000_000, seedUsd: 5_000 }).success).toBe(true);
  });
  it('시드 0·음수 거부', () => {
    expect(newSeasonSchema.safeParse({ seedKrw: 0, seedUsd: 10_000 }).success).toBe(false);
    expect(newSeasonSchema.safeParse({ seedKrw: 10_000_000, seedUsd: -1 }).success).toBe(false);
  });
  it('종료일 < 시작일 거부', () => {
    expect(
      newSeasonSchema.safeParse({ seedKrw: 10_000_000, seedUsd: 10_000, startDate: '2026-12-31', endDate: '2026-06-16' })
        .success,
    ).toBe(false);
  });
  it('잘못된 날짜 형식·미허용 필드 거부', () => {
    expect(newSeasonSchema.safeParse({ seedKrw: 10_000_000, seedUsd: 10_000, startDate: '2026/06/16' }).success).toBe(
      false,
    );
    expect(newSeasonSchema.safeParse({ seedKrw: 10_000_000, seedUsd: 10_000, hack: 1 }).success).toBe(false);
  });
});
