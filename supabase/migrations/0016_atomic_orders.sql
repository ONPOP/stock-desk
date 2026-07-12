-- 주문 동시성 안전 (D15 보안) — 비원자 read-check-write(잔고 이중지출·리스크 우회) 제거.
-- ① 잔고를 조건부 원자 증감하는 RPC ② 자동매매 tick 유저별 DB 락(인메모리 스로틀 대체).

-- 잔고 원자 증감: p_require_nonneg면 결과가 음수가 되는 갱신을 거부(0행 → NULL 반환).
-- SECURITY INVOKER(기본) → 호출자 RLS(accounts_via_season) 적용: 본인 계좌만 갱신 가능.
create or replace function public.paper_adjust_cash(
  p_account_id uuid,
  p_delta bigint,
  p_require_nonneg boolean
) returns bigint
language sql
as $$
  update public.paper_accounts
     set cash_balance = cash_balance + p_delta
   where id = p_account_id
     and (not p_require_nonneg or cash_balance + p_delta >= 0)
  returning cash_balance;
$$;

-- 자동매매 tick 유저별 락 — 동시 tick이 리스크 관문·잔고 스냅샷을 이중처리하지 못하게 직렬화.
-- 인메모리 Map 스로틀은 서버리스 인스턴스별이라 우회 가능 → DB 컬럼으로 승격.
alter table public.auto_trading_configs
  add column if not exists tick_lock_at timestamptz;

-- 락 획득: TTL 지난(또는 null) 경우에만 now()로 선점. 1행 반환 시 획득, 0행이면 다른 tick 진행 중.
create or replace function public.try_acquire_tick_lock(
  p_user uuid,
  p_ttl_seconds int
) returns boolean
language sql
as $$
  update public.auto_trading_configs
     set tick_lock_at = now()
   where user_id = p_user
     and (tick_lock_at is null or tick_lock_at < now() - make_interval(secs => p_ttl_seconds))
  returning true;
$$;

create or replace function public.release_tick_lock(p_user uuid)
returns void
language sql
as $$
  update public.auto_trading_configs set tick_lock_at = null where user_id = p_user;
$$;
