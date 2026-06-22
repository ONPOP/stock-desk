-- 모의투자 테스트 매매 (D13 Phase 2) — USD 단일 통화 샌드박스.
-- 체결가는 sim_candles 의 해당 시점(거래일) 종가로 서버가 결정(클라 위조 방지).

create table public.sim_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  seed_usd_cents bigint not null check (seed_usd_cents > 0),  -- 초기 자금(USD 센트)
  start_date     date not null,                               -- 재생 시작 거래일
  cur_date       date not null,                               -- 현재 재생 위치
  started_at     timestamptz not null default now(),
  ended_at       timestamptz                                  -- null = 활성
);
create index idx_sim_sessions_user on public.sim_sessions (user_id, started_at desc);

create table public.sim_trades (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sim_sessions(id) on delete cascade,
  ticker      text not null,
  side        text not null check (side in ('buy', 'sell')),
  qty         bigint not null check (qty > 0),
  price_cents bigint not null check (price_cents >= 0),        -- 체결가(서버 결정)
  trade_date  date not null,                                   -- 체결 시 sim 거래일
  created_at  timestamptz not null default now()
);
create index idx_sim_trades_session on public.sim_trades (session_id, created_at);

alter table public.sim_sessions enable row level security;
alter table public.sim_trades enable row level security;

create policy sim_sessions_own on public.sim_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sim_trades_via_session on public.sim_trades
  for all using (
    exists (select 1 from public.sim_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.sim_sessions s where s.id = session_id and s.user_id = auth.uid())
  );
