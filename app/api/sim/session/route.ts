// 모의투자 테스트 세션 — GET(상태), POST(새 세션 시작), PATCH(재생 위치 저장).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getSimTradingState } from '@/lib/services/sim-trading';
import { getActiveSession, startSession, updateCurDate } from '@/lib/supabase/queries/sim-trading';
import { simSessionSchema, simCurDateSchema } from '@/lib/validation/sim';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ state: await getSimTradingState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = simSessionSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    await startSession(
      supabase,
      user.id,
      { seedUsdCents: Math.round(parsed.data.seedUsd * 100), startDate: parsed.data.startDate },
      new Date().toISOString(),
    );
    return NextResponse.json({ state: await getSimTradingState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = simCurDateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError('날짜가 올바르지 않습니다.');
    const session = await getActiveSession(supabase, user.id);
    if (session) await updateCurDate(supabase, session.id, parsed.data.curDate);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
