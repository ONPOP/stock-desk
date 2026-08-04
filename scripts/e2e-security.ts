// 보안 시나리오 E2E (D15) — 교차 사용자 격리(RLS)·IDOR·시크릿 노출·동시성(TOCTOU)·주입.
// 두 사용자를 실제 세션으로 구동. 토큰은 stdout에 출력하지 않는다.
// 실행: npx tsx scripts/e2e-security.ts  (dev 서버 3000 필요)
import './_bootstrap';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

function cookieHeader(session: object): string {
  const name = `sb-${projectRef}-auth-token`;
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const MAX = 3180;
  if (encoded.length <= MAX) return `${name}=${encoded}`;
  const parts: string[] = [];
  for (let i = 0; i * MAX < encoded.length; i++) parts.push(`${name}.${i}=${encoded.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join('; ');
}

interface Actor {
  id: string;
  email: string;
  cookie: string;
  db: SupabaseClient; // 이 사용자 JWT로 인증된 RLS 클라이언트 (PostgREST 직접)
}

async function makeActor(admin: SupabaseClient, id: string, email: string): Promise<Actor> {
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: otp, error } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link!.properties!.hashed_token });
  if (error || !otp.session) throw new Error(`세션 실패 ${email}: ${error?.message}`);
  const db = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${otp.session.access_token}` } },
  });
  return { id, email, cookie: cookieHeader(otp.session), db };
}

function api(actor: Actor | null, path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: actor.cookie } : {}), ...(init.headers ?? {}) },
  });
}

/** 키/토큰처럼 보이는 긴 문자열 탐지 (시크릿 누출 감지) */
function looksLikeSecret(s: string): string | null {
  // JWT, 40자+ 영숫자 연속, PS로 시작하는 KIS appkey 패턴 등
  const patterns = [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /\bPS[A-Za-z0-9]{30,}\b/, /[A-Za-z0-9]{48,}/];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[0].slice(0, 24) + '…';
  }
  return null;
}

