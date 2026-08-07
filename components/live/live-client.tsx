'use client';

// 실시간 탭 오케스트레이터 (D15) — 좌: 관심종목 / 중: 시세 헤더+분봉 차트 / 우: 호가+빠른 주문 / 하: 자동매매 패널.
// UI 레퍼런스: HTS형 3단 레이아웃. 시세는 REST 폴링(D3), 호가는 3초 폴링.
import { useState } from 'react';
import { PriceChart } from '@/components/stocks/price-chart';
import { OrderbookPanel } from '@/components/live/orderbook-panel';
import { QuickOrder } from '@/components/live/quick-order';
import { AutoTradePanel } from '@/components/live/auto-trade-panel';
import { useQuote } from '@/lib/hooks/use-quote';
import { useInViewport } from '@/lib/hooks/use-in-viewport';
import { useRealtimeQuote } from '@/lib/hooks/use-realtime-quote';
import { RealtimeProvider } from '@/lib/realtime/provider';
import { formatMoney, formatCompactMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import type { AutoTradingConfig, TradeSignalRow, WatchlistItem } from '@/types';

function changeColor(change: number): string {
  return change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-muted-foreground';
}

function WatchRow({ item, selected, onSelect }: { item: WatchlistItem; selected: boolean; onSelect: () => void }) {
  const [ref, visible] = useInViewport<HTMLButtonElement>();
  const { quote } = useQuote(item.ticker, item.market, { enabled: visible });
  const name = item.name_kr ?? item.name_en ?? item.ticker;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors',
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-muted',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{name}</span>
        <span className="text-[11px] text-muted-foreground">{quote ? quote.volume.toLocaleString('ko-KR') : item.ticker}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-[13px] font-semibold tabular-nums">
          {quote ? formatMoney(quote.price, item.currency) : '—'}
        </span>
        <span className={cn('text-[11px] tabular-nums', quote ? changeColor(quote.change) : 'text-muted-foreground')}>
          {quote ? `${quote.change > 0 ? '+' : ''}${quote.changeRate}%` : ''}
        </span>
      </span>
    </button>
  );
}

function QuoteHeader({ item }: { item: WatchlistItem }) {
  // 선택 종목 → 실시간(high 우선). 릴레이 미가동 시 폴링 폴백.
  const { quote, source, realtime } = useRealtimeQuote(item.ticker, item.market, item.currency, { priority: 'high' });
  const name = item.name_kr ?? item.name_en ?? item.ticker;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-lg font-bold">{name}</h2>
      <span className="text-xs text-muted-foreground">
        {item.ticker} · {item.market}
      </span>
      {realtime && (
        <span className="inline-flex items-center gap-1 rounded-full bg-up/10 px-2 py-0.5 text-[10px] font-semibold text-up">
          <span className="size-1.5 animate-pulse rounded-full bg-up" /> 실시간
        </span>
      )}
      {quote && (
        <>
          <span className={cn('text-xl font-bold tabular-nums', changeColor(quote.change))}>
            {formatMoney(quote.price, item.currency)}
          </span>
          <span className={cn('text-sm tabular-nums', changeColor(quote.change))}>
            {quote.change > 0 ? '▲' : quote.change < 0 ? '▼' : ''}
            {formatMoney(Math.abs(quote.change), item.currency)} ({quote.changeRate}%)
          </span>
          <span className="text-xs text-muted-foreground">
            거래량 {quote.volume.toLocaleString('ko-KR')} · 거래대금{' '}
            {formatCompactMoney(quote.price * quote.volume, item.currency)} · {source}
          </span>
        </>
      )}
    </div>
  );
}

export function LiveClient({
  items,
  initialConfig,
  initialSignals,
}: {
  items: WatchlistItem[];
  initialConfig: AutoTradingConfig;
  initialSignals: TradeSignalRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.stock_id ?? null);
  const selected = items.find((i) => i.stock_id === selectedId) ?? null;

  if (items.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        관심목록에 국내 종목이 없습니다. <span className="font-medium">내 종목</span> 탭에서 국내(KOSPI/KOSDAQ) 종목을 먼저
        추가해주세요.
      </p>
    );
  }

  return (
    <RealtimeProvider>
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_260px]">
        {/* 좌: 관심종목 (국내) */}
        <aside className="rounded-xl border bg-card p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">관심종목</p>
          <div className="flex max-h-[560px] flex-col gap-0.5 overflow-y-auto">
            {items.map((item) => (
              <WatchRow
                key={item.stock_id}
                item={item}
                selected={item.stock_id === selectedId}
                onSelect={() => setSelectedId(item.stock_id)}
              />
            ))}
          </div>
        </aside>

        {/* 중: 시세 헤더 + 차트 */}
        <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
          {selected && (
            <>
              <QuoteHeader item={selected} />
              <PriceChart
                key={selected.stock_id}
                ticker={selected.ticker}
                market={selected.market}
                currency={selected.currency}
                initialPeriodLabel="1일"
                initialIndicators={{ vwap: true, rsi: true, macd: true }}
              />
            </>
          )}
        </section>

        {/* 우: 호가 + 빠른 주문 */}
        <aside className="space-y-3">
          {selected && (
            <>
              <OrderbookPanel ticker={selected.ticker} />
              <QuickOrder item={selected} />
            </>
          )}
        </aside>
      </div>

      {/* 하: 자동매매 컨트롤 + 시그널 로그 + 백테스트 */}
      <AutoTradePanel items={items} initialConfig={initialConfig} initialSignals={initialSignals} selected={selected} />
    </div>
    </RealtimeProvider>
  );
}
