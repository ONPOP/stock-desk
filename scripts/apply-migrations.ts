// supabase/migrations/*.sql 순차 적용 — 적용 이력은 public._migrations에 기록
// 실행: npm run db:migrate
import './_bootstrap';

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
    // postgres() 호출 자체가 연결 문자열 파싱 에러를 던질 수 있어 try 안에서 생성한다.
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
    await sql`create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;

    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      console.log('적용할 마이그레이션이 없습니다.');
      return;
    }
    for (const file of files) {
      const [done] = await sql`select 1 from public._migrations where name = ${file}`;
      if (done) {
        console.log(`⏭  ${file} — 이미 적용됨`);
        continue;
      }
      const body = readFileSync(path.join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public._migrations (name) values (${file})`;
      });
      console.log(`✅ ${file} 적용 완료`);
    }
  } catch (e) {
    console.error(`❌ 마이그레이션 실패: ${redactSecrets(e)}`);
    process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

main();
