// 백테스트 (D15) — 사용자 시세 소스에서 캔들 조회 후 실매매와 동일 전략 함수로 재생.
// 시드는 현재 모의투자 시즌 시드(KRW)와 동일하게 맞춰 주문 크기(orderPct) 해석을 일치시킨다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { runBacktest } from '@/lib/trading/backtest';
import { getTradingConfig } from '@/lib/supabase/queries/trading';
import { ensureSeason } from '@/lib/supabase/queries/paper';
import { backtestRequestSchema } from '@/lib/validation/trading';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = backtestRequestSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');

    const { ticker, market, interval, count } = parsed.data;
    const params = parsed.data.params ?? (await getTradingConfig(supabase, user.id)).params;

    const season = await ensureSeason(supabase, user.id);
    const { data: seasonRow } = await supabase
      .from('paper_seasons')
      .select('seed_krw')
      .eq('id', season.id)
      .maybeSingle<{ seed_krw: number | string }>();
    const seed = Number(seasonRow?.seed_krw ?? 0) || 10_000_000;

    const source = await resolveQuoteSource(supabase, user.id);
    const candles = await source.getCandles(ticker, market, interval, count);
    return NextResponse.json({ result: runBacktest(candles, params, seed), interval, candleCount: candles.length });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
