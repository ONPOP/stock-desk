// F13 노트 입력 검증 (zod)
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const noteCreateSchema = z
  .object({
    content_md: z.string().trim().min(1, '내용을 입력해주세요.').max(5000, '노트가 너무 깁니다.'),
    stock_id: uuidSchema.nullable().optional(),
    attached_analysis_id: uuidSchema.nullable().optional(),
    attached_trade_id: uuidSchema.nullable().optional(),
  })
  .strict();

export type NoteCreate = z.infer<typeof noteCreateSchema>;

export const noteUpdateSchema = z
  .object({
    content_md: z.string().trim().min(1, '내용을 입력해주세요.').max(5000, '노트가 너무 깁니다.'),
  })
  .strict();

export type NoteUpdate = z.infer<typeof noteUpdateSchema>;

/** 목록 쿼리 — 검색어(q)·종목 필터(stock=ticker는 라우트에서 stock_id로 변환) */
export const noteQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stock_id: uuidSchema.optional(),
});
