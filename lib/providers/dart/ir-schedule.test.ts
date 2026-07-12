import { describe, it, expect } from 'vitest';
import { parseIrDocument, isIrOpenReport } from '@/lib/providers/dart/ir-schedule';

// 실제 DART 원문에서 태그를 살린 최소 샘플
const SAMSUNG = `<TABLE><TR><TD>1. 일시 및 장소</TD></TR><TR><TD>일시</TD><TD>2026-04-30 10:00</TD></TR>
<TR><TD>장소</TD><TD>-</TD></TR><TR><TD>2. 참가 대상자</TD><TD>투자자</TD></TR>
<TR><TD>3. 개최목적</TD><TD>2026년 1분기 경영실적 발표</TD></TR><TR><TD>4. 개최방법</TD><TD>Conference Call</TD></TR></TABLE>`;

const HYUNDAI = `<P>1. 일시 및 장소 일시 2026-06-23 10:00 장소 서울 콘래드호텔
2. 참가 대상자 국내외 기관 투자자 3. 개최목적 컨퍼런스 참가를 통한 투자자 당사 이해도 제고 4. 개최방법 투자자 면담</P>`;

describe('parseIrDocument', () => {
  it('삼성 IR: 예정일·실적 목적 추출', () => {
    const r = parseIrDocument(SAMSUNG);
    expect(r.date).toBe('2026-04-30');
    expect(r.purpose).toContain('경영실적');
    expect(/실적/.test(r.purpose)).toBe(true);
  });

  it('현대차 IR: 예정일 추출, 목적은 실적 아님', () => {
    const r = parseIrDocument(HYUNDAI);
    expect(r.date).toBe('2026-06-23');
    expect(/실적/.test(r.purpose)).toBe(false);
  });

  it('일시 없으면 date=null', () => {
    expect(parseIrDocument('<P>내용 없음</P>').date).toBeNull();
  });
});

describe('isIrOpenReport', () => {
  it('IR 개최 공시 판별', () => {
    expect(isIrOpenReport('기업설명회(IR)개최(안내공시)')).toBe(true);
    expect(isIrOpenReport('분기보고서')).toBe(false);
  });
});
