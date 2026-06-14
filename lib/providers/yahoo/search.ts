// Yahoo Finance 종목 검색. 정식 검색은 stocks 테이블(sync:master) 기반이고, 이것은 폴백/보강용이다.
import type { StockSearchResult } from '@/types';
import { fetchYahooJson } from './client';
import { currencyOf, fromYahooSymbol } from './symbol';

const SEARCH_PATH = '/v1/finance/search';

interface SearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
}

interface SearchResponse {
  quotes?: SearchQuote[];
}

const HANGUL = /[ㄱ-힝]/;

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const path = `${SEARCH_PATH}?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0`;
  const data = await fetchYahooJson<SearchResponse>(path);

  const results: StockSearchResult[] = [];
  for (const item of data.quotes ?? []) {
    if (item.quoteType !== 'EQUITY' || !item.symbol) continue;
    const mapped = fromYahooSymbol(item.symbol, item.exchange);
    if (!mapped) continue; // 지원하지 않는 시장은 제외

    const name = item.longname ?? item.shortname ?? null;
    const isKorean = name != null && HANGUL.test(name);
    results.push({
      ticker: mapped.ticker,
      market: mapped.market,
      currency: currencyOf(mapped.market),
      name_kr: isKorean ? name : null,
      name_en: isKorean ? null : name,
    });
  }
  return results;
}
