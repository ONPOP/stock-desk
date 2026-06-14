// AI 투자 분석 프롬프트 v1 (F7). 주가해석·호재/악재·리스크·포지션·신뢰도·모니터링.
import { z } from 'zod';

export const analysisSchema = z.object({
  priceInterpretation: z.string().describe('최근 주가 흐름 해석 2~3문장(한국어).'),
  positives: z.array(z.string()).describe('호재 요인 (없으면 빈 배열).'),
  negatives: z.array(z.string()).describe('악재 요인.'),
  risks: z.array(z.string()).describe('주의해야 할 리스크.'),
  position: z.enum(['buy', 'neutral', 'sell']).describe('포지션 의견: 매수/중립/매도.'),
  confidence: z.number().min(0).max(100).describe('의견 신뢰도 0~100.'),
  monitoring: z.array(z.string()).describe('앞으로 모니터링할 포인트.'),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

export const ANALYSIS_SYSTEM =
  '너는 한국어 투자 분석가다. 주어진 데이터(주가·지표·뉴스·사용자 노트)만 근거로 객관적으로 분석한다. ' +
  '데이터에 없는 사실을 지어내지 않는다. 이것은 정보 제공일 뿐 투자 권유가 아니다.';

export interface AnalysisContext {
  name: string;
  ticker: string;
  market: string;
  priceLine?: string | null;
  metricsLine?: string | null;
  newsHeadlines: string[];
  notes: string[];
  lastPosition?: string | null;
}

export function analysisPrompt(ctx: AnalysisContext): string {
  const lines = [`종목: ${ctx.name} (${ctx.ticker}, ${ctx.market})`];
  if (ctx.priceLine) lines.push(`현재가: ${ctx.priceLine}`);
  if (ctx.metricsLine) lines.push(`핵심지표: ${ctx.metricsLine}`);
  lines.push(`최근 뉴스 헤드라인:\n${ctx.newsHeadlines.length ? ctx.newsHeadlines.map((h) => `- ${h}`).join('\n') : '- (없음)'}`);
  if (ctx.notes.length) lines.push(`내 노트:\n${ctx.notes.map((n) => `- ${n}`).join('\n')}`);
  if (ctx.lastPosition) lines.push(`직전 분석 포지션: ${ctx.lastPosition}`);
  lines.push('위 데이터로 투자 분석을 수행하라.');
  return lines.join('\n');
}

/** 구조화 결과 → 마크다운 (result_md 저장·표시용) */
export function analysisToMarkdown(r: AnalysisResult): string {
  const list = (arr: string[]) => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- 없음');
  const posLabel = { buy: '매수', neutral: '중립', sell: '매도' }[r.position];
  return [
    `## 주가 해석\n${r.priceInterpretation}`,
    `## 호재\n${list(r.positives)}`,
    `## 악재\n${list(r.negatives)}`,
    `## 리스크\n${list(r.risks)}`,
    `## 포지션 의견\n**${posLabel}** (신뢰도 ${r.confidence}%)`,
    `## 모니터링 포인트\n${list(r.monitoring)}`,
  ].join('\n\n');
}
