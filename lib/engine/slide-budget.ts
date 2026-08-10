// 슬라이드 분량 예산 — 한 장(1600×900) 안에서 다 보이게 하는 상한.
//
// marketOverview는 LLM 출력이 그대로 슬라이드에 들어가는데 어떤 필드에도 상한이 없었다.
// 2026-08-08 weekly_review에서 summary 1,975자 · 테마 6행 · 매크로 12항목이 동시에 겹쳐
// 렌더러의 축소 하한(0.5)까지 줄여도 내용이 잘렸다.
//
// 상한은 실측으로 정했다(운영 산출물 17건을 실제 렌더러에 태워 맞춤 배율 측정):
//   상한 없음 → 최저 배율 50% · 잘림 1건
//   이 상한   → 최저 배율 68% · 잘림 0건
// 더 조여도 배율은 거의 오르지 않는다(66%). 바닥을 정하는 건 글자 수가 아니라 레이아웃이므로
// 정보를 더 버리는 대신 여기서 멈춘다.
import type { MarketOverview } from './slide-schema';

export const MARKET_BUDGET = {
  summaryChars: 800,
  themeRows: 10,
  themeNameChars: 28,
  themeTrendChars: 44,
  themeCommentChars: 110,
  macroRows: 10,
  macroItemChars: 110,
} as const;

/** 문장 경계를 이만큼은 지나야 문장 단위로 끊는다 — 너무 앞에서 끊으면 내용이 통째로 날아간다 */
const SENTENCE_CUT_FLOOR = 0.6;

/** 서술형 텍스트 — 가능하면 문장 끝에서 끊고, 아니면 글자 수로 끊는다 */
function clipSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  let lastEnd = -1;
  for (let i = head.length - 1; i >= 0; i--) {
    if (head[i] === '.' || head[i] === '!' || head[i] === '?') {
      lastEnd = i;
      break;
    }
  }
  if (lastEnd >= max * SENTENCE_CUT_FLOOR) return head.slice(0, lastEnd + 1).trimEnd();
  return `${head.slice(0, max - 1).trimEnd()}…`;
}

/** 라벨·한 줄 항목 — 문장이 아니므로 글자 수로만 끊는다 */
function clipLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * 목록을 상한까지 줄이되 버린 건수를 마지막 자리에 남긴다.
 * 조용히 잘라내면 슬라이드만 보는 사람은 그게 전부인 줄 안다.
 */
function limitRows<T>(rows: readonly T[], max: number, note: (dropped: number) => T): T[] {
  if (rows.length <= max) return [...rows];
  const kept = rows.slice(0, max - 1);
  return [...kept, note(rows.length - kept.length)];
}

/** 시장 개요를 한 장에 들어가는 분량으로 줄인다. 원본은 analysis_reports에 그대로 남는다. */
export function applyMarketBudget(overview: MarketOverview): MarketOverview {
  return {
    summary: clipSentence(overview.summary, MARKET_BUDGET.summaryChars),
    themeFlows: limitRows(
      overview.themeFlows.map((t) => ({
        theme: clipLabel(t.theme, MARKET_BUDGET.themeNameChars),
        todayBp: t.todayBp,
        trend: clipLabel(t.trend, MARKET_BUDGET.themeTrendChars),
        comment: clipLabel(t.comment, MARKET_BUDGET.themeCommentChars),
      })),
      MARKET_BUDGET.themeRows,
      (dropped) => ({ theme: `외 ${dropped}건`, todayBp: null, trend: '', comment: '' }),
    ),
    macroEvents: limitRows(
      overview.macroEvents.map((e) => clipLabel(e, MARKET_BUDGET.macroItemChars)),
      MARKET_BUDGET.macroRows,
      (dropped) => `외 ${dropped}건`,
    ),
  };
}
