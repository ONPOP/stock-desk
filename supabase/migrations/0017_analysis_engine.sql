-- 정기 배치 분석 엔진 (D16) — 슬롯 스케줄 · 지표 스냅샷 · 슬라이드 리포트 · 신호 성적표.
-- 기존 자산 재사용: 시세=lib/providers(kis|yahoo), 지표=lib/utils/indicators, 이벤트=calendar_events.
-- 산출물은 pptx 파일이 아니라 슬라이드 PNG — 정의(slides)는 DB, 원본 이미지는 로컬(외장 볼륨 가능).
-- 신규 테이블은 전부 user_id + RLS (D1). 금액·비율은 정수(최소 통화 단위 / 베이시스포인트).

-- 워치리스트 확장: 신호 강도와 무관하게 매 슬롯 포함할 종목. 기존 D14 탭 구조는 그대로 유지.
alter table public.watchlist_items
  add column if not exists always_brief boolean not null default false;


-- 엔진 설정 — 유저당 1행. 슬라이드 저장 루트를 외장 볼륨으로 돌릴 수 있게 경로를 설정값으로 둔다.
create table public.engine_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- null이면 SLIDE_STORAGE_ROOT env → <repo>/data/runs 순으로 폴백.
  -- 임의 경로 쓰기를 막기 위해 홈 디렉토리 또는 /Volumes 하위만 허용 (검증은 lib/engine/storage-path.ts).
  slide_storage_root text,
  -- 0이면 무제한 보관. N이면 N일 지난 슬라이드 원본을 정리 대상으로 본다.
  retention_days integer not null default 0 check (retention_days >= 0),
  telegram_chat_id text,
  -- 사용량 예산 (D16) — 상향은 사용자 승인 사항이라 코드 상수가 아닌 설정값으로 노출한다.
  max_stocks_per_slot integer not null default 8 check (max_stocks_per_slot between 1 and 20),
  max_searches_per_stock integer not null default 4 check (max_searches_per_stock between 1 and 10),
  updated_at timestamptz not null default now()
);

alter table public.engine_settings enable row level security;
create policy engine_settings_own on public.engine_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 테마 — 종목 상대강도 비교 단위 (설계서 기능 2·3)
create table public.analysis_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  market text not null check (market in ('KR', 'US', 'BOTH')),
  created_at timestamptz not null default now(),
  constraint uniq_theme_name_per_user unique (user_id, name)
);

alter table public.analysis_themes enable row level security;
create policy analysis_themes_own on public.analysis_themes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 종목 참조는 ticker+market 문자열이 아니라 stock_id — 기존 watchlist_items·price_candles와 동일 컨벤션.
create table public.theme_stocks (
  theme_id uuid not null references public.analysis_themes (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  primary key (theme_id, stock_id)
);

alter table public.theme_stocks enable row level security;
create policy theme_stocks_via_theme on public.theme_stocks
  for all
  using (exists (select 1 from public.analysis_themes t where t.id = theme_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.analysis_themes t where t.id = theme_id and t.user_id = auth.uid()));


-- 신호 규칙 — 튜닝 이력 보존을 위해 행 수정이 아닌 새 버전 추가로 운용 (성적 비교의 전제).
create table public.signal_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  rules jsonb not null,
  active boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  constraint uniq_rule_version_per_user unique (user_id, version)
);

-- 유저당 active 버전은 1개만 (0013 기본 탭 partial unique와 동일 패턴)
create unique index signal_rules_one_active_idx on public.signal_rules (user_id) where active;

alter table public.signal_rules enable row level security;
create policy signal_rules_own on public.signal_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 분석 슬롯 — launchd plist 생성의 단일 원천. 기존 analysis_schedules(30분 정렬·타입 없음)와 별개 트랙.
create table public.schedule_slots (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot_id text not null,
  -- 5필드 크론 (KST 기준). install-schedule이 이 값을 launchd StartCalendarInterval로 변환한다.
  cron_kst text not null,
  market text not null check (market in ('KR', 'US', 'BOTH')),
  slot_type text not null check (slot_type in ('quick', 'detail', 'grade', 'weekly')),
  label text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id),
  -- 경로 조작 방지: slot_id가 그대로 파일시스템 디렉토리명이 된다 (data/runs/{date}/{slot_id}/)
  constraint slot_id_safe check (slot_id ~ '^[a-z0-9_]{1,40}$')
);

