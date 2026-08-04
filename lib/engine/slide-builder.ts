// 슬라이드 조립 (D16) — Python 스냅샷 + Claude 판단 → 슬라이드 정의 배열.
// Claude는 슬라이드를 만들지 않는다(판단 JSON만). 구성·순서·수치 포맷은 전부 여기서 결정한다.

import type { WatchZoneRules } from '@/lib/engine/rules';
import type { AnalysisOutput, Slide, StockCard } from '@/lib/engine/slide-schema';

/** 파이프라인이 남긴 snapshot.json의 선정 종목 (렌더에 필요한 필드만) */
export interface SnapshotSelected {
  ticker: string;
  name: string;
  market: string;
  score: number;
  grade: string;
  priceData: {
    currency: 'KRW' | 'USD';
    close: number;
    changeBp: number | null;
    volume: number;
  };
  indicators: {
    ma: { ma20: number | null; ma60: number | null; ma200: number | null };
    rsi14: number | null;
    volumeRatioBp: number | null;
    returnsBp: { m1: number | null; m3: number | null; m12: number | null };
    disparityBp: { ma20: number | null };
  };
  chart: { closes: number[]; ma20: Array<number | null>; ma60: Array<number | null> } | null;
}

/** 파이프라인이 snapshot.json에 남기는 관찰 레이더 항목 */
export interface SnapshotRadar {
  ticker: string;
  name: string;
  state: 'watching' | 'entry_ready';
  pinned: boolean;
  disparityBp: number | null;
  barsSinceTouch: number | null;
  rsi14: number | null;
  volumeRatioBp: number | null;
}

export interface GradeSummary {
  totalGraded: number;
  wins: number;
  loses: number;
  neutrals: number;
  avgGapBp: number | null;
  note: string;
}

export interface BuildSlidesInput {
  slotLabel: string;
  runAtKst: string;
  analysis: AnalysisOutput;
  selected: SnapshotSelected[];
  failedTickers: string[];
  grade: GradeSummary | null;
  radar?: SnapshotRadar[];
  watchZone?: WatchZoneRules;
}

function fmtPct(bp: number | null | undefined): string {
  return bp === null || bp === undefined ? '-' : `${(bp / 100).toFixed(2)}%`;
}

