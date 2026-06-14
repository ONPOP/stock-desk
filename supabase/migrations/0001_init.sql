-- Stock Desk 초기 스키마 — PRD 9장 데이터 모델 + RLS (D1: 멀티유저-ready)
-- 금액 규칙(PRD 16장): 최소 통화 단위 정수 (KRW=원, USD=센트)

create extension if not exists "pgcrypto";

-- ───────────────────────── users (auth.users 미러) ─────────────────────────
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── user_settings ─────────────────────────
create table public.user_settings (
  user_id              uuid primary key references public.users(id) on delete cascade,
  kis_app_key_enc      text,
  kis_app_secret_enc   text,
  openai_key_enc       text,
  anthropic_key_enc    text,
  seed_krw             bigint not null default 10000000,   -- 원 (D5)
  seed_usd_cents       bigint not null default 1000000,    -- $10,000 = 1,000,000센트 (D5)
  auto_analysis_models jsonb not null default '["gpt","claude"]'::jsonb,
  updated_at           timestamptz not null default now(),
  constraint seed_krw_positive check (seed_krw > 0),
  constraint seed_usd_positive check (seed_usd_cents > 0)
);

-- ───────────────────────── analysis_schedules (D4) ─────────────────────────
create table public.analysis_schedules (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.users(id) on delete cascade,
  run_time  time not null,                 -- KST 기준
  enabled   boolean not null default true,
  -- 크론 디스패처가 30분 단위로 돌므로 30분 단위만 허용 (PRD 10장)
  constraint run_time_half_hour check (extract(minute from run_time)::int % 30 = 0),
  constraint uniq_user_run_time unique (user_id, run_time)
);

-- ───────────────────────── stocks (공용 마스터) ─────────────────────────
create table public.stocks (
  id        uuid primary key default gen_random_uuid(),
  ticker    text not null,
  name_kr   text,
  name_en   text,
  market    text not null check (market in ('KOSPI','KOSDAQ','NYSE','NASDAQ','AMEX')),
  currency  text not null check (currency in ('KRW','USD')),
  sector    text,
  is_active boolean not null default true,   -- 거래정지·상폐 처리 (PRD 13장)
  constraint uniq_ticker_market unique (ticker, market)
);
create index idx_stocks_name_kr on public.stocks (name_kr);
create index idx_stocks_name_en on public.stocks (name_en);
create index idx_stocks_ticker on public.stocks (ticker);

-- ───────────────────────── watchlist_items ─────────────────────────
create table public.watchlist_items (
  user_id       uuid not null references public.users(id) on delete cascade,
  stock_id      uuid not null references public.stocks(id) on delete cascade,
  group_name    text not null default '기본',
  auto_analysis boolean not null default true,   -- 종목별 자동분석 토글 (D4)
  created_at    timestamptz not null default now(),
  primary key (user_id, stock_id)                -- 중복 등록 방지 (F3)
);

-- ───────────────────────── stock_metrics (공용) ─────────────────────────
create table public.stock_metrics (
  stock_id           uuid not null references public.stocks(id) on delete cascade,
  as_of_date         date not null,
  market_cap         bigint,           -- 최소 통화 단위
  per                numeric(12,4),
  pbr                numeric(12,4),
  roe                numeric(12,4),
  eps                numeric(18,4),
  revenue_q          bigint,
  operating_income_q bigint,
  net_income_q       bigint,
  capex              bigint,
  debt_ratio         numeric(12,4),
  dividend_yield     numeric(8,4),
  fiscal_quarter     text,
  source             text not null,
  primary key (stock_id, as_of_date)
);

-- ───────────────────────── price_candles (공용) ─────────────────────────
create table public.price_candles (
  stock_id  uuid not null references public.stocks(id) on delete cascade,
  interval  text not null check (interval in ('1m','1d','1w')),
  ts        timestamptz not null,            -- UTC 저장 (PRD 16장)
  o         bigint not null,
  h         bigint not null,
  l         bigint not null,
  c         bigint not null,
  volume    bigint not null default 0,
  primary key (stock_id, interval, ts)
);

-- ───────────────────────── news_items (공용) ─────────────────────────
create table public.news_items (
  id           uuid primary key default gen_random_uuid(),
  stock_id     uuid references public.stocks(id) on delete cascade,  -- null = 시장 공통
  title        text not null,
  source       text,
  url          text not null,
  published_at timestamptz,
  summary_ai   text,
  sentiment    text check (sentiment in ('positive','negative','neutral')),
  cluster_id   uuid,
  constraint uniq_news_url unique (url)
);
create index idx_news_stock_published on public.news_items (stock_id, published_at desc);

