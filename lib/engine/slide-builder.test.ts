import { describe, expect, it } from 'vitest';
import { buildSlides, buildTelegramSummary, type BuildSlidesInput, type SnapshotSelected } from './slide-builder';
import type { AnalysisOutput, StockCard } from './slide-schema';
import { renderSlideHtml } from './slide-html';

function selected(ticker: string): SnapshotSelected {
  return {
    ticker,
    name: ticker === '005930' ? '삼성전자' : ticker,
    market: 'KOSPI',
    score: 72.5,
    grade: 'watch',
    priceData: { currency: 'KRW', close: 71_500, changeBp: 120, volume: 1_000 },
    indicators: {
      ma: { ma20: 70_000, ma60: 69_000, ma200: 65_000 },
      rsi14: 58,
      volumeRatioBp: 14_000,
      returnsBp: { m1: 300, m3: 900, m12: 2_500 },
      disparityBp: { ma20: 214 },
    },
    chart: { closes: [100, 102, 101, 105], ma20: [null, null, 101, 102.7], ma60: [null, null, null, null] },
  };
}

function card(ticker: string, signal: StockCard['signal'] = 'BUY'): StockCard {
  return {
    ticker,
    name: ticker === '005930' ? '삼성전자' : ticker,
    market: 'KOSPI',
    signal,
    confidence: 'MID',
    entryZone: signal === 'BUY' ? { low: 71_000, high: 71_800 } : null,
    indicatorsSummary: 'RSI 58 · 20MA 이격 +2.14%',
    relativeStrength: '종목 +2.1% vs KOSPI +0.3%',
    phase: '눌림목 반등 초입',
    newsSummary: ['호재 뉴스 (출처)'],
    bullCase: '수급이 붙었다',
    bearCase: '지수 급락 시 갭다운 위험',
    eventFlags: signal === 'AVOID' ? ['당일 밤 실적발표'] : [],
    patternFit: '오버나잇 갭 기대 가능',
  };
}

function inputOf(cards: StockCard[], selectedTickers: string[], failed: string[] = []): BuildSlidesInput {
  const analysis: AnalysisOutput = {
    marketOverview: { summary: '지수 강보합', themeFlows: [], macroEvents: ['FOMC'] },
    stockCards: cards,
    radarNotes: [],
    usageNote: '검색 6회',
  };
  return {
    slotLabel: '한국 종가 매수 판단',
    runAtKst: '2026-08-04 14:50',
    analysis,
    selected: selectedTickers.map(selected),
    failedTickers: failed,
    grade: null,
  };
}

describe('buildSlides', () => {
  it('표지 → 시장 → 종목 순으로 만든다', () => {
    const slides = buildSlides(inputOf([card('005930')], ['005930']));
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'market', 'stock']);
  });

  it('스냅샷에 없는 종목 카드는 버린다 (데이터 없는 서술 방지)', () => {
    const slides = buildSlides(inputOf([card('005930'), card('999999')], ['005930']));
    expect(slides.filter((s) => s.kind === 'stock')).toHaveLength(1);
  });

  it('표지 통계에 BUY/AVOID/미수집 수를 담는다', () => {
    const slides = buildSlides(inputOf([card('005930'), card('000660', 'AVOID')], ['005930', '000660'], ['035420']));
    const cover = slides[0];
    if (cover.kind !== 'cover') throw new Error('cover 아님');
    expect(cover.stats).toEqual([
      { label: '분석 종목', value: '2' },
      { label: 'BUY', value: '1' },
      { label: 'AVOID', value: '1' },
      { label: '미수집', value: '1' },
    ]);
  });

  it('미수집 종목이 있으면 안내 슬라이드를 덧붙인다', () => {
    const slides = buildSlides(inputOf([card('005930')], ['005930'], ['NVDA']));
    expect(slides.at(-1)?.kind).toBe('text');
  });

  it('성적 요약이 있으면 성적표 슬라이드를 넣는다', () => {
    const input = inputOf([card('005930')], ['005930']);
    input.grade = { totalGraded: 10, wins: 6, loses: 3, neutrals: 1, avgGapBp: 45, note: '최근 7일' };
    const slides = buildSlides(input);
    const grade = slides.find((s) => s.kind === 'grade');
    expect(grade).toBeDefined();
    if (grade?.kind === 'grade') expect(grade.rows[1].value).toBe('60.0%');
  });

  it('BUY가 없으면 표지 헤드라인이 그렇게 말한다', () => {
    const slides = buildSlides(inputOf([card('005930', 'HOLD')], ['005930']));
    const cover = slides[0];
    if (cover.kind !== 'cover') throw new Error('cover 아님');
    expect(cover.headline).toContain('매수 후보 없음');
  });
});

describe('buildTelegramSummary', () => {
  it('BUY 후보와 주의 종목을 요약한다', () => {
    const text = buildTelegramSummary(inputOf([card('005930'), card('000660', 'AVOID')], ['005930', '000660']));
    expect(text).toContain('BUY후보: 삼성전자(MID)');
    expect(text).toContain('주의: 000660(당일 밤 실적발표)');
  });

  it('BUY가 없으면 없음으로 표기한다', () => {
    expect(buildTelegramSummary(inputOf([card('005930', 'HOLD')], ['005930']))).toContain('BUY후보: 없음');
  });
});

describe('renderSlideHtml', () => {
  it('자기완결 HTML을 만든다 (외부 리소스 참조 없음)', () => {
    const slides = buildSlides(inputOf([card('005930')], ['005930']));
    const html = renderSlideHtml(slides[0]);
    expect(html).toContain('<!doctype html>');
    expect(html).not.toMatch(/<link|<script|https?:\/\//);
  });

  it('종목 슬라이드에 차트 SVG와 원값을 담는다', () => {
    const slides = buildSlides(inputOf([card('005930')], ['005930']));
    const stock = slides.find((s) => s.kind === 'stock')!;
    const html = renderSlideHtml(stock);
    expect(html).toContain('<svg');
    expect(html).toContain('RSI 58');
    expect(html).toContain('71,500원');
  });

  it('사용자 문자열을 이스케이프한다', () => {
    const evil = card('005930');
    evil.bullCase = '<script>alert(1)</script>';
    const slides = buildSlides(inputOf([evil], ['005930']));
    const html = renderSlideHtml(slides.find((s) => s.kind === 'stock')!);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
