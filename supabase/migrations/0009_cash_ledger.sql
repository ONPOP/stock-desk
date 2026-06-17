-- ───────────────────────── 예수금 원장 + 매매 ETF 구분 (V2 · D11) ─────────────────────────
-- 실거래 현금 입출금 기록(cash_ledger). 예수금 잔고는 저장하지 않고 파생 계산한다:
--   예수금(통화별) = Σ입금 − Σ출금 − Σ(매수금액+수수료) + Σ(매도금액−수수료)
-- 매매금액·수수료는 real_trades에서 계산하므로 과거 매매가 자동 전체 반영된다(D11).
-- 음수 예수금 허용(기록 성격) — 입금 미입력 시 음수로 표시될 수 있다(UI 경고).

create table if not exists public.cash_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  currency   text not null check (currency in ('KRW', 'USD')),
  type       text not null check (type in ('deposit', 'withdraw')),
  amount     bigint not null check (amount > 0),   -- 최소 단위(원·센트), 양수만(방향은 type)
  tx_date    date not null,
  memo       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_ledger_user_date on public.cash_ledger (user_id, tx_date desc);
create index if not exists idx_cash_ledger_user_currency on public.cash_ledger (user_id, currency);

alter table public.cash_ledger enable row level security;

-- 본인 기록만 CRUD (real_trades_own 패턴)
drop policy if exists cash_ledger_own on public.cash_ledger;
create policy cash_ledger_own on public.cash_ledger
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 실거래 ETF 구분(국내 매도 거래세 면제용). 기존 행은 일반주식(false).
alter table public.real_trades
  add column if not exists is_etf boolean not null default false;
