// 데일리 브리핑 (F1) — GET: 최신 조회, POST: 지금 생성.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getLatestBriefing } from '@/lib/supabase/queries/briefings';
import { generateDailyBriefing } from '@/lib/services/briefing';

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ briefing: await getLatestBriefing(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const result = await generateDailyBriefing(supabase, user.id, todayKst());
    const briefing = await getLatestBriefing(supabase, user.id);
    return NextResponse.json({ briefing, result });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
