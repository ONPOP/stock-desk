'use client';

// 내 종목 관리 (F3 + V2) — 탭(컬렉션)별 종목 관리 + 검색 등록 + 거래소별 그룹 + 즐겨찾기 섹션 + 같은 묶음 내 드래그 정렬.
// 첫 탭은 기본 탭(삭제·이름변경 불가), 이후 사용자 탭을 만들어 탭별로 종목을 등록/삭제한다.
// 보유 종목은 카드에 평가손익, 하단 고정 요약바에 포트폴리오 통합(통화 하이브리드) + 자산배분 도넛.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Skeleton } from '@/components/ui/skeleton';
import { StockSearch } from './stock-search';
import { WatchlistCard } from './watchlist-card';
import { WatchlistTabs } from './watchlist-tabs';
import { WatchlistDialog, type DialogMode } from './watchlist-dialog';
import { PortfolioSummaryBar, type AllocationSlice } from './portfolio-summary-bar';
import { GradeFilterChips } from './grade-filter-chips';
import { StockGradeDialog, type GradeTarget } from './stock-grade-dialog';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { computeHoldings, computeRealized, evalHolding, summarizePortfolio } from '@/lib/utils/portfolio';
import { countByGrade, filterByGrade, toggleGradeFilter } from '@/lib/utils/stock-grade';
import type {
  GradeFilter,
  Market,
  RealHolding,
  RealTrade,
  StockGrade,
  StockSearchResult,
  UserStockGrade,
  WatchlistItem,
  WatchlistTab,
} from '@/types';

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

interface WatchlistManagerProps {
  tabs: WatchlistTab[];
  activeId: string;
  initial: WatchlistItem[];
  trades: RealTrade[];
  /** 종목 단위 사용자 등급(D22) — 탭과 무관, stock_id 키 */
  grades: Record<string, UserStockGrade>;
}

