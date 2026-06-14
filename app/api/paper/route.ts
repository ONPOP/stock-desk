// 모의투자 (F9) — GET(상태), POST(주문), POST ?reset=true(시즌 리셋).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import { getPaperState } from '@/lib/supabase/queries/paper';
import { placeOrder, resetSeason } from '@/lib/services/paper';
import { orderSchema } from '@/lib/validation/paper';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ state: await getPaperState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (new URL(req.url).searchParams.get('reset') === 'true') {
      await resetSeason(supabase, user.id);
      return NextResponse.json({ state: await getPaperState(supabase, user.id), reset: true });
    }
    const json = await req.json().catch(() => null);
    const parsed = orderSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const stock = await getStock(supabase, parsed.data.ticker, parsed.data.market);
    if (!stock) throw new ValidationError('등록되지 않은 종목입니다.');
    if (stock.is_active === false) throw new ValidationError('거래정지·상장폐지 종목은 주문할 수 없습니다.');
    const result = await placeOrder(supabase, user.id, stock, {
      side: parsed.data.side,
      qty: parsed.data.qty,
      memo: parsed.data.memo,
    });
    return NextResponse.json({ result, state: await getPaperState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
