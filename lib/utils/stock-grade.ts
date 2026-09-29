// 사용자 종목 등급(A~D) — /stocks 등급 필터용 순수 함수. 등급은 탭과 무관한 종목 단위 맵으로 받는다.
import type { GradeFilter, StockGrade, UserStockGrade, WatchlistItem } from '@/types';

export const STOCK_GRADES: readonly StockGrade[] = ['A', 'B', 'C', 'D'];
export const GRADE_FILTERS: readonly GradeFilter[] = [...STOCK_GRADES, 'none'];

function filterKey(stockId: string, grades: Record<string, UserStockGrade>): GradeFilter {
  return grades[stockId]?.grade ?? 'none';
}

/** 선택이 비어 있으면 전체 — 칩을 다 끈 상태를 '필터 없음'으로 본다 */
export function filterByGrade(
  items: WatchlistItem[],
  grades: Record<string, UserStockGrade>,
  selected: ReadonlySet<GradeFilter>,
): WatchlistItem[] {
  if (selected.size === 0) return items;
  return items.filter((i) => selected.has(filterKey(i.stock_id, grades)));
}

export function countByGrade(
  items: WatchlistItem[],
  grades: Record<string, UserStockGrade>,
): Record<GradeFilter, number> {
  const out: Record<GradeFilter, number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  for (const i of items) out[filterKey(i.stock_id, grades)] += 1;
  return out;
}

export function toggleGradeFilter(selected: ReadonlySet<GradeFilter>, f: GradeFilter): Set<GradeFilter> {
  const next = new Set(selected);
  if (next.has(f)) next.delete(f);
  else next.add(f);
  return next;
}

/**
 * 저장·해제 실패 시 해당 종목만 되돌린다. 맵 전체 스냅샷을 복원하면 그사이 끝난 다른 종목 저장까지 지워지므로,
 * 현재 값이 내가 넣은 낙관적 값일 때만 이전 값으로 복원한다(다른 저장이 덮었으면 그대로 둔다).
 */
export function rollbackGrade(
  map: Record<string, UserStockGrade>,
  stockId: string,
  optimistic: UserStockGrade | undefined,
  previous: UserStockGrade | undefined,
): Record<string, UserStockGrade> {
  if (map[stockId] !== optimistic) return map;
  const next = { ...map };
  if (previous) next[stockId] = previous;
  else delete next[stockId];
  return next;
}
