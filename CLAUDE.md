# CLAUDE.md — Stock Desk

> **모든 작업 전 `docs/PRD.md`를 기준으로 판단한다. PRD가 본 프로젝트의 유일한 기준 문서다.**

---

## 코딩 규칙 (PRD 16장 — AI Coding Instructions)

1. **TypeScript strict** 모드 유지
2. **RSC 우선**: 서버 페칭은 React Server Component로. 클라이언트 컴포넌트는 시세 폴링·차트·계산기만
3. **Provider 어댑터 패턴**: 외부 API는 `lib/providers/` 인터페이스(`QuoteProvider`, `MetricsProvider`, `NewsProvider`, `CalendarProvider`)로 격리 — 소스 교체 시 어댑터만 수정
4. **금액은 정수(원·센트) 또는 decimal.js** — 부동소수점 연산 금지
5. **시간은 UTC 저장, KST/EST 표시 변환** — 개장시간·휴장일은 `lib/utils/market-hours.ts`에서 단일 관리
6. **KIS 토큰·레이트리밋은 `lib/providers/kis/client.ts`에서 중앙 관리** — 토큰 24h 캐시(Redis 또는 DB), 요청 큐(초당 20건)
7. **에러**: 도메인 에러 클래스 + 한국어 사용자 메시지
8. **AI 프롬프트는 `lib/ai/prompts/`에 버전 관리** (analysis.v1, briefing.v1 …)
9. **커밋 전 `tsc --noEmit` + ESLint 필수 통과**
10. **환경변수는 서버 전용** — `NEXT_PUBLIC_`에 키·시크릿 노출 금지. 사용자별 키(KIS/OpenAI/Anthropic)는 DB 암호화 컬럼(AES-256)에 저장

---

## Decision Log 요약 (D1~D10 — 상세는 PRD 0장)

| # | 결정 |
|---|------|
| D1 | 1인 전용 시작, 멀티유저-ready (user_id + RLS 전면 적용, 키는 사용자별 암호화 저장) |
| D2 | PC 중심 + Tailwind 반응형 모바일 (사이드바 ↔ 하단탭, lg=1024px 분기) |
| D3 | 시세 = KIS OpenAPI 단일 소스 (한·미, 조회 전용). MVP REST 폴링 5~10초, V1.5 WebSocket |
| D4 | AI 자동 분석 일 2회 기본(08:30/22:00 KST), 시간·횟수 설정 가능 + 수동 실행 |
| D5 | 모의투자 시드 KRW 1,000만 + USD $10,000. 리셋 시 시즌 아카이브. 장외 주문 = 예약 → 개장 시초가 체결 |
| D6 | 가격 알림(F10) 제거 |
| D7 | MVP: F11 위젯·F12 공시·F13 노트·F15 배당 / V1: F14 / V2: F16·F17 |
| D8 | 뉴스 갱신 장중 3h / 장외 6h |
| D9 | 펀더멘털 소스(W3): 미국 재무=Finnhub, 미국 배당=FMP, 미국 공시=SEC EDGAR, 한국=DART(+KIS 시세지표 보강). 공시 AI 1줄 요약은 W3 골격만(실호출 W4) |
| D10 | 뉴스·AI(W4): 한국 뉴스=네이버, 미국 뉴스=Finnhub. AI(요약·감성·공시요약·브리핑)=OpenAI gpt-4o-mini(Vercel AI SDK). AI 호출은 수동 갱신 트리거, 자동 크론은 골격만(배포 후 등록) |
| D16 | 정기 배치 분석 엔진: TypeScript(`lib/engine/`·`scripts/engine/`), LLM은 `claude -p` 헤드리스 전용, 실행은 로컬 launchd, 산출물은 pptx가 아닌 슬라이드 PNG(앱 `/reports` 열람), 저장 루트는 외장 볼륨 지정 가능 |
| D18 | 텔레그램 슬롯 알림: 봇 토큰은 신규 테이블 `engine_telegram`에 AES-256 암호화 저장, chat id는 `getUpdates` 자동 획득(수동 입력 없음), 알림은 슬롯별 on/off + 켜진 슬롯은 슬라이드 전량을 사진 미디어그룹 발송, 실패 알림은 on/off 무관 항상 발송 |
| D19 | 슬라이드 원격 저장: 원본을 **WebP q82**로 Supabase Storage(`analysis-slides`)에 적재하고 앱은 서명 URL 302로 서빙(썸네일 폴백). 보존은 원본 `engine_settings.retention_days`(0=무제한) · `market_snapshots` 90일이며 `lib/engine/retention.ts`가 단일 출처. 스키마 변경 없음 |

