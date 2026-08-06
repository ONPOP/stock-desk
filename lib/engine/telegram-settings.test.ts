// 텔레그램 봇 자격증명 저장 계층 테스트 (D18) — 암호화 경로가 유일하게 지나가는 지점.
// Supabase 클라이언트는 실제로 붙이지 않고 체이닝 스텁을 손으로 만든다 (lib/engine/fallback-queue.test.ts 스타일).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { encryptSecret } from '@/lib/utils/crypto-core';
import { loadTelegramSettings, saveToken, setEnabledSlots } from './telegram-settings';

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
