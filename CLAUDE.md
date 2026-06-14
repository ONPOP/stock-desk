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

**스펙 변경 규칙**: 개발 중 결정 변경이 발생하면 임의 결정하지 말고 사용자 승인 후 `docs/PRD.md`의 Decision Log에 **D9부터 추가 기록**한다.

---

## 폴더 구조

**PRD 17장의 폴더 구조를 따른다.** 유틸은 `lib/utils/`, 외부 API는 `lib/providers/`, 크론 잡은 `lib/cron/jobs/`, 마이그레이션은 `supabase/migrations/`.

---

## 검증 명령

```bash
npx tsc --noEmit   # 타입 체크
npm run lint       # ESLint
npm test           # 단위 테스트 (vitest)
```
