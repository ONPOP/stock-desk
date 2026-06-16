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

/**
 * 새 시즌 시작 검증 — 초기 현금(KRW=원, USD=달러 표시단위) + 목표 기간(선택).
 * 서버에서 seedUsd(달러) → seed_usd_cents(센트) 변환. 기간은 표시·기록용.
 */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
  .optional();

export const newSeasonSchema = z
  .object({
    seedKrw: z.coerce.number().int().positive().max(1_000_000_000_000),
    seedUsd: z.coerce.number().positive().max(1_000_000_000), // 달러(표시 단위)
    startDate: dateStr,
    endDate: dateStr,
  })
  .strict()
  .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
    message: '종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  });

export type NewSeasonInput = z.infer<typeof newSeasonSchema>;
