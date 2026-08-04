-- 눌림목 관찰 레이더 (D16) — 조건 자동 추출과 별개로 '항상 관찰 표에 올릴' 종목 고정.
-- always_brief(분석 대상 강제 포함)와 같은 축이라 나란히 둔다. 사용자 승인 하에 기존 테이블 컬럼 추가.
alter table public.watchlist_items
  add column if not exists radar_pin boolean not null default false;
