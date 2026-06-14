// 뉴스 소스 팩토리 — 시장별로 어댑터 선택해 종목에 바인딩된 thunk 반환.
// 한국=네이버(종목명 검색), 미국=Finnhub(티커). 키 미설정 시 null(graceful).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsItemRaw, Stock } from '@/types';
import { regionOf } from '@/lib/utils/market-hours';
import { getNaverCredentials, getFinnhubKey } from '@/lib/supabase/queries/settings';
import { NaverClient } from '@/lib/providers/naver/client';
import { getNaverNews } from '@/lib/providers/naver/news';
import { FinnhubClient } from '@/lib/providers/finnhub/client';
import { getFinnhubNews } from '@/lib/providers/finnhub/news';

export async function resolveNewsSource(
  db: SupabaseClient,
  userId: string,
  stock: Stock,
  since?: string,
): Promise<(() => Promise<NewsItemRaw[]>) | null> {
  if (regionOf(stock.market) === 'KR') {
    const creds = await getNaverCredentials(db, userId);
    if (!creds) return null;
    const query = stock.name_kr || stock.name_en || stock.ticker;
    return () => getNaverNews(new NaverClient(creds), query);
  }
  const finnhubKey = await getFinnhubKey(db, userId);
  if (!finnhubKey) return null;
  return () => getFinnhubNews(new FinnhubClient(finnhubKey), stock.ticker, since);
}
