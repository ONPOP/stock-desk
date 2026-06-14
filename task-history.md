# Task History — Stock Desk

## 2026-06-13 · W1 구현 (1차)

### 완료
- Next.js 15.5 + TS strict + Tailwind v4 + shadcn/ui 셋업, PRD 17장 폴더 구조
- `CLAUDE.md` 생성 (PRD 16장 규칙 + D1~D8 요약)
- DB 마이그레이션 `supabase/migrations/0001_init.sql` — PRD 9장 전체 17테이블 + RLS + 가입 트리거(기본설정·스케줄 08:30/22:00) + `paper_positions` 뷰 + `kis_token_cache`
- KIS 클라이언트 `lib/providers/kis/` — 토큰 24h 캐시(인메모리/Supabase), 발급 병합(1분 1회 보호), 레이트리밋 큐(초당 20건·FIFO·포화 거부), 현재가(국내/해외)·캔들(1m/1d/1w)·종목마스터 파서·검색
- 설정 화면 S8 — 키 입력(AES-256-GCM 암호화 저장)·마스킹 표시·KIS 검증 버튼, `/api/settings`(GET/PATCH)·`/api/settings/validate-kis`
- 레이아웃 — PC 사이드바 / 모바일 하단 탭 (lg=1024 분기), 로그인 게이트(middleware)
- 스크립트: `verify:kis`(부록 A 검증, rsym D/R로 실시간·지연 판별), `db:migrate`, `create:user`, `sync:master`

### 테스트 결과
- vitest 109/109 (비정상: 암호문 변조, 키 불일치, 큐 포화, EGW00123/00133/00201, 주입 문자열, mass-assignment 등)
- 종목마스터 실데이터 파싱 15,528종목 OK
- 로컬 PG(16.13)에 마이그레이션 실적용 + RLS 격리·제약조건 12시나리오 OK
- Playwright 로그인 UI 10/10 (데스크톱·모바일·비정상 입력)
- `tsc --noEmit` / ESLint / `next build` 통과

### 보류 (사용자 키 필요 — .env.local)
1. `npm run db:migrate` — 실제 Supabase 적용 (SUPABASE_DB_URL)
2. `npm run create:user -- <email> <pw>` — 계정 생성
3. `npm run verify:kis` — KIS 실서버 검증 + 해외시세 실시간 여부 확인 (KIS_APP_KEY/SECRET)
4. `npm run sync:master` — 종목마스터 DB 적재
5. 실계정 로그인 후 설정 화면 E2E (사이드바/하단탭 시각 확인 포함)

### 메모
- `dev:e2e` 스크립트는 더미 Supabase URL을 주입하는 라우팅 테스트 전용 — 평소엔 `npm run dev`
- 로컬에 Docker 없음 → Supabase 로컬 스택 불가, Homebrew PG로 마이그레이션 검증함
- W2 진행은 사용자 승인 후

## 2026-06-13 · 보안 가드 (시크릿 로그 노출 차단)

### 배경
- `db:migrate` 실행 시 postgres 라이브러리가 연결 문자열 파싱 실패 → 에러 객체의 `input` 속성에 담긴 비밀번호가 stdout에 평문 노출됨 (원인: `postgres()` 호출이 try 밖에 있어 unhandled로 Node가 전체 객체 덤프)

### 조치
- `lib/utils/redact.ts` — 값 기반(env 시크릿 일치) + 구조 기반(`user:pw@host` 패턴) 이중 마스킹. Error의 stack·커스텀 속성까지 펼쳐 처리. 비밀번호 인코딩/디코딩 양형(%40↔@) 모두 등록
- `scripts/_bootstrap.ts` — 공통 진입점: dotenv 로드 + `uncaughtException`/`unhandledRejection` 전역 핸들러로 어떤 경로의 throw든 마스킹 후 종료
- 4개 스크립트(`apply-migrations`/`create-user`/`sync-stock-master`/`verify-kis`) dotenv → `_bootstrap` 교체
- `apply-migrations.ts` — `postgres()` 호출을 try 안으로 이동, catch에서 `redactSecrets` 적용
- `lib/utils/redact.test.ts` — 13케이스(실제 노출 사고 재현 포함). 가짜 시크릿 주입 실증으로 `input: ••••` 마스킹 확인

