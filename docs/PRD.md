# PRD — Stock Desk (가칭) v1.0 [개발 착수 확정본]

> 개인용 주식 투자 보조 프로그램 · 확정일 2026-06-12
> v1.0: 모든 결정 사항(D1~D8) 확정 완료. 본 문서를 기준으로 개발 진행.
> D7 확정 — F12 공시·F15 배당을 MVP에 추가 포함

---

## 0. 확정된 핵심 결정 사항 (Decision Log)

| # | 항목 | 결정 |
|---|------|------|
| D22 | 사용자 종목 등급 A~D (`/stocks` · 마이그레이션 `0022`) | 종목을 조사·분석한 뒤 투자성으로 **A(최상위)~D** 등급을 수동 지정하고 `/stocks`에서 **다중 선택 칩(A·B·C·D·미분류, 미선택=전체)**으로 거른다. 등급은 **탭과 무관한 종목 단위**라 신규 테이블 `user_stock_grades`(PK `user_id, stock_id`, RLS 본인 행)에 둔다 — `watchlist_items`는 탭마다 행이 있어 동기화 문제가 생기고 기존 테이블 변경 금지 규칙에도 걸린다. 기록은 등급 + 한 줄 사유(선택, 100자) + 지정일(`graded_at`, 수정 시 갱신). 종목을 목록에서 빼도 등급은 남아 재등록 시 복원된다. 필터 중에는 드래그 정렬을 막는다(부분 목록 저장 시 순서 충돌). **분석 엔진·종목 상세와는 연동하지 않는다**(엔진의 `ScoreGrade`와 별개). (사용자 승인 2026-09-29) |
| D21 | 대시보드 재구성 · 투자 기록 탭 · 내비게이션 정리 (`app/journal/` · `lib/utils/goals.ts` · 마이그레이션 `0021`) | **① 대시보드**: 상단 시장 지수 위젯(F11)과 하단 '내 종목' 타일을 제거하고, 그 자리(상단)에 **나만의 투자 규칙**(번호 목록, 추가·수정·삭제·순서 변경, 신규 `investment_rules`)과 **이번 달 목표 수익률**(시작 금액·목표 금액(%)·실현 수익률·달성률·남은 금액, 평가손익 포함 수익률은 참고 표시)을 고정한다. 환율 API(`/api/market-indices`)는 원화 환산에 계속 쓰므로 유지한다. **② 투자 기록 탭(`/journal`)** = [매매]·[목표]·[수익 분석] 하위 탭. 기존 '기간별 수익률'(`/performance`)은 [수익 분석]으로 흡수하고 옛 주소는 리다이렉트한다. **[매매]**: 종목 검색 → 실시간 시세 → 매수·매도 기록. 입력 폼은 종목 상세의 `HoldingsTradesPanel`을 그대로 쓰고 같은 `real_trades`에 저장하므로 **종목 상세 매매일지와 자동 연동**된다(스키마 변경 없음). 매매비용(세금+수수료)은 기존처럼 매도 시 **직접 입력**. **[목표]**: 달성 판정은 **실현손익만**(평가금액 제외). **시작 금액 = 월초 예수금 + 보유 매입원가(₩환산) + 월중 입금 − 출금**이며 월초 금액은 수정 가능하다. '예수금 추가'는 기존 `cash_ledger`에 입금으로 기록하고 그 달 시작 금액에 더해진다(수익 아님). **지난 달 기록은 확정(`return_goal_months.closed`)되어 이후 입출금·매매 수정이 과거 달에 영향을 주지 않는다.** **월 목표는 한 번 설정하면 목표 경로를 고정**한다: 설정한 달의 시작 금액 A, 월 r%일 때 k번째 달까지 누적 목표 수익 = A×((1+r)^(k+1)−1), 이번 달 목표 수익 = 누적 목표 − 경로 시작 이후 지난 달 실현손익 합. 따라서 미달하면 다음 달 필요 수익률이 오르고, **다시 설정하면 그 달부터 새 경로**가 시작된다(같은 달 재설정은 덮어씀). 입출금은 목표 수익을 바꾸지 않고 시작·목표 금액만 옮긴다. **연 목표는 별도 설정**(그해 첫 기록 월 시작 금액 × 연 r%, 연간 실현손익으로 달성률). 연도별·월별 과거 기록을 표로 제공. **[수익 분석]**: 월·연 합계는 목표 탭이 맡고, 여기서는 막대 위 **목표 수익선**, 승률, **손익비(평균 이익÷평균 손실)**, **평균 보유일**, **매매비용 합계**, 매도 건별 실현손익을 본다. **③ 내비게이션**: '비교'(F16) 탭은 미사용으로 **코드 삭제**. '실시간'(`/live`)은 **메뉴에서만 제거**(D15 모의계좌 자동매매 tick이 이 화면에서 돌므로 주소로 직접 접근 시 계속 동작). lg(1024px) 미만 하단 탭 = **대시보드·캘린더·내 종목·투자 기록·[더보기]**, 더보기 시트 = 분석 리포트·노트·모의투자·설정(이전에는 하단 탭 5개 밖 메뉴에 접근할 수 없었다). **④ 스키마**: 신규 테이블만 추가(`investment_rules`·`return_goals`·`return_goal_months`, RLS 본인 행). 금액은 원 단위 정수, 수익률은 `numeric`(10진 문자열로 전달). 과거 달의 USD 환산은 확정 시점 환율을 쓰며, 환율을 못 받으면 확정을 미룬다. 적용은 `npm run db:migrate` (사용자 승인 2026-09-29) |
| D20 | `sim_candles` 정리 범위 (`supabase/migrations/0020_drop_unused_sim_index.sql`) | **`sim_candles`의 행은 삭제하지 않는다. 보조 인덱스 `idx_sim_candles_ts`만 제거한다.** 이 테이블은 DB 최대(41MB / 353,180행)라 D19의 정리 후보로 지목됐으나, 2026-08-10 조사에서 **정리 대상이 아님**이 확인됐다. **① 증가하지 않는다** — `scripts/sim-ingest.ts` 1회 실행 후 동결이며(2018-07-05 ~ 2026-06-18 · 194 티커) 실시간 갱신 경로가 없다. 즉 한도 도달의 원인이 아니다. **② 행 삭제는 기능을 깨뜨린다** — 모의투자 체결가를 서버가 이 캔들로 결정하고(`lib/supabase/queries/sim-trading.ts:closeOn`, "해당일 이전 최근 종가"), 실제 `sim_trades`는 **2018-07 ~ 2021-01**로 범위의 오래된 쪽에 있다. "오래된 것부터 삭제"는 사용 중인 구간을 지우는 셈이다. 게다가 `lib/sim/events.ts`의 큐레이션 이벤트는 2015-08부터인데 캔들은 2018-07부터라 이미 부족하고(KIS `getCandles` 2000봉 ≈ 8년 상한), 재수집으로도 복원되지 않는다. **③ 회수 가능한 것은 인덱스뿐** — `pg_stat_user_indexes` 실측에서 `sim_candles_pkey (ticker, ts)`는 스캔 355,626회인데 `idx_sim_candles_ts (ts)`는 **10회**다. 이 테이블을 읽는 두 경로(`/api/sim/series`, `closeOn`)가 모두 ticker로 먼저 좁혀 PK 선두 컬럼을 타기 때문이다. 드롭 후 실행계획이 여전히 `Index Scan using sim_candles_pkey`임을 확인했고, sim_candles 41MB→38MB · DB 85MB→82MB가 됐다. **④ 기존 테이블 스키마 변경 금지 규칙의 예외**이며 사용자 승인(2026-08-10)으로 신규 마이그레이션 `0020`에 남긴다. 되돌리려면 `create index idx_sim_candles_ts on public.sim_candles (ts);`. **⑤ 함께 확인된 것** — DB 증가의 실제 원인은 `news_items`(18MB / 2개월치, 월 ~9MB)인데 D19의 90일 보존이 이미 걸려 있어 ~27MB로 수렴한다. 90일을 유지하기로 했다(승인 2026-08-10) |
| D19 | 슬라이드 원격 저장 · 보존기간 (`lib/engine/slide-storage.ts` · `lib/engine/retention.ts`) | **D16-⑤의 "로컬 원본 + Storage 썸네일"을 뒤집어, 슬라이드 원본을 Supabase Storage(`analysis-slides` 버킷)에 저장하고 로컬 산출물은 업로드·발송 후 삭제하는 임시물로 격하한다.** 근거는 2026-08-10 실측이다: 슬라이드는 하루 64장·월 390MB인데 **WebP q82로 63% 줄어(장당 274KB→104KB)** 30일 보존 시 Storage 162MB로 무료 1GB의 16%만 쓴다. 오프라인 열람을 잃지 않는다 — 리포트 본문이 `analysis_reports`에서 오므로 Supabase 없이는 어차피 화면이 비어 있다. **① 포맷 = WebP q82**(Playwright `screenshot({type:'webp', quality})` 직접 지원. **quality를 생략하면 8%밖에 안 줄어 용량 계산이 무너지므로 반드시 명시**). 텔레그램은 WebP를 `sendPhoto`·`sendMediaGroup` 모두 수용함을 실측 확인했다. **② 보존 = 원본 30일**(`engine_settings.retention_days`, 0이면 무제한이라는 기존 의미 유지). **썸네일은 만료 대상에서 제외**한다(연 30MB로, 원본이 사라진 과거 리포트를 볼 수 있게 하는 유일한 수단). **③ DB도 함께 정리한다** — 이미지를 옮겨도 DB는 월 57MB씩 늘어 **7개월 뒤 무료 500MB에 닿는다**(측정: 현재 84MB, `market_snapshots` 1.65MB/거래일 · `analysis_reports` 0.58MB/거래일 · `news_items` 8.5MB/월). 보존은 `market_snapshots` 90일 · `analysis_reports.slides` jsonb는 원본과 동시 만료 · `news_items` 90일이며, **규칙 미리보기가 참조하는 최신 run은 컷오프와 무관하게 보호**한다. 적용 후 정상상태는 DB ~250MB·Storage 162MB·egress ~150MB/월로 수렴해 무료 범위에서 무기한 유지된다. **④ 스키마 변경 없음** — 기존 테이블 보호 규칙을 지키려 새 컬럼·`check` 값·`slot_type`을 만들지 않는다. 만료는 컬럼이 아니라 **객체 부재 시 썸네일 폴백**으로 표현하고(`createSignedUrls` 일괄 서명 1회로 판정), 버킷 프리픽스는 썸네일이 이미 쓰는 `thumb_bucket_path`(`{userId}/{runDate}/{slotId}`)를 재사용하며, 정리 잡은 새 launchd 슬롯이 아니라 **`run-slot.ts`의 notify 다음 단계**로 넣는다(텔레그램이 로컬 파일을 읽으므로 순서가 뒤집히면 안 된다). 대가로 **DB 보존기간은 앱 설정이 아닌 코드 상수**(`lib/engine/retention.ts`)다. **⑤ 불변식** — 로컬 삭제는 업로드 전량 성공이 DB에 기록된 뒤에만 하고(부분 실패는 fallback 큐로), `slides` jsonb 비우기는 원본 객체를 실제로 지운 뒤에만 하며, 삭제 쿼리는 예외 없이 `user_id` 스코프를 건다. 설계 원문은 `docs/superpowers/specs/2026-08-10-slide-remote-storage-design.md` |
| D18 | 텔레그램 슬롯 알림 연결 (`lib/engine/telegram-settings.ts`) | **슬롯 알림은 텔레그램 단일 채널.** 봇 토큰은 신규 테이블 `engine_telegram`에 AES-256 암호화 저장하고 앱 설정에서 연결한다(chat id는 `getUpdates`로 자동 획득, 수동 입력 없음). 알림은 슬롯별 on/off이며 켜진 슬롯은 슬라이드 전량을 사진 미디어그룹으로 보낸다. 실패 알림은 on/off와 무관하게 항상 발송한다. 설계 원문은 `docs/superpowers/specs/2026-08-06-telegram-slide-delivery-design.md` |
| D17 | 자동 로그인 (`lib/auth/auto-login.ts`) | **로그인 상태를 다음 실행까지 유지하는 옵션. 기본은 꺼짐이며 사용자가 명시적으로 켠다.** **① 비밀번호는 저장하지 않는다** — 유지되는 것은 Supabase가 발급한 refresh token(인증 쿠키)이고, 이건 로그아웃 시 폐기 가능하다. **② 인증 쿠키 수명은 건드리지 않는다**: `@supabase/ssr`가 maxAge를 400일로 강제해 `cookieOptions`로 낮출 수 없으므로(`cookies.js`의 `setCookieOptions`), 유지 여부는 우리가 통제하는 쿠키 2개로 판정한다 — `sd_auto_login`(영속·httpOnly, 자동 로그인 ON 표시) + `sd_session_active`(세션 쿠키, 앱/브라우저 종료 시 소멸). 미들웨어 판정: 자동 로그인 ON이면 무기한 통과, OFF여도 `sd_session_active`가 있으면 이번 실행 중에는 통과, 둘 다 없으면 인증 쿠키를 지우고 `/login`으로 보낸다. Electron 기본 세션이 세션 쿠키를 종료 시 폐기하는 동작에 그대로 올라타므로 데스크톱 전용 코드가 필요 없다. **③ 세션 종료는 `auth.signOut()`이 아니라 로컬 쿠키 삭제**로 한다 — signOut은 `scope: 'local'`이어도 인증 서버로 폐기 요청을 보내(`GoTrueClient._signOut`) 콜드 스타트마다 네트워크 왕복이 생기고 오프라인에서 정리에 실패한다. **④ 정책 쿠키는 httpOnly**라 스크립트가 조작할 수 없고, 조회·변경·삭제는 `/api/auth/auto-login`(GET·PUT·DELETE)로만 한다. 로그아웃 시 이 라우트를 호출해 정책 쿠키까지 지운다. **⑤ 트레이드오프(명시)**: 켜 두면 이 기기에 접근 가능한 사람은 누구나 앱을 열어 계좌 정보를 볼 수 있다. 1인 전용 기기 전제(D1)에서 허용하되 설정 화면에 경고를 노출한다. 진입점 = 로그인 화면 체크박스(기본 해제) + `/settings` 토글. E2E: `npm run e2e:auto-login` |
| D16 | 정기 배치 분석 엔진 (`lib/engine/` · `scripts/engine/`) | **설정된 슬롯 시각에 한·미 관심종목의 차트·뉴스·리스크를 자동 분석해 슬라이드 이미지로 만들고 텔레그램으로 알리는 배치 엔진.** 매매는 실행하지 않는다(판단 보조 자료). **① 구현 언어 = TypeScript**(설계서 원안은 Python이었으나 기존 KIS·Yahoo 프로바이더와 `lib/utils/indicators.ts`를 그대로 재사용하기 위해 변경 — 중복 구현 회피). **② LLM = `claude -p` 헤드리스 전용**(Anthropic/OpenAI API 직접 호출 금지, 구독 사용량만 사용). 기존 D10의 OpenAI 경로(뉴스·브리핑)와는 별개 트랙이며 서로 간섭하지 않는다. **③ 실행 = 로컬 Mac + launchd**(`scripts/engine/install-schedule.ts`가 `schedule_slots` → plist 동기화, US 슬롯은 표준시 기간에 +1시간 자동 보정). 기존 Vercel 크론(`lib/cron/dispatch.ts`)은 손대지 않는다. **④ 산출물 = pptx 파일이 아니라 슬라이드 PNG.** 슬라이드 정의(`analysis_reports.slides`)가 단일 원천이고, 자기완결 HTML → Playwright 캡처로 렌더한다(배치가 Next 서버에 의존하지 않게). 앱 **`/reports`**에서 날짜·시간별로 열람. **⑤ 저장 = 로컬 원본 + Supabase Storage 썸네일.** 저장 루트를 외장 볼륨으로 지정 가능(`engine_settings.slide_storage_root`); 경로는 홈 또는 `/Volumes` 하위만 허용하고, 볼륨 미연결 시 기본 경로로 폴백해 `storage_state='fallback'`으로 표시한다. **⑥ 역할 분리** — 지표 계산·필터링·렌더링은 코드, 뉴스 해석·판단·서술은 `stock-analysis` 스킬. **⑦ 사용량 예산** — 슬롯당 분석 종목 8개, 종목당 웹 검색 4회(`engine_settings`로 조정, 상향은 사용자 승인). 신규 테이블(마이그레이션 0017): `engine_settings`·`analysis_themes`·`theme_stocks`·`signal_rules`·`schedule_slots`·`market_snapshots`·`analysis_reports`·`slot_signals` + 기존 `watchlist_items.always_brief` 컬럼 추가(유일한 기존 스키마 변경, 사용자 승인). 기존 `calendar_events`를 이벤트 캘린더로 재사용. **⑧ 눌림목 관찰 레이더**(마이그레이션 0018): 점수 상위 진입 후보와 **별개 트랙**으로, 상승 흐름 중 눌린 종목을 `관찰중`(반등 전)·`진입임박`(MA10 회복)으로 구분해 표 슬라이드 1장에 모은다. 조건은 `signal_rules.rules.watchZone`(추세 판정 strict/loose/off · 기준선 MA10/20/60 · 이격 밴드 · RSI 밴드 · 되돌아보기 봉수 · 최대 표시)으로 사용자 설정. 대상은 **조건 자동 추출 + 수동 고정 병행**(`watchlist_items.radar_pin`, `/stocks` 카드 토글). 관찰 종목은 **상위 3개만 Claude가 1~2줄 코멘트하고 웹 검색은 금지**(사용량 예산 보호). 지표에 `touchBarsAgo`·`recoveredAboveMa10`을 적재해 **시세 재조회 없이 규칙 재평가(미리보기)가 가능**하다. **⑨ 설정 UI**: 슬롯 시각(cron 미노출, 시:분+요일)·선정 규칙·관찰 규칙·테마·저장/예산을 **`/reports` → [설정] 탭**에서 관리. 규칙 저장은 항상 **새 버전 추가**(이력 보존)이며 버전별 적중률을 함께 표시한다. launchd 반영은 로컬 실행 시에만 버튼이 동작하고 원격에서는 실행 명령을 안내한다. 설계 원문은 `docs/handoff/01_DESIGN.md` |
| D15 | 자동매매 Phase 1 (실시간 탭) | **국내 한정 인트라데이 자동매매 — 대상은 모의투자(paper) 계좌만** (KIS 실주문 미사용, Phase 2에서 KIS 모의계좌 검토). 전략 = **VWAP 추세필터 + MACD(12,26,9) 트리거 + RSI(14) 가드 + 거래량 검증** 4조건 AND 진입 / 우선순위 OR 청산(시간→손절→익절→RSI과열→VWAP이탈→MACD전환). **전 파라미터 사용자 조정 가능**(`auto_trading_configs.params` jsonb, 기본값은 코드 `DEFAULT_PARAMS` 단일 원천, zod 범위·관계 검증). 리스크 관문 계층: kill switch(수동 최우선) > 일 손실 한도(신규 진입만 차단, 매도는 항상 허용) > 동시 보유 수 > 1회 주문 크기. 엔진 = 순수함수 전략(`evaluateStrategy`)을 실매매·백테스트가 공유, tick은 실시간 탭이 10초 주기 트리거(서버가 개장·리스크 재검증, `checkLimitOrders` 패턴). 시그널·거부 사유는 `trade_signals`에 전부 기록(HOLD 제외). **실시간 탭(`/live`)**: 관심종목 레일 + 분봉 차트(VWAP·RSI·MACD 오버레이) + KIS 10호가(REST 3초 폴링 — WebSocket은 연결당 20건 제한으로 V-next) + 빠른 모의주문 + 자동매매 패널. 마이그레이션 0015. 구현 완료(2026-07-12) |
| D14 | 워치리스트 탭(컬렉션) 관리 (V2) | **내 종목 페이지(`/stocks`)를 독립 탭(컬렉션) 단위로 관리.** 첫 탭 = **기본 탭('내 종목', 맨 앞 고정·삭제·이름변경 불가)**, 이후 사용자가 이름을 지정해 탭 생성/이름변경/삭제. 모든 탭에서 종목 추가/삭제 가능. **같은 종목을 여러 탭에 중복 등록 허용** → `watchlist_items` PK를 `(user_id, stock_id)` → **`(watchlist_id, stock_id)`로 교체**하고 신규 `watchlists` 테이블 추가(마이그레이션 0013, RLS·유저당 기본 탭 1개 partial unique). 탭 내부 표시는 기본 탭과 동일(즐겨찾기 + 시장별 섹션). **전역 소비처(대시보드·종목비교·캘린더·브리핑)는 전체 탭 통합 조회**(`listAllWatchlistItems`, `stock_id` 기준 중복 제거). API: `/api/watchlists`(탭 CRUD) + 기존 `/api/watchlist`에 `watchlist_id` 스코프. 구현 완료(2026-06-24, 마이그레이션 적용은 `npm run db:migrate` 필요) |
| D1 | 사용 범위 | **1인 전용으로 시작하되, 멀티유저-ready 구조로 설계** (Supabase user_id + RLS를 처음부터 적용 — 추가 난이도 거의 없음). MVP는 본인 계정만 사용, 추후 회원가입 활성화만으로 타인 공유 가능. 단, 타인 사용 시 각자 본인의 KIS/AI API 키를 설정 화면에 입력하는 구조(키는 암호화 저장) |
| D2 | 사용 환경 | **PC 중심 레이아웃 우선**, Tailwind 반응형으로 모바일 대응 포함 (추가 난이도 낮음 — 사이드바→하단탭 전환 수준) |
| D3 | 시세 소스 | **한국투자증권 KIS OpenAPI (조회 전용)** 확정. 한국+미국 시세·차트 모두 KIS 단일 소스. MVP는 REST 폴링(5~10초), V1.5에서 WebSocket 실시간 전환 |
| D4 | AI 분석 | OpenAI + Anthropic API 키 직접 발급 사용. **자동 분석: 기본 일 2회, 실행 시간 사용자 설정 가능, 횟수 추가/삭제 가능.** 수동 실행 버튼 별도 유지 |
| D5 | 모의투자 | 시드머니 기본 **KRW 1,000만 원 + USD $10,000** (설정에서 변경 가능). **언제든 리셋 가능**(리셋 이력 보관). 장외시간 주문은 **예약주문으로 접수 → 다음 개장 시초가 체결** (사유: 직전 종가 체결 방식은 장외 뉴스를 알고 과거 가격에 사는 비현실적 거래가 가능해져 판단 검증 데이터가 오염됨) |
| D6 | 가격 알림 | **기능 생략** (F10 제거) |
| D7 | 추가 기능 배치 | **확정 — MVP: F11 시장위젯, F12 공시 피드, F13 투자 노트, F15 배당 정보 / V1: F14 기술지표 / V2: F16 종목 비교, F17 뉴스↔주가 오버레이.** 단, F15의 캘린더 자동 연동 부분은 F2 캘린더가 구축되는 V1에 활성화(MVP에서는 종목 개요 내 배당 지표 표시까지) |
| D8 | 뉴스 갱신 주기 | **장중 3시간 / 장외 6시간** |
| D9 | 펀더멘털 데이터 소스 (W3) | **미국 재무·실적 = Finnhub** (당초 11장의 FMP에서 변경), **미국 배당 = FMP**, **미국 공시 = SEC EDGAR**, **한국 재무·배당·공시 = DART** (한국 PER/PBR/EPS/시총은 KIS 시세지표로 보강). 변경 사유: 사용자가 Finnhub 키를 발급, FMP 무료티어는 배당 데이터에 활용. **F12 공시 AI 1줄 요약은 W3에서 골격만**(`disclosures.summary_ai`는 nullable로 비움) → 실제 AI 요약 호출은 W4 뉴스 AI 파이프라인과 통합(유료 호출 회피) |
| D10 | 뉴스·AI (W4) | **한국 뉴스 = 네이버 뉴스 검색 API**, **미국 뉴스 = Finnhub News**. **AI(뉴스 요약·감성분류, 공시 1줄 요약, 데일리 브리핑) = OpenAI gpt-4o-mini** (Vercel AI SDK). **AI 요약 호출은 MVP에서 수동 갱신 버튼 트리거**(비용 통제) — 자동 크론(D8 장중3h/장외6h, D4 브리핑 06:30)은 잡 함수·디스패처 골격만 구현하고 스케줄 등록은 배포 단계로 미룸 |
| D13 | 모의투자 탭 분리 + 캘린더 확장 (V2) | **모의투자 페이지(`/paper`)를 2탭으로 분리**: [실시간 모의투자(기본, 기존 F9)] · [모의투자 테스트(D12 백테스트)]. 모의투자 테스트 탭 = '새 테스트 세션' 설정(시드·시작 시점) + **분야별 가상시장 팝업**(SimMarketClient 재배치 — 테마탭·빨리감기 시계·종목 시세/정보; 독립 `/sim` 사이드바 메뉴·라우트 제거). **Phase 2~4 구현 완료(2026-06-19)**: USD 단일통화 매매(체결가는 `sim_candles` 종가로 서버 결정—위조방지), 포트폴리오(현금·보유·평단·평가손익·실현손익·총수익률), 거래별 변동원인(이벤트셋), 마이그레이션 0012(`sim_sessions`·`sim_trades`). **캘린더 확장**: `calendar_events.type`에 `options`·`dividend` 추가(마이그레이션 0011). ①**장기옵션(LEAPS) 만기일** = 규칙 계산(매년 1월 셋째 금요일, `lib/utils/options-expiry.ts`), 대상=워치리스트 US 종목, source=`options-leaps`. ②**배당 일정**(배당락·지급) = `dividends` 테이블 ex_date/pay_date([today−90d, +400d]), source=`dividend`. ③**종목별 표시 체크박스 필터**(기본 전체 표시, 시장 공통 일정은 항상 표시). 캘린더 조회에 stocks(ticker/name) 조인 추가 |
| D12 | 모의투자 테스트 (백테스트, V2) | 기존 실시간 모의투자(F9, paper)와 **별도 트랙**으로 **과거 10년 미국 시장 재생형 백테스트 샌드박스** 추가. **데이터 = Yahoo Finance 10년 일봉을 1회 수집 후 동결**(`sim_candles`), 이후 실시간 학습 없음(요구 6). **종목 유니버스 = 14개 테마 × 주요 미국 기업 200종목**(코드 동결 `lib/sim/universe.ts`). **PER/PBR 등 펀더멘털로 가격을 합성하지 않고 실제 과거 주가 시계열을 그대로 재생**(실제 흐름이 이미 모든 요인을 반영 — 요구 2·4). **시계 = 일봉 단위 재생 + 배속 컨트롤**(0.5·1·2·5·20·100×, 기본 5×; 주말·휴장 갭은 거래일 축으로 연속 — 요구 3). **주가 변동 원인 = 사전 설계 이벤트 데이터셋**(코드 동결 `lib/sim/events.ts`, 매크로+종목 사건 — 요구 5). 단계: **Phase 1**=데이터 수집(`npm run sim:ingest`)·테마 시장 뷰·시계, Phase 2=매매·포트폴리오, Phase 3=매매 시 원인 설명 연결, Phase 4=성과 분석. 메뉴 `/sim`(모바일 하단탭 제외) |
| D11 | 예수금·자산현황 (V2) | **실거래(real_trades) 트랙에 예수금 도입.** 입출금은 `cash_ledger`(deposit/withdraw)로 기록하고, 예수금 잔고는 저장하지 않고 파생 계산: **예수금(통화별) = Σ입금 − Σ출금 − Σ(매수금액+수수료) + Σ(매도금액−수수료)** (과거 매매 자동 전체 반영, **음수 허용** — 기록 성격). **매매 수수료는 동적 계산**(저장 안 함): 국내 매수 0.018% / 매도 일반 0.218%(위탁 0.018%+증권거래세 0.20%) · **ETF 매도 0.018%(거래세 면제)**, 미국 매수 0.25% / 매도 0.25206%(위탁 0.25%+SEC 0.00206%). ETF 구분은 `real_trades.is_etf`(매매 입력 시 체크박스). 대시보드에 **전체자산(예수금+평가금액)·예수금·주식 매입금액(국내/해외)·평가금액·평가손익**을 원화 환산 통합 표시 |

