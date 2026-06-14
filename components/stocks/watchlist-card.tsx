'use client';

// 워치리스트 종목 카드 — 실시간 시세 폴링(F3+시세훅), 등락 색상(상승 빨강·하락 파랑), 상세 이동, 삭제.
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuote } from '@/lib/hooks/use-quote';
import { formatMoney } from '@/lib/utils/money';
import type { WatchlistItem } from '@/types';

interface WatchlistCardProps {
  item: WatchlistItem;
  onRemove: (stockId: string) => void;
}

function changeColor(change: number): string {
  if (change > 0) return 'text-red-500';
  if (change < 0) return 'text-blue-500';
  return 'text-muted-foreground';
}

function signed(n: number, currency: WatchlistItem['currency']): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatMoney(n, currency)}`;
}

export function WatchlistCard({ item, onRemove }: WatchlistCardProps) {
  const { quote, error, loading } = useQuote(item.ticker, item.market);

  return (
    <Card className="relative p-4">
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground"
        aria-label={`${item.name_kr ?? item.ticker} 삭제`}
        onClick={() => onRemove(item.stock_id)}
      >
        ✕
      </Button>
      <Link href={`/stocks/${item.ticker}?market=${item.market}`} className="block">
        <div className="flex items-center gap-2 pr-6">
          <span className="truncate font-semibold">{item.name_kr ?? item.name_en ?? item.ticker}</span>
          <Badge variant="secondary">{item.market}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{item.ticker}</p>

        <div className="mt-3">
          {loading && !quote ? (
            <Skeleton className="h-7 w-28" />
          ) : error ? (
            <p className="text-sm text-muted-foreground">시세 불러오기 실패</p>
          ) : quote ? (
            <>
              <p className="text-xl font-bold tabular-nums">{formatMoney(quote.price, quote.currency)}</p>
              <p className={`text-sm tabular-nums ${changeColor(quote.change)}`}>
                {signed(quote.change, quote.currency)} ({quote.change > 0 ? '+' : ''}
                {quote.changeRate}%)
              </p>
            </>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
