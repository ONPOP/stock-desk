// 매매 수수료·세금 계산 (V2 · D11) — 예수금 차감/가산에 반영. 통화 최소 단위 정수로 반올림.
// 율 출처(사용자 제공):
//   국내 매수 0.018%(수수료+유관기관) / 매도 일반 0.218%(위탁 0.018% + 증권거래세 0.20%)
//   국내 ETF 매도 0.018%(거래세 면제) / 미국 매수 0.25% / 매도 0.25206%(위탁 0.25% + SEC 0.00206%)
import Decimal from 'decimal.js';
import type { Market, TradeSide } from '@/types';

function isKr(market: Market): boolean {
  return market === 'KOSPI' || market === 'KOSDAQ';
}

/** 매매 1건의 수수료율(소수). market·side·ETF여부로 결정. */
export function feeRate(market: Market, side: TradeSide, isEtf: boolean): Decimal {
  if (isKr(market)) {
    if (side === 'buy') return new Decimal('0.00018');
    return isEtf ? new Decimal('0.00018') : new Decimal('0.00218');
  }
  // 미국 (NYSE·NASDAQ·AMEX) — 증권거래세 0%
  if (side === 'buy') return new Decimal('0.0025');
  return new Decimal('0.0025206');
}

/**
 * 매매 1건의 수수료(최소 단위 정수, 반올림).
 * amountMinor = price * qty (최소 단위: KRW=원, USD=센트).
 */
export function computeFee(amountMinor: number, market: Market, side: TradeSide, isEtf: boolean): number {
  return new Decimal(amountMinor)
    .mul(feeRate(market, side, isEtf))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
