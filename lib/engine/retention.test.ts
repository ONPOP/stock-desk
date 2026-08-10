import { describe, expect, it } from 'vitest';
import { cutoffDate, selectExpiredReports, type PurgeReportRow } from './retention';

describe('cutoffDate', () => {
  it('지정한 일수만큼 앞선 날짜를 준다', () => {
    expect(cutoffDate('2026-08-10', 30)).toBe('2026-07-11');
  });

  it('월 경계를 넘어간다', () => {
    expect(cutoffDate('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('0일이면 오늘이다 (무제한 판단은 호출부의 몫)', () => {
    expect(cutoffDate('2026-08-10', 0)).toBe('2026-08-10');
  });

  it('시간대에 흔들리지 않는다 (KST 자정 직후에도 같은 값)', () => {
    expect(cutoffDate('2026-01-01', 90)).toBe('2025-10-03');
  });
});

function row(patch: Partial<PurgeReportRow> = {}): PurgeReportRow {
  return {
    id: 'r1',
    run_date: '2026-05-01',
    thumb_bucket_path: 'u1/2026-05-01/kr_close_buy',
    slide_paths: ['2026-05-01/kr_close_buy/01.webp'],
    ...patch,
  };
}

describe('selectExpiredReports', () => {
  it('컷오프보다 오래된 리포트만 고른다', () => {
    const rows = [row({ id: 'old', run_date: '2026-05-01' }), row({ id: 'new', run_date: '2026-08-01' })];
    expect(selectExpiredReports(rows, '2026-07-11').map((r) => r.reportId)).toEqual(['old']);
  });

  it('컷오프 당일은 남긴다 (경계는 미만)', () => {
    expect(selectExpiredReports([row({ run_date: '2026-07-11' })], '2026-07-11')).toEqual([]);
  });

  it('프리픽스가 없으면 제외한다 (업로드된 적이 없어 지울 객체가 없다)', () => {
    expect(selectExpiredReports([row({ thumb_bucket_path: null })], '2026-07-11')).toEqual([]);
  });

  it('이미 비워진 리포트는 다시 고르지 않는다 (정리는 멱등이다)', () => {
    expect(selectExpiredReports([row({ slide_paths: [] })], '2026-07-11')).toEqual([]);
    expect(selectExpiredReports([row({ slide_paths: null })], '2026-07-11')).toEqual([]);
  });

  it('삭제에 필요한 값만 담아 돌려준다', () => {
    expect(selectExpiredReports([row({ id: 'r9' })], '2026-07-11')).toEqual([
      { reportId: 'r9', prefix: 'u1/2026-05-01/kr_close_buy', runDate: '2026-05-01' },
    ]);
  });
});
