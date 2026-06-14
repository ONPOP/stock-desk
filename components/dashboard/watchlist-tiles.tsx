'use client';

// 대시보드 내 종목 타일 (B) — 워치리스트 행마다 실시간 시세 폴링(useQuote). 등락 빨강/파랑.
import Link from 'next/link';
import { Star, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/ui/company-logo';
import { useQuote } from '@/lib/hooks/use-quote';
import { formatMoney } from '@/lib/utils/money';
import type { WatchlistItem } from '@/types';

function changeColor(c: number): string {
  if (c > 0) return 'text-up';
  if (c < 0) return 'text-down';
  return 'text-muted-foreground';
}

function Row({ item }: { item: WatchlistItem }) {
  const { quote, error } = useQuote(item.ticker, item.market);
  const name = item.name_kr ?? item.name_en ?? item.ticker;

  return (
    <Link
      href={`/stocks/${item.ticker}?market=${item.market}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
    >
      <CompanyLogo ticker={item.ticker} name={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {item.market}
          </Badge>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{item.ticker}</span>
      </div>
      <div className="text-right">
        {error || !quote ? (
          <span className="text-xs text-muted-foreground">{error ? '시세 실패' : '…'}</span>
        ) : (
          <>
            <div className="text-sm font-semibold tabular-nums">{formatMoney(quote.price, quote.currency)}</div>
            <div className={`text-xs font-medium tabular-nums ${changeColor(quote.change)}`}>
              {quote.change > 0 ? '+' : ''}
              {quote.changeRate}%
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

export function WatchlistTiles({ items }: { items: WatchlistItem[] }) {
  return (
    <Card className="gap-0 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Star className="size-4" />
        </span>
        <h3 className="font-semibold">내 종목</h3>
        <span className="text-xs text-muted-foreground">{items.length}종목 · 5초 폴링</span>
        <Link href="/stocks" className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
          전체보기 <ChevronRight className="size-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">등록한 종목이 없습니다.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map((i) => (
            <Row key={i.stock_id} item={i} />
          ))}
        </div>
      )}
    </Card>
  );
}