> 11장 API Design의 "재무(미국): FMP"는 D9에 따라 "재무(미국): Finnhub / 배당(미국): FMP"로 갱신됨.
> 구현 주의(2026-06): FMP는 legacy v3(`api/v3`)가 신규 키에 403 → **stable API(`/stable/dividends`)** 사용. Finnhub `financials-reported`는 YTD 누적치 → **인접 분기 차분으로 분기 환산**.

---

## 1. Product Context

| 항목 | 내용 |
|------|------|
| Product Name | **Stock Desk** (가칭) — 나만의 주식 데스크 |
| Product Summary | 한국·미국 주식 투자자가 매일 아침 시장 브리핑부터 종목별 뉴스·재무지표·AI 분석·모의투자까지 한 화면에서 처리하는 개인용 투자 보조 웹앱. 흩어진 정보(증권사 앱, 뉴스, 캘린더, AI 챗)를 하나의 워크스페이스로 통합한다. |
| Vision | 개인 투자자의 "정보 수집 → 분석 → 판단 기록 → 복기" 루틴을 자동화하는 개인 리서치 데스크 |
| Product Goals | ① 매일 시장 브리핑 확인 시간을 30분 → 5분으로 단축 ② 등록 종목의 뉴스·일정·지표를 단일 화면에서 조회 ③ AI 분석 리포트를 자동(일 2회)+수동 1클릭으로 확보 ④ 모의투자로 판단 정확도를 데이터로 축적 |
| Success Metrics | 주 5회 이상 접속, 등록 종목당 AI 분석 활용률, 모의투자 기록 누적 건수, 브리핑·자동분석 생성 성공률 ≥ 99% |

