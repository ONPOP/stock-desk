// 분석 엔진 API 입력 검증 테스트 — 텔레그램 연결·슬롯 토글 스키마 (D18).
import { describe, expect, it } from 'vitest';
import { telegramConnectSchema, telegramPatchSchema } from './engine';

describe('telegramPatchSchema — 정상 케이스', () => {
  it('슬롯 id 배열만 갱신을 허용한다', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['kr_close_buy', 'us_open_sell'] }).success).toBe(true);
  });

  it('빈 배열(전부 끄기)을 허용한다', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: [] }).success).toBe(true);
  });

  it('disconnect: true만 단독으로 허용한다', () => {
    expect(telegramPatchSchema.safeParse({ disconnect: true }).success).toBe(true);
  });
});

describe('telegramPatchSchema — 비정상 케이스', () => {
  it('빈 객체(변경 없음)를 거부한다', () => {
    expect(telegramPatchSchema.safeParse({}).success).toBe(false);
  });

  it('경로 조작 형태의 슬롯 id를 거부한다', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['../etc'] }).success).toBe(false);
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['../../etc/passwd'] }).success).toBe(false);
  });

  it('대문자·공백·특수문자가 섞인 슬롯 id를 거부한다', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['KR_CLOSE'] }).success).toBe(false);
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['kr close'] }).success).toBe(false);
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['kr/close'] }).success).toBe(false);
  });

  it('41자 이상인 슬롯 id를 거부한다', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['a'.repeat(41)] }).success).toBe(false);
  });

  it('51개를 넘는 슬롯 id 배열을 거부한다', () => {
    const many = Array.from({ length: 51 }, (_, i) => `slot_${i}`);
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: many }).success).toBe(false);
  });

  it('disconnect: false를 거부한다 (참만 의미 있는 값)', () => {
    expect(telegramPatchSchema.safeParse({ disconnect: false }).success).toBe(false);
  });

  it('정의되지 않은 필드를 거부한다 (mass assignment 방지)', () => {
    expect(telegramPatchSchema.safeParse({ enabledSlotIds: ['kr_close'], botToken: 'sneaky' }).success).toBe(false);
  });
});

describe('telegramConnectSchema', () => {
  it('토큰 문자열을 허용한다', () => {
    expect(telegramConnectSchema.safeParse({ botToken: '123456:ABC-DEF-token' }).success).toBe(true);
  });

  it('빈 문자열·공백만 있는 토큰을 거부한다', () => {
    expect(telegramConnectSchema.safeParse({ botToken: '' }).success).toBe(false);
    expect(telegramConnectSchema.safeParse({ botToken: '   ' }).success).toBe(false);
  });

  it('토큰 누락을 거부한다', () => {
    expect(telegramConnectSchema.safeParse({}).success).toBe(false);
  });

  it('정의되지 않은 필드를 거부한다', () => {
    expect(telegramConnectSchema.safeParse({ botToken: 'x'.repeat(20), disconnect: true }).success).toBe(false);
  });
});
