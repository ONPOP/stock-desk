// 실거래 매매 입력 검증 (V2)
import { z } from 'zod';

export const tradeInputSchema = z.object({
  stockId: z.string().uuid('잘못된 종목입니다.'),
  side: z.enum(['buy', 'sell']),
  qty: z.number().int('수량은 정수여야 합니다.').positive('수량은 0보다 커야 합니다.').max(1_000_000_000_000),
  price: z.number().int('단가는 최소 단위 정수여야 합니다.').positive('단가는 0보다 커야 합니다.').max(1_000_000_000_000_000),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '거래일 형식이 올바르지 않습니다.'),
  memo: z.string().max(500).nullish(),
  isEtf: z.boolean().optional(), // 국내 ETF 여부(매도 거래세 면제). 미지정 시 false
  fee: z.number().int('매매비용은 최소 단위 정수여야 합니다.').min(0, '매매비용은 0 이상이어야 합니다.').max(1_000_000_000_000_000).optional(), // 세금+수수료. 미지정 시 0
});

export type TradeInput = z.infer<typeof tradeInputSchema>;
