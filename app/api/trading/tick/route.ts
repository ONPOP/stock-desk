// 자동매매 엔진 tick (D15) — 클라이언트(실시간 탭)가 장중 주기 호출.
// 서버가 kill switch·개장·리스크를 전부 재검증하므로 클라이언트는 트리거일 뿐이다.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { runTick } from '@/lib/trading/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 유저별 DB 락(TTL 초) — 인메모리 스로틀은 서버리스 인스턴스별이라 동시 요청에 우회됨.
// 락으로 tick을 직렬화해 리스크 관문·잔고 스냅샷의 동시 이중처리를 차단한다.
const TICK_LOCK_TTL_SECONDS = 12;

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const { data: acquired, error } = await supabase.rpc('try_acquire_tick_lock', {
      p_user: user.id,
      p_ttl_seconds: TICK_LOCK_TTL_SECONDS,
    });
    if (error) throw new Error(`tick 락 획득 실패: ${error.message}`);
    if (!acquired) {
      return NextResponse.json({ ran: false, skipped: '다른 tick 진행 중', evaluated: 0, signals: 0, errors: [] });
    }
    try {
      return NextResponse.json(await runTick(supabase, user.id));
    } finally {
      await supabase.rpc('release_tick_lock', { p_user: user.id });
    }
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
