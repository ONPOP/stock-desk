// 모의투자 주문 검증 (F9)
import { z } from 'zod';
import { marketSchema, tickerSchema } from '@/lib/validation/market';

export const orderSchema = z
  .object({
    ticker: tickerSchema,
    market: marketSchema,
    side: z.enum(['buy', 'sell']),
    qty: z.coerce.number().int().positive().max(1_000_000_000),
    // 'market'=시장가(장중 즉시·장외 시초가 예약), 'limit'=지정가 예약
    orderType: z.enum(['market', 'limit']).default('market'),
    // 지정가(표시 단위 문자열: USD "253.76", KRW "340000"). 서버에서 최소 단위 정수로 변환.
    limitPrice: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, '지정가 형식이 올바르지 않습니다.')
      .optional(),
    memo: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((d) => d.orderType !== 'limit' || (d.limitPrice != null && Number(d.limitPrice) > 0), {
    message: '지정가를 입력해주세요.',
    path: ['limitPrice'],
  });

export type OrderInput = z.infer<typeof orderSchema>;

/** 예약 주문 취소 검증 */
export const cancelSchema = z.object({ tradeId: z.string().uuid() }).strict();
export type CancelInput = z.infer<typeof cancelSchema>;
