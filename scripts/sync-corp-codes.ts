// DART corp_code 매핑 → stocks.corp_code (한국 재무·배당·공시 F4/F15/F12).
// 실행: DART_API_KEY=... npm run sync:corp-codes  (또는 .env.local에 DART_API_KEY)
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';
import { DartClient } from '../lib/providers/dart/client';
import { fetchCorpCodeMap } from '../lib/providers/dart/corp-code';

const CHUNK = 50;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dartKey = process.env.DART_API_KEY;
  if (!url || !serviceKey) {
    console.error('❌ Supabase 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  if (!dartKey) {
    console.error('❌ DART_API_KEY 환경변수가 없습니다. (1회성 매핑 적재용)');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log('📥 DART corpCode.xml 다운로드·압축 해제…');
  const entries = await fetchCorpCodeMap(new DartClient(dartKey));
  const corpByStock = new Map(entries.map((e) => [e.stockCode, e.corpCode]));
  console.log(`  상장사 ${entries.length.toLocaleString()}건 로드`);

  const { data, error } = await admin.from('stocks').select('id, ticker').in('market', ['KOSPI', 'KOSDAQ']);
  if (error) throw new Error(error.message);
  const targets = (data ?? [])
    .map((s) => ({ id: s.id as string, corpCode: corpByStock.get(String(s.ticker)) }))
    .filter((t): t is { id: string; corpCode: string } => !!t.corpCode);

  let updated = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (t) => {
        const { error: upErr } = await admin.from('stocks').update({ corp_code: t.corpCode }).eq('id', t.id);
        if (upErr) console.error(`  ⚠️ ${t.id}: ${upErr.message}`);
        else updated += 1;
      }),
    );
  }
  console.log(`✅ corp_code 매핑 ${updated.toLocaleString()}건 / 한국 종목 ${data?.length.toLocaleString()}건`);
}

main();
