# 시세 폴링 부하 해결 설계

> **이 설계서에는 본문 구현 코드를 넣지 않는다**(프로젝트 규칙). 파일 경로·공개 인터페이스·불변식·검증 방법만 적는다.

**목표:** 워치리스트가 커져도 탭 이동이 막히지 않게 한다. 화면에 보이는 종목만 폴링하고, 같은 종목의 중복 요청을 하나로 합치고, 마지막 시세를 재사용한다.

## 문제 (2026-08-07 실측)

앱에 CDP로 붙어 Playwright로 측정한 값이다.

```
대시보드(/) 정지 상태 20초: /api/quote 785건 · 종목 260개 · 초당 39.3건
종목당 평균 간격 7002ms  ← 훅 자체는 정상
```

`watchlist_items`가 297건(중복 제거 260종목)까지 늘었고, `app/(dashboard)/page.tsx:26`이
`listAllWatchlistItems`로 10개 탭을 전부 합쳐 `WatchlistTiles`에 넘긴다. 타일마다 `useQuote`가 붙는다.

연쇄:

1. **수요 39건/초 > 처리 능력 20건/초** — `lib/providers/kis/client.ts:75`의 `RateLimiter({ maxPerSecond: 20 })`
2. **캐시가 100% 빗나간다** — `lib/providers/quote-cache.ts`의 `TTL_MS = 6_000` < 폴링 간격 7000ms.
   쓰기만 하고 한 번도 읽히지 않는다
3. 응답이 7~13초로 늘어나면 다음 틱이 진행 중인 요청을 `abort`하고 새로 쏜다(`use-quote.ts:29`).
   서버는 버려진 요청을 계속 처리한다(유휴 상태 CPU 13~19%)
4. **브라우저 커넥션 풀 고갈** — HTTP/1.1 동일 호스트 6개 한도에 수백 개가 대기.
   탭 이동의 RSC 요청(`/notes?_rsc=…`)이 그 뒤에 굶는다(실측 85초 미완)

대조 실험이 인과를 확정한다.

| 구간 | 폴링 | 이동 시간 |
|---|---|---|
| `/settings` → `/notes` | 없음 | 456ms |
| `/notes` → `/reports` | 없음 | 558ms |
| `/reports` → `/settings` | 없음 | 301ms |
| `/`(대시보드) → 어디로든 | 260종목 | 페이지 로드조차 9분 내 미완 |

**범위 밖(이미 정상):** `/stocks`는 활성 탭 하나만 조회하고(`app/stocks/page.tsx:19`),
`watchlist-manager.tsx:64`의 `itemsByTab`이 탭을 클릭할 때만 가져와 캐시한다. 건드리지 않는다.

## 구조

### ① `lib/hooks/use-quote-store.ts` (신규) — 종목 단위 공유 스토어

훅이 아니라 **스토어가 타이머와 요청을 소유**한다. 모듈 레벨 `Map<StoreKey, Entry>`.

```ts
/** `${ticker}:${market}` */
export type StoreKey = string;

export interface QuoteSnapshot {
  quote: Quote | null;
  source: string | null;
  error: string | null;
  /** 마지막 수신 시각(ms). null이면 아직 한 번도 못 받았다 */
  at: number | null;
}

export interface SubscribeOptions {
  intervalMs: number;
}

/** 구독하고 즉시 현재 스냅샷을 받는다. 반환값은 구독 해제 함수 */
export function subscribeQuote(
  ticker: string,
  market: Market,
  opts: SubscribeOptions,
  onChange: (snap: QuoteSnapshot) => void,
): () => void;

/** 구독과 무관하게 한 번 강제 갱신 */
export function refetchQuote(ticker: string, market: Market): void;

/** 테스트 전용 — 스토어 전체 비우기 */
export function __resetQuoteStore(): void;
```

**불변식:**

- 한 키에 **타이머는 최대 1개**다. 구독자가 몇 명이든 늘지 않는다
- 한 키에 **진행 중 요청은 최대 1개**다. 진행 중에 새 틱이 오면 새 요청을 만들지 않고 그 요청을 기다린다
  (기존 `use-quote.ts`의 `abort` 후 재요청과 반대다 — 중복 요청이 부하의 원인이었다)
