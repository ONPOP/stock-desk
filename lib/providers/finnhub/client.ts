// Finnhub 클라이언트 — 미국 재무·실적 (PRD 11장, F4). 무료티어 60 calls/min.
// 레이트리밋은 RateLimiter 재사용(초당 1건 = 분당 60건 보수적).
import { ExternalApiError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const REQUEST_TIMEOUT_MS = 12_000;

const limiterRegistry = new Map<string, RateLimiter>();

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('finnhub', 'Finnhub 응답이 지연되고 있습니다.', 'timeout');
    }
    throw new ExternalApiError('finnhub', 'Finnhub에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class FinnhubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(token: string, opts?: { baseUrl?: string }) {
    if (!token) throw new ExternalApiError('finnhub', 'Finnhub 키가 없습니다.', 'missing token');
    this.token = token;
    this.baseUrl = opts?.baseUrl ?? FINNHUB_BASE_URL;
    const existing = limiterRegistry.get(token);
    this.limiter = existing ?? new RateLimiter({ maxPerSecond: 1 });
    if (!existing) limiterRegistry.set(token, this.limiter);
  }

  async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.limiter.acquire();
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('token', this.token);

    const res = await fetchWithTimeout(url.toString());
    if (res.status === 401 || res.status === 403) {
      throw new ExternalApiError('finnhub', 'Finnhub 키가 올바르지 않거나 권한이 없습니다.', `HTTP ${res.status}`);
    }
    if (res.status === 429) {
      throw new ExternalApiError('finnhub', 'Finnhub 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 'HTTP 429');
    }
    if (!res.ok) {
      throw new ExternalApiError('finnhub', 'Finnhub 호출에 실패했습니다.', `HTTP ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ExternalApiError('finnhub', 'Finnhub 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }
  }
}
