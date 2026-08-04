# 주식 정기 배치 분석 엔진 — 확장 설계서 v1.0

기존 주식 프로그램에 추가되는 "정기 배치 분석 엔진"의 설계 문서.
작성 기준: Next.js + Supabase + KIS OpenAPI 스택 가정. 실제 코드베이스와 다른 부분은 Phase 0 탐색 결과에 맞게 조정한다.

---

## 1. 목적과 원칙

### 목적
설정된 시간(프리마켓, 장 시작, 장 마감, 임의 추가 시간)에 한국+미국 관심 종목(30개 이상)의 차트·뉴스·리스크를 자동 분석하고, 매수·매도 진입 판단 자료를 슬라이드로 생성해 텔레그램으로 알림한다. 매매는 실행하지 않는다. 목적은 **개인화된 전문 분석 프로그램**이다.

### 설계 원칙
1. **답이 정해진 것은 코드, 판단이 필요한 것은 스킬.** 지표 계산·필터링·렌더링은 Python, 뉴스 해석·국면 판단·서술은 Claude Code 스킬.
2. **비용 제약: Claude 구독(Max 5x) 외 지출 없음.** LLM 호출은 반드시 Claude Code 헤드리스(`claude -p`)를 통해서만. Anthropic API 직접 호출 금지. 데이터 소스는 무료(KIS OpenAPI, yfinance)만 사용.
3. **완전 배치 구조.** 상시 데몬 없음. cron/launchd가 슬롯 시각에 깨우면 실행 후 종료.
4. **사용자 매매 패턴 최적화.** 종가(마감 30분 전~마감) 매수 → 익일 시초(장 시작~1시간) 매도 오버나잇 갭 전략. 모든 신호 판단은 이 패턴을 전제로 한다.
5. **누적과 검증.** 모든 신호와 판단은 DB에 적재하고 익일 실제 결과로 채점한다(성적표). 룰은 데이터로 개선한다.

---

## 2. 시스템 아키텍처

```
┌─ Mac mini (24/7, Tailscale) ─────────────────────────────────┐
│                                                              │
│  launchd (schedule_slots 동기화)                             │
│      │ 슬롯 시각                                             │
│      ▼                                                       │
│  run_slot.sh <slot_id>                                       │
│      │                                                       │
│      ├─ [1] Python 수집·계산 (무료, Claude 사용량 0)          │
│      │     fetch_kr.py / fetch_us.py → indicators.py         │
│      │     → scorer.py → snapshot JSON + 상위 종목 선정      │
│      │                                                       │
│      ├─ [2] Claude Code 헤드리스 분석 (구독 사용량)           │
│      │     claude -p "slot 분석" → stock-analysis 스킬 로드   │
│      │     → 뉴스 조사 → 판단 JSON 출력                       │
│      │                                                       │
│      ├─ [3] 산출물 생성                                       │
│      │     간이 슬롯: deck_builder.py (python-pptx 템플릿)    │
│      │     상세 슬롯: Claude Code pptx 스킬                   │
│      │                                                       │
│      ├─ [4] notify.py → 텔레그램 (요약 텍스트 + pptx 파일)    │
│      │                                                       │
│      └─ [5] archive.py → Supabase 적재                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
              │                                    ▲
              ▼                                    │
     Supabase (기존 프로젝트에 신규 테이블 추가)     │
              │                                    │
              ▼                                    │
     기존 웹 앱 (Next.js) ── 리포트 열람 UI (선택, 후순위)
```

### 기존 프로그램과의 통합 지점
| 통합 지점 | 방식 |
|---|---|
| DB | 기존 Supabase 프로젝트에 신규 테이블 추가. 기존 테이블 스키마 변경 금지 |
| KIS 연동 | 기존 토큰 발급/시세 조회 로직이 있으면 재사용. 없으면 `engine/`에 신규 작성 |
| 웹 UI | 후순위. `analysis_reports` 테이블을 읽는 열람 페이지를 추후 추가 가능 |
| 텔레그램 | 기존 Claude Code hooks용 봇 재사용 (챗ID 분리 권장) |

---

## 3. DB 스키마 (Supabase 신규 테이블)

네이밍은 기존 프로젝트 컨벤션에 맞게 조정 가능. 아래는 기본안.

