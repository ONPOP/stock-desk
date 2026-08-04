// 분석 엔진 설정 (D16) — 슬라이드 저장 경로·보관기간·사용량 예산.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { loadEngineSettings } from '@/lib/engine/repository';
import { preflightRoot } from '@/lib/engine/storage-path';
import { engineSettingsPatchSchema } from '@/lib/validation/engine';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ settings: await loadEngineSettings(supabase, user.id) });
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
    const parsed = engineSettingsPatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }

    const patch = parsed.data;
    const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

    if (patch.slideStorageRoot !== undefined) {
      const raw = patch.slideStorageRoot;
      if (raw === null || raw === '') {
        row.slide_storage_root = null;
      } else {
        // 저장 전에 실제로 써 본다 — 화이트리스트·권한·볼륨 연결을 여기서 걸러야 슬롯이 조용히 실패하지 않는다
        const result = await preflightRoot(raw);
        if (!result.ok) throw new ValidationError(result.reason ?? '사용할 수 없는 경로입니다.');
        row.slide_storage_root = result.root;
      }
    }
    if (patch.retentionDays !== undefined) row.retention_days = patch.retentionDays;
    if (patch.telegramChatId !== undefined) row.telegram_chat_id = patch.telegramChatId || null;
    if (patch.maxStocksPerSlot !== undefined) row.max_stocks_per_slot = patch.maxStocksPerSlot;
    if (patch.maxSearchesPerStock !== undefined) row.max_searches_per_stock = patch.maxSearchesPerStock;

    const { error } = await supabase.from('engine_settings').upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(`엔진 설정 저장 실패: ${error.message}`);

    return NextResponse.json({ settings: await loadEngineSettings(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