---

## 2. Problem Definition

| 항목 | 내용 |
|------|------|
| Target Users | 한국·미국 주식에 모두 투자하는 개인 투자자 (1차: 본인. 구조상 추후 공유 가능) |
| Problem Statement | 시장 이슈, 종목 뉴스, 재무지표, 일정, 시세가 각기 다른 앱·사이트에 흩어져 있어 매일 정보를 모으는 데 과도한 시간이 들고, 판단 근거가 기록으로 남지 않는다. |
| User Pain Points | 매일 아침 여러 매체를 돌며 시장 이슈 수집 / 실적발표·FOMC 등 일정을 놓침 / 종목별 재무지표를 매번 검색 / 뉴스가 주가에 미친 영향을 사후에만 파악 / AI에게 물어보려면 매번 맥락을 다시 설명 / 투자 아이디어 검증 수단 부재 |
| Existing Alternatives | 증권사 MTS(시세·주문 중심, 리서치 약함), 네이버페이 증권(정보 분산, 개인화 없음), TradingView(차트 중심, 한국 뉴스 약함), ChatGPT/Claude 직접 사용(데이터 자동 연결 안 됨) |
| Opportunity | 개인 맞춤 종목 등록 기반으로 모든 정보가 자동 수집·정리되고, AI 분석이 실데이터와 연결된 통합 데스크는 부재. 개인용이므로 규제·과금 부담 없이 빠르게 구축 가능 |

