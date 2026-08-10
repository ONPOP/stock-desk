// 텔레그램 발송 (D16) — 슬롯 요약 텍스트 + 대표 슬라이드 이미지.
// pptx 첨부 대신 sendPhoto를 쓴다: 모바일에서 바로 보이고, 원본은 앱 /reports에서 열람한다.

const API_BASE = 'https://api.telegram.org';
const TIMEOUT_MS = 20_000;

/**
 * 텔레그램 photo caption 표시 한도(공식 API 한도). sendPhoto·sendMediaGroup의 잘라내기와
 * notify.ts가 "caption에 다 들어가는지 vs 별도 전문 메시지가 필요한지" 판단하는 기준이
 * 반드시 같은 값을 봐야 한다 — 둘이 다르면 그 사이 구간에서 caption 끝부분이 전문 어디에도
 * 없이 조용히 잘려나간다.
 */
export const CAPTION_LIMIT = 1_024;

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramError';
  }
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * 봇 토큰·챗ID 해석 우선순위: 환경변수(TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID, 개발·긴급 우회용) 최우선,
 * 그다음 DB 설정(botTokenFromSettings·chatIdFromSettings — 호출부가 신규/구 테이블 우선순위를 이미 병합해 넘긴다).
 * 값은 로그에 남기지 않는다.
 */
export function resolveTelegramConfig(
  chatIdFromSettings: string | null,
  botTokenFromSettings?: string | null,
): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? botTokenFromSettings ?? undefined;
  const chatId = process.env.TELEGRAM_CHAT_ID ?? chatIdFromSettings ?? undefined;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/** 429(rate limit) 감지용 내부 신호 — retryAfterMs 대기 후 한 번만 재시도한다 */
class RetryableError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('telegram rate limited');
  }
}

