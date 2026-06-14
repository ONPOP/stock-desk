// 워치리스트 CRUD (F3) — 등록/조회/해제.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/supabase/queries/watchlist';
import { watchlistAddSchema } from '@/lib/validation/market';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const items = await listWatchlist(supabase, user.id);
    return NextResponse.json({ items });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = watchlistAddSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const { ticker, market, group_name } = parsed.data;
    const item = await addToWatchlist(supabase, user.id, ticker, market, group_name);
    return NextResponse.json({ item });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const stockId = searchParams.get('stock_id');
    if (!stockId) throw new ValidationError('stock_id가 필요합니다.');
    await removeFromWatchlist(supabase, user.id, stockId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
