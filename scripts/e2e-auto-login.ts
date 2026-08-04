// 자동 로그인 E2E — 미들웨어 정책 판정 + 정책 쿠키 라이프사이클.
// 세션은 admin 매직링크로 만든다(비밀번호를 다루지 않는다). 토큰은 stdout에 출력하지 않는다.
// 실행: npx tsx scripts/e2e-auto-login.ts  (dev 서버 3000 필요)
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';
import { AUTO_LOGIN_COOKIE, SESSION_ACTIVE_COOKIE } from '../lib/auth/auto-login';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const projectRef = new URL(url).hostname.split('.')[0];

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function authCookie(session: object): string {
  const name = `sb-${projectRef}-auth-token`;
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const MAX = 3180;
  if (encoded.length <= MAX) return `${name}=${encoded}`;
  const parts: string[] = [];
  for (let i = 0; i * MAX < encoded.length; i++) {
    parts.push(`${name}.${i}=${encoded.slice(i * MAX, (i + 1) * MAX)}`);
  }
  return parts.join('; ');
}

/** Set-Cookie 헤더에서 특정 쿠키의 지시자를 뽑는다 */
function setCookieOf(res: Response, name: string): string | null {
  const all = res.headers.getSetCookie?.() ?? [];
  return all.find((c) => c.startsWith(`${name}=`)) ?? null;
}

/** 삭제 지시인지 — Max-Age=0 또는 과거 Expires 둘 다 유효하다(Next는 후자를 쓴다) */
function isDeletion(setCookie: string | null): boolean {
  if (!setCookie) return false;
  return /Max-Age=0\b/.test(setCookie) || /Expires=Thu, 01 Jan 1970/.test(setCookie);
}

async function main() {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: users } = await admin.auth.admin.listUsers();
  const target = users.users[0];
  if (!target) throw new Error('테스트할 사용자가 없습니다.');

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: target.email! });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: otp, error } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link!.properties!.hashed_token,
  });
  if (error || !otp.session) throw new Error(`세션 생성 실패: ${error?.message}`);
  const auth = authCookie(otp.session);
  console.log(`\n▶ 계정 ${target.email}`);

  const get = (cookie: string) =>
    fetch(`${BASE}/`, { headers: { Cookie: cookie }, redirect: 'manual' });

  // ─────────────────────────────────────────────────────
  console.log('\n[1] 미들웨어 정책 판정');

  // 인증 쿠키만 있고 정책 쿠키가 없는 상태 = 앱을 껐다 켠 직후(세션 쿠키 소멸)
  const cold = await get(auth);
  check(
    '정책 쿠키 없음 → /login 리다이렉트',
    cold.status === 307 && (cold.headers.get('location') ?? '').includes('/login'),
    `status=${cold.status}`,
  );

  const warm = await get(`${auth}; ${SESSION_ACTIVE_COOKIE}=1`);
  check('세션 쿠키 있음 → 통과 (이번 실행 중 유지)', warm.status === 200, `status=${warm.status}`);

  const autoOn = await get(`${auth}; ${AUTO_LOGIN_COOKIE}=1`);
  check('자동 로그인 쿠키 있음 → 통과', autoOn.status === 200, `status=${autoOn.status}`);

  const anonymous = await fetch(`${BASE}/`, { redirect: 'manual' });
  check(
    '비로그인 → /login 리다이렉트',
    anonymous.status === 307 && (anonymous.headers.get('location') ?? '').includes('/login'),
    `status=${anonymous.status}`,
  );

  // ─────────────────────────────────────────────────────
  console.log('\n[2] 정책 쿠키 라이프사이클 (/api/auth/auto-login)');

  const put = (cookie: string, enabled: boolean) =>
    fetch(`${BASE}/api/auth/auto-login`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled }),
    });

  const on = await put(auth, true);
  const onCookie = setCookieOf(on, AUTO_LOGIN_COOKIE);
  const onSession = setCookieOf(on, SESSION_ACTIVE_COOKIE);
  check('켜기 → 200', on.status === 200, `status=${on.status}`);
  check('자동 로그인 쿠키가 영속(Max-Age)으로 발급', /Max-Age=\d{6,}/.test(onCookie ?? ''), onCookie ?? 'none');
  check('자동 로그인 쿠키는 HttpOnly', /HttpOnly/i.test(onCookie ?? ''), '');
  check('세션 쿠키도 함께 발급(현재 화면 유지)', onSession !== null, '');
  check('세션 쿠키는 수명 없음(종료 시 폐기)', !/Max-Age|Expires/i.test(onSession ?? 'x'), onSession ?? 'none');

  const off = await put(auth, false);
  const offCookie = setCookieOf(off, AUTO_LOGIN_COOKIE);
  check('끄기 → 200', off.status === 200, `status=${off.status}`);
  check('자동 로그인 쿠키 삭제', isDeletion(offCookie), offCookie ?? 'none');

  const state = await fetch(`${BASE}/api/auth/auto-login`, {
    headers: { Cookie: `${auth}; ${AUTO_LOGIN_COOKIE}=1` },
  });
  check('상태 조회가 켜짐을 보고', (await state.json()).enabled === true, '');

  const del = await fetch(`${BASE}/api/auth/auto-login`, { method: 'DELETE' });
  check(
    '로그아웃 정리 → 두 쿠키 모두 삭제',
    isDeletion(setCookieOf(del, AUTO_LOGIN_COOKIE)) && isDeletion(setCookieOf(del, SESSION_ACTIVE_COOKIE)),
    '',
  );

  // ─────────────────────────────────────────────────────
  console.log('\n[3] 권한');

  const noAuth = await fetch(`${BASE}/api/auth/auto-login`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  check('비로그인 상태에서는 정책을 켤 수 없다', noAuth.status === 401, `status=${noAuth.status}`);

  const badBody = await fetch(`${BASE}/api/auth/auto-login`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: auth },
    body: JSON.stringify({ enabled: 'yes' }),
  });
  check('잘못된 입력은 거부', badBody.status === 400, `status=${badBody.status}`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} 통과 ${pass} · 실패 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
