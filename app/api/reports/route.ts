// 리포트 아카이브 조회 (D16) — 날짜별 슬롯 목록. 이미지는 /api/reports/slide 가 서빙한다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listReportsByDate } from '@/lib/supabase/queries/reports';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!DATE_RE.test(date)) throw new ValidationError('date는 YYYY-MM-DD 형식이어야 합니다.');
    const reports = await listReportsByDate(supabase, user.id, date);
    return NextResponse.json({ reports });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
