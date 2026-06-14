// 펀더멘털 수집 오케스트레이션 (F4/F15/F12) — 수동 갱신 API와 크론 잡이 공유.
// 소스를 시장별로 선택해 fetch → DB upsert. 부분 실패를 허용(섹션별 독립).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FundamentalsSource, Stock } from '@/types';
import { DomainError } from '@/lib/errors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { regionOf } from '@/lib/utils/market-hours';
import { resolveFundamentalsSources } from '@/lib/providers/fundamentals-source';
import { getOpenaiKey } from '@/lib/supabase/queries/settings';
import { summarizeDisclosure, mapWithConcurrency } from '@/lib/ai/summarize';
import { recordUsage } from '@/lib/supabase/queries/usage';
import {
  upsertMetrics,
  replaceDividends,
  upsertDisclosures,
  getDisclosureUrls,
} from '@/lib/supabase/queries/fundamentals';

export type SectionStatus = 'ok' | 'skipped' | 'error';
export interface SectionResult {
  status: SectionStatus;
  count?: number;
  /** skipped 사유 또는 에러 메시지(사용자 노출 가능) */
  reason?: string;
}
export interface RefreshOutcome {
  metrics: SectionResult;
  dividends: SectionResult;
  disclosures: SectionResult;
}

function errMsg(e: unknown): string {
  if (e instanceof DomainError) return e.userMessage;
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

const KEY_MISSING = '데이터 소스 키 또는 식별자가 설정되지 않았습니다.';

/**
 * 종목 펀더멘털을 외부 소스에서 수집해 DB에 반영.
 * @param userDb 사용자 세션 클라이언트(키 복호화·매핑 조회용 RLS 컨텍스트)
 */
export async function refreshFundamentals(userDb: SupabaseClient, userId: string, stock: Stock): Promise<RefreshOutcome> {
  const sources = await resolveFundamentalsSources(userDb, userId, stock);
  const admin = createAdminSupabase();
  const dividendSource: FundamentalsSource = regionOf(stock.market) === 'KR' ? 'dart' : 'fmp';

  const runMetrics = async (): Promise<SectionResult> => {
    if (!sources.metrics) return { status: 'skipped', reason: KEY_MISSING };
    try {
      const rows = await sources.metrics();
      const count = await upsertMetrics(admin, stock.id, rows);
      return { status: 'ok', count };
    } catch (e) {
      return { status: 'error', reason: errMsg(e) };
    }
  };

  const runDividends = async (): Promise<SectionResult> => {
    if (!sources.dividends) return { status: 'skipped', reason: KEY_MISSING };
    try {
      const rows = await sources.dividends();
      const count = await replaceDividends(admin, stock.id, dividendSource, rows);
      return { status: 'ok', count };
    } catch (e) {
      return { status: 'error', reason: errMsg(e) };
    }
  };

  const runDisclosures = async (): Promise<SectionResult> => {
    if (!sources.disclosures) return { status: 'skipped', reason: KEY_MISSING };
    try {
      const rows = await sources.disclosures();
      // F12 AI 1줄 요약 — OpenAI 키가 있을 때 신규 공시 상위 10건만(비용 통제, D10).
      const apiKey = await getOpenaiKey(userDb, userId);
      if (apiKey && rows.length > 0) {
        const existing = await getDisclosureUrls(admin, stock.id);
        const fresh = rows.filter((r) => !existing.has(r.url)).slice(0, 10);
        const usages = await mapWithConcurrency(fresh, 3, async (d) => {
          const { text, usage } = await summarizeDisclosure(apiKey, {
            formType: d.formType,
            typeLabelKr: d.typeLabelKr,
            title: d.title,
          });
          d.summaryAi = text;
          return usage;
        });
        const calls = usages.filter(Boolean).length;
        if (calls > 0) {
          try {
            await recordUsage(admin, userId, 'openai', {
              calls,
              promptTokens: usages.reduce((a, u) => a + (u?.inputTokens ?? 0), 0),
              completionTokens: usages.reduce((a, u) => a + (u?.outputTokens ?? 0), 0),
            });
          } catch {
            /* 사용량 기록 실패는 무시 */
          }
        }
      }
      const count = await upsertDisclosures(admin, stock.id, rows);
      return { status: 'ok', count };
    } catch (e) {
      return { status: 'error', reason: errMsg(e) };
    }
  };

  const [metrics, dividends, disclosures] = await Promise.all([runMetrics(), runDividends(), runDisclosures()]);
  return { metrics, dividends, disclosures };
}
