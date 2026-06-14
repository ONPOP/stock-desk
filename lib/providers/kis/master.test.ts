import { describe, expect, it } from 'vitest';
import { parseDomesticMaster, parseOverseasMaster } from '@/lib/providers/kis/master';

// EUC-KR 인코딩 헬퍼 — 테스트 데이터 생성용 (간단히 ASCII만 사용해 인코딩 의존 제거)
function asciiLine(shortCode: string, stdCode: string, name: string, tailLen = 228): Uint8Array {
  const head = shortCode.padEnd(9) + stdCode.padEnd(12) + name;
  const tail = '0'.repeat(tailLen);
  return new TextEncoder().encode(head + tail);
}

function joinLines(lines: Uint8Array[]): Uint8Array {
  const lf = new Uint8Array([10]);
  const parts: Uint8Array[] = [];
  lines.forEach((l, i) => {
    parts.push(l);
    if (i < lines.length - 1) parts.push(lf);
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe('parseDomesticMaster', () => {
  it('정상 행을 파싱한다', () => {
    const buf = joinLines([
      asciiLine('005930', 'KR7005930003', 'SamsungElec'),
      asciiLine('000660', 'KR7000660001', 'SKHynix'),
    ]);
    const rows = parseDomesticMaster(buf, 'KOSPI');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ticker: '005930', market: 'KOSPI', currency: 'KRW' });
    expect(rows[0].name_kr).toBe('SamsungElec');
  });

  it('6자리 숫자가 아닌 코드(ETN·ELW 등)는 제외한다', () => {
    const buf = joinLines([
      asciiLine('Q500001', 'KRQ50000123', 'SomeETN'),
      asciiLine('005930', 'KR7005930003', 'SamsungElec'),
    ]);
    const rows = parseDomesticMaster(buf, 'KOSPI');
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('005930');
  });

  it('비어 있거나 깨진 데이터는 오류를 던진다', () => {
    expect(() => parseDomesticMaster(new Uint8Array(0), 'KOSPI')).toThrow();
    expect(() => parseDomesticMaster(new TextEncoder().encode('short'), 'KOSPI')).toThrow();
  });
});

describe('parseOverseasMaster', () => {
  function codLine(symbol: string, nameKr: string, nameEn: string, secType: string): string {
    // 컬럼: [0]국가 [1]거래소ID [2]거래소코드 [3]거래소명 [4]심볼 [5]실시간심볼 [6]한글명 [7]영문명 [8]유형 [9]통화
    return ['US', '512', 'NAS', 'NASDAQ', symbol, `R${symbol}`, nameKr, nameEn, secType, 'USD'].join('\t');
  }

  it('주식(2)·ETP(3)만 파싱한다', () => {
    const text = [
      codLine('AAPL', 'Apple', 'APPLE INC', '2'),
      codLine('QQQ', 'QQQ ETF', 'INVESCO QQQ', '3'),
      codLine('NDX', 'Nasdaq100', 'NASDAQ 100 INDEX', '1'), // 지수 제외
    ].join('\n');
    const rows = parseOverseasMaster(new TextEncoder().encode(text), 'NASDAQ');
    expect(rows.map((r) => r.ticker)).toEqual(['AAPL', 'QQQ']);
    expect(rows[0]).toMatchObject({ market: 'NASDAQ', currency: 'USD', name_en: 'APPLE INC' });
  });

  it('형식이 깨진 행(컬럼 부족·심볼 오염)은 건너뛴다', () => {
    const text = [
      'garbage line without tabs',
      codLine('AAPL', 'Apple', 'APPLE INC', '2'),
      codLine('aapl$', 'bad', 'BAD SYMBOL', '2'), // 소문자·특수문자 심볼 거부
    ].join('\n');
    const rows = parseOverseasMaster(new TextEncoder().encode(text), 'NASDAQ');
    expect(rows).toHaveLength(1);
  });

  it('전부 무효면 오류를 던진다', () => {
    expect(() => parseOverseasMaster(new TextEncoder().encode('junk\njunk2'), 'NYSE')).toThrow();
  });
});
