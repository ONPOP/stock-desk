// 네이버 검색 API 클라이언트 — 한국 뉴스 (PRD 11장, F5). client_id/secret 헤더 인증.
import { ExternalApiError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

export const NAVER_BASE_URL = 'https://openapi.naver.com/v1/search';
const REQUEST_TIMEOUT_MS = 10_000;

const limiterRegistry = new Map<string, RateLimiter>();

export interface NaverCredentials {
  clientId: string;
  clientSecret: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('naver', '네이버 응답이 지연되고 있습니다.', 'timeout');
    }
    throw new ExternalApiError('naver', '네이버에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class NaverClient {
  private readonly creds: NaverCredentials;
  private readonly limiter: RateLimiter;

  constructor(creds: NaverCredentials) {
    if (!creds.clientId || !creds.clientSecret) {
      throw new ExternalApiError('naver', '네이버 client_id/secret이 없습니다.', 'missing creds');
    }
    this.creds = creds;
    const existing = limiterRegistry.get(creds.clientId);
    this.limiter = existing ?? new RateLimiter({ maxPerSecond: 10 });
    if (!existing) limiterRegistry.set(creds.clientId, this.limiter);
  }

  async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.limiter.acquire();
    const url = new URL(`${NAVER_BASE_URL}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        'X-Naver-Client-Id': this.creds.clientId,
        'X-Naver-Client-Secret': this.creds.clientSecret,
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new ExternalApiError('naver', '네이버 키가 올바르지 않거나 권한이 없습니다.', `HTTP ${res.status}`);
    }
    if (res.status === 429) {
      throw new ExternalApiError('naver', '네이버 호출 한도를 초과했습니다.', 'HTTP 429');
    }
    if (!res.ok) {
      throw new ExternalApiError('naver', '네이버 호출에 실패했습니다.', `HTTP ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ExternalApiError('naver', '네이버 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }
  }
}