### 사용자 필수 조치 (보안)
- 노출된 DB 비밀번호는 폐기 대상 → Supabase에서 **Reset database password** 후 `.env.local` 갱신 (특수문자 없는 비밀번호 권장 = URL 인코딩 불필요)

## 2026-06-13 · Yahoo Finance 임시 폴백 어댑터

### 배경
- KIS OpenAPI 발급이 한국투자증권 이슈로 지연 → 시세 흐름 검증을 위한 무인증 임시 소스로 Yahoo Finance 채택
- **D3(KIS 단일 소스) 정식 변경 아님** — 개발용 폴백. KIS 발급 시 복귀. PRD 미변경

### 구현 (`lib/providers/yahoo/`)
- `symbol.ts` — ticker+market ↔ Yahoo 심볼(.KS/.KQ/미국 무접미사), 거래소코드→Market 역매핑(NMS/NYQ/ASE/KSC/KOE), currencyOf
- `client.ts` — 무인증 fetch 래퍼, 타임아웃·UA·비JSON 방어, **query1↔query2 미러 폴백**(429/5xx 재시도, 4xx 즉시 실패)
- `quote.ts` — chart 엔드포인트로 현재가(v7/quote는 crumb 필요해져 회피)·캔들, 등락률 decimal.js 계산, OHLC 최소단위 정수 변환, null 캔들 제외
- `search.ts` — v1/finance/search, EQUITY 필터 + 지원시장만, 한글명 자동 분류
- `index.ts` — `YahooQuoteProvider implements QuoteProvider` (KIS와 동일 인터페이스, 호출부 무변경)

### 테스트 (141/141 전체 통과)
- `symbol.test.ts` 9 + `quote.test.ts` 14 (비정상: chart.error/빈result/현재가누락/비JSON/404즉시실패/429폴백소진/429→query2폴백성공/0나눗셈/null캔들제외)
- 라이브 검증: AAPL 정상(price 29113센트, change -450, rate "-1.52"), 005930.KS curl로 응답구조·322500 KRW·KSC 확인

### 운영 특성 (주의)
- Yahoo 비공식 API는 **IP 단위 레이트리밋(429)**이 있어 단시간 다발 호출 시 차단. 미러 폴백으로 완화하나 두 미러 동시 429면 대기 필요. PRD 5~10초 폴링 빈도에선 무난

## 실서버 검증 진행 (2026-06-13)

### 해결됨 — SUPABASE_DB_URL IPv6 문제
- `db.xxxx.supabase.co` 직접 연결이 IPv6 전용이라 IPv4 네트워크에서 `ENOTFOUND` → **Session Pooler 주소**(`postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres`)로 교체해 해결

### 완료된 실서버 단계
1. ✅ `db:migrate` — 0001_init.sql 적용 (17테이블 + RLS + 트리거)
2. ✅ `create:user` — onpoplive@gmail.com 생성, 트리거가 기본설정(seed 1천만원/$1만)·스케줄(08:30/22:00) 자동 생성 확인
3. ✅ `sync:master` — 15,528건 적재 (KOSPI 1796/KOSDAQ 1778/NASDAQ 5168/NYSE 2422/AMEX 4364), 삼성전자·카카오·애플 종목명 정상
4. ⏸ `verify:kis` — KIS 키 발급 후 보류

