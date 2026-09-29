// 투자 기록 입력 검증 (D21) — 투자 규칙 · 목표 수익률 · 월 시작 금액
import { z } from 'zod';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '월 형식이 올바르지 않습니다.');

export const ruleCreateSchema = z.object({
  content: z.string().trim().min(1, '규칙 내용을 입력해주세요.').max(300, '규칙은 300자 이내로 입력해주세요.'),
});

export const ruleUpdateSchema = ruleCreateSchema.extend({
  id: z.string().uuid('잘못된 규칙입니다.'),
});

export const ruleReorderSchema = z.object({
  ids: z.array(z.string().uuid('잘못된 규칙입니다.')).max(200),
});

export const goalInputSchema = z
  .object({
    kind: z.enum(['monthly', 'yearly']),
    // 10진 문자열(부동소수점 회피). 0 초과 1000 이하, 소수 3자리까지
    ratePct: z
      .string()
      .trim()
      .regex(/^\d{1,4}(\.\d{1,3})?$/, '목표 수익률은 숫자(소수 3자리까지)로 입력해주세요.')
      .refine((v) => Number(v) > 0 && Number(v) <= 1000, '목표 수익률은 0% 초과 1000% 이하여야 합니다.'),
    effectiveMonth: month,
  })
  .refine((v) => v.kind === 'monthly' || v.effectiveMonth.endsWith('-01'), {
    message: '연 목표는 1월부터 적용됩니다.',
  });

export const monthOverrideSchema = z.object({
  month,
  // 원 단위 정수. null이면 자동 계산값으로 되돌린다
  startOverride: z.number().int('금액은 원 단위 정수여야 합니다.').min(0).max(1_000_000_000_000_000).nullable(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;