**스펙 변경 규칙**: 개발 중 결정 변경이 발생하면 임의 결정하지 말고 사용자 승인 후 `docs/PRD.md`의 Decision Log에 **D9부터 추가 기록**한다.

---

## 폴더 구조

**PRD 17장의 폴더 구조를 따른다.** 유틸은 `lib/utils/`, 외부 API는 `lib/providers/`, 크론 잡은 `lib/cron/jobs/`, 마이그레이션은 `supabase/migrations/`.

---

## 분석 엔진 (lib/engine/ · scripts/engine/)

정기 배치 주식 분석 엔진 (D16). 상세 설계: `docs/handoff/01_DESIGN.md`, 결정 사항: PRD 0장 D16.

### 핵심 규칙
- **역할 분리 절대 원칙**: 지표 계산·필터링·슬라이드 렌더링은 코드(`lib/engine/`), 뉴스 해석·판단·서술은 `stock-analysis` 스킬. LLM에게 계산을 시키거나 코드에 판단 로직을 넣지 마라.
- **비용 제약**: Anthropic/OpenAI API 직접 호출 금지. 엔진의 LLM 작업은 반드시 `claude -p` 헤드리스만. 유료 데이터 API 추가 금지(KIS·Yahoo만). 기존 웹앱의 OpenAI 경로(D10)와는 별개 트랙이다.
- **산출물은 pptx가 아니라 슬라이드 PNG**. 정의(`analysis_reports.slides`)가 단일 원천이고 렌더는 자기완결 HTML + Playwright. 배치가 Next 서버에 의존하게 만들지 마라.
- **사용량 예산**: 슬롯당 분석 종목 수·종목당 웹 검색 횟수는 `engine_settings`에 있고 앱 [설정]에서 바꾼다.
  마이그레이션 기본값은 8개/4회, **운영 DB 현재값은 10개/5회**(2026-08-10 확인)다. 숫자를 이 문서에서 읽지 말고
  `engine_settings`를 봐라 — 여기 적힌 값은 드리프트한다. 예산 상향은 사용자 승인 필요.
  눌림목 관찰 종목은 **상위 3개만 코멘트, 웹 검색 금지**(지표 해석만).
- **관찰 레이더는 별개 트랙**: 점수 상위 8종목(진입 후보)과 섞지 마라. 이미 선정된 종목은 관찰 표에서 제외한다.
- **규칙은 새 버전으로만 저장**: `signal_rules` 기존 행 수정 금지(버전별 성적 비교의 전제). API도 덮어쓰기를 제공하지 않는다.
- **지표에 재평가 가능한 원자료를 남긴다**: `touchBarsAgo`·`recoveredAboveMa10`처럼 규칙을 바꿔도 스냅샷만으로
  다시 판정할 수 있는 값을 적재해야 미리보기가 시세를 재조회하지 않는다.
- **기존 코드 보호**: 기존 테이블 스키마 변경 금지(신규 테이블 추가만). 예외는 승인된 `watchlist_items.always_brief` 하나. 기존 Vercel 크론(`lib/cron/dispatch.ts`)은 엔진과 무관하게 유지한다.
- **server-only 주의**: `scripts/engine/*`는 tsx로 직접 실행되므로 `server-only`를 import하는 모듈을 쓸 수 없다. 공용 로직은 `lib/utils/crypto-core.ts`처럼 가드 없는 코어로 분리하고 웹 경로만 가드를 씌운다.
- **시크릿**: 하드코딩 금지. 기존 시크릿 관리 방식(.env.local + DB 암호화 컬럼)을 따른다.

### 사용자 매매 컨텍스트
- 매매 패턴: 종가 매수 → 익일 시초 매도 (오버나잇 갭 전략). 모든 신호 설계·튜닝은 이 패턴 기준.
- 매매는 사용자가 직접 실행한다. 엔진은 분석 자료만 만든다. 주문 관련 기능을 추가 제안하지 마라.

