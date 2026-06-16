// 워치리스트 CRUD (F3) — 등록/조회/해제 + 즐겨찾기·정렬(PATCH).
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
import { watchlistAddSchema, watchlistPatchSchema } from '@/lib/validation/market';

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
      await setFavorite(supabase, user.id, parsed.data.stock_id, parsed.data.value);
    } else {
      await reorderWatchlist(
        supabase,
        user.id,
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
    const stockId = searchParams.get('stock_id');
    if (!stockId) throw new ValidationError('stock_id가 필요합니다.');
    await removeFromWatchlist(supabase, user.id, stockId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
