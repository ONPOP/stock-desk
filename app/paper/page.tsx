// F9 모의투자 — 계좌·포지션·주문·거래 타임라인. 시즌 리셋.
import { requireUser } from '@/lib/supabase/server';
import { getPaperState } from '@/lib/supabase/queries/paper';
import { PaperTabs } from '@/components/paper/paper-tabs';

export default async function PaperPage() {
  const { supabase, user } = await requireUser();
  const state = await getPaperState(supabase, user.id);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">모의투자</h1>
      <PaperTabs initialState={state} />
    </div>
  );
}
