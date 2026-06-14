// 데일리 브리핑 DB 쿼리 (F1) — briefings. 본인 행만(RLS user_id=auth.uid()).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Briefing } from '@/types';

interface BriefingRow {
  date: string;
  content_md: string | null;
  generated_at: string;
  status: string;
}

export async function getLatestBriefing(db: SupabaseClient, userId: string): Promise<Briefing | null> {
  const { data, error } = await db
    .from('briefings')
    .select('date, content_md, generated_at, status')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle<BriefingRow>();
  if (error) throw new Error(`브리핑 조회 실패: ${error.message}`);
  if (!data) return null;
  return {
    date: data.date,
    contentMd: data.content_md,
    generatedAt: data.generated_at,
    status: data.status as Briefing['status'],
  };
}

export async function insertBriefing(
  db: SupabaseClient,
  userId: string,
  input: { date: string; contentMd: string | null; sources?: unknown[]; status: Briefing['status'] },
): Promise<void> {
  const { error } = await db.from('briefings').insert({
    user_id: userId,
    date: input.date,
    content_md: input.contentMd,
    sources: input.sources ?? [],
    status: input.status,
  });
  if (error) throw new Error(`브리핑 저장 실패: ${error.message}`);
}
