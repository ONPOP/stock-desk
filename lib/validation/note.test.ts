import { describe, it, expect } from 'vitest';
import { noteCreateSchema, noteQuerySchema } from './note';

describe('noteCreateSchema', () => {
  it('정상 노트 통과 (전역·종목)', () => {
    expect(noteCreateSchema.safeParse({ content_md: '삼성전자 실적 메모' }).success).toBe(true);
    expect(
      noteCreateSchema.safeParse({ content_md: '메모', stock_id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
  it('빈 내용·공백만은 거부', () => {
    expect(noteCreateSchema.safeParse({ content_md: '' }).success).toBe(false);
    expect(noteCreateSchema.safeParse({ content_md: '   ' }).success).toBe(false);
  });
  it('5000자 초과 거부', () => {
    expect(noteCreateSchema.safeParse({ content_md: 'a'.repeat(5001) }).success).toBe(false);
  });
  it('잘못된 UUID·미허용 필드 거부', () => {
    expect(noteCreateSchema.safeParse({ content_md: 'x', stock_id: 'not-uuid' }).success).toBe(false);
    expect(noteCreateSchema.safeParse({ content_md: 'x', user_id: 'inject' }).success).toBe(false); // strict
  });
});

describe('noteQuerySchema', () => {
  it('검색어·종목 필터 옵션', () => {
    expect(noteQuerySchema.safeParse({}).success).toBe(true);
    expect(noteQuerySchema.safeParse({ q: '실적' }).success).toBe(true);
    expect(noteQuerySchema.safeParse({ stock_id: 'bad' }).success).toBe(false);
  });
});
