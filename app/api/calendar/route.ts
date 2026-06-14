// 캘린더 (F2) — GET(범위 목록), POST(수동 일정 또는 ?refresh=true 수집), DELETE(삭제).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listEvents, createEvent, deleteEvent } from '@/lib/supabase/queries/calendar';
import { refreshCalendar } from '@/lib/services/calendar';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD 입니다.');
const createSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력해주세요.').max(100),
    event_date: dateSchema,
    type: z.enum(['macro', 'earnings', 'custom']).optional(),
    stock_id: z.string().uuid().nullable().optional(),
    memo: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 2, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const def = monthRange();
    const from = searchParams.get('from') ?? def.from;
    const to = searchParams.get('to') ?? def.to;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new ValidationError('날짜 형식이 올바르지 않습니다.');
    }
    return NextResponse.json({ events: await listEvents(supabase, user.id, from, to) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (new URL(req.url).searchParams.get('refresh') === 'true') {
      const result = await refreshCalendar(supabase, user.id);
      const def = monthRange();
      return NextResponse.json({ result, events: await listEvents(supabase, user.id, def.from, def.to) });
    }
    const json = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const event = await createEvent(supabase, user.id, {
      title: parsed.data.title,
      eventDate: parsed.data.event_date,
      type: parsed.data.type,
      stockId: parsed.data.stock_id,
      memo: parsed.data.memo,
    });
    return NextResponse.json({ event });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) throw new ValidationError('삭제할 일정 ID가 올바르지 않습니다.');
    await deleteEvent(supabase, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
