-- ───────────────────────── 워치리스트 즐겨찾기·정렬 (V2) ─────────────────────────
-- 내 종목 페이지: 시장 거래소별 그룹 + 즐겨찾기(중복 표시) + 그룹 내 드래그 정렬.
-- 기존 RLS(watchlist_own)가 그대로 적용된다(컬럼 추가만).

alter table public.watchlist_items
  add column if not exists is_favorite boolean not null default false,
  add column if not exists sort_order  int not null default 0;

create index if not exists idx_watchlist_user_sort on public.watchlist_items (user_id, sort_order);
