// 시세/캔들 API 입력 검증 — 티커·시장·인터벌·개수 (주입·비정상값 차단)
import { z } from 'zod';

export const marketSchema = z.enum(['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX']);

// 국내 6자리 숫자 또는 해외 영문 티커(점·하이픈 허용). 그 외 문자는 차단.
export const tickerSchema = z
  .string()
  .trim()
  .min(1, '티커를 입력해주세요.')
  .max(16, '티커가 너무 깁니다.')
  .regex(/^[A-Za-z0-9.\-]+$/, '티커 형식이 올바르지 않습니다.');

export const intervalSchema = z.enum(['1m', '1d', '1w']);

export const countSchema = z.coerce.number().int().min(1).max(2000);

export const quoteQuerySchema = z.object({
  ticker: tickerSchema,
  market: marketSchema,
});

export const candleQuerySchema = z.object({
  ticker: tickerSchema,
  market: marketSchema,
  interval: intervalSchema,
  count: countSchema.default(120),
});

export const watchlistAddSchema = z.object({
  ticker: tickerSchema,
  market: marketSchema,
  group_name: z.string().trim().max(30, '그룹명이 너무 깁니다.').optional(),
});

// 워치리스트 PATCH — 즐겨찾기 토글 또는 그룹 내 순서 재정렬(둘 중 하나).
const stockIdSchema = z.string().uuid('stock_id 형식이 올바르지 않습니다.');

export const watchlistFavoriteSchema = z.object({
  action: z.literal('favorite'),
  stock_id: stockIdSchema,
  value: z.boolean(),
});

export const watchlistReorderSchema = z.object({
  action: z.literal('reorder'),
  orders: z
    .array(z.object({ stock_id: stockIdSchema, sort_order: z.number().int().min(0).max(9999) }))
    .min(1, '정렬 대상이 없습니다.')
    .max(100, '정렬 대상이 너무 많습니다.'),
});

export const watchlistPatchSchema = z.discriminatedUnion('action', [
  watchlistFavoriteSchema,
  watchlistReorderSchema,
]);
