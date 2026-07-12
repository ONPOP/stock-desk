// 백테스트 러너 (D15) — 실매매와 동일한 evaluateStrategy·checkRisk를 캔들 재생으로 실행. 순수 함수.
// 체결가 = 시그널 봉 종가 (슬리피지·수수료 미반영 — 보수적 해석 필요).
// 1분봉 기준 설계. 일봉 입력도 동작하나 VWAP이 봉 단위로 리셋되어 참고용으로만.
import { evaluateStrategy, type PositionState, type TickerDayState } from '@/lib/trading/strategy';
import { checkRisk } from '@/lib/trading/risk';
import { dateInTz, KST_TZ } from '@/lib/utils/date';
import type { BacktestResult, BacktestTrade, Candle, StrategyParams } from '@/types';

export function runBacktest(candles: Candle[], params: StrategyParams, seedCash: number): BacktestResult {
  const trades: BacktestTrade[] = [];
  let cash = seedCash;
  let position: (PositionState & { entryTs: string }) | null = null;

  // 일 단위 상태 (재진입 제한·일간 손실 한도) — KST 날짜 키
  let dayKey = '';
  let day: TickerDayState = { entriesToday: 0, lastStopLossAt: null };
  let dayPnl = 0;

  let peak = seedCash;
  let maxDrawdown = 0;

  const warmup = Math.max(params.macdSlow + params.macdSignal, params.volAvgBars, params.rsiPeriod + 1) + 1;

  for (let i = warmup; i < candles.length; i++) {
    const bar = candles[i];
    const k = dateInTz(bar.ts, KST_TZ);
    if (k !== dayKey) {
      dayKey = k;
      day = { entriesToday: 0, lastStopLossAt: null };
      dayPnl = 0;
    }

    const decision = evaluateStrategy({
      candles: candles.slice(0, i + 1),
      position,
      day,
      params,
      now: new Date(bar.ts),
    });

    if (decision.action === 'buy' && !position) {
      const budget = Math.min(cash, Math.floor((seedCash * params.orderPct) / 100));
      const qty = Math.floor(budget / bar.c);
      const verdict = checkRisk({
        enabled: true,
        killSwitch: false,
        side: 'buy',
        orderCost: qty * bar.c,
        cashBalance: cash,
        seedKrw: seedCash,
        positionsCount: 0,
        alreadyHolding: false,
        dailyRealizedPnl: dayPnl,
        params,
      });
      if (verdict.allowed && qty > 0) {
        cash -= qty * bar.c;
        position = { qty, avgPrice: bar.c, entryTs: bar.ts };
        day.entriesToday++;
      }
    } else if (decision.action === 'sell' && position) {
      const pnl = (bar.c - position.avgPrice) * position.qty;
      cash += position.qty * bar.c;
      trades.push({
        entryTs: position.entryTs,
        exitTs: bar.ts,
        entryPrice: position.avgPrice,
        exitPrice: bar.c,
        qty: position.qty,
        pnl,
        exitReason: decision.reason,
      });
      dayPnl += pnl;
      if (decision.reason.startsWith('손절')) day.lastStopLossAt = bar.ts;
      position = null;
    }

    const equity = cash + (position ? position.qty * bar.c : 0);
    if (equity > peak) peak = equity;
    if (peak - equity > maxDrawdown) maxDrawdown = peak - equity;
  }

  // 잔여 포지션은 마지막 봉 종가로 강제 청산 (미청산 상태로 통계 왜곡 방지)
  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    const pnl = (last.c - position.avgPrice) * position.qty;
    cash += position.qty * last.c;
    trades.push({
      entryTs: position.entryTs,
      exitTs: last.ts,
      entryPrice: position.avgPrice,
      exitPrice: last.c,
      qty: position.qty,
      pnl,
      exitReason: '백테스트 종료 (강제 청산)',
    });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  return {
    trades,
    stats: {
      tradeCount: trades.length,
      wins,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      totalPnl,
      maxDrawdown,
      endingEquity: cash,
      returnPct: seedCash > 0 ? ((cash - seedCash) / seedCash) * 100 : 0,
    },
  };
}
