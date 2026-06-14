// 금액 처리 — 정수(원·센트) 또는 decimal.js, 부동소수점 연산 금지 (PRD 16장)
import Decimal from 'decimal.js';
import type { Currency } from '@/types';
import { ValidationError } from '@/lib/errors';

/** 통화별 최소 단위 자릿수: KRW=0 (원), USD=2 (센트) */
const MINOR_DIGITS: Record<Currency, number> = { KRW: 0, USD: 2 };

/**
 * 외부 API가 주는 가격 문자열을 최소 통화 단위 정수로 변환.
 * 예: KRW "71200" → 71200, USD "189.43" → 18943
 */
export function parseToMinorUnits(raw: string | number, currency: Currency): number {
  const s = String(raw).trim();
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) {
    throw new ValidationError('금액 형식이 올바르지 않습니다.', `parseToMinorUnits: invalid input "${raw}"`);
  }
  const d = new Decimal(s).mul(new Decimal(10).pow(MINOR_DIGITS[currency]));
  if (!d.isInteger()) {
    // 최소 단위 미만 소수점은 반올림 (KIS 해외 시세는 소수 4자리까지 제공될 수 있음)
    return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  }
  if (d.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError('금액이 처리 가능한 범위를 초과했습니다.', `parseToMinorUnits: overflow "${raw}"`);
  }
  return d.toNumber();
}

/** 최소 단위 정수 → 표시 문자열. 예: (18943, USD) → "189.43" */
export function formatFromMinorUnits(minor: number, currency: Currency): string {
  if (!Number.isSafeInteger(minor)) {
    throw new ValidationError('금액 값이 올바르지 않습니다.', `formatFromMinorUnits: not a safe integer ${minor}`);
  }
  const d = new Decimal(minor).div(new Decimal(10).pow(MINOR_DIGITS[currency]));
  return d.toFixed(MINOR_DIGITS[currency]);
}

/** 표시용 로케일 포맷. 예: (71200, KRW) → "₩71,200", (18943, USD) → "$189.43" */
export function formatMoney(minor: number, currency: Currency): string {
  const value = formatFromMinorUnits(minor, currency);
  const [int, frac] = value.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const abs = sign ? int.slice(1) : int;
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = currency === 'KRW' ? '₩' : '$';
  return `${sign}${symbol}${grouped}${frac ? `.${frac}` : ''}`;
}

/** 차트 등 그래픽 표시용 숫자 변환. 예: (18943, USD) → 189.43, (71200, KRW) → 71200 */
export function minorToMajorNumber(minor: number, currency: Currency): number {
  return new Decimal(minor).div(new Decimal(10).pow(MINOR_DIGITS[currency])).toNumber();
}

/**
 * 큰 금액 축약 표시 (F4 시가총액·매출 등). 예: (470000000000000, KRW) → "₩470.0조",
 * (300000000000000, USD) → "$3.00T". 단위 미만은 formatMoney로 위임.
 */
export function formatCompactMoney(minor: number, currency: Currency): string {
  const major = minorToMajorNumber(minor, currency);
  const sign = major < 0 ? '-' : '';
  const abs = Math.abs(major);
  if (currency === 'KRW') {
    if (abs >= 1e12) return `${sign}₩${(abs / 1e12).toFixed(1)}조`;
    if (abs >= 1e8) return `${sign}₩${(abs / 1e8).toFixed(1)}억`;
    return formatMoney(minor, currency);
  }
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return formatMoney(minor, currency);
}

/**
 * 목표 수익률(%) → 목표가 계산 (F8 손익 계산기 기반 로직).
 * percent는 문자열로 받아 부동소수점 오염 방지. 예: ("10", 71200) → 78320
 */
export function targetPriceForReturn(percent: string, currentMinor: number): number {
  if (!/^-?\d+(\.\d+)?$/.test(percent.trim())) {
    throw new ValidationError('수익률 형식이 올바르지 않습니다.');
  }
  return new Decimal(currentMinor)
    .mul(new Decimal(1).plus(new Decimal(percent.trim()).div(100)))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** 가중평균 평단가 (모의투자 분할 매수, PRD 13장) — 최소 단위 정수 기준 반올림 */
export function weightedAvgPrice(
  lots: Array<{ qty: number; priceMinor: number }>,
): number {
  const totalQty = lots.reduce((acc, l) => acc + l.qty, 0);
  if (totalQty <= 0) {
    throw new ValidationError('수량은 0보다 커야 합니다.');
  }
  const totalCost = lots.reduce(
    (acc, l) => acc.plus(new Decimal(l.priceMinor).mul(l.qty)),
    new Decimal(0),
  );
  return totalCost.div(totalQty).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