### 미해결 — NEXT_PUBLIC_SUPABASE_URL 형태 오류 (사용자 조치)
- `.env.local`의 값이 `https://xxxx.supabase.co/rest/v1/`로 되어 있음 → supabase-js는 **base URL만** 받아야 함(`/rest/v1/`·`/auth/v1/`은 라이브러리가 자동 부착). 중복되어 `Invalid path` 오류
- create:user/sync:master는 올바른 URL 임시 주입으로 우회 진행함
- **사용자가 `.env.local`에서 `/rest/v1/` 제거 필요** → `https://xxxx.supabase.co`. 안 고치면 **브라우저 로그인 E2E(5단계)·앱 전체가 깨짐**

### 로그인 계정
- ID: onpoplive@gmail.com / 비번: 세션에서 임의 생성해 사용자에게 전달함(저장소엔 미기록)

### Yahoo 어댑터 — 앱 연결은 W2
- 어댑터 완성·검증 완료. 실제 시세 화면(F5/F11) 연결 + KIS/Yahoo 자동선택 팩토리는 W2에서 시세 기능과 함께. 현재 시세 표시 화면 자체가 없어 지금 붙일 대상 없음

## 2026-06-13 · W1 실계정 E2E 마감 + W2 종목 코어 구현

### W1 마감 (실계정 로그인 E2E)
- dev 서버(`npm run dev`, autoPort) + 실 Supabase 연결로 onpoplive@gmail.com 로그인 → `/` 리다이렉트 → 대시보드 + PC 사이드바 렌더 확인. 인증 게이트·세션·레이아웃 실서버 검증 완료
- launch.json을 `dev:e2e`(더미) → `dev`(실 Supabase)로 교체, autoPort 적용

### W2 — 종목 코어 (PRD 19장)
- **시세 인프라**: `lib/providers/quote-source.ts`(KIS 키 있으면 KIS, 없으면 Yahoo 폴백 팩토리), `quote-cache.ts`(6초 TTL + stale fallback으로 Yahoo 429 완화), 시세 폴링 훅 `lib/hooks/use-quote.ts`(5~10초·탭 숨김 시 중단)
- **API**: `/api/quote`, `/api/candles`, `/api/stocks/search`, `/api/watchlist`(GET/POST/DELETE), `/api/market-indices`. 입력검증 `lib/validation/market.ts`(ticker/market/interval/count 주입·경계 차단)
- **F3 검색·등록**: `components/stocks/{stock-search,watchlist-card,watchlist-manager}.tsx` + `app/stocks/page.tsx`(RSC). 디바운스 검색, 시장 뱃지, 중복 등록 방지, 그룹별 그리드, 낙관적 업데이트+롤백
- **종목 상세 + F6 차트 + F8 계산기**: `app/stocks/[ticker]/page.tsx`(?market=), `components/stocks/{stock-detail,price-chart,profit-calculator}.tsx`. 차트=lightweight-charts v5 캔들+거래량 기간 6단(1일~5년), 계산기=현재가 자동·수익률↔목표가 양방향
- **F11 시장 위젯**: `lib/providers/yahoo/market-index.ts`(7지수 ^심볼, 30초 캐시+stale), `components/dashboard/market-widget.tsx`, 대시보드 삽입
- 워치리스트 쿼리 `lib/supabase/queries/watchlist.ts`, 종목 조회 `queries/stocks.ts`, 표시용 `minorToMajorNumber`

### 검증
- tsc·lint clean, 단위 테스트 **154/154**(market 검증 13 추가: 티커 주입·경계, market/interval/count, 워치리스트 스키마)
- 실DB E2E: 종목 검색(삼성전자→005930 등) → 등록 → 워치리스트 카드·그룹 렌더 확인
- UI 구조: 종목 상세(헤더·차트탭·계산기·TradingView 마운트), 시세 실패 시 graceful 에러(앱 무손상) 확인 = 비정상 케이스 검증
- **시장 위젯 실데이터 렌더 확인**: S&P500·NASDAQ 실시간 값·등락 표시(Yahoo 부분 회복 시), allSettled graceful degradation 작동

