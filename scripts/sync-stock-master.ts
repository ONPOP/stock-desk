// KIS 종목마스터 → stocks 테이블 동기화 (F3 검색 데이터 소스)
// 실행: npm run sync:master
import './_bootstrap';

import { createClient } from '@supabase/supabase-js';
import { fetchMaster } from '../lib/providers/kis/master';
import type { Market } from '../types';

const BATCH_SIZE = 1000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('❌ Supabase 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const markets: Market[] = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'NYSE', 'AMEX'];
  let total = 0;
  for (const market of markets) {
    try {
      const rows = await fetchMaster(market);
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await admin
          .from('stocks')
          .upsert(batch, { onConflict: 'ticker,market', ignoreDuplicates: false });
        if (error) throw new Error(error.message);
      }
      total += rows.length;
      console.log(`✅ ${market}: ${rows.length.toLocaleString()}건 동기화`);
    } catch (e) {
      console.error(`❌ ${market} 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n합계 ${total.toLocaleString()}건`);
}

main();
