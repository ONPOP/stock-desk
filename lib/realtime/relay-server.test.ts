import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { startRelay, type RelayHandle } from './relay-server';
import type { RealtimeServerMsg } from '@/types';

// mock 모드 릴레이를 실제로 띄워 5개 캡·구독·틱 전달을 검증(휴장·KIS 무관).
let handle: RelayHandle | null = null;
const PORT = 17311;

afterEach(() => {
  handle?.close();
  handle = null;
});

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('relay-server (mock)', () => {
  it('구독 7개 → 5개로 캡, 틱·호가 수신', async () => {
    handle = startRelay({ port: PORT, mode: 'mock' });
    const ws = await connect();
    const got = { tick: new Set<string>(), book: new Set<string>() };

    await new Promise<void>((resolve) => {
      ws.on('message', (buf) => {
        const msg = JSON.parse(buf.toString()) as RealtimeServerMsg;
        if (msg.type === 'tick') got.tick.add(msg.data.ticker);
        if (msg.type === 'orderbook') got.book.add(msg.data.ticker);
        if (got.tick.size >= 5 && got.book.size >= 5) resolve();
      });
      // 7개 구독 → 릴레이가 5개로 제한
      const tickers = ['005930', '000660', '035720', '051910', '005380', '068270', '207940'];
      ws.send(JSON.stringify({ type: 'subscribe', tickers }));
    });

    expect(handle.currentTickers()).toHaveLength(5);
    // 앞 5개만(우선순위=요청 순서)
    expect(handle.currentTickers()).toEqual(['005930', '000660', '035720', '051910', '005380']);
    expect(got.tick.size).toBe(5);
    expect(got.book.size).toBe(5);
    ws.close();
  }, 10_000);

  it('구독 해지 반영 — 종목 줄이면 currentTickers 축소', async () => {
    handle = startRelay({ port: PORT + 1, mode: 'mock' });
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const s = new WebSocket(`ws://127.0.0.1:${PORT + 1}`);
      s.on('open', () => resolve(s));
      s.on('error', reject);
    });
    ws.send(JSON.stringify({ type: 'subscribe', tickers: ['005930', '000660', '035720'] }));
    await new Promise((r) => setTimeout(r, 300));
    expect(handle.currentTickers()).toHaveLength(3);
    ws.send(JSON.stringify({ type: 'subscribe', tickers: ['005930'] }));
    await new Promise((r) => setTimeout(r, 300));
    expect(handle.currentTickers()).toEqual(['005930']);
    ws.close();
  }, 10_000);

  it('비정형 종목코드는 무시', async () => {
    handle = startRelay({ port: PORT + 2, mode: 'mock' });
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const s = new WebSocket(`ws://127.0.0.1:${PORT + 2}`);
      s.on('open', () => resolve(s));
      s.on('error', reject);
    });
    ws.send(JSON.stringify({ type: 'subscribe', tickers: ['AAPL', "005930'; --", '005930'] }));
    await new Promise((r) => setTimeout(r, 300));
    expect(handle.currentTickers()).toEqual(['005930']);
    ws.close();
  }, 10_000);
});
