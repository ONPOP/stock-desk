import { describe, it, expect } from 'vitest';
import { tradeInputSchema } from './trades';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const base = { stockId: UUID, side: 'buy' as const, qty: 10, price: 80000, tradeDate: '2026-06-15' };

describe('tradeInputSchema — 정상', () => {
  it('매수/매도 정상 입력 통과', () => {
    expect(tradeInputSchema.safeParse(base).success).toBe(true);
    expect(tradeInputSchema.safeParse({ ...base, side: 'sell' }).success).toBe(true);
  });

  it('memo는 선택(미지정·null 허용)', () => {
    expect(tradeInputSchema.safeParse(base).success).toBe(true);
    expect(tradeInputSchema.safeParse({ ...base, memo: null }).success).toBe(true);
    expect(tradeInputSchema.safeParse({ ...base, memo: '분할 매수 1차' }).success).toBe(true);
  });
});

describe('tradeInputSchema — 비정상', () => {
  it('stockId가 uuid가 아니면 거부', () => {
    expect(tradeInputSchema.safeParse({ ...base, stockId: 'not-uuid' }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, stockId: '005930' }).success).toBe(false);
  });

  it('side는 buy/sell만 허용', () => {
    expect(tradeInputSchema.safeParse({ ...base, side: 'hold' }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, side: 'BUY' }).success).toBe(false);
  });

  it('qty는 0·음수·소수·비숫자를 거부', () => {
    expect(tradeInputSchema.safeParse({ ...base, qty: 0 }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, qty: -5 }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, qty: 1.5 }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, qty: '10' }).success).toBe(false);
  });

  it('price는 0·음수·소수를 거부', () => {
    expect(tradeInputSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, price: -100 }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, price: 80000.5 }).success).toBe(false);
  });

  it('tradeDate는 YYYY-MM-DD 형식만 허용', () => {
    expect(tradeInputSchema.safeParse({ ...base, tradeDate: '2026/06/15' }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, tradeDate: '20260615' }).success).toBe(false);
    expect(tradeInputSchema.safeParse({ ...base, tradeDate: '' }).success).toBe(false);
  });

  it('memo 500자 초과 거부', () => {
    expect(tradeInputSchema.safeParse({ ...base, memo: 'x'.repeat(501) }).success).toBe(false);
  });
});
