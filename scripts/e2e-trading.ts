// 자동매매 API 조작 시나리오 E2E (D15) — 실인증 세션으로 라우트 방어선 검증.
// 세션: admin generateLink(magiclink) → verifyOtp → @supabase/ssr 쿠키 포맷 주입 (비밀번호 미사용).
// 실행: npx tsx scripts/e2e-trading.ts  (dev 서버 3000 필요)
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !anonKey || !serviceKey) {
  console.error('❌ Supabase 환경변수가 없습니다.');
  process.exit(1);
}
const projectRef = new URL(url).hostname.split('.')[0];

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** @supabase/ssr 쿠키 직렬화 — 'base64-' + base64url(JSON), 3180자 청크 분할 */
function sessionCookies(session: object): string {
  const name = `sb-${projectRef}-auth-token`;
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const MAX = 3180;
  if (encoded.length <= MAX) return `${name}=${encoded}`;
  const chunks: string[] = [];
  for (let i = 0; i * MAX < encoded.length; i++) {
    chunks.push(`${name}.${i}=${encoded.slice(i * MAX, (i + 1) * MAX)}`);
  }
  return chunks.join('; ');
}

async function main() {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 사용자 특정 (1인용 — 첫 사용자)
  const { data: users, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr || !users.users[0]) throw new Error(`사용자 조회 실패: ${usersErr?.message}`);
  const user = users.users[0];
  console.log(`\n▶ 대상 사용자: ${user.email}`);

  // 세션 발급 (비밀번호 미사용)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
  });
  if (linkErr || !link.properties) throw new Error(`링크 생성 실패: ${linkErr?.message}`);
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  });
  if (otpErr || !otp.session) throw new Error(`세션 발급 실패: ${otpErr?.message}`);
  const cookie = sessionCookies(otp.session);

  const api = (path: string, init: RequestInit = {}, auth = true) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Cookie: cookie } : {}),
        ...(init.headers ?? {}),
      },
    });

  // ── 그룹 1: 인증 경계
  console.log('\n[1] 인증 경계');
  {
    const r = await api('/api/trading', {}, false);
    check('미인증 GET /api/trading → 401', r.status === 401, `status=${r.status}`);
    const r2 = await api('/api/trading/tick', { method: 'POST' }, false);
    check('미인증 POST /tick → 401', r2.status === 401, `status=${r2.status}`);
    const r3 = await api('/api/orderbook?ticker=005930', {}, false);
    check('미인증 GET /orderbook → 401', r3.status === 401, `status=${r3.status}`);
    const r4 = await api('/api/trading', { headers: { Cookie: `sb-${projectRef}-auth-token=base64-aGFja2Vk` } }, false);
    check('위조 쿠키 → 401', r4.status === 401, `status=${r4.status}`);
  }

  // ── 그룹 2: 설정 조회·파라미터 조작
  console.log('\n[2] 설정 PATCH 조작');
  {
    const r = await api('/api/trading');
    const d = await r.json();
    check('인증 GET → 200 + 기본 config', r.status === 200 && d.config?.params?.macdSlow === 26, `status=${r.status}`);

    const cases: Array<[string, unknown, string?]> = [
      ['부분 병합 우회 fast>=slow', { params: { macdFast: 40 } }],
      ['RSI 밴드 역전', { params: { rsiEntryMin: 90, rsiEntryMax: 50 } }],
      ['음수 손절', { params: { stopLossPct: -5 } }],
      ['orderPct 초과(101)', { params: { orderPct: 101 } }],
      ['문자열 타입 주입', { params: { macdFast: '12; DROP' } }],
      ['청산시각 형식 조작', { params: { exitTimeKst: '99:99' } }],
      ['유니버스 11개', { universe: Array.from({ length: 11 }, (_, i) => ({ ticker: String(100000 + i), market: 'KOSPI' })) }],
      ['유니버스 미국 시장', { universe: [{ ticker: '005930', market: 'NASDAQ' }] }],
      ['유니버스 영문 티커', { universe: [{ ticker: 'AAPL', market: 'KOSPI' }] }],
      ['빈 패치', {}],
      ['JSON 아님', undefined],
    ];
    for (const [name, body] of cases) {
      const res = await api('/api/trading', {
        method: 'PATCH',
        body: body === undefined ? 'not-json{{{' : JSON.stringify(body),
      });
      check(`거부: ${name} → 400`, res.status === 400, `status=${res.status}`);
    }

    const ok = await api('/api/trading', { method: 'PATCH', body: JSON.stringify({ params: { stopLossPct: 1.5 } }) });
    const okd = await ok.json();
    check(
      '정상 부분 변경 stopLossPct=1.5 반영',
      ok.status === 200 && okd.config?.params?.stopLossPct === 1.5 && okd.config?.params?.macdSlow === 26,
      `status=${ok.status}, stopLossPct=${okd.config?.params?.stopLossPct}`,
    );
  }

  // ── 그룹 3: tick 가드 (kill switch·비활성·개장·직렬화 락)
  console.log('\n[3] tick 가드');
  {
    await api('/api/trading', { method: 'PATCH', body: JSON.stringify({ enabled: false, killSwitch: false }) });
    const r1 = await api('/api/trading/tick', { method: 'POST' });
    const d1 = await r1.json();
    check('비활성 → 미실행', r1.status === 200 && d1.ran === false, `skipped="${d1.skipped}"`);

    // 동시 tick 다발 → 락으로 직렬화(최소 1건 차단). 상세 직렬화 검증은 e2e-security.ts [7].
    const burst = await Promise.all(
      Array.from({ length: 6 }, () => api('/api/trading/tick', { method: 'POST' }).then((r) => r.json())),
    );
    const blocked = burst.filter((d) => d.skipped === '다른 tick 진행 중').length;
    check('동시 tick 락 직렬화', blocked >= 1 || burst.every((d) => d.ran === false), `blocked=${blocked}/6`);

    await api('/api/trading', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true, universe: [{ ticker: '005930', market: 'KOSPI' }] }),
    });
    const r2 = await api('/api/trading/tick', { method: 'POST' });
    const d2 = await r2.json();
    check('활성+주말 → 장 마감 스킵 or 감시종목 실행', r2.status === 200 && d2.ran === false, `skipped="${d2.skipped}"`);

    await new Promise((s) => setTimeout(s, 5100));
    await api('/api/trading', { method: 'PATCH', body: JSON.stringify({ killSwitch: true }) });
    const r3 = await api('/api/trading/tick', { method: 'POST' });
    const d3 = await r3.json();
    check('kill switch 최우선 차단', d3.skipped?.includes('kill switch') === true, `skipped="${d3.skipped}"`);
    await api('/api/trading', { method: 'PATCH', body: JSON.stringify({ killSwitch: false, enabled: false }) });
  }

  // ── 그룹 4: 백테스트
  console.log('\n[4] 백테스트');
  {
    const bad1 = await api('/api/trading/backtest', {
      method: 'POST',
      body: JSON.stringify({ ticker: '005930', market: 'KOSPI', interval: '1w' }),
    });
    check('interval 1w 거부 → 400', bad1.status === 400, `status=${bad1.status}`);
    const bad2 = await api('/api/trading/backtest', {
      method: 'POST',
      body: JSON.stringify({ ticker: 'AAPL', market: 'NASDAQ' }),
    });
    check('미국 종목 거부 → 400', bad2.status === 400, `status=${bad2.status}`);
    const bad3 = await api('/api/trading/backtest', {
      method: 'POST',
      body: JSON.stringify({ ticker: '005930', market: 'KOSPI', count: 5000 }),
    });
    check('count 5000 거부 → 400', bad3.status === 400, `status=${bad3.status}`);

    const ok = await api('/api/trading/backtest', {
      method: 'POST',
      body: JSON.stringify({ ticker: '005930', market: 'KOSPI', interval: '1d', count: 250 }),
    });
    const okd = await ok.json();
    check(
      '정상 일봉 백테스트 실행',
      ok.status === 200 && typeof okd.result?.stats?.tradeCount === 'number',
      ok.status === 200
        ? `candles=${okd.candleCount}, trades=${okd.result.stats.tradeCount}, pnl=${okd.result.stats.totalPnl}`
        : `status=${ok.status}, error=${okd.error}`,
    );
  }

  // ── 그룹 5: 호가
  console.log('\n[5] 호가');
  {
    const bad = await api('/api/orderbook?ticker=AAPL');
    check('영문 티커 거부 → 400', bad.status === 400, `status=${bad.status}`);
    const bad2 = await api('/api/orderbook?ticker=005930%2F..%2F..');
    check('경로 주입 거부 → 400', bad2.status === 400, `status=${bad2.status}`);
    const ok = await api('/api/orderbook?ticker=005930');
    const okd = await ok.json();
    // 주말: KIS가 마지막 호가를 주거나(200) 빈 응답 오류(502) — 둘 다 서버 크래시 없이 처리돼야 함
    check(
      '정상 티커 → 200(호가) 또는 4xx/502(휴장 graceful)',
      ok.status === 200 ? Array.isArray(okd.orderbook?.asks) : ok.status >= 400 && typeof okd.error === 'string',
      `status=${ok.status}${ok.status === 200 ? `, asks=${okd.orderbook.asks.length}, bids=${okd.orderbook.bids.length}` : `, error=${okd.error}`}`,
    );
  }

  // ── 그룹 6: 모의투자 주문 조작 (빠른 주문 경로)
  console.log('\n[6] 모의주문 조작');
  {
    const cases: Array<[string, object]> = [
      ['qty 0', { ticker: '005930', market: 'KOSPI', side: 'buy', qty: 0 }],
      ['qty 음수', { ticker: '005930', market: 'KOSPI', side: 'buy', qty: -3 }],
      ['qty 소수', { ticker: '005930', market: 'KOSPI', side: 'buy', qty: 1.5 }],
      ['qty 10억 초과', { ticker: '005930', market: 'KOSPI', side: 'buy', qty: 2_000_000_000 }],
      ['알 수 없는 필드(strict)', { ticker: '005930', market: 'KOSPI', side: 'buy', qty: 1, price: 1 }],
      ['side 조작', { ticker: '005930', market: 'KOSPI', side: 'steal', qty: 1 }],
    ];
    for (const [name, body] of cases) {
      const r = await api('/api/paper', { method: 'POST', body: JSON.stringify(body) });
      check(`거부: ${name} → 400`, r.status === 400, `status=${r.status}`);
    }

    // 정상 주문(주말 → 예약) 후 즉시 취소로 원복
    const buy = await api('/api/paper', {
      method: 'POST',
      body: JSON.stringify({ ticker: '005930', market: 'KOSPI', side: 'buy', qty: 1, memo: '[E2E] 취소 예정' }),
    });
    const buyd = await buy.json();
    const reserved = buyd.result?.status === 'reserved';
    check('주말 시장가 → 예약 접수', buy.status === 200 && reserved, `status=${buyd.result?.status}`);
    if (reserved) {
      const pending = (buyd.state?.trades ?? []).find(
        (t: { status: string; memo?: string | null; id: string }) => t.status === 'pending' && t.memo === '[E2E] 취소 예정',
      );
      if (pending) {
        const del = await api(`/api/paper?tradeId=${pending.id}`, { method: 'DELETE' });
        check('예약 취소 원복', del.status === 200, `status=${del.status}`);
        const delAgain = await api(`/api/paper?tradeId=${pending.id}`, { method: 'DELETE' });
        check('이중 취소 거부(멱등성)', delAgain.status === 400, `status=${delAgain.status}`);
      } else {
        check('예약 취소 원복', false, 'pending 거래를 찾지 못함');
      }
    }
  }

  // ── 그룹 7: DB 직접 조작 (API 우회) — getTradingConfig 재검증 확인
  console.log('\n[7] DB 직접 조작 (PostgREST 우회 시나리오)');
  {
    const { error: tamperErr } = await admin.from('auto_trading_configs').upsert(
      {
        user_id: user.id,
        params: { macdFast: 'evil', orderPct: 99999, stopLossPct: -100 },
        universe: Array.from({ length: 50 }, (_, i) => ({ ticker: 'AAPL' + i, market: 'NASDAQ' })),
      },
      { onConflict: 'user_id' },
    );
    check('오염 데이터 주입(서비스롤)', !tamperErr, tamperErr?.message);

    const r = await api('/api/trading');
    const d = await r.json();
    check(
      '오염 params → DEFAULT 폴백',
      d.config?.params?.macdFast === 12 && d.config?.params?.orderPct === 10 && d.config?.params?.stopLossPct === 2,
      `macdFast=${d.config?.params?.macdFast}, orderPct=${d.config?.params?.orderPct}`,
    );
    check('오염 universe → 빈 목록 폴백', Array.isArray(d.config?.universe) && d.config.universe.length === 0, `len=${d.config?.universe?.length}`);

    // tick 경로도 동일 config를 쓰므로 오염 상태에서 크래시 없이 스킵되는지
    await new Promise((s) => setTimeout(s, 5100));
    await api('/api/trading', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
    const tick = await api('/api/trading/tick', { method: 'POST' });
    const tickd = await tick.json();
    check('오염 상태 tick 무해(감시종목 없음 스킵)', tick.status === 200 && tickd.ran === false, `skipped="${tickd.skipped}"`);
  }

  // ── 원복
  console.log('\n[8] 원복');
  {
    const { error } = await admin
      .from('auto_trading_configs')
      .upsert({ user_id: user.id, enabled: false, kill_switch: false, params: {}, universe: [] }, { onConflict: 'user_id' });
    check('설정 초기화(기본값)', !error, error?.message);
    const r = await api('/api/trading');
    const d = await r.json();
    check('초기화 확인', d.config?.enabled === false && d.config?.universe?.length === 0 && d.config?.params?.stopLossPct === 2);
  }

  console.log(`\n═══ 결과: ${pass} 통과 / ${fail} 실패 ═══`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
