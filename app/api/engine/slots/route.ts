// 슬롯 스케줄 (D16) — 목록 조회 / 전체 저장.
// 저장은 전체 교체 방식: UI가 보고 있던 목록을 그대로 반영해 부분 수정 시의 상태 불일치를 없앤다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listSlots } from '@/lib/supabase/queries/engine-config';
import { parseCron } from '@/lib/engine/launchd';
import { slotsPutSchema } from '@/lib/validation/engine';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ slots: await listSlots(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = slotsPutSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }

    const { slots } = parsed.data;
    const ids = new Set<string>();
    for (const s of slots) {
      if (ids.has(s.slotId)) throw new ValidationError(`슬롯 ID가 중복됩니다: ${s.slotId}`);
      ids.add(s.slotId);
      // launchd plist로 변환 가능한 크론만 받는다 — 저장 후 동기화에서 터지는 것보다 낫다
      try {
        parseCron(s.cronKst);
      } catch (err) {
        throw new ValidationError(
          `${s.label}: ${err instanceof Error ? err.message : '시각이 올바르지 않습니다.'}`,
        );
      }
    }

    const rows = slots.map((s) => ({
      user_id: user.id,
      slot_id: s.slotId,
      label: s.label,
      cron_kst: s.cronKst,
      market: s.market,
      slot_type: s.slotType,
      enabled: s.enabled,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('schedule_slots').upsert(rows, { onConflict: 'user_id,slot_id' });
      if (error) throw new Error(`슬롯 저장 실패: ${error.message}`);
    }

    // 목록에서 빠진 슬롯은 삭제 (UI에서 지운 것)
    const existing = await listSlots(supabase, user.id);
    const removed = existing.filter((e) => !ids.has(e.slotId)).map((e) => e.slotId);
    if (removed.length > 0) {
      const { error } = await supabase
        .from('schedule_slots')
        .delete()
        .eq('user_id', user.id)
        .in('slot_id', removed);
      if (error) throw new Error(`슬롯 삭제 실패: ${error.message}`);
    }

    return NextResponse.json({ slots: await listSlots(supabase, user.id), removed });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
