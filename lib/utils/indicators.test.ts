import { describe, it, expect } from 'vitest';
import { sma, rsi } from './indicators';

describe('sma', () => {
  it('period 미만은 null, 이후 평균', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('period=1은 원본', () => {
    expect(sma([10, 20], 1)).toEqual([10, 20]);
  });
  it('period<1은 throw', () => {
    expect(() => sma([1], 0)).toThrow();
  });
});

describe('rsi', () => {
  it('데이터가 period 이하면 전부 null', () => {
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
  it('단조 상승은 RSI 100', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20 상승만
    const r = rsi(closes, 14);
    expect(r[14]).toBe(100);
    expect(r[19]).toBe(100);
  });
  it('단조 하락은 RSI 0', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 20 - i);
    const r = rsi(closes, 14);
    expect(r[14]).toBe(0);
  });
  it('period 이전 구간은 null', () => {
    const r = rsi(Array.from({ length: 20 }, (_, i) => i + 1), 14);
    expect(r[13]).toBeNull();
    expect(r[14]).not.toBeNull();
  });
});
