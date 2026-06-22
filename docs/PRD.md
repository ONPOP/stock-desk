# PRD — Stock Desk (가칭) v1.0 [개발 착수 확정본]

> 개인용 주식 투자 보조 프로그램 · 확정일 2026-06-12
> v1.0: 모든 결정 사항(D1~D8) 확정 완료. 본 문서를 기준으로 개발 진행.
> D7 확정 — F12 공시·F15 배당을 MVP에 추가 포함

---

## 0. 확정된 핵심 결정 사항 (Decision Log)

| # | 항목 | 결정 |
|---|------|------|
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
