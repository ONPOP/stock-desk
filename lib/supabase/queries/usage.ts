// API 사용량 로그 (PRD 14장) — 일자×제공자 증분 집계. 쓰기 admin, 읽기 RSC.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsageRow, UsageSummary } from '@/types';

/** KST 기준 오늘 (YYYY-MM-DD) */
function todayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export interface UsageDelta {
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
}

interface UsageDbRow {
  log_date?: string;
  provider: string;
  calls: number | string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
}

const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

/** 사용량 증분 누적 (개인용 — select 후 합산 upsert). 실패해도 본 작업을 막지 않도록 호출부에서 swallow. */
export async function recordUsage(
  admin: SupabaseClient,
  userId: string,
  provider: string,
  delta: UsageDelta,
): Promise<void> {
  const date = todayKst();
  const { data } = await admin
    .from('api_usage_log')
    .select('calls, prompt_tokens, completion_tokens')
    .eq('user_id', userId)
    .eq('log_date', date)
    .eq('provider', provider)
    .maybeSingle<UsageDbRow>();
  const { error } = await admin.from('api_usage_log').upsert(
    {
      user_id: userId,
      log_date: date,
      provider,
      calls: n(data?.calls) + (delta.calls ?? 0),
      prompt_tokens: n(data?.prompt_tokens) + (delta.promptTokens ?? 0),
      completion_tokens: n(data?.completion_tokens) + (delta.completionTokens ?? 0),
    },
    { onConflict: 'user_id,log_date,provider' },
  );
  if (error) throw new Error(`사용량 기록 실패: ${error.message}`);
}

export async function getUsageSummary(db: SupabaseClient, userId: string): Promise<UsageSummary> {
  const today = todayKst();
  const monthStart = `${today.slice(0, 8)}01`;
  const { data, error } = await db
    .from('api_usage_log')
    .select('log_date, provider, calls, prompt_tokens, completion_tokens')
    .eq('user_id', userId)
    .gte('log_date', monthStart);
  if (error) throw new Error(`사용량 조회 실패: ${error.message}`);
  const rows = (data ?? []) as UsageDbRow[];

  const todayRows: UsageRow[] = rows
    .filter((r) => r.log_date === today)
    .map((r) => ({ provider: r.provider, calls: n(r.calls), promptTokens: n(r.prompt_tokens), completionTokens: n(r.completion_tokens) }));

  const monthMap = new Map<string, UsageRow>();
  for (const r of rows) {
    const cur = monthMap.get(r.provider) ?? { provider: r.provider, calls: 0, promptTokens: 0, completionTokens: 0 };
    cur.calls += n(r.calls);
    cur.promptTokens += n(r.prompt_tokens);
    cur.completionTokens += n(r.completion_tokens);
    monthMap.set(r.provider, cur);
  }
  return { today: todayRows, month: [...monthMap.values()] };
}
