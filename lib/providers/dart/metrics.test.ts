import { describe, it, expect, vi, afterEach } from 'vitest';
import { DartClient } from './client';
import { getDartMetrics, parseDartAmount } from './metrics';

function stubFetchSeq(bodies: unknown[]) {
  const fn = vi.fn();
  for (const b of bodies) fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => b });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('parseDartAmount', () => {
  it('콤마 포함 금액을 정수로', () => {
    expect(parseDartAmount('279,600,000,000,000')).toBe(279_600_000_000_000);
  });
  it('음수(순손실) 허용', () => {
    expect(parseDartAmount('-1,200,000')).toBe(-1_200_000);
  });
  it('빈값·하이픈·undefined는 null', () => {
    expect(parseDartAmount('')).toBeNull();
    expect(parseDartAmount('-')).toBeNull();
    expect(parseDartAmount(undefined)).toBeNull();
  });
  it('비수치·소수는 null (정수 계정만)', () => {
    expect(parseDartAmount('abc')).toBeNull();
    expect(parseDartAmount('1.5')).toBeNull();
  });
});

const ACNT = {
  status: '000',
  list: [
    { fs_div: 'CFS', sj_div: 'IS', account_nm: '매출액', thstrm_amount: '279,600,000,000,000', frmtrm_amount: '258,900,000,000,000', bfefrmtrm_amount: '236,800,000,000,000' },
    { fs_div: 'CFS', sj_div: 'IS', account_nm: '영업이익', thstrm_amount: '6,500,000,000,000', frmtrm_amount: '43,300,000,000,000', bfefrmtrm_amount: '51,600,000,000,000' },
    { fs_div: 'CFS', sj_div: 'IS', account_nm: '당기순이익', thstrm_amount: '15,400,000,000,000', frmtrm_amount: '55,600,000,000,000', bfefrmtrm_amount: '39,900,000,000,000' },
    { fs_div: 'CFS', sj_div: 'BS', account_nm: '부채총계', thstrm_amount: '92,000,000,000,000', frmtrm_amount: '93,600,000,000,000', bfefrmtrm_amount: '102,000,000,000,000' },
    { fs_div: 'CFS', sj_div: 'BS', account_nm: '자본총계', thstrm_amount: '363,000,000,000,000', frmtrm_amount: '354,000,000,000,000', bfefrmtrm_amount: '267,000,000,000,000' },
  ],
};

describe('getDartMetrics — 정상', () => {
  it('당기/전기/전전기를 3개 연도 행으로, 연결(CFS) 우선', async () => {
    stubFetchSeq([ACNT]);
    const rows = await getDartMetrics(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows).toHaveLength(3);
    expect(rows[0].fiscalQuarter).toBe('2023');
    expect(rows[0].asOfDate).toBe('2023-12-31');
    expect(rows[0].revenueQ).toBe(279_600_000_000_000);
    expect(rows[1].fiscalQuarter).toBe('2022');
    expect(rows[2].fiscalQuarter).toBe('2021');
    expect(rows[0].source).toBe('dart');
    expect(rows[0].per).toBeNull(); // DART는 밸류에이션 미제공
  });

  it('부채비율 = 부채총계/자본총계 × 100', async () => {
    stubFetchSeq([ACNT]);
    const rows = await getDartMetrics(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows[0].debtRatio).toBeCloseTo(25.34, 1); // 92/363*100
  });
});

describe('getDartMetrics — 비정상', () => {
  it('baseYear·baseYear-1 모두 데이터 없음(013)이면 빈 배열', async () => {
    stubFetchSeq([
      { status: '013', message: '조회된 데이터가 없습니다.' },
      { status: '013', message: '조회된 데이터가 없습니다.' },
    ]);
    const rows = await getDartMetrics(new DartClient('k'), '00000000', { baseYear: 2023 });
    expect(rows).toEqual([]);
  });

  it('list가 비어도 (status 000) 빈 배열', async () => {
    stubFetchSeq([{ status: '000', list: [] }]);
    const rows = await getDartMetrics(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows).toEqual([]);
  });

  it('첫 해 013 후 이전 해 정상이면 그 해 기준으로 파싱', async () => {
    stubFetchSeq([{ status: '013' }, ACNT]);
    const rows = await getDartMetrics(new DartClient('k'), '00126380', { baseYear: 2024 });
    expect(rows[0].fiscalQuarter).toBe('2023'); // baseYear-1=2023이 usedYear
  });
});
