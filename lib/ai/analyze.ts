// AI 투자 분석 호출 (F7) — generateObject. 수동 트리거 시에만(비용 통제).
import 'server-only';
import { generateObject } from 'ai';
import { openaiModel } from '@/lib/ai/client';
import { analysisSchema, analysisPrompt, ANALYSIS_SYSTEM, type AnalysisContext, type AnalysisResult } from '@/lib/ai/prompts/analysis.v1';
import type { AiUsage } from '@/lib/ai/summarize';

export async function analyzeStock(
  apiKey: string,
  ctx: AnalysisContext,
): Promise<{ result: AnalysisResult; usage: AiUsage }> {
  const { object, usage } = await generateObject({
    model: openaiModel(apiKey),
    schema: analysisSchema,
    system: ANALYSIS_SYSTEM,
    prompt: analysisPrompt(ctx),
  });
  return {
    result: object,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
  };
}
