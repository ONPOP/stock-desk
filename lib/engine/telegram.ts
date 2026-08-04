// 텔레그램 발송 (D16) — 슬롯 요약 텍스트 + 대표 슬라이드 이미지.
// pptx 첨부 대신 sendPhoto를 쓴다: 모바일에서 바로 보이고, 원본은 앱 /reports에서 열람한다.

const API_BASE = 'https://api.telegram.org';
const TIMEOUT_MS = 20_000;

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

/** 봇 토큰·챗ID는 환경변수(우선) 또는 engine_settings에서. 값은 로그에 남기지 않는다 */
export function resolveTelegramConfig(chatIdFromSettings: string | null): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID ?? chatIdFromSettings ?? undefined;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

async function call(cfg: TelegramConfig, method: string, body: BodyInit, headers?: HeadersInit): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/bot${cfg.botToken}/${method}`, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      // 응답 본문에 토큰이 섞이지 않도록 상태코드와 description만 노출
      const detail = await res.text().catch(() => '');
      const description = detail.slice(0, 300).replace(cfg.botToken, '***');
      throw new TelegramError(`텔레그램 ${method} 실패 (http ${res.status}): ${description}`);
    }
  } catch (err) {
    if (err instanceof TelegramError) throw err;
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network';
    throw new TelegramError(`텔레그램 ${method} 호출 실패: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMessage(cfg: TelegramConfig, text: string): Promise<void> {
  await call(
    cfg,
    'sendMessage',
    JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
    { 'Content-Type': 'application/json' },
  );
}

export async function sendPhoto(
  cfg: TelegramConfig,
  photo: Uint8Array,
  filename: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  if (caption) form.append('caption', caption.slice(0, 1_000));
  form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), filename);
  await call(cfg, 'sendPhoto', form);
}

/** 슬롯 실패 알림 — run_slot.sh의 각 단계가 실패하면 이걸로 알린다 */
export async function sendSlotError(cfg: TelegramConfig, slotId: string, step: string, reason: string): Promise<void> {
  await sendMessage(cfg, `⚠️ [${slotId}] ${step} 단계 실패\n${reason.slice(0, 800)}`);
}
