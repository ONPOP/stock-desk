// 눌림목 관찰 레이더 (D16) — 점수 상위 진입 후보와 '별개 트랙'.
//
// scorer의 pullback은 '터치 후 반등 완료'만 잡아 진입 시점 판정이다. 반면 사용자가 보고 싶은 건
// "상승 추세인데 지금 밀리고 있어 지켜봐야 할 종목"이라, 반등 전 상태까지 포함해 따로 뽑는다.
//
// 스냅샷의 touchBarsAgo·disparityBp만으로 평가하므로 시세 재조회 없이 규칙 미리보기가 가능하다.

import type { WatchZoneRules } from '@/lib/engine/rules';
import type { ScoredStock } from '@/lib/engine/scorer';
import type { StockSnapshot } from '@/lib/engine/types';

/** watching = 눌림 진행 중(반등 전) · entry_ready = MA10 회복(진입 임박) */
export type RadarState = 'watching' | 'entry_ready';

export interface RadarEntry {
  snapshot: StockSnapshot;
  state: RadarState;
  /** 기준선 대비 이격률 (bp) */
  disparityBp: number | null;
  /** 기준선을 마지막으로 터치한 시점 (몇 봉 전) */
  barsSinceTouch: number | null;
  /** 조건과 무관하게 사용자가 고정한 종목 */
  pinned: boolean;
}

function stateOf(snapshot: StockSnapshot): RadarState {
  return snapshot.indicators.recoveredAboveMa10 ? 'entry_ready' : 'watching';
}

/** 추세 게이트 — 판정 강도는 규칙이 정한다 */
function passesTrend(snapshot: StockSnapshot, zone: WatchZoneRules): boolean {
  const ind = snapshot.indicators;
  if (zone.trendMode === 'off') return true;
  if (zone.trendMode === 'strict') return ind.phase.uptrend;
  // loose — 종가가 MA20 위이기만 하면 된다 (이격률 부호로 판정)
  return (ind.disparityBp.ma20 ?? -1) > 0;
}

/** 규칙 조건 충족 여부. 고정 종목은 이 판정을 건너뛴다 */
function matchesZone(snapshot: StockSnapshot, zone: WatchZoneRules): boolean {
  const ind = snapshot.indicators;
  if (!passesTrend(snapshot, zone)) return false;

  const bars = ind.touchBarsAgo[zone.baseMa];
  if (bars === null || bars >= zone.lookbackBars) return false;

  const disparity = ind.disparityBp[zone.baseMa];
  if (disparity === null) return false;
  if (disparity < zone.minDisparityBp || disparity > zone.maxDisparityBp) return false;

  if (ind.rsi14 === null) return false;
  if (ind.rsi14 < zone.rsi.min || ind.rsi14 > zone.rsi.max) return false;

  return true;
}

export interface RadarInput {
  /** 채점된 전 종목 */
  scored: ScoredStock[];
  zone: WatchZoneRules;
  /** 사용자가 관찰 고정한 stock_id */
  pinnedStockIds: Set<string>;
  /** 이미 정식 분석 대상으로 선정된 stock_id — 중복 노출을 피한다 */
  selectedStockIds: Set<string>;
}

/**
 * 관찰 대상 선정.
 * 고정 종목을 앞에 두고, 나머지는 '더 많이 눌린 순'(기준선 이격 오름차순)으로 정렬한다.
 * 진입 후보 8종목에 이미 든 종목은 제외한다 — 그쪽은 카드 슬라이드로 훨씬 자세히 다뤄진다.
 */
export function selectRadar(input: RadarInput): RadarEntry[] {
  if (!input.zone.enabled) return [];

  const entries: RadarEntry[] = [];
  for (const s of input.scored) {
    const stockId = s.snapshot.stock.stockId;
    if (input.selectedStockIds.has(stockId)) continue;

    const pinned = input.pinnedStockIds.has(stockId);
    if (!pinned && !matchesZone(s.snapshot, input.zone)) continue;

    entries.push({
      snapshot: s.snapshot,
      state: stateOf(s.snapshot),
      disparityBp: s.snapshot.indicators.disparityBp[input.zone.baseMa],
      barsSinceTouch: s.snapshot.indicators.touchBarsAgo[input.zone.baseMa],
      pinned,
    });
  }

  entries.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (a.disparityBp ?? 0) - (b.disparityBp ?? 0);
  });

  return entries.slice(0, input.zone.maxCount);
}

/** Claude에게 코멘트를 맡길 상위 종목 — 사용량 예산을 지키기 위해 소수만 넘긴다 */
export const RADAR_COMMENT_LIMIT = 3;

export function radarCommentTargets(entries: RadarEntry[]): RadarEntry[] {
  // 진입임박 상태를 우선한다 — 판단이 실제로 필요한 시점에 가깝다
  const ordered = [...entries].sort((a, b) => {
    if (a.state !== b.state) return a.state === 'entry_ready' ? -1 : 1;
    return (a.disparityBp ?? 0) - (b.disparityBp ?? 0);
  });
  return ordered.slice(0, RADAR_COMMENT_LIMIT);
}
