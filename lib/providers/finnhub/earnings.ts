// Finnhub 실적 캘린더 (F2, 미국) — /calendar/earnings?symbol=&from=&to=. 미래 실적 발표일.
import type { FinnhubClient } from '@/lib/providers/finnhub/client';

interface EarningsItem {
  date?: string; // YYYY-MM-DD
  symbol?: string;
  hour?: string; // bmo/amc/dmh
}
interface EarningsResponse {
  earningsCalendar?: EarningsItem[];
}

export interface EarningsEvent {
  date: string;
  symbol: string;
}

/** 순수 변환: earningsCalendar → 유효 일자 이벤트 */
export function buildEarningsEvents(resp: EarningsResponse): EarningsEvent[] {
  return (resp.earningsCalendar ?? [])
    .filter((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.symbol)
    .map((e) => ({ date: e.date as string, symbol: (e.symbol as string).toUpperCase() }));
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export async function getEarningsCalendar(client: FinnhubClient, ticker: string): Promise<EarningsEvent[]> {
  const from = new Date();
  const to = new Date(from.getTime() + 120 * 24 * 3600 * 1000); // 향후 120일
  const resp = await client.getJson<EarningsResponse>('calendar/earnings', {
    symbol: ticker.toUpperCase(),
    from: dateOnly(from),
    to: dateOnly(to),
  });
  return buildEarningsEvents(resp);
}
