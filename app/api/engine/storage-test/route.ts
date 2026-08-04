// 저장 경로 연결 테스트 (D16) — 설정 화면의 [연결 테스트] 버튼.
// 외장 볼륨은 슬롯 실행 시점에 빠져 있을 수 있어, 저장 전에 실제 쓰기까지 확인해 준다.
import { readdir } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { preflightRoot } from '@/lib/engine/storage-path';
import { storageTestSchema } from '@/lib/validation/engine';

/** 사용자가 경로를 고를 수 있게 현재 마운트된 외장 볼륨 목록을 준다 */
export async function GET() {
  try {
    await requireUser();
    const volumes = await readdir('/Volumes').catch(() => [] as string[]);
    return NextResponse.json({ volumes: volumes.filter((v) => !v.startsWith('.')).map((v) => `/Volumes/${v}`) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = storageTestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '경로가 올바르지 않습니다.');
    }

    const result = await preflightRoot(parsed.data.path);
    return NextResponse.json({
      ok: result.ok,
      root: result.root,
      reason: result.reason ?? null,
      freeBytes: result.freeBytes ?? null,
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
