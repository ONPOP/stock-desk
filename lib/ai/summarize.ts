// AI 요약·감성·브리핑 호출 래퍼 (수동 트리거 시에만 호출 — 비용 통제, D10).
// 프롬프트는 lib/ai/prompts/ 버전 파일, 모델은 lib/ai/client.ts 단일 지점.
import 'server-only';
import { generateObject, generateText } from 'ai';
import { openaiModel } from '@/lib/ai/client';
import {
  newsSummarySchema,
  newsSummaryPrompt,
  NEWS_SUMMARY_SYSTEM,
  type NewsSummaryResult,
} from '@/lib/ai/prompts/news-summary.v1';
import { disclosureSummaryPrompt, DISCLOSURE_SUMMARY_SYSTEM } from '@/lib/ai/prompts/disclosure-summary.v1';
import { briefingPrompt, BRIEFING_SYSTEM, type BriefingContext } from '@/lib/ai/prompts/briefing.v1';

/** AI 토큰 사용량 (사용량 로그용) */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

function toUsage(u: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined): AiUsage {
  return {
    inputTokens: u?.inputTokens ?? u?.promptTokens ?? 0,
    outputTokens: u?.outputTokens ?? u?.completionTokens ?? 0,
  };
}

export async function summarizeNewsItem(
  apiKey: string,
  input: { title: string; source?: string | null; body?: string | null },
): Promise<{ result: NewsSummaryResult; usage: AiUsage }> {
  const { object, usage } = await generateObject({
    model: openaiModel(apiKey),
    schema: newsSummarySchema,
    system: NEWS_SUMMARY_SYSTEM,
    prompt: newsSummaryPrompt(input),
  });
  return { result: object, usage: toUsage(usage) };
}

export async function summarizeDisclosure(
  apiKey: string,
  input: { formType: string; typeLabelKr?: string | null; title: string },
): Promise<{ text: string; usage: AiUsage }> {
  const { text, usage } = await generateText({
    model: openaiModel(apiKey),
    system: DISCLOSURE_SUMMARY_SYSTEM,
    prompt: disclosureSummaryPrompt(input),
  });
  return { text: text.trim(), usage: toUsage(usage) };
}

export async function generateBriefingMd(apiKey: string, ctx: BriefingContext): Promise<{ text: string; usage: AiUsage }> {
  const { text, usage } = await generateText({
    model: openaiModel(apiKey),
    system: BRIEFING_SYSTEM,
    prompt: briefingPrompt(ctx),
  });
  return { text: text.trim(), usage: toUsage(usage) };
}

/** 동시성 제한 병렬 매핑 (OpenAI 레이트리밋 완화). 실패 항목은 null. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<R | null>> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
