import { describe, it, expect } from 'vitest';
import { cashTxInputSchema } from './cash';

const valid = { currency: 'KRW', type: 'deposit', amount: 1_000_000, txDate: '2026-06-17' };

describe('cashTxInputSchema', () => {
  it('정상 입력 통과', () => {
    expect(cashTxInputSchema.safeParse(valid).success).toBe(true);
  });
  it('금액 0 이하 거부', () => {
    expect(cashTxInputSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(cashTxInputSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });
  it('금액 소수 거부(최소 단위 정수)', () => {
    expect(cashTxInputSchema.safeParse({ ...valid, amount: 100.5 }).success).toBe(false);
  });
  it('잘못된 통화·유형 거부', () => {
    expect(cashTxInputSchema.safeParse({ ...valid, currency: 'EUR' }).success).toBe(false);
    expect(cashTxInputSchema.safeParse({ ...valid, type: 'transfer' }).success).toBe(false);
  });
  it('날짜 형식 거부', () => {
    expect(cashTxInputSchema.safeParse({ ...valid, txDate: '2026/06/17' }).success).toBe(false);
  });
  it('memo 생략 가능', () => {
    expect(cashTxInputSchema.safeParse(valid).success).toBe(true);
    expect(cashTxInputSchema.safeParse({ ...valid, memo: '월급' }).success).toBe(true);
  });
});
