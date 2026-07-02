-- 캘린더 이벤트 타입 확장 (D13) — 장기옵션(LEAPS) 만기·배당 일정 추가
-- 기존 CHECK(type in macro/earnings/custom)을 options·dividend 포함으로 교체.
alter table public.calendar_events drop constraint if exists calendar_events_type_check;
alter table public.calendar_events
  add constraint calendar_events_type_check
  check (type in ('macro', 'earnings', 'custom', 'options', 'dividend'));
