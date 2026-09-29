// 사용자 종목 등급(D22) — PUT 지정·수정, DELETE 해제. 목록은 /stocks RSC가 직접 로드한다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { deleteStockGrade, upsertStockGrade } from '@/lib/supabase/queries/stock-grades';
import { stockGradeStockIdSchema, stockGradeUpsertSchema } from '@/lib/validation/stock-grade';

export async function PUT(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = stockGradeUpsertSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const { stock_id, grade, reason } = parsed.data;
    const saved = await upsertStockGrade(supabase, user.id, stock_id, grade, reason);
    return NextResponse.json({ grade: saved });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = stockGradeStockIdSchema.safeParse(new URL(req.url).searchParams.get('stock_id'));
    if (!parsed.success) throw new ValidationError('stock_id가 필요합니다.');
    await deleteStockGrade(supabase, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
