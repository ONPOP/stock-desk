'use client';

// 워치리스트 종목 카드 — 실시간 시세 폴링(F3), 등락 색상(상승 빨강·하락 파랑), 즐겨찾기 토글,
// 보유 시 평가손익·수익률, 같은 묶음 내 드래그 정렬(@dnd-kit), 상세 이동, 삭제.
import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS, useCombinedRefs } from '@dnd-kit/utilities';
import { Crosshair, GripVertical, Megaphone, Star, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/ui/company-logo';
import { useQuote } from '@/lib/hooks/use-quote';
import { useInViewport } from '@/lib/hooks/use-in-viewport';
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
  /** 분석 엔진(D16) 플래그 토글 — 항상 브리핑 / 관찰 고정 */
  onToggleEngineFlag: (stockId: string, flag: 'always_brief' | 'radar_pin', value: boolean) => void;
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

export function WatchlistCard({
  sortId,
  item,
  holding,
  onRemove,
  onToggleFavorite,
  onToggleEngineFlag,
  onPrice,
}: WatchlistCardProps) {
  const [viewportRef, visible] = useInViewport<HTMLDivElement>();
  const { quote, error, loading } = useQuote(item.ticker, item.market, { enabled: visible });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });

  // dnd-kit의 정렬용 ref와 가시성 관측용 ref를 같은 루트 엘리먼트에 함께 건다.
  // setNodeRef는 useSortable 내부에서 이미 안정적인 참조(useCombinedRefs 위에 useCallback([],[])로
  // 구축)이므로, 우리 쪽 콜백도 같은 방식(useCallback([]))으로 안정화한 뒤 dnd-kit이 자기 자신을
  // 합성할 때 쓰는 useCombinedRefs로 묶는다 — 매 렌더 새 함수를 만들면(예: 인라인 화살표) React가
  // ref 콜백 아이덴티티 변경으로 보고 매번 null→node로 재등록해 dnd-kit의 ResizeObserver가
  // unobserve/observe를 반복한다(폴링마다 재렌더되는 카드에서 특히 비용이 큼).
  const setViewportNode = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
    },
    [viewportRef],
  );
  const setRootRef = useCombinedRefs(setNodeRef, setViewportNode);

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
      ref={setRootRef}
      style={style}
      className="relative gap-0 p-4 ring-border/70 transition-shadow hover:shadow-md"
    >
      <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
        <Button
          size="icon-xs"
          variant="ghost"
          className={item.alwaysBrief ? 'text-emerald-500' : 'text-muted-foreground/50'}
          aria-label={item.alwaysBrief ? '항상 브리핑 해제' : '항상 브리핑에 포함'}
          aria-pressed={item.alwaysBrief}
          title="분석 리포트에 항상 포함"
          onClick={() => onToggleEngineFlag(item.stock_id, 'always_brief', !item.alwaysBrief)}
        >
          <Megaphone className={item.alwaysBrief ? 'fill-current' : ''} />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={item.radarPin ? 'text-sky-500' : 'text-muted-foreground/50'}
          aria-label={item.radarPin ? '관찰 고정 해제' : '눌림목 관찰에 고정'}
          aria-pressed={item.radarPin}
          title="눌림목 관찰 표에 고정"
          onClick={() => onToggleEngineFlag(item.stock_id, 'radar_pin', !item.radarPin)}
        >
          <Crosshair />
        </Button>
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
