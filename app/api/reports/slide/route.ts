// 슬라이드 이미지 서빙 (D16) — 로컬(외장 볼륨 포함)에 저장된 PNG를 인증된 사용자에게만 스트리밍.
// 클라이언트는 파일 경로를 지정할 수 없다: reportId + index로만 접근하고 경로는 DB의 slide_paths에서 온다.
// (경로 traversal 차단 — resolveStoredFile이 저장 루트 밖 경로를 거부한다)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { NotFoundError, toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getReport } from '@/lib/supabase/queries/reports';
import { loadEngineSettings } from '@/lib/engine/repository';
import { resolveStorageRoot, resolveStoredFile } from '@/lib/engine/storage-path';

const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), 'data/runs');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get('report') ?? '';
    const index = Number(searchParams.get('n'));

    if (!UUID_RE.test(reportId)) throw new ValidationError('report 파라미터가 올바르지 않습니다.');
    if (!Number.isInteger(index) || index < 0) throw new ValidationError('n 파라미터가 올바르지 않습니다.');

    const report = await getReport(supabase, user.id, reportId);
    if (!report) throw new NotFoundError('리포트를 찾을 수 없습니다.');
    const rel = report.slidePaths[index];
    if (!rel) throw new NotFoundError('슬라이드를 찾을 수 없습니다.');

    const settings = await loadEngineSettings(supabase, user.id);
    const storage = await resolveStorageRoot({
      configured: settings.slideStorageRoot,
      envRoot: process.env.SLIDE_STORAGE_ROOT ?? null,
      defaultRoot: DEFAULT_STORAGE_DIR,
    });

    let abs: string;
    try {
      abs = await resolveStoredFile(storage.root, rel);
    } catch {
      // 외장 볼륨 미연결 등 — 파일이 사라진 게 아니라 '지금 접근 불가'임을 구분해 알린다
      throw new NotFoundError('슬라이드 파일에 접근할 수 없습니다. 저장 볼륨 연결을 확인하세요.');
    }

    const body = await readFile(abs);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/png',
        // 슬라이드는 생성 후 변하지 않는다 — 사용자 전용이므로 private
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
