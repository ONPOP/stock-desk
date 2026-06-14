// KIS OpenAPI 클라이언트 — 토큰·레이트리밋 중앙 관리 (PRD 16장, D3)
import { createHash } from 'node:crypto';
import { ExternalApiError, KisAuthError, KisRateLimitError } from '@/lib/errors';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';
import { InMemoryTokenStore, type TokenStore } from '@/lib/providers/kis/token-store';

export const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

/** 토큰 만료 10분 전부터 선제 재발급 */
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface KisCredentials {
  appKey: string;
  appSecret: string;
}

export interface KisRequestOptions {
  method?: 'GET' | 'POST';
  path: string;
  trId: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface KisEnvelope {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  [key: string]: unknown;
}

// 앱키별 레이트리밋 큐·인플라이트 토큰 발급 공유 (멀티유저: 키마다 독립 한도)
const limiterRegistry = new Map<string, RateLimiter>();
const inflightTokenRequests = new Map<string, Promise<string>>();

function keyHash(appKey: string): string {
  return createHash('sha256').update(appKey).digest('hex').slice(0, 16);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('kis', 'KIS API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.', 'timeout');
    }
    throw new ExternalApiError('kis', 'KIS API에 연결할 수 없습니다.', String(e));
  } finally {
    clearTimeout(timer);
  }
}

export class KisClient {
  private readonly creds: KisCredentials;
  private readonly tokenStore: TokenStore;
  private readonly baseUrl: string;
  private readonly cacheKey: string;
  private readonly limiter: RateLimiter;

  constructor(creds: KisCredentials, opts?: { tokenStore?: TokenStore; baseUrl?: string }) {
    if (!creds.appKey || !creds.appSecret) {
      throw new KisAuthError('appKey/appSecret 누락');
    }
    this.creds = creds;
    this.tokenStore = opts?.tokenStore ?? new InMemoryTokenStore();
    this.baseUrl = opts?.baseUrl ?? KIS_BASE_URL;
    this.cacheKey = keyHash(creds.appKey);
    const existing = limiterRegistry.get(this.cacheKey);
    if (existing) {
      this.limiter = existing;
    } else {
      this.limiter = new RateLimiter({ maxPerSecond: 20 });
      limiterRegistry.set(this.cacheKey, this.limiter);
    }
  }

  /** 캐시 우선 토큰 확보. 동시 호출 시 발급 요청은 1회로 병합(KIS 1분 1회 제한 보호). */
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.tokenStore.get(this.cacheKey);
      if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
        return cached.accessToken;
      }
    }
    const inflight = inflightTokenRequests.get(this.cacheKey);
    if (inflight) return inflight;

    const issue = this.issueToken().finally(() => {
      inflightTokenRequests.delete(this.cacheKey);
    });
    inflightTokenRequests.set(this.cacheKey, issue);
    return issue;
  }

  private async issueToken(): Promise<string> {
    await this.limiter.acquire();
    const res = await fetchWithTimeout(`${this.baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.creds.appKey,
        appsecret: this.creds.appSecret,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof data.access_token !== 'string') {
      const code = String(data.error_code ?? data.msg_cd ?? res.status);
      if (code === 'EGW00133') {
        throw new KisRateLimitError('토큰 발급 1분 1회 제한 (EGW00133)');
      }
      throw new KisAuthError(`토큰 발급 실패: ${code} ${String(data.error_description ?? data.msg1 ?? '')}`);
    }
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 86_400;
    await this.tokenStore.set(this.cacheKey, {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInSec * 1000,
    });
    return data.access_token;
  }

  /**
   * 인증·레이트리밋·재시도가 적용된 KIS API 호출.
   * - 토큰 만료/무효(EGW00123, EGW00121): 강제 재발급 후 1회 재시도
   * - 초당 한도 초과(EGW00201): 1초 백오프 후 1회 재시도
   */
  async request<T extends KisEnvelope>(opts: KisRequestOptions, _retried = false): Promise<T> {
    const token = await this.getAccessToken();
    await this.limiter.acquire();

    const url = new URL(this.baseUrl + opts.path);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      url.searchParams.set(k, v);
    }
    const res = await fetchWithTimeout(url.toString(), {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: this.creds.appKey,
        appsecret: this.creds.appSecret,
        tr_id: opts.trId,
        custtype: 'P',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    let data: KisEnvelope;
    try {
      data = (await res.json()) as KisEnvelope;
    } catch {
      throw new ExternalApiError('kis', 'KIS API 응답을 해석할 수 없습니다.', `HTTP ${res.status} non-JSON`);
    }

    const msgCd = String(data.msg_cd ?? '');
    const tokenInvalid = res.status === 401 || msgCd === 'EGW00123' || msgCd === 'EGW00121';
    if (tokenInvalid && !_retried) {
      await this.tokenStore.delete(this.cacheKey);
      await this.getAccessToken(true);
      return this.request<T>(opts, true);
    }
    const rateLimited = res.status === 429 || msgCd === 'EGW00201';
    if (rateLimited) {
      if (_retried) throw new KisRateLimitError(`재시도 후에도 한도 초과 (${msgCd})`);
      await new Promise((r) => setTimeout(r, 1000));
      return this.request<T>(opts, true);
    }
    if (!res.ok) {
      throw new ExternalApiError('kis', 'KIS API 호출에 실패했습니다.', `HTTP ${res.status} ${msgCd} ${String(data.msg1 ?? '')}`);
    }
    if (data.rt_cd !== undefined && data.rt_cd !== '0') {
      if (tokenInvalid) throw new KisAuthError(`${msgCd} ${String(data.msg1 ?? '')}`);
      throw new ExternalApiError('kis', 'KIS API가 오류를 반환했습니다.', `rt_cd=${data.rt_cd} ${msgCd} ${String(data.msg1 ?? '')}`);
    }
    return data as T;
  }
}
