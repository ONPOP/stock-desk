// 텔레그램 봇 연결 — 2단계 흐름 (D18).
// 1단계(POST): 토큰을 getMe로 검증하고 chat_id=null 상태로 즉시 암호화 저장.
// 2단계(GET): 저장된 토큰으로 getUpdates를 1회 호출해 chat id를 찾는다. 대기 상태는
// 서버 메모리에 두지 않는다 — 폴링은 전적으로 클라이언트가 주도한다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { findChatId, getMe, sendMessage, TelegramError } from '@/lib/engine/telegram';
import { loadTelegramSettings, recordError, saveChatId, saveToken } from '@/lib/engine/telegram-settings';
import { telegramConnectSchema } from '@/lib/validation/engine';

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = telegramConnectSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '봇 토큰을 확인해주세요.');
    }
    const { botToken } = parsed.data;

    let username: string;
    try {
      ({ username } = await getMe(botToken));
    } catch (err) {
      // telegram.ts의 request()가 이미 토큰 문자열을 마스킹한 뒤 메시지를 만든다 — internal에만 남긴다
      const internal = err instanceof Error ? err.message : String(err);
      throw new ValidationError('텔레그램 봇 토큰이 올바르지 않습니다. 토큰을 다시 확인해주세요.', internal);
    }

    const botUsername = `@${username}`;
    await saveToken(supabase, user.id, botToken, botUsername);

    return NextResponse.json({ botUsername });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const settings = await loadTelegramSettings(supabase, user.id);
    if (!settings.botToken) {
      throw new ValidationError('먼저 봇 토큰을 등록하세요.');
    }
    const { botToken } = settings;

    // 이미 연결 완료된 상태면 텔레그램을 다시 부르지 않는다 — getUpdates가 offset 없이 항상
    // 같은 /start 메시지를 돌려주므로, 이 가드가 없으면 재폴링·중복 탭마다 saveChatId 재실행 +
    // "연결 완료" 테스트 메시지가 매번 다시 발송된다.
    if (settings.chatId) {
      return NextResponse.json({ chatId: settings.chatId, testMessageError: null });
    }

    // 네트워크 오류·rate limit 등은 "아직 못 찾음"과 동일하게 취급한다 — 클라이언트가 몇 초 뒤 재폴링한다
    const chatId = await findChatId(botToken).catch(() => null);
    if (!chatId) {
      return NextResponse.json({ chatId: null });
    }

    // chat id는 확보한 즉시 저장한다 — 뒤이은 테스트 메시지 발송이 실패해도 연결 자체는 남아야 한다
    await saveChatId(supabase, user.id, chatId);

    try {
      await sendMessage({ botToken, chatId }, '✅ Stock Desk 텔레그램 연결이 완료됐습니다.');
      await recordError(supabase, user.id, null);
      return NextResponse.json({ chatId, testMessageError: null });
    } catch (err) {
      // 연결됐다고 표시해 놓고 실제로는 못 보내는 상태가 최악이다 — 사유를 응답에 그대로 알린다
      const reason = err instanceof TelegramError ? err.message : '테스트 메시지 발송에 실패했습니다.';
      await recordError(supabase, user.id, reason).catch(() => undefined);
      return NextResponse.json({ chatId, testMessageError: reason });
    }
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
