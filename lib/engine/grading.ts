// 신호 채점 로직 (D16 Phase 3) — 종가 매수 → 익일 시초 매도 패턴의 결과 판정. 순수 함수.
// 룰 수치는 성적 데이터가 쌓이면 튜닝 대상이다 (설계서 §4 grade_signals).

import type { Signal } from '@/lib/engine/slide-schema';

/** 승패 임계 — 갭 ±1.00% (베이시스포인트) */
export const WIN_THRESHOLD_BP = 100;

export type Outcome = 'WIN' | 'LOSE' | 'NEUTRAL';

export interface GradeInput {
  signal: Signal;
  /** 신호 시점 종가 (최소 통화 단위) */
  closePrice: number;
  /** 익일 시가 (최소 통화 단위) */
  nextOpen: number;
}

/** 갭률 (bp) — (익일시가 - 당일종가) / 당일종가 */
export function gapBp(closePrice: number, nextOpen: number): number | null {
  if (!Number.isFinite(closePrice) || closePrice === 0) return null;
  return Math.round(((nextOpen - closePrice) / closePrice) * 10_000);
}

/**
 * 결과 판정.
 * BUY/HOLD는 갭업이면 WIN. AVOID는 "사지 않은 것이 옳았는가"를 보므로 갭다운이 WIN(부호 반전).
 * SELL은 보유 청산 신호라 갭업이 유리하므로 BUY와 같은 방향으로 본다.
 */
export function gradeOutcome(input: GradeInput): { gapBp: number | null; outcome: Outcome | null } {
  const gap = gapBp(input.closePrice, input.nextOpen);
  if (gap === null) return { gapBp: null, outcome: null };

  const effective = input.signal === 'AVOID' ? -gap : gap;
  if (effective >= WIN_THRESHOLD_BP) return { gapBp: gap, outcome: 'WIN' };
  if (effective <= -WIN_THRESHOLD_BP) return { gapBp: gap, outcome: 'LOSE' };
  return { gapBp: gap, outcome: 'NEUTRAL' };
}

export interface GradedRow {
  outcome: Outcome | null;
  gapBp: number | null;
}

export interface GradeStats {
  totalGraded: number;
  wins: number;
  loses: number;
  neutrals: number;
  avgGapBp: number | null;
}

export function summarize(rows: GradedRow[]): GradeStats {
  const graded = rows.filter((r) => r.outcome !== null);
  const gaps = graded.map((r) => r.gapBp).filter((g): g is number => g !== null);
  return {
    totalGraded: graded.length,
    wins: graded.filter((r) => r.outcome === 'WIN').length,
    loses: graded.filter((r) => r.outcome === 'LOSE').length,
    neutrals: graded.filter((r) => r.outcome === 'NEUTRAL').length,
    avgGapBp: gaps.length === 0 ? null : Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
  };
}
