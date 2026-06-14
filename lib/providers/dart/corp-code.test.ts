import { describe, it, expect } from 'vitest';
import { parseCorpCodeXml } from './corp-code';

describe('parseCorpCodeXml', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<result>
  <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code><modify_date>20240101</modify_date></list>
  <list><corp_code>00434003</corp_code><corp_name>비상장사</corp_name><stock_code> </stock_code><modify_date>20240101</modify_date></list>
  <list><corp_code>00164779</corp_code><corp_name>SK하이닉스</corp_name><stock_code>000660</stock_code><modify_date>20240101</modify_date></list>
</result>`;

  it('상장사(stock_code 6자리)만 추출', () => {
    const entries = parseCorpCodeXml(xml);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ corpCode: '00126380', stockCode: '005930', corpName: '삼성전자' });
    expect(entries[1].stockCode).toBe('000660');
  });

  it('비상장사(빈 stock_code)는 제외', () => {
    const entries = parseCorpCodeXml(xml);
    expect(entries.find((e) => e.corpCode === '00434003')).toBeUndefined();
  });

  it('빈 XML은 빈 배열', () => {
    expect(parseCorpCodeXml('<result></result>')).toEqual([]);
  });
});
