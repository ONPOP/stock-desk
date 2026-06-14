import { describe, it, expect, vi, afterEach } from 'vitest';
import { DartClient, DartNoDataError } from './client';
import { ExternalApiError } from '@/lib/errors';

function stubFetch(body: unknown, opts: { raw?: string } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        if (opts.raw !== undefined) throw new Error('non-json');
        return body;
      },
    })),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('DartClient.getJson — status 처리', () => {
  it('인증키 없으면 생성 시 throw', () => {
    expect(() => new DartClient('')).toThrow(ExternalApiError);
  });

  it("'000' 정상 응답 반환", async () => {
    stubFetch({ status: '000', list: [{ a: 1 }] });
    const data = await new DartClient('k').getJson<{ list: unknown[] }>('list.json', {});
    expect(data.list).toHaveLength(1);
  });

  it("'013'은 DartNoDataError", async () => {
    stubFetch({ status: '013', message: '없음' });
    await expect(new DartClient('k').getJson('list.json', {})).rejects.toBeInstanceOf(DartNoDataError);
  });

  it("'020'(한도초과)·'010'(키오류)는 ExternalApiError", async () => {
    stubFetch({ status: '020' });
    await expect(new DartClient('k').getJson('list.json', {})).rejects.toBeInstanceOf(ExternalApiError);
    stubFetch({ status: '010' });
    await expect(new DartClient('k').getJson('list.json', {})).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('비JSON 응답은 ExternalApiError', async () => {
    stubFetch(null, { raw: '<html>error</html>' });
    await expect(new DartClient('k').getJson('list.json', {})).rejects.toBeInstanceOf(ExternalApiError);
  });
});
