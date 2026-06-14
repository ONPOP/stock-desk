// 뉴스 갱신 잡 (F5) — 워치리스트 전 종목. D8 장중3h/장외6h 주기는 디스패처가 게이팅.
// 크론은 비용 통제로 기본 AI 요약 생략(withAi=false). 디스패처 스케줄 등록은 배포 후(W4 골격).
import 'server-only';
import type { Stock } from '@/types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { refreshNews, type NewsRefreshResult } from '@/lib/services/news';

interface WatchRow {
  user_id: string;
  stocks: Stock | null;
}

export interface NewsJobReport {
  processed: number;
  errors: number;
  details: Array<{ userId: string; ticker: string; result: NewsRefreshResult }>;
}

export async function runNewsRefreshJob(opts?: { limit?: number; withAi?: boolean }): Promise<NewsJobReport> {
  const admin = createAdminSupabase();
  const query = admin
    .from('watchlist_items')
    .select('user_id, stocks(id, ticker, name_kr, name_en, market, currency, sector)');
  const { data, error } = opts?.limit ? await query.limit(opts.limit) : await query;
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as WatchRow[];
  const report: NewsJobReport = { processed: 0, errors: 0, details: [] };
  for (const row of rows) {
    if (!row.stocks) continue;
    const result = await refreshNews(admin, row.user_id, row.stocks, { withAi: opts?.withAi ?? false });
    report.processed += 1;
    if (result.status === 'error') report.errors += 1;
    report.details.push({ userId: row.user_id, ticker: row.stocks.ticker, result });
  }
  return report;
}
