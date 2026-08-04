import { describe, expect, it } from 'vitest';
import { gapBp, gradeOutcome, summarize } from './grading';

describe('gapBp', () => {
  it('갭률을 bp로 계산한다', () => {
    expect(gapBp(10_000, 10_200)).toBe(200);
    expect(gapBp(10_000, 9_850)).toBe(-150);
  });

  it('기준가가 0이면 null', () => {
    expect(gapBp(0, 100)).toBeNull();
  });
});

describe('gradeOutcome', () => {
  it('BUY는 갭업이면 WIN, 갭다운이면 LOSE', () => {
    expect(gradeOutcome({ signal: 'BUY', closePrice: 10_000, nextOpen: 10_150 }).outcome).toBe('WIN');
    expect(gradeOutcome({ signal: 'BUY', closePrice: 10_000, nextOpen: 9_850 }).outcome).toBe('LOSE');
  });

  it('임계 안쪽은 NEUTRAL', () => {
    expect(gradeOutcome({ signal: 'BUY', closePrice: 10_000, nextOpen: 10_050 }).outcome).toBe('NEUTRAL');
  });

  it('AVOID는 부호가 반대다 — 갭다운이면 회피가 옳았다', () => {
    expect(gradeOutcome({ signal: 'AVOID', closePrice: 10_000, nextOpen: 9_800 }).outcome).toBe('WIN');
    expect(gradeOutcome({ signal: 'AVOID', closePrice: 10_000, nextOpen: 10_300 }).outcome).toBe('LOSE');
  });

  it('정확히 임계값이면 WIN/LOSE로 판정한다', () => {
    expect(gradeOutcome({ signal: 'BUY', closePrice: 10_000, nextOpen: 10_100 }).outcome).toBe('WIN');
    expect(gradeOutcome({ signal: 'BUY', closePrice: 10_000, nextOpen: 9_900 }).outcome).toBe('LOSE');
  });

  it('기준가가 0이면 판정 불가', () => {
    expect(gradeOutcome({ signal: 'BUY', closePrice: 0, nextOpen: 100 }).outcome).toBeNull();
  });
});

describe('summarize', () => {
  it('미채점 건은 집계에서 제외한다', () => {
    const stats = summarize([
      { outcome: 'WIN', gapBp: 200 },
      { outcome: 'LOSE', gapBp: -300 },
      { outcome: 'NEUTRAL', gapBp: 50 },
      { outcome: null, gapBp: null },
    ]);
    expect(stats.totalGraded).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.loses).toBe(1);
    expect(stats.neutrals).toBe(1);
    // (200 - 300 + 50) / 3 = -16.67 → -17
    expect(stats.avgGapBp).toBe(-17);
  });

  it('빈 입력은 0건·평균 null', () => {
    expect(summarize([])).toEqual({ totalGraded: 0, wins: 0, loses: 0, neutrals: 0, avgGapBp: null });
  });
});