### Yahoo 운영 이슈
- 세션 중 과다 호출로 Yahoo IP 레이트리밋(429) 장기화 → 종목 quote/candles 실데이터 시각검증 일부 보류. 시장위젯과 동일 `fetchYahooJson`+chart 엔드포인트라 회복 시 동작 보장. KIS 키 입력 시 KIS로 자동 전환되어 근본 해소

## 2026-06-13 · macOS 데스크톱 앱 (Electron)

### 구조
- Next.js `output: 'standalone'` + Electron으로 패키징. Electron 메인(`electron/main.js`)이 standalone 서버를 자식 프로세스로 fork(빈 포트 자동 할당)하고 BrowserWindow가 로드. 앱 종료 시 서버 정리
- 시크릿: `.env.local` → 빌드 시 `app.env`로 번들(extraResources). 메인이 런타임에 파싱해 서버에 env 주입(본인 전용 머신 — 사용자 승인)
- `scripts/electron-prepare.js`: standalone에 static·public 복사 / `scripts/electron-after-pack.js`: electron-builder가 제외하는 node_modules를 패키징 후 복사

### 빌드 명령
- `npm run app:build` — next build(standalone) + 준비
- `npm run app:dev` — 빌드 후 Electron 실행(개발 확인)
- `npm run app:dist` — `.dmg` 생성 (`dist-electron/Stock Desk-0.1.0-arm64.dmg`)

### 검증
- standalone 서버 직접 실행 → /login HTTP 200·"Stock Desk" 렌더 확인
- `.app` 실행 → Next.js 서버 자동 시작·포트 리스닝 확인(node_modules 누락 버그 afterPack으로 해결)
- 산출물: `.dmg` 221MB, `.app` 715MB, app.env 시크릿 포함

### 주의
- Apple Silicon(arm64) 전용 빌드. Intel Mac은 `--x64` 별도 필요
- 코드사인 없음(identity:null) → 첫 실행 시 우클릭→열기로 Gatekeeper 우회
- 인터넷 필요(Supabase 클라우드 + 시세). 데스크톱화는 "실행 편의"이지 오프라인 전용 아님
- `output: 'standalone'`은 `npm run dev`·Vercel 배포에 영향 없음(production build 전용 모드)

## 2026-06-14 · V1 (F2 캘린더·F7 AI분석·F9 모의투자·F14 기술지표)

### 결정
- F7=**OpenAI 단일**(Anthropic 듀얼 추후, 비교뷰는 한쪽), F7 자동분석=**수동 1클릭+크론 골격**(비용 통제). F9=D5(시드 KRW1000만+$1만, 장중 시장가·장외 예약→시초가, 시즌 리셋 아카이브)

### 구현 (신규 마이그레이션 없음 — 0001 테이블 재사용)
- **F14 기술지표**: `lib/utils/indicators.ts`(SMA·RSI Wilder) + `price-chart.tsx`에 이평선(5/20/60/120) 오버레이·RSI(pane1)·토글
- **F2 캘린더**: `lib/data/macro-events.ts`(2026 거시 시드), `finnhub/earnings.ts`(실적 캘린더), `queries/calendar.ts`(listEvents·create·delete·replaceBySource), `services/calendar.ts`(시드+워치리스트 실적 교체), API `/api/calendar`, `app/calendar` 월 그리드(유형 색·"(예정)"·수동 추가)
- **F7 AI 듀얼분석**: `ai/prompts/analysis.v1.ts`(스키마 position/confidence + md 변환), `ai/analyze.ts`, `queries/analyses.ts`, `services/analysis.ts`(주가·F4·F5·노트·직전 컨텍스트→AI→저장+usage), API `/api/stocks/[ticker]/analysis`, `analysis-panel.tsx`(포지션 뱃지·신뢰도·면책), `cron/jobs/analysis.ts` 골격
- **F9 모의투자**: `queries/paper.ts`(ensureSeason 시드 자동생성·getPaperState·계좌/포지션/거래·체결 CRUD), `services/paper.ts`(장중 시장가 즉시 체결·장외 예약·시즌 리셋), `validation/paper.ts`, API `/api/paper`, `app/paper`(계좌·포지션·주문·타임라인·리셋), `cron/jobs/settle.ts` 골격. 평단가=paper_positions 뷰(가중평균), 잔고=cash_not_negative 이중 방어
- 디스패처에 settle(개장)·analysis(주석) 연결

