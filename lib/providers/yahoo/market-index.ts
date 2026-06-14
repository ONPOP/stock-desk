// 시장 지수/환율/금리 조회 (F11) — Yahoo ^심볼. 지수·환율·금리는 금액이 아니라 표시값 그대로 쓴다.
// 30초 인메모리 캐시 + stale fallback으로 Yahoo 레이트리밋을 완화한다.
import 'server-only';
import Decimal from 'decimal.js';
import { fetchYahooJson } from './client';
import type { MarketIndex } from '@/types';

const INDICES = [
  { key: 'kospi', label: 'KOSPI', symbol: '^KS11', unit: '' as const },
  { key: 'kosdaq', label: 'KOSDAQ', symbol: '^KQ11', unit: '' as const },
  { key: 'sp500', label: 'S&P 500', symbol: '^GSPC', unit: '' as const },
  { key: 'nasdaq', label: 'NASDAQ', symbol: '^IXIC', unit: '' as const },
  { key: 'usdkrw', label: '원/달러', symbol: 'KRW=X', unit: '원' as const },
  { key: 'ust10y', label: '미국채 10Y', symbol: '^TNX', unit: '%' as const },
  { key: 'vix', label: 'VIX', symbol: '^VIX', unit: '' as const },
];

interface ChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}
interface ChartResponse {
  chart?: { result?: Array<{ meta?: ChartMeta }> | null };
}

const CACHE_TTL_MS = 30_000;
const STALE_MAX_MS = 10 * 60_000;
let cache: { data: MarketIndex[]; at: number } | null = null;

async function fetchOne(idx: (typeof INDICES)[number]): Promise<MarketIndex | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(idx.symbol)}?interval=1d&range=1d`;
  const data = await fetchYahooJson<ChartResponse>(path);
  const meta = data.chart?.result?.[0]?.meta;
  if (meta?.regularMarketPrice === undefined) return null;
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = new Decimal(price).minus(prev);
  const rate = prev ? change.div(prev).mul(100).toFixed(2) : '0.00';
  return {
    key: idx.key,
    label: idx.label,
    value: price,
    change: change.toNumber(),
    changeRate: rate,
    unit: idx.unit,
  };
}

export async function getMarketIndices(): Promise<MarketIndex[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;

  const settled = await Promise.allSettled(INDICES.map(fetchOne));
  const data = settled
    .filter((r): r is PromiseFulfilledResult<MarketIndex | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((x): x is MarketIndex => x !== null);

  // 전부 실패(레이트리밋 등)면 너무 오래되지 않은 캐시로 버틴다
  if (data.length === 0) {
    if (cache && now - cache.at < STALE_MAX_MS) return cache.data;
    return [];
  }
  cache = { data, at: now };
  return data;
}
