import { describe, expect, it } from 'vitest';
import { sanitizeSearchQuery } from '@/lib/providers/kis/search';

describe('sanitizeSearchQuery — 정상 케이스', () => {
  it('한글·영문·숫자·공백을 허용한다', () => {
    expect(sanitizeSearchQuery('삼성전자')).toBe('삼성전자');
    expect(sanitizeSearchQuery('Apple Inc')).toBe('Apple Inc');
    expect(sanitizeSearchQuery('005930')).toBe('005930');
    expect(sanitizeSearchQuery('  AAPL  ')).toBe('AAPL');
  });

  it('티커에 흔한 . - & 를 허용한다', () => {
    expect(sanitizeSearchQuery('BRK.B')).toBe('BRK.B');
    expect(sanitizeSearchQuery('S&P')).toBe('S&P');
  });
});

describe('sanitizeSearchQuery — 비정상·악의적 입력', () => {
  it('빈 검색어를 거부한다', () => {
    expect(() => sanitizeSearchQuery('')).toThrow(/검색어/);
    expect(() => sanitizeSearchQuery('   ')).toThrow(/검색어/);
  });

  it('과도하게 긴 검색어를 거부한다 (DoS 방지)', () => {
    expect(() => sanitizeSearchQuery('a'.repeat(51))).toThrow(/50자/);
  });

  it.each([
    "'; drop table stocks; --",
    'a,name_kr.ilike.%악성%', // PostgREST or= 필터 주입 시도
    'a)or(1.eq.1',
    '<script>alert(1)</script>',
    'a\nb',
    'a\tb',
  ])('필터 주입·제어문자를 거부한다: %s', (bad) => {
    expect(() => sanitizeSearchQuery(bad)).toThrow();
  });

  it('ilike 와일드카드(%, _)는 이스케이프한다', () => {
    // % 와 _ 는 허용 문자가 아니므로 거부됨을 확인
    expect(() => sanitizeSearchQuery('100%')).toThrow();
    expect(() => sanitizeSearchQuery('a_b')).toThrow();
  });
});
