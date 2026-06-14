// next build(output:standalone) 후 standalone 디렉토리에 static·public을 복사한다.
// (standalone은 .next/static과 public을 자동 포함하지 않으므로 수동 복사가 필요)
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('❌ .next/standalone 이 없습니다. 먼저 `next build`를 실행하세요.');
  process.exit(1);
}

fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });

const pub = path.join(root, 'public');
if (fs.existsSync(pub)) {
  fs.cpSync(pub, path.join(standalone, 'public'), { recursive: true });
}

console.log('✅ standalone 준비 완료 (static·public 복사됨)');
