import { describe, expect, it } from 'vitest';
import { dateInTz, EST_TZ, formatEst, formatKst, kisLocalToUtc, KST_TZ, minutesAndWeekdayInTz } from '@/lib/utils/date';

describe('타임존 표시 변환 (UTC 저장 → KST/EST 표시)', () => {
  it('UTC → KST (+9)', () => {
    expect(formatKst('2026-06-12T00:00:00Z')).toBe('2026-06-12 09:00');
  });

  it('UTC → EST/EDT (서머타임 자동 반영)', () => {
    expect(formatEst('2026-06-12T13:30:00Z')).toBe('2026-06-12 09:30'); // EDT(-4)
    expect(formatEst('2026-01-12T14:30:00Z')).toBe('2026-01-12 09:30'); // EST(-5)
  });

  it('자정 경계에서 날짜가 올바르게 넘어간다', () => {
    expect(dateInTz('2026-06-12T15:30:00Z', KST_TZ)).toBe('2026-06-13');
    expect(dateInTz('2026-06-12T03:30:00Z', EST_TZ)).toBe('2026-06-11');
  });

  it('잘못된 날짜 입력을 거부한다', () => {
    expect(() => formatKst('not-a-date')).toThrow();
  });
});

describe('kisLocalToUtc (KIS 현지 일시 → UTC)', () => {
  it('KST 15:30 → UTC 06:30', () => {
    expect(kisLocalToUtc('20260612', '153000', KST_TZ)).toBe('2026-06-12T06:30:00.000Z');
  });

  it('미국 동부 서머타임 기간(EDT, -4)을 반영한다', () => {
    expect(kisLocalToUtc('20260612', '093000', EST_TZ)).toBe('2026-06-12T13:30:00.000Z');
  });

  it('미국 동부 표준시 기간(EST, -5)을 반영한다', () => {
    expect(kisLocalToUtc('20260112', '093000', EST_TZ)).toBe('2026-01-12T14:30:00.000Z');
  });

  it.each([
    ['2026612', '153000'],
    ['20260612', '1530'],
    ['', ''],
    ['yyyymmdd', 'hhmmss'],
  ])('형식 위반을 거부한다: %s %s', (d, t) => {
    expect(() => kisLocalToUtc(d, t, KST_TZ)).toThrow();
  });
});

describe('minutesAndWeekdayInTz', () => {
  it('요일·분을 타임존 기준으로 계산한다', () => {
    // 2026-06-12(금) 00:30 UTC = KST 금요일 09:30
    const r = minutesAndWeekdayInTz('2026-06-12T00:30:00Z', KST_TZ);
    expect(r.weekday).toBe('Fri');
    expect(r.minutes).toBe(9 * 60 + 30);
  });
});
