// 스케줄 반영 (D16) — schedule_slots → launchd 등록.
// launchctl은 이 앱이 도는 머신에서만 의미가 있다. 원격(배포본)에서는 실행하지 않고
// 로컬에서 돌릴 명령어를 안내한다 — 조용히 아무 일도 안 일어나는 상황을 막기 위함.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';

const exec = promisify(execFile);
const SYNC_COMMAND = 'npx tsx scripts/engine/install-schedule.ts';
const TIMEOUT_MS = 60_000;

/** 로컬 macOS에서 도는 인스턴스인지 — 배포 환경에서는 launchd가 없다 */
function canSync(): boolean {
  return process.platform === 'darwin' && !process.env.VERCEL;
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ available: canSync(), command: SYNC_COMMAND });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST() {
  try {
    await requireUser();
    if (!canSync()) {
      return NextResponse.json({
        ok: false,
        available: false,
        message: `이 환경에서는 스케줄을 등록할 수 없습니다. 로컬 Mac에서 \`${SYNC_COMMAND}\`를 실행하세요.`,
      });
    }

    const { stdout, stderr } = await exec('npx', ['tsx', 'scripts/engine/install-schedule.ts'], {
      cwd: process.cwd(),
      timeout: TIMEOUT_MS,
      env: process.env,
    });
    return NextResponse.json({ ok: true, available: true, output: `${stdout}${stderr}`.trim() });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
