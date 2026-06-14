// 실거래 매매 기록 API (V2) — 본인 기록 조회/추가/삭제. RLS로 user_id 격리.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listAllTrades, listTradesByStock, insertTrade, deleteTrade } from '@/lib/supabase/queries/real-trades';
import { tradeInputSchema } from '@/lib/validation/trades';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const stockId = new URL(req.url).searchParams.get('stockId');
    const trades = stockId
      ? await listTradesByStock(supabase, user.id, stockId)
      : await listAllTrades(supabase, user.id);
    return NextResponse.json({ trades });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = tradeInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const trade = await insertTrade(supabase, user.id, parsed.data);
    return NextResponse.json({ trade });
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
    await deleteTrade(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
