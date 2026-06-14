// Finnhub 뉴스 (F5, 미국) — /company-news?symbol=&from=&to=.
import type { NewsItemRaw } from '@/types';
import type { FinnhubClient } from '@/lib/providers/finnhub/client';

interface FinnhubNewsItem {
  headline?: string;
  url?: string;
  source?: string;
  summary?: string;
  datetime?: number; // unix seconds
}

/** 순수 변환: Finnhub company-news 배열 → NewsItemRaw[] */
export function buildFinnhubNews(items: FinnhubNewsItem[]): NewsItemRaw[] {
  return (items ?? [])
    .filter((it) => it.headline && it.url)
    .map((it) => ({
      title: it.headline as string,
      url: it.url as string,
      source: it.source ?? 'Finnhub',
      publishedAt:
        typeof it.datetime === 'number' && it.datetime > 0 ? new Date(it.datetime * 1000).toISOString() : null,
      body: it.summary ?? null,
    }));
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export async function getFinnhubNews(client: FinnhubClient, ticker: string, since?: string): Promise<NewsItemRaw[]> {
  const to = new Date();
  const from = since ? new Date(`${since}T00:00:00Z`) : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const items = await client.getJson<FinnhubNewsItem[]>('company-news', {
    symbol: ticker.toUpperCase(),
    from: dateOnly(from),
    to: dateOnly(to),
  });
  return buildFinnhubNews(Array.isArray(items) ? items : []);
}