export function WatchlistManager({
  tabs: initialTabs,
  activeId: initialActiveId,
  initial,
  trades,
  grades: initialGrades,
}: WatchlistManagerProps) {
  const [tabs, setTabs] = useState<WatchlistTab[]>(initialTabs);
  // 뒤로가기로 돌아오면 서버 props가 아니라 URL이 진짜 상태다 — 라우터 캐시가 이전 payload를 그대로
  // 되돌려줘도(=activeId prop이 기본 탭) 주소의 ?w= 를 우선해 보던 탭을 복원한다.
  const urlTabId = useSearchParams().get('w');
  const [activeId, setActiveId] = useState<string>(
    urlTabId && initialTabs.some((t) => t.id === urlTabId) ? urlTabId : initialActiveId,
  );
  // 탭별 종목 캐시 — 탭 전환 시 재요청 최소화. 기본 탭은 서버에서 받은 initial로 시드.
  const [itemsByTab, setItemsByTab] = useState<Record<string, WatchlistItem[]>>({ [initialActiveId]: initial });
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  // 등급은 종목 단위라 탭 캐시(itemsByTab)와 분리 보관 — 한 탭에서 바꾸면 모든 탭 카드에 즉시 반영된다.
  const [grades, setGrades] = useState<Record<string, UserStockGrade>>(initialGrades);
  const [gradeFilter, setGradeFilter] = useState<Set<GradeFilter>>(new Set());
  const [gradeTarget, setGradeTarget] = useState<GradeTarget | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());
  const { usdKrw, ready } = useUsdKrw();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const items = useMemo(() => itemsByTab[activeId] ?? [], [itemsByTab, activeId]);
  const tabLoaded = activeId in itemsByTab;
  const gradeCounts = useMemo(() => countByGrade(items, grades), [items, grades]);
  const visibleItems = useMemo(() => filterByGrade(items, grades, gradeFilter), [items, grades, gradeFilter]);

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

  // 활성 탭 종목 갱신 헬퍼
  const setActiveItems = useCallback(
    (updater: (prev: WatchlistItem[]) => WatchlistItem[]) => {
      setItemsByTab((m) => ({ ...m, [activeId]: updater(m[activeId] ?? []) }));
    },
    [activeId],
  );

  const ensureItems = useCallback(async (id: string) => {
    if (fetchingRef.current.has(id)) return;
    fetchingRef.current.add(id);
    try {
      const res = await fetch(`/api/watchlist?watchlist_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '종목을 불러오지 못했습니다.');
      setItemsByTab((m) => ({ ...m, [id]: data.items ?? [] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      fetchingRef.current.delete(id);
    }
  }, []);

  // 활성 탭에 아직 목록이 없으면 불러온다. 탭 클릭뿐 아니라 '뒤로가기로 돌아와 URL이 지정한 탭'도
  // 여기서 처리된다 — 클릭 경로에만 로딩을 붙이면 복원된 탭이 스켈레톤에서 멈춘다.
  useEffect(() => {
    if (!(activeId in itemsByTab)) void ensureItems(activeId);
  }, [activeId, itemsByTab, ensureItems]);

  function selectTab(id: string) {
    setActiveId(id);
    // 주소에 남겨야 종목 상세로 갔다가 뒤로 왔을 때 이 탭으로 복원된다.
    // router.replace가 아니라 history API를 쓰는 이유: 탭 전환마다 RSC를 다시 받아올 필요가 없다.
    const url = new URL(window.location.href);
    url.searchParams.set('w', id);
    window.history.replaceState(null, '', url);
  }

  async function handleAdd(r: StockSearchResult) {
    const targetId = activeId;
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist_id: targetId, ticker: r.ticker, market: r.market }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      setItemsByTab((m) => {
        const list = m[targetId] ?? [];
        if (list.some((i) => i.stock_id === data.item.stock_id)) return m;
        return { ...m, [targetId]: [...list, data.item] };
      });
      toast.success(`${data.item.name_kr ?? data.item.ticker} 등록됨`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRemove(stockId: string) {
    const targetId = activeId;
    const snapshot = itemsByTab[targetId] ?? [];
    setActiveItems((prev) => prev.filter((i) => i.stock_id !== stockId)); // 낙관적 제거
    try {
      const res = await fetch(
        `/api/watchlist?watchlist_id=${encodeURIComponent(targetId)}&stock_id=${encodeURIComponent(stockId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error();
    } catch {
      setItemsByTab((m) => ({ ...m, [targetId]: snapshot }));
      toast.error('삭제에 실패했습니다.');
    }
  }

  async function handleToggleFavorite(stockId: string, value: boolean) {
    const targetId = activeId;
    const snapshot = itemsByTab[targetId] ?? [];
    setActiveItems((prev) => prev.map((i) => (i.stock_id === stockId ? { ...i, isFavorite: value } : i)));
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite', watchlist_id: targetId, stock_id: stockId, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItemsByTab((m) => ({ ...m, [targetId]: snapshot }));
      toast.error('즐겨찾기 변경에 실패했습니다.');
    }
  }

  /** 분석 엔진 플래그 — 탭과 무관하게 종목 단위로 적용되므로 모든 탭의 같은 종목을 함께 갱신한다 */
  async function handleToggleEngineFlag(
    stockId: string,
    flag: 'always_brief' | 'radar_pin',
    value: boolean,
  ) {
    const key = flag === 'always_brief' ? 'alwaysBrief' : 'radarPin';
    const snapshot = itemsByTab;
    setItemsByTab((m) =>
      Object.fromEntries(
        Object.entries(m).map(([tab, list]) => [
          tab,
          list.map((i) => (i.stock_id === stockId ? { ...i, [key]: value } : i)),
        ]),
      ),
    );
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'engineFlag', stock_id: stockId, flag, value }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        flag === 'always_brief'
          ? value
            ? '항상 브리핑에 포함합니다.'
            : '항상 브리핑을 해제했습니다.'
          : value
            ? '관찰 표에 고정했습니다.'
            : '관찰 고정을 해제했습니다.',
      );
    } catch {
      setItemsByTab(snapshot);
      toast.error('분석 설정 변경에 실패했습니다.');
    }
  }

  function openGradeDialog(stockId: string) {
    const it = items.find((i) => i.stock_id === stockId);
    if (!it) return;
    setGradeTarget({ stockId, name: it.name_kr ?? it.ticker, current: grades[stockId] ?? null });
  }

  /** 실패 시 throw — 모달이 닫히지 않고 남아 재시도할 수 있다 */
  async function saveGrade(stockId: string, grade: StockGrade, reason: string | null) {
    const snapshot = grades;
    setGrades((m) => ({ ...m, [stockId]: { stockId, grade, reason, gradedAt: new Date().toISOString() } }));
    try {
      const res = await fetch('/api/stock-grades', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_id: stockId, grade, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등급 저장에 실패했습니다.');
      setGrades((m) => ({ ...m, [stockId]: data.grade as UserStockGrade }));
      toast.success(`${grade}등급으로 지정했습니다.`);
    } catch (e) {
      setGrades(snapshot);
      toast.error((e as Error).message);
      throw e;
    }
  }

  async function clearGrade(stockId: string) {
    const snapshot = grades;
    setGrades((m) => {
      const n = { ...m };
      delete n[stockId];
      return n;
    });
    try {
      const res = await fetch(`/api/stock-grades?stock_id=${encodeURIComponent(stockId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('등급을 해제했습니다.');
    } catch (e) {
      setGrades(snapshot);
      toast.error('등급 해제에 실패했습니다.');
      throw e;
    }
  }

  async function persistReorder(orderedStockIds: string[]) {
    const targetId = activeId;
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          watchlist_id: targetId,
          orders: orderedStockIds.map((stock_id, idx) => ({ stock_id, sort_order: idx })),
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('정렬 저장에 실패했습니다.');
    }
  }

  // ── 탭 CRUD ──
  async function createTab(name: string) {
    const res = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? '탭 생성에 실패했습니다.');
      throw new Error(data.error ?? 'create failed');
    }
    const tab = data.watchlist as WatchlistTab;
    setTabs((t) => [...t, tab]);
    setItemsByTab((m) => ({ ...m, [tab.id]: [] }));
    setActiveId(tab.id);
    toast.success(`'${tab.name}' 추가됨`);
  }

  async function renameTab(id: string, name: string) {
    const prev = tabs;
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, name } : x)));
    const res = await fetch('/api/watchlists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', id, name }),
    });
    if (!res.ok) {
      setTabs(prev);
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? '이름 변경에 실패했습니다.');
      throw new Error('rename failed');
    }
  }

  async function deleteTab(id: string) {
    const res = await fetch(`/api/watchlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? '삭제에 실패했습니다.');
      throw new Error('delete failed');
    }
    setItemsByTab((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    if (activeId === id) {
      const fallback = tabs.find((t) => t.isDefault) ?? tabs.find((t) => t.id !== id);
      if (fallback) selectTab(fallback.id);
    }
    setTabs((t) => t.filter((x) => x.id !== id));
    toast.success('삭제되었습니다.');
  }

  async function handleSaveName(name: string, mode: Extract<DialogMode, { kind: 'create' | 'rename' }>) {
    if (mode.kind === 'create') await createTab(name);
    else await renameTab(mode.id, name);
  }

  // 묶음별 아이템(즐겨찾기/거래소) — sortOrder 순
  const buckets = useMemo(() => {
    const bySort = (a: WatchlistItem, b: WatchlistItem) =>
      a.sortOrder - b.sortOrder || a.ticker.localeCompare(b.ticker);
    const favorites = visibleItems.filter((i) => i.isFavorite).sort(bySort);
    const byMarket = MARKET_ORDER.map((mkt) => ({
      market: mkt,
      list: visibleItems.filter((i) => i.market === mkt).sort(bySort),
    })).filter((g) => g.list.length > 0);
    return { favorites, byMarket };
  }, [visibleItems]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // 걸러진 일부만 0..n으로 저장하면 숨은 종목과 sort_order가 겹친다 — 필터 중에는 정렬하지 않는다
    if (gradeFilter.size > 0) {
      toast.info('등급 필터를 해제한 뒤 순서를 바꿀 수 있습니다.');
      return;
    }
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
    setActiveItems((prev) =>
      prev.map((i) => (orderById.has(i.stock_id) ? { ...i, sortOrder: orderById.get(i.stock_id)! } : i)),
    );
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
              onToggleEngineFlag={handleToggleEngineFlag}
              onPrice={handlePrice}
              userGrade={grades[it.stock_id] ?? null}
              onEditGrade={openGradeDialog}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <WatchlistTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={selectTab}
        onCreate={() => setDialog({ kind: 'create' })}
        onRename={(tab) => setDialog({ kind: 'rename', id: tab.id, initialName: tab.name })}
        onDelete={(tab) => setDialog({ kind: 'delete', id: tab.id, name: tab.name })}
      />

      <StockSearch existingKeys={existingKeys} onAdd={handleAdd} />

      {tabLoaded && items.length > 0 && (
        <GradeFilterChips
          selected={gradeFilter}
          counts={gradeCounts}
          onToggle={(f) => setGradeFilter((s) => toggleGradeFilter(s, f))}
          onClear={() => setGradeFilter(new Set())}
        />
      )}

      {!tabLoaded ? (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 탭에 등록된 종목이 없습니다. 위에서 검색해 추가하세요.</p>
      ) : visibleItems.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>선택한 등급의 종목이 없습니다.</span>
          <button type="button" className="underline" onClick={() => setGradeFilter(new Set())}>
            전체 보기
          </button>
        </div>
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

      <WatchlistDialog mode={dialog} onClose={() => setDialog(null)} onSaveName={handleSaveName} onDelete={deleteTab} />
      <StockGradeDialog
        target={gradeTarget}
        onClose={() => setGradeTarget(null)}
        onSave={saveGrade}
        onClear={clearGrade}
      />
    </div>
  );
}
