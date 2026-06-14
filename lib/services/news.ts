// 뉴스 수집 오케스트레이션 (F5) — fetch → 중복 클러스터링 → AI 요약·감성(수동 트리거) → upsert.
// AI 호출은 OpenAI 키가 있을 때만(비용 통제, D10). 키 없으면 요약 없이 저장.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsItem, Stock } from '@/types';
import { DomainError } from '@/lib/errors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { resolveNewsSource } from '@/lib/providers/news-source';
import { getOpenaiKey } from '@/lib/supabase/queries/settings';
import { dedupeByCluster } from '@/lib/utils/cluster';
import { summarizeNewsItem, mapWithConcurrency } from '@/lib/ai/summarize';
import { upsertNews } from '@/lib/supabase/queries/news';
import { recordUsage } from '@/lib/supabase/queries/usage';

export interface NewsRefreshResult {
  status: 'ok' | 'skipped' | 'error';
  count?: number;
  summarized?: number;
  reason?: string;
}

function errMsg(e: unknown): string {
  if (e instanceof DomainError) return e.userMessage;
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

/** 종목 뉴스를 수집·요약·저장. @param withAi false면 AI 요약 생략(크론 골격/저비용 모드) */
export async function refreshNews(
  userDb: SupabaseClient,
  userId: string,
  stock: Stock,
  opts?: { limit?: number; withAi?: boolean },
): Promise<NewsRefreshResult> {
  const source = await resolveNewsSource(userDb, userId, stock);
  if (!source) return { status: 'skipped', reason: '뉴스 소스 키(네이버/Finnhub)가 설정되지 않았습니다.' };
  try {
    const raw = await source();
    const deduped = dedupeByCluster(raw).slice(0, opts?.limit ?? 12);

    let items: NewsItem[];
    let summarized = 0;
    const admin = createAdminSupabase();
    const apiKey = opts?.withAi === false ? null : await getOpenaiKey(userDb, userId);
    if (apiKey && deduped.length > 0) {
      const results = await mapWithConcurrency(deduped, 4, (n) =>
        summarizeNewsItem(apiKey, { title: n.title, source: n.source, body: n.body }),
      );
      let inTok = 0;
      let outTok = 0;
      items = deduped.map((n, i) => {
        const r = results[i];
        if (r) {
          summarized += 1;
          inTok += r.usage.inputTokens;
          outTok += r.usage.outputTokens;
        }
        return { ...n, summaryAi: r?.result.summary ?? null, sentiment: r?.result.sentiment ?? null, clusterId: null };
      });
      if (summarized > 0) {
        try {
          await recordUsage(admin, userId, 'openai', { calls: summarized, promptTokens: inTok, completionTokens: outTok });
        } catch {
          /* 사용량 기록 실패는 본 작업을 막지 않음 */
        }
      }
    } else {
      items = deduped.map((n) => ({ ...n, summaryAi: null, sentiment: null, clusterId: null }));
    }

    const count = await upsertNews(admin, stock.id, items);
    return { status: 'ok', count, summarized };
  } catch (e) {
    return { status: 'error', reason: errMsg(e) };
  }
}