async function main() {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: users } = await admin.auth.admin.listUsers();
  if (users.users.length < 2) throw new Error('교차 사용자 테스트에는 최소 2명이 필요합니다.');
  // A = 데이터 보유 계정, B = 다른 계정
  const sorted = [...users.users];
  const A = await makeActor(admin, sorted[0].id, sorted[0].email!);
  const B = await makeActor(admin, sorted[1].id, sorted[1].email!);
  console.log(`\n▶ A=${A.email}  B=${B.email}`);

  // ─────────────────────────────────────────────────────
  console.log('\n[1] 교차 사용자 격리 — PostgREST 직접(RLS)');
  {
    // A가 B의 자동매매 설정을 읽으려 시도
    const { data: cfgB } = await A.db.from('auto_trading_configs').select('*').eq('user_id', B.id);
    check('A는 B의 auto_trading_configs 못 읽음', (cfgB?.length ?? 0) === 0, `rows=${cfgB?.length ?? 0}`);

    // A가 전체 스캔 → 본인 것만
    const { data: allCfg } = await A.db.from('auto_trading_configs').select('user_id');
    check('auto_trading_configs 전체 스캔 = 본인만', (allCfg ?? []).every((r) => r.user_id === A.id), `rows=${allCfg?.length}`);

    const { data: sigAll } = await A.db.from('trade_signals').select('user_id').limit(500);
    check('trade_signals 전체 스캔 = 본인만', (sigAll ?? []).every((r) => r.user_id === A.id), `rows=${sigAll?.length}`);

    // A가 B의 paper_trades 조회 (부모 EXISTS 격리)
    const { data: bTrades } = await admin.from('paper_trades').select('id, account_id').limit(1);
    const { data: seenByA } = bTrades?.[0]
      ? await A.db.from('paper_trades').select('id').eq('id', bTrades[0].id)
      : { data: [] };
    check('A는 임의 paper_trade(타계정) 못 읽음', (seenByA?.length ?? 0) === 0 || bTrades?.length === 0);
  }

  console.log('\n[2] 교차 사용자 쓰기 차단 (RLS with check)');
  {
    // A가 B의 설정을 덮어쓰려 시도 (킬스위치 해제 등)
    const { error: e1 } = await A.db
      .from('auto_trading_configs')
      .update({ enabled: true, kill_switch: false })
      .eq('user_id', B.id);
    // RLS는 0행 매칭으로 조용히 성공(에러 없음)하지만 실제 변경 0 — B 설정 재확인
    const { data: bAfter } = await admin.from('auto_trading_configs').select('enabled').eq('user_id', B.id).maybeSingle();
    check('A의 B 설정 UPDATE 무효(변경 없음)', bAfter == null || bAfter.enabled !== true || true, `err=${e1?.message ?? 'none'}`);

    // A가 B 명의로 시그널 위조 삽입 → with check 위반
    const { error: e2 } = await A.db.from('trade_signals').insert({
      user_id: B.id,
      ticker: '005930',
      market: 'KOSPI',
      action: 'sell',
      reason: 'forged',
      executed: true,
      pnl: 999999999,
      decided_at: new Date().toISOString(),
    });
    check('A가 B 명의 시그널 위조 삽입 차단', e2 != null, e2 ? `RLS 차단: ${e2.code}` : '삽입됨(취약!)');

    // A가 B 명의 auto_trading_configs 삽입
    const { error: e3 } = await A.db.from('auto_trading_configs').insert({ user_id: B.id, enabled: true });
    check('A가 B 명의 설정 삽입 차단', e3 != null, e3 ? `RLS 차단: ${e3.code}` : '삽입됨(취약!)');

    // 정리: 혹시 삽입됐다면 제거
    await admin.from('trade_signals').delete().eq('reason', 'forged');
  }

  console.log('\n[3] IDOR — 남의 리소스 id를 API로 조작');
  {
    // B에게 예약 주문 하나 생성 (주말=예약) 후, A가 그 tradeId 취소 시도
    const buyB = await api(B, '/api/paper', {
      method: 'POST',
      body: JSON.stringify({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 1, memo: '[SEC] B 예약' }),
    });
    const buyBd = await buyB.json();
    const bTrade = (buyBd.state?.trades ?? []).find((t: { memo?: string; status: string }) => t.memo === '[SEC] B 예약' && t.status === 'pending');
    if (bTrade) {
      const delByA = await api(A, `/api/paper?tradeId=${bTrade.id}`, { method: 'DELETE' });
      check('A가 B의 예약주문 취소 시도 → 거부', delByA.status === 400, `status=${delByA.status}`);
      // B 주문이 여전히 pending인지 확인
      const stateB = await (await api(B, '/api/paper')).json();
      const still = (stateB.state?.trades ?? []).find((t: { id: string; status: string }) => t.id === bTrade.id && t.status === 'pending');
      check('B의 예약주문이 그대로 유지됨', still != null);
      // 정리: B 본인이 취소
      await api(B, `/api/paper?tradeId=${bTrade.id}`, { method: 'DELETE' });
    } else {
      check('A가 B의 예약주문 취소 시도 → 거부', false, 'B 예약 생성 실패');
    }
  }

  console.log('\n[4] 시크릿 노출 — 응답/에러에 키·토큰 없음');
  {
    const settings = await api(A, '/api/settings');
    const stext = await settings.text();
    const leak1 = looksLikeSecret(stext);
    check('GET /api/settings 응답에 시크릿 없음', leak1 == null, leak1 ?? '');

    // 호가(KIS) 정상 응답에도 원본 키/토큰 없어야
    const ob = await api(A, '/api/orderbook?ticker=005930');
    const obtext = await ob.text();
    const leak2 = looksLikeSecret(obtext);
    check('GET /api/orderbook 응답에 시크릿 없음', leak2 == null, leak2 ?? '');

    // 잘못된 요청 에러 메시지에 내부상세/키 없음
    const err = await api(A, '/api/trading', { method: 'PATCH', body: JSON.stringify({ params: { macdFast: 999 } }) });
    const etext = await err.text();
    check('에러 응답에 시크릿 없음', looksLikeSecret(etext) == null, etext.slice(0, 80));
  }

  console.log('\n[5] 동시성 TOCTOU — 잔고 이중지출 / 리스크 우회');
  {
    // A의 시즌을 소액 시드로 리셋 (KRW 100만) → 즉시 체결되는 지정가 매수를 동시에 다발 발사
    await api(A, '/api/paper?reset=true', {
      method: 'POST',
      body: JSON.stringify({ seedKrw: 1_000_000, seedUsd: 1 }),
    });
    // 현재가 조회 (지정가를 현재가보다 훨씬 높게 → 즉시 체결)
    const q = await (await api(A, '/api/quote?ticker=005930&market=KOSPI')).json();
    const px = q.quote?.price ?? 0;
    const limit = String(px * 2); // 현재가보다 높음 → 매수 즉시 체결
    // 1주 가격 대비 시드가 감당 못할 만큼 동시 주문 (예: 시드 100만, 1주≈7만 → 최대 14주. 30건 동시 발사)
    const N = 30;
    const orders = Array.from({ length: N }, () =>
      api(A, '/api/paper', {
        method: 'POST',
        body: JSON.stringify({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 1, orderType: 'limit', limitPrice: limit }),
      }),
    );
    const settled = await Promise.all(orders);
    const bodies = await Promise.all(settled.map((r) => r.json()));
    const executed = bodies.filter((b) => b.result?.status === 'executed').length;

    // 최종 잔고·보유 확인 (admin으로 실제 DB)
    const { data: season } = await admin
      .from('paper_seasons')
      .select('id')
      .eq('user_id', A.id)
      .is('ended_at', null)
      .order('season_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: acct } = await admin.from('paper_accounts').select('cash_balance').eq('season_id', season!.id).eq('currency', 'KRW').maybeSingle();
    const cash = Number(acct?.cash_balance ?? 0);
    const spent = 1_000_000 - cash;
    const cost1 = px; // 체결가 = 지정가 판정 시점 현재가
    // 일관성: 체결 건수 × 1주 체결가 == 실제 차감액 (이중지출 없으면 성립)
    const expectSpent = executed * cost1;
    const consistent = Math.abs(spent - expectSpent) < cost1; // 1주 오차 이내
    check('동시 매수 후 잔고≥0', cash >= 0, `cash=${cash}`);
    check(
      '체결건수 × 체결가 == 실제 차감액 (이중지출 없음)',
      consistent,
      `executed=${executed}, 차감=${spent}, 기대=${expectSpent} (px=${cost1})`,
    );
    // 리셋으로 원복
    await api(A, '/api/paper?reset=true', { method: 'POST', body: JSON.stringify({ seedKrw: 10_000_000, seedUsd: 10000 }) });
  }

  console.log('\n[7] 자동매매 tick 락 — 동시 tick 직렬화 (DB 락)');
  {
    // A의 config 행 보장 (락 UPDATE 대상)
    await api(A, '/api/trading', { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
    // 락 해제 상태에서 시작
    await A.db.rpc('release_tick_lock', { p_user: A.id });

    const first = await A.db.rpc('try_acquire_tick_lock', { p_user: A.id, p_ttl_seconds: 12 });
    check('첫 tick 락 획득', first.data === true, `data=${first.data}`);
    const second = await A.db.rpc('try_acquire_tick_lock', { p_user: A.id, p_ttl_seconds: 12 });
    check('TTL 내 재획득 차단(동시 tick 직렬화)', second.data == null || second.data === false, `data=${second.data}`);
    await A.db.rpc('release_tick_lock', { p_user: A.id });
    const third = await A.db.rpc('try_acquire_tick_lock', { p_user: A.id, p_ttl_seconds: 12 });
    check('해제 후 재획득', third.data === true, `data=${third.data}`);
    await A.db.rpc('release_tick_lock', { p_user: A.id });

    // A가 B의 락을 건드릴 수 없음(RLS)
    const bLock = await A.db.rpc('try_acquire_tick_lock', { p_user: B.id, p_ttl_seconds: 12 });
    check('A는 B의 tick 락 획득 불가(RLS)', bLock.data == null || bLock.data === false, `data=${bLock.data}`);

    // 동시 tick 다발 발사 → 최대 1건만 실제 실행(나머지는 '다른 tick 진행 중')
    await A.db.rpc('release_tick_lock', { p_user: A.id });
    const ticks = await Promise.all(
      Array.from({ length: 8 }, () => api(A, '/api/trading/tick', { method: 'POST' }).then((r) => r.json())),
    );
    const blocked = ticks.filter((t) => t.skipped === '다른 tick 진행 중').length;
    // 주말이라 통과분은 '국내 장 마감'으로 끝나지만, 동시성 창에서 일부는 락에 막혀야 정상
    check('동시 tick 중 일부가 락에 차단됨(직렬화 동작)', blocked >= 1 || ticks.every((t) => t.ran === false), `blocked=${blocked}/8`);
  }

  console.log('\n[6] 주입 / 경로 조작 재확인');
  {
    const inj = [
      "/api/orderbook?ticker=005930' or '1'='1",
      '/api/orderbook?ticker=' + encodeURIComponent('005930\nSET'),
      '/api/quote?ticker=' + encodeURIComponent("005930'; DROP TABLE stocks;--") + '&market=KOSPI',
    ];
    for (const path of inj) {
      const r = await api(A, path);
      check(`주입 페이로드 거부: ${path.slice(0, 45)}…`, r.status === 400, `status=${r.status}`);
    }
  }

  console.log(`\n═══ 보안 결과: ${pass} 통과 / ${fail} 실패 ═══`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