---

## 3. User Personas

**페르소나 1 — 김민태 (30대, 본 제품의 1차 사용자)**
한국·미국 주식 동시 투자. 출근 전 10분, 점심, 장 마감 후에 시장을 확인한다. 목표: 짧은 시간에 시장 전체 맥락과 관심 종목 변화를 파악하고, 매매 판단의 근거를 남기고 싶다. 행동 패턴: 아침 브리핑 확인 → 캘린더로 오늘 일정 체크 → 종목 뉴스 스캔 → 자동 생성된 AI 분석 확인 → 모의투자로 아이디어 기록.

**페르소나 2 — (공유 시) 지인 투자자**
본인과 유사한 한·미 투자자. 본인의 KIS·AI API 키를 직접 발급해 설정 후 동일 기능을 독립된 데이터 공간에서 사용. *MVP에서는 가입 비활성, V2에서 활성화.*

---

## 4. User Stories (우선순위순)

1. 투자자로서, 매일 아침 시장 주요 이슈를 요약본으로 보고 싶다. 그래야 5분 안에 시장 맥락을 잡을 수 있다. (F1)
2. 투자자로서, 종목명/티커로 한국·미국 종목을 검색해 워치리스트에 등록하고 싶다. 그래야 이후 모든 기능이 내 종목 기준으로 동작한다. (F3)
3. 투자자로서, 등록 종목의 시총·PER·PBR·매출·영업이익·CAPEX를 한 화면에서 보고 싶다. (F4)
4. 투자자로서, 등록 종목의 최신 뉴스가 시간순으로 자동 정리되길 원한다. (F5)
5. 투자자로서, FOMC·실적발표 등 시장/종목 일정을 캘린더 하나로 보고 싶다. (F2)
6. 투자자로서, 등록 종목의 주가 흐름을 기간별 차트로 보고 싶다. (F6)
7. 투자자로서, 하루 2회 자동으로(+원할 때 수동으로) 뉴스·지표·주가를 종합한 AI 분석과 포지션 의견을 받고 싶다. 최종 판단은 내가 한다. (F7)
8. 투자자로서, 실시간 주가 기준으로 "x% 수익/손실이면 얼마인지"를 즉시 계산하고 싶다. (F8)
9. 투자자로서, 종목별 모의 매수·매도를 기록하고 손익을 추적하며, 언제든 리셋하고 다시 시작하고 싶다. (F9)

