// 내 종목(워치리스트) — F3 검색·등록 + V2 포트폴리오. RSC에서 초기 목록·매매기록 로드 후 클라이언트 매니저에 위임.
import { requireUser } from '@/lib/supabase/server';
import { listWatchlist } from '@/lib/supabase/queries/watchlist';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { WatchlistManager } from '@/components/stocks/watchlist-manager';

export default async function StocksPage() {
  const { supabase, user } = await requireUser();
  const [initial, trades] = await Promise.all([
    listWatchlist(supabase, user.id),
    listAllTrades(supabase, user.id),
  ]);
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">내 종목</h1>
      <WatchlistManager initial={initial} trades={trades} />
    </div>
  );
}
