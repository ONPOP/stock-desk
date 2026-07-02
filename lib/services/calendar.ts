// 캘린더 수집 (F2) — 거시 시드 + 워치리스트 종목의 실적(Finnhub)·LEAPS 옵션 만기(규칙)·배당(dividends)
// → calendar_events 공통 일정으로 소스 단위 교체. (D13: 옵션 만기·배당 추가)
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEventType } from '@/types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { regionOf } from '@/lib/utils/market-hours';
import { getFinnhubKey, getDartKey } from '@/lib/supabase/queries/settings';
import { listAllWatchlistItems } from '@/lib/supabase/queries/watchlist';
import { replaceEventsBySource } from '@/lib/supabase/queries/calendar';
import { getDividendsByStock } from '@/lib/supabase/queries/fundamentals';
import { FinnhubClient } from '@/lib/providers/finnhub/client';
import { getEarningsCalendar } from '@/lib/providers/finnhub/earnings';
import { DartClient } from '@/lib/providers/dart/client';
import { getDartDisclosures } from '@/lib/providers/dart/disclosure';
import { isIrOpenReport, fetchIrInfo } from '@/lib/providers/dart/ir-schedule';
import { MACRO_SEED_2026 } from '@/lib/data/macro-events';
import { upcomingLeapsExpiries } from '@/lib/utils/options-expiry';

export interface CalendarRefreshResult {
  macro: number;
  earnings: number;
  options: number;
  dividends: number;
  reason?: string;
}

interface SeedEvent {
  type: CalendarEventType;
  title: string;
  eventDate: string;
  stockId?: string | null;
  confirmed: boolean;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// DART filedAt은 KST 자정을 UTC로 변환한 값(전날 15:00Z) → KST 달력 날짜 복원
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 거시·실적·LEAPS 옵션 만기·배당 일정을 공통 일정으로 반영(소스 단위 교체). */
export async function refreshCalendar(userDb: SupabaseClient, userId: string): Promise<CalendarRefreshResult> {
  const admin = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const watchlist = await listAllWatchlistItems(userDb, userId);
  const usStocks = watchlist.filter((w) => regionOf(w.market) !== 'KR');
  const krStocks = watchlist.filter((w) => regionOf(w.market) === 'KR');
  const nameOf = (w: (typeof watchlist)[number]) => w.name_kr ?? w.name_en ?? w.ticker;

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
    const client = new FinnhubClient(finnhubKey);
    const earningsEvents: SeedEvent[] = [];
    const metaByTicker = new Map<string, { id: string; name: string }>();
    for (const w of usStocks) metaByTicker.set(w.ticker.toUpperCase(), { id: w.stock_id, name: nameOf(w) });
    for (const w of usStocks) {
      try {
        const evs = await getEarningsCalendar(client, w.ticker);
        for (const e of evs) {
          const meta = metaByTicker.get(e.symbol);
          if (!meta) continue;
          earningsEvents.push({ type: 'earnings', title: `${meta.name} 실적 발표`, eventDate: e.date, stockId: meta.id, confirmed: false });
        }
      } catch {
        /* 종목별 실패는 건너뜀 */
      }
    }
    earnings = await replaceEventsBySource(admin, 'finnhub-earnings', earningsEvents);
  }

  // 2-KR) 한국 종목 실적 일정 — DART.
  //   · 과거 접수분: 잠정실적·정기보고서 접수일(dart-earnings)
  //   · 미래 예정분: 기업설명회(IR)개최 공시 원문에서 개최 예정일 파싱(dart-ir), 실적 목적만
  const dartKey = await getDartKey(userDb, userId);
  if (dartKey && krStocks.length) {
    // corp_code는 stocks 테이블에만 있어 배치 조회
    const { data: corpRows } = await userDb
      .from('stocks')
      .select('id, corp_code')
      .in('id', krStocks.map((w) => w.stock_id));
    const corpById = new Map<string, string>();
    for (const r of (corpRows ?? []) as Array<{ id: string; corp_code: string | null }>) {
      if (r.corp_code) corpById.set(r.id, r.corp_code);
    }
    const client = new DartClient(dartKey);
    const since = addDays(today, -120);
    const krEvents: SeedEvent[] = [];
    const irEvents: SeedEvent[] = [];
    for (const w of krStocks) {
      const corpCode = corpById.get(w.stock_id);
      if (!corpCode) continue;
      try {
        const discs = await getDartDisclosures(client, corpCode, { since });
        for (const d of discs) {
          if (d.typeLabelKr === '잠정실적' || d.typeLabelKr === '정기보고서') {
            krEvents.push({
              type: 'earnings',
              title: `${nameOf(w)} ${d.typeLabelKr}`,
              eventDate: kstDate(d.filedAt),
              stockId: w.stock_id,
              confirmed: true,
            });
            continue;
          }
          // 미래 실적발표 예정일: IR 개최 공시 원문 파싱
          if (isIrOpenReport(d.formType)) {
            const rceptNo = /rcpNo=(\d+)/.exec(d.url)?.[1];
            if (!rceptNo) continue;
            try {
              const ir = await fetchIrInfo(client, rceptNo);
              if (ir.date && ir.date >= today && /실적/.test(ir.purpose)) {
                irEvents.push({
                  type: 'earnings',
                  title: `${nameOf(w)} 실적발표(IR)`,
                  eventDate: ir.date,
                  stockId: w.stock_id,
                  confirmed: true,
                });
              }
            } catch {
              /* 원문 파싱 실패는 건너뜀 */
            }
          }
        }
      } catch {
        /* 종목별 실패는 건너뜀 */
      }
    }
    earnings += await replaceEventsBySource(admin, 'dart-earnings', krEvents);
    earnings += await replaceEventsBySource(admin, 'dart-ir', irEvents);
  }

  // 3) 미국 종목 LEAPS(장기옵션) 만기일 — 규칙 계산(매년 1월 셋째 금, 향후 3개)
  const leapsEvents: SeedEvent[] = [];
  const leapsDates = upcomingLeapsExpiries(today, 3);
  for (const w of usStocks) {
    for (const d of leapsDates) {
      leapsEvents.push({ type: 'options', title: `${nameOf(w)} LEAPS 만기`, eventDate: d, stockId: w.stock_id, confirmed: true });
    }
  }
  const options = await replaceEventsBySource(admin, 'options-leaps', leapsEvents);

  // 4) 배당 일정(배당락·지급) — dividends 테이블에서 [today-90d, today+400d] 구간
  const divFrom = addDays(today, -90);
  const divTo = addDays(today, 400);
  const dividendEvents: SeedEvent[] = [];
  for (const w of watchlist) {
    try {
      const divs = await getDividendsByStock(userDb, w.stock_id, 12);
      for (const d of divs) {
        if (d.exDate && d.exDate >= divFrom && d.exDate <= divTo)
          dividendEvents.push({ type: 'dividend', title: `${nameOf(w)} 배당락`, eventDate: d.exDate, stockId: w.stock_id, confirmed: true });
        if (d.payDate && d.payDate >= divFrom && d.payDate <= divTo)
          dividendEvents.push({ type: 'dividend', title: `${nameOf(w)} 배당 지급`, eventDate: d.payDate, stockId: w.stock_id, confirmed: true });
      }
    } catch {
      /* 종목별 실패는 건너뜀 */
    }
  }
  const dividends = await replaceEventsBySource(admin, 'dividend', dividendEvents);

  return { macro, earnings, options, dividends };
}
