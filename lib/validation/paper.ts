// 모의투자 주문 검증 (F9)
import { z } from 'zod';
import { marketSchema, tickerSchema } from '@/lib/validation/market';

export const orderSchema = z
  .object({
    ticker: tickerSchema,
    market: marketSchema,
    side: z.enum(['buy', 'sell']),
    qty: z.coerce.number().int().positive().max(1_000_000_000),
    memo: z.string().trim().max(500).optional(),
  })
  .strict();

export type OrderInput = z.infer<typeof orderSchema>;