-- ───────────────────────── disclosures — F12 (공용) ─────────────────────────
create table public.disclosures (
  id            uuid primary key default gen_random_uuid(),
  stock_id      uuid not null references public.stocks(id) on delete cascade,
  source        text not null check (source in ('dart','edgar')),
  form_type     text not null,
  type_label_kr text,
  title         text not null,
  filed_at      timestamptz not null,
  summary_ai    text,
  url           text not null,
  constraint uniq_disclosure unique (source, url)
);
create index idx_disclosures_stock_filed on public.disclosures (stock_id, filed_at desc);

-- ───────────────────────── dividends — F15 (공용) ─────────────────────────
create table public.dividends (
  id              uuid primary key default gen_random_uuid(),
  stock_id        uuid not null references public.stocks(id) on delete cascade,
  fiscal_year     int not null,
  dps             numeric(18,6),     -- 주당 배당금 (표시용 수치, 연산은 decimal.js)
  frequency       text check (frequency in ('annual','semiannual','quarterly','monthly')),
  ex_date         date,
  pay_date        date,
  yield_at_record numeric(8,4),
  source          text not null,
  constraint uniq_dividend unique (stock_id, fiscal_year, ex_date)
);

-- ───────────────────────── briefings — F1 ─────────────────────────
create table public.briefings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  date         date not null,
  content_md   text,
  sources      jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  status       text not null default 'success' check (status in ('success','failed','generating')),
  constraint uniq_briefing_per_day unique (user_id, date, generated_at)
);

-- ───────────────────────── calendar_events — F2 ─────────────────────────
create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,  -- null = 시장 공통
  type       text not null check (type in ('macro','earnings','custom')),
  stock_id   uuid references public.stocks(id) on delete cascade,
  title      text not null,
  event_date date not null,
  confirmed  boolean not null default true,   -- false = "(예정)" 라벨
  source     text,
  memo       text
);
create index idx_calendar_date on public.calendar_events (event_date);

-- ───────────────────────── ai_analyses — F7 ─────────────────────────
create table public.ai_analyses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  stock_id         uuid not null references public.stocks(id) on delete cascade,
  model            text not null check (model in ('gpt','claude')),
  trigger_type     text not null check (trigger_type in ('auto','manual')),
  context_snapshot jsonb not null default '{}'::jsonb,
  result_md        text,
  position         text check (position in ('buy','neutral','sell')),
  confidence       numeric(5,2),
  created_at       timestamptz not null default now()
);
create index idx_analyses_user_stock on public.ai_analyses (user_id, stock_id, created_at desc);

-- ───────────────────────── paper trading — F9 (D5) ─────────────────────────
create table public.paper_seasons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  season_no      int not null,
  seed_krw       bigint not null,
  seed_usd_cents bigint not null,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,                       -- 리셋 시 기록 (시즌 아카이브)
  constraint uniq_user_season unique (user_id, season_no)
);

create table public.paper_accounts (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.paper_seasons(id) on delete cascade,
  currency     text not null check (currency in ('KRW','USD')),
  cash_balance bigint not null,
  constraint uniq_season_currency unique (season_id, currency),
  constraint cash_not_negative check (cash_balance >= 0)   -- 잔고 초과 주문 차단 (F9)
);

create table public.paper_trades (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.paper_accounts(id) on delete cascade,
  stock_id    uuid not null references public.stocks(id) on delete cascade,
  side        text not null check (side in ('buy','sell')),
  qty         bigint not null check (qty > 0),
  price       bigint,                                -- 체결가 (예약주문은 체결 전 null)
  fee         bigint not null default 0,
  order_type  text not null check (order_type in ('market','reserved')),
  reserved_at timestamptz,
  executed_at timestamptz,
  status      text not null default 'done' check (status in ('pending','done','canceled')),
  memo        text,
  note_id     uuid,
  created_at  timestamptz not null default now()
  -- 거래 기록 삭제 불가, 취소 표시만 (F9 수용 기준) → delete 정책 미부여로 강제
);
create index idx_trades_account on public.paper_trades (account_id, created_at desc);

-- 포지션 뷰: 평단가 = 매수 체결 가중평균 (분할 매수, PRD 13장)
create view public.paper_positions
with (security_invoker = true) as
select
  a.season_id,
  t.account_id,
  t.stock_id,
  sum(case when t.side = 'buy' then t.qty else -t.qty end) as qty,
  case when sum(case when t.side = 'buy' then t.qty else 0 end) > 0
    then round(sum(case when t.side = 'buy' then t.qty * t.price else 0 end)::numeric
             / sum(case when t.side = 'buy' then t.qty else 0 end))::bigint
    else null
  end as avg_price
