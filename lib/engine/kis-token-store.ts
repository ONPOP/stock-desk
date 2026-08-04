// 배치 스크립트용 KIS 토큰 캐시 (D16).
// lib/providers/kis/supabase-token-store.ts와 같은 테이블(kis_token_cache)·같은 암호화 형식을 쓰지만,
// 그쪽은 server-only 모듈이라 tsx로 실행되는 스크립트에서 import할 수 없어 별도 구현을 둔다.
//
// 이게 필요한 이유: KIS는 access_token 발급을 분당 1회로 제한한다. 슬롯마다 새 프로세스가 뜨는 배치
// 구조에서 인메모리 캐시를 쓰면 재시도·연속 슬롯에서 "호출 한도 초과"로 전량 실패한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/utils/crypto-core';
import type { CachedToken, TokenStore } from '@/lib/providers/kis/token-store';

export class ScriptKisTokenStore implements TokenStore {
  constructor(private readonly db: SupabaseClient) {}

  async get(cacheKey: string): Promise<CachedToken | null> {
    const { data, error } = await this.db
      .from('kis_token_cache')
      .select('token_enc, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return null;

    try {
      return { accessToken: decryptSecret(data.token_enc), expiresAt };
    } catch {
      // 키 교체 등으로 복호화가 깨지면 캐시 미스로 처리해 재발급시킨다
      await this.delete(cacheKey);
      return null;
    }
  }

  async set(cacheKey: string, token: CachedToken): Promise<void> {
    const { error } = await this.db.from('kis_token_cache').upsert(
      {
        cache_key: cacheKey,
        token_enc: encryptSecret(token.accessToken),
        expires_at: new Date(token.expiresAt).toISOString(),
      },
      { onConflict: 'cache_key' },
    );
    // 캐시 쓰기 실패로 슬롯을 중단시키지는 않는다 (이번 실행은 발급한 토큰으로 계속 진행)
    if (error) console.warn(`⚠ KIS 토큰 캐시 저장 실패: ${error.message}`);
  }

  async delete(cacheKey: string): Promise<void> {
    await this.db.from('kis_token_cache').delete().eq('cache_key', cacheKey);
  }
}
