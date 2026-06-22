// 시장 지수/환율/금리 조회 (F11) — Yahoo ^심볼. 지수·환율·금리는 금액이 아니라 표시값 그대로 쓴다.
// 30초 인메모리 캐시 + stale fallback으로 Yahoo 레이트리밋을 완화한다.
import 'server-only';
import Decimal from 'decimal.js';
import { fetchYahooJson } from './client';
import { fetchUsdKrwFallback } from '@/lib/providers/forex/usd-krw';
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
// 항목별 마지막 성공값 — 일부 심볼이 레이트리밋으로 빠져도 직전값으로 보충해 환율 등 핵심값이 사라지지 않게 한다.
const itemCache = new Map<string, { item: MarketIndex; at: number }>();
let lastFetchAt = 0;
let lastResult: MarketIndex[] = [];

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
  if (now - lastFetchAt < CACHE_TTL_MS) return lastResult;

  const settled = await Promise.allSettled(INDICES.map(fetchOne));
  const fresh = settled
    .filter((r): r is PromiseFulfilledResult<MarketIndex | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((x): x is MarketIndex => x !== null);

  // 이번에 성공한 항목만 캐시 갱신(타임스탬프 포함). 빠진 항목은 직전 성공값을 유지한다.
  for (const d of fresh) itemCache.set(d.key, { item: d, at: now });

  // 환율은 통화 환산의 핵심값 — Yahoo가 못 줬고 신선 캐시도 없으면 무료 폴백 소스로 보강한다.
  const cachedFx = itemCache.get('usdkrw');
  if (!cachedFx || now - cachedFx.at >= CACHE_TTL_MS) {
    const fb = await fetchUsdKrwFallback();
    if (fb) {
      const meta = INDICES.find((i) => i.key === 'usdkrw');
      if (meta) {
        itemCache.set('usdkrw', {
          item: { key: 'usdkrw', label: meta.label, value: fb, change: 0, changeRate: '0.00', unit: meta.unit },
          at: now,
        });
      }
    }
  }

  // 신선값 + STALE_MAX_MS 이내 직전값으로 보충(부분 실패 방어). 너무 오래된 항목은 제외해 부정확값을 막는다.
  const data = INDICES.map((i) => itemCache.get(i.key))
    .filter((c): c is { item: MarketIndex; at: number } => c !== undefined && now - c.at < STALE_MAX_MS)
    .map((c) => c.item);

  lastFetchAt = now;
  lastResult = data;
  return data;
}
