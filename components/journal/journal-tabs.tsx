'use client';

// 투자 기록 탭 (D21) — [매매] [목표] [수익 분석]. 선택한 하위 탭은 ?tab=으로 URL에 남긴다(대시보드 링크·새로고침 유지).
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TradePanel } from './trade-panel';
import { GoalsPanel } from './goals-panel';
import { PerformanceView } from '@/components/performance/performance-view';
import { computeHoldings } from '@/lib/utils/portfolio';
import { parseJournalTab, type JournalTab } from './tab-keys';
import type { CashTransaction, GoalOverview, RealTrade } from '@/types';

export function JournalTabs({
  initialTab,
  trades,
  cashTxs,
  goals,
}: {
  initialTab: JournalTab;
  trades: RealTrade[];
  cashTxs: CashTransaction[];
  goals: GoalOverview;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseJournalTab(params.get('tab')) ?? initialTab;

  // 수익 분석 막대 위에 겹칠 목표 수익(월: 그 달 목표 수익, 연: 연 목표 수익)
  const targets: Record<string, number> = {};
  for (const m of goals.months) if (m.goal) targets[m.month] = m.goal.requiredProfit;
  for (const y of goals.years) if (y.goal) targets[y.year] = y.goal.targetProfit;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => router.replace(`/journal?tab=${String(v)}`, { scroll: false })}
      className="gap-5"
    >
      <TabsList>
        <TabsTrigger value="trade">매매</TabsTrigger>
        <TabsTrigger value="goals">목표</TabsTrigger>
        <TabsTrigger value="analysis">수익 분석</TabsTrigger>
      </TabsList>
      <TabsContent value="trade">
        <TradePanel initialTrades={trades} />
      </TabsContent>
      <TabsContent value="goals">
        <GoalsPanel initial={goals} holdings={computeHoldings(trades)} initialCashTxs={cashTxs} />
      </TabsContent>
      <TabsContent value="analysis">
        <PerformanceView trades={trades} targets={targets} />
      </TabsContent>
    </Tabs>
  );
}
