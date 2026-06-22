-- 모의투자 테스트(과거 10년 백테스트) — 동결 일봉 캔들 (D12, 요구 1·6)
-- 테마/종목/이벤트는 코드(lib/sim/*)에 동결 보존하므로 DB 는 캔들만 둔다.
-- 금액 규칙(PRD 16장): USD 센트 정수. 시각은 거래일(date) 기준.

create table public.sim_candles (
  ticker  text not null,                 -- 미국 티커 (lib/sim/universe.ts 유니버스)
  ts      date not null,                  -- 거래일 (미국장 기준)
  o       bigint not null,
  h       bigint not null,
  l       bigint not null,
  c       bigint not null,
  volume  bigint not null default 0,
  primary key (ticker, ts)
);
create index idx_sim_candles_ts on public.sim_candles (ts);

-- 공용 동결 데이터: 로그인 사용자 읽기 전용 (쓰기는 서비스 롤 = ingest 스크립트가 RLS 우회)
alter table public.sim_candles enable row level security;
create policy sim_candles_read on public.sim_candles for select to authenticated using (true);