---

## 5. Core Features

### 필수 기능 (확정)

| # | 기능 | 한 줄 설명 | 우선순위 |
|---|------|-----------|----------|
| F1 | 데일리 시장 브리핑 | 금일 시장·경제 주요 내용과 이슈를 AI가 매일 자동 요약 | High |
| F2 | 통합 일정 캘린더 | 시장 공통 일정 + 등록 종목별 일정(실적발표 등) 자동 표시 | High |
| F3 | 종목 검색·등록 | 한국·미국 종목 검색 후 워치리스트 등록 | High |
| F4 | 종목 핵심 지표 | 시총, 분기 매출/영업이익, PER, PBR, CAPEX 등 자동 수집·정리 | High |
| F5 | 종목 뉴스 피드 | 등록 종목별 주요 뉴스·이슈 최신순 정리 (장중 3h/장외 6h 갱신) | High |
| F6 | 주가 흐름 차트 | 기간별(1일~5년) 가격 차트 (KIS 데이터) | High |
| F7 | AI 투자 분석 | 자동(일 2회, 시간·횟수 설정 가능)+수동으로 GPT·Claude 분석 및 포지션 의견 생성 | High |
| F8 | 손익 계산기 | 실시간 주가 기준 수익/손실 % ↔ 가격 양방향 계산 | High |
| F9 | 모의 투자 | 종목별 가상 매매 기록·손익 추적, 언제든 리셋 가능 | High |

### 추가 기능 — 배치 확정 (D7)

| # | 기능 | 설명 | 배치 |
|---|------|------|------|
| F11 | 시장 대시보드 위젯 | 대시보드 상단 고정 바에 KOSPI·KOSDAQ·S&P500·NASDAQ·원/달러 환율·미국채 10년 금리·VIX를 한 줄로 상시 표시 | **MVP** |
| F12 | 공시 피드 | 한국 DART(전자공시)·미국 SEC 공시 중 주요 항목(실적 공시, 유상증자, 자사주, 대량보유 변동 등)을 종목 상세에 자동 표시 — 뉴스보다 빠르고 정확한 1차 정보 | **MVP** |
| F13 | 투자 노트 | 종목별(또는 전체) 매매 근거·복기 메모. AI 분석 결과·모의투자 주문에 첨부 연결 | **MVP** |
| F15 | 배당 정보 | 배당수익률·배당락일·지급일을 종목 개요에 표시. 캘린더(F2) 자동 연동은 V1에 활성화 | **MVP** |
| F14 | 차트 기술지표 | F6 차트 위에 이동평균선(5/20/60/120일), RSI, 거래량을 토글로 표시 | V1 |
| F16 | 종목 비교 | 등록 종목 2~4개의 핵심 지표(F4)를 표로 나란히 비교 | V2 |
| F17 | 뉴스↔주가 오버레이 | F6 차트 위에 주요 뉴스 발생 시점을 마커로 찍고, 클릭 시 해당 뉴스 표시 | V2 |

*F10 가격 알림은 사용자 결정(D6)으로 제거됨.*

---

## 6. Feature Specifications

### F1. 데일리 시장 브리핑
- **목적**: 매일 아침 5분 내 시장 맥락 파악
- **요구사항**: 매 영업일 오전 6:30(미국장 마감 직후, KST) 자동 생성 1회 통합. 구성: ① 전일 한국·미국 시장 요약(지수 등락, 주도 섹터) ② 주요 경제 이슈 3~7건 ③ 오늘의 주요 일정 ④ 내 등록 종목 관련 이슈 하이라이트. 과거 브리핑 아카이브. 수동 "지금 다시 생성" 버튼.
- **수용 기준**: 생성 실패 시 이전 브리핑 + 실패 표시. 이슈별 출처 링크. 생성 90초 이내.

### F2. 통합 일정 캘린더
- **요구사항**: 월/주 보기. 기본 일정: FOMC, 한국 금통위, 미국 CPI/PPI/고용보고서, 한·미 옵션만기일, 휴장일. 종목 등록 시 자동 추가: 실적발표 예정일, 주주총회(한국), (V2: 배당락일). 수동 일정 추가/수정. 일정 클릭 시 관련 종목·메모.
- **수용 기준**: 종목 등록 후 60초 내 일정 반영. 미확정 실적일 "(예정)" 라벨. 출처 표시.

### F3. 종목 검색·등록
- **요구사항**: 한글명/영문명/티커/종목코드 검색, 자동완성, 시장 뱃지(KOSPI/KOSDAQ/NYSE/NASDAQ). 등록 시 F2·F4·F5 데이터 자동 수집 시작. 워치리스트 그룹(폴더). 등록 해제 시 데이터 보존 여부 선택.
- **수용 기준**: 검색 응답 1초 이내. 중복 등록 방지. 거래정지·상장폐지 종목 경고.

### F4. 종목 핵심 지표
- **요구사항**: 시가총액, 현재가/52주 최고·최저, PER(TTM), PBR, ROE, EPS, 최신 분기 매출·영업이익·순이익(YoY), CAPEX(분기/연간), 부채비율, 배당수익률. 최근 4개 분기 실적 미니 차트. 일 1회 갱신 + 수동 갱신.
- **데이터**: 한국 — DART OpenAPI(재무제표) + KIS(시세 기반 지표). 미국 — KIS 해외시세 + 재무 Provider(15장).
- **수용 기준**: 모든 지표에 기준 시점·출처 명시. 수집 불가 지표 "—" + 사유 툴팁.

### F5. 종목 뉴스 피드
- **요구사항**: **갱신 주기 — 장중 3시간 / 장외 6시간 (확정 D8)**. 카드: 제목, 매체, 시각, AI 3줄 요약, 영향도 태그(호재/악재/중립), 원문 링크. 중복 기사 클러스터링. "이 뉴스로 AI 분석" 바로가기.
- **수용 기준**: 중복 노출률 < 10%. 요약은 출처 기반, 사실 불일치 금지.

### F6. 주가 흐름 차트
- **요구사항**: 기간 1일(분봉)/1주/1개월/3개월/1년/5년. 캔들·라인 전환, 거래량. 데이터: KIS OpenAPI 국내·해외 기간별 시세. 라이브러리: TradingView Lightweight Charts.
- **수용 기준**: 로딩 2초 이내. 휴장일 갭 처리. 통화별 축 표시.

