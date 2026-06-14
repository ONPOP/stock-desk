import { describe, expect, it } from 'vitest';
import {
  formatCompactMoney,
  formatFromMinorUnits,
  formatMoney,
  parseToMinorUnits,
  targetPriceForReturn,
  weightedAvgPrice,
} from '@/lib/utils/money';

describe('formatCompactMoney — 큰 금액 축약 (F4)', () => {
  it('KRW: 조·억 단위', () => {
    expect(formatCompactMoney(470_000_000_000_000, 'KRW')).toBe('₩470.0조');
    expect(formatCompactMoney(530_000_000_000, 'KRW')).toBe('₩5300.0억');
    expect(formatCompactMoney(50_000, 'KRW')).toBe('₩50,000'); // 억 미만은 일반 포맷
  });
  it('USD: 센트 기준 B·M 단위', () => {
    expect(formatCompactMoney(300_000_000_000_000, 'USD')).toBe('$3000.00B'); // 3조달러 = 3000B
    expect(formatCompactMoney(9_493_000_000_000, 'USD')).toBe('$94.93B'); // 949.3억달러
    expect(formatCompactMoney(150_000, 'USD')).toBe('$1,500.00'); // 1500달러는 일반 포맷
  });
  it('음수 부호 유지', () => {
    expect(formatCompactMoney(-9_493_000_000_000, 'USD')).toBe('-$94.93B');
  });
});

describe('parseToMinorUnits — 정상 케이스', () => {
  it('KRW는 원 단위 정수로 변환한다', () => {
    expect(parseToMinorUnits('71200', 'KRW')).toBe(71200);
  });

  it('USD는 센트 정수로 변환한다', () => {
    expect(parseToMinorUnits('189.43', 'USD')).toBe(18943);
  });

  it('부동소수점 오차 없이 변환한다 (0.1 + 0.2 류 함정)', () => {
    expect(parseToMinorUnits('0.29', 'USD')).toBe(29);
    expect(parseToMinorUnits('19.99', 'USD')).toBe(1999);
  });

  it('음수(전일 대비 하락)를 처리한다', () => {
    expect(parseToMinorUnits('-1.25', 'USD')).toBe(-125);
    expect(parseToMinorUnits('-500', 'KRW')).toBe(-500);
  });

  it('KIS 해외 시세의 소수 4자리를 반올림한다', () => {
    expect(parseToMinorUnits('189.4350', 'USD')).toBe(18944);
  });

  it('숫자 타입 입력도 허용한다', () => {
    expect(parseToMinorUnits(71200, 'KRW')).toBe(71200);
  });
});

describe('parseToMinorUnits — 비정상 케이스', () => {
  it.each(['', '   ', 'abc', '1,234', '1.2.3', 'NaN', 'Infinity', '0x10', '1e5'])(
    '잘못된 형식을 거부한다: "%s"',
    (bad) => {
      expect(() => parseToMinorUnits(bad, 'KRW')).toThrow();
    },
  );

  it('안전 정수 범위 초과를 거부한다', () => {
    expect(() => parseToMinorUnits('99999999999999999999', 'USD')).toThrow(/범위/);
  });
});

describe('formatFromMinorUnits / formatMoney', () => {
  it('센트 → 달러 문자열', () => {
    expect(formatFromMinorUnits(18943, 'USD')).toBe('189.43');
  });

  it('원 → 원 문자열 (소수점 없음)', () => {
    expect(formatFromMinorUnits(71200, 'KRW')).toBe('71200');
  });

  it('통화 기호·천 단위 구분', () => {
    expect(formatMoney(71200, 'KRW')).toBe('₩71,200');
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(-12500, 'KRW')).toBe('-₩12,500');
  });

  it('정수가 아닌 입력을 거부한다', () => {
    expect(() => formatFromMinorUnits(1.5, 'KRW')).toThrow();
    expect(() => formatFromMinorUnits(NaN, 'USD')).toThrow();
  });
});

describe('targetPriceForReturn (F8 기반 로직)', () => {
  it('+10% 목표가', () => {
    expect(targetPriceForReturn('10', 71200)).toBe(78320);
  });

  it('-5.5% 손절가', () => {
    expect(targetPriceForReturn('-5.5', 100000)).toBe(94500);
  });

  it('퍼센트 형식 오류를 거부한다', () => {
    expect(() => targetPriceForReturn('10%', 71200)).toThrow();
    expect(() => targetPriceForReturn('', 71200)).toThrow();
  });
});

describe('weightedAvgPrice (분할 매수 평단가 — PRD 13장)', () => {
  it('가중평균을 계산한다', () => {
    expect(
      weightedAvgPrice([
        { qty: 10, priceMinor: 70000 },
        { qty: 5, priceMinor: 73000 },
      ]),
    ).toBe(71000);
  });

  it('수량 0 이하를 거부한다', () => {
    expect(() => weightedAvgPrice([])).toThrow();
    expect(() => weightedAvgPrice([{ qty: 0, priceMinor: 100 }])).toThrow();
  });
});
