# 시세 폴링 부하 해결 구현 계획

> **작업자에게:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`로 태스크 단위 실행한다. 체크박스(`- [ ]`)로 진행을 추적한다.
>
> **이 계획서에는 본문 구현 코드를 넣지 않는다**(프로젝트 규칙). 파일 경로·공개 인터페이스·불변식·검증 방법만 적는다. 시그니처와 테스트 케이스 목록은 그대로 따르되, 함수 본문은 구현 단계에서 쓴다.

**목표:** 워치리스트가 커져도 탭 이동이 막히지 않게 한다. 화면에 보이는 종목만 폴링하고, 같은 종목의 중복 요청을 하나로 합치고, 마지막 시세를 재사용한다.

**설계 근거:** `docs/superpowers/specs/2026-08-07-quote-polling-load-design.md`

**아키텍처:** 폴링의 주체를 훅에서 **모듈 레벨 스토어**로 옮긴다. 스토어가 종목별로 타이머 1개·진행 중 요청 1개를 소유하고 마지막 값을 보관한다. `useQuote`는 시그니처를 유지한 채 스토어의 얇은 구독자가 되고, 목록형 컴포넌트는 `IntersectionObserver`로 얻은 가시성을 기존 `enabled` 옵션에 넘긴다. 서버 캐시 TTL은 폴링 간격보다 길게 올린다.

**기술 스택:** TypeScript strict · React 19 · Next 15 App Router · vitest · IntersectionObserver

## 전역 제약

- 기존 `useQuote`의 **공개 시그니처를 바꾸지 않는다.** 호출부 7곳이 수정 없이 동작해야 한다(`stale` 필드 추가만 허용).
- 시세 값의 금액은 정수(원·센트)다. 부동소수점 연산을 넣지 않는다.
- `lib/hooks/*`는 클라이언트 코드다. `server-only`를 import하지 않는다.
- 유료 API를 추가하지 않는다. 요청 수를 줄이는 것이 이번 작업의 전부다.
- 커밋 전 `npx tsc --noEmit` + `npm run lint` + `npm test` 통과 필수.
- 스펙 변경이 필요하면 임의 결정하지 말고 사용자 승인 후 설계서에 반영한다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/hooks/use-quote-store.ts` (신규) | 종목별 타이머·진행 중 요청·마지막 값. React를 모른다 |
| `lib/hooks/use-quote-store.test.ts` (신규) | 스토어 단위 테스트 |
| `lib/hooks/use-in-viewport.ts` (신규) | 공유 `IntersectionObserver` → `[ref, visible]` |
| `lib/hooks/use-in-viewport.test.ts` (신규) | 가시성 훅 단위 테스트 |
| `lib/hooks/use-quote.ts` (수정) | 스토어 구독자로 재작성. 시그니처 유지 + `stale` 추가 |
| `lib/providers/quote-cache.ts` (수정) | `TTL_MS` 6초 → 10초 (+ 왜 폴링 간격보다 길어야 하는지 주석) |
| `components/dashboard/watchlist-tiles.tsx` (수정) | `Row`에 가시성 게이트 |
| `components/live/live-client.tsx` (수정) | `WatchRow`에 가시성 게이트 |
| `components/stocks/watchlist-card.tsx` (수정) | 카드에 가시성 게이트 |
| `components/paper/paper-client.tsx` (수정) | 보유 행(486줄 부근)에 가시성 게이트 |

**건드리지 않는 것:** `app/stocks/page.tsx`·`components/stocks/watchlist-manager.tsx`(탭 지연 로딩이 이미 구현돼 있다), `components/dashboard/portfolio-overview.tsx`의 `PricePoller`(`return null`이라 붙일 DOM이 없다), 단일 종목 소비자(`stocks/stock-detail.tsx`, `live-client` 선택 종목, `paper-client:58`).

## 위험도 분류

착수 전 각 태스크의 검증 강도를 정한다. 전부에 같은 강도를 쓰지 않는다.

| 태스크 | 위험도 | 검증 강도 |
|---|---|---|
| 1 공유 스토어 | **위험** — 타이머·요청 누수면 문제가 그대로 돌아온다 | 단위 테스트 + 변이 테스트 |
| 2 가시성 훅 | 보통 | 단위 테스트 |
| 3 `useQuote` 재작성 + 서버 TTL | 보통 | 단위 테스트 + 기존 호출부 타입 확인 |
| 4 호출부 게이트 4곳 | 낮음 | 타입·린트만. 리뷰 라운드 없음 |
| 5 실측 검증 | **위험** — 이걸로 성공을 판정한다 | 실측 + 기준선 대비 |

---

### Task 1: 공유 스토어

**파일:**
- 생성: `lib/hooks/use-quote-store.ts`
- 생성: `lib/hooks/use-quote-store.test.ts`

**인터페이스 (produces):**

```ts
import type { Market, Quote } from '@/types';

/** `${ticker}:${market}` */
export type StoreKey = string;

