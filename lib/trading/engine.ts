// 자동매매 엔진 (D15) — 1 tick: 유니버스 순회 → 캔들 조회 → 전략 → 리스크 → 모의투자 주문 → 시그널 기록.
// 클라이언트(실시간 탭)가 장중 주기적으로 트리거한다 (checkLimitOrders와 동일 패턴 — 데스크톱 standalone).
// ponytail: 탭이 열려 있는 동안만 동작. 상시 구동이 필요해지면 별도 워커/크론으로 승격.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMarketOpen } from '@/lib/utils/market-hours';
import { dateInTz, KST_TZ } from '@/lib/utils/date';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { evaluateStrategy } from '@/lib/trading/strategy';
import { checkRisk } from '@/lib/trading/risk';
import { placeOrder } from '@/lib/services/paper';
import { ensureSeason, getAccount } from '@/lib/supabase/queries/paper';
import { getStock } from '@/lib/supabase/queries/stocks';
import {
  getTradingConfig,
  insertSignal,
  listSignalsSince,
  listKrwPositions,
} from '@/lib/supabase/queries/trading';
import type { TradeSignalRow } from '@/types';

export interface TickResult {
  ran: boolean;
  skipped?: string;
  evaluated: number;
  signals: number;
  errors: string[];
}

/** 전략이 볼 분봉 수 — 워밍업(MACD 26+9)+판정 여유 */
const CANDLE_COUNT = 90;

/** KST 자정(오늘 시작)의 UTC ISO */
function kstDayStartIso(now: Date): string {
  return new Date(`${dateInTz(now, KST_TZ)}T00:00:00+09:00`).toISOString();
}

export async function runTick(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { ran: false, evaluated: 0, signals: 0, errors: [] };

  const config = await getTradingConfig(db, userId);
  if (config.killSwitch) return { ...result, skipped: 'kill switch 작동 중' };
  if (!config.enabled) return { ...result, skipped: '자동매매 비활성' };
  if (config.universe.length === 0) return { ...result, skipped: '감시 종목 없음' };
  if (!isMarketOpen('KR', now)) return { ...result, skipped: '국내 장 마감' };

  const p = config.params;
  const season = await ensureSeason(db, userId);
  const account = await getAccount(db, season.id, 'KRW');
  if (!account) return { ...result, skipped: 'KRW 계좌 없음' };

  const { data: seasonRow } = await db
    .from('paper_seasons')
    .select('seed_krw')
    .eq('id', season.id)
    .maybeSingle<{ seed_krw: number | string }>();
  const seedKrw = Number(seasonRow?.seed_krw ?? 0) || 10_000_000;

  const [positions, todaySignals] = await Promise.all([
    listKrwPositions(db, account.id),
    listSignalsSince(db, userId, kstDayStartIso(now)),
  ]);
  const source = await resolveQuoteSource(db, userId);

  // 일간 상태 — 오늘 시그널 로그에서 산출 (별도 상태 테이블 없이 로그가 단일 원천)
  const executedToday = todaySignals.filter((s) => s.executed);
  const dailyPnl = executedToday.reduce((a, s) => a + (s.pnl ?? 0), 0);
  const dayStateOf = (ticker: string) => {
    const own = executedToday.filter((s) => s.ticker === ticker);
    const stops = own.filter((s) => s.action === 'sell' && s.reason.startsWith('손절'));
    return {
      entriesToday: own.filter((s) => s.action === 'buy').length,
      lastStopLossAt: stops.length > 0 ? stops[stops.length - 1].decidedAt : null,
    };
  };

  // tick 내 복수 주문이 한도를 공유하도록 로컬로 추적
  let cash = account.cashBalance;
  let positionsCount = positions.length;
  result.ran = true;

  for (const item of config.universe) {
    try {
      const candles = await source.getCandles(item.ticker, item.market, '1m', CANDLE_COUNT);
      result.evaluated++;

      const held = positions.find((pos) => pos.ticker === item.ticker) ?? null;
      const decision = evaluateStrategy({
        candles,
        position: held ? { qty: held.qty, avgPrice: held.avgPrice } : null,
        day: dayStateOf(item.ticker),
        params: p,
        now,
      });
      if (decision.action === 'hold') continue;

      const lastClose = candles[candles.length - 1]?.c ?? 0;
      const qty =
        decision.action === 'buy'
          ? Math.floor(Math.min(cash, Math.floor((seedKrw * p.orderPct) / 100)) / Math.max(lastClose, 1))
          : (held?.qty ?? 0);

      const verdict = checkRisk({
        enabled: config.enabled,
        killSwitch: config.killSwitch,
        side: decision.action,
        orderCost: qty * lastClose,
        cashBalance: cash,
        seedKrw,
        positionsCount,
        alreadyHolding: held != null,
        dailyRealizedPnl: dailyPnl,
        params: p,
      });

      const base = {
        ticker: item.ticker,
        market: item.market,
        action: decision.action,
        reason: decision.reason,
        indicators: decision.indicators,
        decidedAt: now.toISOString(),
      } as const;

      if (!verdict.allowed) {
        await insertSignal(db, userId, { ...base, executed: false, rejectReason: verdict.reason });
        result.signals++;
        continue;
      }

      const stock = await getStock(db, item.ticker, item.market);
      if (!stock || stock.is_active === false) {
        await insertSignal(db, userId, { ...base, executed: false, rejectReason: '종목 마스터 없음 또는 거래정지' });
        result.signals++;
        continue;
      }

      const order = await placeOrder(db, userId, stock, {
        side: decision.action,
        qty,
        orderType: 'market',
        memo: `[AUTO] ${decision.reason}`,
      }, now);

      if (order.status === 'executed' && order.price != null) {
        const pnl = decision.action === 'sell' && held ? (order.price - held.avgPrice) * qty : null;
        await insertSignal(db, userId, { ...base, executed: true, price: order.price, qty, pnl });
        if (decision.action === 'buy') {
          cash -= qty * order.price;
          positionsCount++;
        } else {
          cash += qty * order.price;
          positionsCount--;
        }
      } else {
        await insertSignal(db, userId, {
          ...base,
          executed: false,
          rejectReason: order.reason ?? `주문 미체결 (${order.status})`,
        });
      }
      result.signals++;
    } catch (e) {
      // 개별 종목 실패(시세 등)는 건너뛰고 다음 tick에 재시도
      result.errors.push(`${item.ticker}: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  }
  return result;
}

/** 일간 요약 — UI 상단 배지용 */
export function summarizeToday(signals: TradeSignalRow[]): { dailyPnl: number; executed: number; rejected: number } {
  const executed = signals.filter((s) => s.executed);
  return {
    dailyPnl: executed.reduce((a, s) => a + (s.pnl ?? 0), 0),
    executed: executed.length,
    rejected: signals.length - executed.length,
  };
}
