// S1 대시보드 (B 트레이더 콕핏) — 시장 위젯 + KPI 타일 + 벤토(내 종목·신규분석·오늘일정) + 브리핑.
// [데이터 계약 확장] 백엔드 변경 없이 기존 쿼리(listWatchlist·listRecentAnalyses·listEvents)를 대시보드에서 호출.
import { Card, CardContent } from '@/components/ui/card';
import { MarketWidget } from '@/components/dashboard/market-widget';
import { BriefingCard } from '@/components/dashboard/briefing-card';
import { PortfolioOverview } from '@/components/dashboard/portfolio-overview';
import { WatchlistTiles } from '@/components/dashboard/watchlist-tiles';
import { AnalysesTile } from '@/components/dashboard/analyses-tile';
import { ScheduleTile } from '@/components/dashboard/schedule-tile';
import { requireUser } from '@/lib/supabase/server';
import { getLatestBriefing } from '@/lib/supabase/queries/briefings';
import { listWatchlist } from '@/lib/supabase/queries/watchlist';
import { listRecentAnalyses } from '@/lib/supabase/queries/analyses';
import { listEvents } from '@/lib/supabase/queries/calendar';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { computeHoldings, computeRealized } from '@/lib/utils/portfolio';

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  // event_date(date)는 KST 기준 오늘 하루
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  const [briefing, watchlist, analyses, events, trades] = await Promise.all([
    getLatestBriefing(supabase, user.id),
    listWatchlist(supabase, user.id),
    listRecentAnalyses(supabase, user.id, 5),
    listEvents(supabase, user.id, today, today),
    listAllTrades(supabase, user.id),
  ]);

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 p-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground">트레이더 콕핏 · 시장·브리핑·내 종목을 한 화면에</p>
      </div>

      <Card className="overflow-hidden p-0">
        <CardContent className="px-0 py-1">
          <MarketWidget />
        </CardContent>
      </Card>

      <PortfolioOverview holdings={computeHoldings(trades)} realized={computeRealized(trades)} />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <WatchlistTiles items={watchlist} />
        <div className="space-y-5">
          <AnalysesTile analyses={analyses} />
          <ScheduleTile events={events} />
        </div>
      </div>

      <BriefingCard initial={briefing} />
    </div>
  );
}
