// SEC EDGAR CIK 매핑 → stocks.cik (미국 공시 F12). 무인증(company_tickers.json).
// 실행: npm run sync:cik
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';
import { EdgarClient } from '../lib/providers/edgar/client';
import { fetchCikMap } from '../lib/providers/edgar/cik';

const CHUNK = 50;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('❌ Supabase 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log('📥 SEC company_tickers.json 다운로드…');
  const entries = await fetchCikMap(new EdgarClient());
  const cikByTicker = new Map(entries.map((e) => [e.ticker, e.cik]));
  console.log(`  ${entries.length.toLocaleString()}건 로드`);

  // 미국 종목 조회 후 매칭
  const { data, error } = await admin
    .from('stocks')
    .select('id, ticker')
    .in('market', ['NYSE', 'NASDAQ', 'AMEX']);
  if (error) throw new Error(error.message);
  const targets = (data ?? [])
    .map((s) => ({ id: s.id as string, cik: cikByTicker.get(String(s.ticker).toUpperCase()) }))
    .filter((t): t is { id: string; cik: string } => !!t.cik);

  let updated = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (t) => {
        const { error: upErr } = await admin.from('stocks').update({ cik: t.cik }).eq('id', t.id);
        if (upErr) console.error(`  ⚠️ ${t.id}: ${upErr.message}`);
        else updated += 1;
      }),
    );
  }
  console.log(`✅ CIK 매핑 ${updated.toLocaleString()}건 / 미국 종목 ${data?.length.toLocaleString()}건`);
}

main();
