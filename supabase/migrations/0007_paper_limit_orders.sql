-- ───────────────────────── 모의투자 지정가 주문 (F9 확장) ─────────────────────────
-- 주문 유형에 'limit'(지정가) 추가. 지정가 예약은 order_type='limit', status='pending',
-- price=지정가(최소 단위 정수)로 저장 → 시세가 조건(매수: 현재가<=지정가, 매도: 현재가>=지정가)에
-- 도달하면 status='done'으로 체결. 기존 'market'(즉시)·'reserved'(시초가 예약)는 그대로.

alter table public.paper_trades drop constraint if exists paper_trades_order_type_check;
alter table public.paper_trades
  add constraint paper_trades_order_type_check
  check (order_type in ('market', 'reserved', 'limit'));

-- pending 지정가 주문 체결 감시 조회용
create index if not exists idx_paper_trades_pending_limit
  on public.paper_trades (account_id)
  where status = 'pending' and order_type = 'limit';
