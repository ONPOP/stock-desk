-- 실거래 매매비용(세금+수수료) 수동 입력 (V2 보완)
-- 매도 시 사용자가 직접 입력한 총 매매비용을 실현손익에서 차감한다. 최소 단위 정수(KRW=원, USD=센트).
-- 기존 행은 0(비용 미입력).
alter table public.real_trades
  add column if not exists fee bigint not null default 0 check (fee >= 0);
