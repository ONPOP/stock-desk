import { describe, it, expect, vi, afterEach } from 'vitest';
import { DartClient } from './client';
import { getDartDividends, _parseDecimal } from './dividend';

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
}
afterEach(() => vi.unstubAllGlobals());

describe('_parseDecimal', () => {
  it('콤마·소수 처리, 빈값/하이픈은 null', () => {
    expect(_parseDecimal('1,361')).toBe(1361);
    expect(_parseDecimal('2.45')).toBe(2.45);
    expect(_parseDecimal('-')).toBeNull();
    expect(_parseDecimal('')).toBeNull();
    expect(_parseDecimal('N/A')).toBeNull();
  });
});

const ALOT = {
  status: '000',
  list: [
    { se: '주당 현금배당금(원)', stock_knd: '보통주', thstrm: '1,444', frmtrm: '1,444', lwfr: '1,416' },
    { se: '현금배당수익률(%)', stock_knd: '보통주', thstrm: '2.1', frmtrm: '1.8', lwfr: '2.0' },
    { se: '주당 현금배당금(원)', stock_knd: '우선주', thstrm: '1,445', frmtrm: '1,445', lwfr: '1,417' },
  ],
};

describe('getDartDividends — 정상', () => {
  it('보통주 기준 3개 연도 DPS·수익률', async () => {
    stubFetch(ALOT);
    const rows = await getDartDividends(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ fiscalYear: 2023, dps: 1444, yieldAtRecord: 2.1, frequency: 'annual', source: 'dart' });
    expect(rows[2].fiscalYear).toBe(2021);
    expect(rows[0].exDate).toBeNull(); // alotMatter는 배당락일 미제공
  });

  it('우선주 행은 제외(보통주 단일 시계열)', async () => {
    stubFetch(ALOT);
    const rows = await getDartDividends(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows[0].dps).toBe(1444); // 우선주 1445가 아님
  });
});

describe('getDartDividends — 비정상', () => {
  it('데이터 없음(013)이면 빈 배열', async () => {
    stubFetch({ status: '013' });
    const rows = await getDartDividends(new DartClient('k'), '00000000', { baseYear: 2023 });
    expect(rows).toEqual([]);
  });

  it('배당 항목이 없으면(무배당) 빈 배열', async () => {
    stubFetch({ status: '000', list: [{ se: '기타', thstrm: '0' }] });
    const rows = await getDartDividends(new DartClient('k'), '00126380', { baseYear: 2023 });
    expect(rows).toEqual([]);
  });
});
