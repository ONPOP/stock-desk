-- 자동매매 (D15) — 전략 설정 + 시그널/주문 기록
-- 설정은 유저당 1행(파라미터 jsonb — 스키마 변경 없이 조정 가능), 시그널은 append-only 로그.

create table public.auto_trading_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  -- 수동 비상정지: enabled와 별개의 최우선 차단 플래그 (UI kill switch)
  kill_switch boolean not null default false,
  -- StrategyParams — 서버(zod)에서 범위 검증 후 저장. 기본값은 코드(DEFAULT_PARAMS)가 단일 원천.
  params jsonb not null default '{}'::jsonb,
  -- [{ticker, market}] 국내 한정, 최대 10종목 (KIS 레이트리밋·시세 폴링 부하 상한)
  universe jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.auto_trading_configs enable row level security;
create policy auto_trading_configs_own on public.auto_trading_configs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.trade_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  action text not null check (action in ('buy', 'sell')),
  reason text not null,
  -- 판단 시점 지표 스냅샷 (close/vwap/rsi/macdHist/volume 등 — 사후 분석용)
  indicators jsonb,
  executed boolean not null default false,
  reject_reason text,
  -- 체결가·수량 (최소 단위 정수). 거부된 시그널은 null 허용
  price bigint,
  qty integer,
  -- 매도 실현손익 (최소 단위 정수) — 일간 손실 한도 판정에 사용
  pnl bigint,
  decided_at timestamptz not null default now()
);

alter table public.trade_signals enable row level security;
create policy trade_signals_own on public.trade_signals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 엔진 조회 패턴: 오늘자 시그널 (일간 상태·손실 한도), 최근 로그
create index trade_signals_user_decided_idx on public.trade_signals (user_id, decided_at desc);
