// PostgREST 스키마 캐시 리로드 — DDL(새 테이블/컬럼) 후 Supabase REST API에 즉시 반영되도록.
// 실행: npx tsx scripts/reload-schema.ts
import './_bootstrap';

import postgres from 'postgres';
import { redactSecrets } from '../lib/utils/redact';

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('❌ SUPABASE_DB_URL 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
    await sql`notify pgrst, 'reload schema'`;
    console.log('✅ PostgREST schema reload 요청 완료');
  } catch (e) {
    console.error(`❌ schema reload 실패: ${redactSecrets(e)}`);
    process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

main();
