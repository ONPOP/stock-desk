import { describe, expect, it } from 'vitest';
import { MARKET_BUDGET, applyMarketBudget } from './slide-budget';
import type { MarketOverview } from './slide-schema';

function overview(patch: Partial<MarketOverview> = {}): MarketOverview {
  return {
    summary: '코스피는 소폭 하락했다. 외국인이 순매도했다.',
    themeFlows: [{ theme: '반도체', todayBp: 120, trend: '강세', comment: '수급 유입' }],
    macroEvents: ['08-12 미국 CPI 발표'],
    ...patch,
  };
}

describe('applyMarketBudget', () => {
  it('예산 이내의 개요는 그대로 통과시킨다', () => {
    const input = overview();
    expect(applyMarketBudget(input)).toEqual(input);
  });

  it('요약이 상한을 넘으면 문장 경계에서 끊는다', () => {
    const sentence = '코스피는 외국인 순매도에 밀려 하락 반전했다. ';
    const long = sentence.repeat(60);
    const out = applyMarketBudget(overview({ summary: long }));

    expect(out.summary.length).toBeLessThanOrEqual(MARKET_BUDGET.summaryChars);
    expect(out.summary).toMatch(/했다\.$/);
  });

  it('문장 경계가 없으면 글자 수로 끊고 말줄임을 붙인다', () => {
    const out = applyMarketBudget(overview({ summary: '가'.repeat(MARKET_BUDGET.summaryChars + 100) }));

    expect(out.summary.length).toBeLessThanOrEqual(MARKET_BUDGET.summaryChars);
    expect(out.summary.endsWith('…')).toBe(true);
  });

  it('테마 행이 상한을 넘으면 마지막 행을 남은 건수 표시로 대체한다', () => {
    const rows = Array.from({ length: MARKET_BUDGET.themeRows + 4 }, (_, i) => ({
      theme: `테마${i}`,
      todayBp: 0,
      trend: '보합',
      comment: '',
    }));
    const out = applyMarketBudget(overview({ themeFlows: rows }));

    expect(out.themeFlows).toHaveLength(MARKET_BUDGET.themeRows);
    expect(out.themeFlows.at(-1)?.theme).toBe('외 5건');
    // 표시 건수 = 잘려나간 원본 행수(마지막 자리를 표시로 쓰므로 +1)
    expect(out.themeFlows.at(-2)?.theme).toBe(`테마${MARKET_BUDGET.themeRows - 2}`);
  });

  it('매크로 항목이 상한을 넘으면 마지막 항목을 남은 건수 표시로 대체한다', () => {
    const items = Array.from({ length: MARKET_BUDGET.macroRows + 3 }, (_, i) => `이벤트${i}`);
    const out = applyMarketBudget(overview({ macroEvents: items }));

    expect(out.macroEvents).toHaveLength(MARKET_BUDGET.macroRows);
    expect(out.macroEvents.at(-1)).toBe('외 4건');
  });

  it('테마 행의 각 필드도 상한으로 자른다', () => {
    const out = applyMarketBudget(
      overview({
        themeFlows: [
          {
            theme: '가'.repeat(200),
            todayBp: 100,
            trend: '나'.repeat(200),
            comment: '다'.repeat(400),
          },
        ],
      }),
    );

    const row = out.themeFlows[0]!;
    expect(row.theme.length).toBeLessThanOrEqual(MARKET_BUDGET.themeNameChars);
    expect(row.trend.length).toBeLessThanOrEqual(MARKET_BUDGET.themeTrendChars);
    expect(row.comment.length).toBeLessThanOrEqual(MARKET_BUDGET.themeCommentChars);
    expect(row.todayBp).toBe(100);
  });

  it('매크로 항목 본문도 상한으로 자른다', () => {
    const out = applyMarketBudget(overview({ macroEvents: ['라'.repeat(500)] }));

    expect(out.macroEvents[0]!.length).toBeLessThanOrEqual(MARKET_BUDGET.macroItemChars);
  });

  it('빈 개요를 받아도 실패하지 않는다', () => {
    const out = applyMarketBudget({ summary: '', themeFlows: [], macroEvents: [] });

    expect(out).toEqual({ summary: '', themeFlows: [], macroEvents: [] });
  });
});
