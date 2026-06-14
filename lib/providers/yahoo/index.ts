// Yahoo Finance 어댑터 — KIS 발급 지연 동안 쓰는 임시 폴백 시세 소스 (D3 정식 변경 아님).
// QuoteProvider 인터페이스를 그대로 구현하므로 호출부는 KIS 어댑터와 동일하게 사용한다.
import type { Candle, CandleInterval, Market, Quote, StockSearchResult } from '@/types';
import type { QuoteProvider } from '@/lib/providers/types';
import { getCandles, getQuote } from './quote';
import { searchStocks } from './search';

export class YahooQuoteProvider implements QuoteProvider {
  getQuote(ticker: string, market: Market): Promise<Quote> {
    return getQuote(ticker, market);
  }

  getCandles(ticker: string, market: Market, interval: CandleInterval, count: number): Promise<Candle[]> {
    return getCandles(ticker, market, interval, count);
  }

  searchStocks(query: string): Promise<StockSearchResult[]> {
    return searchStocks(query);
  }
}

export const yahooProvider = new YahooQuoteProvider();