### 검증
- tsc·lint clean, 단위 테스트 **256/256**(V1 +15: indicators SMA/RSI 단조·경계, paper 주문 검증, finnhub earnings 파서, analysis 스키마/프롬프트/md)
- `next build` 통과(`/calendar`·`/paper`·`/api/paper`·`/api/stocks/[ticker]/analysis` 등록)

### 보류 (사용자/배포)
- DB 0003·0004 적용 + 앱 재빌드 → 노트·사용량·캘린더·모의투자 동작
- Anthropic 키 발급 시 F7 듀얼 비교뷰, 자동 크론 스케줄(Vercel Cron) 등록, 예약주문 settle 완성, F7 스케줄 설정 UI

## 2026-06-14 · W5 마감 (F13 노트·엣지케이스·모바일·API 사용량 로그)

### 구현
- **마이그레이션** `0004_w5_usage.sql` — `api_usage_log`(user_id+log_date+provider PK, calls·prompt/completion_tokens) + RLS(본인 읽기/서비스롤 쓰기). notes는 0001 재사용
- **F13 투자 노트** — `queries/notes.ts`(listNotes 검색·종목필터, create, delete), `validation/note.ts`(1~5000자·UUID·strict), API `/api/notes`(GET·POST·DELETE), `/notes` 페이지 + `notes-client.tsx`(작성·검색·최신순 타임라인·삭제·마크다운), 종목 상세 노트 섹션, 사이드바 메뉴(모바일 하단탭은 5개 유지)
- **API 사용량 로그** — `queries/usage.ts`(recordUsage 증분, getUsageSummary 오늘/이번달), `summarize.ts`가 AI usage(input/output 토큰) 동반 반환, services(news/fundamentals/briefing)에서 AI 호출 후 recordUsage('openai'), 설정 페이지 `usage-card.tsx`
- **엣지케이스** — `app/error.tsx`·`global-error.tsx`(한국어 바운더리+재시도), 종목 상세 거래정지/상폐 뱃지(`stock.is_active`), getStock에 is_active 추가. (토큰 재발급·레이트리밋·휴장일·평단가·graceful은 기존 처리)
- **모바일** — app-shell 사이드바↔하단탭(lg=1024) 기존 구현, 신규 페이지 p-6 스택/grid 1열 폴백 점검

### 검증
- tsc·lint clean, 단위 테스트 **241/241**(W5 +5: note 검증 정상/빈/초과/UUID/strict, AI usage 반환). zod v4 uuid는 RFC variant 엄격(테스트 UUID v4 형식 사용)
- `next build` 통과(`/notes`·`/api/notes` 등록)

### 보류 (사용자/배포)
- DB 0004 적용(`npm run db:migrate`) + 앱 재빌드 → 노트·사용량 동작
- 모바일 실기기 점검, 배포(Vercel) — V1 이후

## 2026-06-14 · W4 뉴스·AI (F5 뉴스·AI 요약/감성·F12 공시요약·F1 브리핑)

### 결정 (D10 신규 — PRD/CLAUDE Decision Log)
- 한국 뉴스=**네이버 뉴스 검색 API**, 미국 뉴스=**Finnhub News**
- AI(뉴스 요약·감성, 공시 1줄 요약, 데일리 브리핑)=**OpenAI gpt-4o-mini** (Vercel AI SDK `ai`+`@ai-sdk/openai`)
- **AI 요약 호출=수동 갱신 트리거**(비용 통제), 자동 크론(D8 3h/6h·브리핑 06:30)은 잡·디스패처 골격만 — 스케줄 등록은 배포 단계

