// 데일리 브리핑 생성 (F1) — 시장지수 + 워치리스트 뉴스 + 일정 컨텍스트 → AI 생성 → 저장.
// 수동 "지금 생성"과 크론(06:30)이 공유. OpenAI 키 없거나 실패 시 status='failed'로 기록.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@/lib/errors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOpenaiKey } from '@/lib/supabase/queries/settings';
import { listWatchlist } from '@/lib/supabase/queries/watchlist';
import { getNewsByStock } from '@/lib/supabase/queries/news';
import { getMarketIndices } from '@/lib/providers/yahoo/market-index';
import { generateBriefingMd } from '@/lib/ai/summarize';
import { insertBriefing } from '@/lib/supabase/queries/briefings';
import { recordUsage } from '@/lib/supabase/queries/usage';
import type { BriefingContext } from '@/lib/ai/prompts/briefing.v1';

export interface BriefingResult {
  status: 'success' | 'failed';
  reason?: string;
}

function errMsg(e: unknown): string {
  if (e instanceof DomainError) return e.userMessage;
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

async function getUpcomingEvents(
  db: SupabaseClient,
  userId: string,
  fromDate: string,
): Promise<Array<{ title: string; date: string }>> {
  const to = new Date(`${fromDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 7);
  const toDate = to.toISOString().slice(0, 10);
  const { data, error } = await db
    .from('calendar_events')
    .select('title, event_date, user_id')
    .gte('event_date', fromDate)
    .lte('event_date', toDate)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('event_date', { ascending: true })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((e) => ({ title: (e as { title: string }).title, date: (e as { event_date: string }).event_date }));
}

async function buildContext(db: SupabaseClient, userId: string, dateLabel: string): Promise<BriefingContext> {
  const [indices, watchlist] = await Promise.all([
    getMarketIndices().catch(() => []),
    listWatchlist(db, userId),
  ]);
  const watchlistNews = await Promise.all(
    watchlist.slice(0, 10).map(async (w) => ({
      ticker: w.ticker,
      name: w.name_kr ?? w.name_en ?? w.ticker,
      headlines: (await getNewsByStock(db, w.stock_id, 3)).map((n) => n.title),
    })),
  );
  const events = await getUpcomingEvents(db, userId, dateLabel);
  return {
    dateLabel,
    indices: indices.map((i) => ({ label: i.label, value: i.value, changeRate: i.changeRate, unit: i.unit })),
    watchlistNews,
    events,
  };
}

export async function generateDailyBriefing(
  db: SupabaseClient,
  userId: string,
  dateLabel: string,
): Promise<BriefingResult> {
  const apiKey = await getOpenaiKey(db, userId);
  if (!apiKey) {
    await insertBriefing(db, userId, { date: dateLabel, contentMd: null, status: 'failed' });
    return { status: 'failed', reason: 'OpenAI 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.' };
  }
  try {
    const ctx = await buildContext(db, userId, dateLabel);
    const { text: md, usage } = await generateBriefingMd(apiKey, ctx);
    await insertBriefing(db, userId, {
      date: dateLabel,
      contentMd: md,
      status: 'success',
      sources: ctx.watchlistNews.map((w) => ({ ticker: w.ticker, headlines: w.headlines })),
    });
    try {
      await recordUsage(createAdminSupabase(), userId, 'openai', {
        calls: 1,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
      });
    } catch {
      /* 사용량 기록 실패는 무시 */
    }
    return { status: 'success' };
  } catch (e) {
    await insertBriefing(db, userId, { date: dateLabel, contentMd: null, status: 'failed' });
    return { status: 'failed', reason: errMsg(e) };
  }
}