```sql
-- 테마 (기능 2)
create table analysis_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- 예: 'AI 데이터센터 전력', 'HBM'
  description text,
  market text check (market in ('KR','US','BOTH')),
  created_at timestamptz default now()
);

create table theme_stocks (
  theme_id uuid references analysis_themes(id) on delete cascade,
  ticker text not null,                  -- KR: '005930', US: 'NVDA'
  market text not null check (market in ('KR','US')),
  name text not null,
  primary key (theme_id, ticker)
);

-- 상시 브리핑 지정 종목 (기능 9 후반)
create table watchlist (
  ticker text not null,
  market text not null check (market in ('KR','US')),
  name text not null,
  always_brief boolean default false,    -- true면 신호 강도와 무관하게 매 슬롯 포함
  note text,
  primary key (ticker, market)
);

-- 신호 규칙 (기능 1) — 버전 관리로 튜닝 이력 보존
create table signal_rules (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  rules jsonb not null,                  -- §5 구조
  active boolean default false,
  memo text,                             -- 이번 버전에서 바꾼 것
  created_at timestamptz default now()
);

-- 분석 슬롯 (기능 4)
create table schedule_slots (
  id text primary key,                   -- 'kr_close_buy', 'us_premarket' 등
  cron_kst text not null,                -- '50 14 * * 1-5'
  market text not null check (market in ('KR','US','BOTH')),
  slot_type text not null check (slot_type in ('quick','detail','grade','weekly')),
  label text not null,
  enabled boolean default true
);

-- 지표 스냅샷 (Python 산출)
create table market_snapshots (
  id uuid primary key default gen_random_uuid(),
  slot_id text references schedule_slots(id),
  ticker text not null,
  market text not null,
  captured_at timestamptz not null,
  price_data jsonb not null,             -- 현재가/시가/고저/프리·애프터/거래량
  indicators jsonb not null,             -- MA10~200, RSI, 거래량비율, 눌림목 판정 등
  flow_data jsonb,                       -- KR: 외인/기관/개인 수급, 체결강도
  score numeric,                         -- scorer.py 신호 강도 점수
  score_detail jsonb
);

-- 분석 리포트 (Claude 산출)
create table analysis_reports (
  id uuid primary key default gen_random_uuid(),
  slot_id text references schedule_slots(id),
  run_at timestamptz not null,
  market_overview jsonb,                 -- 시장/테마 흐름 요약
  stock_cards jsonb not null,            -- §6 종목 카드 배열
  deck_path text,                        -- 생성된 pptx 경로/URL
  usage_note text                        -- 이번 실행 검색 횟수 등
);

-- 신호 성적표
create table signal_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references analysis_reports(id),
  ticker text not null,
  market text not null,
  signal_date date not null,
  signal text not null check (signal in ('BUY','SELL','HOLD','AVOID')),
  confidence text check (confidence in ('HIGH','MID','LOW')),
  entry_zone jsonb,                      -- 제시했던 진입가 구간
  rule_version int,
  -- 익일 채점 (grade_signals.py가 기록)
  next_open numeric,
  next_high numeric,
  next_low numeric,
  gap_pct numeric,                       -- (익일시가-당일종가)/당일종가
  graded_at timestamptz,
  outcome text check (outcome in ('WIN','LOSE','NEUTRAL',null))
);

-- 이벤트 리스크 캘린더
create table event_calendar (
  id uuid primary key default gen_random_uuid(),
  ticker text,                           -- null이면 시장 전체 이벤트 (FOMC 등)
  market text,
  event_date date not null,
  event_type text not null,              -- 'EARNINGS','FOMC','LOCKUP','DIVIDEND','ETC'
  detail text,
  source text
);
```

---

## 4. Python 모듈 명세 (`engine/`)

모든 모듈은 표준 입출력 JSON + Supabase 적재를 지원하고 `--test` 단독 실행이 가능해야 한다.

### fetch_kr.py
- KIS OpenAPI REST. 현재가, 일봉(3년치 최초 1회 후 증분), 분봉(당일), 투자자별 매매동향, 체결강도, 시간외 단일가.
- 토큰은 기존 프로그램 로직 재사용. 레이트리밋 대응(초당 호출 제한 준수, 재시도 3회).

### fetch_us.py
- yfinance. 프리마켓/애프터마켓 포함 현재가, 일봉 3년, 분봉 당일.
- yfinance 불안정 시 대비: 실패 종목은 스킵하고 리포트에 "데이터 미수집" 표기 (전체 실패 아님).

### indicators.py
- 입력: 일봉/분봉 DataFrame. 출력: 지표 JSON.
- MA(10, 20, 60, 120, 200) + 각 MA 대비 이격률, 정배열/역배열 여부
- RSI(14) + 최근 5일 방향
- 거래량: 당일/20일 평균 비율, 거래대금
- 타임프레임별 수익률: 1M/3M/6M/12M/3Y
- 국면 판정 플래그(룰 기반 1차): 상승추세(20MA>60MA 우상향), 눌림목(추세 중 10~20MA 터치 후 반등), 과열(RSI>70 + 이격 과대), 하락추세

