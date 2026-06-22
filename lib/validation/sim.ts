// 모의투자 테스트 매매 입력 검증 (zod)
import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.');

export const simOrderSchema = z
  .object({
    ticker: z.string().trim().regex(/^[A-Z][A-Z0-9.\-]{0,15}$/, '티커 형식이 올바르지 않습니다.'),
    side: z.enum(['buy', 'sell']),
    qty: z.number().int().positive('수량은 1 이상이어야 합니다.').max(1_000_000),
    simDate: dateSchema,
  })
  .strict();

export type SimOrderInput = z.infer<typeof simOrderSchema>;

export const simSessionSchema = z
  .object({
    seedUsd: z.number().positive('초기 자금은 0보다 커야 합니다.').max(1_000_000_000),
    startDate: dateSchema,
  })
  .strict();

export type SimSessionInput = z.infer<typeof simSessionSchema>;

export const simCurDateSchema = z.object({ curDate: dateSchema }).strict();
