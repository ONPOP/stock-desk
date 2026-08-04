// 자동매매 API 입력 검증 (D15) — 파라미터 범위·유니버스·백테스트 요청
import { z } from 'zod';

// 국내 한정 (D15) — 6자리 숫자 코드
export const krTickerSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, '국내 종목코드는 6자리 숫자여야 합니다.');
export const krMarketSchema = z.enum(['KOSPI', 'KOSDAQ']);

/** StrategyParams 필드 정의 — PATCH는 부분(partial) 입력 허용, 병합 후 전체 스키마로 최종 검증 */
const strategyParamsBase = z.object({
    vwapHoldBars: z.number().int().min(1).max(30),
    rsiPeriod: z.number().int().min(2).max(50),
    rsiEntryMin: z.number().min(0).max(100),
    rsiEntryMax: z.number().min(0).max(101),
    rsiExit: z.number().min(0).max(101),
    macdFast: z.number().int().min(2).max(50),
    macdSlow: z.number().int().min(3).max(200),
    macdSignal: z.number().int().min(1).max(50),
    macdCrossWithinBars: z.number().int().min(1).max(30),
    volAvgBars: z.number().int().min(2).max(120),
    volMultiplier: z.number().min(1).max(20),
    stopLossPct: z.number().min(0.1).max(30),
    takeProfitPct: z.number().min(0.1).max(100),
    vwapExitBars: z.number().int().min(1).max(30),
    orderPct: z.number().min(1).max(100),
    maxPositions: z.number().int().min(1).max(10),
    dailyLossLimitPct: z.number().min(0.1).max(100),
    maxEntriesPerDay: z.number().int().min(1).max(20),
    reentryCooldownMin: z.number().int().min(0).max(600),
    exitTimeKst: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '청산 시각은 HH:mm 형식이어야 합니다.'),
  });

export const strategyParamsSchema = strategyParamsBase
  .refine((p) => p.macdFast < p.macdSlow, { message: 'MACD fast는 slow보다 작아야 합니다.' })
  .refine((p) => p.rsiEntryMin < p.rsiEntryMax, { message: 'RSI 진입 하한은 상한보다 작아야 합니다.' });

/** PATCH용 부분 파라미터 — 병합 후 strategyParamsSchema로 재검증할 것 */
export const strategyParamsPartialSchema = strategyParamsBase.partial();

export const universeSchema = z
  .array(z.object({ ticker: krTickerSchema, market: krMarketSchema }))
  .max(10, '자동매매 감시 종목은 최대 10개입니다.');

export const tradingPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    killSwitch: z.boolean().optional(),
    params: strategyParamsPartialSchema.optional(),
    universe: universeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '변경할 항목이 없습니다.' });

export const backtestRequestSchema = z.object({
  ticker: krTickerSchema,
  market: krMarketSchema,
  interval: z.enum(['1m', '1d']).default('1m'),
  count: z.coerce.number().int().min(60).max(2000).default(400),
  params: strategyParamsSchema.optional(),
});

export const orderbookQuerySchema = z.object({ ticker: krTickerSchema });
