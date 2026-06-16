import { describe, it, expect } from 'vitest';
import {
  marketSchema,
  tickerSchema,
  intervalSchema,
  countSchema,
  quoteQuerySchema,
  candleQuerySchema,
  watchlistAddSchema,
  watchlistPatchSchema,
} from './market';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('tickerSchema — 정상/비정상', () => {
  it('국내 6자리·해외 영문 티커를 허용한다', () => {
    expect(tickerSchema.parse('005930')).toBe('005930');
    expect(tickerSchema.parse('AAPL')).toBe('AAPL');
    expect(tickerSchema.parse('BRK.B')).toBe('BRK.B');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(tickerSchema.parse('  AAPL  ')).toBe('AAPL');
  });

  it('주입·특수문자·과다 길이를 거부한다', () => {
    expect(tickerSchema.safeParse("005930'; DROP TABLE stocks;--").success).toBe(false);
    expect(tickerSchema.safeParse('<script>').success).toBe(false);
    expect(tickerSchema.safeParse('AA PL').success).toBe(false); // 공백 포함
    expect(tickerSchema.safeParse('').success).toBe(false);
    expect(tickerSchema.safeParse('A'.repeat(17)).success).toBe(false);
  });
});

describe('marketSchema', () => {
  it('지원 시장만 허용', () => {
    for (const m of ['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX']) {
      expect(marketSchema.safeParse(m).success).toBe(true);
    }
  });
  it('미지원 시장 거부', () => {
    expect(marketSchema.safeParse('LSE').success).toBe(false);
    expect(marketSchema.safeParse('kospi').success).toBe(false); // 대소문자 구분
    expect(marketSchema.safeParse('').success).toBe(false);
  });
});

describe('intervalSchema', () => {
  it('1m/1d/1w만 허용', () => {
    expect(intervalSchema.safeParse('1m').success).toBe(true);
    expect(intervalSchema.safeParse('1d').success).toBe(true);
    expect(intervalSchema.safeParse('1w').success).toBe(true);
    expect(intervalSchema.safeParse('1h').success).toBe(false);
    expect(intervalSchema.safeParse('5m').success).toBe(false);
  });
});

describe('countSchema — 경계값', () => {
  it('문자열 숫자를 정수로 강제하고 1~2000을 허용', () => {
    expect(countSchema.parse('120')).toBe(120);
    expect(countSchema.parse('1')).toBe(1);
    expect(countSchema.parse('2000')).toBe(2000);
  });
  it('범위 밖·비정수를 거부', () => {
    expect(countSchema.safeParse('0').success).toBe(false);
    expect(countSchema.safeParse('2001').success).toBe(false);
    expect(countSchema.safeParse('-5').success).toBe(false);
    expect(countSchema.safeParse('abc').success).toBe(false);
    expect(countSchema.safeParse('1.5').success).toBe(false);
  });
});

describe('quoteQuerySchema', () => {
  it('정상 조합 통과', () => {
    expect(quoteQuerySchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ' }).success).toBe(true);
  });
  it('market 누락·오류 거부', () => {
    expect(quoteQuerySchema.safeParse({ ticker: 'AAPL', market: 'XXX' }).success).toBe(false);
    expect(quoteQuerySchema.safeParse({ ticker: 'AAPL' }).success).toBe(false);
  });
});

describe('candleQuerySchema — count 기본값', () => {
  it('count 미지정 시 120 기본값', () => {
    const r = candleQuerySchema.parse({ ticker: '005930', market: 'KOSPI', interval: '1d' });
    expect(r.count).toBe(120);
  });
  it('count 문자열을 정수로 변환', () => {
    const r = candleQuerySchema.parse({ ticker: '005930', market: 'KOSPI', interval: '1m', count: '400' });
    expect(r.count).toBe(400);
  });
});

describe('watchlistAddSchema', () => {
  it('group_name은 선택, 30자 초과 거부', () => {
    expect(watchlistAddSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ' }).success).toBe(true);
    expect(
      watchlistAddSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', group_name: '미국기술주' }).success,
    ).toBe(true);
    expect(
      watchlistAddSchema.safeParse({ ticker: 'AAPL', market: 'NASDAQ', group_name: 'x'.repeat(31) }).success,
    ).toBe(false);
  });
});

describe('watchlistPatchSchema — favorite/reorder 판별 유니온', () => {
  it('favorite 정상 입력 통과', () => {
    expect(watchlistPatchSchema.safeParse({ action: 'favorite', stock_id: UUID, value: true }).success).toBe(true);
    expect(watchlistPatchSchema.safeParse({ action: 'favorite', stock_id: UUID, value: false }).success).toBe(true);
  });

  it('favorite 비정상 — 비uuid·value 누락·타입 오류 거부', () => {
    expect(watchlistPatchSchema.safeParse({ action: 'favorite', stock_id: 'not-uuid', value: true }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'favorite', stock_id: UUID }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'favorite', stock_id: UUID, value: 'yes' }).success).toBe(false);
  });

  it('reorder 정상 입력 통과', () => {
    expect(
      watchlistPatchSchema.safeParse({
        action: 'reorder',
        orders: [
          { stock_id: UUID, sort_order: 0 },
          { stock_id: '550e8400-e29b-41d4-a716-446655440002', sort_order: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it('reorder 비정상 — 빈 배열·100개 초과·범위 밖 sort_order·비uuid 거부', () => {
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: [] }).success).toBe(false);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ stock_id: UUID, sort_order: i }));
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: tooMany }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: [{ stock_id: UUID, sort_order: -1 }] }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: [{ stock_id: UUID, sort_order: 10000 }] }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: [{ stock_id: 'x', sort_order: 0 }] }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ action: 'reorder', orders: [{ stock_id: UUID, sort_order: 1.5 }] }).success).toBe(false);
  });

  it('알 수 없는 action 거부', () => {
    expect(watchlistPatchSchema.safeParse({ action: 'delete', stock_id: UUID }).success).toBe(false);
    expect(watchlistPatchSchema.safeParse({ stock_id: UUID, value: true }).success).toBe(false);
  });
});
