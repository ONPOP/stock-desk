// 예수금 입출금 API (V2 · D11) — 본인 기록 조회/추가/삭제. RLS로 user_id 격리.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listCashTx, insertCashTx, deleteCashTx } from '@/lib/supabase/queries/cash';
import { cashTxInputSchema } from '@/lib/validation/cash';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const txs = await listCashTx(supabase, user.id);
    return NextResponse.json({ txs });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = cashTxInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const tx = await insertCashTx(supabase, user.id, parsed.data);
    return NextResponse.json({ tx });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) throw new ValidationError('삭제할 기록 id가 필요합니다.');
    await deleteCashTx(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
