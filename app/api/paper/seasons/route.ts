// 모의투자 — 종료(아카이브)된 지난 시즌 목록 조회.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listArchivedSeasons } from '@/lib/supabase/queries/paper';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ seasons: await listArchivedSeasons(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
