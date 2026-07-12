import { describe, it, expect } from 'vitest';
import {
  strategyParamsSchema,
  strategyParamsPartialSchema,
  tradingPatchSchema,
  universeSchema,
  backtestRequestSchema,
  orderbookQuerySchema,
} from './trading';
import { DEFAULT_PARAMS } from '@/lib/trading/strategy';

describe('strategyParamsSchema — 조작 페이로드 차단', () => {
  it('기본 파라미터는 유효하다', () => {
    expect(strategyParamsSchema.safeParse(DEFAULT_PARAMS).success).toBe(true);
  });
  it('fast >= slow 거부 (부분 변경 병합 우회 포함)', () => {
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, macdFast: 26 }).success).toBe(false);
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, macdFast: 40 }).success).toBe(false);
  });
  it('RSI 하한 >= 상한 거부', () => {
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, rsiEntryMin: 80, rsiEntryMax: 70 }).success).toBe(false);
  });
  it('음수·0·초과 범위 거부', () => {
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, stopLossPct: -1 }).success).toBe(false);
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, orderPct: 0 }).success).toBe(false);
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, orderPct: 101 }).success).toBe(false);
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, maxPositions: 999 }).success).toBe(false);
  });
  it('타입 조작(문자열 숫자·객체) 거부', () => {
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, macdFast: '12' }).success).toBe(false);
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, stopLossPct: { $gt: 0 } }).success).toBe(false);
  });
  it('청산 시각 형식 조작 거부', () => {
    for (const bad of ['25:00', '14:60', '1450', '14:50:00', 'DROP TABLE', '']) {
      expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, exitTimeKst: bad }).success).toBe(false);
    }
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, exitTimeKst: '09:05' }).success).toBe(true);
  });
  it('소수 진입 금지 필드(int) 거부', () => {
    expect(strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, vwapHoldBars: 2.5 }).success).toBe(false);
  });
});

describe('universeSchema — 유니버스 조작 차단', () => {
  it('11개 초과 거부', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ ticker: String(100000 + i), market: 'KOSPI' as const }));
    expect(universeSchema.safeParse(items).success).toBe(false);
    expect(universeSchema.safeParse(items.slice(0, 10)).success).toBe(true);
  });
  it('미국 시장·비정형 티커 거부 (국내 한정 D15)', () => {
    expect(universeSchema.safeParse([{ ticker: 'AAPL', market: 'KOSPI' }]).success).toBe(false);
    expect(universeSchema.safeParse([{ ticker: '005930', market: 'NASDAQ' }]).success).toBe(false);
    expect(universeSchema.safeParse([{ ticker: "005930'; --", market: 'KOSPI' }]).success).toBe(false);
    expect(universeSchema.safeParse([{ ticker: '0059301', market: 'KOSPI' }]).success).toBe(false);
  });
});

describe('tradingPatchSchema', () => {
  it('빈 패치 거부', () => {
    expect(tradingPatchSchema.safeParse({}).success).toBe(false);
  });
  it('부분 파라미터는 허용 (병합 후 전체 재검증은 라우트 책임)', () => {
    expect(strategyParamsPartialSchema.safeParse({ stopLossPct: 1.5 }).success).toBe(true);
    expect(tradingPatchSchema.safeParse({ params: { stopLossPct: 1.5 } }).success).toBe(true);
  });
  it('알 수 없는 파라미터 키는 무시(strip)되어 통과해도 값에 남지 않는다', () => {
    const r = strategyParamsPartialSchema.safeParse({ __proto__: { hacked: true }, orderPct: 5 });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).toEqual(['orderPct']);
  });
});

describe('backtestRequestSchema', () => {
  it('허용 밖 interval·count·티커 거부', () => {
    expect(backtestRequestSchema.safeParse({ ticker: '005930', market: 'KOSPI', interval: '1w' }).success).toBe(false);
    expect(backtestRequestSchema.safeParse({ ticker: '005930', market: 'KOSPI', count: 5000 }).success).toBe(false);
    expect(backtestRequestSchema.safeParse({ ticker: 'AAPL', market: 'KOSPI' }).success).toBe(false);
    expect(backtestRequestSchema.safeParse({ ticker: '005930', market: 'NYSE' }).success).toBe(false);
  });
  it('기본값 적용 (1m·400)', () => {
    const r = backtestRequestSchema.safeParse({ ticker: '005930', market: 'KOSDAQ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.interval).toBe('1m');
      expect(r.data.count).toBe(400);
    }
  });
});

describe('orderbookQuerySchema', () => {
  it('6자리 숫자 외 전부 거부 (경로 주입 차단)', () => {
    for (const bad of ['AAPL', '00593', '005930/../..', '005930%0a', null, undefined]) {
      expect(orderbookQuerySchema.safeParse({ ticker: bad }).success).toBe(false);
    }
    expect(orderbookQuerySchema.safeParse({ ticker: '005930' }).success).toBe(true);
  });

  it('앞뒤 공백은 trim 정규화 후 통과 (안전한 정규화)', () => {
    const r = orderbookQuerySchema.safeParse({ ticker: ' 005930 ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ticker).toBe('005930');
  });
});
