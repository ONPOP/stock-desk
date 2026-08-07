import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Quote } from '@/types';
import {
  subscribeQuote,
  refetchQuote,
  peekQuote,
  __resetQuoteStore,
  type QuoteSnapshot,
} from './use-quote-store';

const QUOTE: Quote = {
  ticker: '005930',
  market: 'KOSPI',
  currency: 'KRW',
  price: 70000,
  change: 500,
  changeRate: '0.72',
  volume: 1000,
  asOf: '2026-01-01T00:00:00.000Z',
};

const QUOTE2: Quote = { ...QUOTE, price: 71000, change: 1500 };

/** visibilitychange를 흉내내는 최소 document 스텁 (vitest 환경은 node라 document가 없다) */
type Listener = () => void;
let docListeners: Set<Listener>;
let fakeDocument: { hidden: boolean };

function installFakeDocument() {
  docListeners = new Set();
  const doc = {
    hidden: false,
    addEventListener(type: string, fn: Listener) {
      if (type === 'visibilitychange') docListeners.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      if (type === 'visibilitychange') docListeners.delete(fn);
    },
  };
  fakeDocument = doc;
  (globalThis as { document?: unknown }).document = doc;
}

function setHidden(hidden: boolean) {
  fakeDocument.hidden = hidden;
  for (const fn of [...docListeners]) fn();
}

type FetchImpl = (...args: unknown[]) => Promise<unknown>;

/** ok 응답을 주는 fetch 스텁 */
function okFetch(quote: Quote = QUOTE, source = 'kis'): FetchImpl {
  return async () => ({
    ok: true,
    json: async () => ({ source, quote }),
  });
}

function installFetch(impl: FetchImpl) {
  const fn = vi.fn(impl);
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

/** 수동으로 resolve/reject 하는 deferred */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let originalFetch: unknown;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  originalFetch = (globalThis as { fetch?: unknown }).fetch;
  installFakeDocument();
});

afterEach(() => {
  __resetQuoteStore();
  vi.useRealTimers();
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
  delete (globalThis as { document?: unknown }).document;
});

