// 펀더멘털 일일 갱신 잡 (F4/F15/F12) — 워치리스트 전 종목 대상.
// PRD F4 "일 1회 갱신". 공시(F12)는 주기가 다르나(장중 3h/장외 6h) W4 뉴스 크론에서
// 본 함수를 재사용해 주기를 분리할 예정. 현재는 디스패처(dispatch.ts) 미등록 — 수동/테스트 호출용.
import 'server-only';
import type { Stock } from '@/types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { refreshFundamentals, type RefreshOutcome } from '@/lib/services/fundamentals';

interface WatchRow {
  user_id: string;
  stocks: Stock | null;
}

export interface RefreshJobReport {
  processed: number;
  errors: number;
  details: Array<{ userId: string; ticker: string; outcome: RefreshOutcome }>;
}

/**
 * 모든 사용자의 워치리스트 종목 펀더멘털을 갱신.
 * 사용자별 키로 수집하므로 (user_id, stock) 단위로 순회한다(키는 admin이 user_id 필터로 조회).
 */
export async function runFundamentalsRefreshJob(opts?: { limit?: number }): Promise<RefreshJobReport> {
  const admin = createAdminSupabase();
  const query = admin
    .from('watchlist_items')
    .select('user_id, stocks(id, ticker, name_kr, name_en, market, currency, sector)');
  const { data, error } = opts?.limit ? await query.limit(opts.limit) : await query;
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as WatchRow[];
  const report: RefreshJobReport = { processed: 0, errors: 0, details: [] };
  for (const row of rows) {
    if (!row.stocks) continue;
    try {
      const outcome = await refreshFundamentals(admin, row.user_id, row.stocks);
      report.processed += 1;
      if (outcome.metrics.status === 'error' || outcome.dividends.status === 'error' || outcome.disclosures.status === 'error') {
        report.errors += 1;
      }
      report.details.push({ userId: row.user_id, ticker: row.stocks.ticker, outcome });
    } catch (e) {
      report.errors += 1;
      report.details.push({
        userId: row.user_id,
        ticker: row.stocks.ticker,
        outcome: {
          metrics: { status: 'error', reason: e instanceof Error ? e.message : '알 수 없는 오류' },
          dividends: { status: 'error' },
          disclosures: { status: 'error' },
        },
      });
    }
  }
  return report;
}
