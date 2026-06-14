// 시세 인메모리 캐시 — 폴링 부하 완화 + 일시 장애(Yahoo 429 등) 시 마지막 성공값(stale) 반환.
// 임시 폴백(Yahoo)의 IP 레이트리밋을 견디기 위함. KIS 전환 시에도 중복 호출을 줄여 무해하다.
import 'server-only';
import type { Market, Quote } from '@/types';
import type { QuoteSource } from '@/lib/providers/quote-source';

const TTL_MS = 6_000;
const STALE_MAX_MS = 5 * 60_000; // 5분 넘은 값은 stale로도 쓰지 않음

interface Entry {
  quote: Quote;
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Quote>>();

export async function getCachedQuote(source: QuoteSource, ticker: string, market: Market): Promise<Quote> {
  const key = `${source.name}:${ticker}:${market}`;
  const hit = cache.get(key);
  const now = Date.now();

  if (hit && now - hit.at < TTL_MS) return hit.quote;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = source
    .getQuote(ticker, market)
    .then((quote) => {
      cache.set(key, { quote, at: Date.now() });
      return quote;
    })
    .catch((e) => {
      // 일시 장애 시 너무 오래되지 않은 마지막 성공값으로 버틴다
      if (hit && Date.now() - hit.at < STALE_MAX_MS) return hit.quote;
      throw e;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function clearQuoteCache(): void {
  cache.clear();
  inflight.clear();
}
