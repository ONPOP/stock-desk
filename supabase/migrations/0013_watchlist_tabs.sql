-- ───────────────────────── 워치리스트 탭 (D14) ─────────────────────────
-- 내 종목을 독립적인 "탭(워치리스트)" 단위로 관리한다. 첫 탭은 기본 탭(삭제·이름변경 불가),
-- 나머지는 사용자가 이름을 지정해 생성한다. 같은 종목을 여러 탭에 등록할 수 있도록
-- watchlist_items PK를 (user_id, stock_id) → (watchlist_id, stock_id)로 교체한다.

-- 1) 탭 메타데이터 테이블 (빈 탭도 존재해야 하므로 멤버십과 분리)
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30),
  is_default  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.watchlists enable row level security;

create policy watchlists_own on public.watchlists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 유저당 기본 탭 1개만 허용
create unique index if not exists uniq_default_watchlist
  on public.watchlists (user_id) where is_default;

create index if not exists idx_watchlists_user_sort
  on public.watchlists (user_id, sort_order);

-- 2) 기존 유저별 기본 탭 생성 (멱등 — 재실행 시 중복 생성 안 함)
insert into public.watchlists (user_id, name, is_default, sort_order)
select u.id, '내 종목', true, 0
from public.users u
where not exists (
  select 1 from public.watchlists w where w.user_id = u.id and w.is_default
);

-- 3) watchlist_items에 소속 탭(watchlist_id) 추가 + 기존 데이터는 기본 탭으로 backfill
alter table public.watchlist_items
  add column if not exists watchlist_id uuid references public.watchlists(id) on delete cascade;

update public.watchlist_items wi
set watchlist_id = w.id
from public.watchlists w
where w.user_id = wi.user_id and w.is_default and wi.watchlist_id is null;

alter table public.watchlist_items
  alter column watchlist_id set not null;

-- 4) PK 교체: (user_id, stock_id) → (watchlist_id, stock_id) — 같은 종목 여러 탭 허용
alter table public.watchlist_items drop constraint if exists watchlist_items_pkey;
alter table public.watchlist_items add primary key (watchlist_id, stock_id);

-- 5) 정렬 인덱스 교체 (탭 내 정렬 기준)
drop index if exists idx_watchlist_user_sort;
create index if not exists idx_watchlist_wl_sort
  on public.watchlist_items (watchlist_id, sort_order);
