// 자동매매 엔진 tick (D15) — 클라이언트(실시간 탭)가 장중 주기 호출.
// 서버가 kill switch·개장·리스크를 전부 재검증하므로 클라이언트는 트리거일 뿐이다.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { runTick } from '@/lib/trading/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 과호출 방어 — 유저별 최소 간격 (서버리스 인스턴스별 메모리라 완벽하진 않지만 KIS 레이트리밋이 최종 방어선)
const lastTickAt = new Map<string, number>();
const MIN_INTERVAL_MS = 5_000;

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const now = Date.now();
    const last = lastTickAt.get(user.id) ?? 0;
    if (now - last < MIN_INTERVAL_MS) {
      return NextResponse.json({ ran: false, skipped: 'tick 간격이 너무 짧습니다.', evaluated: 0, signals: 0, errors: [] });
    }
    lastTickAt.set(user.id, now);
    return NextResponse.json(await runTick(supabase, user.id));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
