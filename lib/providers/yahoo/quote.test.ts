import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCandles, getQuote } from './quote';
import { ExternalApiError } from '@/lib/errors';

// fetch 모킹 — Yahoo chart 응답을 Response 형태로 흉내낸다.
function mockFetch(body: unknown, opts: { ok?: boolean; status?: number; raw?: string } = {}) {
  const { ok = true, status = 200, raw } = opts;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      text: async () => (raw !== undefined ? raw : JSON.stringify(body)),
    })),
  );
}

const AAPL_CHART = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          regularMarketPrice: 195.5,
          chartPreviousClose: 194.0,
          regularMarketTime: 1700000000,
          regularMarketVolume: 1_000_000,
        },
        timestamp: [1699900000, 1699986400, 1700072800],
        indicators: {
          quote: [
            {
              open: [100.0, null, 120.0],
              high: [110.0, 200.0, 130.0],
              low: [90.0, 180.0, 110.0],
              close: [105.0, 190.0, 125.0],
              volume: [1000, 2000, 3000],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getQuote — 정상', () => {
  it('미국 종목: 가격을 센트 정수로, 등락률을 decimal로 계산한다', async () => {
    mockFetch(AAPL_CHART);
    const q = await getQuote('AAPL', 'NASDAQ');
    expect(q.price).toBe(19550); // 195.5 USD → 19550센트
    expect(q.change).toBe(150); // 19550 - 19400
    expect(q.changeRate).toBe('0.77'); // 150/19400*100 = 0.773… → 0.77
    expect(q.currency).toBe('USD');
    expect(q.volume).toBe(1_000_000);
    expect(q.asOf).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('국내 종목: 원 단위 정수로 변환하고 KS 심볼로 조회한다', async () => {
    const krChart = structuredClone(AAPL_CHART);
    krChart.chart.result[0].meta = {
      currency: 'KRW',
      symbol: '005930.KS',
      regularMarketPrice: 70000,
      chartPreviousClose: 69000,
      regularMarketTime: 1700000000,
      regularMarketVolume: 12_345,
    };
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(krChart) }));
    vi.stubGlobal('fetch', fetchMock);

    const q = await getQuote('005930', 'KOSPI');
    expect(q.price).toBe(70000);
    expect(q.change).toBe(1000);
    expect(q.currency).toBe('KRW');
    // 호출 URL에 .KS 심볼이 인코딩되어 들어갔는지 확인
    const calledUrl = (fetchMock.mock.calls[0] as unknown[])[0];
    expect(String(calledUrl)).toContain('005930.KS');
  });

  it('첫 미러가 429면 두 번째 미러로 폴백해 성공한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(AAPL_CHART) });
    vi.stubGlobal('fetch', fetchMock);

    const q = await getQuote('AAPL', 'NASDAQ');
    expect(q.price).toBe(19550);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 두 번째 호출은 query2 미러여야 한다
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toContain('query2.finance.yahoo.com');
  });
});

describe('getQuote — 비정상', () => {
  it('chart.error가 있으면 ExternalApiError', async () => {
    mockFetch({ chart: { result: null, error: { description: 'No data found' } } });
    await expect(getQuote('NOPE', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('result가 비면 ExternalApiError', async () => {
    mockFetch({ chart: { result: [], error: null } });
    await expect(getQuote('AAPL', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('regularMarketPrice가 없으면 ExternalApiError', async () => {
    mockFetch({ chart: { result: [{ meta: { currency: 'USD' } }], error: null } });
    await expect(getQuote('AAPL', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('비JSON 응답이면 ExternalApiError', async () => {
    mockFetch(null, { raw: '<html>rate limited</html>' });
    await expect(getQuote('AAPL', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('404는 폴백 없이 즉시 ExternalApiError', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getQuote('NOPE', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 4xx는 미러 폴백하지 않음
  });

  it('두 미러 모두 429면 재시도 소진 후 ExternalApiError', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getQuote('AAPL', 'NASDAQ')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // query1 → query2 폴백
  });

  it('전일종가가 0이면 등락률은 0.00 (0 나눗셈 방지)', async () => {
    mockFetch({
      chart: {
        result: [{ meta: { currency: 'USD', regularMarketPrice: 10, chartPreviousClose: 0 } }],
        error: null,
      },
    });
    const q = await getQuote('AAPL', 'NASDAQ');
    expect(q.changeRate).toBe('0.00');
  });
});

describe('getCandles', () => {
  it('결측(null) 캔들을 제외하고 OHLC를 정수로 변환한다', async () => {
    mockFetch(AAPL_CHART);
    const candles = await getCandles('AAPL', 'NASDAQ', '1d', 10);
    // 두 번째 캔들은 open=null이라 제외 → 2개
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ o: 10000, h: 11000, l: 9000, c: 10500, volume: 1000 });
    expect(candles[1]).toMatchObject({ o: 12000, c: 12500 });
  });

  it('count로 최신 캔들만 잘라낸다', async () => {
    mockFetch(AAPL_CHART);
    const candles = await getCandles('AAPL', 'NASDAQ', '1d', 1);
    expect(candles).toHaveLength(1);
    expect(candles[0].c).toBe(12500); // 가장 최신
  });

  it('quote 지표가 없으면 빈 배열', async () => {
    mockFetch({ chart: { result: [{ timestamp: [1, 2], indicators: {} }], error: null } });
    const candles = await getCandles('AAPL', 'NASDAQ', '1d', 10);
    expect(candles).toEqual([]);
  });
});
