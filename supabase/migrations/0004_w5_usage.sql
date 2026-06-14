-- W5 마감 — API 사용량 로그 (PRD 14장: AI 토큰 비용·외부 API 호출량 추적)
-- 일자×제공자 단위 증분 집계. notes 테이블은 0001에 완비되어 변경 없음.

create table public.api_usage_log (
  user_id           uuid not null references public.users(id) on delete cascade,
  log_date          date not null,                 -- KST 기준 일자
  provider          text not null,                 -- openai / finnhub / dart / naver / kis ...
  calls             int  not null default 0,
  prompt_tokens     bigint not null default 0,
  completion_tokens bigint not null default 0,
  primary key (user_id, log_date, provider)
);

alter table public.api_usage_log enable row level security;
-- 본인 사용량 읽기 전용 (쓰기는 서비스 롤 = 크론·수집 서비스)
create policy usage_own_read on public.api_usage_log
  for select using (user_id = auth.uid());
