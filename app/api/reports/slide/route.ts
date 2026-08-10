// 슬라이드 이미지 서빙 (D16 → D19) — Supabase Storage의 서명 URL로 302 리다이렉트한다.
//
// 클라이언트는 객체 키를 지정할 수 없다: reportId + index로만 접근하고, 프리픽스는 DB의
// `thumb_bucket_path`에서 온다(불변식 3 — 기존 경로 traversal 방어의 대체물).
// 소유권은 예전과 같이 `getReport`의 user_id 스코프 조회로 확인한다.
//
// 원본이 만료됐거나 아직 안 올라갔으면 같은 프리픽스의 썸네일로 폴백한다(불변식 2).
// 리다이렉트라 이미지 바이트가 이 함수를 통과하지 않는다(Vercel 대역폭 0).
import { NextResponse } from 'next/server';
import { NotFoundError, toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getReport } from '@/lib/supabase/queries/reports';
import { signedObjectUrls, slideObjectKey, thumbObjectKey } from '@/lib/engine/slide-storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 서명 만료와 캐시 수명은 같아야 한다 — 캐시가 더 길면 만료된 URL을 계속 돌려주게 된다 */
const URL_TTL_SECONDS = 3600;

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
    if (!report.slidePaths[index]) throw new NotFoundError('슬라이드를 찾을 수 없습니다.');
    if (!report.bucketPrefix) throw new NotFoundError('슬라이드가 아직 저장되지 않았습니다.');

    // 원본·썸네일을 한 번에 서명한다 — 일괄 API는 부재 키를 항목별 error로 알려주므로 왕복이 1회로 끝난다
    const [slideUrl, thumbUrl] = await signedObjectUrls(
      createAdminSupabase(),
      [slideObjectKey(report.bucketPrefix, index), thumbObjectKey(report.bucketPrefix, index)],
      URL_TTL_SECONDS,
    );

    const target = slideUrl ?? thumbUrl;
    if (!target) throw new NotFoundError('슬라이드 이미지를 찾을 수 없습니다.');

    return NextResponse.redirect(target, {
      status: 302,
      headers: {
        'Cache-Control': `private, max-age=${URL_TTL_SECONDS}`,
        // 원본이 만료돼 축소본을 주는 경우 — UI가 표시할 수 있게 알린다
        ...(slideUrl ? {} : { 'X-Slide-Variant': 'thumb' }),
      },
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
