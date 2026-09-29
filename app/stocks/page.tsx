// 내 종목(워치리스트) — F3 검색·등록 + V2 포트폴리오. RSC에서 초기 목록·매매기록 로드 후 클라이언트 매니저에 위임.
import { requireUser } from '@/lib/supabase/server';
import { listWatchlist, listWatchlists } from '@/lib/supabase/queries/watchlist';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { listStockGrades } from '@/lib/supabase/queries/stock-grades';
import { WatchlistManager } from '@/components/stocks/watchlist-manager';

export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const tabs = await listWatchlists(supabase, user.id); // 기본 탭 보장 후 반환(맨 앞 고정)
  // ?w=<관심목록 id> — 종목 상세에서 뒤로 왔을 때 보던 탭을 복원한다. 없거나 삭제된 id면 기본 탭.
  const { w } = await searchParams;
  const activeId = tabs.find((t) => t.id === w)?.id ?? (tabs.find((t) => t.isDefault) ?? tabs[0]).id;
  const [initial, trades, grades] = await Promise.all([
    listWatchlist(supabase, user.id, activeId),
    listAllTrades(supabase, user.id),
    // 등급은 부가 기능 — 조회가 실패해도(예: 0022 미적용) 내 종목 화면 전체를 에러로 넘기지 않는다
    listStockGrades(supabase, user.id).catch((e: unknown) => {
      console.warn(`⚠ 종목 등급 조회 실패 — 등급 없이 표시: ${e instanceof Error ? e.message : String(e)}`);
      return {};
    }),
  ]);
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">내 종목</h1>
      <WatchlistManager tabs={tabs} activeId={activeId} initial={initial} trades={trades} grades={grades} />
    </div>
  );
}
