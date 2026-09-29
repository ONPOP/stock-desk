'use client';

// 이번 달 목표 수익률 (D21) — 시작 금액·목표 금액·실현 수익률·달성률·남은 금액.
// 달성률은 실현손익 기준이고, 보유 종목 평가손익을 더한 수익률은 참고로만 보여준다.
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PricePoller } from '@/components/stocks/price-poller';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { evalHolding } from '@/lib/utils/portfolio';
import { formatMoney } from '@/lib/utils/money';
import type { MonthGoalProgress, RealHolding } from '@/types';

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signed(n: number, suffix = ''): string {
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}
function signedKrw(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, 'KRW')}`;
}

function Row({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className ?? ''}`}>{value}</span>
    </div>
  );
}

export function MonthGoalCard({
  progress,
  holdings,
  fxPending = false,
  showLink = true,
}: {
  progress: MonthGoalProgress | null;
  holdings: RealHolding[];
  fxPending?: boolean;
  /** 대시보드에서만 투자 기록 탭 링크를 보인다 */
  showLink?: boolean;
}) {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const { usdKrw, ready } = useUsdKrw();
  const handlePrice = useCallback((stockId: string, price: number) => {
    setPriceMap((prev) => (prev[stockId] === price ? prev : { ...prev, [stockId]: price }));
  }, []);

  // 참고: 보유 종목 평가손익(₩환산) — 시세를 받은 종목만 합산
  let evalPnl = 0;
  for (const h of holdings) {
    const price = priceMap[h.stockId];
    if (price == null) continue;
    const pnl = evalHolding(h, price).evalPnl;
    evalPnl += h.currency === 'USD' ? Math.round((pnl / 100) * (ready ? usdKrw : 0)) : pnl;
  }

  const month = progress?.month ?? '';
  const monthLabel = month ? `${Number(month.slice(5))}월` : '이번 달';
  const g = progress?.goal ?? null;
  const start = progress?.startAmount ?? 0;
  const realized = progress?.record.realized ?? 0;
  const withEvalPct = start > 0 ? Math.round(((realized + evalPnl) / start) * 10_000) / 100 : 0;
  const bar = g ? Math.max(0, Math.min(100, g.achievementPct)) : 0;

  return (
    <Card className="gap-3 p-4">
      {holdings.map((h) => (
        <PricePoller key={h.stockId} stockId={h.stockId} ticker={h.ticker} market={h.market} onPrice={handlePrice} />
      ))}
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Target className="size-4" />
        </span>
        <h3 className="font-semibold">{monthLabel} 목표 수익률</h3>
        {showLink && (
          <Link href="/journal?tab=goals" className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            목표 관리 <ChevronRight className="size-3" />
          </Link>
        )}
      </div>

      {!progress ? (
        <p className="py-6 text-center text-sm text-muted-foreground">목표 기록을 불러오지 못했습니다.</p>
      ) : (
        <>
          {g ? (
            <div className="rounded-xl border bg-secondary/40 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">달성률</span>
                <span className={`text-2xl font-bold tabular-nums ${g.achieved ? 'text-up' : ''}`}>{g.achievementPct}%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={bar}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="목표 달성률"
              >
                <div className={`h-full rounded-full ${g.achieved ? 'bg-up' : 'bg-primary'}`} style={{ width: `${bar}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {g.achieved ? '이번 달 목표를 달성했습니다 🎉' : `목표까지 ${formatMoney(g.remaining, 'KRW')} 남음`}
              </p>
            </div>
          ) : (
            <Link
              href="/journal?tab=goals"
              className="rounded-xl border border-dashed py-4 text-center text-sm text-muted-foreground hover:bg-muted/50"
            >
              월 목표 수익률을 설정하면 달성률이 표시됩니다
            </Link>
          )}

          <div className="divide-y divide-border/60">
            <Row label="시작 금액" value={formatMoney(start, 'KRW')} />
            {g && (
              <Row
                label={`목표 금액 (월 ${g.ratePct}%${Number(g.ratePct) !== g.requiredRatePct ? ` · 이번 달 필요 ${g.requiredRatePct}%` : ''})`}
                value={formatMoney(g.targetAmount, 'KRW')}
              />
            )}
            <Row
              label="실현 수익률"
              value={`${signed(progress.realizedRatePct, '%')} (${signedKrw(realized)})`}
              className={pnlColor(realized)}
            />
            {holdings.length > 0 && (
              <Row
                label="평가손익 포함 (참고)"
                value={`${signed(withEvalPct, '%')} (${signedKrw(realized + evalPnl)})`}
                className={`${pnlColor(realized + evalPnl)} opacity-80`}
              />
            )}
          </div>
          {fxPending && (
            <p className="text-[11px] text-muted-foreground">환율을 불러오지 못해 달러 금액이 빠져 있습니다. 잠시 후 새로고침하세요.</p>
          )}
        </>
      )}
    </Card>
  );
}
