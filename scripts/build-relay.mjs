// 실시간 릴레이를 단일 CJS로 번들 — 패키징 Electron이 node_modules 없이 fork 실행.
// ws는 번들에 포함(순수 JS), 선택적 네이티브 가속 모듈만 external(미존재 시 ws가 JS 폴백).
// _bootstrap(dotenv)은 제외: Electron이 이미 env를 주입하므로 런타임에서 optional require 실패해도 무해.
import { build } from 'esbuild';
import path from 'node:path';

const root = process.cwd();

await build({
  entryPoints: [path.join(root, 'scripts', 'realtime-prod.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(root, '.next', 'standalone', 'realtime-relay.cjs'),
  external: ['bufferutil', 'utf-8-validate', 'dotenv'],
  // '@/x' 별칭 해석
  alias: { '@': root },
  logLevel: 'info',
});

console.log('✅ realtime-relay.cjs 번들 완료 → .next/standalone/');
