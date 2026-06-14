// Supabase 기반 KIS 토큰 영속 캐시 — 서버리스 인스턴스 간 공유 (Upstash Redis 대체)
// 토큰은 암호화 저장. 서비스 롤 전용 테이블(kis_token_cache, RLS로 일반 접근 차단).
import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/utils/crypto';
import type { CachedToken, TokenStore } from '@/lib/providers/kis/token-store';

export class SupabaseTokenStore implements TokenStore {
  async get(cacheKey: string): Promise<CachedToken | null> {
    const db = createAdminSupabase();
    const { data, error } = await db
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
      // 암호화 키 교체 등으로 복호화 불가 → 캐시 무효화
      await this.delete(cacheKey);
      return null;
    }
  }

  async set(cacheKey: string, token: CachedToken): Promise<void> {
    const db = createAdminSupabase();
    await db.from('kis_token_cache').upsert({
      cache_key: cacheKey,
      token_enc: encryptSecret(token.accessToken),
      expires_at: new Date(token.expiresAt).toISOString(),
    });
  }

  async delete(cacheKey: string): Promise<void> {
    const db = createAdminSupabase();
    await db.from('kis_token_cache').delete().eq('cache_key', cacheKey);
  }
}
