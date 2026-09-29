// 월별 목표 기록 API (D21)
//   PATCH  월초 금액을 직접 고치거나(null) 자동값으로 되돌린다.
//   POST   확정된 지난 달까지 현재 매매·입출금 기록으로 다시 계산한다(과거 매매를 뒤늦게 입력했을 때).
//          사용자가 고친 월초 금액은 유지한다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { setMonthStartOverride } from '@/lib/supabase/queries/journal';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { listCashTx } from '@/lib/supabase/queries/cash';
import { loadGoalOverview } from '@/lib/services/goals';
import { monthOverrideSchema } from '@/lib/validation/journal';

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = monthOverrideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    await setMonthStartOverride(supabase, user.id, parsed.data.month, parsed.data.startOverride);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const [trades, txs] = await Promise.all([listAllTrades(supabase, user.id), listCashTx(supabase, user.id)]);
    return NextResponse.json(await loadGoalOverview(supabase, user.id, { trades, txs }, { recompute: true }));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
