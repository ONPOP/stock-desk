import { describe, it, expect } from 'vitest';
import { buildEdgarDisclosures, labelForForm } from './disclosure';

const SUBMISSIONS = {
  cik: 320193,
  filings: {
    recent: {
      accessionNumber: ['0000320193-24-000123', '0000320193-24-000100', '0000320193-24-000050'],
      form: ['10-Q', '8-K', 'PX14A6G'], // 마지막은 주요 양식 아님
      filingDate: ['2024-11-01', '2024-08-02', '2024-01-15'],
      primaryDocument: ['aapl-20240928.htm', 'aapl-8k.htm', 'misc.htm'],
      primaryDocDescription: ['Form 10-Q', 'Form 8-K', ''],
    },
  },
};

describe('labelForForm', () => {
  it('주요 양식 한국어 라벨', () => {
    expect(labelForForm('10-Q')).toBe('분기보고서');
    expect(labelForForm('8-K')).toBe('수시공시');
    expect(labelForForm('4')).toBe('내부자거래');
    expect(labelForForm('ZZZ')).toBeNull();
  });
});

describe('buildEdgarDisclosures', () => {
  it('주요 양식만 필터, 최신순, 원문 URL 생성', () => {
    const rows = buildEdgarDisclosures(SUBMISSIONS, 320193);
    expect(rows).toHaveLength(2); // PX14A6G 제외
    expect(rows[0].formType).toBe('10-Q');
    expect(rows[0].typeLabelKr).toBe('분기보고서');
    expect(rows[0].url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm');
    expect(rows[0].filedAt).toBe('2024-11-01T00:00:00.000Z');
    expect(rows[0].source).toBe('edgar');
  });

  it('since 이전 공시는 제외', () => {
    const rows = buildEdgarDisclosures(SUBMISSIONS, 320193, { since: '2024-06-01' });
    expect(rows.map((r) => r.formType)).toEqual(['10-Q', '8-K']); // 2024-01-15 제외
  });

  it('limit 적용', () => {
    const rows = buildEdgarDisclosures(SUBMISSIONS, 320193, { limit: 1 });
    expect(rows).toHaveLength(1);
  });

  it('filings.recent 없으면 빈 배열', () => {
    expect(buildEdgarDisclosures({ cik: 1 }, 1)).toEqual([]);
  });

  it('primaryDocument 없으면 browse-edgar fallback URL', () => {
    const rows = buildEdgarDisclosures(
      {
        filings: {
          recent: {
            accessionNumber: ['0000320193-24-000123'],
            form: ['8-K'],
            filingDate: ['2024-11-01'],
            primaryDocument: [''],
            primaryDocDescription: [''],
          },
        },
      },
      320193,
    );
    expect(rows[0].url).toContain('browse-edgar');
  });
});
