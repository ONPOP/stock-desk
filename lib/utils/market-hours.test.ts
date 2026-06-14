import { describe, expect, it } from 'vitest';
import { isAnyMarketOpen, isHoliday, isMarketOpen, regionOf } from '@/lib/utils/market-hours';

describe('regionOf', () => {
  it('시장 → 지역 매핑', () => {
    expect(regionOf('KOSPI')).toBe('KR');
    expect(regionOf('KOSDAQ')).toBe('KR');
    expect(regionOf('NYSE')).toBe('US');
    expect(regionOf('NASDAQ')).toBe('US');
  });
});

describe('isMarketOpen — 한국 (09:00~15:30 KST)', () => {
  it('평일 장중 개장', () => {
    // 2026-06-12(금) KST 10:00 = UTC 01:00
    expect(isMarketOpen('KR', new Date('2026-06-12T01:00:00Z'))).toBe(true);
  });

  it('개장 직전(08:59)·마감 직후(15:30)는 닫힘 (경계값)', () => {
    expect(isMarketOpen('KR', new Date('2026-06-11T23:59:00Z'))).toBe(false); // KST 08:59
    expect(isMarketOpen('KR', new Date('2026-06-12T00:00:00Z'))).toBe(true); // KST 09:00 정각
    expect(isMarketOpen('KR', new Date('2026-06-12T06:30:00Z'))).toBe(false); // KST 15:30 정각
  });

  it('주말은 닫힘', () => {
    // 2026-06-13(토) KST 10:00
    expect(isMarketOpen('KR', new Date('2026-06-13T01:00:00Z'))).toBe(false);
  });

  it('휴장일은 닫힘 (지방선거일 2026-06-03)', () => {
    expect(isMarketOpen('KR', new Date('2026-06-03T01:00:00Z'))).toBe(false);
    expect(isHoliday('KR', '2026-06-03')).toBe(true);
  });
});

describe('isMarketOpen — 미국 (09:30~16:00 ET)', () => {
  it('평일 장중 개장 (EDT)', () => {
    // 2026-06-12(금) ET 10:00 = UTC 14:00
    expect(isMarketOpen('US', new Date('2026-06-12T14:00:00Z'))).toBe(true);
  });

  it('개장 전·마감 후 닫힘', () => {
    expect(isMarketOpen('US', new Date('2026-06-12T13:29:00Z'))).toBe(false); // ET 09:29
    expect(isMarketOpen('US', new Date('2026-06-12T20:00:00Z'))).toBe(false); // ET 16:00
  });

  it('미국 휴장일 닫힘 (Juneteenth 2026-06-19)', () => {
    expect(isMarketOpen('US', new Date('2026-06-19T14:00:00Z'))).toBe(false);
  });
});

describe('isAnyMarketOpen (D8 뉴스 갱신 주기 판단)', () => {
  it('한국 장중이면 true', () => {
    expect(isAnyMarketOpen(new Date('2026-06-12T01:00:00Z'))).toBe(true);
  });

  it('미국 장중이면 true', () => {
    expect(isAnyMarketOpen(new Date('2026-06-12T14:00:00Z'))).toBe(true);
  });

  it('양쪽 모두 장외면 false (KST 토요일 낮)', () => {
    expect(isAnyMarketOpen(new Date('2026-06-13T03:00:00Z'))).toBe(false);
  });
});
