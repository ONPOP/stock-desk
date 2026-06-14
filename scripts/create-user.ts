// MVP 단일 계정 생성 — 가입 화면 없이 서비스 롤로 직접 생성 (D1)
// 실행: npm run create:user -- <email> <password>
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('사용법: npm run create:user -- <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ 비밀번호는 8자 이상이어야 합니다.');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('❌ Supabase 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`❌ 계정 생성 실패: ${error.message}`);
    process.exit(1);
  }
  console.log(`✅ 계정 생성 완료: ${data.user?.email} (id: ${data.user?.id})`);
  console.log('   기본 설정·분석 스케줄(08:30/22:00)이 트리거로 자동 생성되었습니다.');
}

main();
