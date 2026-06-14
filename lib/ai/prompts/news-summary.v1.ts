// 뉴스 요약·감성분류 프롬프트 v1 (F5). 3줄 이내 요약 + 호재/악재/중립.
import { z } from 'zod';

export const newsSummarySchema = z.object({
  summary: z.string().describe('기사 핵심을 3줄 이내로 요약한 한국어 텍스트. 출처에 없는 사실 추가 금지.'),
  sentiment: z
    .enum(['positive', 'negative', 'neutral'])
    .describe('투자자 관점 영향도. positive=호재, negative=악재, neutral=중립.'),
});

export type NewsSummaryResult = z.infer<typeof newsSummarySchema>;

export const NEWS_SUMMARY_SYSTEM =
  '너는 한국어 금융 뉴스 분석가다. 주어진 기사를 투자자 관점에서 사실에 근거해 간결히 요약하고 영향도를 분류한다. 기사에 없는 정보를 지어내지 않는다.';

export function newsSummaryPrompt(input: { title: string; source?: string | null; body?: string | null }): string {
  const parts = [`제목: ${input.title}`];
  if (input.source) parts.push(`매체: ${input.source}`);
  if (input.body) parts.push(`본문: ${input.body.slice(0, 2000)}`);
  return parts.join('\n');
}
