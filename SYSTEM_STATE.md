# SYSTEM_STATE — Stock Desk

> 다음 세션 시작 시 본 파일을 첨부. 상세 이력은 `task-history.md`, 기준 문서는 `docs/PRD.md`.

## 현재 상태 (2026-06-14)

- **진행도**: W1~W5(MVP) + V1 + **V2 완료** → **배포(Vercel 연결) 단계**
- **검증**: 단위 테스트 258/258, `tsc`/`lint`/`next build` clean
- **앱**: 데스크톱(Electron). dev=`npm run dev`, 데스크톱=`npm run app:build && npm run app:start`
- **마이그레이션**: 0001~0004 **모두 적용 완료**(`_migrations` 기록 확인)
- **배포 인프라**: `/api/cron/dispatch`(시크릿 검증)·`vercel.json`(30분 크론)·`docs/DEPLOY.md`. 실제 `vercel --prod`만 남음(사용자 계정 연결 필요)

## 완료 기능

- **W1~W2**: 인프라·인증·시세·차트·워치리스트·시장위젯
- **W3**: F4 지표·F15 배당·F12 공시 (DART/Finnhub/FMP/EDGAR)
- **W4**: F5 뉴스·AI 요약/감성·F1 브리핑 (네이버/Finnhub + OpenAI gpt-4o-mini)
- **W5**: F13 노트, API 사용량 로그, error 바운더리, 거래정지 뱃지
- **V1**: F2 캘린더(거시 시드+Finnhub 실적), F7 AI 분석(OpenAI 단일, 수동), F9 모의투자(D5), F14 기술지표(SMA/RSI)
- **V2**: F16 종목 비교(`app/compare` — 최대 4종목 F4 지표 표), F17 뉴스↔주가 오버레이(`price-chart` 일/주봉 뉴스 마커)

## 키 / 데이터 소스

| 소스 | 용도 | 상태 |
|---|---|---|
| KIS | 시세·국내 지표·모의투자 체결가 | 설정됨 |
| Finnhub | 미국 재무·실적·뉴스·실적캘린더 | 설정 입력 |
| FMP | 미국 배당(stable) | 설정 입력 |
| 네이버 | 한국 뉴스 | 설정 입력 |
| OpenAI gpt-4o-mini | AI 요약·감성·브리핑·분석(F7) | 설정 입력 |
| Anthropic | F7 듀얼(추후) | 미설정 |
| SEC EDGAR | 미국 공시 | 무인증 |
| DART | 한국 재무·배당·공시 | 미발급 |

## 보류 / 다음

- **Vercel 배포**: `vercel link` → 환경변수 등록(`docs/DEPLOY.md`) → `vercel --prod` (사용자 계정 인증 필요). 크론은 `vercel.json`로 자동 등록
- 앱 E2E: 뉴스/공시 AI 요약, 브리핑 생성, 캘린더 갱신, AI 분석 실행, 모의투자 주문 (실 키 입력 후)
- **데이터 공백**: DART 키 발급 시 `sync:corp-codes` → 한국 펀더멘털/공시 채움
- **후속**: Anthropic 듀얼 비교뷰, F7 자동분석 `analysis_schedules` 매칭, 예약주문 시초가 체결 완성

## Decision Log (최신)

- **D10**: 뉴스=네이버/Finnhub, AI=OpenAI gpt-4o-mini(Vercel AI SDK), AI 호출=수동 트리거(크론 골격)
- **D9**: 펀더멘털 미국=Finnhub/FMP/EDGAR, 한국=DART(+KIS). 상세 `docs/PRD.md` 0장
- (V1 F7 OpenAI 단일·수동, F9 D5는 기존 결정 범위 — 신규 D 불필요)
