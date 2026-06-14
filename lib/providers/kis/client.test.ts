import { afterEach, describe, expect, it, vi } from 'vitest';
import { KisAuthError, KisRateLimitError } from '@/lib/errors';
import { KisClient } from '@/lib/providers/kis/client';

// 각 테스트가 독립된 레이트리밋/토큰 컨텍스트를 갖도록 앱키를 유니크하게 생성
let seq = 0;
function makeCreds() {
  seq += 1;
  return { appKey: `test-app-key-${seq}-${Math.floor(Math.random() * 1e9)}`, appSecret: 'test-secret-0123456789' };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TOKEN_OK = { access_token: 'tok-abc', expires_in: 86400, token_type: 'Bearer' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KisClient — 토큰 관리', () => {
  it('토큰을 캐시하고 같은 클라이언트의 연속 호출에 재사용한다 (발급 1회)', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) return jsonResponse(TOKEN_OK);
      return jsonResponse({ rt_cd: '0', output: { stck_prpr: '71200' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new KisClient(makeCreds());
    await client.request({ path: '/test', trId: 'T' });
    await client.request({ path: '/test', trId: 'T' });

    const tokenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('tokenP'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('동시 다발 호출에도 토큰 발급 요청은 1회로 병합된다 (1분 1회 제한 보호)', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) {
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(TOKEN_OK);
      }
      return jsonResponse({ rt_cd: '0', output: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new KisClient(makeCreds());
    await Promise.all(Array.from({ length: 5 }, () => client.getAccessToken()));
    const tokenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('tokenP'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('만료 토큰(EGW00123) 응답 시 재발급 후 1회 재시도한다', async () => {
    let apiCalls = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) return jsonResponse(TOKEN_OK);
      apiCalls += 1;
      if (apiCalls === 1) {
        return jsonResponse({ rt_cd: '1', msg_cd: 'EGW00123', msg1: '기간이 만료된 token' }, 500);
      }
      return jsonResponse({ rt_cd: '0', output: { ok: '1' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new KisClient(makeCreds());
    const result = await client.request<{ output?: { ok: string } }>({ path: '/test', trId: 'T' });
    expect(result.output?.ok).toBe('1');
    expect(apiCalls).toBe(2);
    // 재발급 포함 토큰 발급 2회
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('tokenP'))).toHaveLength(2);
  });

  it('잘못된 자격증명은 KisAuthError로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error_code: 'EGW00102', error_description: 'invalid' }, 403)),
    );
    const client = new KisClient(makeCreds());
    await expect(client.getAccessToken()).rejects.toBeInstanceOf(KisAuthError);
  });

  it('토큰 발급 1분 제한(EGW00133)은 KisRateLimitError로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error_code: 'EGW00133', error_description: 'too fast' }, 403)),
    );
    const client = new KisClient(makeCreds());
    await expect(client.getAccessToken()).rejects.toBeInstanceOf(KisRateLimitError);
  });

  it('앱키/시크릿 누락 생성자를 거부한다', () => {
    expect(() => new KisClient({ appKey: '', appSecret: '' })).toThrow();
  });
});

describe('KisClient — 비정상 응답 처리', () => {
  it('초당 한도 초과(EGW00201)는 1초 백오프 후 재시도하고, 재차 실패 시 KisRateLimitError', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) return jsonResponse(TOKEN_OK);
      return jsonResponse({ rt_cd: '1', msg_cd: 'EGW00201', msg1: '초당 거래건수 초과' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new KisClient(makeCreds());
    await expect(client.request({ path: '/test', trId: 'T' })).rejects.toBeInstanceOf(KisRateLimitError);
    // 원호출 + 재시도 1회
    expect(fetchMock.mock.calls.filter((c) => !String(c[0]).includes('tokenP'))).toHaveLength(2);
  }, 10_000);

  it('JSON이 아닌 응답을 명확한 오류로 변환한다', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) return jsonResponse(TOKEN_OK);
      return new Response('<html>gateway error</html>', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new KisClient(makeCreds());
    await expect(client.request({ path: '/test', trId: 'T' })).rejects.toThrow(/해석/);
  });

  it('rt_cd가 0이 아닌 업무 오류를 ExternalApiError로 변환한다', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/tokenP')) return jsonResponse(TOKEN_OK);
      return jsonResponse({ rt_cd: '7', msg_cd: 'OPSQ2000', msg1: '조회할 자료가 없습니다' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new KisClient(makeCreds());
    await expect(client.request({ path: '/test', trId: 'T' })).rejects.toThrow(/오류/);
  });

  it('네트워크 단절 시 사용자 메시지로 변환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const client = new KisClient(makeCreds());
    await expect(client.getAccessToken()).rejects.toThrow(/연결/);
  });
});
