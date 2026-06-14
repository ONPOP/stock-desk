// AI 모델 클라이언트 — 사용자별 OpenAI 키로 모델 인스턴스 생성 (PRD 16장, D10 gpt-4o-mini).
// 키는 user_settings에서 복호화해 주입(서버 전용). 모델 교체는 여기 단일 지점.
import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

/** 사용자 OpenAI 키로 바인딩된 모델. AI SDK의 generateObject/generateText에 전달. */
export function openaiModel(apiKey: string, model: string = DEFAULT_AI_MODEL) {
  const openai = createOpenAI({ apiKey });
  return openai(model);
}
