// 슬롯 스코어러 (D16) — 지표 스냅샷 + 신호 규칙 → 종목별 점수와 분석 대상 선정.
// D15 lib/trading/strategy.ts(인트라데이 진입/청산)와는 목적이 다르다: 여기는 종가 매수 후보 랭킹.
// 순수 함수 — 시세 조회·DB 접근 없음.

import { regionOf } from '@/lib/utils/market-hours';
import type { SignalRules } from '@/lib/engine/rules';
import type { StockSnapshot } from '@/lib/engine/types';

/** 스코어링에 필요한, 지표 외 컨텍스트 */
export interface ScoreContext {
  /** 당일 밤 실적발표 등 BUY 회피 이벤트 (calendar_events에서 조회) */
  earningsTonight: boolean;
  /** KR 수급: 14시 이후 외인+기관 합산 순매수 여부. 미수집이면 null */
  netBuyKr: boolean | null;
}

export interface ScoreItem {
  key: string;
  weight: number;
  matched: boolean;
  /** 판정 근거 — 슬라이드와 Claude 프롬프트에 그대로 노출된다 */
  note: string;
}

export interface ScoreDetail {
  items: ScoreItem[];
  /** 이 종목에 적용 가능한 가중치 합 (US는 flowKr 제외) */
  applicableWeight: number;
  earnedWeight: number;
  excluded: string[];
}

export type ScoreGrade = 'strong_buy' | 'watch' | 'none';

export interface ScoredStock {
  snapshot: StockSnapshot;
  /** 0~100, 소수 2자리 */
  score: number;
  grade: ScoreGrade;
  detail: ScoreDetail;
}

function item(key: string, weight: number, matched: boolean, note: string): ScoreItem {
  return { key, weight, matched, note };
}

/** bp를 사람이 읽는 % 문자열로 (노트용) */
function pct(bp: number | null): string {
  return bp === null ? 'n/a' : `${(bp / 100).toFixed(2)}%`;
}

/** 하드 제외 조건 — 해당되면 점수와 무관하게 BUY 후보에서 뺀다 */
function hardExclusions(
  snapshot: StockSnapshot,
  rules: SignalRules,
  ctx: ScoreContext,
): string[] {
  const { indicators, priceData } = snapshot;
  const ex = rules.closeBuy.excludeHard;
  const out: string[] = [];

  if (ex.earningsTonight && ctx.earningsTonight) out.push('당일 밤 실적발표');

  if (ex.belowMa200AndBear) {
    const below = indicators.ma.ma200 !== null && priceData.close < indicators.ma.ma200;
    if (below && indicators.alignment === 'bear') out.push('MA200 하회 + 역배열');
  }

  if (priceData.changeBp !== null && priceData.changeBp <= ex.dailyCrashBp) {
    out.push(`당일 급락 ${pct(priceData.changeBp)}`);
  }

  return out;
}

/**
 * 종목 1개 채점.
 * 점수는 (획득 가중치 / 적용 가능 가중치) × 100 — KR/US가 같은 척도에서 비교되도록 정규화한다
 * (US는 수급 데이터가 없어 flowKr 가중치를 분모에서 뺀다).
 */
