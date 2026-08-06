// 텔레그램 봇 자격증명 저장 계층 테스트 (D18) — 암호화 경로가 유일하게 지나가는 지점.
// Supabase 클라이언트는 실제로 붙이지 않고 체이닝 스텁을 손으로 만든다 (lib/engine/fallback-queue.test.ts 스타일).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '@/lib/utils/crypto-core';
import { loadTelegramSettings, resolveTelegramConfigForUser, saveToken, setEnabledSlots } from './telegram-settings';

process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

interface SelectResult {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

/** select().eq().maybeSingle() 체인만 지원하는 최소 스텁 */
function dbWithSelectResult(result: SelectResult): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

/** upsert() 호출을 기록만 하는 최소 스텁 — 페이로드 검증용 */
function dbCapturingUpsert(calls: Array<{ table: string; payload: unknown; options: unknown }>): SupabaseClient {
  return {
    from: (table: string) => ({
      upsert: async (payload: unknown, options: unknown) => {
        calls.push({ table, payload, options });
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
}

describe('loadTelegramSettings', () => {
  it('행이 없으면 전 필드 null/빈 배열을 반환한다', async () => {
    const db = dbWithSelectResult({ data: null, error: null });

    const settings = await loadTelegramSettings(db, 'user-1');

    expect(settings).toEqual({
      botToken: null,
      botUsername: null,
      chatId: null,
      enabledSlotIds: [],
      lastError: null,
    });
  });

  it('암호문이 저장돼 있으면 복호화된 평문을 반환한다', async () => {
    const plaintext = '123456:ABC-DEF-real-bot-token';
    const db = dbWithSelectResult({
      data: {
        bot_token_enc: encryptSecret(plaintext),
        bot_username: '@stockdesk_bot',
        chat_id: '999',
        enabled_slot_ids: ['kr_close_buy'],
        last_error: null,
      },
      error: null,
    });

    const settings = await loadTelegramSettings(db, 'user-1');

    expect(settings.botToken).toBe(plaintext);
    expect(settings.botUsername).toBe('@stockdesk_bot');
    expect(settings.chatId).toBe('999');
    expect(settings.enabledSlotIds).toEqual(['kr_close_buy']);
  });

  it('복호화가 실패해도 예외 없이 botToken: null을 반환한다', async () => {
    const db = dbWithSelectResult({
      data: {
        bot_token_enc: 'v1.not.a.valid-ciphertext',
        bot_username: '@stockdesk_bot',
        chat_id: '999',
        enabled_slot_ids: [],
        last_error: null,
      },
      error: null,
    });

    const settings = await loadTelegramSettings(db, 'user-1');

    expect(settings.botToken).toBeNull();
    // 배치가 죽으면 안 된다 — 나머지 필드는 정상 반환
    expect(settings.chatId).toBe('999');
  });
});

describe('saveToken', () => {
  it('평문이 아니라 암호문이 upsert 페이로드에 실린다', async () => {
    const plaintext = '123456:ABC-DEF-real-bot-token';
    const calls: Array<{ table: string; payload: unknown; options: unknown }> = [];
    const db = dbCapturingUpsert(calls);

    await saveToken(db, 'user-1', plaintext, '@stockdesk_bot');

    expect(calls).toHaveLength(1);
    const serialized = JSON.stringify(calls[0].payload);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).toContain('bot_token_enc');
  });

  // upsert는 payload에 없는 컬럼을 건드리지 않는다 — chat_id를 생략하면 봇 A→B 교체 시
  // 봇 A의 chat_id가 그대로 남아 "봇 B 토큰 + 봇 A chat_id"라는 불일치 상태가 된다.
  // saveToken은 DB의 기존 값을 몰라도 되도록 매번 chat_id·connected_at을 null로 명시해야 한다.
  it('chat_id·connected_at을 명시적으로 null로 초기화한다 (봇 교체 시나리오)', async () => {
    const calls: Array<{ table: string; payload: unknown; options: unknown }> = [];
    const db = dbCapturingUpsert(calls);

    await saveToken(db, 'user-1', 'new-bot-token', '@newbot');

    expect(calls).toHaveLength(1);
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.chat_id).toBeNull();
    expect(payload.connected_at).toBeNull();
  });
});

describe('setEnabledSlots', () => {
  it('빈 배열을 저장할 수 있다', async () => {
    const calls: Array<{ table: string; payload: unknown; options: unknown }> = [];
    const db = dbCapturingUpsert(calls);

    await setEnabledSlots(db, 'user-1', []);

    expect(calls).toHaveLength(1);
    expect((calls[0].payload as { enabled_slot_ids: string[] }).enabled_slot_ids).toEqual([]);
  });
});

/** select().eq().maybeSingle()에서 예외를 던지는 스텁 — DB 접속 실패 등을 흉내낸다 */
function dbThatThrowsOnSelect(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw new Error('연결 끊김(테스트)');
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('resolveTelegramConfigForUser', () => {
  const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ORIGINAL_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  beforeEach(() => {
    // run-slot.ts·notify.ts가 공유하는 병합 규칙 중 "DB 설정"만 검증한다 —
    // 환경변수가 항상 최우선이라는 사실은 telegram.ts의 resolveTelegramConfig 테스트가 이미 다룬다.
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_CHAT_ID === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = ORIGINAL_CHAT_ID;
  });

  it('신규 engine_telegram 값이 있으면 그것을 쓴다(구 chat id는 무시)', async () => {
    const db = dbWithSelectResult({
      data: {
        bot_token_enc: encryptSecret('new-token'),
        bot_username: '@bot',
        chat_id: 'new-chat',
        enabled_slot_ids: ['kr_close_buy'],
        last_error: null,
      },
      error: null,
    });

    const resolved = await resolveTelegramConfigForUser(db, 'user-1', 'old-chat-from-engine-settings');

    expect(resolved.config).toEqual({ botToken: 'new-token', chatId: 'new-chat' });
    expect(resolved.enabledSlotIds).toEqual(['kr_close_buy']);
  });

  it('engine_telegram 행이 없으면 구 engine_settings의 chat id로 폴백하지만 봇 토큰이 없어 config는 null이다', async () => {
    const db = dbWithSelectResult({ data: null, error: null });

    const resolved = await resolveTelegramConfigForUser(db, 'user-1', 'old-chat-from-engine-settings');

    // 구 경로는 chat id만 있었고 봇 토큰 저장처가 없었다 — 봇 토큰 없이는 발송할 수 없으므로 null이 맞다.
    expect(resolved.config).toBeNull();
    expect(resolved.enabledSlotIds).toEqual([]);
  });

  it('engine_telegram에 토큰만 있고 chat id가 비어 있으면 구 chat id와 합쳐 config를 만든다', async () => {
    const db = dbWithSelectResult({
      data: {
        bot_token_enc: encryptSecret('new-token'),
        bot_username: '@bot',
        chat_id: null,
        enabled_slot_ids: [],
        last_error: null,
      },
      error: null,
    });

    const resolved = await resolveTelegramConfigForUser(db, 'user-1', 'old-chat-from-engine-settings');

    expect(resolved.config).toEqual({ botToken: 'new-token', chatId: 'old-chat-from-engine-settings' });
  });

  it('engine_telegram 조회 자체가 실패해도 예외를 던지지 않고 구 설정으로 계속 진행한다', async () => {
    const db = dbThatThrowsOnSelect();

    const resolved = await resolveTelegramConfigForUser(db, 'user-1', 'old-chat-from-engine-settings');

    // 봇 토큰 소스가 없어 config는 null이지만, 이 호출 자체는 던지지 않아야 한다
    // (run-slot.ts가 이 호출 실패 때문에 슬롯 전체를 죽이면 안 된다는 요구사항).
    expect(resolved.config).toBeNull();
    expect(resolved.enabledSlotIds).toEqual([]);
  });

  it('환경변수가 있으면 DB 설정보다 우선한다', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    process.env.TELEGRAM_CHAT_ID = 'env-chat';
    const db = dbWithSelectResult({
      data: {
        bot_token_enc: encryptSecret('db-token'),
        bot_username: '@bot',
        chat_id: 'db-chat',
        enabled_slot_ids: [],
        last_error: null,
      },
      error: null,
    });

    const resolved = await resolveTelegramConfigForUser(db, 'user-1', 'old-chat');

    expect(resolved.config).toEqual({ botToken: 'env-token', chatId: 'env-chat' });
  });
});