### 자주 쓰는 작업
- 초기 시드(기본 슬롯·규칙 v1): `npx tsx scripts/engine/seed-engine.ts`
- 슬롯 수동 실행: `./scripts/engine/run-slot.sh kr_close_buy`
- 파이프라인만 검증: `npx tsx scripts/engine/pipeline.ts --test` (2종목) / `--bench` (30종목 성능)
- 스케줄 동기화: `npx tsx scripts/engine/install-schedule.ts` (`--dry`·`--status`·`--remove`)
- 신호 채점: `npx tsx scripts/engine/grade-signals.ts` / 성적 집계: `grade-report.ts --slot <id> --days 7`
- 만료 정리 미리보기: `npx tsx scripts/engine/purge.ts --dry` (실행은 `--dry` 없이. 슬롯 실행 시 자동으로 마지막에 돈다)
- 과거 리포트 원본 backfill: `npx tsx scripts/engine/backfill-slides.ts --dry` (로컬 `html/`에서 재캡처 → WebP 업로드)
- **설정은 앱에서**: `/reports` → [설정] 탭 (슬롯 시각·선정 규칙·관찰 규칙·테마·저장/예산). SQL 직접 수정 불필요.
- 종목 단위 플래그: `/stocks` 카드의 📢 항상 브리핑(`always_brief`) · ⌖ 관찰 고정(`radar_pin`) 토글
- 슬롯 시각 변경 후에는 [스케줄 반영] 버튼(또는 `install-schedule`)을 눌러야 launchd에 반영된다
- 신호 룰 변경: 편집 후 [새 버전으로 저장] — 기존 행 수정 금지 (성적 비교 위해 이력 보존)
- 텔레그램 연결: `/reports` → [설정] 탭 → 텔레그램 섹션에서 @BotFather로 받은 토큰을 입력하고, 안내된 봇에게 텔레그램에서 [시작]을 눌러야 연결이 완료된다(chat id 수동 입력 없음)

### 장애 대응
- 슬롯 실패 시 텔레그램 에러 알림이 발송된다. 로그: `data/logs/{date}/{slot}.log`
- `TypeError: fetch failed`가 연속으로 나면 **백오프를 늘리지 마라.** 이 기기의 Wi-Fi 경로가 대용량
  요청에서 TLS 레코드를 손상시키고(환경 문제, 일시적), Node 내장 fetch가 그때 죽은 HTTP/2 세션을
  프로세스 끝까지 붙들어 남은 요청이 전부 죽는다(107초 대기에도 회복 안 됨). 배치는
  `scripts/engine/http-dispatcher.ts`의 undici Agent를 거치므로 회복된다 — 새 배치 경로에서
  Supabase 클라이언트나 fetch를 직접 만들면 이 보호를 잃는다.
- Supabase 적재 실패분은 `data/fallback/`에 남고 다음 실행에서 재시도한다.
- 시세 부분 실패는 정상 동작이다(해당 종목만 "데이터 미수집" 처리).
- 지정 저장 볼륨이 연결돼 있지 않으면 기본 경로로 저장되고 `storage_state='fallback'`으로 표시된다.
- 슬라이드 저장 루트는 `SLIDE_STORAGE_ROOT`(.env.local → 패키징 시 `app.env`)로 고정한다. 비워두면
  배치는 리포지토리, 데스크톱 앱은 앱 번들 안을 가리켜 앱에서 슬라이드를 못 읽는다.
  단 DB(`engine_settings.slide_storage_root`)가 env보다 우선하므로, 앱 [설정]에서 지정한 값이 최종이다.
- `npm run app:dist` 산출물은 `$HOME/stock-desk-dist`에 나온다(`ELECTRON_OUT_DIR`로 변경 가능).
  외장 exFAT 볼륨에 패키징하면 asar 무결성 해싱이 방금 쓴 파일을 되읽다 간헐적으로 깨진다.

### 코드는 외장 볼륨, 산출물은 홈 (macOS TCC)

리포지토리가 `/Volumes/...`에 있으면 백그라운드 launchd 잡은 **볼륨에 쓸 수 없고, bash는 볼륨의
스크립트를 읽지도 못한다**(EPERM → exit 126). node/npx는 같은 파일을 읽고 실행할 수 있다. 그래서:

- 쓰기 산출물(슬라이드·로그·적재 대기 큐)의 루트는 `STOCK_DESK_DATA_DIR`(기본 `<cwd>/data`)이며,
  이 환경에서는 `~/StockDesk`로 지정돼 있다. 새 쓰기 경로를 추가할 때 `process.cwd()`를 쓰지 말고
  `lib/engine/data-dir.ts`의 `dataDir()`을 거쳐라.
- launchd가 직접 여는 것(`WorkingDirectory`·`StandardOutPath`·실행할 스크립트)은 전부 홈에 둔다.
  `install-schedule.ts`가 `~/StockDesk/bin/run-slot-launchd.sh` 런처를 생성하고 plist는 그것을 가리킨다.
  런처가 리포지토리로 `cd` 한 뒤 `npx tsx`로 넘긴다(cd·node 실행은 허용된다).
- 슬롯이 설정 시각에 안 돌면 먼저 `install-schedule.ts --status`와
  `launchctl print gui/501/com.stockdesk.slot.<id> | grep 'last exit code'`를 본다.
  78=EX_CONFIG(launchd가 경로를 못 엶), 126=실행 권한 거부.

---

## 검증 명령

```bash
npx tsc --noEmit   # 타입 체크
npm run lint       # ESLint
npm test           # 단위 테스트 (vitest)
```
