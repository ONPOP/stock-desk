// 예수금 입출금 입력 검증 (V2 · D11)
import { z } from 'zod';

export const cashTxInputSchema = z.object({
  currency: z.enum(['KRW', 'USD']),
  type: z.enum(['deposit', 'withdraw']),
  amount: z
    .number()
    .int('금액은 최소 단위 정수여야 합니다.')
    .positive('금액은 0보다 커야 합니다.')
    .max(1_000_000_000_000_000),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
  memo: z.string().max(500).nullish(),
});

export type CashTxInput = z.infer<typeof cashTxInputSchema>;
