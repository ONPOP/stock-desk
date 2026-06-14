'use client';

// 내 종목 관리 (F3) — 검색 등록 + 그룹별 워치리스트 그리드. 낙관적 업데이트 + 실패 롤백.
// [재설계] 그룹 헤더 비주얼만. [보존] handleAdd/handleRemove fetch·낙관적 업데이트·groups 메모·props.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { StockSearch } from './stock-search';
import { WatchlistCard } from './watchlist-card';
import type { StockSearchResult, WatchlistItem } from '@/types';

export function WatchlistManager({ initial }: { initial: WatchlistItem[] }) {
  const [items, setItems] = useState<WatchlistItem[]>(initial);

  const existingKeys = useMemo(
    () => new Set(items.map((i) => `${i.ticker}:${i.market}`)),
    [items],
  );

  async function handleAdd(r: StockSearchResult) {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: r.ticker, market: r.market }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      setItems((prev) =>
        prev.some((i) => i.stock_id === data.item.stock_id) ? prev : [...prev, data.item],
      );
      toast.success(`${data.item.name_kr ?? data.item.ticker} 등록됨`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRemove(stockId: string) {
    const snapshot = items;
    setItems(items.filter((i) => i.stock_id !== stockId)); // 낙관적 제거
    try {
      const res = await fetch(`/api/watchlist?stock_id=${encodeURIComponent(stockId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(snapshot); // 롤백
      toast.error('삭제에 실패했습니다.');
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, WatchlistItem[]>();
    for (const it of items) {
      const list = map.get(it.group_name) ?? [];
      list.push(it);
      map.set(it.group_name, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="space-y-6">
      <StockSearch existingKeys={existingKeys} onAdd={handleAdd} />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          등록된 종목이 없습니다. 위에서 검색해 추가하세요.
        </p>
      ) : (
        groups.map(([group, list]) => (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{group}</h2>
              <Badge variant="secondary">{list.length}</Badge>
            </div>
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {list.map((it) => (
                <WatchlistCard key={it.stock_id} item={it} onRemove={handleRemove} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
