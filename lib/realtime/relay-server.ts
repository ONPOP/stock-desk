// 로컬 릴레이 서버 — 데스크톱 렌더러(브라우저)와 KIS 실시간 WS 사이를 중계.
// 렌더러는 ws://127.0.0.1:PORT 로 붙어 구독 종목(≤5)을 보내고, 릴레이는 KIS 틱/호가를 정규화해 브로드캐스트.
// appSecret은 이 프로세스 안에서만 쓰이고 렌더러로는 정규화 JSON만 나간다.
// mode:
//   - 'mock' : KIS 미연결. 합성 틱 생성(휴장·개발 검증용).
//   - 'vts'  : 모의 KIS WS(31000).  'prod' : 실전 KIS WS(21000).
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { KisRealtimeClient, type WsEnv } from '@/lib/realtime/kis-ws';
import type { RealtimeServerMsg, RealtimeSubscribeMsg, RealtimeTick, RealtimeOrderbook } from '@/types';

export interface RelayOptions {
  port: number;
  mode: 'mock' | 'vts' | 'prod';
  appKey?: string;
  appSecret?: string;
  host?: string;
}

const MAX_TICKERS = 5;

export interface RelayHandle {
  close: () => void;
  /** 테스트/디버그용 현재 구독 집합 */
  currentTickers: () => string[];
}

export function startRelay(opts: RelayOptions): RelayHandle {
  const host = opts.host ?? '127.0.0.1';
  const wss = new WebSocketServer({ host, port: opts.port });
  const clients = new Set<WsSocket>();
  const perClient = new Map<WsSocket, string[]>(); // 클라이언트별 희망 목록(우선순위 순)
  const lastTick = new Map<string, RealtimeTick>();
  const lastBook = new Map<string, RealtimeOrderbook>();
  let connected = false;
  let mockTimer: ReturnType<typeof setInterval> | null = null;

  const broadcast = (msg: RealtimeServerMsg) => {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
  };

  const onTick = (t: RealtimeTick) => {
    lastTick.set(t.ticker, t);
    broadcast({ type: 'tick', data: t });
  };
  const onOrderbook = (o: RealtimeOrderbook) => {
    lastBook.set(o.ticker, o);
    broadcast({ type: 'orderbook', data: o });
  };

  // ── KIS 연결(실사용) vs mock 피드
  const isLive = opts.mode !== 'mock';
  const kis = isLive
    ? new KisRealtimeClient(opts.mode as WsEnv, opts.appKey ?? '', opts.appSecret ?? '', {
        onTick,
        onOrderbook,
        onStatus: (c) => {
          connected = c;
          broadcast({ type: 'status', connected, mode: 'live', subscribed: currentTickers() });
        },
      })
    : null;

  /** 모든 클라이언트 희망을 합쳐 우선순위 유지·중복 제거·5개 캡 */
  function currentTickers(): string[] {
    const seen = new Set<string>();
    for (const list of perClient.values()) {
      for (const t of list) {
        if (!seen.has(t)) seen.add(t);
        if (seen.size >= MAX_TICKERS) break;
      }
      if (seen.size >= MAX_TICKERS) break;
    }
    return [...seen];
  }

  function applyDesired() {
    const tickers = currentTickers();
    if (kis) kis.setTickers(tickers);
    if (!isLive) reconcileMock(tickers);
    broadcast({ type: 'status', connected: isLive ? connected : true, mode: isLive ? 'live' : 'mock', subscribed: tickers });
  }

  // ── mock 피드: 구독 종목마다 랜덤워크 틱/호가 생성
  const mockState = new Map<string, number>(); // ticker → 현재가
  function reconcileMock(tickers: string[]) {
    for (const t of tickers) if (!mockState.has(t)) mockState.set(t, 50_000 + (Number(t.slice(-3)) % 50) * 1000);
    for (const t of [...mockState.keys()]) if (!tickers.includes(t)) mockState.delete(t);
  }
  function startMock() {
    // 틱: 0.5s, 호가: 1s. 실제 무작위성은 시각 기반(스크립트 런타임이라 허용).
    mockTimer = setInterval(() => {
      const now = Date.now();
      for (const [t, base] of mockState) {
        const drift = Math.round((Math.sin(now / 3000 + Number(t)) + (Math.random() - 0.5)) * 50) * 10;
        const price = Math.max(1000, base + drift);
        mockState.set(t, price);
        const hhmmss = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
        onTick({ ticker: t, price, change: price - base, changeRate: (((price - base) / base) * 100).toFixed(2), volume: Math.floor(Math.random() * 1_000_000), cntgTime: hhmmss, asOf: new Date().toISOString() });
        const asks = Array.from({ length: 10 }, (_, i) => ({ price: price + (i + 1) * 100, qty: Math.floor(Math.random() * 5000) }));
        const bids = Array.from({ length: 10 }, (_, i) => ({ price: price - (i + 1) * 100, qty: Math.floor(Math.random() * 5000) }));
        onOrderbook({ ticker: t, asks, bids, totalAskQty: asks.reduce((s, a) => s + a.qty, 0), totalBidQty: bids.reduce((s, b) => s + b.qty, 0), asOf: new Date().toISOString() });
      }
    }, 700);
  }

  wss.on('connection', (ws: WsSocket) => {
    clients.add(ws);
    perClient.set(ws, []);
    ws.send(JSON.stringify({ type: 'status', connected: isLive ? connected : true, mode: isLive ? 'live' : 'mock', subscribed: currentTickers() } satisfies RealtimeServerMsg));
    ws.on('message', (buf: Buffer) => {
      let msg: RealtimeSubscribeMsg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'subscribe' || !Array.isArray(msg.tickers)) return;
      perClient.set(ws, msg.tickers.filter((t) => /^\d{6}$/.test(t)).slice(0, MAX_TICKERS));
      applyDesired();
      // 새 구독 종목은 마지막 스냅샷 즉시 전송(빈 화면 방지)
      for (const t of currentTickers()) {
        const tk = lastTick.get(t);
        if (tk) ws.send(JSON.stringify({ type: 'tick', data: tk } satisfies RealtimeServerMsg));
        const bk = lastBook.get(t);
        if (bk) ws.send(JSON.stringify({ type: 'orderbook', data: bk } satisfies RealtimeServerMsg));
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      perClient.delete(ws);
      applyDesired();
    });
  });

  if (kis) void kis.start();
  else startMock();

  return {
    close: () => {
      if (mockTimer) clearInterval(mockTimer);
      kis?.stop();
      for (const c of clients) c.close();
      wss.close();
    },
    currentTickers,
  };
}
