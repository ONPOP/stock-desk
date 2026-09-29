// 목표 수익률 계산 (D21) — 순수 함수(서버·클라이언트 공용). 금액은 원화 환산 원 단위 정수.
//
// 시작 금액 = 월초 예수금 + 보유 매입원가(평가금액 제외) + 월중 입금 − 출금.
// 달성 여부는 실현손익으로만 판정한다.
//
// 월 목표는 한 번 설정하면 설정한 달의 시작 금액(anchor)에서 복리 경로를 고정한다:
//   k번째 달까지 누적 목표 수익 = anchor × ((1 + r)^(k+1) − 1)
//   이번 달 목표 수익 = 누적 목표 수익 − 경로 시작 이후 지난 달들의 실현손익 합
// 그래서 지난 달에 미달하면 이번 달 필요 수익률이 올라가고, 새로 설정하면 그 달부터 경로가 다시 시작된다.
// 입출금은 수익이 아니므로 목표 수익에 영향을 주지 않고 시작·목표 금액만 같은 만큼 옮긴다.
import Decimal from 'decimal.js';
import { computeCashBalance } from './cash';
import { computeHoldings, computeRealized } from './portfolio';
import type {
  CashTransaction,
  Currency,
  GoalMonthRecord,
  MonthGoalProgress,
  RealTrade,
  ReturnGoal,
  YearGoalProgress,
} from '@/types';

const round = (d: Decimal): number => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/** YYYY-MM-DD → YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** YYYY-MM에 n개월을 더한다 */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** a → b 개월 수(b가 뒤면 양수) */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** from ~ to(포함) 월 목록. from이 뒤면 빈 배열 */
export function monthRange(from: string, to: string): string[] {
  const n = monthsBetween(from, to);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addMonths(from, i));
}

function toKrw(minor: number, currency: Currency, usdKrw: number): number {
  return currency === 'USD' ? round(new Decimal(minor).div(100).mul(usdKrw)) : minor;
}

/** 비율(%) 소수 2자리. 분모가 0이면 0 */
function pct(n: number | Decimal, d: number | Decimal): number {
  const den = new Decimal(d);
  if (den.isZero()) return 0;
  return new Decimal(n).div(den).mul(100).toDecimalPlaces(2).toNumber();
}

/** 매매·입출금에 달러가 섞였는가 — 환율 없이 원화 환산을 확정하면 안 되는지 판단용 */
export function hasUsdActivity(trades: RealTrade[], txs: CashTransaction[]): boolean {
  return trades.some((t) => t.currency === 'USD') || txs.some((t) => t.currency === 'USD');
}

/** 해당 월 1일 직전 시점의 예수금 + 보유 매입원가(₩환산) */
export function computeMonthBase(
  trades: RealTrade[],
  txs: CashTransaction[],
  month: string,
  usdKrw: number,
): number {
  const cutoff = `${month}-01`;
  const pastTrades = trades.filter((t) => t.tradeDate < cutoff);
  const pastTxs = txs.filter((t) => t.txDate < cutoff);
  const cash = computeCashBalance(pastTxs, pastTrades);
  let total = cash.KRW + toKrw(cash.USD, 'USD', usdKrw);
  for (const h of computeHoldings(pastTrades)) total += toKrw(h.buyAmount, h.currency, usdKrw);
  return total;
}

/** 월별 입금 − 출금(₩환산) */
export function netFlowByMonth(txs: CashTransaction[], usdKrw: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txs) {
    const m = monthOf(t.txDate);
    const v = toKrw(t.type === 'deposit' ? t.amount : -t.amount, t.currency, usdKrw);
    map.set(m, (map.get(m) ?? 0) + v);
  }
  return map;
}

/** 월별 실현손익(₩환산). 평단은 전체 이력으로 계산해야 하므로 전 매매를 받는다 */
export function realizedByMonth(trades: RealTrade[], usdKrw: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of computeRealized(trades)) {
    const m = monthOf(r.tradeDate);
    map.set(m, (map.get(m) ?? 0) + toKrw(r.realizedPnl, r.currency, usdKrw));
  }
  return map;
}

export function startAmountOf(rec: GoalMonthRecord): number {
  return (rec.startOverride ?? rec.baseStart) + rec.netFlow;
}

export interface BuildMonthRecordsInput {
  trades: RealTrade[];
  txs: CashTransaction[];
  goals: ReturnGoal[];
  stored: GoalMonthRecord[];
  usdKrw: number;
  /** 이번 달 YYYY-MM (KST) */
  currentMonth: string;
  /** true면 확정 여부와 무관하게 모든 달을 다시 계산한다(사용자 수정 월초 금액은 유지) */
  recompute?: boolean;
}

/**
 * 첫 활동 월 ~ 이번 달의 월별 기록을 만든다.
 * - 확정(closed)된 저장 기록은 그대로 쓴다(과거 달 불변).
 * - 미확정 기록은 입출금·실현손익을 다시 계산하고, 지난 달이면 확정한다.
 * - 저장되지 않은 달은 새로 계산한다.
 * changed는 저장(upsert)이 필요한 기록이다.
 */
