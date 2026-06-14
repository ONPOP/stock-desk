// 진단: user_settings에 어떤 키가 설정·복호화되는지 확인 (시세 소스 결정 원인 추적).
// KIS 키가 없으면 resolveQuoteSource가 Yahoo로 폴백 → 프로덕션(데이터센터 IP)에서 차단되어 502.
// 실행: npm run diag:keys
import './_bootstrap';
import { createClient } from '@supabase/supabase-js';
import { decryptSecret } from '../lib/utils/crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;

function check(label: string, enc: string | null): void {
  if (!enc) {
    console.log(`  ${label.padEnd(12)}: (미설정)`);
    return;
  }
  try {
    const v = decryptSecret(enc);
    console.log(`  ${label.padEnd(12)}: 설정됨 ✅ 복호화OK (${v.slice(0, 4)}…, ${v.length}자)`);
  } catch (e) {
    console.log(`  ${label.padEnd(12)}: 설정됨 ⚠️ 복호화 실패 — ${(e as Error).message}`);
  }
}

async function main() {
  if (!url || !svc) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
    process.exit(1);
  }
  const db = createClient(url, svc, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('user_settings')
    .select('user_id, kis_app_key_enc, kis_app_secret_enc, finnhub_key_enc, fmp_key_enc, openai_key_enc, naver_client_id_enc');
  if (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  console.log(`user_settings ${data.length}행:\n`);
  for (const row of data as Array<Record<string, string | null>>) {
    console.log(`user ${row.user_id}:`);
    check('KIS appKey', row.kis_app_key_enc);
    check('KIS secret', row.kis_app_secret_enc);
    check('Finnhub', row.finnhub_key_enc);
    check('FMP', row.fmp_key_enc);
    check('OpenAI', row.openai_key_enc);
    check('Naver id', row.naver_client_id_enc);
  }
  console.log('\n→ KIS가 (미설정)이면 시세는 Yahoo 폴백이며, 프로덕션(Vercel) IP에서 차단되어 502가 정상 현상입니다.');
}

main();
