// AI 자동 분석 잡 (F7, D4) — auto_analysis=true 워치리스트 종목 분석.
// 디스패처가 analysis_schedules(run_time) 매칭으로 호출. 스케줄 등록은 배포 후(골격).
import 'server-only';
import type { Stock } from '@/types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { runAnalysis, type AnalysisRunResult } from '@/lib/services/analysis';

interface WatchRow {
  user_id: string;
  auto_analysis: boolean;
  stocks: Stock | null;
}

export interface AnalysisJobReport {
  processed: number;
  errors: number;
  details: Array<{ userId: string; ticker: string; result: AnalysisRunResult }>;
}

export async function runAnalysisJob(opts?: { limit?: number }): Promise<AnalysisJobReport> {
  const admin = createAdminSupabase();
  const query = admin
    .from('watchlist_items')
    .select('user_id, auto_analysis, stocks(id, ticker, name_kr, name_en, market, currency, sector, is_active)')
    .eq('auto_analysis', true);
  const { data, error } = opts?.limit ? await query.limit(opts.limit) : await query;
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as WatchRow[];
  const report: AnalysisJobReport = { processed: 0, errors: 0, details: [] };
  for (const row of rows) {
    if (!row.stocks) continue;
    const result = await runAnalysis(admin, row.user_id, row.stocks, 'auto');
    report.processed += 1;
    if (result.status === 'error') report.errors += 1;
    report.details.push({ userId: row.user_id, ticker: row.stocks.ticker, result });
  }
  return report;
}
