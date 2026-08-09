// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { Quote } from '@/types';
import { useQuote } from './use-quote';
import { __resetQuoteStore, refetchQuote } from './use-quote-store';

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

const QUOTE2: Quote = { ...QUOTE, price: 71000, change: 1500 };

/** 수동으로 resolve/reject 하는 deferred */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let originalFetch: unknown;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  originalFetch = (globalThis as { fetch?: unknown }).fetch;
});

afterEach(() => {
  cleanup();
  __resetQuoteStore();
  vi.useRealTimers();
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
});

describe('useQuote', () => {
  it('enabled: true — 값이 도착하면 quote가 채워지고 stale은 false', async () => {
    installFetch(okFetch());

    const { result } = renderHook(() => useQuote('005930', 'KOSPI'));

    expect(result.current.quote).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.stale).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.quote).toEqual(QUOTE);
    expect(result.current.loading).toBe(false);
    expect(result.current.stale).toBe(false);
  });

  it('enabled: false + 스토어에 값 있음 — 그 값을 반환하고 stale: true, fetch는 불리지 않는다', async () => {
    const fetchMock = installFetch(okFetch());

    // 훅과 무관하게 스토어에 값을 미리 채워둔다
    refetchQuote('005930', 'KOSPI');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const { result } = renderHook(() => useQuote('005930', 'KOSPI', { enabled: false }));

    expect(result.current.quote).toEqual(QUOTE);
    expect(result.current.stale).toBe(true);
    expect(result.current.loading).toBe(false);

    // 비활성 상태에서는 폴링이 돌지 않으므로 시간이 흘러도 fetch가 늘지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000 * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enabled: false + 값 없음 — quote: null, loading: false, stale: false', () => {
    const fetchMock = installFetch(okFetch());

    const { result } = renderHook(() => useQuote('999999', 'KOSPI', { enabled: false }));

    expect(result.current.quote).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.stale).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enabled가 true→false→true로 바뀌어도 값이 유지된다', async () => {
    installFetch(okFetch());

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQuote('005930', 'KOSPI', { enabled }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.quote).toEqual(QUOTE);

    rerender({ enabled: false });
    expect(result.current.quote).toEqual(QUOTE);
    expect(result.current.stale).toBe(true);

    rerender({ enabled: true });
    expect(result.current.quote).toEqual(QUOTE);
    expect(result.current.stale).toBe(false);
  });

  it('같은 종목을 보는 훅 2개 → fetch 1건', async () => {
    const fetchMock = installFetch(okFetch());

    renderHook(() => useQuote('005930', 'KOSPI'));
    renderHook(() => useQuote('005930', 'KOSPI'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ticker 변경 — 이전 키 구독 해제, 새 키 구독', async () => {
    const fetchMock = installFetch(okFetch());

    const { rerender } = renderHook(({ ticker }: { ticker: string }) => useQuote(ticker, 'KOSPI'), {
      initialProps: { ticker: '005930' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ ticker: '000660' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('ticker=005930');
    expect(urls[1]).toContain('ticker=000660');

    // 이전 키(005930)는 구독자가 없으므로 다음 주기에 다시 요청되지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    const urlsAfter = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urlsAfter.filter((u) => u.includes('ticker=005930'))).toHaveLength(1);
  });

  it('refetch() 호출 — 강제 갱신', async () => {
    const fetchMock = installFetch(okFetch());

    const { result } = renderHook(() => useQuote('005930', 'KOSPI'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('enabled: false여도 refetch()는 결과를 반영하지만 폴링은 시작하지 않는다', async () => {
    const fetchMock = installFetch(okFetch());

    const { result } = renderHook(() => useQuote('005930', 'KOSPI', { enabled: false }));
    expect(result.current.quote).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      result.current.refetch();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.quote).toEqual(QUOTE);
    expect(result.current.stale).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // refetch() 한 번이 폴링을 시작시켰다면 안 된다 — 시간이 흘러도 재요청이 없어야 한다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000 * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('비활성 refetch() 진행 중 ticker가 바뀌면 응답이 와도 이전 종목 값을 반영하지 않는다', async () => {
    const d = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = installFetch(() => d.promise);

    const { result, rerender } = renderHook(
      ({ ticker }: { ticker: string }) => useQuote(ticker, 'KOSPI', { enabled: false }),
      { initialProps: { ticker: '005930' } },
    );

    act(() => {
      result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 응답이 오기 전에 다른 종목으로 바뀐다
    rerender({ ticker: '000660' });
    expect(result.current.quote).toBeNull(); // 000660엔 값이 없다

    d.resolve({ ok: true, json: async () => ({ source: 'kis', quote: QUOTE }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 005930의 응답이 뒤늦게 와도 지금 보고 있는 000660 값은 그대로 null이어야 한다
    expect(result.current.quote).toBeNull();
  });

  it('비활성 refetch() 진행 중 enabled가 true가 되면 응답이 와도 중복 반영하지 않는다', async () => {
    const d = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = installFetch(() => d.promise);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQuote('005930', 'KOSPI', { enabled }),
      { initialProps: { enabled: false } },
    );

    act(() => {
      result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 응답이 오기 전에 활성화된다 — 이제 구독이 값 갱신을 책임진다(같은 진행 중 요청을 공유해 받는다)
    rerender({ enabled: true });

    d.resolve({ ok: true, json: async () => ({ source: 'kis', quote: QUOTE2 }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 구독 쪽 경로로 정상 반영됐는지만 확인한다(refetch()의 then이 별도로 덮어쓰지 않아도 결과는 같다)
    expect(result.current.quote).toEqual(QUOTE2);
    expect(result.current.stale).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 진행 중 요청을 공유했으므로 재요청이 없다
  });
});
