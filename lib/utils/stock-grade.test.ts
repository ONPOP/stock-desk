import { describe, it, expect } from 'vitest';
import { countByGrade, filterByGrade, toggleGradeFilter } from './stock-grade';
import type { GradeFilter, UserStockGrade, WatchlistItem } from '@/types';

function item(stockId: string): WatchlistItem {
  return {
    stock_id: stockId,
    ticker: stockId.toUpperCase(),
    name_kr: null,
    name_en: null,
    market: 'KOSPI',
    currency: 'KRW',
    group_name: '기본',
    auto_analysis: true,
    isFavorite: false,
    sortOrder: 0,
    alwaysBrief: false,
    radarPin: false,
  };
}
const g = (stockId: string, grade: UserStockGrade['grade']): UserStockGrade => ({
  stockId,
  grade,
  reason: null,
  gradedAt: '2026-09-29T00:00:00.000Z',
});

const items = [item('a1'), item('b1'), item('c1'), item('n1')];
const grades = { a1: g('a1', 'A'), b1: g('b1', 'B'), c1: g('c1', 'C') };

describe('filterByGrade', () => {
  it('선택이 비어 있으면 전체를 순서 그대로 반환', () => {
    expect(filterByGrade(items, grades, new Set())).toEqual(items);
  });
  it('여러 등급 동시 선택', () => {
    const out = filterByGrade(items, grades, new Set<GradeFilter>(['A', 'C']));
    expect(out.map((i) => i.stock_id)).toEqual(['a1', 'c1']);
  });
  it("'none'은 등급 없는 종목만", () => {
    const out = filterByGrade(items, grades, new Set<GradeFilter>(['none']));
    expect(out.map((i) => i.stock_id)).toEqual(['n1']);
  });
  it('해당 등급이 없으면 빈 배열', () => {
    expect(filterByGrade(items, grades, new Set<GradeFilter>(['D']))).toEqual([]);
  });
});

describe('countByGrade', () => {
  it('등급별·미분류 개수', () => {
    expect(countByGrade(items, grades)).toEqual({ A: 1, B: 1, C: 1, D: 0, none: 1 });
  });
  it('맵에만 있고 현재 탭에 없는 종목은 세지 않는다', () => {
    expect(countByGrade([item('n1')], grades)).toEqual({ A: 0, B: 0, C: 0, D: 0, none: 1 });
  });
});

describe('toggleGradeFilter', () => {
  it('없으면 추가, 있으면 제거하고 원본은 바꾸지 않는다', () => {
    const base = new Set<GradeFilter>(['A']);
    const added = toggleGradeFilter(base, 'B');
    expect([...added].sort()).toEqual(['A', 'B']);
    expect([...toggleGradeFilter(added, 'A')]).toEqual(['B']);
    expect([...base]).toEqual(['A']);
  });
});
