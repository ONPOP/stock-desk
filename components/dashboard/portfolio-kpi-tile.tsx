'use client';

// 대시보드 KPI 4번째 타일 — 실거래 포트폴리오 요약(원화 환산 평가금액 + 평가손익률).
// 보유 종목 시세를 각각 폴링(PricePoller)해 summarizePortfolio로 통합. KOSPI 타일을 대체.
import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useQuote } from '@/lib/hooks/use-quote';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { summarizePortfolio } from '@/lib/utils/portfolio';
import { formatCompactMoney } from '@/lib/utils/money';
import type { Market, RealHolding, RealizedTrade } from '@/types';

/** 보유 1종목 시세를 폴링해 부모에 보고만 하는 무표시 컴포넌트 */
function PricePoller({
  stockId,
  ticker,
  market,
  onPrice,
}: {
  stockId: string;
  ticker: string;
  market: Market;
  onPrice: (stockId: string, price: number) => void;
}) {
  const { quote } = useQuote(ticker, market, { intervalMs: 15_000 });
  useEffect(() => {
    if (quote) onPrice(stockId, quote.price);
  }, [quote, stockId, onPrice]);
  return null;
}

export function PortfolioKpiTile({ holdings, realized }: { holdings: RealHolding[]; realized: RealizedTrade[] }) {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const { usdKrw, ready } = useUsdKrw();

  const handlePrice = useCallback((stockId: string, price: number) => {
    setPriceMap((prev) => (prev[stockId] === price ? prev : { ...prev, [stockId]: price }));
  }, []);

  const summary = summarizePortfolio(holdings, priceMap, realized, ready ? usdKrw : 0);
  const u = summary.krwUnified;
  const color = u.evalPnl > 0 ? 'text-up' : u.evalPnl < 0 ? 'text-down' : 'text-muted-foreground';

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      {holdings.map((h) => (
        <PricePoller key={h.stockId} stockId={h.stockId} ticker={h.ticker} market={h.market} onPrice={handlePrice} />
      ))}
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Wallet className="size-4" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">내 포트폴리오</span>
      </div>
      {holdings.length === 0 ? (
        <>
          <span className="text-2xl font-bold tabular-nums">—</span>
          <span className="text-sm text-muted-foreground">보유 종목 없음</span>
        </>
      ) : (
        <>
          <span className="truncate text-2xl font-bold tabular-nums">{formatCompactMoney(u.currentValue, 'KRW')}</span>
          <span className={`text-sm font-medium tabular-nums ${color}`}>
            평가 {u.evalPnl > 0 ? '+' : ''}
            {u.evalRate}%
            {u.realizedPnl !== 0 && (
              <span className="text-muted-foreground"> · 실현 {formatCompactMoney(u.realizedPnl, 'KRW')}</span>
            )}
          </span>
        </>
      )}
    </div>
  );
}