describe('subscribeQuote', () => {
  it('구독 즉시 onChange를 동기적으로 1회 호출한다 (값 없으면 loading/at 초기값)', () => {
    installFetch(async () => ({ ok: true, json: async () => ({ source: 'kis', quote: QUOTE }) }));
    const seen: QuoteSnapshot[] = [];

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, (s) => seen.push(s));

    // await 없이 이미 호출돼 있어야 한다
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ quote: null, source: null, error: null, at: null, loading: true });
    unsub();
  });

  it('같은 키 구독자 2명 → fetch 1건, 타이머 1개', async () => {
    const fetchMock = installFetch(okFetch());

    const un1 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    const un2 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    un1();
    un2();
  });

  it('진행 중 요청이 있으면 타이머가 틱해도 fetch 호출이 늘지 않는다', async () => {
    const d = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = installFetch(() => d.promise);

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 응답이 오지 않은 채로 3주기를 흘려도 요청은 그대로 1건
    await vi.advanceTimersByTimeAsync(7000 * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    d.resolve({ ok: true, json: async () => ({ source: 'kis', quote: QUOTE }) });
    await vi.advanceTimersByTimeAsync(0);

    // 응답이 온 뒤 다음 틱에서는 다시 요청한다
    await vi.advanceTimersByTimeAsync(7000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('구독자 전원 해제 → 타이머 정지 (여러 주기를 흘려도 fetch가 늘지 않는다)', async () => {
    const fetchMock = installFetch(okFetch());

    const un1 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    const un2 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    un1();
    expect(vi.getTimerCount()).toBe(1); // 아직 한 명 남았다
    un2();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(7000 * 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('재구독 시 마지막 값이 동기적으로 먼저 온다', async () => {
    installFetch(okFetch());

    const un1 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    un1();

    const seen: QuoteSnapshot[] = [];
    const un2 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, (s) => seen.push(s));

    expect(seen).toHaveLength(1);
    expect(seen[0].quote).toEqual(QUOTE);
    expect(seen[0].loading).toBe(false);
    expect(seen[0].at).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    un2();
  });

  it('간격 7000·15000 혼재 → 7000으로 돌고, 7000 해제 후 15000으로 다시 걸린다', async () => {
    const fetchMock = installFetch(okFetch());

    const unFast = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    const unSlow = subscribeQuote('005930', 'KOSPI', { intervalMs: 15000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7000);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 짧은 쪽 간격을 쓴다
    expect(vi.getTimerCount()).toBe(1);

    unFast();
    // 남은 구독자 기준(15000)으로 다시 계산된다
    await vi.advanceTimersByTimeAsync(14999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unSlow();
  });

  it('document.hidden 이면 타이머를 멈추고, 다시 보이면 재개한다', async () => {
    const fetchMock = installFetch(okFetch());

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(7000 * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 재개 시 즉시 1회

    await vi.advanceTimersByTimeAsync(7000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unsub();
  });

  it('요청 실패 시 error를 채우고 이전 quote는 남기며 다음 틱에 재시도한다', async () => {
    let mode: 'ok' | 'fail' = 'ok';
    const fetchMock = installFetch(async () => {
      if (mode === 'fail') throw new Error('network down');
      return { ok: true, json: async () => ({ source: 'kis', quote: QUOTE }) };
    });

    const seen: QuoteSnapshot[] = [];
    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, (s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)?.quote).toEqual(QUOTE);

    mode = 'fail';
    await vi.advanceTimersByTimeAsync(7000);
    const failed = seen.at(-1)!;
    expect(failed.error).toBe('network down');
    expect(failed.quote).toEqual(QUOTE); // 마지막 성공값 유지
    expect(failed.at).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 실패해도 타이머는 멈추지 않는다
    mode = 'ok';
    await vi.advanceTimersByTimeAsync(7000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen.at(-1)?.error).toBeNull();
    unsub();
  });

  it('HTTP 오류 응답의 error 메시지를 사용한다', async () => {
    installFetch(async () => ({
      ok: false,
      json: async () => ({ error: '시세 소스가 응답하지 않습니다.' }),
    }));

    const seen: QuoteSnapshot[] = [];
    const unsub = subscribeQuote('AAPL', 'NASDAQ', { intervalMs: 7000 }, (s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(0);

    expect(seen.at(-1)?.error).toBe('시세 소스가 응답하지 않습니다.');
    expect(seen.at(-1)?.loading).toBe(false);
    unsub();
  });

  it('ticker·market 조합이 다르면 별개 키로 각각 폴링한다', async () => {
    const fetchMock = installFetch(okFetch());

    const un1 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    const un2 = subscribeQuote('AAPL', 'NASDAQ', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe('/api/quote?ticker=005930&market=KOSPI');
    expect(urls[1]).toBe('/api/quote?ticker=AAPL&market=NASDAQ');
    un1();
    un2();
  });

  it('구독자 0 상태로 5분이 지나면 엔트리를 버린다', async () => {
    installFetch(okFetch());

    const un1 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    un1();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect(peekQuote('005930', 'KOSPI')).toBeNull();

    const seen: QuoteSnapshot[] = [];
    const un2 = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, (s) => seen.push(s));
    expect(seen[0]).toEqual({ quote: null, source: null, error: null, at: null, loading: true });
    un2();
  });

  it('구독자가 있으면 5분이 지나도 버리지 않는다', async () => {
    installFetch(okFetch());

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    expect(peekQuote('005930', 'KOSPI')?.quote).toEqual(QUOTE);
    unsub();
  });
});

describe('peekQuote', () => {
  it('없는 키는 null, 있는 키는 스냅샷을 준다', async () => {
    installFetch(okFetch(QUOTE2));

    expect(peekQuote('005930', 'KOSPI')).toBeNull();

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);

    const snap = peekQuote('005930', 'KOSPI');
    expect(snap?.quote).toEqual(QUOTE2);
    expect(snap?.source).toBe('kis');
    expect(snap?.loading).toBe(false);
    unsub();
  });
});

describe('refetchQuote', () => {
  it('구독자가 없어도 1회 갱신한다', async () => {
    const fetchMock = installFetch(okFetch());

    refetchQuote('005930', 'KOSPI');
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekQuote('005930', 'KOSPI')?.quote).toEqual(QUOTE);
    expect(vi.getTimerCount()).toBe(0); // 구독자가 없으므로 타이머는 걸지 않는다
  });

  it('진행 중 요청이 있으면 아무것도 하지 않는다', async () => {
    const d = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = installFetch(() => d.promise);

    const unsub = subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    refetchQuote('005930', 'KOSPI');
    refetchQuote('005930', 'KOSPI');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    d.resolve({ ok: true, json: async () => ({ source: 'kis', quote: QUOTE }) });
    await vi.advanceTimersByTimeAsync(0);
    unsub();
  });
});

describe('__resetQuoteStore', () => {
  it('타이머와 값을 모두 비운다', async () => {
    installFetch(okFetch());

    subscribeQuote('005930', 'KOSPI', { intervalMs: 7000 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    __resetQuoteStore();

    expect(vi.getTimerCount()).toBe(0);
    expect(peekQuote('005930', 'KOSPI')).toBeNull();
    expect(docListeners.size).toBe(0);
  });
});
