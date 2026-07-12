'use client';

// 실시간 컨텍스트 — 로컬 릴레이(ws://127.0.0.1:PORT)로의 단일 WS 연결을 공유한다.
// 여러 훅이 관심 종목을 등록하면 우선순위(선택종목=high)로 정렬·중복제거·5개 캡 후 릴레이에 구독 요청.
// 릴레이 미가동/미연결이면 subscribe는 무해하게 실패하고, 각 훅이 폴링으로 폴백한다(데스크톱 외 환경).
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeTick, RealtimeOrderbook, RealtimeServerMsg } from '@/types';

const PORT = Number(process.env.NEXT_PUBLIC_REALTIME_PORT ?? 17099);
const MAX = 5;

type Priority = 'high' | 'normal';

interface RealtimeCtx {
  connected: boolean;
  register: (ticker: string, priority: Priority) => void;
  unregister: (ticker: string, priority: Priority) => void;
  getTick: (ticker: string) => RealtimeTick | null;
  getOrderbook: (ticker: string) => RealtimeOrderbook | null;
  subscribeTick: (ticker: string, cb: (t: RealtimeTick) => void) => () => void;
  subscribeOrderbook: (ticker: string, cb: (o: RealtimeOrderbook) => void) => () => void;
}

const Ctx = createContext<RealtimeCtx | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  // 관심 종목 refcount (priority별로 분리해 선택종목 우선)
  const refs = useRef({ high: new Map<string, number>(), normal: new Map<string, number>() });
  const tickCache = useRef(new Map<string, RealtimeTick>());
  const bookCache = useRef(new Map<string, RealtimeOrderbook>());
  const tickSubs = useRef(new Map<string, Set<(t: RealtimeTick) => void>>());
  const bookSubs = useRef(new Map<string, Set<(o: RealtimeOrderbook) => void>>());
  const desiredRef = useRef<string>(''); // 마지막으로 보낸 구독집합(중복 전송 방지)

  const computeDesired = useCallback((): string[] => {
    const out: string[] = [];
    for (const bucket of ['high', 'normal'] as const) {
      for (const t of refs.current[bucket].keys()) {
        if (!out.includes(t)) out.push(t);
        if (out.length >= MAX) return out;
      }
    }
    return out;
  }, []);

  const sendDesired = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const tickers = computeDesired();
    const key = tickers.join(',');
    if (key === desiredRef.current) return;
    desiredRef.current = key;
    ws.send(JSON.stringify({ type: 'subscribe', tickers }));
  }, [computeDesired]);

  // 릴레이 연결 (실패해도 조용히 — 폴백은 훅에서)
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      } catch {
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        desiredRef.current = '';
        sendDesired();
      };
      ws.onmessage = (ev) => {
        let msg: RealtimeServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'tick') {
          tickCache.current.set(msg.data.ticker, msg.data);
          tickSubs.current.get(msg.data.ticker)?.forEach((cb) => cb(msg.data));
        } else if (msg.type === 'orderbook') {
          bookCache.current.set(msg.data.ticker, msg.data);
          bookSubs.current.get(msg.data.ticker)?.forEach((cb) => cb(msg.data));
        } else if (msg.type === 'status') {
          setConnected(msg.connected);
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3_000); // 릴레이 재시작 대비 재시도
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [sendDesired]);

  const register = useCallback(
    (ticker: string, priority: Priority) => {
      const m = refs.current[priority];
      m.set(ticker, (m.get(ticker) ?? 0) + 1);
      sendDesired();
    },
    [sendDesired],
  );
  const unregister = useCallback(
    (ticker: string, priority: Priority) => {
      const m = refs.current[priority];
      const n = (m.get(ticker) ?? 0) - 1;
      if (n <= 0) m.delete(ticker);
      else m.set(ticker, n);
      sendDesired();
    },
    [sendDesired],
  );

  const value = useMemo<RealtimeCtx>(
    () => ({
      connected,
      register,
      unregister,
      getTick: (t) => tickCache.current.get(t) ?? null,
      getOrderbook: (t) => bookCache.current.get(t) ?? null,
      subscribeTick: (t, cb) => {
        let set = tickSubs.current.get(t);
        if (!set) tickSubs.current.set(t, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      subscribeOrderbook: (t, cb) => {
        let set = bookSubs.current.get(t);
        if (!set) bookSubs.current.set(t, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
    }),
    [connected, register, unregister],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime(): RealtimeCtx | null {
  return useContext(Ctx);
}
