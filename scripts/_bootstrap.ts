// 모든 스크립트의 공통 진입점. 가장 먼저 import해 ① .env.local을 로드하고
// ② 어떤 경로로 던져진 에러든 시크릿을 마스킹한 뒤 출력하도록 전역 핸들러를 건다.
// (try 밖에서 throw되는 파싱 에러까지 잡아 비밀번호 평문 노출을 원천 차단)
import { config } from 'dotenv';
config({ path: '.env.local' });

import { redactSecrets } from '../lib/utils/redact';

function fail(label: string, err: unknown): never {
  console.error(`❌ ${label}: ${redactSecrets(err)}`);
  process.exit(1);
}

process.on('uncaughtException', (err) => fail('처리되지 않은 예외', err));
process.on('unhandledRejection', (err) => fail('처리되지 않은 거부', err));
