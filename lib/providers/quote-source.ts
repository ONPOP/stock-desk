// 시세 소스 팩토리 — 사용자 KIS 키가 설정돼 있으면 KIS, 아니면 Yahoo로 폴백.
// (KIS 발급 지연 동안 Yahoo로 시세가 돌게 하되, 키가 들어오면 자동으로 KIS 전환)
// 검색은 stocks 테이블(sync:master) 기반이라 소스와 무관하므로 여기서 다루지 않는다.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Candle, CandleInterval, Market, Quote } from '@/types';
import { getKisCredentials } from '@/lib/supabase/queries/settings';
import { KisClient } from '@/lib/providers/kis/client';
import { getQuote as kisGetQuote } from '@/lib/providers/kis/quote';
import { getCandles as kisGetCandles } from '@/lib/providers/kis/candle';
import { SupabaseTokenStore } from '@/lib/providers/kis/supabase-token-store';
import { getQuote as yahooGetQuote, getCandles as yahooGetCandles } from '@/lib/providers/yahoo/quote';

export type QuoteSourceName = 'kis' | 'yahoo';

export interface QuoteSource {
  name: QuoteSourceName;
  getQuote(ticker: string, market: Market): Promise<Quote>;
  getCandles(ticker: string, market: Market, interval: CandleInterval, count: number): Promise<Candle[]>;
}

const yahooSource: QuoteSource = {
  name: 'yahoo',
  getQuote: yahooGetQuote,
  getCandles: yahooGetCandles,
};

const SOURCE_TTL_MS = 60_000;
const sourceCache = new Map<string, { source: QuoteSource; at: number }>();
const sourceInflight = new Map<string, Promise<QuoteSource>>();

function kisSource(client: KisClient): QuoteSource {
  return {
    name: 'kis',
    getQuote: (t, m) => kisGetQuote(client, t, m),
    getCandles: (t, m, i, c) => kisGetCandles(client, t, m, i, c),
  };
}

export async function resolveQuoteSource(db: SupabaseClient, userId: string): Promise<QuoteSource> {
  const hit = sourceCache.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < SOURCE_TTL_MS) return hit.source;

  const pending = sourceInflight.get(userId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const creds = await getKisCredentials(db, userId);
      const client = new KisClient(creds, { tokenStore: new SupabaseTokenStore() });
      return kisSource(client);
    } catch {
      // 키 미설정/복호화 실패 등은 Yahoo 폴백으로 흡수 (시세는 끊기지 않게)
      return yahooSource;
    }
  })()
    .then((source) => {
      sourceCache.set(userId, { source, at: Date.now() });
      return source;
    })
    .finally(() => {
      sourceInflight.delete(userId);
    });

  sourceInflight.set(userId, request);
  return request;
}

export function clearQuoteSourceCache(userId?: string): void {
  if (userId) {
    sourceCache.delete(userId);
    sourceInflight.delete(userId);
    return;
  }
  sourceCache.clear();
  sourceInflight.clear();
}
