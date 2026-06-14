// 현재가 조회 (F5/F8 시세 폴링 소스). KIS 키 있으면 KIS, 없으면 Yahoo 폴백.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { getCachedQuote } from '@/lib/providers/quote-cache';
import { quoteQuerySchema } from '@/lib/validation/market';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const parsed = quoteQuerySchema.safeParse({
      ticker: searchParams.get('ticker'),
      market: searchParams.get('market'),
    });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const source = await resolveQuoteSource(supabase, user.id);
    const quote = await getCachedQuote(source, parsed.data.ticker, parsed.data.market);
    return NextResponse.json({ source: source.name, quote });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
