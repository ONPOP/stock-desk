import { describe, expect, it } from 'vitest';
import { thirdFriday, upcomingLeapsExpiries } from '@/lib/utils/options-expiry';

describe('thirdFriday — 셋째 금요일 계산', () => {
  it('2026-01 셋째 금요일은 01-16', () => {
    expect(thirdFriday(2026, 0)).toBe('2026-01-16');
  });
  it('2025-01 셋째 금요일은 01-17', () => {
    expect(thirdFriday(2025, 0)).toBe('2025-01-17');
  });
  it('월이 금요일로 시작하면 그 주가 첫째 주 (2027-01-15)', () => {
    // 2027-01-01은 금요일 → 첫 금요일=1일, 셋째=15일
    expect(thirdFriday(2027, 0)).toBe('2027-01-15');
  });
});

describe('upcomingLeapsExpiries — 기준일 이후 LEAPS', () => {
  it('연초 이전이면 당해 1월부터 포함', () => {
    expect(upcomingLeapsExpiries('2026-01-01', 2)).toEqual(['2026-01-16', '2027-01-15']);
  });
  it('당해 1월 만기 지난 뒤면 다음 해부터', () => {
    expect(upcomingLeapsExpiries('2026-02-01', 2)).toEqual(['2027-01-15', '2028-01-21']);
  });
});
