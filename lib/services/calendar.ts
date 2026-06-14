// 캘린더 수집 (F2) — 거시 시드 + 워치리스트 종목 실적일(Finnhub) → calendar_events 공통 일정 교체.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEventType } from '@/types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { regionOf } from '@/lib/utils/market-hours';
import { getFinnhubKey } from '@/lib/supabase/queries/settings';
import { listWatchlist } from '@/lib/supabase/queries/watchlist';
import { replaceEventsBySource } from '@/lib/supabase/queries/calendar';
import { FinnhubClient } from '@/lib/providers/finnhub/client';
import { getEarningsCalendar } from '@/lib/providers/finnhub/earnings';
import { MACRO_SEED_2026 } from '@/lib/data/macro-events';

export interface CalendarRefreshResult {
  macro: number;
  earnings: number;
  reason?: string;
}

interface SeedEvent {
  type: CalendarEventType;
  title: string;
  eventDate: string;
  stockId?: string | null;
  confirmed: boolean;
}

/** 거시 시드 + 미국 워치리스트 종목 실적일을 공통 일정으로 반영(소스 단위 교체). */
export async function refreshCalendar(userDb: SupabaseClient, userId: string): Promise<CalendarRefreshResult> {
  const admin = createAdminSupabase();

  // 1) 거시 시드 (정확 날짜 미확정 → confirmed=false "예정")
  const macroEvents: SeedEvent[] = MACRO_SEED_2026.map((m) => ({
    type: 'macro',
    title: m.title,
    eventDate: m.eventDate,
    confirmed: false,
  }));
  const macro = await replaceEventsBySource(admin, 'seed-macro', macroEvents);

  // 2) 미국 종목 실적일 (Finnhub)
  let earnings = 0;
  const finnhubKey = await getFinnhubKey(userDb, userId);
  if (finnhubKey) {
    const watchlist = await listWatchlist(userDb, userId);
    const usStocks = watchlist.filter((w) => regionOf(w.market) !== 'KR');
    const client = new FinnhubClient(finnhubKey);
    const earningsEvents: SeedEvent[] = [];
    const stockIdByTicker = new Map<string, { id: string; name: string }>();
    for (const w of usStocks) stockIdByTicker.set(w.ticker.toUpperCase(), { id: w.stock_id, name: w.name_kr ?? w.name_en ?? w.ticker });
    for (const w of usStocks) {
      try {
        const evs = await getEarningsCalendar(client, w.ticker);
        for (const e of evs) {
          const meta = stockIdByTicker.get(e.symbol);
          if (!meta) continue;
          earningsEvents.push({ type: 'earnings', title: `${meta.name} 실적 발표`, eventDate: e.date, stockId: meta.id, confirmed: false });
        }
      } catch {
        /* 종목별 실패는 건너뜀 */
      }
    }
    earnings = await replaceEventsBySource(admin, 'finnhub-earnings', earningsEvents);
  }

  return { macro, earnings };
}
