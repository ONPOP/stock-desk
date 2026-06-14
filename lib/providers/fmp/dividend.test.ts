import { describe, it, expect } from 'vitest';
import { buildFmpDividends, inferFrequency } from './dividend';

describe('inferFrequency', () => {
  it('최근 1년 건수로 주기 추정', () => {
    expect(inferFrequency(['2024-11-08', '2024-08-12', '2024-05-10', '2024-02-09'])).toBe('quarterly');
    expect(inferFrequency(['2024-12-01', '2024-06-01'])).toBe('semiannual');
    expect(inferFrequency(['2024-12-01'])).toBe('annual');
    expect(
      inferFrequency(['2024-12', '2024-11', '2024-10', '2024-09', '2024-08', '2024-07', '2024-06', '2024-05', '2024-04', '2024-03', '2024-02', '2024-01'].map((d) => `${d}-01`)),
    ).toBe('monthly');
  });
  it('빈 배열은 null', () => {
    expect(inferFrequency([])).toBeNull();
  });
});

describe('buildFmpDividends (stable API)', () => {
  it('이벤트를 최신순 DividendInfo로, frequency·yield 반영', () => {
    const rows = buildFmpDividends([
      { date: '2026-05-11', dividend: 0.26, paymentDate: '2026-05-14', yield: 0.41, frequency: 'Quarterly' },
      { date: '2026-02-10', dividend: 0.25, paymentDate: '2026-02-13', yield: 0.4, frequency: 'Quarterly' },
      { date: '2025-11-08', dividend: 0.25, paymentDate: '2025-11-14', yield: 0.42, frequency: 'Quarterly' },
    ]);
    expect(rows[0].exDate).toBe('2026-05-11');
    expect(rows[0].dps).toBe(0.26);
    expect(rows[0].payDate).toBe('2026-05-14');
    expect(rows[0].yieldAtRecord).toBe(0.41);
    expect(rows[0].frequency).toBe('quarterly'); // "Quarterly" 매핑
    expect(rows[0].source).toBe('fmp');
    expect(rows[0].fiscalYear).toBe(2026);
  });

  it('frequency가 "Semi-Annual"이면 semiannual로 매핑', () => {
    const rows = buildFmpDividends([{ date: '2026-05-11', dividend: 1.0, frequency: 'Semi-Annual' }]);
    expect(rows[0].frequency).toBe('semiannual');
  });

  it('frequency 누락 시 건수 기반 추정으로 폴백', () => {
    const rows = buildFmpDividends([
      { date: '2026-05-11', dividend: 0.25 },
      { date: '2026-02-10', dividend: 0.25 },
      { date: '2025-11-08', dividend: 0.25 },
      { date: '2025-08-08', dividend: 0.25 },
    ]);
    expect(rows[0].frequency).toBe('quarterly');
  });

  it('무배당(빈 배열)은 빈 결과', () => {
    expect(buildFmpDividends([])).toEqual([]);
  });

  it('잘못된 날짜·배당값 누락 이벤트는 제외', () => {
    const rows = buildFmpDividends([
      { date: 'invalid', dividend: 0.25 },
      { date: '2024-05-10' }, // dividend 없음
      { date: '2024-05-10', dividend: 0.25 },
    ]);
    expect(rows).toHaveLength(1);
  });
});
