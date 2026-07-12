// 포트폴리오 요약(전역 마스코트 펫용) — 평가손익·수익률·실현손익을 원화 통합으로 반환.
// 보유 종목 현재가는 캐시 시세로 모으고, 환율은 시장지수(usdkrw)에서 가져온다. 개별 실패는 graceful degrade.
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listAllTrades } from '@/lib/supabase/queries/real-trades';
import { computeHoldings, computeRealized, summarizePortfolio } from '@/lib/utils/portfolio';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { getCachedQuote } from '@/lib/providers/quote-cache';
import { getMarketIndices } from '@/lib/providers/yahoo/market-index';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const trades = await listAllTrades(supabase, user.id);
    const holdings = computeHoldings(trades);
    const realized = computeRealized(trades);

    const source = await resolveQuoteSource(supabase, user.id);
    const priceMap: Record<string, number> = {};
    await Promise.all(
      holdings.map(async (h) => {
        try {
          const q = await getCachedQuote(source, h.ticker, h.market);
          if (q?.price) priceMap[h.stockId] = q.price;
        } catch {
          // 개별 종목 시세 실패는 무시(매입가 기준으로 degrade)
        }
      }),
    );

    let usdKrw = 0;
    try {
      const indices = await getMarketIndices();
      usdKrw = indices.find((i) => i.key === 'usdkrw')?.value ?? 0;
    } catch {
      // 환율 실패 시 USD 평가 보류
    }

    const summary = summarizePortfolio(holdings, priceMap, realized, usdKrw);
    return NextResponse.json({
      evalPnl: summary.krwUnified.evalPnl,
      evalRate: summary.krwUnified.evalRate,
      realizedPnl: summary.krwUnified.realizedPnl,
      holdingsCount: holdings.length,
      pricedCount: Object.keys(priceMap).length,
      fxReady: usdKrw > 0,
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
