// 텔레그램 봇 자격증명 저장 계층 (D18). 봇 토큰 복호화의 유일한 경로.
//
// 'server-only'를 붙이지 않는다: scripts/engine/notify.ts가 tsx로 직접 import한다.
// SupabaseClient를 주입받아 클라이언트 자격증명을 이 모듈이 직접 갖지 않는다
// (lib/engine/repository.ts·kis-token-store.ts와 동일한 패턴).
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/utils/crypto-core';

const TABLE = 'engine_telegram';

export interface TelegramSettings {
  /** 복호화된 값. 반환 후 로깅 금지 */
  botToken: string | null;
  botUsername: string | null;
  chatId: string | null;
  enabledSlotIds: string[];
  lastError: string | null;
}

const EMPTY_SETTINGS: TelegramSettings = {
  botToken: null,
  botUsername: null,
  chatId: null,
  enabledSlotIds: [],
  lastError: null,
};

interface TelegramRow {
  bot_token_enc: string | null;
  bot_username: string | null;
  chat_id: string | null;
  enabled_slot_ids: string[] | null;
  last_error: string | null;
}

/** 저장된 암호문을 복호화한다. 키 교체 등으로 실패해도 예외를 던지지 않는다 — 배치가 죽으면 안 된다 */
function decryptTokenSafe(botTokenEnc: string | null): string | null {
  if (!botTokenEnc) return null;
  try {
    return decryptSecret(botTokenEnc);
  } catch {
    return null;
  }
}

export async function loadTelegramSettings(db: SupabaseClient, userId: string): Promise<TelegramSettings> {
  const { data, error } = await db
    .from(TABLE)
    .select('bot_token_enc, bot_username, chat_id, enabled_slot_ids, last_error')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`텔레그램 설정 조회 실패: ${error.message}`);
  if (!data) return EMPTY_SETTINGS;

  const row = data as TelegramRow;
  return {
    botToken: decryptTokenSafe(row.bot_token_enc),
    botUsername: row.bot_username,
    chatId: row.chat_id,
    enabledSlotIds: row.enabled_slot_ids ?? [],
    lastError: row.last_error,
  };
}

/** 토큰 등록(연결 1단계). chat id·슬롯 설정 등 기존 값은 건드리지 않는다 */
export async function saveToken(
  db: SupabaseClient,
  userId: string,
  botToken: string,
  botUsername: string,
): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    {
      user_id: userId,
      bot_token_enc: encryptSecret(botToken),
      bot_username: botUsername,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`텔레그램 토큰 저장 실패: ${error.message}`);
}

/** chat id 획득(연결 2단계) — 연결 성공 시각을 함께 기록한다 */
export async function saveChatId(db: SupabaseClient, userId: string, chatId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from(TABLE).upsert(
    { user_id: userId, chat_id: chatId, connected_at: now, updated_at: now },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`텔레그램 chat id 저장 실패: ${error.message}`);
}

export async function setEnabledSlots(db: SupabaseClient, userId: string, slotIds: string[]): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    { user_id: userId, enabled_slot_ids: slotIds, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`텔레그램 슬롯 설정 저장 실패: ${error.message}`);
}

/** 마지막 발송 실패 사유 기록 — 앱 설정 화면 표시용. message가 null이면 이전 오류를 지운다(성공 시 호출) */
export async function recordError(db: SupabaseClient, userId: string, message: string | null): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    { user_id: userId, last_error: message, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`텔레그램 오류 기록 실패: ${error.message}`);
}

/** 연결 해제 — 행을 통째로 삭제한다(토큰·chat id·슬롯 설정 전부 초기화) */
export async function disconnect(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(`텔레그램 연결 해제 실패: ${error.message}`);
}
