'use client';

// 워치리스트 종목 카드 — 실시간 시세 폴링(F3), 등락 색상(상승 빨강·하락 파랑), 즐겨찾기 토글,
// 보유 시 평가손익·수익률, 같은 묶음 내 드래그 정렬(@dnd-kit), 상세 이동, 삭제.
import { useEffect } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Star, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/ui/company-logo';
import { useQuote } from '@/lib/hooks/use-quote';
import { formatMoney } from '@/lib/utils/money';
import { evalHolding } from '@/lib/utils/portfolio';
import type { RealHolding, WatchlistItem } from '@/types';

interface WatchlistCardProps {
  /** dnd 정렬용 유일 id — 묶음 접두어로 즐겨찾기/시장 중복 표시를 구분(`fav:<stockId>` 등) */
  sortId: string;
  item: WatchlistItem;
  holding: RealHolding | null;
  onRemove: (stockId: string) => void;
  onToggleFavorite: (stockId: string, value: boolean) => void;
  onPrice: (stockId: string, priceMinor: number) => void;
}

function changeColor(change: number): string {
  if (change > 0) return 'text-up';
  if (change < 0) return 'text-down';
  return 'text-muted-foreground';
}

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}

function signed(n: number, currency: WatchlistItem['currency']): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatMoney(n, currency)}`;
}

export function WatchlistCard({ sortId, item, holding, onRemove, onToggleFavorite, onPrice }: WatchlistCardProps) {
  const { quote, error, loading } = useQuote(item.ticker, item.market);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });

  // 보유 종목 평가용으로 현재가를 매니저에 보고(요약바·도넛 합산)
  useEffect(() => {
    if (quote) onPrice(item.stock_id, quote.price);
  }, [quote, item.stock_id, onPrice]);

  const ev = holding && quote ? evalHolding(holding, quote.price) : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="relative gap-0 p-4 ring-border/70 transition-shadow hover:shadow-md"
    >
      <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
        <Button
          size="icon-xs"
          variant="ghost"
          className={item.isFavorite ? 'text-amber-500' : 'text-muted-foreground'}
          aria-label={item.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          aria-pressed={item.isFavorite}
          onClick={() => onToggleFavorite(item.stock_id, !item.isFavorite)}
        >
          <Star className={item.isFavorite ? 'fill-current' : ''} />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={`${item.name_kr ?? item.ticker} 삭제`}
          onClick={() => onRemove(item.stock_id)}
        >
          <X />
        </Button>
      </div>

      <div className="flex items-start gap-1.5 pr-14">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <Link href={`/stocks/${item.ticker}?market=${item.market}`} className="block min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <CompanyLogo ticker={item.ticker} name={item.name_kr ?? item.name_en} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{item.name_kr ?? item.name_en ?? item.ticker}</span>
                <Badge variant="secondary" className="shrink-0">{item.market}</Badge>
              </div>
              <p className="font-mono text-[11.5px] text-muted-foreground">{item.ticker}</p>
            </div>
          </div>

          <div className="mt-3">
            {loading && !quote ? (
              <Skeleton className="h-7 w-28" />
            ) : error ? (
              <p className="text-sm text-muted-foreground">시세 불러오기 실패</p>
            ) : quote ? (
              <>
                <p className="text-xl font-bold tabular-nums">{formatMoney(quote.price, quote.currency)}</p>
                <p className={`text-sm font-medium tabular-nums ${changeColor(quote.change)}`}>
                  {signed(quote.change, quote.currency)} ({quote.change > 0 ? '+' : ''}
                  {quote.changeRate}%)
                </p>
              </>
            ) : null}
          </div>

          {ev && holding && (
            <div className="mt-2.5 flex items-center justify-between rounded-lg bg-secondary/50 px-2.5 py-1.5">
              <span className="text-[11px] text-muted-foreground">{holding.qty.toLocaleString()}주 보유</span>
              <span className={`text-xs font-semibold tabular-nums ${pnlColor(ev.evalPnl)}`}>
                {signed(ev.evalPnl, item.currency)} ({ev.evalRate > 0 ? '+' : ''}
                {ev.evalRate}%)
              </span>
            </div>
          )}
        </Link>
      </div>
    </Card>
  );
}
