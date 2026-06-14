import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron 데스크톱 패키징용 — 자체 실행 가능한 standalone 서버 번들 출력
  output: 'standalone',
};

export default nextConfig;
