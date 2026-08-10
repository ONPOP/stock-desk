// 슬라이드 정의 스키마 (D16) — Claude가 출력하는 analysis.json의 계약.
// pptx 파일은 만들지 않는다: 이 정의가 단일 원천이고 렌더러가 PNG로, 뷰어가 화면으로 각각 소비한다.
import { z } from 'zod';

export const signalSchema = z.enum(['BUY', 'SELL', 'HOLD', 'AVOID']);
export const confidenceSchema = z.enum(['HIGH', 'MID', 'LOW']);

/** 설계서 §6 종목 카드 */
export const stockCardSchema = z.object({
  ticker: z.string().min(1),
  name: z.string().min(1),
  market: z.string().min(1),
  signal: signalSchema,
  confidence: confidenceSchema,
  /** 제시 진입가 구간 — 최소 통화 단위 정수 */
  entryZone: z.object({ low: z.number().int(), high: z.number().int() }).nullable(),
  /** 원값 병기 필수 ("RSI 양호" 금지, "RSI 58" 형식) */
  indicatorsSummary: z.string().min(1),
  relativeStrength: z.string(),
  phase: z.string(),
  newsSummary: z.array(z.string()).max(3),
  bullCase: z.string(),
  /** 생략 금지 — 매수 논리만 있는 카드는 불량으로 본다 */
  bearCase: z.string().min(1),
  eventFlags: z.array(z.string()),
  /** 종가매수→시초매도 관점의 오버나잇 갭 요인 평가 */
  patternFit: z.string(),
});

export const marketOverviewSchema = z.object({
  summary: z.string(),
  themeFlows: z.array(
    z.object({
      theme: z.string(),
      todayBp: z.number().int().nullable(),
      trend: z.string(),
      comment: z.string(),
    }),
  ),
  macroEvents: z.array(z.string()),
});

/** 슬라이드 1장 = 뷰어의 이미지 1장 */
export const slideSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cover'),
    slotLabel: z.string(),
    runAtKst: z.string(),
    headline: z.string(),
    stats: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({
    kind: z.literal('market'),
    overview: marketOverviewSchema,
  }),
  z.object({
    kind: z.literal('stock'),
    card: stockCardSchema,
    /** 지표 스냅샷 요약 — 렌더러가 표와 차트로 그린다 */
    metrics: z.array(z.object({ label: z.string(), value: z.string() })),
    /** 일봉 종가 시계열 (최근 N봉, 최소 통화 단위) — 차트 SVG 생성용 */
    chart: z
      .object({
        closes: z.array(z.number()),
        ma20: z.array(z.number().nullable()),
        ma60: z.array(z.number().nullable()),
      })
      .nullable(),
  }),
  z.object({
    kind: z.literal('grade'),
    title: z.string(),
    rows: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['up', 'down', 'flat']) })),
    note: z.string(),
  }),
  z.object({
    kind: z.literal('radar'),
    title: z.string(),
    /** 관찰 규칙 요약 — 어떤 조건으로 뽑혔는지 슬라이드에 남긴다 */
    criteria: z.string(),
    rows: z.array(
      z.object({
        ticker: z.string(),
        name: z.string(),
        state: z.enum(['watching', 'entry_ready']),
        pinned: z.boolean(),
        disparity: z.string(),
        rsi: z.string(),
        volume: z.string(),
        sinceTouch: z.string(),
        /** Claude가 단 1~2줄 코멘트 (상위 3종목만) */
        comment: z.string().nullable(),
      }),
    ),
  }),
  z.object({
    kind: z.literal('text'),
    title: z.string(),
    bullets: z.array(z.string()),
  }),
]);

/** 관찰 종목 코멘트 — 검색 없이 스냅샷 해석만으로 1~2줄 (사용량 예산 보호) */
export const radarNoteSchema = z.object({
  ticker: z.string().min(1),
  comment: z.string().min(1),
});

/** Claude가 quick 슬롯에서 출력하는 analysis.json 전체 */
export const analysisOutputSchema = z.object({
  marketOverview: marketOverviewSchema,
  stockCards: z.array(stockCardSchema),
  // 기존 리포트에는 없던 필드라 기본값으로 호환시킨다
  radarNotes: z.array(radarNoteSchema).default([]),
  /**
   * weekly 슬롯의 signal_rules 개선 제안 (제안만 — DB는 건드리지 않는다).
   * marketOverview.summary에 섞여 들어가 시장 개요 슬라이드를 넘치게 했으므로 별도 필드로 분리했다.
   */
  ruleProposals: z.array(z.string()).default([]),
  usageNote: z.string(),
});

export type Signal = z.infer<typeof signalSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type StockCard = z.infer<typeof stockCardSchema>;
export type MarketOverview = z.infer<typeof marketOverviewSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type RadarNote = z.infer<typeof radarNoteSchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export function parseAnalysisOutput(raw: unknown): AnalysisOutput {
  return analysisOutputSchema.parse(raw);
}
