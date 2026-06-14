// KIS 접근토큰 저장소 — 24h 캐시 (PRD 16장)
// KIS는 토큰 발급을 1분당 1회로 제한하므로 서버리스 환경에서는 반드시 영속 캐시 필요.
// 기본: 인메모리(스크립트·단일 프로세스용) / 운영: Supabase 테이블(kis_token_cache)

export interface CachedToken {
  accessToken: string;
  /** UTC epoch ms */
  expiresAt: number;
}

export interface TokenStore {
  get(cacheKey: string): Promise<CachedToken | null>;
  set(cacheKey: string, token: CachedToken): Promise<void>;
  delete(cacheKey: string): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, CachedToken>();

  async get(cacheKey: string): Promise<CachedToken | null> {
    const hit = this.map.get(cacheKey);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(cacheKey);
      return null;
    }
    return hit;
  }

  async set(cacheKey: string, token: CachedToken): Promise<void> {
    this.map.set(cacheKey, token);
  }

  async delete(cacheKey: string): Promise<void> {
    this.map.delete(cacheKey);
  }
}