export interface QuoteSnapshot {
  quote: Quote | null;
  source: string | null;
  error: string | null;
  /** 마지막 수신 시각(ms). null이면 아직 한 번도 못 받았다 */
  at: number | null;
  /** 값이 한 번도 없었고 요청이 진행 중인가 */
  loading: boolean;
}

export interface SubscribeOptions {
  intervalMs: number;
}

/** 구독하고 즉시 현재 스냅샷을 받는다(동기 호출). 반환값은 구독 해제 함수 */
export function subscribeQuote(
  ticker: string,
  market: Market,
  opts: SubscribeOptions,
  onChange: (snap: QuoteSnapshot) => void,
): () => void;

/** 구독 여부와 무관하게 한 번 강제 갱신. 진행 중 요청이 있으면 아무것도 하지 않는다 */
export function refetchQuote(ticker: string, market: Market): void;

/** 구독자 없이 스냅샷만 읽는다(구독하지 않는 소비자용) */
export function peekQuote(ticker: string, market: Market): QuoteSnapshot | null;

/** 테스트 전용 — 스토어 전체 비우기(타이머·리스너 포함) */
export function __resetQuoteStore(): void;
```

**불변식:**

- 한 키에 **타이머는 최대 1개**다. 구독자가 몇 명이든 늘지 않는다.
- 한 키에 **진행 중 요청은 최대 1개**다. 진행 중에 틱이 오면 새 요청을 만들지 않고 그 요청을 기다린다.
  (기존 `use-quote.ts:29`의 `abort` 후 재요청과 반대다 — 중복 요청이 부하의 원인이었다)
- 구독자가 0이 되면 타이머를 멈추지만 **마지막 값은 남긴다**.
- `subscribeQuote`는 `onChange`를 **동기적으로 1회 먼저 호출**해 현재 스냅샷을 준다. 값이 있으면 소비자가 로딩 상태를 거치지 않는다.
- 간격이 다른 구독자가 섞이면 **살아있는 구독자 중 가장 짧은 간격**을 쓴다. 짧은 쪽이 해제되면 남은 구독자 기준으로 다시 계산해 타이머를 건다.
- `document.hidden`이면 모든 타이머를 멈추고, 다시 보이면 재개한다(기존 동작 유지).
- 요청 실패는 `error`에 담고 **마지막 성공값(`quote`·`at`)은 유지**한다. 실패해도 타이머를 멈추지 않는다.
- 구독자 0인 엔트리는 마지막 수신 후 5분이 지나면 버린다.

**단계:**

- [ ] **1-1. 실패하는 테스트 작성** — `use-quote-store.test.ts`. `fetch`는 vitest `vi.fn()` 스텁, 타이머는 `vi.useFakeTimers()`. 각 케이스 사이에 `__resetQuoteStore()`. 케이스:
  - 구독 즉시 `onChange`가 **동기적으로** 1회 호출된다(값 없으면 `loading: true`, `at: null`)
  - 같은 키 구독자 2명 → `fetch` 호출 **1건**, 타이머 **1개**
  - 진행 중 요청이 있을 때 타이머가 틱해도 `fetch` 호출 수가 늘지 않는다
  - 구독 전원 해제 → 타이머 정지(시간을 여러 주기 진행시켜도 `fetch`가 더 안 불린다)
  - 재구독 → **마지막 값이 동기적으로 먼저** 온다(`loading: false`, `at` 유지)
  - 간격 7000·15000 구독자 혼재 → 7000 간격으로 돈다. 7000 쪽 해제 후 15000으로 다시 걸린다
  - `document.hidden = true` 이벤트 → 타이머 정지. `false` → 재개
  - `fetch` 거부 → `error` 채워지고 이전 `quote`는 남는다. 다음 틱에 다시 시도한다
  - 구독자 0 + 5분 경과 → 엔트리 폐기(재구독 시 `at: null`부터 시작)
  - `peekQuote`: 없는 키는 null, 있는 키는 스냅샷
- [ ] **1-2. 테스트 실패 확인** — `npx vitest run lib/hooks/use-quote-store.test.ts` → 모듈 없음으로 FAIL
- [ ] **1-3. 구현** — `lib/hooks/use-quote-store.ts`
- [ ] **1-4. 테스트 통과 확인** — 같은 명령 → PASS
- [ ] **1-5. 변이 테스트** — 사본에서 "진행 중 요청 재사용"을 일부러 제거해(매 틱마다 새 `fetch`) 1-1의 **"진행 중 요청이 있을 때 fetch 수가 늘지 않는다"** 테스트가 실제로 실패하는지 확인한다. 실패하지 않으면 그 테스트는 이번 작업의 핵심을 하나도 지키지 못하는 것이므로 다시 쓴다. 확인 후 원복.
- [ ] **1-6. 커밋** — `feat(hooks): 종목 단위 시세 공유 스토어`

---

### Task 2: 가시성 훅

**파일:**
- 생성: `lib/hooks/use-in-viewport.ts`
- 생성: `lib/hooks/use-in-viewport.test.ts`

**소비 (consumes):** 없음

**인터페이스 (produces):**

```ts
import type { RefObject } from 'react';

