// 설정 입력 검증 스키마 (zod) — API 키·시드머니
import { z } from 'zod';

/** 키 공통: 공백·제어문자 금지, 비정상 길이 차단 */
const apiKeySchema = z
  .string()
  .min(10, '키가 너무 짧습니다.')
  .max(512, '키가 너무 깁니다.')
  .regex(/^\S+$/, '키에 공백을 포함할 수 없습니다.');

/** null = 해당 키 삭제, undefined = 변경 없음 */
export const settingsPatchSchema = z
  .object({
    kis_app_key: apiKeySchema.nullable().optional(),
    kis_app_secret: apiKeySchema.nullable().optional(),
    openai_key: apiKeySchema.nullable().optional(),
    anthropic_key: apiKeySchema.nullable().optional(),
    dart_key: apiKeySchema.nullable().optional(),
    finnhub_key: apiKeySchema.nullable().optional(),
    fmp_key: apiKeySchema.nullable().optional(),
    naver_client_id: apiKeySchema.nullable().optional(),
    naver_client_secret: apiKeySchema.nullable().optional(),
    seed_krw: z.number().int().positive().max(1_000_000_000_000).optional(),
    seed_usd_cents: z.number().int().positive().max(100_000_000_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: '변경할 항목이 없습니다.' });

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const validateKisSchema = z
  .object({
    app_key: apiKeySchema.optional(),
    app_secret: apiKeySchema.optional(),
  })
  .strict()
  .refine((v) => (v.app_key === undefined) === (v.app_secret === undefined), {
    message: '앱키와 시크릿은 함께 전달해야 합니다.',
  });