### F7. AI 투자 분석 (핵심 차별 기능)
- **자동 실행 (확정 D4)**: 기본 스케줄 일 2회 — 제안 기본값: **08:30 KST(한국장 개장 전, 밤사이 미국장·뉴스 반영)와 22:00 KST(미국장 개장 직전)**. 설정 화면에서 시간 변경, 횟수 추가/삭제 가능(0회로 두면 수동 전용). 자동 실행은 워치리스트 전 종목 대상이며 종목별 자동 분석 on/off 가능(API 비용 제어).
- **수동 실행**: 종목 상세에서 1클릭 즉시 분석.
- **입력 컨텍스트 자동 구성**: 최근 주가 흐름 수치 요약(전일/1주/1개월 등락, 거래량 변화), F4 지표 스냅샷, F5 최근 뉴스 요약(전회 분석 이후 신규 뉴스 강조), 직전 분석 결과 요지(관점 변화 추적), (선택) 사용자 노트.
- **출력 구조**: ① 최근 주가 흐름 해석 ② 핵심 호재/악재 ③ 리스크 ④ 포지션 의견(매수/중립/매도 + 근거 + 신뢰도) ⑤ 모니터링 포인트.
- **듀얼 모델**: ChatGPT(OpenAI)·Claude(Anthropic) 선택 또는 동시 실행 → 좌우 비교 뷰. 자동 실행 시 사용할 모델도 설정 가능(기본: 둘 다).
- **이력**: 분석 결과 전체 저장, 종목별 타임라인 조회, 포지션 의견 변화 추이 표시.
- **고지**: 결과 하단 고정 — "본 분석은 참고용이며 투자 판단과 책임은 본인에게 있습니다."
- **수용 기준**: 생성 60초 이내. 컨텍스트 데이터 기준 시각 명시. 실패 시 1회 재시도 후 오류 기록(자동 실행 실패는 대시보드에 표시).

### F8. 손익 계산기
- **요구사항**: 종목 선택 시 현재가 자동 입력(KIS 실시간). 입력: 보유 수량 또는 투자금액 + 목표 수익률/손실률(%). 출력: 목표 주가, 도달 시 평가금액·손익액. 역방향(목표 주가 → 수익률) 지원. 수수료·세금 옵션(한국 증권거래세 0.18%+수수료 / 미국 수수료, 참고치). 미국 종목 원화 환산 병기. 프리셋 저장.
- **수용 기준**: 현재가 갱신 시 자동 재계산.

### F9. 모의 투자
- **시드머니 (확정 D5)**: 기본 KRW 10,000,000 + USD 10,000 (설정에서 변경 가능, 변경은 다음 리셋부터 적용).
- **주문**: 시장가 체결(체결가 = 주문 시점 KIS 시세). **장외시간 주문 = 예약주문 접수 → 다음 개장 시초가 체결 (확정 D5)**. 예약주문은 체결 전 취소 가능. 잔고 초과 주문 차단.
- **표시**: 종목별 포지션 카드(보유수량, 평단가, 평가손익, 수익률 — 종목별 분리), 계좌 요약(KRW/USD 각각 + 원화 환산 통합), 거래 타임라인(매매 사유 메모 = F13 연동).
- **리셋 (확정 D5)**: 언제든 리셋 → 시드머니 초기화. 리셋 이전 기록은 "시즌"으로 아카이브되어 과거 성과 조회 가능(판단 검증 데이터 보존).
- **수용 기준**: 예약주문 체결 시점 = 개장 후 첫 시세 수신 시. 거래 기록은 삭제 불가, 취소 표시만.

### F11. 시장 대시보드 위젯 (MVP)
대시보드 상단 고정 바. KOSPI, KOSDAQ, S&P500, NASDAQ, 원/달러, 미국채 10년 금리, VIX — 현재값·등락률. 1분 캐시.

### F12. 공시 피드 (MVP)
- **목적**: 뉴스보다 빠르고 정확한 1차 공식 정보 확보
- **요구사항**: 한국 — DART OpenAPI 공시검색(종목별, 주요 유형 필터: 실적·잠정실적, 유상증자, 전환사채, 자사주 취득/처분, 대량보유 변동, 주요사항보고). 미국 — SEC EDGAR(8-K, 10-Q, 10-K, S-1, Form 4 등 주요 양식). 종목 상세의 뉴스 탭 내 통합 피드로 표시하되 필터(전체/뉴스/공시) 제공 — 공시 항목은 공시 유형 뱃지로 구분. 카드: 공시 유형 뱃지, 제목, 제출일시, AI 1줄 요약(핵심 수치 추출), 원문 링크. 갱신: 뉴스 크론과 동일 주기(장중 3h/장외 6h)에 통합.
- **수용 기준**: 공시 유형 한국어 라벨 매핑(EDGAR 양식 포함). 원문 링크는 DART/EDGAR 뷰어 직링크. 실적 공시는 F4 지표 갱신 트리거로 활용.

### F13. 투자 노트 (MVP)
종목별/전체 메모, 마크다운 지원, AI 분석 결과·모의투자 주문에 첨부 연결, 최신순 타임라인, 검색.

### F15. 배당 정보 (MVP)
- **목적**: 배당 투자 판단 정보를 종목 화면에서 즉시 확인
- **요구사항**: 종목 개요(F4 지표 영역)에 배당 카드 표시 — 배당수익률(현재가 기준), 주당 배당금(연간/분기), 배당 주기, 직전·차기 배당락일, 지급일, 최근 3년 배당 추이 미니 차트. 데이터: 한국 — DART 배당 공시 + KIS, 미국 — FMP 배당 캘린더. 무배당 종목은 "배당 없음" 표시.
- **캘린더 연동(V1 활성화)**: F2 캘린더 구축 시 등록 종목의 배당락일·지급일 자동 등록.
- **수용 기준**: 배당락일 D-7 이내면 종목 카드에 뱃지 표시. 수익률은 현재가 갱신 시 재계산.

### F14·F16·F17 (V1/V2)
F14 기술지표(V1): 이평선·RSI·거래량 토글. F16 비교(V2): 최대 4종목 지표 테이블. F17 뉴스 마커(V2): 차트 위 뉴스 시점 표시.

---

## 7. UX Flow

**핵심 사용자 여정 (아침 루틴)**
```
앱 진입 → [대시보드] 시장 위젯 + 오늘의 브리핑 + 오늘 일정 + 내 종목 요약 + 새 AI 분석 뱃지
  → 브리핑 상세 → 종목 카드 클릭
  → [종목 상세] 개요/차트/뉴스/AI분석/모의투자 탭
  → 자동 생성된 AI 분석 확인 (08:30 생성분) → 모의 매수 + 노트 작성
```

**화면 흐름**
```
대시보드 ─┬─ 브리핑 아카이브
          ├─ 캘린더 (월/주)
          ├─ 종목 검색 모달 ── 등록 → 종목 상세
          ├─ 종목 상세 ─┬─ 개요(지표) ─ 차트 ─ 뉴스 ─ AI분석 ─ 모의투자
          │             └─ 계산기 (우측 슬라이드 패널, 전역 호출)
          ├─ 모의투자 계좌 전체 뷰 (시즌 아카이브 포함)
          └─ 설정 (API키 / AI 분석 스케줄 / 시드머니 / 갱신주기)
```

**내비게이션**: PC — 좌측 사이드바(기본). 모바일 — 하단 탭 5개(대시보드·캘린더·내 종목·모의투자·설정). 반응형 분기점 lg(1024px).

---

## 8. Screen Specification

| 화면 | 주요 컴포넌트 | 핵심 인터랙션 |
|------|--------------|---------------|
| S1 대시보드 | 시장 위젯 바(F11), 브리핑 카드, 오늘 일정 스트립, 내 종목 시세 그리드, 신규 AI 분석 뱃지 | 브리핑 펼치기, 종목 카드 → 상세 |
| S2 캘린더 | 월/주 토글, 일정 칩(색=유형), 상세 패널, 수동 추가 | 날짜 → 당일 목록, 일정 → 관련 종목 |
| S3 종목 검색 | 자동완성 인풋, 결과 리스트(시장 뱃지·현재가), 등록 버튼, 그룹 선택 | Enter 검색, 클릭 등록 |
| S4 종목 상세 | 헤더(현재가·등락 폴링), 탭 5개(개요·차트·뉴스/공시·AI분석·모의투자), 개요 내 배당 카드(F15), 뉴스 탭 내 전체/뉴스/공시 필터(F12), 계산기 호출 버튼 | 탭 전환, 분석 실행, 모의 주문 |
| S5 AI 분석 | 모델 선택(GPT/Claude/둘다), 실행 버튼, 결과 비교 카드, 히스토리(자동/수동 구분 뱃지), 포지션 추이 미니그래프, 면책 문구 | 두 모델 좌우 비교, 과거 분석 펼치기 |
| S6 모의투자 | 계좌 요약(KRW/USD/통합), 종목별 포지션 카드, 주문 패널, 예약주문 목록, 거래 타임라인, 리셋 버튼, 시즌 아카이브 | 매수/매도, 예약 취소, 리셋(2단계 확인) |
| S7 계산기 | 종목 선택, 현재가(실시간), %↔가격 양방향, 수수료 토글, 환산 표시, 프리셋 | 입력 즉시 재계산 |
| S8 설정 | KIS 키, OpenAI/Anthropic 키(마스킹+검증 버튼), **AI 자동분석 스케줄 편집기(시간 행 추가/삭제, 기본 08:30·22:00)**, 종목별 자동분석 토글, 시드머니, 뉴스 갱신주기 표시 | 키 테스트, 스케줄 행 추가/삭제 |

