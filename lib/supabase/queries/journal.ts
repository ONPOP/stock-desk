// 투자 기록 (D21) — 투자 규칙 · 목표 수익률 · 월별 시작 금액. 본인 행만(RLS).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError } from '@/lib/errors';
import type { GoalKind, GoalMonthRecord, InvestmentRule, ReturnGoal } from '@/types';

/** 마이그레이션 0021 미적용(테이블 없음)이면 빈 목록으로 degrade — 기존 화면을 깨뜨리지 않는다 */
function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /(does not exist|schema cache|find the table)/i.test(error.message)
  );
}

// ── 투자 규칙 ──

interface RuleRow {
  id: string;
  content: string;
  sort_order: number;
}
const toRule = (r: RuleRow): InvestmentRule => ({ id: r.id, content: r.content, sortOrder: r.sort_order });

export async function listRules(db: SupabaseClient, userId: string): Promise<InvestmentRule[]> {
  const { data, error } = await db
    .from('investment_rules')
    .select('id, content, sort_order')
    .eq('user_id', userId)
    .order('sort_order')
    .order('created_at');
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`투자 규칙 조회 실패: ${error.message}`);
  }
  return (data as RuleRow[]).map(toRule);
}

export async function insertRule(db: SupabaseClient, userId: string, content: string): Promise<InvestmentRule> {
  const { data: last } = await db
    .from('investment_rules')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  const { data, error } = await db
    .from('investment_rules')
    .insert({ user_id: userId, content, sort_order: (last?.sort_order ?? -1) + 1 })
    .select('id, content, sort_order')
    .single();
  if (error) throw new Error(`투자 규칙 저장 실패: ${error.message}`);
  return toRule(data as RuleRow);
}

export async function updateRule(db: SupabaseClient, userId: string, id: string, content: string): Promise<InvestmentRule> {
  const { data, error } = await db
    .from('investment_rules')
    .update({ content })
    .eq('user_id', userId)
    .eq('id', id)
    .select('id, content, sort_order')
    .maybeSingle();
  if (error) throw new Error(`투자 규칙 수정 실패: ${error.message}`);
  if (!data) throw new NotFoundError('투자 규칙을 찾을 수 없습니다.');
  return toRule(data as RuleRow);
}

/** ids 순서대로 sort_order를 다시 매긴다 */
export async function reorderRules(db: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, i) => db.from('investment_rules').update({ sort_order: i }).eq('user_id', userId).eq('id', id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`투자 규칙 순서 변경 실패: ${failed.error.message}`);
}

export async function deleteRule(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from('investment_rules').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`투자 규칙 삭제 실패: ${error.message}`);
}

// ── 목표 수익률 ──

interface GoalRow {
  id: string;
  kind: string;
  rate_pct: string | number;
  effective_month: string;
  created_at: string;
}
/** numeric 문자열의 소수 끝 0 제거("3.500" → "3.5", "10" → "10") */
const trimDecimal = (s: string): string => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
const toGoal = (r: GoalRow): ReturnGoal => ({
  id: r.id,
  kind: r.kind as GoalKind,
  ratePct: trimDecimal(String(r.rate_pct)),
  effectiveMonth: r.effective_month.slice(0, 7),
  createdAt: r.created_at,
});
const GOAL_COLS = 'id, kind, rate_pct, effective_month, created_at';

export async function listGoals(db: SupabaseClient, userId: string): Promise<ReturnGoal[]> {
  const { data, error } = await db
    .from('return_goals')
    .select(GOAL_COLS)
    .eq('user_id', userId)
    .order('effective_month');
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`목표 수익률 조회 실패: ${error.message}`);
  }
  return (data as GoalRow[]).map(toGoal);
}

/** 같은 종류·같은 달 설정은 덮어쓴다(그 달부터 새 경로) */
export async function upsertGoal(
  db: SupabaseClient,
  userId: string,
  input: { kind: GoalKind; ratePct: string; effectiveMonth: string },
): Promise<ReturnGoal> {
  const { data, error } = await db
    .from('return_goals')
    .upsert(
      {
        user_id: userId,
        kind: input.kind,
        rate_pct: input.ratePct,
        effective_month: `${input.effectiveMonth}-01`,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,kind,effective_month' },
    )
    .select(GOAL_COLS)
    .single();
  if (error) throw new Error(`목표 수익률 저장 실패: ${error.message}`);
  return toGoal(data as GoalRow);
}

export async function deleteGoal(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from('return_goals').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`목표 수익률 삭제 실패: ${error.message}`);
}

// ── 월별 시작 금액 ──

interface MonthRow {
  month: string;
  base_start: number | string;
  start_override: number | string | null;
  net_flow: number | string;
  realized: number | string;
  closed: boolean;
}
const toMonth = (r: MonthRow): GoalMonthRecord => ({
  month: r.month.slice(0, 7),
  baseStart: Number(r.base_start),
  startOverride: r.start_override === null ? null : Number(r.start_override),
  netFlow: Number(r.net_flow),
  realized: Number(r.realized),
  closed: r.closed,
});

export async function listGoalMonths(db: SupabaseClient, userId: string): Promise<GoalMonthRecord[]> {
  const { data, error } = await db
    .from('return_goal_months')
    .select('month, base_start, start_override, net_flow, realized, closed')
    .eq('user_id', userId)
    .order('month');
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`월별 목표 기록 조회 실패: ${error.message}`);
  }
  return (data as MonthRow[]).map(toMonth);
}

export async function upsertGoalMonths(db: SupabaseClient, userId: string, recs: GoalMonthRecord[]): Promise<void> {
  if (recs.length === 0) return;
  const { error } = await db.from('return_goal_months').upsert(
    recs.map((r) => ({
      user_id: userId,
      month: `${r.month}-01`,
      base_start: r.baseStart,
      start_override: r.startOverride,
      net_flow: r.netFlow,
      realized: r.realized,
      closed: r.closed,
    })),
    { onConflict: 'user_id,month' },
  );
  if (error) {
    if (isMissingTable(error)) return;
    throw new Error(`월별 목표 기록 저장 실패: ${error.message}`);
  }
}

/** 월초 금액 수정(null이면 자동값으로 되돌림) */
export async function setMonthStartOverride(
  db: SupabaseClient,
  userId: string,
  month: string,
  startOverride: number | null,
): Promise<void> {
  const { data, error } = await db
    .from('return_goal_months')
    .update({ start_override: startOverride })
    .eq('user_id', userId)
    .eq('month', `${month}-01`)
    .select('month');
  if (error) throw new Error(`시작 금액 수정 실패: ${error.message}`);
  if (!data || data.length === 0) throw new NotFoundError('해당 월 기록을 찾을 수 없습니다.');
}
