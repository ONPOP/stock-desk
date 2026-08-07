'use client';

// 종목 단위 시세 공유 스토어 (PRD D3: MVP REST 폴링 5~10초).
// 같은 종목을 여러 컴포넌트가 구독해도 타이머 1개·진행 중 요청 1개만 유지한다.
// React 의존성 없음 — 훅 바인딩은 use-quote.ts가 담당한다.
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

type Listener = (snap: QuoteSnapshot) => void;

interface Subscriber {
  intervalMs: number;
  onChange: Listener;
}

interface Entry {
  ticker: string;
  market: Market;
  snapshot: QuoteSnapshot;
  subscribers: Set<Subscriber>;
  timer: ReturnType<typeof setInterval> | null;
  /** 현재 걸려 있는 타이머의 간격 — 간격이 바뀔 때만 재무장한다 */
  timerIntervalMs: number | null;
  /** 진행 중 요청. 있으면 새 요청을 만들지 않고 이 요청을 재사용한다 */
  inFlight: Promise<void> | null;
  /** 마지막 활동 시각(수신·구독 변화). 구독자 0 상태에서 폐기 판단에 쓴다 */
  touchedAt: number;
}

/** 구독자 0인 엔트리 보존 기간 */
const IDLE_TTL_MS = 5 * 60 * 1000;

const store = new Map<StoreKey, Entry>();

const EMPTY_SNAPSHOT: QuoteSnapshot = {
  quote: null,
  source: null,
  error: null,
  at: null,
  loading: true,
};

function keyOf(ticker: string, market: Market): StoreKey {
  return `${ticker}:${market}`;
}

// ── 탭 가시성 ────────────────────────────────────────────────────────────
// 리스너는 키마다가 아니라 모듈 전체에 1개만 단다. document가 없는 환경(테스트·SSR)도 견딘다.

let visibilityBound = false;

function hasDocument(): boolean {
  return typeof document !== 'undefined';
}

function isHidden(): boolean {
  return hasDocument() && document.hidden;
}

function onVisibilityChange() {
  if (isHidden()) {
    for (const entry of store.values()) stopTimer(entry);
    return;
  }
  for (const entry of store.values()) {
    if (entry.subscribers.size === 0) continue;
    syncTimer(entry);
    void fetchNow(entry);
  }
}

function bindVisibility() {
  if (visibilityBound || !hasDocument()) return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  visibilityBound = true;
}

function unbindVisibility() {
  if (!visibilityBound || !hasDocument()) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  visibilityBound = false;
}

// ── 엔트리 ───────────────────────────────────────────────────────────────

function getOrCreate(ticker: string, market: Market): Entry {
  const key = keyOf(ticker, market);
  const found = store.get(key);
  if (found) return found;
  const entry: Entry = {
    ticker,
    market,
    snapshot: EMPTY_SNAPSHOT,
    subscribers: new Set(),
    timer: null,
    timerIntervalMs: null,
    inFlight: null,
    touchedAt: Date.now(),
  };
  store.set(key, entry);
  return entry;
}

/** 구독자 없이 오래 방치된 엔트리를 접근 시점에 정리한다(전역 스윕 타이머를 두지 않기 위함) */
function sweepIdle(now: number) {
  for (const [key, entry] of store) {
    if (entry.subscribers.size > 0) continue;
    if (entry.inFlight) continue;
    if (now - entry.touchedAt < IDLE_TTL_MS) continue;
    stopTimer(entry);
    store.delete(key);
  }
}

function publish(entry: Entry, snapshot: QuoteSnapshot) {
  entry.snapshot = snapshot;
  entry.touchedAt = Date.now();
  for (const sub of [...entry.subscribers]) sub.onChange(snapshot);
}

// ── 타이머 ───────────────────────────────────────────────────────────────

