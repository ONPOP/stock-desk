// Yahoo Finance 현재가·캔들 조회. chart 엔드포인트는 인증 없이 동작해 폴백 소스로 안정적이다.
// (v7/quote는 2024년부터 crumb 인증이 필요해져 chart 엔드포인트로 현재가도 구한다)
import Decimal from 'decimal.js';
import { ExternalApiError } from '@/lib/errors';
import { parseToMinorUnits } from '@/lib/utils/money';
import type { Candle, CandleInterval, Market, Quote } from '@/types';
import { fetchYahooJson } from './client';
import { currencyOf, toYahooSymbol } from './symbol';

const CHART_PATH = '/v8/finance/chart';

interface ChartMeta {
  currency?: string;
  symbol?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number;
  regularMarketVolume?: number;
}

interface ChartResult {
  meta?: ChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }>;
  };
}

interface ChartResponse {
  chart?: { result?: ChartResult[] | null; error?: { description?: string } | null };
}

// CandleInterval → Yahoo interval/range. 넉넉히 받은 뒤 최신 count개로 잘라낸다.
function intervalToYahoo(interval: CandleInterval, count: number): { interval: string; range: string } {
  switch (interval) {
    case '1m':
      return { interval: '1m', range: count > 390 ? '5d' : '1d' };
    case '1w':
      if (count <= 8) return { interval: '1wk', range: '3mo' };
      if (count <= 26) return { interval: '1wk', range: '6mo' };
      if (count <= 52) return { interval: '1wk', range: '1y' };
      if (count <= 104) return { interval: '1wk', range: '2y' };
      if (count <= 260) return { interval: '1wk', range: '5y' };
      return { interval: '1wk', range: 'max' };
    case '1d':
    default:
      if (count <= 5) return { interval: '1d', range: '5d' };
      if (count <= 22) return { interval: '1d', range: '1mo' };
      if (count <= 66) return { interval: '1d', range: '3mo' };
      if (count <= 132) return { interval: '1d', range: '6mo' };
      if (count <= 252) return { interval: '1d', range: '1y' };
      if (count <= 504) return { interval: '1d', range: '2y' };
      if (count <= 1260) return { interval: '1d', range: '5y' };
      return { interval: '1d', range: 'max' };
  }
}

function extractResult(data: ChartResponse, context: string): ChartResult {
  const err = data.chart?.error;
  if (err) {
    throw new ExternalApiError('yahoo', '해당 종목 시세를 찾을 수 없습니다.', `${context}: ${err.description ?? 'chart error'}`);
  }
  const result = data.chart?.result?.[0];
  if (!result) {
    throw new ExternalApiError('yahoo', 'Yahoo Finance 시세 응답이 비어 있습니다.', `${context}: empty result`);
  }
  return result;
}

// 등락률은 (현재가-전일종가)/전일종가*100을 decimal.js로 계산해 문자열로 보존한다.
function changeRate(priceMinor: number, prevMinor: number): string {
  if (prevMinor === 0) return '0.00';
  return new Decimal(priceMinor).minus(prevMinor).div(prevMinor).mul(100).toFixed(2);
}

export async function getQuote(ticker: string, market: Market): Promise<Quote> {
  const currency = currencyOf(market);
  const symbol = toYahooSymbol(ticker, market);
  const path = `${CHART_PATH}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const data = await fetchYahooJson<ChartResponse>(path);
  const meta = extractResult(data, `quote ${symbol}`).meta;

  if (meta?.regularMarketPrice === undefined) {
    throw new ExternalApiError('yahoo', 'Yahoo Finance 시세에 현재가가 없습니다.', `quote ${symbol}: missing regularMarketPrice`);
  }
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
  const priceMinor = parseToMinorUnits(meta.regularMarketPrice, currency);
  const prevMinor = parseToMinorUnits(prevClose, currency);

  return {
    ticker,
    market,
    currency,
    price: priceMinor,
    change: priceMinor - prevMinor,
    changeRate: changeRate(priceMinor, prevMinor),
    volume: Number(meta.regularMarketVolume ?? 0),
    asOf: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export async function getCandles(
  ticker: string,
  market: Market,
  interval: CandleInterval,
  count: number,
): Promise<Candle[]> {
  const currency = currencyOf(market);
  const symbol = toYahooSymbol(ticker, market);
  const { interval: yInterval, range } = intervalToYahoo(interval, count);
  const path = `${CHART_PATH}/${encodeURIComponent(symbol)}?interval=${yInterval}&range=${range}`;
  const data = await fetchYahooJson<ChartResponse>(path);
  const result = extractResult(data, `candles ${symbol}`);

  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  if (!q) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    // 휴장·결측 구간은 null로 오므로 건너뛴다 (불완전 캔들 배제)
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      ts: new Date(ts[i] * 1000).toISOString(),
      o: parseToMinorUnits(o, currency),
      h: parseToMinorUnits(h, currency),
      l: parseToMinorUnits(l, currency),
      c: parseToMinorUnits(c, currency),
      volume: Number(q.volume?.[i] ?? 0),
    });
  }
  // 최신 count개만 반환 (Yahoo는 오래된→최신 순서로 준다)
  return candles.slice(-count);
}