export interface InViewportOptions {
  /** 화면에 들어오기 전에 미리 켜는 여유. 기본 '200px' */
  rootMargin?: string;
}

export function useInViewport<T extends Element>(
  opts?: InViewportOptions,
): [ref: RefObject<T | null>, visible: boolean];
```

**불변식:**

- `IntersectionObserver`는 **`rootMargin` 값별로 모듈에서 공유**한다. 행마다 새 옵저버를 만들지 않는다.
- `IntersectionObserver`가 없는 환경(구형·테스트)에서는 `visible: true`로 떨어진다. 폴링이 영영 안 켜지는 것보다 낫다.
- 언마운트 시 `unobserve`하고, 그 옵저버의 마지막 대상이면 `disconnect`한다.
- 초기값은 `false`다(관측 콜백이 오기 전까지 폴링을 켜지 않는다). 단 위의 폴백 경로는 예외다.

**단계:**

- [ ] **2-1. 실패하는 테스트 작성** — `use-in-viewport.test.ts`. `IntersectionObserver`를 직접 스텁해 관측 콜백을 수동으로 발화시킨다(jsdom에 구현이 없다). 케이스:
  - 초기 `visible`은 false
  - 관측 콜백이 `isIntersecting: true`를 주면 `visible`이 true가 된다
  - false로 돌아오면 `visible`도 false가 된다
  - 같은 `rootMargin`으로 훅 3개 → `IntersectionObserver` 생성자는 **1번만** 호출된다
  - 다른 `rootMargin` → 별도 옵저버가 만들어진다
  - 언마운트 시 `unobserve`가 불린다
  - `globalThis.IntersectionObserver`가 없으면 `visible`이 true다
- [ ] **2-2. 테스트 실패 확인** — `npx vitest run lib/hooks/use-in-viewport.test.ts`
- [ ] **2-3. 구현** — `lib/hooks/use-in-viewport.ts`
- [ ] **2-4. 테스트 통과 확인**
- [ ] **2-5. 커밋** — `feat(hooks): 공유 IntersectionObserver 가시성 훅`

---

### Task 3: `useQuote` 재작성 + 서버 캐시 TTL

**파일:**
- 수정: `lib/hooks/use-quote.ts` (전면 재작성)
- 수정: `lib/providers/quote-cache.ts` (상수 1개 + 주석)
- 생성: `lib/hooks/use-quote.test.ts`

**소비 (consumes):** Task 1의 `subscribeQuote` · `refetchQuote` · `QuoteSnapshot` · `__resetQuoteStore`

**인터페이스 (produces):**

```ts
// 기존과 동일 — 바꾸지 않는다
export interface UseQuoteOptions {
  intervalMs?: number;   // 기본 7000
  enabled?: boolean;     // 기본 true
}

