// 나만의 투자 규칙 API (D21) — 조회/추가/수정/순서 변경/삭제. RLS로 user_id 격리.
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { deleteRule, insertRule, listRules, reorderRules, updateRule } from '@/lib/supabase/queries/journal';
import { ruleCreateSchema, ruleReorderSchema, ruleUpdateSchema } from '@/lib/validation/journal';

async function parse<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
  return parsed.data;
}

function fail(e: unknown) {
  const { body, status } = toErrorResponse(e);
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ rules: await listRules(supabase, user.id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { content } = await parse(req, ruleCreateSchema);
    return NextResponse.json({ rule: await insertRule(supabase, user.id, content) });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { id, content } = await parse(req, ruleUpdateSchema);
    return NextResponse.json({ rule: await updateRule(supabase, user.id, id, content) });
  } catch (e) {
    return fail(e);
  }
}

/** 순서 변경 — ids 순서대로 저장 */
export async function PUT(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { ids } = await parse(req, ruleReorderSchema);
    await reorderRules(supabase, user.id, ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) throw new ValidationError('삭제할 규칙 id가 필요합니다.');
    await deleteRule(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
