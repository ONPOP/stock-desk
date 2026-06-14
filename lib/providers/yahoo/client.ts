// Yahoo Finance 비공식 엔드포인트 호출 래퍼.
// 인증은 없으나 비공식 API라 429/5xx가 잦아, query1↔query2 호스트 폴백으로 방어한다.
import { ExternalApiError } from '@/lib/errors';

const DEFAULT_TIMEOUT_MS = 10_000;

// 동일 응답을 주는 두 미러. 한쪽이 레이트리밋(429)이면 다른 쪽으로 폴백한다.
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// 빈 User-Agent는 Yahoo가 차단하므로 일반 브라우저 UA를 보낸다.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

/** path는 선행 슬래시를 포함한 경로+쿼리 (예: "/v8/finance/chart/AAPL?interval=1d&range=1d") */
export async function fetchYahooJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let lastError: ExternalApiError | undefined;

  for (const host of HOSTS) {
    const url = `https://${host}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network';
      // 네트워크/타임아웃은 일시적일 수 있어 다음 호스트로 폴백
      lastError = new ExternalApiError('yahoo', 'Yahoo Finance에 연결할 수 없습니다.', `fetch ${reason}: ${host}`);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (isTransient(res.status)) {
      lastError = new ExternalApiError('yahoo', 'Yahoo Finance가 일시적으로 응답하지 않습니다.', `http ${res.status}: ${host}`);
      continue; // 다음 미러 시도
    }
    if (!res.ok) {
      // 4xx(404 등)는 폴백해도 동일하므로 즉시 실패시킨다
      throw new ExternalApiError('yahoo', 'Yahoo Finance가 오류를 반환했습니다.', `http ${res.status}: ${url}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ExternalApiError('yahoo', 'Yahoo Finance 응답을 해석할 수 없습니다.', `non-JSON response: ${url}`);
    }
  }

  throw lastError ?? new ExternalApiError('yahoo', 'Yahoo Finance에 연결할 수 없습니다.', 'all hosts failed');
}
