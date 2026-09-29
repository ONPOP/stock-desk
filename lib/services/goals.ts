// 목표 수익률 현황 (D21) — 월별 시작 금액을 확정·저장하고 월/연 목표를 평가한다.
// 지난 달 기록은 한 번 확정되면 다시 계산하지 않는다(이후 입출금·매매 수정이 과거 달에 영향 X).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalApiError } from '@/lib/errors';
import { getMarketIndices } from '@/lib/providers/yahoo/market-index';
import { listGoalMonths, listGoals, upsertGoalMonths } from '@/lib/supabase/queries/journal';
import { buildMonthRecords, evaluateMonths, evaluateYears, hasUsdActivity } from '@/lib/utils/goals';
import type { CashTransaction, GoalOverview, RealTrade } from '@/types';

/** KST 기준 이번 달 YYYY-MM */
export function currentKstMonth(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7);
}

async function fetchUsdKrw(): Promise<number> {
  try {
    const fx = (await getMarketIndices()).find((i) => i.key === 'usdkrw');
    return fx && fx.value > 0 ? fx.value : 0;
  } catch {
    return 0;
  }
}

export async function loadGoalOverview(
  db: SupabaseClient,
  userId: string,
  data: { trades: RealTrade[]; txs: CashTransaction[] },
  opts: { recompute?: boolean } = {},
): Promise<GoalOverview> {
  const [goals, stored] = await Promise.all([listGoals(db, userId), listGoalMonths(db, userId)]);
  const needFx = hasUsdActivity(data.trades, data.txs);
  const usdKrw = needFx ? await fetchUsdKrw() : 0;
  const fxPending = needFx && usdKrw === 0;
  const currentMonth = currentKstMonth();

  const { records, changed } = buildMonthRecords({
    ...data,
    goals,
    stored,
    usdKrw,
    currentMonth,
    recompute: opts.recompute,
  });
  // 환율 없이 달러 금액을 0으로 확정하면 되돌릴 수 없으므로 저장을 미룬다
  if (opts.recompute && fxPending) {
    throw new ExternalApiError('yahoo', '환율을 불러오지 못해 다시 계산할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }
  if (opts.recompute) {
    await upsertGoalMonths(db, userId, changed); // 명시적 요청이라 실패를 그대로 알린다
  } else if (!fxPending) {
    try {
      await upsertGoalMonths(db, userId, changed);
    } catch (e) {
      console.error('[goals] 월별 기록 저장 실패', e);
    }
  }

  return {
    goals,
    months: evaluateMonths(records, goals),
    years: evaluateYears(records, goals),
    currentMonth,
    fxPending,
  };
}
