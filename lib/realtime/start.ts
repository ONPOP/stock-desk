// 릴레이 부트스트랩 공통 로직 — env를 읽어 모드를 정하고 릴레이를 띄운다.
// dev 진입점(scripts/realtime.ts)과 패키징 번들 진입점이 이 함수를 공유한다.
import { startRelay } from '@/lib/realtime/relay-server';

export function startRealtimeFromEnv(): void {
  const PORT = Number(process.env.NEXT_PUBLIC_REALTIME_PORT ?? process.env.REALTIME_PORT ?? 17099);
  const rawMode = (process.env.KIS_WS_MODE ?? 'mock').toLowerCase();
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  let mode: 'mock' | 'vts' | 'prod' = rawMode === 'vts' || rawMode === 'prod' ? rawMode : 'mock';
  if (mode !== 'mock' && (!appKey || !appSecret)) {
    console.warn('⚠️ KIS_APP_KEY/SECRET 없음 → mock 모드로 강등 (앱은 폴링 폴백으로 정상 동작)');
    mode = 'mock';
  }

  const handle = startRelay({ port: PORT, mode, appKey, appSecret });
  console.log(`▶ 실시간 릴레이: ws://127.0.0.1:${PORT} (mode=${mode})`);

  const shutdown = () => {
    handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('disconnect', shutdown); // 부모(Electron) 종료 시
}