alter table public.schedule_slots enable row level security;
create policy schedule_slots_own on public.schedule_slots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 지표 스냅샷 — Python이 아닌 TS 파이프라인(lib/engine) 산출. Claude는 이 값을 해석만 하고 재계산하지 않는다.
create table public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot_id text not null,
  -- KST 기준 실행일 — 날짜별 아카이브 조회 키 (UTC 저장 원칙의 예외: 날짜 버킷은 KST가 사용자 기준)
  run_date date not null,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  captured_at timestamptz not null default now(),
  -- 현재가/시가/고저/거래량 — 최소 통화 단위 정수
  price_data jsonb not null,
  -- MA·이격률·RSI·거래량비율·기간수익률·국면 플래그. 비율은 전부 베이시스포인트 정수
  indicators jsonb not null,
  -- KR 전용 외인/기관 수급·체결강도 (미수집 시 null)
  flow_data jsonb,
  -- scorer 점수 0~100
  score numeric(6, 2),
  score_detail jsonb,
  constraint uniq_snapshot_per_run unique (user_id, run_date, slot_id, stock_id)
);

create index market_snapshots_lookup_idx
  on public.market_snapshots (user_id, run_date desc, slot_id);

alter table public.market_snapshots enable row level security;
create policy market_snapshots_own on public.market_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 분석 리포트 — Claude 판단 + 슬라이드 정의. 슬롯 1회 실행당 1행 (날짜·시간별 아카이브의 단위).
create table public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot_id text not null,
  run_date date not null,
  run_at timestamptz not null default now(),
  market_overview jsonb,
  stock_cards jsonb not null default '[]'::jsonb,
  -- 슬라이드 정의(단일 원천). 렌더러가 이걸 읽어 PNG를 만든다 — pptx 파일은 생성하지 않는다.
  slides jsonb not null default '[]'::jsonb,
  -- 저장 루트 기준 '상대경로'. 루트(외장 볼륨 등)가 바뀌어도 재계산 없이 그대로 쓰기 위함.
  slide_paths text[] not null default '{}',
  -- pending=렌더 전 | stored=지정 루트 저장 | fallback=루트 미연결로 기본 경로 저장(복구 시 이관 대상)
  storage_state text not null default 'pending'
    check (storage_state in ('pending', 'stored', 'fallback')),
  -- 썸네일만 Supabase Storage에 업로드 (원본은 로컬 — 무료 티어 용량 보호)
  thumb_bucket_path text,
  usage_note text,
  constraint uniq_report_per_run unique (user_id, run_date, slot_id)
);

create index analysis_reports_archive_idx
  on public.analysis_reports (user_id, run_date desc, run_at desc);

-- 루트 복구 시 이관 대상만 빠르게 훑기 위한 부분 인덱스
create index analysis_reports_relocate_idx
  on public.analysis_reports (user_id) where storage_state = 'fallback';

alter table public.analysis_reports enable row level security;
create policy analysis_reports_own on public.analysis_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 슬롯 신호 성적표 — 종가매수→시초매도 패턴 검증용. D15 trade_signals(인트라데이 자동매매)와 목적이 다르다.
create table public.slot_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid references public.analysis_reports (id) on delete set null,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  signal_date date not null,
  signal text not null check (signal in ('BUY', 'SELL', 'HOLD', 'AVOID')),
  confidence text check (confidence in ('HIGH', 'MID', 'LOW')),
  -- 제시했던 진입가 구간 (최소 통화 단위 정수)
  entry_low bigint,
  entry_high bigint,
  rule_version integer,
  -- 신호 시점 종가 — 갭률 계산의 기준가
  close_price bigint,
  -- 익일 채점 (grade-signals가 기록)
  next_open bigint,
  next_high bigint,
  next_low bigint,
  -- 갭률을 베이시스포인트 정수로 저장 (부동소수 누적오차 회피 — +1.00% = 100)
  gap_bp integer,
  graded_at timestamptz,
  outcome text check (outcome in ('WIN', 'LOSE', 'NEUTRAL')),
  created_at timestamptz not null default now()
);

create index slot_signals_grade_idx
  on public.slot_signals (user_id, signal_date desc) where graded_at is null;
create index slot_signals_history_idx
  on public.slot_signals (user_id, stock_id, signal_date desc);

alter table public.slot_signals enable row level security;
create policy slot_signals_own on public.slot_signals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