- 구독자가 0이 되면 타이머를 멈추지만 **마지막 값은 남긴다**
- 새 구독자는 `onChange`로 **현재 스냅샷을 동기적으로 먼저 받는다**. 값이 있으면 로딩 상태를 거치지 않는다
- 값을 못 받은 적이 없는 키의 `at`은 null이다. UI가 "로딩"과 "오래된 값"을 구분할 수 있어야 한다
- 폴링 간격이 다른 구독자가 섞이면 **살아있는 구독자 중 가장 짧은 간격**을 쓴다.
  짧은 쪽이 구독을 해제하면 남은 구독자 기준으로 다시 계산해 타이머를 건다
- 문서가 `hidden`이면 모든 타이머를 멈추고, 다시 보이면 재개한다(기존 `use-quote.ts`의 동작 유지)

**메모리:** 구독자 없는 엔트리는 마지막 수신 후 5분이 지나면 버린다. 워치리스트 규모(수백)에서
스냅샷 하나는 작지만 무한히 쌓이게 두지 않는다.

### ② `lib/hooks/use-in-viewport.ts` (신규) — 가시성 훅

```ts
export interface InViewportOptions {
  /** 화면에 들어오기 전에 미리 켜는 여유. 기본 '200px' */
  rootMargin?: string;
}

export function useInViewport<T extends Element>(
  opts?: InViewportOptions,
): [ref: RefObject<T | null>, visible: boolean];
```

**불변식:**

- `IntersectionObserver`는 `rootMargin`별로 **모듈에서 공유**한다. 행마다 옵저버를 만들지 않는다
- `IntersectionObserver`가 없는 환경에서는 `visible: true`로 떨어진다(폴링이 멈춰 값이 안 나오는 것보다 낫다)
- 언마운트 시 `unobserve`한다

### ③ `lib/hooks/use-quote.ts` (수정) — 스토어 위로 다시 쓴다

**공개 시그니처를 바꾸지 않는다.** 호출부 7곳이 그대로 동작해야 한다.

```ts
// 기존과 동일
export function useQuote(ticker: string, market: Market, opts?: UseQuoteOptions): UseQuoteResult;
```

`UseQuoteResult`에 필드 하나만 **추가**한다(기존 소비자는 무시하면 된다).

```ts
interface UseQuoteResult {
  quote: Quote | null;
  source: string | null;
  error: string | null;
  loading: boolean;
  /**
   * `enabled: false`인데 스토어의 마지막 값을 대신 보여주고 있는가.
   * 화면 밖으로 나간 타일이 값은 유지하되 갱신은 멈춘 상태를 뜻한다.
   * `enabled: true`면 값이 아무리 오래됐어도 false다(갱신은 돌고 있으므로).
   */
  stale: boolean;
  refetch: () => void;
}
```

**불변식:**

- `enabled: false`여도 **스토어에 값이 있으면 그 값을 반환**한다(`stale: true`). 기존 구현은 아무것도
  반환하지 않았고, 그대로 두면 화면 밖에 나갔다 온 타일이 `…`으로 되돌아간다
- `loading`은 "값이 한 번도 없었고 요청이 진행 중"일 때만 true다

### ④ 서버 캐시 — `lib/providers/quote-cache.ts` (수정)

`TTL_MS`를 `6_000` → `10_000`으로 올린다. 폴링 간격(7000ms)보다 길어야 캐시가 의미를 갖는다.
시세가 최대 10초 지날 수 있다는 대가는 사용자 승인됨(2026-08-07).

`TTL_MS`가 폴링 기본 간격보다 짧아지면 캐시가 죽는다는 사실을 주석으로 남긴다.

### ⑤ 호출부 — 가시성 게이트

목록형 컴포넌트만 `useInViewport`의 ref를 행 루트에 붙이고 `useQuote(..., { enabled: visible })`을 넘긴다.

| 파일 | 대상 | 비고 |
|---|---|---|
| `components/dashboard/watchlist-tiles.tsx` | `Row` | 260개 — 주 원인 |
| `components/live/live-client.tsx` | `WatchRow` | 260개 — `/live`도 `listAllWatchlistItems`를 쓴다 |
| `components/stocks/watchlist-card.tsx` | 카드 | 활성 탭(≤65) |
| `components/paper/paper-client.tsx:486` | 보유 행 | |

