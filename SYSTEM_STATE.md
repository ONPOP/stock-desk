# SYSTEM_STATE — Stock Desk

> 다음 세션 시작 시 본 파일을 첨부. 상세 이력은 `task-history.md`, 기준 문서는 `docs/PRD.md`.

## 현재 상태 (2026-08-05, v0.10.0)

- **진행도**: MVP(W1~W5)+V1+V2 + 자동매매(D15) 완료. **정기 배치 분석 엔진(D16)** + **자동 로그인(D17)** 구축 완료.
- **마이그레이션**: 0001~0018 전부 적용 완료.
- **검증**: tsc · eslint · vitest 570/570 · next build 전부 통과. E2E: `e2e:auto-login` 15/15.
- **자동 실행**: launchd 슬롯 10개 등록됨(`install-schedule --status`로 확인). 중지는 `--remove`.

## 이번 세션 완료분 (분석 엔진 D16)

### 배치 엔진
- `lib/engine/` — 지표 확장(MA120/200·이격·기간수익률·국면·MA 터치추적), 스코어러, 관찰 레이더,
  슬라이드 스키마/HTML/빌더, 저장경로(외장볼륨), KIS 토큰캐시, launchd plist, 채점, 크론 UI 변환
- `scripts/engine/` — `run-slot.sh`(launchd 진입점) · `run-slot.ts`(오케스트레이터) · pipeline · render-slides(Playwright)
  · archive · notify(텔레그램) · grade-signals · grade-report · install-schedule · seed-engine
- `.claude/skills/stock-analysis/SKILL.md` — Claude 헤드리스 분석 계약

### 앱
- **`/reports`** 신규 — [아카이브] 슬라이드 이미지 날짜·시간별 열람(라이트박스) / [설정] 슬롯 스케줄·선정 규칙·관찰 규칙·테마·저장/예산
- `/stocks` 카드에 📢 항상 브리핑 · ⌖ 관찰 고정 토글 추가
- `/settings`의 엔진 저장 설정은 `/reports` 설정 탭으로 이동(링크만 남김)

### 산출물 형태
- pptx 파일이 아니라 **슬라이드 PNG**. 자기완결 HTML → Playwright 캡처(1600×900) → 로컬 원본 + Storage 썸네일.
- 실측: 43종목 수집 ~30초, 슬라이드 13장 렌더, Claude 분석 포함 E2E 정상.

### 수정한 기존 버그
- `kis/rate-limiter.ts` 타이머 `unref()` → 배치 프로세스에서 대기 요청이 유실되며 exit 0 종료
- 눌림목 판정이 일중 변동폭만으로 상시 참 → 터치 기준 MA20으로 강화
- `crypto.ts`를 `crypto-core.ts`로 분리(배치가 server-only를 import할 수 없어서). 웹 경로 가드는 유지

## 자동 로그인 (D17)

- 기본 **꺼짐**. 로그인 화면 체크박스 또는 `/settings` 토글로 켠다. 켜면 직접 로그아웃할 때까지 유지.
- 비밀번호를 저장하지 않는다 — 유지되는 값은 Supabase refresh token(인증 쿠키)이다.
- 정책 쿠키 2개로 판정: `sd_auto_login`(영속) · `sd_session_active`(세션). 둘 다 없으면 미들웨어가 인증 쿠키를 지우고 `/login`으로 보낸다.
- 검증: `npm run e2e:auto-login` (dev 서버 필요). 세션은 admin 매직링크로 만들어 비밀번호를 다루지 않는다.

## 남은 작업

- **텔레그램**: `.env.local`에 `TELEGRAM_BOT_TOKEN` 추가 필요(현재는 알림만 스킵)
- **KR 수급(flowKr 15점)**: KIS 투자자별 매매동향 미연동 → 한국 종목은 항상 이 점수를 못 받음
- **KIS 호출량**: 종목당 800일봉 = 8회 페이지네이션. `price_candles` 증분 캐시로 축소 여지
- (선택) 데스크톱 재배포 `npm run app:dist`

## 키 / 데이터 소스

| 소스 | 용도 | 상태 |
|---|---|---|
| KIS | 시세·국내 지표 | 미입력(현재 Yahoo 폴백, 배포본은 데이터센터 IP라 Yahoo 차단됨) |
| Finnhub / FMP / 네이버 / OpenAI | 미국 재무·배당 / 한국뉴스 / AI | 설정 입력됨 |
| SEC EDGAR | 미국 공시 | 무인증 |
| DART | 한국 재무·배당·공시 | 미발급(한국 펀더멘털 공백) |
| Anthropic | F7 듀얼(추후) | 미설정 |

## Decision Log (최신)
- **D10**: 뉴스=네이버/Finnhub, AI=OpenAI gpt-4o-mini, AI 호출=수동 트리거(크론 골격)
- **D9**: 펀더멘털 미국=Finnhub/FMP/EDGAR, 한국=DART(+KIS). 상세 `docs/PRD.md` 0장
