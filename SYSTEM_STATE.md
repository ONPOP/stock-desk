# SYSTEM_STATE — Stock Desk

> 다음 세션 시작 시 본 파일을 첨부. 상세 이력은 `task-history.md`, 기준 문서는 `docs/PRD.md`.

## 현재 상태 (2026-06-15)

- **진행도**: W1~W5(MVP)+V1+V2 완료 + 디자인 재설계(B 트레이더 콕핏) + **실거래 매매일지·포트폴리오 개편 완료**. 검증 전부 통과(tsc·lint·vitest 270/270·build·standalone). 마이그레이션 0005·0006 **적용 완료**. 작업 브랜치 커밋 예정/완료.
- **앱**: 데스크톱(Electron) `/Applications/Stock Desk.app` 설치됨. dev=`npm run dev`, 데스크톱 실행=`npm run app:build && npm run app:start`, 설치형 빌드=`npm run app:dist`. standalone 재빌드 완료(`scripts/electron-prepare.js`).
- **마이그레이션**: 0001~0006 **전부 적용 완료**.

## 이번 세션 완료분 (실거래 매매일지 + 포트폴리오)

### 백엔드·API
- `watchlist.ts`: `is_favorite`/`sort_order` 반영(order by sort_order), `setFavorite`·`reorderWatchlist` 추가
- `lib/validation/market.ts`: `watchlistPatchSchema`(favorite/reorder discriminated union)
- `app/api/watchlist/route.ts`: `PATCH`(즐겨찾기·정렬)
- 매매일지: `real-trades.ts`(CRUD)·`portfolio.ts`(computeHoldings·computeRealized·evalHolding·summarizePortfolio, 평균법·하이브리드 통화)·`app/api/trades`·`lib/validation/trades.ts` — 테스트 12/12 포함 전체 270/270 통과

### 프론트엔드
- **내 종목**(`watchlist-manager.tsx`): 즐겨찾기 섹션(중복 표시)→거래소 고정순서(KOSPI→NASDAQ→KOSDAQ→NYSE→AMEX), @dnd-kit 같은 묶음 내 드래그 정렬, 카드 별 토글, 보유 종목 평가손익(`watchlist-card.tsx`), 하단 고정 요약바+recharts 자산배분 도넛(`portfolio-summary-bar.tsx`)
- **대시보드**(`stat-tiles.tsx`): KOSPI 타일 → 포트폴리오 KPI 타일(`portfolio-kpi-tile.tsx`, 원화환산 평가금액+손익률). `market-kpi-tile.tsx` 제거
- **기간별 수익률**(`app/performance/page.tsx`·`performance-view.tsx`): 연도/월/기간 토글 + 누적라인·기간별 바·종목별 도넛(recharts). 사이드바 메뉴 추가(`app-shell.tsx`, 모바일 하단탭 제외)
- 공용 환율 훅 `lib/hooks/use-usd-krw.ts`(시장지수 원/달러)
- 손익계산기·매매일지 패널(`profit-calculator.tsx`·`holdings-trades-panel.tsx`·`stock-detail.tsx` 개요탭 통합)

## 남은 작업

- (선택) 데스크톱 설치형 재배포 시 `npm run app:dist`
- (선택) Vercel 배포: 사용자 환경변수 등록 후 진행
- 즐겨찾기/시장 묶음이 단일 `sort_order` 컬럼을 공유 → 한 묶음 정렬이 다른 묶음 상대순서에 영향(허용된 단순화). 분리 필요 시 별도 정렬 컬럼 검토.

## 확정 결정 (이번 세션)
- 매매일지 = 모의투자(paper_*)와 별개 신규 테이블 `real_trades`. 보유/평단/실현손익은 매매기록 **파생 계산**(단일 진실 원천).
- 차트 = **recharts**(도넛/바/라인). lightweight-charts는 캔들 전용 유지.
- 통화 합산 = **하이브리드**(원화 환산 통합 + 통화별 분리). 환율 = 시장지수 원/달러.
- 기간별 수익률 = **전용 페이지 + 사이드바 메뉴**.
- 드래그 = **같은 묶음(즐겨찾기/시장) 내 순서만**.

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
