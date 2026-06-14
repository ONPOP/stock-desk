import { describe, it, expect } from 'vitest';
import { newsSummarySchema, newsSummaryPrompt } from './prompts/news-summary.v1';
import { disclosureSummaryPrompt } from './prompts/disclosure-summary.v1';
import { briefingPrompt } from './prompts/briefing.v1';
import { analysisSchema, analysisPrompt, analysisToMarkdown } from './prompts/analysis.v1';

describe('newsSummarySchema', () => {
  it('유효한 요약·감성 통과', () => {
    expect(newsSummarySchema.safeParse({ summary: '핵심 요약', sentiment: 'positive' }).success).toBe(true);
  });
  it('잘못된 감성·누락은 거부', () => {
    expect(newsSummarySchema.safeParse({ summary: 'x', sentiment: 'bullish' }).success).toBe(false);
    expect(newsSummarySchema.safeParse({ sentiment: 'neutral' }).success).toBe(false);
  });
});

describe('프롬프트 빌더', () => {
  it('뉴스 프롬프트에 제목·매체·본문 포함', () => {
    const p = newsSummaryPrompt({ title: '삼성 신고가', source: '네이버', body: '본문내용' });
    expect(p).toContain('삼성 신고가');
    expect(p).toContain('네이버');
    expect(p).toContain('본문내용');
  });
  it('공시 프롬프트에 유형 라벨 우선', () => {
    const p = disclosureSummaryPrompt({ formType: '8-K', typeLabelKr: '수시공시', title: 'Material Event' });
    expect(p).toContain('수시공시');
    expect(p).toContain('Material Event');
  });
  it('브리핑 프롬프트에 지수·뉴스·일정 섹션', () => {
    const p = briefingPrompt({
      dateLabel: '2026-06-14',
      indices: [{ label: 'KOSPI', value: 2700, changeRate: '0.5', unit: '' }],
      watchlistNews: [{ ticker: '005930', name: '삼성전자', headlines: ['신고가 경신'] }],
      events: [{ title: 'FOMC', date: '2026-06-17' }],
    });
    expect(p).toContain('2026-06-14');
    expect(p).toContain('KOSPI');
    expect(p).toContain('삼성전자');
    expect(p).toContain('FOMC');
    expect(p).toContain('## 시장 요약');
  });
  it('빈 컨텍스트도 안전하게 처리', () => {
    const p = briefingPrompt({ dateLabel: '2026-06-14', indices: [], watchlistNews: [], events: [] });
    expect(p).toContain('지수 데이터 없음');
    expect(p).toContain('등록 종목 없음');
  });
});

describe('analysis (F7)', () => {
  it('analysisSchema: position enum·confidence 범위 검증', () => {
    expect(
      analysisSchema.safeParse({
        priceInterpretation: '상승세',
        positives: ['실적 개선'],
        negatives: [],
        risks: ['금리'],
        position: 'buy',
        confidence: 70,
        monitoring: ['실적 발표'],
      }).success,
    ).toBe(true);
    expect(analysisSchema.safeParse({ priceInterpretation: 'x', positives: [], negatives: [], risks: [], position: 'hold', confidence: 50, monitoring: [] }).success).toBe(false);
    expect(analysisSchema.safeParse({ priceInterpretation: 'x', positives: [], negatives: [], risks: [], position: 'buy', confidence: 150, monitoring: [] }).success).toBe(false);
  });
  it('analysisPrompt에 종목·뉴스 포함', () => {
    const p = analysisPrompt({ name: '삼성전자', ticker: '005930', market: 'KOSPI', newsHeadlines: ['신고가'], notes: [] });
    expect(p).toContain('삼성전자');
    expect(p).toContain('신고가');
  });
  it('analysisToMarkdown: 포지션 한글 라벨·신뢰도', () => {
    const md = analysisToMarkdown({
      priceInterpretation: '횡보',
      positives: ['a'],
      negatives: [],
      risks: [],
      position: 'sell',
      confidence: 60,
      monitoring: [],
    });
    expect(md).toContain('**매도** (신뢰도 60%)');
    expect(md).toContain('## 호재');
  });
});
