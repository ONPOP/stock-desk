// AI 투자 분석 오케스트레이션 (F7) — 주가·F4·F5·노트 컨텍스트 조합 → AI → 저장.
// 수동 1클릭(또는 크론) 트리거. OpenAI 단일(D 결정, Anthropic 듀얼은 추후).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAnalysis, Stock } from '@/types';
import { DomainError } from '@/lib/errors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOpenaiKey } from '@/lib/supabase/queries/settings';
import { getMetricsSeries } from '@/lib/supabase/queries/fundamentals';
import { getNewsByStock } from '@/lib/supabase/queries/news';
import { listNotes } from '@/lib/supabase/queries/notes';
import { listAnalyses, insertAnalysis } from '@/lib/supabase/queries/analyses';
import { recordUsage } from '@/lib/supabase/queries/usage';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { getCachedQuote } from '@/lib/providers/quote-cache';
import { analyzeStock } from '@/lib/ai/analyze';
import { analysisToMarkdown, type AnalysisContext } from '@/lib/ai/prompts/analysis.v1';
import { formatMoney } from '@/lib/utils/money';

export interface AnalysisRunResult {
  status: 'ok' | 'skipped' | 'error';
  analysis?: AiAnalysis;
  reason?: string;
}

function errMsg(e: unknown): string {
  if (e instanceof DomainError) return e.userMessage;
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

async function buildContext(db: SupabaseClient, userId: string, stock: Stock): Promise<AnalysisContext> {
  const [metricsSeries, news, notes, lastAnalyses] = await Promise.all([
    getMetricsSeries(db, stock.id, 1).catch(() => []),
    getNewsByStock(db, stock.id, 5).catch(() => []),
    listNotes(db, userId, { stockId: stock.id, limit: 5 }).catch(() => []),
    listAnalyses(db, stock.id, 1).catch(() => []),
  ]);

  let priceLine: string | null = null;
  try {
    const source = await resolveQuoteSource(db, userId);
    const q = await getCachedQuote(source, stock.ticker, stock.market);
    priceLine = `${formatMoney(q.price, q.currency)} (${q.changeRate}%)`;
  } catch {
    /* 시세 실패 시 생략 */
  }

  const m = metricsSeries[0];
  const metricsLine = m
    ? [m.per != null ? `PER ${m.per}` : null, m.pbr != null ? `PBR ${m.pbr}` : null, m.roe != null ? `ROE ${m.roe}%` : null, m.eps != null ? `EPS ${m.eps}` : null]
        .filter(Boolean)
        .join(', ') || null
    : null;

  return {
    name: stock.name_kr ?? stock.name_en ?? stock.ticker,
    ticker: stock.ticker,
    market: stock.market,
    priceLine,
    metricsLine,
    newsHeadlines: news.map((n) => n.title),
    notes: notes.map((n) => n.contentMd),
    lastPosition: lastAnalyses[0]?.position ?? null,
  };
}

export async function runAnalysis(
  userDb: SupabaseClient,
  userId: string,
  stock: Stock,
  triggerType: 'auto' | 'manual' = 'manual',
): Promise<AnalysisRunResult> {
  const apiKey = await getOpenaiKey(userDb, userId);
  if (!apiKey) return { status: 'skipped', reason: 'OpenAI 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.' };
  try {
    const ctx = await buildContext(userDb, userId, stock);
    const { result, usage } = await analyzeStock(apiKey, ctx);
    const analysis = await insertAnalysis(userDb, userId, {
      stockId: stock.id,
      model: 'gpt',
      triggerType,
      contextSnapshot: { ...ctx },
      resultMd: analysisToMarkdown(result),
      position: result.position,
      confidence: result.confidence,
    });
    try {
      await recordUsage(createAdminSupabase(), userId, 'openai', {
        calls: 1,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
      });
    } catch {
      /* 사용량 기록 실패 무시 */
    }
    return { status: 'ok', analysis };
  } catch (e) {
    return { status: 'error', reason: errMsg(e) };
  }
}
