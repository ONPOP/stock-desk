// 서버(RSC·Route Handler)용 Supabase 클라이언트 — 쿠키 기반 세션
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AuthRequiredError, ConfigError } from '@/lib/errors';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ConfigError('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)가 없습니다.');
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // RSC에서 호출 시 쿠키 쓰기가 불가능 — 미들웨어가 세션을 갱신하므로 무시
        }
      },
    },
  });
}

/** 인증 필수 컨텍스트에서 사용자 확보. 미인증이면 AuthRequiredError */
export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AuthRequiredError();
  }
  return { supabase, user: data.user };
}
