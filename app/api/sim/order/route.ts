// 모의투자 테스트 주문 — POST(매수/매도). 체결가는 서버가 sim_candles 로 결정.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { placeSimOrder } from '@/lib/services/sim-trading';
import { simOrderSchema } from '@/lib/validation/sim';

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = simOrderSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const state = await placeSimOrder(supabase, user.id, parsed.data);
    return NextResponse.json({ state });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
