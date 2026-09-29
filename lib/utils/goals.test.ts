import { describe, it, expect } from 'vitest';
import {
  addMonths,
  buildMonthRecords,
  computeMonthBase,
  evaluateMonths,
  evaluateYears,
  monthRange,
  monthsBetween,
} from './goals';
import type { CashTransaction, GoalMonthRecord, RealTrade, ReturnGoal } from '@/types';

let seq = 0;
function tr(p: Partial<RealTrade> & Pick<RealTrade, 'side' | 'qty' | 'price' | 'tradeDate'>): RealTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    stockId: p.stockId ?? 's1',
    ticker: 'AAA',
    name: '종목',
    market: p.market ?? 'KOSPI',
    currency: p.currency ?? 'KRW',
    side: p.side,
    qty: p.qty,
    price: p.price,
    tradeDate: p.tradeDate,
    memo: null,
    isEtf: false,
    fee: p.fee ?? 0,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
  };
}
function dep(amount: number, txDate: string, type: CashTransaction['type'] = 'deposit'): CashTransaction {
  seq += 1;
  return { id: `c${seq}`, currency: 'KRW', type, amount, txDate, memo: null, createdAt: '' };
}
function rec(month: string, start: number, realized: number, netFlow = 0): GoalMonthRecord {
  return { month, baseStart: start, startOverride: null, netFlow, realized, closed: true };
}
function goal(kind: ReturnGoal['kind'], ratePct: string, effectiveMonth: string): ReturnGoal {
  return { id: `${kind}-${effectiveMonth}`, kind, ratePct, effectiveMonth, createdAt: '' };
}

