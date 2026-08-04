// 세션 갱신 + 인증 게이트 — 미인증 시 /login 리다이렉트 (D1: MVP 단일 계정)
// 자동 로그인 정책(lib/auth/auto-login.ts)도 여기서 판정한다: 인증 쿠키가 남아 있어도
// 유지 근거(자동 로그인 ON 또는 현재 실행 중)가 없으면 세션을 끊는다.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTO_LOGIN_COOKIE,
  SESSION_ACTIVE_COOKIE,
  decideSession,
  isSupabaseAuthCookie,
} from '@/lib/auth/auto-login';

const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // 환경 미구성 시 명시적 오류 (조용한 통과 = 인증 우회 위험)
    return new NextResponse('서버 설정 오류: Supabase 환경변수가 없습니다.', { status: 500 });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const decision = decideSession({
    hasUser: Boolean(user),
    autoLogin: request.cookies.get(AUTO_LOGIN_COOKIE)?.value === '1',
    sessionActive: request.cookies.get(SESSION_ACTIVE_COOKIE)?.value === '1',
  });

  if (decision === 'sign-out') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    const cleared = isPublic ? NextResponse.next({ request }) : NextResponse.redirect(loginUrl);

    // 인증 쿠키를 로컬에서 직접 만료시킨다 — auth.signOut()은 네트워크 왕복이 필요해 쓰지 않는다
    for (const cookie of request.cookies.getAll()) {
      if (isSupabaseAuthCookie(cookie.name)) cleared.cookies.delete(cookie.name);
    }
    cleared.cookies.delete(AUTO_LOGIN_COOKIE);
    cleared.cookies.delete(SESSION_ACTIVE_COOKIE);
    return cleared;
  }

  if (decision === 'unauthenticated' && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }
  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  // API 라우트는 각 핸들러의 requireUser()에서 인증해 중복 getUser() 호출을 피한다.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