### scorer.py
- 입력: 전 종목 지표 + `signal_rules` active 버전. 출력: 종목별 점수 + 슬롯별 분석 대상 선정.
- 선정 로직: `always_brief` 종목 전원 + 점수 상위 종목, **합계 최대 8종목** (사용량 예산).
- 이벤트 리스크 반영: `event_calendar`에 당일 밤 실적발표가 있으면 BUY 후보에서 감점/제외 플래그.

### deck_builder.py
- python-pptx 고정 템플릿. 간이 슬롯용.
- 구성: 표지(슬롯명·시각) 1장 → 시장 개요 1장 → 종목 카드 1장씩(최대 8장) → 성적표 요약 1장.
- 종목 카드에 mplfinance로 생성한 일봉 차트 PNG(MA 오버레이) 삽입.
- 입력은 Claude가 출력한 판단 JSON — Claude는 슬라이드를 만들지 않고 내용만 채운다.

### notify.py
- 텔레그램 sendMessage(3줄 요약) + sendDocument(pptx).
- 요약 형식: `[슬롯명] 선정 N종목 | BUY후보: A, B | 주의: C(실적발표) | 상세는 첨부`

### archive.py
- snapshot, report, signal을 Supabase에 적재. 실패 시 로컬 `data/fallback/`에 JSON 보존 후 다음 실행 시 재시도.

### grade_signals.py
- 매 영업일 장 시작 40분 후 실행. 전일 signal_log의 미채점 건에 익일 시가/고저/갭률 기록.
- outcome 판정(초기 룰): BUY 신호 기준 갭 +1% 이상 WIN, -1% 이하 LOSE, 사이 NEUTRAL. 추후 튜닝.

### install_schedule.py
- `schedule_slots` 테이블 → launchd plist 생성/등록/제거 동기화.
- 슬롯 변경 후 이 스크립트만 재실행하면 반영 (기능 4의 구현체).

### run_slot.sh
```bash
#!/bin/bash
# usage: run_slot.sh <slot_id>
# [1] python -m engine.pipeline --slot $1     → data/runs/{date}/{slot}/snapshot.json
# [2] claude -p "$(cat engine/prompts/slot_analysis.txt)" \
#       --allowedTools "Read,Write,WebSearch,WebFetch" \
#       → data/runs/{date}/{slot}/analysis.json
# [3] slot_type=quick  → python -m engine.deck_builder
#     slot_type=detail → claude -p (pptx 스킬로 상세 리포트)
# [4] python -m engine.notify
# [5] python -m engine.archive
# 각 단계 실패: 텔레그램 에러 알림 후 중단. 로그는 data/logs/에 보존.
```

---

## 5. 신호 규칙 초기값 (`signal_rules.rules` JSONB)

사용자 매매 패턴(종가 매수 → 익일 시초 매도) 전용. **모든 수치는 성적표 데이터로 튜닝하는 대상.**

```json
{
  "close_buy": {
    "trend":        {"cond": "close > MA20 AND MA20 slope(5d) > 0 AND MA60 slope(20d) > 0", "weight": 25},
    "pullback":     {"cond": "최근 5일 내 low가 MA10~MA20 구간 터치 후 종가 반등", "weight": 20},
    "rsi":          {"cond": "40 <= RSI14 <= 65", "weight": 15},
    "volume":       {"cond": "당일 거래량 >= 20일 평균 x 1.2", "weight": 15},
    "flow_kr":      {"cond": "14시 이후 외인+기관 합산 순매수 (KR 전용)", "weight": 15},
    "close_strength": {"cond": "종가가 당일 고저 범위 상위 40% 이내 마감", "weight": 10},
    "exclude_hard": ["당일 밤 실적발표", "MA200 하회 + 역배열", "당일 -5% 이상 급락"]
  },
  "open_sell": {
    "gap_up_strong": {"cond": "갭 >= +2%", "action": "시초 분할 매도 우선"},
    "flat":          {"cond": "-1% < 갭 < +2%", "action": "첫 30분 고점 이탈 시 매도"},
    "gap_down":      {"cond": "갭 <= -1%", "action": "손절 기준 제시 (전일 저가 이탈)"}
  },
  "score_threshold": {"strong_buy": 75, "watch": 55}
}
```

---

## 6. 리포트 구성 명세

### 종목 카드 (Claude 출력 JSON → 덱 1장)
```json
{
  "ticker": "005930", "name": "삼성전자", "market": "KR",
  "signal": "BUY|SELL|HOLD|AVOID",
  "confidence": "HIGH|MID|LOW",
  "entry_zone": {"low": 71000, "high": 71800},
  "indicators_summary": "RSI 58(상승 3일차) · 20MA 이격 +1.2% · 거래량 20일比 1.4배",
  "relative_strength": "종목 +2.1% vs 테마 +0.8% vs KOSPI +0.3%",
  "phase": "눌림목 반등 초입 (3M 상승추세 유지)",
  "news_summary": ["핵심 뉴스/이슈 최대 3줄, 각 출처 포함"],
  "bull_case": "매수 논리 2줄",
  "bear_case": "이 판단이 틀릴 수 있는 이유 2줄 — 필수, 생략 금지",
  "event_flags": ["D+2 실적발표"],
  "pattern_fit": "종가매수→시초매도 관점 코멘트: 오버나잇 갭 요인 평가"
}
```

