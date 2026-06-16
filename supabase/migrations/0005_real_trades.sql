-- ───────────────────────── 실거래 매매일지 (V2) ─────────────────────────
-- 모의투자(paper_*)와 별개: 시즌·계좌·예약체결 없이 사용자가 직접 입력하는 실제 매매 기록.
-- 보유현황·평단가·평가손익·실현손익은 이 단일 테이블에서 파생 계산(단일 진실 원천).
-- 금액은 최소 단위 정수(KRW=원, USD=센트).

create table if not exists public.real_trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  stock_id    uuid not null references public.stocks (id) on delete cascade,
  side        text not null check (side in ('buy', 'sell')),
  qty         bigint not null check (qty > 0),
  price       bigint not null check (price > 0),   -- 체결 단가(최소 단위 정수)
  trade_date  date not null,
  memo        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_real_trades_user_stock on public.real_trades (user_id, stock_id);
create index if not exists idx_real_trades_user_date on public.real_trades (user_id, trade_date desc);

alter table public.real_trades enable row level security;

-- 본인 기록만 CRUD
drop policy if exists real_trades_own on public.real_trades;
create policy real_trades_own on public.real_trades
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