export function scoreStock(
  snapshot: StockSnapshot,
  rules: SignalRules,
  ctx: ScoreContext,
): ScoredStock {
  const r = rules.closeBuy;
  const { indicators } = snapshot;
  const isKr = regionOf(snapshot.stock.market) === 'KR';
  const items: ScoreItem[] = [];

  items.push(
    item(
      'trend',
      r.trend.weight,
      indicators.phase.uptrend,
      `20MA 위 + 20MA(5일) ${pct(indicators.slopeBp.ma20_5d)} · 60MA(20일) ${pct(indicators.slopeBp.ma60_20d)}`,
    ),
  );

  items.push(
    item(
      'pullback',
      r.pullback.weight,
      indicators.phase.pullback,
      indicators.phase.pullback ? '10MA 터치 후 종가 반등' : '눌림목 아님',
    ),
  );

  const rsiOk =
    indicators.rsi14 !== null && indicators.rsi14 >= r.rsi.minRsi && indicators.rsi14 <= r.rsi.maxRsi;
  items.push(
    item(
      'rsi',
      r.rsi.weight,
      rsiOk,
      `RSI ${indicators.rsi14 ?? 'n/a'} (기준 ${r.rsi.minRsi}~${r.rsi.maxRsi})`,
    ),
  );

  const volOk = indicators.volumeRatioBp !== null && indicators.volumeRatioBp >= r.volume.minRatioBp;
  items.push(
    item(
      'volume',
      r.volume.weight,
      volOk,
      `거래량 20일比 ${indicators.volumeRatioBp === null ? 'n/a' : `${(indicators.volumeRatioBp / 10_000).toFixed(2)}배`}`,
    ),
  );

  // 수급은 KR 전용. 미국 종목은 항목 자체를 넣지 않아 분모에서도 빠진다.
  if (isKr) {
    const flowOk = ctx.netBuyKr === true;
    items.push(
      item(
        'flowKr',
        r.flowKr.weight,
        flowOk,
        ctx.netBuyKr === null ? '수급 미수집' : flowOk ? '외인+기관 순매수' : '외인+기관 순매도',
      ),
    );
  }

  const closeOk =
    indicators.closePositionBp !== null &&
    indicators.closePositionBp >= r.closeStrength.minPositionBp;
  items.push(
    item(
      'closeStrength',
      r.closeStrength.weight,
      closeOk,
      `종가 위치 ${indicators.closePositionBp === null ? 'n/a' : `상위 ${((10_000 - indicators.closePositionBp) / 100).toFixed(0)}%`}`,
    ),
  );

  const applicableWeight = items.reduce((s, it) => s + it.weight, 0);
  const earnedWeight = items.reduce((s, it) => s + (it.matched ? it.weight : 0), 0);
  const excluded = hardExclusions(snapshot, rules, ctx);

  const raw = applicableWeight === 0 ? 0 : (earnedWeight / applicableWeight) * 100;
  const score = excluded.length > 0 ? 0 : Math.round(raw * 100) / 100;

  let grade: ScoreGrade = 'none';
  if (excluded.length === 0) {
    if (score >= rules.scoreThreshold.strongBuy) grade = 'strong_buy';
    else if (score >= rules.scoreThreshold.watch) grade = 'watch';
  }

  return {
    snapshot,
    score,
    grade,
    detail: { items, applicableWeight, earnedWeight, excluded },
  };
}

export interface SelectionResult {
  selected: ScoredStock[];
  /** 예산(maxStocks)에 밀려 잘린 종목 — 호출부가 로그·리포트에 남긴다(조용한 절삭 금지) */
  dropped: ScoredStock[];
}

/**
 * 슬롯 분석 대상 선정.
 * always_brief 종목을 먼저 채우고 남은 자리를 점수 상위로 채운다 (설계서 §4 scorer).
 * always_brief만으로 예산을 넘으면 그중 점수 상위로 자르고 나머지를 dropped로 보고한다.
 */
export function selectForSlot(scored: ScoredStock[], maxStocks: number): SelectionResult {
  if (maxStocks < 1) throw new Error('maxStocks는 1 이상이어야 합니다.');

  const byScoreDesc = (a: ScoredStock, b: ScoredStock) => b.score - a.score;
  const pinned = scored.filter((s) => s.snapshot.stock.alwaysBrief).sort(byScoreDesc);
  const rest = scored.filter((s) => !s.snapshot.stock.alwaysBrief).sort(byScoreDesc);

  const selected = pinned.slice(0, maxStocks);
  const room = maxStocks - selected.length;
  // 점수 0(하드 제외)인 종목까지 자리를 채우지는 않는다 — 예산을 무의미하게 소모한다.
  const fillers = rest.filter((s) => s.score > 0).slice(0, room);
  selected.push(...fillers);

  const selectedSet = new Set(selected);
  const dropped = scored.filter((s) => !selectedSet.has(s));

  return { selected, dropped };
}