function parseRetryAfterMs(bodyText: string): number {
  try {
    const parsed = JSON.parse(bodyText) as { parameters?: { retry_after?: number } };
    const seconds = parsed.parameters?.retry_after;
    return typeof seconds === 'number' && seconds > 0 ? seconds * 1_000 : 1_000;
  } catch {
    return 1_000;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let injectedFetch: typeof fetch | null = null;

/**
 * 배치 경로가 자기 HTTP 디스패처를 넣기 위한 스위치 (D19).
 *
 * Node 내장 fetch는 TLS 레코드가 손상되면 죽은 HTTP/2 세션을 프로세스가 끝날 때까지 붙들고 있어서,
 * 슬라이드 한 장이 실패하는 순간 남은 발송이 전부 `ERR_HTTP2_INVALID_SESSION`으로 죽는다
 * (2026-08-10 실측 · scripts/engine/http-dispatcher.ts). 장당 ~110KB를 10장 넘게 올리는 알림 경로가
 * 특히 위험하다.
 *
 * 기본값은 그대로 전역 fetch다 — Next 라우트(getMe·findChatId)는 아무 영향을 받지 않고,
 * undici가 웹 번들로 들어가지도 않는다. `null`을 넣으면 전역 fetch로 되돌린다.
 */
export function setTelegramFetch(impl: typeof fetch | null): void {
  injectedFetch = impl;
}

/** 주입값이 없으면 호출 시점의 전역 fetch를 쓴다(테스트의 stubGlobal이 그대로 통하도록) */
function httpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return (injectedFetch ?? globalThis.fetch)(input, init);
}

/**
 * 실제 fetch 1회. 토큰은 URL 조립에만 쓰고, 에러 메시지에는 마스킹해서만 남긴다.
 * `cfg.botToken`을 참조하지 않는 호출자(getMe·findChatId)도 이 함수를 거치면 동일하게 마스킹된다.
 */
async function request(botToken: string, method: string, body: BodyInit, headers?: HeadersInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await httpFetch(`${API_BASE}/bot${botToken}/${method}`, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new RetryableError(parseRetryAfterMs(text));
    }
    if (!res.ok) {
      // 마스킹 후 자르기: 먼저 자르면 토큰이 300자 경계에 걸쳤을 때 잘린 조각이 그대로 새어나간다
      const description = text.split(botToken).join('***').slice(0, 300);
      throw new TelegramError(`텔레그램 ${method} 실패 (http ${res.status}): ${description}`);
    }
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  } catch (err) {
    if (err instanceof TelegramError || err instanceof RetryableError) throw err;
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network';
    throw new TelegramError(`텔레그램 ${method} 호출 실패: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 429는 retry_after초 대기 후 한 번만 재시도한다. 두 번째도 429면 던진다 */
async function callWithRetry(botToken: string, method: string, body: BodyInit, headers?: HeadersInit): Promise<unknown> {
  try {
    return await request(botToken, method, body, headers);
  } catch (err) {
    if (!(err instanceof RetryableError)) throw err;
    await sleep(err.retryAfterMs);
    try {
      return await request(botToken, method, body, headers);
    } catch (err2) {
      if (err2 instanceof RetryableError) {
        throw new TelegramError(`텔레그램 ${method} 실패: 재시도 후에도 rate limit(429)`);
      }
      throw err2;
    }
  }
}

async function call(cfg: TelegramConfig, method: string, body: BodyInit, headers?: HeadersInit): Promise<void> {
  await callWithRetry(cfg.botToken, method, body, headers);
}

/** 봇 연결 확인. 토큰만으로 호출하므로 마스킹은 공용 request()가 처리한다 */
export async function getMe(botToken: string): Promise<{ username: string }> {
  const json = (await callWithRetry(botToken, 'getMe', JSON.stringify({}), {
    'Content-Type': 'application/json',
  })) as { result?: { username?: string } } | undefined;
  const username = json?.result?.username;
  if (!username) throw new TelegramError('텔레그램 getMe 응답에 username이 없습니다.');
  return { username };
}

/** getUpdates에서 가장 최근 메시지의 chat id. 없으면 null */
export async function findChatId(botToken: string): Promise<string | null> {
  const json = (await callWithRetry(botToken, 'getUpdates', JSON.stringify({}), {
    'Content-Type': 'application/json',
  })) as { result?: Array<{ message?: { chat?: { id?: number } } }> } | undefined;
  const updates = json?.result ?? [];
  const chatId = updates[updates.length - 1]?.message?.chat?.id;
  return typeof chatId === 'number' ? String(chatId) : null;
}

export async function sendMessage(cfg: TelegramConfig, text: string): Promise<void> {
  await call(
    cfg,
    'sendMessage',
    JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
    { 'Content-Type': 'application/json' },
  );
}

/**
 * 첨부 MIME은 파일명에서 유도한다.
 * 예전에는 'image/png'로 고정돼 있었는데, 슬라이드가 WebP로 바뀌면(D19) 바이트와 어긋난다.
 */
function photoMime(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'image/png';
}

export async function sendPhoto(
  cfg: TelegramConfig,
  photo: Uint8Array,
  filename: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  if (caption) form.append('caption', caption.slice(0, CAPTION_LIMIT));
  form.append('photo', new Blob([new Uint8Array(photo)], { type: photoMime(filename) }), filename);
  await call(cfg, 'sendPhoto', form);
}

/** 슬라이드 여러 장을 한 메시지로 묶어 보낸다. caption은 첫 장에만 붙는다 */
export async function sendMediaGroup(
  cfg: TelegramConfig,
  photos: Array<{ bytes: Uint8Array; filename: string }>,
  caption?: string,
): Promise<void> {
  if (photos.length < 2 || photos.length > 10) {
    throw new TelegramError(`sendMediaGroup은 2~10장만 지원합니다 (받은 개수: ${photos.length}).`);
  }
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  const media = photos.map((photo, index) => {
    const attachName = `photo${index}`;
    form.append(attachName, new Blob([new Uint8Array(photo.bytes)], { type: photoMime(photo.filename) }), photo.filename);
    return {
      type: 'photo' as const,
      media: `attach://${attachName}`,
      caption: index === 0 && caption ? caption.slice(0, CAPTION_LIMIT) : undefined,
    };
  });
  form.append('media', JSON.stringify(media));
  await call(cfg, 'sendMediaGroup', form);
}

/** 슬롯 실패 알림 — run_slot.sh의 각 단계가 실패하면 이걸로 알린다 */
export async function sendSlotError(cfg: TelegramConfig, slotId: string, step: string, reason: string): Promise<void> {
  await sendMessage(cfg, `⚠️ [${slotId}] ${step} 단계 실패\n${reason.slice(0, 800)}`);
}