---

## 9. Data Model

```
users               : id, email, created_at        ← 멀티유저-ready (D1)
user_settings       : user_id, kis_app_key(enc), kis_app_secret(enc),
                      openai_key(enc), anthropic_key(enc),
                      seed_krw(기본 10_000_000), seed_usd(기본 10_000),
                      auto_analysis_models(jsonb)
analysis_schedules  : id, user_id, run_time(time, KST), enabled
                      ← 기본 2행(08:30, 22:00), 행 추가/삭제 = 횟수 가감 (D4)
stocks              : id, ticker, name_kr, name_en, market, currency, sector
watchlist_items     : user_id, stock_id, group_name, auto_analysis(bool, 기본 true), created_at
stock_metrics       : stock_id, as_of_date, market_cap, per, pbr, roe, eps,
                      revenue_q, operating_income_q, net_income_q, capex,
                      debt_ratio, dividend_yield, fiscal_quarter, source
price_candles       : stock_id, interval(1m|1d|1w), ts, o, h, l, c, volume
news_items          : id, stock_id(null=시장공통), title, source, url, published_at,
                      summary_ai, sentiment, cluster_id
disclosures         : id, stock_id, source(dart|edgar), form_type, type_label_kr,
                      title, filed_at, summary_ai, url            ← F12 (MVP)
dividends           : stock_id, fiscal_year, dps, frequency,
                      ex_date, pay_date, yield_at_record, source  ← F15 (MVP)
briefings           : id, user_id, date, content_md, sources(jsonb), generated_at, status
calendar_events     : id, user_id?, type(macro|earnings|custom), stock_id?,
                      title, event_date, confirmed, source, memo
ai_analyses         : id, user_id, stock_id, model(gpt|claude), trigger(auto|manual),
                      context_snapshot(jsonb), result_md,
                      position(buy|neutral|sell), confidence, created_at
paper_seasons       : id, user_id, season_no, seed_krw, seed_usd,
                      started_at, ended_at(리셋 시 기록)          ← D5 리셋 아카이브
paper_accounts      : id, season_id, currency(KRW|USD), cash_balance
paper_trades        : id, account_id, stock_id, side, qty, price, fee,
                      order_type(market|reserved), reserved_at?, executed_at?,
                      status(pending|done|canceled), memo, note_id?
paper_positions     : (뷰) season_id, stock_id, qty, avg_price
real_trades         : id, user_id, stock_id, side, qty, price, trade_date,
                      memo, is_etf(국내 ETF 거래세 면제), created_at      ← V2 실거래
cash_ledger         : id, user_id, currency(KRW|USD), type(deposit|withdraw),
                      amount, tx_date, memo, created_at                 ← V2·D11 예수금(파생 잔고)
notes               : id, user_id, stock_id?, content_md,
                      attached_analysis_id?, attached_trade_id?, created_at
```
RLS: user_id 기준 격리(전 테이블). stocks·price_candles·news_items·stock_metrics는 공용(유저 무관 마스터 데이터).

---

## 10. API Design (Next.js Route Handlers)

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| /api/stocks/search?q= | GET | 한·미 통합 검색 (KIS 종목마스터 기반) |
| /api/watchlist | GET/POST/DELETE | 워치리스트, auto_analysis 토글 포함 |
| /api/stocks/:id/metrics | GET | 지표 (캐시 우선, ?refresh=1) |
| /api/stocks/:id/candles?interval=&range= | GET | 차트 (KIS 프록시 + 캐시) |
| /api/stocks/:id/news | GET | 뉴스 피드 |
| /api/stocks/:id/disclosures | GET | 공시 피드 (DART/EDGAR, F12) |
| /api/stocks/:id/dividends | GET | 배당 정보 (F15) |
| /api/stocks/:id/quote | GET | 현재가 (클라이언트 5~10초 폴링) |
| /api/briefings/today | GET / POST(재생성) | 브리핑 |
| /api/calendar?from=&to= | GET/POST/PATCH | 일정 |
| /api/analyses | POST | 분석 실행 {stock_id, models[]} (수동) |
| /api/analyses?stock_id= | GET | 분석 히스토리 |
| /api/paper/orders | POST | 모의 주문 (장외 시 reserved 자동 처리) |
| /api/paper/orders/:id | DELETE | 예약주문 취소 |
| /api/paper/portfolio | GET | 시즌·계좌·포지션 요약 |
| /api/paper/reset | POST | 시즌 종료 + 새 시즌 시작 |
| /api/settings, /api/settings/schedules | GET/PATCH, CRUD | 설정·분석 스케줄 |
| /api/cron/dispatch | GET | **30분 단위 단일 크론 디스패처** (시크릿 검증) |

**크론 설계 (D4 핵심)**: Vercel Cron은 고정 시각만 지원하므로, 30분마다 `/api/cron/dispatch` 1개를 실행 → 현재 시각과 매칭되는 작업을 판단해 수행: ① analysis_schedules 매칭 시 자동 AI 분석 ② 06:30 브리핑 ③ 뉴스 수집(장중 3h/장외 6h 계산) ④ 지표 일일 갱신 ⑤ 개장 직후 예약주문 체결. 사용자가 스케줄 시간을 바꿔도 크론 설정 변경 불필요. (스케줄 시간은 30분 단위로 입력 제한)

---

## 11. System Architecture

```
[Next.js 15 (App Router) on Vercel]
  ├─ UI (RSC + Client: 시세 폴링/차트/계산기)
  ├─ Route Handlers (내부 API + 외부 프록시)
  └─ Vercel Cron → /api/cron/dispatch (30분 주기 단일 디스패처)
        │
[Supabase] PostgreSQL + Auth + RLS    [Upstash Redis(옵션)] 시세 캐시·KIS 토큰 보관
        │
[외부 소스 — Provider 어댑터 패턴 (lib/providers/)]
  ├─ 시세·차트·종목검색: KIS OpenAPI (한국 국내 + 해외주식, REST) — 확정 D3
  │     · 접근토큰 24h 캐시, 레이트리밋(초당 20건) 큐 관리
  │     · V1.5: WebSocket 실시간 체결가 전환
  ├─ 재무(한국): DART OpenAPI
  ├─ 재무(미국): FMP 무료티어 (대안: yahoo-finance2) — CAPEX·분기실적
  ├─ 뉴스: 네이버 뉴스 검색 API(한국) + Finnhub News(미국)
  ├─ 일정: Finnhub Earnings Calendar + 거시일정 시드 데이터 + AI 보강
  ├─ 환율·금리·VIX: KIS(환율) + FRED API(금리) + 시세 API(VIX)
  └─ AI: Anthropic API + OpenAI API (키는 user_settings 암호화 보관)
```

---

## 12. Non-Functional Requirements

성능: 대시보드 초기 로드 < 2.5s(PC), 내부 API p95 < 500ms(캐시 적중), 시세 폴링 5~10초. 비용: 외부 API 무료 티어 내 운영(KIS 무료·DART 무료·FMP/Finnhub 무료티어), AI 비용 = 브리핑 일 1회 + 자동분석 (종목 수 × 2회 × 모델 수) — 설정에서 종목별 토글·횟수로 제어. 보안: 모든 키 서버측 암호화 저장(AES-256, Supabase Vault 또는 pgcrypto), 클라이언트 노출 금지, 크론 시크릿 검증, RLS 전면 적용. 신뢰성: 외부 장애 시 마지막 성공 데이터 + 기준 시각 표시. 정확성: 모든 수치 출처·시각 표기 + 투자 면책 문구 상시.

