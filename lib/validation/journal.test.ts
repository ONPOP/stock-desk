import { describe, it, expect } from 'vitest';
import { goalInputSchema, monthOverrideSchema, ruleCreateSchema, ruleReorderSchema } from './journal';

describe('ruleCreateSchema', () => {
  it('앞뒤 공백을 자르고 빈 규칙은 거부', () => {
    expect(ruleCreateSchema.parse({ content: '  손절 -3%  ' }).content).toBe('손절 -3%');
    expect(ruleCreateSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(ruleCreateSchema.safeParse({ content: 'a'.repeat(301) }).success).toBe(false);
  });
  it('순서 변경은 uuid 목록만', () => {
    expect(ruleReorderSchema.safeParse({ ids: ['x'] }).success).toBe(false);
  });
});

describe('goalInputSchema', () => {
  it('월 목표는 10진 문자열 수익률과 YYYY-MM', () => {
    expect(goalInputSchema.safeParse({ kind: 'monthly', ratePct: '3.5', effectiveMonth: '2026-09' }).success).toBe(true);
    expect(goalInputSchema.safeParse({ kind: 'monthly', ratePct: '0', effectiveMonth: '2026-09' }).success).toBe(false);
    expect(goalInputSchema.safeParse({ kind: 'monthly', ratePct: '-1', effectiveMonth: '2026-09' }).success).toBe(false);
    expect(goalInputSchema.safeParse({ kind: 'monthly', ratePct: '3', effectiveMonth: '2026-13' }).success).toBe(false);
  });
  it('연 목표는 1월에만 적용', () => {
    expect(goalInputSchema.safeParse({ kind: 'yearly', ratePct: '30', effectiveMonth: '2026-01' }).success).toBe(true);
    expect(goalInputSchema.safeParse({ kind: 'yearly', ratePct: '30', effectiveMonth: '2026-09' }).success).toBe(false);
  });
});

describe('monthOverrideSchema', () => {
  it('원 단위 정수 또는 null(자동값 복귀)', () => {
    expect(monthOverrideSchema.safeParse({ month: '2026-09', startOverride: 10_000_000 }).success).toBe(true);
    expect(monthOverrideSchema.safeParse({ month: '2026-09', startOverride: null }).success).toBe(true);
    expect(monthOverrideSchema.safeParse({ month: '2026-09', startOverride: 1.5 }).success).toBe(false);
  });
});