### 구현
- **마이그레이션** `0003_w4_news_ai.sql` — `user_settings`에 `naver_client_id_enc`/`naver_client_secret_enc`. news_items/briefings/disclosures.summary_ai 기존 재사용
- **AI 레이어** `lib/ai/` — `client.ts`(사용자 OpenAI 키 주입 gpt-4o-mini), 프롬프트 버전 파일(`news-summary.v1`/`disclosure-summary.v1`/`briefing.v1`), `summarize.ts`(generateObject 요약+감성/generateText 공시·브리핑 + mapWithConcurrency 동시성 제한)
- **뉴스 어댑터** — `naver/`(client_id/secret 헤더, news.json, HTML 태그·엔티티 제거), `finnhub/news.ts`(company-news), `news-source.ts`(KR=네이버 종목명검색/US=Finnhub, graceful)
- **클러스터링** `lib/utils/cluster.ts` — 제목 토큰 자카드 유사도 룰베이스 중복 제거(대표 1건)
- **수집** `services/news.ts`(fetch→클러스터링→AI 요약·감성→upsert), `queries/news.ts`. F12 공시요약: `services/fundamentals.ts`에 신규 공시 상위 10건 AI 1줄 요약 통합(`getDisclosureUrls`로 중복 호출 방지)
- **F1 브리핑** `services/briefing.ts`(시장지수+워치리스트 뉴스+일정 컨텍스트→AI md, 실패 시 status=failed), `queries/briefings.ts`
- **API** `/api/stocks/[ticker]/news`(GET·POST), `/api/briefing`(GET·POST)
- **크론 골격** `jobs/news.ts`·`jobs/briefing.ts`·`dispatch.ts`(시각 게이팅, 스케줄 미등록)
- **UI** — `news-feed.tsx`(감성 뱃지·필터·원문), `briefing-card.tsx`(react-markdown), stock-detail 뉴스 섹션+뉴스갱신 버튼, 대시보드 BriefingCard, 설정 폼 네이버 카드 + AI/네이버 키 헬퍼(`getOpenaiKey`/`getNaverCredentials`)

### 검증
- tsc·lint clean, 단위 테스트 **236/236**(W4 +25: 네이버/Finnhub 뉴스 파서·HTML제거·RFC822, 클러스터링 자카드/대표선택, AI 프롬프트 스키마·빌더, mapWithConcurrency 순서·부분실패·동시성, AI 래퍼 mock)
- `next build` 통과(`/api/briefing`·`/api/stocks/[ticker]/news` 등록)
- 실 API(`verify:news`): **Finnhub 뉴스 247건 ✅**. 네이버·OpenAI는 .env.local 미등록(설정 화면 DB에만)이라 CLI skip — 앱에서 동작

### 보류 (사용자/배포)
- 네이버·OpenAI 키를 설정 화면에 입력 후 한국 뉴스·AI 요약·브리핑 E2E (앱 "뉴스 갱신"/"지금 생성")
- 자동 크론 스케줄 등록(Vercel Cron `vercel.json`) — 배포 단계
- "이 뉴스로 AI 분석"(F7) 실연동 — V1

## 2026-06-14 · W3 펀더멘털 (F4 핵심지표·F15 배당·F12 공시)

### 결정 (D9 신규 — PRD/CLAUDE Decision Log 기록)
- 미국 재무·실적=**Finnhub**(당초 FMP에서 변경), 미국 배당=**FMP**, 미국 공시=**SEC EDGAR**, 한국 재무·배당·공시=**DART**(+한국 PER/PBR/EPS/시총은 KIS 시세지표 보강)
- F12 공시 AI 1줄 요약은 **W3 골격만**(`summary_ai` nullable로 비움) → 실호출은 W4 뉴스 AI와 통합(유료 호출 회피)

