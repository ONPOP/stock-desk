// 기간별 수익률 (V2) — RSC에서 매매기록 로드 후 클라이언트 뷰에 위임(실현손익 집계·차트).
import { requireUser } from '@/lib/supabase/server';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { PerformanceView } from '@/components/performance/performance-view';

export default async function PerformancePage() {
  const { supabase, user } = await requireUser();
  const trades = await listAllTrades(supabase, user.id);
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">기간별 수익률</h1>
        <p className="text-sm text-muted-foreground">실현손익 기준 · 연도·월·기간별 집계(원화 환산 통합)</p>
      </div>
      <PerformanceView trades={trades} />
    </div>
  );
}
