// 투자 기록 (D21) — 매매 기록 · 목표 수익률 · 수익 분석(구 기간별 수익률)을 한 탭에 모은다.
import { Suspense } from 'react';
import { requireUser } from '@/lib/supabase/server';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { listCashTx } from '@/lib/supabase/queries/cash';
import { loadGoalOverview } from '@/lib/services/goals';
import { JournalTabs } from '@/components/journal/journal-tabs';
import { parseJournalTab } from '@/components/journal/tab-keys';

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function JournalPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const initialTab = parseJournalTab(tab) ?? 'trade';

  const { supabase, user } = await requireUser();
  const [trades, cashTxs] = await Promise.all([listAllTrades(supabase, user.id), listCashTx(supabase, user.id)]);
  const goals = await loadGoalOverview(supabase, user.id, { trades, txs: cashTxs });

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">투자 기록</h1>
        <p className="text-sm text-muted-foreground">실거래 매매 기록 · 월/연 목표 수익률 · 수익 분석(원화 환산 통합)</p>
      </div>
      <Suspense>
        <JournalTabs initialTab={initialTab} trades={trades} cashTxs={cashTxs} goals={goals} />
      </Suspense>
    </div>
  );
}
