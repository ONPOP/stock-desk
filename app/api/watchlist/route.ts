// 워치리스트 종목 CRUD (F3) — 탭(watchlist_id) 단위 등록/조회/해제 + 즐겨찾기·정렬(PATCH).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import {
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  setFavorite,
  reorderWatchlist,
} from '@/lib/supabase/queries/watchlist';
import { watchlistAddSchema, watchlistPatchSchema, watchlistIdSchema } from '@/lib/validation/market';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const parsed = watchlistIdSchema.safeParse(searchParams.get('watchlist_id'));
    if (!parsed.success) throw new ValidationError('watchlist_id가 필요합니다.');
    const items = await listWatchlist(supabase, user.id, parsed.data);
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
    const { watchlist_id, ticker, market } = parsed.data;
    const item = await addToWatchlist(supabase, user.id, watchlist_id, ticker, market);
    return NextResponse.json({ item });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = watchlistPatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    if (parsed.data.action === 'favorite') {
      await setFavorite(supabase, user.id, parsed.data.watchlist_id, parsed.data.stock_id, parsed.data.value);
    } else {
      await reorderWatchlist(
        supabase,
        user.id,
        parsed.data.watchlist_id,
        parsed.data.orders.map((o) => ({ stockId: o.stock_id, sortOrder: o.sort_order })),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const wlParsed = watchlistIdSchema.safeParse(searchParams.get('watchlist_id'));
    if (!wlParsed.success) throw new ValidationError('watchlist_id가 필요합니다.');
    const stockId = searchParams.get('stock_id');
    if (!stockId) throw new ValidationError('stock_id가 필요합니다.');
    await removeFromWatchlist(supabase, user.id, wlParsed.data, stockId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
