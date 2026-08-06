// 텔레그램 연결 상태 조회 + 슬롯 알림 토글/연결 해제 (D18).
// 연결 자체(토큰 등록·chat id 획득)는 ./connect/route.ts가 맡는다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { disconnect, loadTelegramSettings, setEnabledSlots, type TelegramSettings } from '@/lib/engine/telegram-settings';
import { telegramPatchSchema } from '@/lib/validation/engine';

/** botToken은 절대 포함하지 않는다 — 응답에 실릴 수 있는 필드만 골라낸다 */
function toStatus(settings: TelegramSettings) {
  return {
    connected: settings.chatId !== null,
    botUsername: settings.botUsername,
    chatId: settings.chatId,
    enabledSlotIds: settings.enabledSlotIds,
    lastError: settings.lastError,
  };
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const settings = await loadTelegramSettings(supabase, user.id);
    return NextResponse.json(toStatus(settings));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = telegramPatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }

    if (parsed.data.disconnect) {
      // 행 삭제 — 토큰·chat id·슬롯 설정이 함께 사라진다(의도된 동작)
      await disconnect(supabase, user.id);
    } else if (parsed.data.enabledSlotIds !== undefined) {
      await setEnabledSlots(supabase, user.id, parsed.data.enabledSlotIds);
    }

    const settings = await loadTelegramSettings(supabase, user.id);
    return NextResponse.json(toStatus(settings));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
