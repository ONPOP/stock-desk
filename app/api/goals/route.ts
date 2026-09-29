// 목표 수익률 API (D21) — 현황 조회 / 설정(같은 종류·같은 달은 덮어씀) / 삭제.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { listCashTx } from '@/lib/supabase/queries/cash';
import { deleteGoal, upsertGoal } from '@/lib/supabase/queries/journal';
import { loadGoalOverview } from '@/lib/services/goals';
import { goalInputSchema } from '@/lib/validation/journal';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const [trades, txs] = await Promise.all([listAllTrades(supabase, user.id), listCashTx(supabase, user.id)]);
    return NextResponse.json(await loadGoalOverview(supabase, user.id, { trades, txs }));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = goalInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    return NextResponse.json({ goal: await upsertGoal(supabase, user.id, parsed.data) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) throw new ValidationError('삭제할 목표 id가 필요합니다.');
    await deleteGoal(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
