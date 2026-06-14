// 뉴스 DB 쿼리 (F5) — news_items. 읽기는 RSC, 쓰기는 admin(service-role).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsItem, Sentiment } from '@/types';

interface NewsRow {
  title: string;
  source: string | null;
  url: string;
  published_at: string | null;
  summary_ai: string | null;
  sentiment: string | null;
  cluster_id: string | null;
}

function rowToNews(r: NewsRow): NewsItem {
  return {
    title: r.title,
    url: r.url,
    source: r.source,
    publishedAt: r.published_at,
    summaryAi: r.summary_ai,
    sentiment: (r.sentiment as Sentiment | null) ?? null,
    clusterId: r.cluster_id,
  };
}

const NEWS_COLS = 'title, source, url, published_at, summary_ai, sentiment, cluster_id';

export async function getNewsByStock(db: SupabaseClient, stockId: string, limit = 30): Promise<NewsItem[]> {
  const { data, error } = await db
    .from('news_items')
    .select(NEWS_COLS)
    .eq('stock_id', stockId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`뉴스 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => rowToNews(r as NewsRow));
}

export async function upsertNews(admin: SupabaseClient, stockId: string, items: NewsItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const payload = items.map((n) => ({
    stock_id: stockId,
    title: n.title,
    source: n.source,
    url: n.url,
    published_at: n.publishedAt,
    summary_ai: n.summaryAi,
    sentiment: n.sentiment,
    cluster_id: n.clusterId,
  }));
  // url 충돌 시 최신 요약·감성으로 갱신
  const { error } = await admin.from('news_items').upsert(payload, { onConflict: 'url' });
  if (error) throw new Error(`뉴스 저장 실패: ${error.message}`);
  return payload.length;
}