### 구현
- **마이그레이션** `0002_w3_fundamentals.sql` — `user_settings`에 `dart/finnhub/fmp_key_enc`, `stocks`에 `corp_code`(DART 8자리)·`cik`(SEC) + 부분 인덱스. 기존 stock_metrics/dividends/disclosures 테이블 변경 없이 재사용
- **키 저장 확장** — validation/settings 스키마, settings 쿼리(마스킹·암호화·`getDartKey/getFinnhubKey/getFmpKey`), `UserSettingsView`, S8 설정 폼에 "펀더멘털·공시 데이터 소스" 카드
- **어댑터** (`lib/providers/`):
  - `dart/` — client(crtfc_key·RateLimiter·013→NoData/020→한도/010→키오류), corp-code(corpCode.xml zip→fflate), metrics(fnlttSinglAcnt 1회로 3개 연도 매출·영익·순익·부채비율), dividend(alotMatter 보통주 DPS·수익률), disclosure(list.json→유형 라벨 분류)
  - `finnhub/` — client(token·60/min), metrics(profile2 시총+metric 밸류+financials-reported 분기실적+CAPEX, 순수 buildFinnhubMetrics, USD→센트)
  - `fmp/` — client(apikey), dividend(stock_dividend→이벤트별 DPS·배당락/지급일, 주기 추정)
  - `edgar/` — client(User-Agent 필수·10/sec), cik(company_tickers.json), disclosure(submissions→주요 양식 필터·원문 URL)
  - `kis/metrics.ts` — inquire-price output에서 국내 PER/PBR/EPS/시총(억원→원) 보강
  - `fundamentals-source.ts` — 시장별 thunk 팩토리, 키/매핑 없으면 null(graceful)
- **수집·쿼리** — `queries/fundamentals.ts`(읽기 RSC/쓰기 admin, 배당은 소스 단위 교체로 ex_date null 중복 방지), `services/fundamentals.ts`(`refreshFundamentals` 섹션별 부분 실패 허용), `cron/jobs/metrics.ts`(워치리스트 일괄 — 디스패처 등록은 W4)
- **API** `app/api/stocks/[ticker]/fundamentals` GET(DB 조회)·POST(수집 후 반영)
- **UI** — `mini-bar-chart`(무의존 SVG), `metrics-panel`(F4 그리드+매출 추이), `dividend-card`(F15 배당락 D-7 뱃지+연간 추이), `disclosure-feed`(F12 유형 필터+원문 링크), stock-detail "기업 정보" 섹션+갱신 버튼, page.tsx RSC fetch
- **스크립트** `sync:cik`(SEC 무인증, 즉시 실행 가능)·`sync:corp-codes`(DART_API_KEY env 필요)
- eslint config: 빌드 산출물(`dist-electron/**`·`electron/**`·`scripts/electron-*.js`) ignore 추가 (CJS/번들이 TS 규칙과 충돌)

### 검증
- tsc·lint clean, 단위 테스트 **209/209**(W3 +55: DART 금액/분류/날짜/status·Finnhub 변환/빌더·FMP 주기/무배당·EDGAR 양식필터/CIK·KIS 지표·compact money. 비정상: 013 NoData·우선주 제외·overflow·잘못된 날짜·미매핑·비JSON)
- `next build` 통과 (`/api/stocks/[ticker]/fundamentals` 라우트 등록 확인)

### 보류 (사용자 키/DB 권한 필요)
1. `npm run db:migrate` — 0002 적용 (DB 변경이라 사용자 승인 후)
2. `npm run sync:cik` — 미국 CIK 적재(무인증, 즉시 가능)
3. DART 키 발급 후 `.env.local`에 `DART_API_KEY` → `npm run sync:corp-codes`
4. FMP 키 발급 → 설정에서 입력 (미국 배당)
5. 설정에서 Finnhub/DART/FMP 키 저장 → 종목 상세 "갱신"으로 실데이터 E2E
- (선택) `.env.local`에 `SEC_EDGAR_USER_AGENT="이름 이메일"` 권장 (SEC 가이드라인)

