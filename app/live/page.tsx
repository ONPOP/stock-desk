// 실시간 탭 (D15) — 호가 + 분봉 차트 + 자동매매 컨트롤. RSC가 초기 데이터 로드, 상호작용은 클라이언트.
import { requireUser } from '@/lib/supabase/server';
import { listAllWatchlistItems } from '@/lib/supabase/queries/watchlist';
import { getTradingConfig, listSignals } from '@/lib/supabase/queries/trading';
import { LiveClient } from '@/components/live/live-client';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
  const { supabase, user } = await requireUser();
  const [items, config, signals] = await Promise.all([
    listAllWatchlistItems(supabase, user.id),
    getTradingConfig(supabase, user.id),
    listSignals(supabase, user.id, 50),
  ]);

  // 국내 한정(D15) + 탭 중복 종목 제거
  const seen = new Set<string>();
  const krItems = items.filter((i) => {
    if (i.market !== 'KOSPI' && i.market !== 'KOSDAQ') return false;
    if (seen.has(i.stock_id)) return false;
    seen.add(i.stock_id);
    return true;
  });

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <h1 className="text-2xl font-bold">실시간</h1>
      <LiveClient items={krItems} initialConfig={config} initialSignals={signals} />
    </div>
  );
}
