// F16 종목 비교 (V2) — 등록 종목 2~4개의 핵심 지표를 표로 비교.
import { requireUser } from '@/lib/supabase/server';
import { listWatchlist } from '@/lib/supabase/queries/watchlist';
import { getMetricsSeries } from '@/lib/supabase/queries/fundamentals';
import { CompareClient } from '@/components/compare/compare-client';
import type { CompareItem } from '@/types';

export default async function ComparePage() {
  const { supabase, user } = await requireUser();
  const watchlist = await listWatchlist(supabase, user.id);
  const items: CompareItem[] = await Promise.all(
    watchlist.map(async (w) => {
      const series = await getMetricsSeries(supabase, w.stock_id, 1).catch(() => []);
      return {
        stockId: w.stock_id,
        ticker: w.ticker,
        name: w.name_kr ?? w.name_en ?? w.ticker,
        currency: w.currency,
        metrics: series[0] ?? null,
      };
    }),
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">종목 비교</h1>
      <CompareClient items={items} />
    </div>
  );
}
