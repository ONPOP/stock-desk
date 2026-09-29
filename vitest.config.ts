import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig의 jsx: preserve(Next 전용)를 그대로 따르면 .tsx 컴포넌트를 테스트에서 불러올 수 없다 — 테스트에서만 변환한다
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      // 'server-only'는 RSC 외 환경에서 import 시 throw → 테스트에서는 빈 스텁으로 대체
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // scripts/도 포함한다 — 배치 전용 모듈(http-dispatcher 등)에도 회귀 테스트가 필요하다.
    // 단 scripts/*는 대개 모듈 로드 시 main()이 돌므로, 테스트 대상은 부작용 없는 모듈로 한정한다.
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts', 'app/**/*.test.ts', 'scripts/**/*.test.ts'],
    // exFAT 외장 볼륨에서 macOS가 만드는 AppleDouble 부산물(._foo.test.ts)이 테스트로 잡히면 파싱 에러가 난다
    exclude: ['**/node_modules/**', '**/._*'],
  },
});
