import { describe, expect, it } from 'vitest';
import { settingsPatchSchema, validateKisSchema } from '@/lib/validation/settings';

describe('settingsPatchSchema — 정상 케이스', () => {
  it('키 일부만 갱신을 허용한다', () => {
    const r = settingsPatchSchema.safeParse({ kis_app_key: 'PSA1234567890abcdef' });
    expect(r.success).toBe(true);
  });

  it('null로 키 삭제를 허용한다', () => {
    expect(settingsPatchSchema.safeParse({ openai_key: null }).success).toBe(true);
  });

  it('시드머니 정수 변경을 허용한다', () => {
    expect(settingsPatchSchema.safeParse({ seed_krw: 5_000_000, seed_usd_cents: 500_000 }).success).toBe(true);
  });
});

describe('settingsPatchSchema — 비정상 케이스', () => {
  it('빈 객체(변경 없음)를 거부한다', () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false);
  });

  it('알 수 없는 필드를 거부한다 (mass assignment 방지)', () => {
    expect(settingsPatchSchema.safeParse({ user_id: 'someone-else', kis_app_key: 'x'.repeat(20) }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ kis_app_key_enc: 'v1.fake' }).success).toBe(false);
  });

  it('공백 포함·과단축·과대 키를 거부한다', () => {
    expect(settingsPatchSchema.safeParse({ kis_app_key: 'has space key' }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ kis_app_key: 'short' }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ kis_app_key: 'x'.repeat(513) }).success).toBe(false);
  });

  it('시드머니 0·음수·소수·문자열을 거부한다', () => {
    expect(settingsPatchSchema.safeParse({ seed_krw: 0 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ seed_krw: -1000 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ seed_krw: 100.5 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ seed_krw: '천만원' }).success).toBe(false);
  });

  it('시드머니 상한 초과를 거부한다', () => {
    expect(settingsPatchSchema.safeParse({ seed_krw: 10_000_000_000_000 }).success).toBe(false);
  });
});

describe('validateKisSchema', () => {
  it('본문 없음(저장된 키 검증)을 허용한다', () => {
    expect(validateKisSchema.safeParse({}).success).toBe(true);
  });

  it('앱키+시크릿 쌍을 허용한다', () => {
    expect(validateKisSchema.safeParse({ app_key: 'x'.repeat(20), app_secret: 'y'.repeat(20) }).success).toBe(true);
  });

  it('한쪽만 전달을 거부한다', () => {
    expect(validateKisSchema.safeParse({ app_key: 'x'.repeat(20) }).success).toBe(false);
    expect(validateKisSchema.safeParse({ app_secret: 'y'.repeat(20) }).success).toBe(false);
  });

  it('알 수 없는 필드를 거부한다', () => {
    expect(validateKisSchema.safeParse({ evil: true }).success).toBe(false);
  });
});