### 간이 덱 (quick 슬롯, deck_builder.py 렌더)
표지 → 시장 개요(지수·테마 흐름·주요 매크로 1장) → 종목 카드(최대 8장) → 전일 신호 성적 요약(1장)

### 상세 리포트 (detail 슬롯, Claude pptx 스킬)
1. 표지 + 오늘의 결론 (Executive Summary)
2. 시장 종합: 지수 흐름, 수급, 매크로 이벤트
3. 테마별 흐름: 등록된 테마 전체의 당일·최근 상대 성과 (기능 3)
4. 선정 종목 상세: 카드 내용 + 다중 타임프레임(1M/3M/6M/12M/3Y) 차트 해석 + 시나리오
5. 익일 전략: 종가매수 후보 최종안 / 보유 시 시초매도 시나리오
6. 신호 성적표: 누적 적중률 추이
7. 리스크 캘린더: 향후 5영업일 이벤트

---

## 7. 스케줄 초기값 (KST, 미국 서머타임 기준)

| slot_id | cron_kst | market | type | 내용 |
|---|---|---|---|---|
| kr_premarket | 30 8 * * 1-5 | KR | quick | 갭 예상 + 보유종목 시초 대응 |
| kr_open_check | 40 9 * * 1-5 | KR | quick | 개장 흐름 |
| kr_close_buy | 50 14 * * 1-5 | KR | quick | **종가 매수 판단 (최중요)** |
| kr_wrap | 30 16 * * 1-5 | KR | detail | 한국장 상세 리포트 |
| kr_grade | 40 9 * * 1-5 | KR | grade | 전일 KR 신호 채점 |
| us_premarket | 30 21 * * 1-5 | US | quick | 미국 프리마켓 |
| us_close_buy | 30 4 * * 2-6 | US | quick | 미국 종가 판단 |
| us_wrap | 0 7 * * 2-6 | US | detail | 미국장 상세 + 당일 KR 프리뷰 |
| us_grade | 30 22 * * 1-5 | US | grade | 전일 US 신호 채점 |
| weekly_review | 0 10 * * 6 | BOTH | weekly | 주간 성적 + 룰 개선 제안 |

겨울(표준시) 전환 시 US 슬롯 1시간 조정 필요 — `install_schedule.py`에 DST 처리 포함할 것.

---

## 8. 사용량 예산 (Max 5x 준수)

| 항목 | 예산 |
|---|---|
| 슬롯당 Claude 분석 종목 | 최대 8개 (always_brief 포함) |
| 종목당 웹 검색 | 최대 4회 |
| quick 슬롯 | Claude는 판단 JSON만 출력, 슬라이드 생성 금지 (Python 렌더) |
| detail 슬롯 | 하루 2회만 pptx 스킬 사용 |
| grade/채점 | Claude 미사용 (순수 Python) |
| 첫 주 | 사용량 로그 기록 후 슬롯·종목 수 조정 (튜닝 기간) |

---

## 9. 구현 로드맵

| Phase | 범위 | 완료 기준 |
|---|---|---|
| 0 | 코드베이스 탐색·설계 매핑 | 매핑 표 + 확인 질문 + 승인 |
| 1 | DB 마이그레이션 + Python 엔진 | 30종목 파이프라인 60초 내 스냅샷 적재 |
| 2 | 스킬 + run_slot.sh + 간이 덱 | kr_close_buy 슬롯 E2E (텔레그램 pptx 수신) |
| 3 | 스케줄 자동화 + 상세 리포트 + 성적표 | 전 슬롯 1주 무인 운영 + 주간 리포트 1회 |
| 4 (후순위) | 웹 앱 열람 UI, 백테스트 모듈 | 별도 계획 |

---

## 10. 주의사항 및 한계 (명시)

- 이 시스템의 신호는 **의사결정 보조 자료**이며 검증된 예측이 아니다. 뉴스 해석은 LLM 특성상 오류 가능성이 있고, 성적표를 통한 지속 검증을 전제로 사용한다.
- yfinance는 비공식 API로 간헐 장애 가능 — 부분 실패 허용 설계 필수.
- KIS OpenAPI 일일 호출 한도 확인 필요 (Phase 0 질문 항목).
- Mac mini 절전/재부팅 시 launchd 슬롯 미실행 가능 — 재부팅 후 자동 등록 확인 로직 포함.