**건드리지 않는 곳:** `components/dashboard/portfolio-overview.tsx`의 `PricePoller`는 `return null`이라
붙일 DOM이 없다. 현재 보유 종목은 0개이고, 스토어 공유·중복 제거 이득은 그대로 받는다.
단일 종목 소비자(`stocks/stock-detail.tsx`, `live-client` 선택 종목, `paper-client:58`)는 항상 보이므로 그대로 둔다.

## 데이터 흐름

```
행이 화면에 들어옴
  → useInViewport visible=true
  → useQuote(enabled=true)
  → subscribeQuote(키)
      ├ 스토어에 값 있음 → 즉시 onChange(스냅샷)         [로딩 없음]
      └ 타이머 없음 → 타이머 1개 생성 + 즉시 1회 fetch
  → GET /api/quote  → getCachedQuote (TTL 10초)
      ├ 히트 → 즉시 반환                                [KIS 호출 없음]
      └ 미스 → KIS (RateLimiter 20/초)

행이 화면 밖으로 나감
  → visible=false → 구독 해제 → 구독자 0이면 타이머 정지
  → 마지막 값은 남아 있고 화면에도 계속 보인다(stale=true)
```

## 오류 처리

- 요청 실패는 스토어의 `error`에 담고 마지막 성공값은 유지한다. 화면은 값 + 오류 표시를 함께 낼 수 있다
- 스토어는 실패해도 타이머를 멈추지 않는다(일시 장애 후 자동 복구)
- 서버의 stale 폴백(`quote-cache.ts`의 `STALE_MAX_MS = 5분`)은 그대로 둔다

## 검증

**단위 테스트** (`lib/hooks/use-quote-store.test.ts` 신규)

- 같은 키 구독자 2명 → `fetch` 호출 1건, 타이머 1개
- 구독 해제 후 타이머 정지, 재구독 시 **마지막 값이 동기적으로 먼저** 온다
- 진행 중 요청이 있을 때 새 틱이 와도 요청이 늘지 않는다
- 간격이 다른 구독자가 섞이면 짧은 쪽이 쓰인다
- `document.hidden` 전환에 타이머가 멈추고 재개된다
- 구독자 0 + 5분 경과 엔트리는 버려진다

**실측** — 진단에 쓴 것과 같은 방법(CDP `--remote-debugging-port` + Playwright `connectOverCDP`).
임시 스크립트로 재고, 확인 후 삭제한다.

- 대시보드 정지 20초: `/api/quote` 요청 수와 종목 수가 **화면에 보이는 행 수 수준**으로 떨어지는지
  (기준선 785건/260종목)
- 대조 실험 재실행: 대시보드 → 다른 탭 이동이 **0.3~0.6초대**로 들어오는지
  (기준선: 로드조차 미완)
- `/live`도 같은 방식으로 잰다
- 스크롤로 타일을 화면 밖에 뒀다 돌아왔을 때 `…`이 아니라 값이 즉시 보이는지

**회귀** — `npx tsc --noEmit` · `npm run lint` · `npm test`

## 위험도

| 항목 | 위험도 | 검증 강도 |
|---|---|---|
| 공유 스토어(타이머·요청 수명) | **위험** — 누수나 중복이면 문제가 되돌아온다 | 단위 테스트 + 실측 |
| 가시성 훅 | 보통 | 단위 테스트 + 실측 |
| `useQuote` 재작성 | 보통 | 기존 호출부 동작 확인 |
| 서버 TTL 상수 | 낮음 | 테스트만 |
| 호출부 게이트 4곳 | 낮음 | 실측에 포함 |

## 이번 범위 밖

- 일괄 조회 엔드포인트(`/api/quotes?tickers=…`) — 가시성 게이트로 요청 수가 충분히 떨어지면 불필요하다.
  실측 후 여전히 부족하면 그때 별건으로 다룬다
- `localStorage` 영속 캐시 — 장외 시간에 오래된 가격이 보이는 오해 여지가 있어 하지 않는다
- 대시보드 타일 개수 제한·페이지네이션 — 기능 축소라 하지 않는다
- WebSocket 실시간 전환(D3 V1.5) — 별개 트랙
