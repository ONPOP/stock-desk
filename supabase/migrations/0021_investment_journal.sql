-- ───────────────────────── 투자 기록 탭: 투자 규칙 · 목표 수익률 (D21) ─────────────────────────
-- 신규 테이블만 추가한다(기존 테이블 스키마 변경 없음).
--   investment_rules    대시보드에 고정 표시하는 나만의 투자 규칙(순서 있는 목록)
--   return_goals        목표 수익률 설정 이력. 월 목표는 설정한 달부터 복리 경로로 자동 계산되고,
--                       같은 종류를 다른 달에 다시 설정하면 그 달부터 새 경로가 시작된다.
--   return_goal_months  월별 시작 금액 기록. 달이 지나면 closed=true로 확정되어 이후 입출금·매매 수정이
--                       과거 달에 영향을 주지 않는다. 금액은 원화 환산 원 단위 정수.

create table if not exists public.investment_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 300),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_investment_rules_user_sort on public.investment_rules (user_id, sort_order);

alter table public.investment_rules enable row level security;
drop policy if exists investment_rules_own on public.investment_rules;
create policy investment_rules_own on public.investment_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists investment_rules_touch on public.investment_rules;
create trigger investment_rules_touch before update on public.investment_rules
  for each row execute function public.touch_updated_at();

create table if not exists public.return_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  kind             text not null check (kind in ('monthly', 'yearly')),
  rate_pct         numeric(7, 3) not null check (rate_pct > 0 and rate_pct <= 1000),
  -- 적용 시작 월(해당 월 1일). 연 목표는 1월 1일.
  effective_month  date not null check (extract(day from effective_month) = 1),
  created_at       timestamptz not null default now(),
  unique (user_id, kind, effective_month),
  check (kind = 'monthly' or extract(month from effective_month) = 1)
);

alter table public.return_goals enable row level security;
drop policy if exists return_goals_own on public.return_goals;
create policy return_goals_own on public.return_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.return_goal_months (
  user_id         uuid not null references public.users (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  base_start      bigint not null,            -- 월초 예수금 + 보유 매입원가(₩환산, 자동 계산)
  start_override  bigint,                     -- 사용자가 고친 월초 금액(null이면 base_start 사용)
  net_flow        bigint not null default 0,  -- 월중 입금 − 출금(₩환산). closed 전에는 조회 시 재계산
  realized        bigint not null default 0,  -- 월 실현손익(₩환산). closed 전에는 조회 시 재계산
  closed          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.return_goal_months enable row level security;
drop policy if exists return_goal_months_own on public.return_goal_months;
create policy return_goal_months_own on public.return_goal_months
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists return_goal_months_touch on public.return_goal_months;
create trigger return_goal_months_touch before update on public.return_goal_months
  for each row execute function public.touch_updated_at();