---

## 13. Edge Cases

거래정지·상장폐지(뱃지, 갱신 중단), 신규 상장(재무 부재 → "데이터 축적 중"), 휴장일(예약주문 체결 연기, 뉴스 수집은 유지), 실적일 미확정("(예정)"), KIS 토큰 만료(자동 재발급), KIS 레이트리밋(큐잉+백오프), AI 응답 형식 불량(1회 재시도 → 원문 표시), 자동분석 시각에 서버 콜드스타트(디스패처 타임아웃 여유 60s, 작업 분할), 동시 예약주문 다건(개장 시 순차 체결), 환율 실패(마지막 값+수동 보정), 시드머니 변경(현재 시즌 영향 없음, 다음 리셋부터), 모의투자 분할 매수 평단가 계산(가중평균), 뉴스 페이월(메타 기반 요약+링크).

---

## 14. Analytics (개인용 경량)

브리핑 열람률, 자동/수동 분석 실행 수·성공률, 모의투자 시즌별 승률·평균 손익(핵심: AI 의견 vs 본인 판단 vs 결과 비교 가능 구조), 외부 API 호출량·실패율, AI 토큰 사용량(비용 추적). 도구: Supabase 자체 기록 + Vercel Analytics.

---

## 15. Tech Stack (확정)

| 레이어 | 선택 | 비고 |
|--------|------|------|
| 프론트엔드 | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui | 기존 스택 정렬 |
| 차트 | TradingView Lightweight Charts | 무료·금융 특화 |
| 백엔드 | Next.js Route Handlers + Vercel Cron(단일 디스패처) | 별도 서버 불요 |
| DB/인증 | Supabase (PostgreSQL, Auth, RLS, 키 암호화) | |
| 캐시 | Upstash Redis (KIS 토큰·시세 캐시) | 옵션→권장 승격 |
| 시세 | **KIS OpenAPI (확정)** | 국내+해외, REST→V1.5 WS |
| 재무 | DART(한국) + FMP 무료티어(미국) | Provider 교체 가능 구조 |
| 뉴스 | 네이버 뉴스 API + Finnhub | |
| AI | Anthropic API + OpenAI API | 듀얼 분석 |
| 배포 | Vercel | |

---

## 16. AI Coding Instructions (Claude Code용)

TypeScript strict. 서버 페칭 RSC 우선, 클라이언트는 폴링·차트·계산기만. 외부 API는 `lib/providers/` 인터페이스(`QuoteProvider`, `MetricsProvider`, `NewsProvider`, `CalendarProvider`)로 격리 — 소스 교체 시 어댑터만 수정. 금액: 정수(원·센트) 또는 decimal.js, 부동소수점 연산 금지. 시간: UTC 저장, KST/EST 표시 변환(`lib/utils/market-hours.ts`에 개장시간·휴장일 단일 관리). KIS 토큰·레이트리밋은 `lib/providers/kis/client.ts`에서 중앙 관리(토큰 Redis 캐시, 요청 큐). 에러: 도메인 에러 클래스 + 한국어 사용자 메시지. AI 프롬프트는 `lib/ai/prompts/`에 버전 관리. 커밋 전 `tsc --noEmit` + ESLint. 환경변수: 서버 전용(`NEXT_PUBLIC_` 금지 목록 명시), 사용자별 키는 DB 암호화 컬럼.

---

## 17. Folder Structure

```
stock-desk/
├── app/
│   ├── (dashboard)/page.tsx          # S1
│   ├── calendar/                     # S2
│   ├── stocks/[id]/                  # S4 (overview|chart|news|analysis|paper 탭)
│   ├── paper/                        # S6 (+ seasons/ 아카이브)
│   ├── settings/                     # S8 (스케줄 편집기 포함)
│   └── api/                          # 10장 + cron/dispatch
├── components/                       # ui/, charts/, stock/, calendar/, paper/, calculator/
├── lib/
│   ├── providers/                    # kis/(client,quote,candle,search), dart.ts, fmp.ts,
│   │                                 #   naver-news.ts, finnhub.ts, fred.ts
│   ├── ai/                           # claude.ts, openai.ts, prompts/(analysis.v1, briefing.v1)
│   ├── cron/                         # dispatch.ts, jobs/(analysis, briefing, news, metrics, settle)
│   ├── supabase/                     # client, server, queries/
│   └── utils/                        # money.ts, date.ts, market-hours.ts, crypto.ts
├── supabase/migrations/
└── CLAUDE.md                         # 본 PRD 참조 + 16장 규칙 요약
```

---

## 18. Development Roadmap

| 단계 | 범위 | 기간(예상) |
|------|------|-----------|
| **MVP** | 기반(인증·설정·KIS 연동) → F3 검색·등록 → F6 차트 → 시세 폴링 → F11 시장 위젯 → F4 지표 → F15 배당 → F5 뉴스 + F12 공시 → F1 브리핑 → F8 계산기 → F13 노트 | 4~5주 |
| **V1** | F2 캘린더(+F15 배당 일정 연동) → F7 AI 듀얼 분석(자동 스케줄 포함) → F9 모의투자(시즌·예약주문) → F14 기술지표 | +3~4주 |
| **V1.5** | KIS WebSocket 실시간 전환, 성능·비용 최적화 | +1~2주 |
| **V2** | F16 종목 비교, F17 뉴스↔주가 오버레이, 멀티유저 가입 활성화 | 이후 |

MVP 순서 논리: 종목 등록(F3)이 모든 기능의 전제 → 시세·차트로 골격 검증 → 데이터 파이프라인(지표·배당·뉴스·공시는 동일 크론 구조 공유) → AI 의존 기능(브리핑)과 계산기·노트로 마감. F12·F15는 F4 지표 파이프라인과 데이터 소스(DART·FMP)를 공유하므로 같은 주차에 묶어 개발 효율을 높임.

---

## 19. Task Breakdown (MVP 기준)

**W1 — 기반**: 프로젝트 셋업, DB 마이그레이션(9장), Supabase Auth(단일 계정), 설정 화면(키 입력·암호화·검증), KIS 클라이언트(토큰 관리·레이트리밋 큐·종목검색·현재가·캔들), 레이아웃(사이드바/하단탭 반응형)
**W2 — 종목 코어**: F3 검색·등록(그룹 포함), F6 차트, 종목 상세 골격, F11 시장 위젯, 시세 폴링 훅, F8 계산기
**W3 — 펀더멘털 파이프라인**: 크론 디스패처 골격, DART·FMP Provider → F4 지표 화면 + F15 배당 카드, F12 공시 수집(DART 공시검색 + EDGAR) + AI 1줄 요약 → 공시 섹션
**W4 — 뉴스·브리핑**: 네이버·Finnhub 뉴스 Provider + AI 요약·감성분류 → F5 피드(장중 3h/장외 6h, 공시와 통합 크론), F1 브리핑 파이프라인 + 아카이브
**W5 — 마감**: F13 노트, 엣지케이스 처리, 모바일 반응형 점검, API 사용량 로그, 배포·운영 점검

---

## 부록 A. 리스크 및 의존성

KIS OpenAPI: 계좌 필요(확보됨), 토큰 24h 만료·레이트리밋 관리 필수, 해외주식 시세는 무료 신청 시 지연시세일 수 있음(실시간 신청 여부 확인 필요 — 개발 W1에서 검증). FMP/Finnhub 무료티어 한도(뉴스·실적캘린더) — 초과 시 갱신주기 자동 완화. AI 비용: 종목 수 × 일 2회 × 2모델이 기본 — 종목별 토글로 제어, 사용량 대시보드 제공. 모든 정보는 투자 권유 아님(면책 상시).

## 부록 B. 미결 사항

없음 — D1~D8 모두 확정 완료. 본 문서가 개발 기준 버전(v1.0)이며, 개발 중 발생하는 변경은 Decision Log에 D9+로 추가 기록한다.

---
*v1.0 (개발 착수 확정본) — 2026-06-12 확정*
