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

// 워치리스트 탭(컬렉션) id·이름
export const watchlistIdSchema = z.string().uuid('watchlist_id 형식이 올바르지 않습니다.');
const watchlistNameSchema = z
  .string()
  .trim()
  .min(1, '탭 이름을 입력해주세요.')
  .max(30, '탭 이름은 30자 이내여야 합니다.');

export const watchlistAddSchema = z.object({
  watchlist_id: watchlistIdSchema,
  ticker: tickerSchema,
  market: marketSchema,
});

// 워치리스트 PATCH — 즐겨찾기 토글 또는 탭 내 순서 재정렬(둘 중 하나).
const stockIdSchema = z.string().uuid('stock_id 형식이 올바르지 않습니다.');

export const watchlistFavoriteSchema = z.object({
  action: z.literal('favorite'),
  watchlist_id: watchlistIdSchema,
  stock_id: stockIdSchema,
  value: z.boolean(),
});

export const watchlistReorderSchema = z.object({
  action: z.literal('reorder'),
  watchlist_id: watchlistIdSchema,
  orders: z
    .array(z.object({ stock_id: stockIdSchema, sort_order: z.number().int().min(0).max(9999) }))
    .min(1, '정렬 대상이 없습니다.')
    .max(100, '정렬 대상이 너무 많습니다.'),
});

export const watchlistPatchSchema = z.discriminatedUnion('action', [
  watchlistFavoriteSchema,
  watchlistReorderSchema,
]);

// ───────────────────────── 탭 CRUD ─────────────────────────
export const watchlistCreateSchema = z.object({ name: watchlistNameSchema });

export const watchlistTabRenameSchema = z.object({
  action: z.literal('rename'),
  id: watchlistIdSchema,
  name: watchlistNameSchema,
});

export const watchlistTabReorderSchema = z.object({
  action: z.literal('reorder'),
  orders: z
    .array(z.object({ id: watchlistIdSchema, sort_order: z.number().int().min(0).max(9999) }))
    .min(1, '정렬 대상이 없습니다.')
    .max(50, '탭이 너무 많습니다.'),
});

export const watchlistTabPatchSchema = z.discriminatedUnion('action', [
  watchlistTabRenameSchema,
  watchlistTabReorderSchema,
]);
