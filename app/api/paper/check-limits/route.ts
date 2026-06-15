// 지정가 예약 체결 감시 트리거 (F9) — 클라이언트가 앱 실행 중 주기적으로 호출.
// 서버에서 pending 지정가 주문의 현재가를 확인해 조건 충족분을 체결한다.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getPaperState } from '@/lib/supabase/queries/paper';
import { checkLimitOrders } from '@/lib/services/paper';

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const { filled } = await checkLimitOrders(supabase, user.id);
    if (filled === 0) return NextResponse.json({ filled: 0 });
    return NextResponse.json({ filled, state: await getPaperState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
