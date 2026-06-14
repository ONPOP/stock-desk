// Stock Desk 내부 식별자(ticker+market) ↔ Yahoo Finance 심볼 변환.
// Yahoo는 한국 종목에 거래소 접미사(.KS/.KQ)를 붙이고, 미국 종목은 접미사가 없다.
import type { Currency, Market } from '@/types';
import { regionOf } from '@/lib/utils/market-hours';

const KR_SUFFIX: Record<'KOSPI' | 'KOSDAQ', string> = {
  KOSPI: '.KS',
  KOSDAQ: '.KQ',
};

// Yahoo 거래소 코드 → 내부 Market. 우리가 지원하는 5개 시장만 매핑한다.
const EXCHANGE_TO_MARKET: Record<string, Market> = {
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NYQ: 'NYSE',
  ASE: 'AMEX',
  AMX: 'AMEX',
  KSC: 'KOSPI',
  KOE: 'KOSDAQ',
};

export function currencyOf(market: Market): Currency {
  return regionOf(market) === 'KR' ? 'KRW' : 'USD';
}

/** 내부 ticker+market → Yahoo 심볼 (예: 005930+KOSPI → 005930.KS, AAPL+NASDAQ → AAPL) */
export function toYahooSymbol(ticker: string, market: Market): string {
  if (market === 'KOSPI' || market === 'KOSDAQ') {
    return `${ticker}${KR_SUFFIX[market]}`;
  }
  return ticker;
}

/** Yahoo 심볼+거래소코드 → 내부 {ticker, market}. 지원 외 시장이면 null */
export function fromYahooSymbol(symbol: string, exchange?: string): { ticker: string; market: Market } | null {
  // 한국 종목은 접미사로 시장을 확정한다 (거래소 코드보다 신뢰도 높음)
  if (symbol.endsWith('.KS')) return { ticker: symbol.slice(0, -3), market: 'KOSPI' };
  if (symbol.endsWith('.KQ')) return { ticker: symbol.slice(0, -3), market: 'KOSDAQ' };
  // 그 외(미국)는 거래소 코드로 판별
  const market = exchange ? EXCHANGE_TO_MARKET[exchange] : undefined;
  if (!market) return null;
  return { ticker: symbol, market };
}
