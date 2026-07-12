// 워치리스트 탭(컬렉션) CRUD — 목록/생성/이름변경·정렬(PATCH)/삭제. 기본 탭은 이름변경·삭제 차단.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import {
  listWatchlists,
  createWatchlist,
  renameWatchlist,
  reorderWatchlists,
  deleteWatchlist,
} from '@/lib/supabase/queries/watchlist';
import { watchlistCreateSchema, watchlistTabPatchSchema, watchlistIdSchema } from '@/lib/validation/market';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const watchlists = await listWatchlists(supabase, user.id);
    return NextResponse.json({ watchlists });
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
    const parsed = watchlistCreateSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const watchlist = await createWatchlist(supabase, user.id, parsed.data.name);
    return NextResponse.json({ watchlist });
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
    const parsed = watchlistTabPatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    if (parsed.data.action === 'rename') {
      await renameWatchlist(supabase, user.id, parsed.data.id, parsed.data.name);
    } else {
      await reorderWatchlists(
        supabase,
        user.id,
        parsed.data.orders.map((o) => ({ id: o.id, sortOrder: o.sort_order })),
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
    const parsed = watchlistIdSchema.safeParse(searchParams.get('id'));
    if (!parsed.success) throw new ValidationError('id가 필요합니다.');
    await deleteWatchlist(supabase, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
