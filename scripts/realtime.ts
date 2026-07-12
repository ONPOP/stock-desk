// 실시간 릴레이 — 개발 진입점(`npm run realtime`, tsx). .env.local 로드 후 릴레이 구동.
// 패키징(Electron)은 번들된 realtime-relay.cjs(= scripts/realtime-prod.ts)를 fork한다.
import './_bootstrap';
import { startRealtimeFromEnv } from '../lib/realtime/start';

startRealtimeFromEnv();
