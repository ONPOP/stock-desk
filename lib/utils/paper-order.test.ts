import { describe, it, expect } from 'vitest';
import { shouldFillLimitOrder } from './paper-order';

describe('shouldFillLimitOrder', () => {
  describe('매수(buy) — 현재가 <= 지정가일 때 체결', () => {
    it('현재가가 지정가보다 낮으면 체결', () => {
      expect(shouldFillLimitOrder('buy', 9_900, 10_000)).toBe(true);
    });
    it('현재가가 지정가와 같으면 체결', () => {
      expect(shouldFillLimitOrder('buy', 10_000, 10_000)).toBe(true);
    });
    it('현재가가 지정가보다 높으면 미체결', () => {
      expect(shouldFillLimitOrder('buy', 10_100, 10_000)).toBe(false);
    });
  });

  describe('매도(sell) — 현재가 >= 지정가일 때 체결', () => {
    it('현재가가 지정가보다 높으면 체결', () => {
      expect(shouldFillLimitOrder('sell', 10_100, 10_000)).toBe(true);
    });
    it('현재가가 지정가와 같으면 체결', () => {
      expect(shouldFillLimitOrder('sell', 10_000, 10_000)).toBe(true);
    });
    it('현재가가 지정가보다 낮으면 미체결', () => {
      expect(shouldFillLimitOrder('sell', 9_900, 10_000)).toBe(false);
    });
  });

  it('USD 센트 단위(소수 둘째 자리) 비교도 정수로 정확', () => {
    // $253.76 = 25376센트, $254.00 = 25400센트
    expect(shouldFillLimitOrder('buy', 25_376, 25_400)).toBe(true);
    expect(shouldFillLimitOrder('sell', 25_376, 25_400)).toBe(false);
  });
});
