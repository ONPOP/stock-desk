import { describe, it, expect, vi, afterEach } from 'vitest';
import { DartClient } from './client';
import { getDartDisclosures, classifyDartReport, dartDateToIso } from './disclosure';

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
}
afterEach(() => vi.unstubAllGlobals());

describe('classifyDartReport', () => {
  it('보고서명을 한국어 유형으로 분류', () => {
    expect(classifyDartReport('분기보고서 (2024.09)')).toBe('정기보고서');
    expect(classifyDartReport('매출액또는손익구조30%(대규모법인은15%)이상변동')).toBe('잠정실적');
    expect(classifyDartReport('유상증자결정')).toBe('유상증자');
    expect(classifyDartReport('전환사채권발행결정')).toBe('사채발행');
    expect(classifyDartReport('주요사항보고서(자기주식취득결정)')).toBe('자기주식');
    expect(classifyDartReport('주식등의대량보유상황보고서')).toBe('지분변동');
  });
  it('미분류 보고서는 null', () => {
    expect(classifyDartReport('기타경영사항(자율공시)')).toBeNull();
  });
});

describe('dartDateToIso', () => {
  it('YYYYMMDD(KST 자정) → UTC ISO', () => {
    expect(dartDateToIso('20240315')).toBe('2024-03-14T15:00:00.000Z');
  });
  it('잘못된 형식은 throw', () => {
    expect(() => dartDateToIso('2024-03-15')).toThrow();
  });
});

describe('getDartDisclosures', () => {
  it('정상 목록을 DisclosureItem으로 매핑하고 원문 URL 생성', async () => {
    stubFetch({
      status: '000',
      list: [
        { corp_code: '00126380', corp_name: '삼성전자', stock_code: '005930', report_nm: '분기보고서 (2024.09)', rcept_no: '20241114000123', flr_nm: '삼성전자', rcept_dt: '20241114' },
      ],
    });
    const rows = await getDartDisclosures(new DartClient('k'), '00126380');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'dart',
      typeLabelKr: '정기보고서',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20241114000123',
      summaryAi: null,
    });
    expect(rows[0].filedAt).toBe('2024-11-13T15:00:00.000Z');
  });

  it('데이터 없음(013)이면 빈 배열', async () => {
    stubFetch({ status: '013' });
    const rows = await getDartDisclosures(new DartClient('k'), '00000000');
    expect(rows).toEqual([]);
  });
});
