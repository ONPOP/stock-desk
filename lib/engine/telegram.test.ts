// 텔레그램 봇 연결 조회(getMe·findChatId)·미디어그룹 전송 테스트.
// global.fetch를 스텁해 실제 네트워크 없이 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTION_LIMIT,
  findChatId,
  getMe,
  sendMediaGroup,
  sendPhoto,
  setTelegramFetch,
  TelegramError,
  type TelegramConfig,
} from './telegram';

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
  setTelegramFetch(null);
});

describe('setTelegramFetch', () => {
  it('주입한 구현으로 보내고, null로 되돌리면 다시 전역 fetch를 쓴다', async () => {
    const injected = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    const global = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal('fetch', global);

    setTelegramFetch(injected as unknown as typeof fetch);
    await sendPhoto(cfg, new Uint8Array([1, 2, 3]), '01.webp');
    expect(injected).toHaveBeenCalledTimes(1);
    expect(global).not.toHaveBeenCalled();

    setTelegramFetch(null);
    await sendPhoto(cfg, new Uint8Array([1, 2, 3]), '01.webp');
    expect(injected).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledTimes(1);
  });
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

  it('토큰이 300자 절단 경계에 걸쳐도 조각째 새어나가지 않는다(마스킹 후 자르기)', async () => {
    // 토큰 시작 위치를 300 이전, 끝 위치를 300 이후에 두어 "먼저 자르고 마스킹" 순서였다면
    // 토큰 앞부분(예: '123456:AA')만 잘린 채 마스킹을 피해가는 것을 재현한다.
    const prefix = 'x'.repeat(290); // 290 + TOKEN(28) = 318 > 300, 토큰이 경계를 가로지른다
    const body = `${prefix}${TOKEN}${'y'.repeat(200)}`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 401 })));

    let caught: unknown;
    try {
      await getMe(TOKEN);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TelegramError);
    const message = (caught as Error).message;
    expect(message).not.toContain(TOKEN);
    // 토큰의 앞부분 조각도 새어나가면 안 된다 (버그: slice(0,300) 후 마스킹하면 이 부분 문자열이 남는다)
    expect(message).not.toContain(TOKEN.slice(0, 10));
    expect(message).toContain('***');
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

describe('첨부 MIME', () => {
  function formOf(fetchMock: ReturnType<typeof vi.fn>): FormData {
    return (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
  }

  it('sendPhoto는 파일 확장자에 맞는 MIME으로 첨부한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await sendPhoto(cfg, new Uint8Array([1]), '01.webp');

    expect((formOf(fetchMock).get('photo') as File).type).toBe('image/webp');
  });

  it('sendMediaGroup도 항목마다 확장자에 맞춘다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await sendMediaGroup(cfg, [
      { bytes: new Uint8Array([1]), filename: '01.webp' },
      { bytes: new Uint8Array([2]), filename: '02.jpg' },
    ]);

    const form = formOf(fetchMock);
    expect((form.get('photo0') as File).type).toBe('image/webp');
    expect((form.get('photo1') as File).type).toBe('image/jpeg');
  });

  it('모르는 확장자는 image/png로 둔다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await sendPhoto(cfg, new Uint8Array([1]), 'slide');

    expect((formOf(fetchMock).get('photo') as File).type).toBe('image/png');
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

  it('caption이 1,000~1,024자 구간이면 잘리지 않고 전체가 실린다 (CAPTION_LIMIT과 정합)', async () => {
    // notify.ts는 CAPTION_LIMIT(1024) 이하면 caption 하나로 충분하다고 판단해 별도 전문 메시지를
    // 보내지 않는다. sendMediaGroup 내부가 그보다 더 짧게(과거엔 1000자) 잘라버리면 그 구간의
    // 끝부분이 전문 어디에도 없이 사라진다 — 그 회귀를 막는 테스트.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const caption = 'A'.repeat(1_010);
    expect(caption.length).toBeGreaterThan(1_000);
    expect(caption.length).toBeLessThanOrEqual(CAPTION_LIMIT);

    const photos = [
      { bytes: new Uint8Array([1]), filename: 'a.png' },
      { bytes: new Uint8Array([2]), filename: 'b.png' },
    ];
    await sendMediaGroup(cfg, photos, caption);

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    const media = JSON.parse(form.get('media') as string) as Array<{ caption?: string }>;
    expect(media[0].caption).toBe(caption);
    expect(media[0].caption).toHaveLength(1_010);
  });

  it('caption이 CAPTION_LIMIT을 넘으면 정확히 그 길이로 자른다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const caption = 'B'.repeat(CAPTION_LIMIT + 50);

    const photos = [
      { bytes: new Uint8Array([1]), filename: 'a.png' },
      { bytes: new Uint8Array([2]), filename: 'b.png' },
    ];
    await sendMediaGroup(cfg, photos, caption);

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    const media = JSON.parse(form.get('media') as string) as Array<{ caption?: string }>;
    expect(media[0].caption).toHaveLength(CAPTION_LIMIT);
  });
});

describe('sendPhoto', () => {
  it('caption이 1,000~1,024자 구간이면 잘리지 않는다 (sendMediaGroup과 동일한 한도)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const caption = 'A'.repeat(1_010);

    await sendPhoto(cfg, new Uint8Array([1]), 'a.png', caption);

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get('caption')).toBe(caption);
  });

  it('caption이 CAPTION_LIMIT을 넘으면 그 길이로 자른다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const caption = 'B'.repeat(CAPTION_LIMIT + 50);

    await sendPhoto(cfg, new Uint8Array([1]), 'a.png', caption);

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect((form.get('caption') as string)).toHaveLength(CAPTION_LIMIT);
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
