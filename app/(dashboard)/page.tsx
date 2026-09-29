// S1 대시보드 — 투자 규칙 · 이번 달 목표(상단 고정) + 자산현황 + 신규분석·오늘일정 + 브리핑.
// D21: 상단 시장 지수 위젯과 하단 '내 종목' 타일은 제거하고 그 자리에 투자 규칙·월 목표를 둔다.
import { BriefingCard } from '@/components/dashboard/briefing-card';
import { PortfolioOverview } from '@/components/dashboard/portfolio-overview';
import { AnalysesTile } from '@/components/dashboard/analyses-tile';
import { ScheduleTile } from '@/components/dashboard/schedule-tile';
import { RulesCard } from '@/components/journal/rules-card';
import { MonthGoalCard } from '@/components/journal/month-goal-card';
import { requireUser } from '@/lib/supabase/server';
import { getLatestBriefing } from '@/lib/supabase/queries/briefings';
import { listRecentAnalyses } from '@/lib/supabase/queries/analyses';
import { listEvents } from '@/lib/supabase/queries/calendar';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { listCashTx } from '@/lib/supabase/queries/cash';
import { listRules } from '@/lib/supabase/queries/journal';
import { loadGoalOverview } from '@/lib/services/goals';
import { computeHoldings, computeRealized } from '@/lib/utils/portfolio';

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  // event_date(date)는 KST 기준 오늘 하루
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  const [briefing, analyses, events, trades, cashTxs, rules] = await Promise.all([
    getLatestBriefing(supabase, user.id),
    listRecentAnalyses(supabase, user.id, 5),
    listEvents(supabase, user.id, today, today),
    listAllTrades(supabase, user.id),
    listCashTx(supabase, user.id),
    listRules(supabase, user.id),
  ]);
  const goals = await loadGoalOverview(supabase, user.id, { trades, txs: cashTxs });
  const holdings = computeHoldings(trades);
  const currentGoal = goals.months.find((m) => m.month === goals.currentMonth) ?? null;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground">투자 규칙·목표·자산을 한 화면에</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <RulesCard initialRules={rules} />
        <MonthGoalCard progress={currentGoal} holdings={holdings} fxPending={goals.fxPending} />
      </div>

      <PortfolioOverview
        holdings={holdings}
        realized={computeRealized(trades)}
        trades={trades}
        initialCashTxs={cashTxs}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AnalysesTile analyses={analyses} />
        <ScheduleTile events={events} />
      </div>

      <BriefingCard initial={briefing} />
    </div>
  );
}
