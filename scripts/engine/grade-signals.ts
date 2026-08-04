// 신호 채점 (D16 Phase 3) — 전일 신호에 익일 시가·고저·갭률을 기록한다. Claude 미사용(순수 계산).
//
//   npx tsx scripts/engine/grade-signals.ts [--market KR|US|BOTH] [--date 2026-08-04]
import '../_bootstrap';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Candle, Market } from '../../types';
import { dateInTz, KST_TZ } from '../../lib/utils/date';
import { gradeOutcome } from '../../lib/engine/grading';
import { resolveEngineQuoteSource } from '../../lib/engine/quote-source';
import { adminClient, resolveUserId } from './run-context';

/** 신호일 이후 캔들을 찾기 위해 넉넉히 조회 (연휴 대응) */
const LOOKBACK_CANDLES = 15;

interface PendingRow {
  id: string;
  stock_id: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
  signal_date: string;
  close_price: number | null;
  stocks: { ticker: string; market: Market } | null;
}

function isKr(market: Market): boolean {
  return market === 'KOSPI' || market === 'KOSDAQ';
}

/** 신호일 '이후' 첫 거래일 캔들 — 연휴·휴장으로 익영업일이 밀려도 정확히 잡는다 */
function firstCandleAfter(candles: Candle[], signalDate: string, market: Market): Candle | null {
  const tz = isKr(market) ? KST_TZ : 'America/New_York';
  for (const c of candles) {
    if (dateInTz(c.ts, tz) > signalDate) return c;
  }
  return null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const marketIdx = argv.indexOf('--market');
  const marketFilter = (marketIdx >= 0 ? argv[marketIdx + 1] : 'BOTH') as 'KR' | 'US' | 'BOTH';
  const dateIdx = argv.indexOf('--date');
  const today = dateIdx >= 0 ? argv[dateIdx + 1] : dateInTz(new Date(), KST_TZ);

  const db: SupabaseClient = adminClient();
  const userId = await resolveUserId(db);

  const { data, error } = await db
    .from('slot_signals')
    .select('id, stock_id, signal, signal_date, close_price, stocks!inner(ticker, market)')
    .eq('user_id', userId)
    .is('graded_at', null)
    .lt('signal_date', today)
    .order('signal_date', { ascending: true })
    .limit(500);
  if (error) throw new Error(`미채점 신호 조회 실패: ${error.message}`);

  const rows = ((data ?? []) as unknown as PendingRow[]).filter((r) => {
    if (!r.stocks || r.close_price === null) return false;
    if (marketFilter === 'KR') return isKr(r.stocks.market);
    if (marketFilter === 'US') return !isKr(r.stocks.market);
    return true;
  });

  if (rows.length === 0) {
    console.log('채점할 신호가 없습니다.');
    return;
  }

  const source = await resolveEngineQuoteSource(db, userId);
  console.log(`시세 소스 ${source.name} · 미채점 ${rows.length}건`);

  // 같은 종목의 캔들을 반복 조회하지 않도록 캐시 (신호 수만큼 API를 때리면 레이트리밋에 걸린다)
  const candleCache = new Map<string, Candle[]>();
  let graded = 0;
  let skipped = 0;

  for (const row of rows) {
    const stock = row.stocks!;
    try {
      let candles = candleCache.get(row.stock_id);
      if (!candles) {
        candles = await source.getCandles(stock.ticker, stock.market, '1d', LOOKBACK_CANDLES);
        candleCache.set(row.stock_id, candles);
      }

      const next = firstCandleAfter(candles, row.signal_date, stock.market);
      if (!next) {
        // 아직 다음 거래일이 열리지 않았다 — 다음 실행에서 다시 시도
        skipped++;
        continue;
      }

      const { gapBp: gap, outcome } = gradeOutcome({
        signal: row.signal,
        closePrice: row.close_price!,
        nextOpen: next.o,
      });

      const { error: upErr } = await db
        .from('slot_signals')
        .update({
          next_open: next.o,
          next_high: next.h,
          next_low: next.l,
          gap_bp: gap,
          outcome,
          graded_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
      graded++;
    } catch (err) {
      // 한 종목의 실패가 전체 채점을 막지 않게 한다
      console.warn(`⚠ ${stock.ticker} 채점 실패: ${err instanceof Error ? err.message : String(err)}`);
      skipped++;
    }
  }

  console.log(`✅ 채점 ${graded}건 · 보류 ${skipped}건`);
}

main();
