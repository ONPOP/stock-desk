// 자동 로그인 정책 쿠키 관리.
//
// 정책 쿠키는 httpOnly라 클라이언트 JS가 직접 읽거나 지울 수 없다 — 상태 조회·변경·삭제를 전부 여기로 모은다.
// 비밀번호는 저장하지 않는다. 유지되는 것은 Supabase가 발급한 refresh token(인증 쿠키)이며
// 이 라우트는 "그 쿠키를 다음 실행에도 인정할지"만 기록한다.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import {
  AUTO_LOGIN_COOKIE,
  AUTO_LOGIN_COOKIE_OPTIONS,
  SESSION_ACTIVE_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth/auto-login';
import { autoLoginPutSchema } from '@/lib/validation/auth';

export async function GET() {
  try {
    await requireUser();
    // 쿠키 헤더 부분 문자열 매칭은 값 안에 같은 문자열이 들어가면 오탐한다 — 파싱된 쿠키로 판정
    const jar = await cookies();
    const enabled = jar.get(AUTO_LOGIN_COOKIE)?.value === '1';
    return NextResponse.json({ enabled });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: Request) {
  try {
    // 로그인된 사용자만 자신의 정책을 바꿀 수 있다
    await requireUser();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = autoLoginPutSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }

    const res = NextResponse.json({ enabled: parsed.data.enabled });
    if (parsed.data.enabled) {
      res.cookies.set(AUTO_LOGIN_COOKIE, '1', AUTO_LOGIN_COOKIE_OPTIONS);
    } else {
      res.cookies.delete(AUTO_LOGIN_COOKIE);
    }
    // 자동 로그인을 꺼도 지금 보고 있는 화면에서 튕기면 안 되므로, 이번 실행분은 항상 살려 둔다
    res.cookies.set(SESSION_ACTIVE_COOKIE, '1', SESSION_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

/**
 * 로그아웃 — 정책 쿠키 제거.
 * 인증 쿠키 자체는 클라이언트의 supabase.auth.signOut()이 지우고, 여기서는 httpOnly 정책 쿠키만 정리한다.
 * 인증 여부를 확인하지 않는다: 이미 세션이 끊긴 상태에서도 잔여 쿠키를 치울 수 있어야 한다.
 */
export async function DELETE() {
  const res = NextResponse.json({ enabled: false });
  res.cookies.delete(AUTO_LOGIN_COOKIE);
  res.cookies.delete(SESSION_ACTIVE_COOKIE);
  return res;
}
