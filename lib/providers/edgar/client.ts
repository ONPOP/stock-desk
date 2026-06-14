// SEC EDGAR 클라이언트 — 미국 공시 (PRD 11장, F12). 무인증이나 User-Agent 헤더 필수(없으면 403).
// SEC 요청 한도 10 req/sec → RateLimiter 재사용.
import { ExternalApiError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

const REQUEST_TIMEOUT_MS = 12_000;
// SEC 가이드라인: User-Agent에 식별 정보 권장. 운영 시 SEC_EDGAR_USER_AGENT로 연락처 지정.
const DEFAULT_UA = 'StockDesk/1.0 (contact: admin@stock-desk.local)';

const limiter = new RateLimiter({ maxPerSecond: 10 });

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || DEFAULT_UA;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'user-agent': userAgent(), accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('edgar', 'SEC EDGAR 응답이 지연되고 있습니다.', 'timeout');
    }
    throw new ExternalApiError('edgar', 'SEC EDGAR에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class EdgarClient {
  async getJson<T>(absoluteUrl: string): Promise<T> {
    await limiter.acquire();
    const res = await fetchWithTimeout(absoluteUrl);
    if (res.status === 403) {
      throw new ExternalApiError('edgar', 'SEC EDGAR 접근이 거부되었습니다. (User-Agent 확인 필요)', 'HTTP 403');
    }
    if (res.status === 429) {
      throw new ExternalApiError('edgar', 'SEC EDGAR 호출 한도를 초과했습니다.', 'HTTP 429');
    }
    if (res.status === 404) {
      throw new ExternalApiError('edgar', 'SEC EDGAR에서 종목을 찾을 수 없습니다.', 'HTTP 404');
    }
    if (!res.ok) {
      throw new ExternalApiError('edgar', 'SEC EDGAR 호출에 실패했습니다.', `HTTP ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ExternalApiError('edgar', 'SEC EDGAR 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }
  }
}