### 실 API 검증 (2026-06-14, `npm run verify:fundamentals` 신규 — AAPL 기준)
- ✅ **EDGAR** 공시 수신 / ✅ **Finnhub** 시총 $4.27T·PER 34.88·PBR 40.15·ROE 146.69·분기매출 $111.18B / ✅ **FMP** 배당 16건(분기)
- ❌ **DART** — `.env.local`의 `DART_API_KEY`가 무효(실제 발급 필요). corpCode가 zip 아닌 에러 응답 → 친절 메시지로 처리
- **검증 중 수정 3건:**
  1. **FMP legacy v3 → stable API**: `api/v3/historical-price-full/stock_dividend`가 신규 키에 403("Legacy Endpoint no longer supported") → `/stable/dividends?symbol=`로 전환(D9 범위 내, 소스는 FMP 유지). 응답 frequency·yield 직접 매핑
  2. **Finnhub financials YTD 누적 → 분기 차분**: `financials-reported`의 IS가 분기 단독이 아닌 YTD 누적($254.94B) → 같은 회계연도 인접 분기 차분으로 분기 환산($111.18B). Q1=누적=단독, 직전 결측 시 누적 근사
  3. **RateLimiter unref → CLI 조기종료**: 큐 대기 시 unref 타이머라 스크립트(CLI)에서 동시요청 중 첫 완료 후 ref 핸들 소실로 Node 조기 exit. verify 스크립트에 keepAlive interval 추가(앱/서버는 무영향이라 RateLimiter 미변경)
- 단위 테스트 **211/211**(FMP stable·Finnhub 차분 반영), tsc·lint·build clean

## 2026-06-14 · W4 뉴스·AI·브리핑
- F5 뉴스 — 한국=네이버 뉴스검색 API, 미국=Finnhub News (`lib/providers/{naver,finnhub}`, `news-source.ts`)
- AI(`lib/ai/`) — 뉴스 요약·감성분류·공시 1줄 요약·F1 데일리 브리핑 = OpenAI gpt-4o-mini (Vercel AI SDK). 프롬프트 버전관리(`prompts/*.v1.ts`). 수동 트리거 + 크론 골격
- 0003 마이그레이션(네이버 키 컬럼·뉴스 보강), `/api/briefing`·`/api/stocks/[ticker]/news`

## 2026-06-14 · W5 + V1
- W5: F13 노트(`/notes`·`/api/notes`), API 사용량 로그(0004 `api_usage_log`), `error.tsx`/`global-error.tsx` 바운더리, 거래정지 뱃지
- V1: F2 캘린더(거시 시드+Finnhub 실적), F7 AI분석(OpenAI 단일·수동, `/api/stocks/[ticker]/analysis`), F9 모의투자(D5 시드 KRW1000만+$1만·예약→시초가·시즌), F14 기술지표(SMA/RSI 토글)

## 2026-06-14 · V2 + 배포 인프라 + 배포 마무리
- **V2**: F16 종목 비교(`app/compare`·`components/compare/compare-client.tsx` — 최대 4종목 F4 지표 표), F17 뉴스↔주가 오버레이(`price-chart` 일/주봉에 뉴스 마커 `createSeriesMarkers`). 사이드바에 "비교" 추가(모바일 하단탭 5개 유지)
- **배포 인프라**: `/api/cron/dispatch`(CRON_SECRET Bearer 검증, force-dynamic, maxDuration 60), `vercel.json`(`*/30 * * * *` 단일 디스패처), `docs/DEPLOY.md`(환경변수표·마이그레이션·배포 절차)
- **시스템 반영**: `db:migrate` — 0001~0004 모두 적용 확인(`_migrations`). `next build` 23라우트(`/compare`·`/api/cron/dispatch` 포함) 통과. tsc/lint clean, **vitest 258/258**
- **남음**: `vercel --prod`(사용자 Vercel 계정 연결 필요 — 가이드 `docs/DEPLOY.md`). DART 키 발급 후 `sync:corp-codes`로 한국 펀더멘털/공시 채움(현재 공백)