export interface UseQuoteResult {
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

export function useQuote(ticker: string, market: Market, opts?: UseQuoteOptions): UseQuoteResult;
```

**불변식:**

- `enabled: true` → `subscribeQuote`로 구독한다.
- `enabled: false` → **구독하지 않되 `peekQuote`로 마지막 값을 읽어 반환**한다(`stale: true`). 기존 구현은 아무것도 반환하지 않았고, 그대로 두면 화면 밖에 나갔다 온 타일이 `…`으로 되돌아간다.
- `loading`은 "값이 한 번도 없었고 요청이 진행 중"일 때만 true다. `enabled: false`이고 값도 없으면 `loading: false` · `quote: null`이다.
- `ticker`/`market`이 바뀌면 이전 키를 구독 해제하고 새 키를 구독한다.
- 훅은 타이머를 만들지 않는다. `setInterval`이 이 파일에 남아 있으면 잘못 구현한 것이다.

**`quote-cache.ts` 수정:**

`TTL_MS`를 `6_000` → `10_000`으로 올린다. 주석에 **"폴링 기본 간격(`use-quote.ts`의 7000ms)보다 길어야 한다. 짧으면 매 폴링이 만료 직후에 도착해 캐시가 100% 빗나간다"** 는 이유를 남긴다. 시세가 최대 10초 지날 수 있다는 대가는 승인됨(2026-08-07).

**단계:**

- [ ] **3-1. 실패하는 테스트 작성** — `use-quote.test.ts`. `@testing-library/react`의 `renderHook`을 쓰고 스토어는 실제 모듈을 쓰되 `fetch`만 스텁한다(스토어와의 결합을 실제로 검증하기 위함). 케이스:
  - `enabled: true` → 값이 도착하면 `quote`가 채워지고 `stale: false`
  - `enabled: false` + 스토어에 값 있음 → **그 값을 반환**하고 `stale: true`, `fetch`는 불리지 않는다
  - `enabled: false` + 값 없음 → `quote: null`, `loading: false`, `stale: false`
  - `enabled`가 true→false→true로 바뀌어도 값이 유지된다(`…`로 되돌아가지 않는다)
  - 같은 종목을 보는 훅 2개 → `fetch` 1건
  - `ticker` 변경 → 이전 키 구독 해제, 새 키 구독
  - `refetch()` 호출 → 강제 갱신
- [ ] **3-2. 테스트 실패 확인** — `npx vitest run lib/hooks/use-quote.test.ts`
- [ ] **3-3. `use-quote.ts` 재작성** — 스토어 구독자로. 이 파일에서 `setInterval`·`AbortController`를 제거한다
- [ ] **3-4. `quote-cache.ts`의 `TTL_MS` 상향 + 주석**
- [ ] **3-5. 테스트 통과 확인** — `npx vitest run lib/hooks/`
- [ ] **3-6. 기존 호출부 타입 확인** — `npx tsc --noEmit`. 7개 호출부가 수정 없이 통과해야 한다. 실패하면 시그니처를 바꾼 것이므로 되돌린다
- [ ] **3-7. 커밋** — `refactor(hooks): useQuote를 공유 스토어 위로 + 서버 캐시 TTL 상향`

---

### Task 4: 호출부 가시성 게이트

**파일:**
- 수정: `components/dashboard/watchlist-tiles.tsx` (`Row`)
- 수정: `components/live/live-client.tsx` (`WatchRow`)
- 수정: `components/stocks/watchlist-card.tsx` (카드 루트)
- 수정: `components/paper/paper-client.tsx` (보유 행, 486줄 부근)

**소비 (consumes):** Task 2의 `useInViewport`, Task 3의 `useQuote(..., { enabled })` · `stale`

**불변식:**

- 각 행/카드의 **루트 DOM 요소**에 ref를 붙인다. 이미 `Link`·`button`이 루트면 거기에 붙인다.
- `useQuote`에는 `enabled: visible`만 넘긴다. 다른 옵션은 기존 값을 유지한다
  (`watchlist-tiles`·`live-client`·`watchlist-card`는 기본 7000ms, `paper-client:486`도 기존 그대로).
- **레이아웃을 바꾸지 않는다.** 화면 밖 행도 같은 높이를 차지해야 스크롤이 튀지 않는다. 값이 없는 동안 표시하던 자리표시자(`…`·`—`)를 그대로 둔다.
- `stale`은 이번 태스크에서 **시각적으로 쓰지 않는다.** 값은 그냥 보여준다. 흐리게 처리할지는 실측 후 별도 판단한다(YAGNI).

**단계:**

- [ ] **4-1. `watchlist-tiles.tsx`의 `Row` 수정** — `useInViewport` 추가, 루트 `Link`에 ref, `enabled: visible`
- [ ] **4-2. `live-client.tsx`의 `WatchRow` 수정** — 같은 방식, 루트 `button`에 ref
- [ ] **4-3. `watchlist-card.tsx` 수정** — 같은 방식
- [ ] **4-4. `paper-client.tsx` 보유 행 수정** — 같은 방식
- [ ] **4-5. 타입·린트 확인** — `npx tsc --noEmit` · `npm run lint`
- [ ] **4-6. 커밋** — `perf(ui): 화면에 보이는 종목만 시세 폴링`

---

### Task 5: 실측 검증

**파일:** 없음(임시 스크립트는 확인 후 삭제한다)

**소비 (consumes):** Task 1~4 전부

**측정 방법** — 2026-08-07 진단에 쓴 것과 같다.

1. 앱을 종료하고 원격 디버깅을 켜 다시 띄운다:
   `"/Applications/Stock Desk.app/Contents/MacOS/Stock Desk" --remote-debugging-port=9222`
   (설치된 앱이 아니라 이번 변경을 반영하려면 `npm run app:build && npm run app:start`로 띄운 뒤 같은 플래그를 준다)
2. 임시 tsx 스크립트에서 `chromium.connectOverCDP('http://127.0.0.1:9222')`로 붙는다.
   playwright는 리포지토리 의존성이므로 스크립트는 **리포지토리 안**에 둬야 모듈 해석이 된다.
3. `page.on('request')`로 `/api/quote?ticker=…`를 수집한다.

**기준선 (2026-08-07 수정 전):**

| 측정 | 값 |
|---|---|
| 대시보드 정지 20초 · 요청 수 | 785건 |
| 대시보드 정지 20초 · 종목 수 | 260개 |
| 초당 요청 | 39.3건 |
| `/settings` → `/notes` 이동 | 456ms |
| `/notes` → `/reports` 이동 | 558ms |
| `/reports` → `/settings` 이동 | 301ms |
| `/`(대시보드) → 다른 탭 이동 | 로드조차 9분 내 미완 |

**합격 기준:**

- 대시보드 정지 20초의 **종목 수가 화면에 보이는 행 수 수준**으로 떨어진다(260 → 창 크기에 따라 수십).
  `rootMargin: 200px` 여유분은 포함해도 된다
- **대시보드에서 다른 탭으로 이동이 1초 미만.** 폴링 없는 페이지끼리의 301~558ms와 같은 자릿수여야 한다
- `/live`도 같은 방식으로 재서 종목 수가 260에서 떨어진다
- 스크롤로 타일을 화면 밖에 뒀다 돌아왔을 때 `…`이 아니라 **값이 즉시** 보인다

**단계:**

- [ ] **5-1. 변경 반영 빌드** — `npm run app:build`
- [ ] **5-2. 원격 디버깅으로 앱 실행** — 위 1번
- [ ] **5-3. 대시보드 폴링 측정** — 정지 20초. 요청 수·종목 수·초당 요청을 기준선과 나란히 기록
- [ ] **5-4. 탭 이동 측정** — 대시보드에서 `/notes`로. 폴링 없는 구간(`/settings`→`/notes`)도 같이 재서 대조
- [ ] **5-5. `/live` 측정** — 5-3과 같은 방식
- [ ] **5-6. 스크롤 복귀 확인** — 타일을 화면 밖으로 스크롤했다가 되돌아왔을 때 값이 즉시 보이는지 스크린샷으로 확인
- [ ] **5-7. 합격 기준 미달 시** — 요청 수가 충분히 안 떨어지면 설계서의 "이번 범위 밖"에 적어둔 일괄 조회 엔드포인트를 **별건으로** 제안한다. 이 계획에서 임의로 추가하지 않는다
- [ ] **5-8. 임시 스크립트 삭제 + 워킹 트리 확인** — `git status`가 깨끗해야 한다
- [ ] **5-9. 최종 회귀** — `npx tsc --noEmit` · `npm run lint` · `npm test`
- [ ] **5-10. 측정 결과를 설계서에 기록** — 기준선 표에 "수정 후" 열을 추가한다
- [ ] **5-11. 커밋** — `docs: 시세 폴링 부하 수정 실측 결과`

---

## 이번 범위 밖

설계서 §"이번 범위 밖"과 동일하다. 일괄 조회 엔드포인트(`/api/quotes?tickers=…`), `localStorage` 영속 캐시, 대시보드 타일 개수 제한·페이지네이션, WebSocket 실시간 전환(D3 V1.5)은 하지 않는다.

`/stocks`의 워치리스트 탭 지연 로딩은 **이미 구현돼 있다**(`app/stocks/page.tsx:19`, `watchlist-manager.tsx:64`). 다시 만들지 마라.

## 리뷰 규칙

리뷰에서 나온 minor/nit는 수정 라운드에 올리지 않는다. 한 줄로 기록만 하고 넘어간다. Critical/Important만 수정 라운드를 돈다. 재리뷰는 Critical이 있었을 때만 돈다.
