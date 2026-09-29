-- ───────────────────────── 사용자 종목 등급 A~D (D22) ─────────────────────────
-- 신규 테이블만 추가한다(기존 테이블 스키마 변경 없음).
-- watchlist_items는 탭마다 같은 종목 행이 따로 있어 종목 단위 값을 두면 탭 간 동기화가 필요하다.
-- 등급은 탭과 무관하므로 (user_id, stock_id) 1건으로 둔다. 종목을 목록에서 빼도 등급은 남아 재등록 시 복원된다.
create table if not exists public.user_stock_grades (
  user_id    uuid not null references public.users (id) on delete cascade,
  stock_id   uuid not null references public.stocks (id) on delete cascade,
  grade      text not null check (grade in ('A', 'B', 'C', 'D')),
  reason     text check (reason is null or char_length(reason) between 1 and 100),
  graded_at  timestamptz not null default now(),
  primary key (user_id, stock_id)
);

alter table public.user_stock_grades enable row level security;
drop policy if exists user_stock_grades_own on public.user_stock_grades;
create policy user_stock_grades_own on public.user_stock_grades
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
