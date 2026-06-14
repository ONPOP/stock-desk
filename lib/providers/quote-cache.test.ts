import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearQuoteCache, getCachedQuote } from './quote-cache';
import type { QuoteSource } from './quote-source';
import type { Quote } from '@/types';

const QUOTE: Quote = {
  ticker: 'AAPL',
  market: 'NASDAQ',
  price: 19550,
  change: 150,
  changeRate: '0.77',
  currency: 'USD',
  volume: 1_000_000,
  asOf: '2026-01-01T00:00:00.000Z',
};

function makeSource(getQuote: QuoteSource['getQuote']): QuoteSource {
  return {
    name: 'yahoo',
    getQuote,
    getCandles: vi.fn(),
  };
}

afterEach(() => {
  clearQuoteCache();
  vi.useRealTimers();
});

describe('getCachedQuote', () => {
  it('같은 소스·종목의 동시 요청을 하나의 외부 호출로 병합한다', async () => {
    const getQuote = vi.fn(async () => QUOTE);
    const source = makeSource(getQuote);

    const [a, b] = await Promise.all([
      getCachedQuote(source, 'AAPL', 'NASDAQ'),
      getCachedQuote(source, 'AAPL', 'NASDAQ'),
    ]);

    expect(a).toBe(QUOTE);
    expect(b).toBe(QUOTE);
    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it('fresh TTL 이후 외부 소스 장애가 나면 최근 성공 quote를 stale로 반환한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const getQuote = vi.fn(async () => QUOTE);
    const source = makeSource(getQuote);

    await expect(getCachedQuote(source, 'AAPL', 'NASDAQ')).resolves.toBe(QUOTE);

    vi.setSystemTime(new Date('2026-01-01T00:00:07.000Z'));
    getQuote.mockRejectedValueOnce(new Error('temporary outage'));

    await expect(getCachedQuote(source, 'AAPL', 'NASDAQ')).resolves.toBe(QUOTE);
    expect(getQuote).toHaveBeenCalledTimes(2);
  });
});
