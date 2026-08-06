// 텔레그램 봇 연결 조회(getMe·findChatId)·미디어그룹 전송 테스트.
// global.fetch를 스텁해 실제 네트워크 없이 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findChatId, getMe, sendMediaGroup, TelegramError, type TelegramConfig } from './telegram';

const TOKEN = '123456:AA-secret-token-value';
const cfg: TelegramConfig = { botToken: TOKEN, chatId: '999' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function rateLimitResponse(retryAfterSec: number): Response {
  return jsonResponse({ ok: false, error_code: 429, parameters: { retry_after: retryAfterSec } }, 429);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getMe', () => {
  it('200 응답이면 username을 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ ok: true, result: { id: 1, is_bot: true, first_name: 'X', username: 'x_bot' } }),
      ),
    );

    await expect(getMe(TOKEN)).resolves.toEqual({ username: 'x_bot' });
  });

  it('401이면 TelegramError를 던지고 메시지에 토큰 문자열이 없다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`unauthorized: token=${TOKEN}`, { status: 401 })));

    let caught: unknown;
    try {
      await getMe(TOKEN);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TelegramError);
    expect((caught as Error).message).not.toContain(TOKEN);
  });
});

describe('findChatId', () => {
  it('업데이트가 있으면 가장 최근 메시지의 chat id를 문자열로 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          result: [
            { update_id: 1, message: { chat: { id: 111 }, text: 'hi' } },
            { update_id: 2, message: { chat: { id: 222 }, text: 'hello' } },
          ],
        }),
      ),
    );

    await expect(findChatId(TOKEN)).resolves.toBe('222');
  });

  it('업데이트가 없으면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] })));

    await expect(findChatId(TOKEN)).resolves.toBeNull();
  });
});

describe('sendMediaGroup', () => {
  it('사진 3장을 fetch 1회로 보내고, FormData에 media JSON과 첨부 3개가 실린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const photos = [
      { bytes: new Uint8Array([1]), filename: 'a.png' },
      { bytes: new Uint8Array([2]), filename: 'b.png' },
      { bytes: new Uint8Array([3]), filename: 'c.png' },
    ];
    await sendMediaGroup(cfg, photos);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    const media = JSON.parse(form.get('media') as string) as Array<{ type: string; media: string }>;
    expect(media).toHaveLength(3);
    expect(media.every((m) => m.type === 'photo')).toBe(true);
    for (const item of media) {
      const attachName = item.media.replace('attach://', '');
      expect(form.get(attachName)).toBeTruthy();
    }
  });

  it('caption은 첫 항목에만 붙는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const photos = [
      { bytes: new Uint8Array([1]), filename: 'a.png' },
      { bytes: new Uint8Array([2]), filename: 'b.png' },
    ];
    await sendMediaGroup(cfg, photos, '캡션');

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    const media = JSON.parse(form.get('media') as string) as Array<{ caption?: string }>;
    expect(media[0].caption).toBe('캡션');
    expect(media[1].caption).toBeUndefined();
  });

  it('1장이면 호출 전에 TelegramError로 거부한다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendMediaGroup(cfg, [{ bytes: new Uint8Array([1]), filename: 'a.png' }])).rejects.toThrow(
      TelegramError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('11장이면 호출 전에 TelegramError로 거부한다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const photos = Array.from({ length: 11 }, (_, i) => ({ bytes: new Uint8Array([i]), filename: `${i}.png` }));
    await expect(sendMediaGroup(cfg, photos)).rejects.toThrow(TelegramError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('429 재시도', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retry_after초 대기 후 재시도해 성공한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse(1))
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: { username: 'x_bot' } }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getMe(TOKEN);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toEqual({ username: 'x_bot' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429가 두 번이면 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimitResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getMe(TOKEN);
    const assertion = expect(promise).rejects.toThrow(TelegramError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
