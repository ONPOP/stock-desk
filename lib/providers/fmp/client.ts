// FMP(Financial Modeling Prep) 클라이언트 — 미국 배당 (PRD 11장, F15). 무료티어 일 250 calls.
import { ExternalApiError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

// stable API — 신규 무료 키는 legacy v3(api/v3)가 403이므로 stable을 사용 (D9, 2026 정책 변경)
export const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const REQUEST_TIMEOUT_MS = 12_000;

const limiterRegistry = new Map<string, RateLimiter>();

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('fmp', 'FMP 응답이 지연되고 있습니다.', 'timeout');
    }
    throw new ExternalApiError('fmp', 'FMP에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class FmpClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(apiKey: string, opts?: { baseUrl?: string }) {
    if (!apiKey) throw new ExternalApiError('fmp', 'FMP 키가 없습니다.', 'missing apikey');
    this.key = apiKey;
    this.baseUrl = opts?.baseUrl ?? FMP_BASE_URL;
    const existing = limiterRegistry.get(apiKey);
    this.limiter = existing ?? new RateLimiter({ maxPerSecond: 4 });
    if (!existing) limiterRegistry.set(apiKey, this.limiter);
  }

  async getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.limiter.acquire();
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    url.searchParams.set('apikey', this.key);

    const res = await fetchWithTimeout(url.toString());
    if (res.status === 401 || res.status === 403) {
      throw new ExternalApiError('fmp', 'FMP 키가 올바르지 않거나 권한이 없습니다.', `HTTP ${res.status}`);
    }
    if (res.status === 429) {
      throw new ExternalApiError('fmp', 'FMP 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 'HTTP 429');
    }
    if (!res.ok) {
      throw new ExternalApiError('fmp', 'FMP 호출에 실패했습니다.', `HTTP ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ExternalApiError('fmp', 'FMP 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }
  }
}
