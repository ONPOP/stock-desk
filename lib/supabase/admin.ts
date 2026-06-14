// 서비스 롤 클라이언트 — RLS 우회. 크론·토큰 캐시 등 서버 내부 작업 전용.
// 절대 클라이언트로 전달 금지.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ConfigError } from '@/lib/errors';

let cached: SupabaseClient | null = null;

export function createAdminSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ConfigError('Supabase 서비스 롤 환경변수가 없습니다.');
  }
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
