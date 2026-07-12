// 실시간 릴레이 — 패키징 번들 진입점. env는 Electron이 fork로 주입하므로 dotenv 불필요.
import { startRealtimeFromEnv } from '../lib/realtime/start';

startRealtimeFromEnv();
