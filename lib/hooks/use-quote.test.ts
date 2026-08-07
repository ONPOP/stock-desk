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
});