export function buildMonthRecords(input: BuildMonthRecordsInput): {
  records: GoalMonthRecord[];
  changed: GoalMonthRecord[];
} {
  const { trades, txs, goals, stored, usdKrw, currentMonth, recompute = false } = input;
  const storedMap = new Map(stored.map((r) => [r.month, r]));

  const starts = [
    ...trades.map((t) => monthOf(t.tradeDate)),
    ...txs.map((t) => monthOf(t.txDate)),
    ...goals.map((g) => g.effectiveMonth),
    ...stored.map((r) => r.month),
  ].filter((m) => m <= currentMonth);
  const first = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : currentMonth;

  const flows = netFlowByMonth(txs, usdKrw);
  const realized = realizedByMonth(trades, usdKrw);

  const records: GoalMonthRecord[] = [];
  const changed: GoalMonthRecord[] = [];
  for (const month of monthRange(first, currentMonth)) {
    const prev = storedMap.get(month);
    if (prev?.closed && !recompute) {
      records.push(prev);
      continue;
    }
    const rec: GoalMonthRecord = {
      month,
      baseStart: prev && !recompute ? prev.baseStart : computeMonthBase(trades, txs, month, usdKrw),
      startOverride: prev?.startOverride ?? null,
      netFlow: flows.get(month) ?? 0,
      realized: realized.get(month) ?? 0,
      closed: month < currentMonth,
    };
    records.push(rec);
    // 이번 달 입출금·실현손익은 조회 때마다 다시 계산하므로 새 행이거나 확정될 때만 저장한다
    if (!prev || rec.closed || recompute) changed.push(rec);
  }
  return { records, changed };
}

/** 월 목표 중 month에 적용되는 설정 — 적용 시작 월이 가장 늦은 것 */
export function activeMonthlyGoal(goals: ReturnGoal[], month: string): ReturnGoal | null {
  let best: ReturnGoal | null = null;
  for (const g of goals) {
    if (g.kind !== 'monthly' || g.effectiveMonth > month) continue;
    if (!best || g.effectiveMonth > best.effectiveMonth) best = g;
  }
  return best;
}

/** 월별 목표 평가(오름차순 records 기준) */
export function evaluateMonths(records: GoalMonthRecord[], goals: ReturnGoal[]): MonthGoalProgress[] {
  const sorted = [...records].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map(sorted.map((r) => [r.month, r]));

  return sorted.map((rec) => {
    const startAmount = startAmountOf(rec);
    const base = { month: rec.month, record: rec, startAmount, realizedRatePct: pct(rec.realized, startAmount) };

    const g = activeMonthlyGoal(goals, rec.month);
    const anchorRec = g ? byMonth.get(g.effectiveMonth) : undefined;
    if (!g || !anchorRec) return { ...base, goal: null };

    const r = new Decimal(g.ratePct).div(100);
    const k = monthsBetween(g.effectiveMonth, rec.month);
    const cumTarget = new Decimal(startAmountOf(anchorRec)).mul(r.plus(1).pow(k + 1).minus(1));
    let realizedBefore = 0;
    for (const m of monthRange(g.effectiveMonth, addMonths(rec.month, -1))) {
      realizedBefore += byMonth.get(m)?.realized ?? 0;
    }
    const requiredProfit = round(cumTarget.minus(realizedBefore));

    const alreadyMet = requiredProfit <= 0;
    return {
      ...base,
      goal: {
        goalId: g.id,
        ratePct: g.ratePct,
        requiredRatePct: pct(requiredProfit, startAmount),
        requiredProfit,
        targetAmount: startAmount + requiredProfit,
        achievementPct: alreadyMet ? 100 : pct(rec.realized, requiredProfit),
        remaining: Math.max(0, requiredProfit - rec.realized),
        achieved: alreadyMet || rec.realized >= requiredProfit,
      },
    };
  });
}

/** 연도별 목표 평가 — 시작 금액은 그해 첫 기록 월의 시작 금액, 실현손익은 연간 합 */
export function evaluateYears(records: GoalMonthRecord[], goals: ReturnGoal[]): YearGoalProgress[] {
  const sorted = [...records].sort((a, b) => (a.month < b.month ? -1 : 1));
  const years = new Map<string, GoalMonthRecord[]>();
  for (const r of sorted) {
    const y = r.month.slice(0, 4);
    const arr = years.get(y);
    if (arr) arr.push(r);
    else years.set(y, [r]);
  }

  return [...years.entries()].map(([year, recs]) => {
    const startAmount = startAmountOf(recs[0]);
    const realized = recs.reduce((a, r) => a + r.realized, 0);
    const g = goals.find((x) => x.kind === 'yearly' && x.effectiveMonth === `${year}-01`);
    const base = { year, startAmount, realized, realizedRatePct: pct(realized, startAmount) };
    if (!g) return { ...base, goal: null };

    const targetProfit = round(new Decimal(startAmount).mul(g.ratePct).div(100));
    return {
      ...base,
      goal: {
        goalId: g.id,
        ratePct: g.ratePct,
        targetProfit,
        targetAmount: startAmount + targetProfit,
        achievementPct: targetProfit > 0 ? pct(realized, targetProfit) : 0,
        remaining: Math.max(0, targetProfit - realized),
        achieved: targetProfit > 0 && realized >= targetProfit,
      },
    };
  });
}
