import { describe, it, expect } from 'vitest';
import { padCik, parseCompanyTickers } from './cik';

describe('padCik', () => {
  it('10자리 zero-pad', () => {
    expect(padCik(320193)).toBe('0000320193');
    expect(padCik('320193')).toBe('0000320193');
    expect(padCik('0000320193')).toBe('0000320193');
  });
});

describe('parseCompanyTickers', () => {
  it('티커 대문자화 + CIK pad', () => {
    const entries = parseCompanyTickers({
      '0': { cik_str: 320193, ticker: 'aapl', title: 'Apple Inc.' },
      '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ ticker: 'AAPL', cik: '0000320193' });
  });

  it('필드 누락 항목은 제외', () => {
    const entries = parseCompanyTickers({
      '0': { ticker: 'AAPL' }, // cik_str 없음
      '1': { cik_str: 789019 }, // ticker 없음
      '2': { cik_str: 1, ticker: 'X' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].ticker).toBe('X');
  });
});
