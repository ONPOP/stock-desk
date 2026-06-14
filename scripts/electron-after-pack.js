// electron-builder는 extraResources 복사 시 node_modules를 자동 제외한다.
// standalone 서버는 자체 node_modules(next 등)가 필수이므로 패키징 후 직접 복사한다.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const productName = context.packager.appInfo.productFilename;
  const resources = path.join(context.appOutDir, `${productName}.app`, 'Contents', 'Resources');
  const src = path.join(process.cwd(), '.next', 'standalone', 'node_modules');
  const dest = path.join(resources, 'standalone', 'node_modules');

  if (!fs.existsSync(src)) {
    throw new Error('.next/standalone/node_modules 가 없습니다. app:build를 먼저 실행하세요.');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('  • afterPack: standalone/node_modules 복사 완료');
};