describe('월 연산', () => {
  it('addMonths는 연도를 넘긴다', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('monthsBetween·monthRange', () => {
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthRange('2025-11', '2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(monthRange('2026-02', '2026-01')).toEqual([]);
  });
});

describe('computeMonthBase', () => {
  it('월초 직전의 예수금 + 매입원가(평가금액 제외)', () => {
    const txs = [dep(10_000_000, '2026-08-01')];
    // 수수료: 매수 0.018% → 100주×50,000=5,000,000원의 900원
    const trades = [tr({ side: 'buy', qty: 100, price: 50_000, tradeDate: '2026-08-10' })];
    // 예수금 10,000,000 − 5,000,900 + 매입원가 5,000,000
    expect(computeMonthBase(trades, txs, '2026-09', 0)).toBe(9_999_100);
    // 9월 이후 기록은 9월 월초에 포함되지 않는다
    expect(computeMonthBase(trades, [...txs, dep(1_000_000, '2026-09-05')], '2026-09', 0)).toBe(9_999_100);
  });
});

describe('evaluateMonths — 목표 경로 고정 복리', () => {
  const g = [goal('monthly', '3', '2026-09')];

  it('설정한 달은 시작 금액 × 3%', () => {
    const [sep] = evaluateMonths([rec('2026-09', 10_000_000, 150_000)], g);
    expect(sep.goal?.requiredProfit).toBe(300_000);
    expect(sep.goal?.targetAmount).toBe(10_300_000);
    expect(sep.goal?.achievementPct).toBe(50);
    expect(sep.goal?.remaining).toBe(150_000);
    expect(sep.goal?.achieved).toBe(false);
  });

  it('목표를 채우면 다음 달 목표 금액은 1,060.9만', () => {
    const out = evaluateMonths([rec('2026-09', 10_000_000, 300_000), rec('2026-10', 10_300_000, 0)], g);
    expect(out[1].goal?.targetAmount).toBe(10_609_000);
    expect(out[1].goal?.requiredRatePct).toBe(3);
  });

  it('미달하면 다음 달 필요 수익률이 커진다(목표 금액은 경로 그대로)', () => {
    const out = evaluateMonths([rec('2026-09', 10_000_000, 100_000), rec('2026-10', 10_100_000, 0)], g);
    expect(out[1].goal?.targetAmount).toBe(10_609_000);
    expect(out[1].goal?.requiredProfit).toBe(509_000);
    expect(out[1].goal?.requiredRatePct).toBe(5.04);
  });

  it('입금은 목표 수익을 바꾸지 않고 시작·목표 금액만 옮긴다', () => {
    const out = evaluateMonths(
      [rec('2026-09', 10_000_000, 300_000), rec('2026-10', 10_300_000, 0, 1_000_000)],
      g,
    );
    expect(out[1].startAmount).toBe(11_300_000);
    expect(out[1].goal?.requiredProfit).toBe(309_000);
    expect(out[1].goal?.targetAmount).toBe(11_609_000);
  });

  it('재설정하면 그 달의 시작 금액부터 다시 계산한다', () => {
    const out = evaluateMonths(
      [rec('2026-09', 10_000_000, 0), rec('2026-10', 10_000_000, 0), rec('2026-11', 10_000_000, 0)],
      [...g, goal('monthly', '2', '2026-11')],
    );
    expect(out[1].goal?.requiredProfit).toBe(609_000);
    expect(out[2].goal?.ratePct).toBe('2');
    expect(out[2].goal?.requiredProfit).toBe(200_000);
  });

  it('초과 달성으로 누적 목표를 이미 넘으면 달성 처리', () => {
    const out = evaluateMonths([rec('2026-09', 10_000_000, 700_000), rec('2026-10', 10_700_000, 0)], g);
    expect(out[1].goal?.requiredProfit).toBeLessThanOrEqual(0);
    expect(out[1].goal?.achieved).toBe(true);
    expect(out[1].goal?.remaining).toBe(0);
  });

  it('설정 이전 달은 목표 없음', () => {
    const out = evaluateMonths([rec('2026-08', 10_000_000, 0), rec('2026-09', 10_000_000, 0)], g);
    expect(out[0].goal).toBeNull();
    expect(out[1].goal).not.toBeNull();
  });
});

describe('evaluateYears', () => {
  it('연초 시작 금액 × 연 목표, 실현손익 연간 합', () => {
    const [y] = evaluateYears(
      [rec('2026-01', 10_000_000, 400_000), rec('2026-02', 10_400_000, 600_000)],
      [goal('yearly', '20', '2026-01')],
    );
    expect(y.goal?.targetProfit).toBe(2_000_000);
    expect(y.realized).toBe(1_000_000);
    expect(y.goal?.achievementPct).toBe(50);
    expect(y.goal?.remaining).toBe(1_000_000);
  });
});

describe('buildMonthRecords', () => {
  const trades = [
    tr({ side: 'buy', qty: 10, price: 10_000, tradeDate: '2026-08-03' }),
    tr({ side: 'sell', qty: 10, price: 11_000, tradeDate: '2026-09-03', fee: 200 }),
  ];
  const txs = [dep(1_000_000, '2026-08-01')];

  it('첫 활동 월부터 이번 달까지 만들고 지난 달은 확정한다', () => {
    const { records, changed } = buildMonthRecords({
      trades, txs, goals: [], stored: [], usdKrw: 0, currentMonth: '2026-10',
    });
    expect(records.map((r) => r.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(records.map((r) => r.closed)).toEqual([true, true, false]);
    expect(records[1].realized).toBe(9_800);
    expect(changed).toHaveLength(3);
  });

  it('확정된 달은 이후 기록이 바뀌어도 그대로 둔다', () => {
    const stored = [rec('2026-08', 123, 0)];
    const { records, changed } = buildMonthRecords({
      trades, txs, goals: [], stored, usdKrw: 0, currentMonth: '2026-09',
    });
    expect(records[0]).toEqual(stored[0]);
    expect(changed.map((r) => r.month)).toEqual(['2026-09']);
  });

  it('저장된 이번 달은 월초 금액·수정값을 유지하고 입출금·실현만 다시 계산한다', () => {
    const stored: GoalMonthRecord[] = [
      { month: '2026-09', baseStart: 5, startOverride: 7, netFlow: 0, realized: 0, closed: false },
    ];
    const { records, changed } = buildMonthRecords({
      trades, txs: [...txs, dep(50_000, '2026-09-10')], goals: [], stored, usdKrw: 0, currentMonth: '2026-09',
    });
    const sep = records.find((r) => r.month === '2026-09');
    expect(sep).toMatchObject({ baseStart: 5, startOverride: 7, netFlow: 50_000, realized: 9_800 });
    expect(changed.some((r) => r.month === '2026-09')).toBe(false);
  });
});

describe('buildMonthRecords — 다시 계산', () => {
  it('recompute면 확정된 달도 새로 계산하되 수정한 월초 금액은 유지한다', () => {
    const trades = [tr({ side: 'sell', qty: 1, price: 1_000, tradeDate: '2026-08-10' })];
    const stored: GoalMonthRecord[] = [
      { month: '2026-08', baseStart: 1, startOverride: 999, netFlow: 0, realized: 0, closed: true },
    ];
    const { records, changed } = buildMonthRecords({
      trades, txs: [dep(5_000, '2026-08-01')], goals: [], stored, usdKrw: 0, currentMonth: '2026-09', recompute: true,
    });
    expect(records[0]).toMatchObject({ baseStart: 0, startOverride: 999, netFlow: 5_000, closed: true });
    expect(changed).toHaveLength(2);
  });
});
