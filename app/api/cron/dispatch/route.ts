// 크론 단일 디스패처 (PRD 10·11장) — Vercel Cron이 30분마다 호출. 시크릿 검증.
// 시각 매칭으로 브리핑/뉴스/지표/예약체결 잡 수행(analysis_schedules 매칭은 배포 시 확장).
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dispatchCron } from '@/lib/cron/dispatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 콜드스타트 여유 (PRD 13장 — 디스패처 타임아웃 60s)

// 길이 노출 없는 상수시간 비교 (타이밍 오라클 차단)
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // CRON_SECRET 미설정 시 차단(프로덕션 보안). Vercel Cron은 Authorization: Bearer <CRON_SECRET> 전송.
  const auth = req.headers.get('authorization');
  if (!secret || !auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const report = await dispatchCron();
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'cron failed' }, { status: 500 });
  }
}
