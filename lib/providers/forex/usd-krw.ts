// USD/KRW 환율 폴백 소스 — Yahoo 비공식 API가 레이트리밋(429)으로 환율을 못 줄 때 보강한다.
// 키 불필요 무료 API(open.er-api.com). 전일 대비 정보는 제공하지 않아 변동값은 0으로 둔다.
import 'server-only';

interface ErApiResponse {
  result?: string;
  rates?: { KRW?: number };
}

const TIMEOUT_MS = 8_000;
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

/** USD 기준 KRW 환율. 실패 시 null(호출부가 다른 소스/캐시로 보류). */
export async function fetchUsdKrwFallback(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as ErApiResponse;
    const krw = data.rates?.KRW;
    return data.result === 'success' && typeof krw === 'number' && krw > 0 ? krw : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
