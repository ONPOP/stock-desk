import { describe, it, expect, vi, afterEach } from 'vitest';
import { KisClient } from './client';
import { InMemoryTokenStore } from './token-store';
import { getKisDomesticMetrics } from './metrics';
import { ExternalApiError } from '@/lib/errors';

// tokenP → 토큰 발급, inquire-price → 지표 output 으로 분기
function stubKisFetch(output: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('tokenP')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 86400 }) };
      }
      return { ok: true, status: 200, json: async () => ({ rt_cd: '0', output }) };
    }),
  );
}
function client() {
  return new KisClient({ appKey: 'k', appSecret: 's' }, { tokenStore: new InMemoryTokenStore() });
}
afterEach(() => vi.unstubAllGlobals());

describe('getKisDomesticMetrics', () => {
  it('PER/PBR/EPS + 시가총액(억원→원)', async () => {
    stubKisFetch({ per: '28.50', pbr: '45.20', eps: '6130', hts_avls: '4730000' });
    const m = await getKisDomesticMetrics(client(), '005930');
    expect(m.per).toBe(28.5);
    expect(m.pbr).toBe(45.2);
    expect(m.eps).toBe(6130);
    expect(m.marketCap).toBe(473_000_000_000_000); // 4,730,000억 × 1e8
  });

  it('0 값은 미산출로 null 처리', async () => {
    stubKisFetch({ per: '0.00', pbr: '0', eps: '0', hts_avls: '0' });
    const m = await getKisDomesticMetrics(client(), '005930');
    expect(m.per).toBeNull();
    expect(m.marketCap).toBeNull();
  });

  it('국내 6자리 아닌 티커는 ExternalApiError', async () => {
    stubKisFetch({ per: '1' });
    await expect(getKisDomesticMetrics(client(), 'AAPL')).rejects.toBeInstanceOf(ExternalApiError);
  });
});
