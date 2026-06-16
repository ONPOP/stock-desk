// 모의투자 (F9) — GET(상태), POST(주문), POST ?reset=true(시즌 리셋).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import { getPaperState, cancelTrade, startNewSeason } from '@/lib/supabase/queries/paper';
import { placeOrder } from '@/lib/services/paper';
import { orderSchema, cancelSchema, newSeasonSchema } from '@/lib/validation/paper';

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
      const seasonJson = await req.json().catch(() => null);
      const seasonParsed = newSeasonSchema.safeParse(seasonJson);
      if (!seasonParsed.success)
        throw new ValidationError(seasonParsed.error.issues[0]?.message ?? '시즌 설정값이 올바르지 않습니다.');
      await startNewSeason(
        supabase,
        user.id,
        {
          seedKrw: seasonParsed.data.seedKrw,
          seedUsdCents: Math.round(seasonParsed.data.seedUsd * 100),
          startDate: seasonParsed.data.startDate ?? null,
          endDate: seasonParsed.data.endDate ?? null,
        },
        new Date().toISOString(),
      );
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
      orderType: parsed.data.orderType,
      limitPrice: parsed.data.limitPrice,
      memo: parsed.data.memo,
    });
    return NextResponse.json({ result, state: await getPaperState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

/** 예약(pending) 주문 취소 — ?tradeId= */
export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const tradeId = new URL(req.url).searchParams.get('tradeId');
    const parsed = cancelSchema.safeParse({ tradeId });
    if (!parsed.success) throw new ValidationError('취소할 주문을 지정해주세요.');
    const ok = await cancelTrade(supabase, parsed.data.tradeId);
    if (!ok) throw new ValidationError('취소할 수 있는 예약 주문이 아닙니다.');
    return NextResponse.json({ ok: true, state: await getPaperState(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