from public.paper_trades t
join public.paper_accounts a on a.id = t.account_id
where t.status = 'done'
group by a.season_id, t.account_id, t.stock_id
having sum(case when t.side = 'buy' then t.qty else -t.qty end) <> 0;

-- ───────────────────────── notes — F13 ─────────────────────────
create table public.notes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  stock_id             uuid references public.stocks(id) on delete set null,
  content_md           text not null,
  attached_analysis_id uuid references public.ai_analyses(id) on delete set null,
  attached_trade_id    uuid references public.paper_trades(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index idx_notes_user on public.notes (user_id, created_at desc);

alter table public.paper_trades
  add constraint fk_trade_note foreign key (note_id) references public.notes(id) on delete set null;

-- ───────────────────────── kis_token_cache (서비스 롤 전용) ─────────────────────────
-- KIS 접근토큰 24h 캐시 — Upstash Redis 미사용 시 DB 대체 (PRD 11장)
create table public.kis_token_cache (
  cache_key  text primary key,
  token_enc  text not null,
  expires_at timestamptz not null
);

-- ───────────────────────── 트리거 ─────────────────────────
-- 가입 시 users 미러 + 기본 설정 + 기본 분석 스케줄 2행(08:30/22:00 KST — D4)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email) values (new.id, coalesce(new.email, ''));
  insert into public.user_settings (user_id) values (new.id);
  insert into public.analysis_schedules (user_id, run_time)
    values (new.id, '08:30'), (new.id, '22:00');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ───────────────────────── RLS ─────────────────────────
alter table public.users              enable row level security;
alter table public.user_settings     enable row level security;
alter table public.analysis_schedules enable row level security;
alter table public.watchlist_items   enable row level security;
alter table public.briefings         enable row level security;
alter table public.calendar_events   enable row level security;
alter table public.ai_analyses       enable row level security;
alter table public.paper_seasons     enable row level security;
alter table public.paper_accounts    enable row level security;
alter table public.paper_trades      enable row level security;
alter table public.notes             enable row level security;
alter table public.stocks            enable row level security;
alter table public.stock_metrics     enable row level security;
alter table public.price_candles     enable row level security;
alter table public.news_items        enable row level security;
alter table public.disclosures       enable row level security;
alter table public.dividends         enable row level security;
alter table public.kis_token_cache   enable row level security;
-- kis_token_cache: 정책 없음 = anon/authenticated 접근 불가, 서비스 롤만 사용

-- 본인 행만 접근
create policy users_own on public.users
  for select using (id = auth.uid());

create policy user_settings_own on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy analysis_schedules_own on public.analysis_schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy watchlist_own on public.watchlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy briefings_own on public.briefings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 공통 일정(user_id null)은 읽기 허용, 쓰기는 본인 것만
create policy calendar_read on public.calendar_events
  for select using (user_id = auth.uid() or user_id is null);
create policy calendar_insert_own on public.calendar_events
  for insert with check (user_id = auth.uid());
create policy calendar_update_own on public.calendar_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_delete_own on public.calendar_events
  for delete using (user_id = auth.uid());

create policy analyses_own on public.ai_analyses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy seasons_own on public.paper_seasons
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy accounts_via_season on public.paper_accounts
  for all using (
    exists (select 1 from public.paper_seasons s where s.id = season_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.paper_seasons s where s.id = season_id and s.user_id = auth.uid())
  );

-- 거래: 조회·생성·수정(취소 표시)만 허용 — delete 정책 없음 (기록 삭제 불가)
create policy trades_select on public.paper_trades
  for select using (
    exists (
      select 1 from public.paper_accounts a
      join public.paper_seasons s on s.id = a.season_id
      where a.id = account_id and s.user_id = auth.uid()
    )
  );
create policy trades_insert on public.paper_trades
  for insert with check (
    exists (
      select 1 from public.paper_accounts a
      join public.paper_seasons s on s.id = a.season_id
      where a.id = account_id and s.user_id = auth.uid()
    )
  );
create policy trades_update on public.paper_trades
  for update using (
    exists (
      select 1 from public.paper_accounts a
      join public.paper_seasons s on s.id = a.season_id
      where a.id = account_id and s.user_id = auth.uid()
    )
  );

create policy notes_own on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 공용 마스터: 로그인 사용자 읽기 전용 (쓰기는 서비스 롤 = RLS 우회)
create policy stocks_read        on public.stocks        for select to authenticated using (true);
create policy metrics_read       on public.stock_metrics for select to authenticated using (true);
create policy candles_read       on public.price_candles for select to authenticated using (true);
create policy news_read          on public.news_items    for select to authenticated using (true);
create policy disclosures_read   on public.disclosures   for select to authenticated using (true);
create policy dividends_read     on public.dividends     for select to authenticated using (true);
