import { describe, it, expect } from 'vitest';
import { stockGradeStockIdSchema, stockGradeUpsertSchema } from './stock-grade';

const SID = '11111111-1111-4111-8111-111111111111';

describe('stockGradeUpsertSchema', () => {
  it('등급만 / 등급+사유 통과, 사유는 trim', () => {
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'A' })).toEqual({
      stock_id: SID,
      grade: 'A',
      reason: null,
    });
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'D', reason: '  실적 둔화  ' }).reason).toBe(
      '실적 둔화',
    );
  });
  it('공백만인 사유와 null은 null로 저장', () => {
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'B', reason: '   ' }).reason).toBeNull();
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'B', reason: null }).reason).toBeNull();
  });
  it('100자까지 허용, 101자 거부(한국어 메시지)', () => {
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'C', reason: 'a'.repeat(100) }).success).toBe(
      true,
    );
    const r = stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'C', reason: 'a'.repeat(101) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('사유는 100자 이하로 입력하세요.');
  });
  it('허용되지 않은 등급·UUID·추가 필드 거부', () => {
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'E' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'a' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: 'x', grade: 'A' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'A', user_id: SID }).success).toBe(false);
  });
});

describe('stockGradeStockIdSchema', () => {
  it('uuid만 통과', () => {
    expect(stockGradeStockIdSchema.safeParse(SID).success).toBe(true);
    expect(stockGradeStockIdSchema.safeParse(null).success).toBe(false);
  });
});
