// Provider 어댑터 인터페이스 — 소스 교체 시 어댑터만 수정 (PRD 16장)
import type {
  Candle,
  CandleInterval,
  DisclosureItem,
  DividendInfo,
  Market,
  NewsItemRaw,
  Quote,
  StockMetrics,
  StockSearchResult,
} from '@/types';

export interface QuoteProvider {
  getQuote(ticker: string, market: Market): Promise<Quote>;
  getCandles(
    ticker: string,
    market: Market,
    interval: CandleInterval,
    /** 조회 범위 (개수 기준, 최신부터) */
    count: number,
  ): Promise<Candle[]>;
  searchStocks(query: string): Promise<StockSearchResult[]>;
}

/**
 * 펀더멘털 지표(F4) 어댑터 — DART(한국)·Finnhub(미국).
 * 최신 스냅샷 1건 + 분기 시계열 N건을 반환. 데이터 없으면 빈 배열.
 */
export interface MetricsProvider {
  /** 최신 + 최근 분기들 (최신순). 첫 요소가 현재 스냅샷. */
  getMetrics(ticker: string): Promise<StockMetrics[]>;
}

/** 배당(F15) 어댑터 — DART(한국)·FMP(미국). 무배당이면 빈 배열. */
export interface DividendProvider {
  getDividends(ticker: string): Promise<DividendInfo[]>;
}

/** 공시(F12) 어댑터 — DART(한국)·EDGAR(미국). */
export interface DisclosureProvider {
  getDisclosures(ticker: string, since?: string): Promise<DisclosureItem[]>;
}

/** 뉴스(F5) 어댑터 — 네이버(한국)·Finnhub(미국). 원시 뉴스 반환(요약·감성은 AI 레이어). */
export interface NewsProvider {
  getNews(ticker: string, market: Market, since?: string): Promise<NewsItemRaw[]>;
}

// V1+에서 구현 — 시그니처만 선점 (Finnhub 실적캘린더 등)
export interface CalendarProvider {
  getEvents(from: string, to: string): Promise<Array<Record<string, unknown>>>;
}
