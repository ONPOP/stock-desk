// DART OpenAPI 클라이언트 — 한국 공시·재무·배당 (PRD 11장, F4/F12/F15)
// 단일 인증키(crtfc_key). 레이트리밋은 KIS와 동일한 RateLimiter 재사용(보수적 초당 5건).
import { ExternalApiError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

export const DART_BASE_URL = 'https://opendart.fss.or.kr/api';
const REQUEST_TIMEOUT_MS = 15_000;

/** crtfc_key별 레이트리밋 큐 공유 (멀티유저 대비) */
const limiterRegistry = new Map<string, RateLimiter>();

/** DART status 코드 → 사용자 메시지. '000' 정상, '013' 데이터 없음(에러 아님) */
export class DartNoDataError extends Error {}

interface DartEnvelope {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('dart', 'DART 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.', 'timeout');
    }
    throw new ExternalApiError('dart', 'DART에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class DartClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(crtfcKey: string, opts?: { baseUrl?: string }) {
    if (!crtfcKey) throw new ExternalApiError('dart', 'DART 인증키가 없습니다.', 'missing crtfc_key');
    this.key = crtfcKey;
    this.baseUrl = opts?.baseUrl ?? DART_BASE_URL;
    const existing = limiterRegistry.get(this.key);
    this.limiter = existing ?? new RateLimiter({ maxPerSecond: 5 });
    if (!existing) limiterRegistry.set(this.key, this.limiter);
  }

  /** JSON 엔드포인트 호출. status '013'(데이터 없음)은 DartNoDataError로 변환해 호출부가 빈 결과로 처리하게 함. */
  async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.limiter.acquire();
    const url = new URL(`${this.baseUrl}/${path}`);
    url.searchParams.set('crtfc_key', this.key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetchWithTimeout(url.toString());
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      throw new ExternalApiError('dart', 'DART 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }
    const env = data as DartEnvelope;
    const status = String(env.status ?? '');
    if (status === '013') {
      throw new DartNoDataError(env.message ?? '조회된 데이터가 없습니다.');
    }
    if (status === '020' || status === '021') {
      throw new ExternalApiError('dart', 'DART API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', `status=${status}`);
    }
    if (status === '010' || status === '011' || status === '012') {
      throw new ExternalApiError('dart', 'DART 인증키가 올바르지 않거나 사용할 수 없습니다.', `status=${status}`);
    }
    if (status !== '000') {
      throw new ExternalApiError('dart', 'DART가 오류를 반환했습니다.', `status=${status} ${String(env.message ?? '')}`);
    }
    return data;
  }

  /** 바이너리(zip 등) 다운로드 — corpCode.xml용 */
  async getBuffer(path: string, params: Record<string, string>): Promise<ArrayBuffer> {
    await this.limiter.acquire();
    const url = new URL(`${this.baseUrl}/${path}`);
    url.searchParams.set('crtfc_key', this.key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      throw new ExternalApiError('dart', 'DART 파일 다운로드에 실패했습니다.', `HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  }
}
