// 종목 검색 (F3) — stocks 테이블(sync:master) 기반. 시세 소스와 무관.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { searchStocks } from '@/lib/providers/kis/search';

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    if (q.trim().length === 0) {
      return NextResponse.json({ results: [] });
    }
    const results = await searchStocks(supabase, q);
    return NextResponse.json({ results });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
