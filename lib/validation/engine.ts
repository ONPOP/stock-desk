// 분석 엔진 설정 검증 (D16) — 저장 경로·보관기간·사용량 예산.
// 경로 자체의 허용 범위(홈 또는 /Volumes 하위)는 lib/engine/storage-path.ts가 최종 검증한다.
import { z } from 'zod';
import { signalRulesSchema } from '@/lib/engine/rules';
import { SLOT_ID_RE } from '@/lib/engine/storage-path';

export const engineSettingsPatchSchema = z
  .object({
    /** 빈 문자열은 '기본 경로 사용'으로 해석해 null로 저장한다 */
    slideStorageRoot: z.string().trim().max(512).nullable().optional(),
    retentionDays: z.number().int().min(0).max(3_650).optional(),
    telegramChatId: z.string().trim().max(64).nullable().optional(),
    maxStocksPerSlot: z.number().int().min(1).max(20).optional(),
    maxSearchesPerStock: z.number().int().min(1).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '변경할 항목이 없습니다.' });

export const storageTestSchema = z.object({
  path: z.string().trim().min(1, '경로를 입력하세요.').max(512),
});

export type EngineSettingsPatch = z.infer<typeof engineSettingsPatchSchema>;

/** 슬롯 스케줄 저장 — 전체 목록을 한 번에 받는다(부분 수정보다 UI 상태와 어긋날 여지가 적다) */
export const slotRowSchema = z.object({
  slotId: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/, '슬롯 ID는 영소문자·숫자·밑줄 40자 이내여야 합니다.'),
  label: z.string().trim().min(1, '슬롯 이름을 입력하세요.').max(60),
  cronKst: z.string().trim().min(1),
  market: z.enum(['KR', 'US', 'BOTH']),
  slotType: z.enum(['quick', 'detail', 'grade', 'weekly']),
  enabled: z.boolean(),
});

export const slotsPutSchema = z.object({
  slots: z.array(slotRowSchema).max(40),
});

export const themeCreateSchema = z.object({
  name: z.string().trim().min(1, '테마 이름을 입력하세요.').max(40),
  market: z.enum(['KR', 'US', 'BOTH']),
  description: z.string().trim().max(200).nullable().optional(),
});

/**
 * 테마 종목 편입/제외.
 * 검색 결과(/api/stocks/search)는 stock_id를 주지 않으므로 ticker+market로도 받고 서버에서 해석한다
 * — 여러 소비처가 쓰는 공용 검색 쿼리를 건드리지 않기 위한 선택.
 */
export const themeStockSchema = z
  .object({
    themeId: z.string().uuid(),
    stockId: z.string().uuid().optional(),
    ticker: z.string().trim().min(1).max(20).optional(),
    market: z.string().trim().min(1).max(10).optional(),
    add: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.stockId) || (Boolean(v.ticker) && Boolean(v.market)), {
    message: '종목 ID 또는 티커·시장이 필요합니다.',
  });

export type SlotRowInput = z.infer<typeof slotRowSchema>;

/** 신호 규칙 새 버전 저장 — 기존 행 수정 금지 원칙을 API 수준에서 강제한다 */
export const rulesCreateSchema = z.object({
  rules: signalRulesSchema,
  memo: z.string().trim().max(200).optional(),
  /** 저장과 동시에 활성화할지 */
  activate: z.boolean().default(true),
});

export const rulesActivateSchema = z.object({
  version: z.number().int().min(1),
});

/** 규칙 미리보기 — 최근 스냅샷에 규칙만 다시 적용(시세 재조회 없음) */
export const rulesPreviewSchema = z.object({
  rules: signalRulesSchema,
  slotId: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
});

/**
 * 텔레그램 슬롯 알림 토글 · 연결 해제 (D18).
 * disconnect는 true만 허용한다 — false를 보내 "연결 안 함" 상태를 표현하는 것은 정의하지 않는다.
 */
export const telegramPatchSchema = z
  .object({
    enabledSlotIds: z
      .array(z.string().regex(SLOT_ID_RE, '슬롯 ID 형식이 올바르지 않습니다.'))
      .max(50)
      .optional(),
    disconnect: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => v.enabledSlotIds !== undefined || v.disconnect !== undefined, {
    message: '변경할 항목이 없습니다.',
  });

export type TelegramPatch = z.infer<typeof telegramPatchSchema>;

/** 텔레그램 봇 연결(1단계) — 토큰 형식만 거칠게 거르고 실제 유효성은 getMe가 검증한다 */
export const telegramConnectSchema = z
  .object({
    botToken: z.string().trim().min(1, '봇 토큰을 입력하세요.').max(200, '봇 토큰 형식이 올바르지 않습니다.'),
  })
  .strict();
