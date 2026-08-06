import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // 'server-only'는 RSC 외 환경에서 import 시 throw → 테스트에서는 빈 스텁으로 대체
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts', 'app/**/*.test.ts'],
    // exFAT 외장 볼륨에서 macOS가 만드는 AppleDouble 부산물(._foo.test.ts)이 테스트로 잡히면 파싱 에러가 난다
    exclude: ['**/node_modules/**', '**/._*'],
  },
});
