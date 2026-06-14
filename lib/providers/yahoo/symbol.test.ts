import { describe, it, expect } from 'vitest';
import { currencyOf, fromYahooSymbol, toYahooSymbol } from './symbol';

describe('toYahooSymbol', () => {
  it('국내 종목에 거래소 접미사를 붙인다', () => {
    expect(toYahooSymbol('005930', 'KOSPI')).toBe('005930.KS');
    expect(toYahooSymbol('035720', 'KOSDAQ')).toBe('035720.KQ');
  });

  it('미국 종목은 접미사 없이 그대로 둔다', () => {
    expect(toYahooSymbol('AAPL', 'NASDAQ')).toBe('AAPL');
    expect(toYahooSymbol('IBM', 'NYSE')).toBe('IBM');
  });
});

describe('fromYahooSymbol', () => {
  it('접미사로 한국 시장을 확정한다 (거래소 코드보다 우선)', () => {
    expect(fromYahooSymbol('005930.KS', 'KSC')).toEqual({ ticker: '005930', market: 'KOSPI' });
    expect(fromYahooSymbol('000660.KQ')).toEqual({ ticker: '000660', market: 'KOSDAQ' });
  });

  it('미국은 거래소 코드로 시장을 판별한다', () => {
    expect(fromYahooSymbol('AAPL', 'NMS')).toEqual({ ticker: 'AAPL', market: 'NASDAQ' });
    expect(fromYahooSymbol('IBM', 'NYQ')).toEqual({ ticker: 'IBM', market: 'NYSE' });
    expect(fromYahooSymbol('SPCE', 'ASE')).toEqual({ ticker: 'SPCE', market: 'AMEX' });
  });

  it('지원하지 않는 거래소는 null을 반환한다', () => {
    expect(fromYahooSymbol('BTC-USD', 'CCC')).toBeNull(); // 암호화폐
    expect(fromYahooSymbol('VOD.L', 'LSE')).toBeNull(); // 런던
    expect(fromYahooSymbol('TM', undefined)).toBeNull(); // 거래소 정보 없음
  });
});

describe('currencyOf', () => {
  it('시장에 맞는 통화를 반환한다', () => {
    expect(currencyOf('KOSPI')).toBe('KRW');
    expect(currencyOf('KOSDAQ')).toBe('KRW');
    expect(currencyOf('NASDAQ')).toBe('USD');
    expect(currencyOf('NYSE')).toBe('USD');
    expect(currencyOf('AMEX')).toBe('USD');
  });
});
