'use client';

// 내 종목 관리 (F3 + V2) — 검색 등록 + 거래소별 그룹 + 즐겨찾기 섹션(중복 표시) + 같은 묶음 내 드래그 정렬.
// 보유 종목은 카드에 평가손익, 하단 고정 요약바에 포트폴리오 통합(통화 하이브리드) + 자산배분 도넛.
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { Badge } from '@/components/ui/badge';
import { StockSearch } from './stock-search';
import { WatchlistCard } from './watchlist-card';
import { PortfolioSummaryBar, type AllocationSlice } from './portfolio-summary-bar';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { computeHoldings, computeRealized, evalHolding, summarizePortfolio } from '@/lib/utils/portfolio';
import type { Market, RealHolding, RealTrade, StockSearchResult, WatchlistItem } from '@/types';

// 즐겨찾기 → 거래소 고정 순서(SYSTEM_STATE 명세)
const MARKET_ORDER: Market[] = ['KOSPI', 'NASDAQ', 'KOSDAQ', 'NYSE', 'AMEX'];
const FAV_BUCKET = 'fav';

const sid = (bucket: string, stockId: string) => `${bucket}:${stockId}`;
const parseSid = (id: string): { bucket: string; stockId: string } => {
  const i = id.indexOf(':');
  return { bucket: id.slice(0, i), stockId: id.slice(i + 1) };
};

/** USD(센트)·KRW(원) 평가금액을 원화로 환산 */
function toKrw(currentValueMinor: number, currency: WatchlistItem['currency'], usdKrw: number): number {
  return currency === 'USD' ? Math.round((currentValueMinor / 100) * usdKrw) : currentValueMinor;
}

export function WatchlistManager({ initial, trades }: { initial: WatchlistItem[]; trades: RealTrade[] }) {
  const [items, setItems] = useState<WatchlistItem[]>(initial);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const { usdKrw, ready } = useUsdKrw();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const holdings = useMemo(() => computeHoldings(trades), [trades]);
  const realized = useMemo(() => computeRealized(trades), [trades]);
  const holdingByStock = useMemo(() => {
    const m = new Map<string, RealHolding>();
    for (const h of holdings) m.set(h.stockId, h);
    return m;
  }, [holdings]);

  const existingKeys = useMemo(() => new Set(items.map((i) => `${i.ticker}:${i.market}`)), [items]);

  const handlePrice = useCallback((stockId: string, priceMinor: number) => {
    setPriceMap((prev) => (prev[stockId] === priceMinor ? prev : { ...prev, [stockId]: priceMinor }));
  }, []);

  async function handleAdd(r: StockSearchResult) {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: r.ticker, market: r.market }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      setItems((prev) => (prev.some((i) => i.stock_id === data.item.stock_id) ? prev : [...prev, data.item]));
      toast.success(`${data.item.name_kr ?? data.item.ticker} 등록됨`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRemove(stockId: string) {
    const snapshot = items;
    setItems(items.filter((i) => i.stock_id !== stockId)); // 낙관적 제거
    try {
      const res = await fetch(`/api/watchlist?stock_id=${encodeURIComponent(stockId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setItems(snapshot);
      toast.error('삭제에 실패했습니다.');
    }
  }

  async function handleToggleFavorite(stockId: string, value: boolean) {
    const snapshot = items;
    setItems((prev) => prev.map((i) => (i.stock_id === stockId ? { ...i, isFavorite: value } : i)));
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite', stock_id: stockId, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(snapshot);
      toast.error('즐겨찾기 변경에 실패했습니다.');
    }
  }

  async function persistReorder(orderedStockIds: string[]) {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          orders: orderedStockIds.map((stock_id, idx) => ({ stock_id, sort_order: idx })),
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('정렬 저장에 실패했습니다.');
    }
  }

  // 묶음별 아이템(즐겨찾기/거래소) — sortOrder 순
  const buckets = useMemo(() => {
    const bySort = (a: WatchlistItem, b: WatchlistItem) => a.sortOrder - b.sortOrder || a.ticker.localeCompare(b.ticker);
    const favorites = items.filter((i) => i.isFavorite).sort(bySort);
    const byMarket = MARKET_ORDER.map((mkt) => ({
      market: mkt,
      list: items.filter((i) => i.market === mkt).sort(bySort),
    })).filter((g) => g.list.length > 0);
    return { favorites, byMarket };
  }, [items]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = parseSid(String(active.id));
    const o = parseSid(String(over.id));
    if (a.bucket !== o.bucket) return; // 다른 묶음 간 이동 금지

    const current =
      a.bucket === FAV_BUCKET
        ? buckets.favorites
        : (buckets.byMarket.find((g) => g.market === a.bucket)?.list ?? []);
    const oldIdx = current.findIndex((i) => i.stock_id === a.stockId);
    const newIdx = current.findIndex((i) => i.stock_id === o.stockId);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(current, oldIdx, newIdx);
    const orderById = new Map(reordered.map((i, idx) => [i.stock_id, idx]));
    setItems((prev) => prev.map((i) => (orderById.has(i.stock_id) ? { ...i, sortOrder: orderById.get(i.stock_id)! } : i)));
    void persistReorder(reordered.map((i) => i.stock_id));
  }

  const summary = useMemo(
    () => summarizePortfolio(holdings, priceMap, realized, ready ? usdKrw : 0),
    [holdings, priceMap, realized, ready, usdKrw],
  );

  const allocation = useMemo<AllocationSlice[]>(() => {
    return holdings
      .map((h) => {
        const price = priceMap[h.stockId];
        const value = price != null ? evalHolding(h, price).currentValue : h.buyAmount;
        return { name: h.name, value: toKrw(value, h.currency, ready ? usdKrw : 0) };
      })
      .filter((s) => s.value > 0);
  }, [holdings, priceMap, ready, usdKrw]);

  function renderBucket(bucketKey: string, list: WatchlistItem[]) {
    const ids = list.map((i) => sid(bucketKey, i.stock_id));
    return (
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {list.map((it) => (
            <WatchlistCard
              key={sid(bucketKey, it.stock_id)}
              sortId={sid(bucketKey, it.stock_id)}
              item={it}
              holding={holdingByStock.get(it.stock_id) ?? null}
              onRemove={handleRemove}
              onToggleFavorite={handleToggleFavorite}
              onPrice={handlePrice}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <StockSearch existingKeys={existingKeys} onAdd={handleAdd} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 종목이 없습니다. 위에서 검색해 추가하세요.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {buckets.favorites.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                <h2 className="text-sm font-semibold text-muted-foreground">즐겨찾기</h2>
                <Badge variant="secondary">{buckets.favorites.length}</Badge>
              </div>
              {renderBucket(FAV_BUCKET, buckets.favorites)}
            </section>
          )}

          {buckets.byMarket.map((g) => (
            <section key={g.market} className="mt-6 space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{g.market}</h2>
                <Badge variant="secondary">{g.list.length}</Badge>
              </div>
              {renderBucket(g.market, g.list)}
            </section>
          ))}
        </DndContext>
      )}

      {holdings.length > 0 && <PortfolioSummaryBar summary={summary} allocation={allocation} ready={ready} />}
    </div>
  );
}
