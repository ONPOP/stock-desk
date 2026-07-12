// 모의투자 테스트 — 보유 종목 평가용 특정 시점 종가 조회. GET ?date=&tickers=a,b,c
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getClosesAt } from '@/lib/supabase/queries/sim-trading';

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const sp = new URL(req.url).searchParams;
    const date = sp.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('날짜가 올바르지 않습니다.');
    const tickers = (sp.get('tickers') ?? '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => /^[A-Z][A-Z0-9.\-]{0,15}$/.test(t))
      .slice(0, 250);
    const prices = tickers.length ? await getClosesAt(supabase, tickers, date) : {};
    return NextResponse.json({ prices });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
