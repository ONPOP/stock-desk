// F13 투자 노트 — GET(목록·검색), POST(작성), DELETE(삭제).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listNotes, createNote, updateNote, deleteNote } from '@/lib/supabase/queries/notes';
import { noteCreateSchema, noteUpdateSchema, noteQuerySchema } from '@/lib/validation/note';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const parsed = noteQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      stock_id: searchParams.get('stock_id') ?? undefined,
    });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const notes = await listNotes(supabase, user.id, { q: parsed.data.q, stockId: parsed.data.stock_id });
    return NextResponse.json({ notes });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = noteCreateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const note = await createNote(supabase, user.id, parsed.data);
    return NextResponse.json({ note });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) throw new ValidationError('수정할 노트 ID가 올바르지 않습니다.');
    const json = await req.json().catch(() => null);
    const parsed = noteUpdateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    const note = await updateNote(supabase, user.id, idParsed.data, parsed.data.content_md);
    return NextResponse.json({ note });
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
    if (!parsed.success) throw new ValidationError('삭제할 노트 ID가 올바르지 않습니다.');
    await deleteNote(supabase, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
