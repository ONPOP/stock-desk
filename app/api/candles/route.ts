// 기간별 캔들 조회 (F6 차트). KIS 키 있으면 KIS, 없으면 Yahoo 폴백.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { candleQuerySchema } from '@/lib/validation/market';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const parsed = candleQuerySchema.safeParse({
      ticker: searchParams.get('ticker'),
      market: searchParams.get('market'),
      interval: searchParams.get('interval'),
      count: searchParams.get('count') ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const { ticker, market, interval, count } = parsed.data;
    const source = await resolveQuoteSource(supabase, user.id);
    const candles = await source.getCandles(ticker, market, interval, count);
    return NextResponse.json({ source: source.name, candles });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