function fmtMoney(minor: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW'
    ? `${minor.toLocaleString()}원`
    : `$${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 관찰 조건을 한 줄로 — 어떤 규칙으로 뽑혔는지 슬라이드에 남겨야 나중에 룰 튜닝 근거가 된다 */
function describeWatchZone(zone: WatchZoneRules | undefined): string {
  if (!zone) return '관찰 규칙 미지정';
  const base = zone.baseMa.toUpperCase();
  const trend =
    zone.trendMode === 'strict' ? '상승추세(엄격)' : zone.trendMode === 'loose' ? 'MA20 위' : '추세 무관';
  return [
    trend,
    `${base} 이격 ${(zone.minDisparityBp / 100).toFixed(1)}%~${(zone.maxDisparityBp / 100).toFixed(1)}%`,
    `RSI ${zone.rsi.min}~${zone.rsi.max}`,
    `최근 ${zone.lookbackBars}봉 내 ${base} 터치`,
  ].join(' · ');
}

/** 종목 카드 슬라이드의 좌측 지표 그리드 — 원값 병기 원칙을 렌더 단계에서도 강제 */
function metricsOf(s: SnapshotSelected): Array<{ label: string; value: string }> {
  const cur = s.priceData.currency;
  return [
    { label: '종가', value: fmtMoney(s.priceData.close, cur) },
    { label: '전일대비', value: fmtPct(s.priceData.changeBp) },
    { label: 'RSI14', value: s.indicators.rsi14 === null ? '-' : String(s.indicators.rsi14) },
    {
      label: '거래량 20일比',
      value: s.indicators.volumeRatioBp === null ? '-' : `${(s.indicators.volumeRatioBp / 10_000).toFixed(2)}배`,
    },
    { label: 'MA20 이격', value: fmtPct(s.indicators.disparityBp.ma20) },
    { label: 'MA200', value: s.indicators.ma.ma200 === null ? '-' : fmtMoney(s.indicators.ma.ma200, cur) },
    { label: '1M / 3M', value: `${fmtPct(s.indicators.returnsBp.m1)} / ${fmtPct(s.indicators.returnsBp.m3)}` },
    { label: '12M', value: fmtPct(s.indicators.returnsBp.m12) },
    { label: '신호 점수', value: `${s.score} (${s.grade})` },
  ];
}

/**
 * 슬라이드 구성 — 표지 → 시장 개요 → 종목 카드(최대 8) → 성적표.
 * Claude 카드에 대응하는 스냅샷이 없으면 그 카드는 버린다(데이터 없는 서술 방지).
 */
export function buildSlides(input: BuildSlidesInput): Slide[] {
  const byTicker = new Map(input.selected.map((s) => [s.ticker, s]));
  const cards = input.analysis.stockCards.filter((c): c is StockCard => byTicker.has(c.ticker));

  const buyList = cards.filter((c) => c.signal === 'BUY').map((c) => c.name);
  const avoidList = cards.filter((c) => c.signal === 'AVOID').map((c) => c.name);

  const slides: Slide[] = [
    {
      kind: 'cover',
      slotLabel: input.slotLabel,
      runAtKst: input.runAtKst,
      headline:
        buyList.length > 0
          ? `종가 매수 후보 ${buyList.length}종목 — ${buyList.join(', ')}`
          : '이번 슬롯 매수 후보 없음',
      stats: [
        { label: '분석 종목', value: String(cards.length) },
        { label: 'BUY', value: String(buyList.length) },
        { label: 'AVOID', value: String(avoidList.length) },
        { label: '미수집', value: String(input.failedTickers.length) },
      ],
    },
    { kind: 'market', overview: input.analysis.marketOverview },
  ];

  for (const card of cards) {
    const snap = byTicker.get(card.ticker)!;
    slides.push({ kind: 'stock', card, metrics: metricsOf(snap), chart: snap.chart });
  }

  const radar = input.radar ?? [];
  if (radar.length > 0) {
    const notes = new Map(input.analysis.radarNotes.map((n) => [n.ticker, n.comment]));
    slides.push({
      kind: 'radar',
      title: '눌림목 관찰',
      criteria: describeWatchZone(input.watchZone),
      rows: radar.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        state: r.state,
        pinned: r.pinned,
        disparity: fmtPct(r.disparityBp),
        rsi: r.rsi14 === null ? '-' : String(r.rsi14),
        volume: r.volumeRatioBp === null ? '-' : `${(r.volumeRatioBp / 10_000).toFixed(2)}배`,
        sinceTouch: r.barsSinceTouch === null ? '-' : r.barsSinceTouch === 0 ? '당일' : `${r.barsSinceTouch}일 전`,
        comment: notes.get(r.ticker) ?? null,
      })),
    });
  }

  if (input.grade) {
    const g = input.grade;
    const hitRate = g.totalGraded > 0 ? ((g.wins / g.totalGraded) * 100).toFixed(1) : '-';
    slides.push({
      kind: 'grade',
      title: '신호 성적표',
      rows: [
        { label: '채점 완료', value: String(g.totalGraded), tone: 'flat' },
        { label: '적중률', value: `${hitRate}%`, tone: g.wins >= g.loses ? 'up' : 'down' },
        { label: 'WIN / LOSE', value: `${g.wins} / ${g.loses}`, tone: g.wins >= g.loses ? 'up' : 'down' },
        { label: '평균 갭', value: fmtPct(g.avgGapBp), tone: (g.avgGapBp ?? 0) >= 0 ? 'up' : 'down' },
      ],
      note: g.note,
    });
  }

  if (input.failedTickers.length > 0) {
    slides.push({
      kind: 'text',
      title: '데이터 미수집',
      bullets: [
        `${input.failedTickers.length}종목의 시세를 가져오지 못해 분석에서 제외했습니다.`,
        input.failedTickers.join(', '),
      ],
    });
  }

  return slides;
}

/** 텔레그램 3줄 요약 (설계서 §4 notify) */
export function buildTelegramSummary(input: BuildSlidesInput): string {
  const cards = input.analysis.stockCards;
  const buy = cards.filter((c) => c.signal === 'BUY');
  const avoid = cards.filter((c) => c.signal === 'AVOID');

  const lines = [
    `[${input.slotLabel}] ${input.runAtKst} KST · 선정 ${cards.length}종목`,
    buy.length > 0
      ? `BUY후보: ${buy.map((c) => `${c.name}(${c.confidence})`).join(', ')}`
      : 'BUY후보: 없음',
  ];
  if (avoid.length > 0) {
    lines.push(`주의: ${avoid.map((c) => `${c.name}${c.eventFlags[0] ? `(${c.eventFlags[0]})` : ''}`).join(', ')}`);
  }
  const entryReady = (input.radar ?? []).filter((r) => r.state === 'entry_ready');
  if (entryReady.length > 0) lines.push(`관찰(진입임박): ${entryReady.map((r) => r.name).join(', ')}`);
  if (input.failedTickers.length > 0) lines.push(`미수집: ${input.failedTickers.join(', ')}`);
  return lines.join('\n');
}
