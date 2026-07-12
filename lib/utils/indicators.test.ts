import { describe, it, expect } from 'vitest';
import { sma, rsi, ema, macd, vwap, type VwapCandle } from './indicators';

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

describe('ema', () => {
  it('시드는 첫 period SMA, 이전 구간 null', () => {
    const e = ema([1, 2, 3, 4], 3);
    expect(e[0]).toBeNull();
    expect(e[1]).toBeNull();
    expect(e[2]).toBe(2); // (1+2+3)/3
    expect(e[3]).toBeCloseTo(2 + (4 - 2) * (2 / 4)); // k=0.5
  });
  it('데이터 부족이면 전부 null', () => {
    expect(ema([1, 2], 5).every((v) => v === null)).toBe(true);
  });
  it('상수 시계열은 그 상수', () => {
    const e = ema(new Array(10).fill(7), 3);
    expect(e[9]).toBeCloseTo(7);
  });
});

describe('macd', () => {
  it('상수 시계열은 macd·hist 0', () => {
    const m = macd(new Array(50).fill(100), 12, 26, 9);
    expect(m.macd[49]).toBeCloseTo(0);
    expect(m.hist[49]).toBeCloseTo(0);
  });
  it('상승 전환 시 hist가 음→양으로 돈다', () => {
    // 하락 후 상승 — 어느 지점에서 hist 부호가 음→양 전환되어야 한다
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 200 - i), // 하락
      ...Array.from({ length: 40 }, (_, i) => 160 + i * 2), // 상승
    ];
    const { hist } = macd(closes);
    const flips = hist.some((v, i) => i > 0 && v !== null && hist[i - 1] !== null && (hist[i - 1] as number) <= 0 && v > 0);
    expect(flips).toBe(true);
  });
  it('fast >= slow는 throw', () => {
    expect(() => macd([1, 2, 3], 26, 12, 9)).toThrow();
  });
  it('워밍업 구간은 null', () => {
    const m = macd(Array.from({ length: 50 }, (_, i) => i), 12, 26, 9);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).not.toBeNull();
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull();
  });
});

describe('vwap', () => {
  const bar = (ts: string, price: number, volume: number): VwapCandle => ({ ts, h: price, l: price, c: price, volume });
  const dayKey = (ts: string) => ts.slice(0, 10);

  it('누적 가중평균 — 거래량이 큰 가격 쪽으로 치우친다', () => {
    const v = vwap(
      [bar('2026-07-10T00:00:00Z', 100, 100), bar('2026-07-10T00:01:00Z', 200, 300)],
      dayKey,
    );
    expect(v[0]).toBe(100);
    expect(v[1]).toBeCloseTo((100 * 100 + 200 * 300) / 400); // 175
  });
  it('날짜가 바뀌면 누적 리셋', () => {
    const v = vwap(
      [bar('2026-07-10T00:00:00Z', 100, 100), bar('2026-07-11T00:00:00Z', 300, 100)],
      dayKey,
    );
    expect(v[1]).toBe(300); // 전일 누적 미반영
  });
  it('거래량 0 구간은 null', () => {
    const v = vwap([bar('2026-07-10T00:00:00Z', 100, 0)], dayKey);
    expect(v[0]).toBeNull();
  });
});
