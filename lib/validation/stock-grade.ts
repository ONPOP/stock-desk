// 사용자 종목 등급(A~D) 입력 검증 — PUT /api/stock-grades
import { z } from 'zod';

export const stockGradeStockIdSchema = z.string().uuid('stock_id 형식이 올바르지 않습니다.');

export const stockGradeUpsertSchema = z
  .object({
    stock_id: stockGradeStockIdSchema,
    grade: z.enum(['A', 'B', 'C', 'D'], { message: '등급은 A·B·C·D 중 하나여야 합니다.' }),
    reason: z
      .string()
      .trim()
      .max(100, '사유는 100자 이하로 입력하세요.')
      .nullish()
      .transform((v) => (v ? v : null)), // 빈 문자열·공백만 → null
  })
  .strict();
