// 인증 관련 입력 검증.
import { z } from 'zod';

export const autoLoginPutSchema = z.object({
  enabled: z.boolean({ message: '자동 로그인 값이 올바르지 않습니다.' }),
});

export type AutoLoginPut = z.infer<typeof autoLoginPutSchema>;
