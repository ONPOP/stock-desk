'use client';

// 실시간 호가 훅 — 릴레이 연결 시 WS 호가, 아니면 /api/orderbook 3초 폴링으로 폴백.
import { useEffect, useState } from 'react';
import { useRealtime } from '@/lib/realtime/provider';
import type { Orderbook } from '@/types';

const POLL_MS = 3000;

export function useRealtimeOrderbook(ticker: string): {
  book: Orderbook | null;
  error: string | null;
  realtime: boolean;
} {
  const rt = useRealtime();
  const [book, setBook] = useState<Orderbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // 실시간 구독 (선택종목이므로 high 우선)
  useEffect(() => {
    if (!rt) return;
    rt.register(ticker, 'high');
    const seed = rt.getOrderbook(ticker);
    if (seed) {
      setBook(seed);
      setLive(true);
    }
    const off = rt.subscribeOrderbook(ticker, (o) => {
      setBook(o);
      setLive(true);
    });
    return () => {
      off();
      rt.unregister(ticker, 'high');
    };
  }, [rt, ticker]);

  // 폴링 폴백 — 실시간 미확보(rt 없음/미연결/데이터 없음)일 때만
  const usingRealtime = !!rt && rt.connected && live;
  useEffect(() => {
    if (usingRealtime) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController();
    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/orderbook?ticker=${encodeURIComponent(ticker)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '호가를 불러오지 못했습니다.');
        setBook(data.orderbook);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      }
    };
    fetchBook();
    timer = setInterval(fetchBook, POLL_MS);
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [ticker, usingRealtime]);

  // 실시간→폴백 전환 시 live 리셋 (종목 변경 대비)
  useEffect(() => {
    setLive(false);
    setBook(null);
  }, [ticker]);

  return { book, error, realtime: usingRealtime };
}
