// FMP 배당 (F15) — stable API `/stable/dividends?symbol=`. 배당 이벤트별 DPS·배당락일·지급일·수익률.
// (legacy v3 historical-price-full/stock_dividend는 신규 키 403 → stable로 이전, D9)
import type { DividendFrequency, DividendInfo } from '@/types';
import type { FmpClient } from '@/lib/providers/fmp/client';

interface FmpDividendEvent {
  date?: string; // 배당락일 YYYY-MM-DD
  dividend?: number;
  adjDividend?: number;
  paymentDate?: string;
  yield?: number;
  frequency?: string; // "Quarterly" | "Annual" | "Semi-Annual" | "Monthly"
}

const isoDate = (s: string | undefined): string | null =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

const FREQ_MAP: Record<string, DividendFrequency> = {
  quarterly: 'quarterly',
  annual: 'annual',
  'semi-annual': 'semiannual',
  semiannual: 'semiannual',
  monthly: 'monthly',
};

function mapFrequency(raw: string | undefined): DividendFrequency | null {
  if (!raw) return null;
  return FREQ_MAP[raw.toLowerCase().replace(/\s/g, '')] ?? FREQ_MAP[raw.toLowerCase()] ?? null;
}

/** 응답에 frequency가 없을 때 최근 1년 건수로 주기 추정 */
export function inferFrequency(exDatesDesc: string[]): DividendFrequency | null {
  if (exDatesDesc.length === 0) return null;
  if (exDatesDesc.length === 1) return 'annual';
  const latest = new Date(`${exDatesDesc[0]}T00:00:00Z`).getTime();
  const oneYearAgo = latest - 365 * 24 * 3600 * 1000;
  const inLastYear = exDatesDesc.filter((d) => new Date(`${d}T00:00:00Z`).getTime() > oneYearAgo).length;
  if (inLastYear >= 10) return 'monthly';
  if (inLastYear >= 4) return 'quarterly';
  if (inLastYear >= 2) return 'semiannual';
  return 'annual';
}

/** 순수 변환: stable dividends 배열 → DividendInfo[] (최신순). 최근 limit개. */
export function buildFmpDividends(events: FmpDividendEvent[], limit = 16): DividendInfo[] {
  const valid = (events ?? []).filter((e) => isoDate(e.date) && typeof e.dividend === 'number');
  valid.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const exDatesDesc = valid.map((e) => e.date as string);
  const fallbackFreq = inferFrequency(exDatesDesc);
  return valid.slice(0, limit).map((e) => ({
    fiscalYear: Number((e.date as string).slice(0, 4)),
    dps: typeof e.dividend === 'number' ? e.dividend : null,
    frequency: mapFrequency(e.frequency) ?? fallbackFreq,
    exDate: isoDate(e.date),
    payDate: isoDate(e.paymentDate),
    yieldAtRecord: typeof e.yield === 'number' ? e.yield : null,
    source: 'fmp' as const,
  }));
}

export async function getFmpDividends(client: FmpClient, ticker: string): Promise<DividendInfo[]> {
  const events = await client.getJson<FmpDividendEvent[]>('dividends', { symbol: ticker.toUpperCase() });
  return buildFmpDividends(Array.isArray(events) ? events : []);
}