function stopTimer(entry: Entry) {
  if (entry.timer !== null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
  entry.timerIntervalMs = null;
}

/** 살아있는 구독자 중 가장 짧은 간격. 구독자가 없으면 null */
function shortestInterval(entry: Entry): number | null {
  let shortest: number | null = null;
  for (const sub of entry.subscribers) {
    if (shortest === null || sub.intervalMs < shortest) shortest = sub.intervalMs;
  }
  return shortest;
}

/** 구독 상태·가시성에 맞춰 타이머를 정확히 1개로 맞춘다 */
function syncTimer(entry: Entry) {
  const desired = shortestInterval(entry);
  if (desired === null || isHidden()) {
    stopTimer(entry);
    return;
  }
  if (entry.timer !== null && entry.timerIntervalMs === desired) return;
  stopTimer(entry);
  entry.timerIntervalMs = desired;
  entry.timer = setInterval(() => {
    void fetchNow(entry);
  }, desired);
}

// ── 요청 ─────────────────────────────────────────────────────────────────

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '시세를 불러오지 못했습니다.';
}

/** 요청은 키당 최대 1개. 진행 중이면 그 요청을 그대로 돌려준다(중복 요청 금지) */
function fetchNow(entry: Entry): Promise<void> {
  if (entry.inFlight) return entry.inFlight;

  const run = (async () => {
    try {
      const res = await fetch(
        `/api/quote?ticker=${encodeURIComponent(entry.ticker)}&market=${encodeURIComponent(entry.market)}`,
      );
      const data = (await res.json()) as { quote?: Quote; source?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '시세를 불러오지 못했습니다.');
      publish(entry, {
        quote: data.quote ?? null,
        source: data.source ?? null,
        error: null,
        at: Date.now(),
        loading: false,
      });
    } catch (e) {
      // 실패해도 마지막 성공값(quote·source·at)은 유지하고 타이머도 멈추지 않는다
      publish(entry, { ...entry.snapshot, error: messageOf(e), loading: false });
    }
  })();

  entry.inFlight = run.finally(() => {
    entry.inFlight = null;
  });
  return entry.inFlight;
}

// ── 공개 API ─────────────────────────────────────────────────────────────

/** 구독하고 즉시 현재 스냅샷을 받는다(동기 호출). 반환값은 구독 해제 함수 */
export function subscribeQuote(
  ticker: string,
  market: Market,
  opts: SubscribeOptions,
  onChange: (snap: QuoteSnapshot) => void,
): () => void {
  sweepIdle(Date.now());
  bindVisibility();

  const entry = getOrCreate(ticker, market);
  const sub: Subscriber = { intervalMs: opts.intervalMs, onChange };
  const wasIdle = entry.subscribers.size === 0;
  entry.subscribers.add(sub);
  entry.touchedAt = Date.now();

  // 소비자가 로딩 상태를 거치지 않도록 현재 값을 동기적으로 먼저 준다
  onChange(entry.snapshot);

  syncTimer(entry);
  // 폴링이 멈춰 있던 키에 첫 구독자가 붙으면 즉시 한 번 받아온다
  if (wasIdle && !isHidden()) void fetchNow(entry);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.subscribers.delete(sub);
    entry.touchedAt = Date.now();
    // 남은 구독자 기준으로 간격을 다시 계산해 타이머를 건다(구독자 0이면 정지)
    syncTimer(entry);
  };
}

/** 구독 여부와 무관하게 한 번 강제 갱신. 진행 중 요청이 있으면 아무것도 하지 않는다 */
export function refetchQuote(ticker: string, market: Market): void {
  const entry = getOrCreate(ticker, market);
  if (entry.inFlight) return;
  void fetchNow(entry);
}

/** 구독자 없이 스냅샷만 읽는다(구독하지 않는 소비자용) */
export function peekQuote(ticker: string, market: Market): QuoteSnapshot | null {
  sweepIdle(Date.now());
  return store.get(keyOf(ticker, market))?.snapshot ?? null;
}

/** 테스트 전용 — 스토어 전체 비우기(타이머·리스너 포함) */
export function __resetQuoteStore(): void {
  for (const entry of store.values()) {
    stopTimer(entry);
    entry.subscribers.clear();
    entry.inFlight = null;
  }
  store.clear();
  unbindVisibility();
}
