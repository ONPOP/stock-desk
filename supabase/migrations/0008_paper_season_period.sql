-- ───────────────────────── 모의투자 시즌 기간 (V2) ─────────────────────────
-- '새 시즌 시작' 시 사용자가 지정하는 목표 시작일/종료일. 표시·기록용(자동 마감 없음).
-- 기존 RLS(seasons_own)가 그대로 적용된다(컬럼 추가만).

alter table public.paper_seasons
  add column if not exists start_date date,
  add column if not exists end_date   date;
