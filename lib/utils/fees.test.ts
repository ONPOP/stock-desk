import { describe, it, expect } from 'vitest';
import { computeFee, feeRate } from './fees';

describe('feeRate', () => {
  it('국내 매수는 0.018%', () => {
    expect(feeRate('KOSPI', 'buy', false).toNumber()).toBe(0.00018);
    expect(feeRate('KOSDAQ', 'buy', true).toNumber()).toBe(0.00018); // ETF여도 매수 동일
  });
  it('국내 일반주식 매도는 0.218%(거래세 포함)', () => {
    expect(feeRate('KOSPI', 'sell', false).toNumber()).toBe(0.00218);
  });
  it('국내 ETF 매도는 0.018%(거래세 면제)', () => {
    expect(feeRate('KOSPI', 'sell', true).toNumber()).toBe(0.00018);
  });
  it('미국 매수 0.25% / 매도 0.25206%', () => {
    expect(feeRate('NASDAQ', 'buy', false).toNumber()).toBe(0.0025);
    expect(feeRate('NYSE', 'sell', false).toNumber()).toBe(0.0025206);
  });
});

describe('computeFee', () => {
  it('국내 일반주식 매도 1,000,000원 → 2,180원', () => {
    expect(computeFee(1_000_000, 'KOSPI', 'sell', false)).toBe(2180);
  });
  it('국내 ETF 매도 1,000,000원 → 180원(거래세 면제)', () => {
    expect(computeFee(1_000_000, 'KOSPI', 'sell', true)).toBe(180);
  });
  it('국내 매수 1,000,000원 → 180원', () => {
    expect(computeFee(1_000_000, 'KOSDAQ', 'buy', false)).toBe(180);
  });
  it('미국 매수 100,000센트($1,000) → 250센트', () => {
    expect(computeFee(100_000, 'NASDAQ', 'buy', false)).toBe(250);
  });
  it('미국 매도 100,000센트($1,000) → 252센트(반올림)', () => {
    // 100000 * 0.0025206 = 252.06 → 252
    expect(computeFee(100_000, 'NYSE', 'sell', false)).toBe(252);
  });
  it('금액 0이면 수수료 0', () => {
    expect(computeFee(0, 'KOSPI', 'sell', false)).toBe(0);
  });
});
